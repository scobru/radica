// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { x25519 } from "@noble/curves/ed25519.js";
import { newEpk, openEsk } from "../src/visoSeal.ts";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const un = (h: string) => Uint8Array.from(Buffer.from(h, "hex"));

/** Viso's side, written from the wire format (scobru/viso seal_app_secret). */
async function seal(secret: Uint8Array, clientEpk: string, challenge: string): Promise<string> {
  const e = x25519.utils.randomSecretKey(), ePub = x25519.getPublicKey(e);
  const ikm = await crypto.subtle.importKey("raw", x25519.getSharedSecret(e, un(clientEpk)), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array([...ePub, ...un(clientEpk)]), info: new TextEncoder().encode("viso connect v1 app secret") }, ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: new Uint8Array(12), additionalData: new TextEncoder().encode(challenge) }, key, secret));
  return `${hex(ePub)}.${hex(ct)}`;
}

test("the sealed app key round-trips, and only for the key and the sign-in it was sealed to", async () => {
  const secret = new Uint8Array(32).fill(0x42), mine = newEpk(), other = newEpk();
  const challenge = `wd1.${"ab".repeat(32)}.${mine.pub}`;
  const esk = await seal(secret, mine.pub, challenge);
  assert.equal(await openEsk(esk, mine.priv, challenge), hex(secret));
  await assert.rejects(() => openEsk(esk, other.priv, `wd1.${"ab".repeat(32)}.${other.pub}`)); // wrong key
  await assert.rejects(() => openEsk(esk, mine.priv, `wd1.${"cd".repeat(32)}.${mine.pub}`)); // another sign-in's challenge: AAD mismatch
  await assert.rejects(() => openEsk(esk, mine.priv, `wd1.${"ab".repeat(32)}.${other.pub}`), /different request/); // nonce is not our epk
  await assert.rejects(() => openEsk("zz.zz", mine.priv, challenge), /malformed/);
});

test("HKDF step matches the known-answer vector in viso's docs", async () => {
  const ikm = await crypto.subtle.importKey("raw", new Uint8Array(32).fill(1), "HKDF", false, ["deriveBits"]);
  const salt = new Uint8Array([...new Uint8Array(32).fill(2), ...new Uint8Array(32).fill(3)]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("viso connect v1 app secret") }, ikm, 256);
  assert.equal(hex(new Uint8Array(bits)), "19d4be8a0f28c60650e355bd8db0549ca0db302e5330c0c7353725981de879d2");
});
