import test from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import {
  connectMessage,
  toBase58,
  personaName,
  verifyProof,
  officialViso,
  startSignIn,
  VISO_KEY,
  certShowsHost,
} from "../src/whoiam.ts";

const hex = ed.etc.bytesToHex;

test("whoiam / Viso: connect signature matches whoiam golden vector", async () => {
  const sk = new Uint8Array(32).fill(42);
  const pk = await ed.getPublicKeyAsync(sk);
  const base = "https://example.com/app";
  const challenge = "abc123";
  const ts = 12345;

  const sig = await ed.signAsync(connectMessage(pk, base, challenge, ts), sk);
  // Golden connect signature from whoiam common/src/connect.rs
  assert.equal(
    hex(sig),
    "122b675bdbc8772f52631524ac2b500dec76721bff7c0b299025df04e18e8e8ddf2b8d0a232a5785e68d5738be4f5111ae7b58106f5458b966b9b365fff5ac09"
  );

  const proof = { pk: hex(pk), sig: hex(sig), ts, challenge, base };
  assert.equal(await verifyProof(proof), true);

  // Tampering with any field must cause verification failure
  assert.equal(await verifyProof({ ...proof, base: "https://example.com/evil" }), false);
  assert.equal(await verifyProof({ ...proof, challenge: "abc124" }), false);
  assert.equal(await verifyProof({ ...proof, ts: 12346 }), false);
  assert.equal(await verifyProof({ ...proof, base: base + "a", challenge: "bc123" }), false);
  assert.equal(
    await verifyProof({
      ...proof,
      pk: hex(await ed.getPublicKeyAsync(new Uint8Array(32).fill(43))),
    }),
    false
  );
  assert.equal(await verifyProof({ ...proof, sig: "zz" }), false);
});

test("whoiam / Viso: base58 matches independent bitcoin alphabet test vectors", () => {
  assert.equal(toBase58(Uint8Array.from([])), "");
  assert.equal(toBase58(Uint8Array.from([0])), "1");
  assert.equal(toBase58(Uint8Array.from([0, 0, 1])), "112");

  const pk = ed.etc.hexToBytes("2a76f1666f3aac4f859a1f35300050b69275202d3b880d9f165083c92818b0b5");
  assert.equal(toBase58(pk), "3rmKPdMLRKZPKpEc2UThti8k4EdxzsAH3j7eWx8GhqYY");
});

test("whoiam / Viso: personaName produces clean base58 representation", () => {
  const pkHex = "2a76f1666f3aac4f859a1f35300050b69275202d3b880d9f165083c92818b0b5";
  assert.equal(personaName(pkHex), "3rmKPdMLRKZPKpEc2UThti8k4EdxzsAH3j7eWx8GhqYY");
  // Invalid hex falls back to 8 char slice
  assert.equal(personaName("invalid!hex"), "invalid!");
});

test("whoiam / Viso: officialViso generates port 7509 URL during dev", () => {
  const origLocation = globalThis.location;
  try {
    // Simulate Vite dev server on port 5173
    (globalThis as any).location = {
      port: "5173",
      host: "localhost:5173",
      protocol: "http:",
    };
    assert.equal(
      officialViso(),
      `http://127.0.0.1:7509/v1/contract/web/${VISO_KEY}/`
    );

    // Simulate standard Freenet gateway on port 7509
    (globalThis as any).location = {
      port: "7509",
      host: "127.0.0.1:7509",
      protocol: "http:",
    };
    assert.equal(
      officialViso(),
      `http://127.0.0.1:7509/v1/contract/web/${VISO_KEY}/`
    );
  } finally {
    globalThis.location = origLocation;
  }
});

test("whoiam / Viso: startSignIn constructs valid redirect URL with challenge", async () => {
  const origLocation = globalThis.location;
  const origLocalStorage = globalThis.localStorage;

  const mockStorage = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => mockStorage.get(k) ?? null,
    setItem: (k: string, v: string) => mockStorage.set(k, v),
  };

  (globalThis as any).location = {
    port: "5173",
    host: "localhost:5173",
    protocol: "http:",
    pathname: "/",
  };

  try {
    const visoTarget = `http://127.0.0.1:7509/v1/contract/web/${VISO_KEY}/`;
    const redirectUrlStr = await startSignIn(visoTarget);
    const redirectUrl = new URL(redirectUrlStr);

    assert.equal(redirectUrl.origin, "http://127.0.0.1:7509");
    assert.equal(redirectUrl.searchParams.get("connect"), "v1");
    assert.equal(redirectUrl.searchParams.get("return"), "http://localhost:5173/");
    // the signed base carries our path but not the user's node host
    assert.equal(redirectUrl.searchParams.get("base"), "http://127.0.0.1:7509/");
    assert.equal(redirectUrl.searchParams.get("key"), "v1"); // Viso's shared app key, the same on every device

    const challenge = redirectUrl.searchParams.get("challenge")!;
    assert.ok(challenge, "Challenge param must be present");
    assert.ok(challenge.startsWith("wd1."), "Challenge must start with wd1.");

    const parts = challenge.split(".");
    assert.equal(parts.length, 3, "Challenge format must be wd1.<appKey>.<nonce>");
    assert.equal(parts[1].length, 64, "App key must be 64-hex public key");
  } finally {
    globalThis.location = origLocation;
    globalThis.localStorage = origLocalStorage;
  }
});

test("whoiam / Viso: a reload replaying the callback of a done sign-in is no error", async () => {
  const { finishSignIn } = await import("../src/whoiam.ts");
  const { safeStorage } = await import("../src/storage.ts");
  const pk = "ab".repeat(32);
  safeStorage.setItem("radica_session", JSON.stringify({ persona: pk, type: "viso", cert: { sig: "s1" } }));
  const old = new URLSearchParams({ viso: "ok", pk, sig: "s1", challenge: "c.x", ts: "1" }); // expired long ago
  assert.deepEqual(await finishSignIn(old), { persona: pk, replayed: true });
  // a different, expired callback is still refused
  await assert.rejects(finishSignIn(new URLSearchParams({ viso: "ok", pk, sig: "s2", challenge: "c.x", ts: "1" })), /expired/);
  safeStorage.removeItem("radica_session");
});

test("whoiam / Viso: on a remote node the return path matches the signed base, so Viso signs no host", async () => {
  const origLocation = globalThis.location;
  (globalThis as any).location = { port: "7509", host: "192.168.1.7:7509", protocol: "http:", pathname: "/v1/contract/web/App1/index.html" };
  try {
    const u = new URL(await startSignIn(`http://192.168.1.7:7509/v1/contract/web/${VISO_KEY}/`));
    assert.equal(u.searchParams.get("return"), "http://192.168.1.7:7509/v1/contract/web/App1/");
    assert.equal(u.searchParams.get("base"), "http://127.0.0.1:7509/v1/contract/web/App1/");
  } finally {
    globalThis.location = origLocation;
  }
  assert.equal(certShowsHost({ base: "http://192.168.1.7:7509/v1/contract/web/App1/", challenge: "", ts: 0, sig: "" }), true);
  assert.equal(certShowsHost({ base: "http://127.0.0.1:7509/v1/contract/web/App1/", challenge: "", ts: 0, sig: "" }), false);
  assert.equal(certShowsHost(undefined), false);
});

test("whoiam / Viso: rejects unsolicited fresh sign-in callbacks (login CSRF) and foreign Viso hosts", async () => {
  const { finishSignIn, getAppKeyPubkey } = await import("../src/whoiam.ts");
  const { safeStorage } = await import("../src/storage.ts");
  const origLocation = globalThis.location;
  try {
    (globalThis as any).location = { port: "5173", host: "localhost:5173", protocol: "http:", pathname: "/" };
    await assert.rejects(
      startSignIn(`https://evil.example/v1/contract/web/${VISO_KEY}/`),
      /address of your Viso site/,
    );

    safeStorage.removeItem("radica_signin_pending");
    safeStorage.removeItem("radica_session");
    const personaSk = ed.utils.randomPrivateKey();
    const personaPk = hex(await ed.getPublicKeyAsync(personaSk));
    const appPk = await getAppKeyPubkey();
    const challenge = `wd1.${appPk}.${"aa".repeat(16)}`;
    const ts = Date.now();
    const base = "http://127.0.0.1:7509/";
    const sig = hex(await ed.signAsync(connectMessage(ed.etc.hexToBytes(personaPk), base, challenge, ts), personaSk));
    await assert.rejects(
      finishSignIn(new URLSearchParams({ viso: "ok", pk: personaPk, sig, challenge, ts: String(ts) })),
      /unknown or was already used/,
    );
  } finally {
    globalThis.location = origLocation;
  }
});
