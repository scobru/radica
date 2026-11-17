import { test } from "node:test";
import assert from "node:assert/strict";
import { ed25519 as curveEd25519 } from "@noble/curves/ed25519.js";
import * as ed from "@noble/ed25519";
import { drDecrypt, drEncrypt, drSessions, PREFIX_V2, type DrStore } from "../src/secretRatchet.ts";

function memStore(): DrStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

function party() {
  const sk = crypto.getRandomValues(new Uint8Array(32));
  const pk = ed.etc.bytesToHex(curveEd25519.getPublicKey(sk));
  return { sk, pk, store: memStore() };
}

type P = ReturnType<typeof party>;
const send = (from: P, to: P, text: string) => drEncrypt(from.store, from.sk, from.pk, to.pk, to.pk, { text });
const open = async (to: P, from: P, c: string) => ((await drDecrypt(to.store, to.sk, to.pk, from.pk, from.pk, c)) as { text: string }).text;

test("secretRatchet: messages both ways, the ratchet key changes on each turn", async () => {
  const [a, b] = [party(), party()];
  const a1 = await send(a, b, "hi");
  assert.ok(a1.startsWith(PREFIX_V2));
  assert.equal(await open(b, a, a1), "hi");
  const b1 = await send(b, a, "hey");
  assert.equal(await open(a, b, b1), "hey");
  const a2 = await send(a, b, "how are you");
  assert.equal(await open(b, a, a2), "how are you");
  const head = (c: string) => JSON.parse(atob(c.slice(PREFIX_V2.length).split(":")[0].replace(/-/g, "+").replace(/_/g, "/")));
  assert.notEqual(head(a1).d, head(a2).d, "a new turn sends from a new ratchet key");
  assert.equal(drSessions(a.store, a.pk, b.pk).length, 1);
});

test("secretRatchet: out-of-order messages open, a message opens once", async () => {
  const [a, b] = [party(), party()];
  const m = [await send(a, b, "0"), await send(a, b, "1"), await send(a, b, "2")];
  assert.equal(await open(b, a, m[2]), "2");
  assert.equal(await open(b, a, m[0]), "0");
  assert.equal(await open(b, a, m[1]), "1");
  await assert.rejects(open(b, a, m[1]), "replaying an opened message fails: its key is gone");
});

test("secretRatchet: the identity key alone no longer opens messages after a turn (forward secrecy)", async () => {
  const [a, b] = [party(), party()];
  assert.equal(await open(b, a, await send(a, b, "first")), "first");
  assert.equal(await open(a, b, await send(b, a, "reply")), "reply");
  const later = await send(a, b, "after a turn");
  // someone with Bob's identity key but not his ratchet state
  const thief = { ...b, store: memStore() };
  await assert.rejects(open(thief, a, later));
  // Bob's own state still opens it
  assert.equal(await open(b, a, later), "after a turn");
});

test("secretRatchet: two people who write first at the same time both read each other, then talk", async () => {
  const [a, b] = [party(), party()];
  const fromA = await send(a, b, "A first");
  const fromB = await send(b, a, "B first");
  assert.equal(await open(b, a, fromA), "A first");
  assert.equal(await open(a, b, fromB), "B first");
  for (let i = 0; i < 3; i++) {
    assert.equal(await open(b, a, await send(a, b, `a${i}`)), `a${i}`);
    assert.equal(await open(a, b, await send(b, a, `b${i}`)), `b${i}`);
  }
});

test("secretRatchet: a changed header or another reader fails, and leaves the session as it was", async () => {
  const [a, b, c] = [party(), party(), party()];
  const msg = await send(a, b, "secret");
  const [headerB64, iv, body] = msg.slice(PREFIX_V2.length).split(":");
  const h = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
  const forged = `${PREFIX_V2}${btoa(JSON.stringify({ ...h, n: 1 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}:${iv}:${body}`;
  await assert.rejects(open(b, a, forged));
  assert.equal(drSessions(b.store, b.pk, a.pk).length, 0, "a failed message stores nothing");
  await assert.rejects(open(c, a, msg));
  assert.equal(await open(b, a, msg), "secret");
});
