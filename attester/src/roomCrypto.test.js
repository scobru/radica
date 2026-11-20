import test from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  edSkToX25519,
  edPubToX25519,
  x25519SharedSecret,
  encryptRoomKeyForPeer,
  decryptRoomKeyFromPeer,
  decryptRoomKey,
  encryptWithSymmetricKey,
  decryptWithSymmetricKey,
  computeRoomJoinProof,
  verifyProfileEncPub,
} from "./roomCrypto.js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const enc = new TextEncoder();

function lp(tag, fields) {
  return `${tag}|` + fields.map((f) => `${enc.encode(String(f)).length}:${f}`).join("");
}

function makeConnectMsg(pk, base, challenge, ts) {
  const bBase = enc.encode(base);
  const bChal = enc.encode(challenge);
  const out = new Uint8Array(17 + pk.length + 4 + bBase.length + 4 + bChal.length + 8);
  const dv = new DataView(out.buffer);
  let o = 0;
  out.set(enc.encode("whoiam-connect-v1"), o); o += 17;
  out.set(pk, o); o += pk.length;
  dv.setUint32(o, bBase.length, true); o += 4;
  out.set(bBase, o); o += bBase.length;
  dv.setUint32(o, bChal.length, true); o += 4;
  out.set(bChal, o); o += bChal.length;
  dv.setBigUint64(o, BigInt(ts), true);
  return out;
}

test("x25519SharedSecret + room key E2EE round-trip across two personas", async () => {
  const aliceSk = ed.utils.randomPrivateKey();
  const alicePk = bytesToHex(await ed.getPublicKeyAsync(aliceSk));
  const bobSk = ed.utils.randomPrivateKey();
  const bobPk = bytesToHex(await ed.getPublicKeyAsync(bobSk));

  assert.equal(edSkToX25519(aliceSk).length, 32);
  assert.equal(edPubToX25519(hexToBytes(alicePk)).length, 32);
  assert.deepEqual(x25519SharedSecret(aliceSk, bobPk), x25519SharedSecret(bobSk, alicePk));

  const roomKey = crypto.getRandomValues(new Uint8Array(32));
  const sealed = await encryptRoomKeyForPeer(aliceSk, bobPk, roomKey);
  assert.ok(sealed.startsWith("e2e:"));
  assert.deepEqual(await decryptRoomKeyFromPeer(bobSk, alicePk, sealed), roomKey);
  assert.equal(await decryptRoomKeyFromPeer(bobSk, bobPk, sealed), null);
});

test("encryptWithSymmetricKey and decryptWithSymmetricKey round-trip and reject tampering", async () => {
  const roomKey = crypto.getRandomValues(new Uint8Array(32));
  const otherKey = crypto.getRandomValues(new Uint8Array(32));
  const cipher = await encryptWithSymmetricKey(roomKey, "ciao mondo 🌱");
  assert.ok(cipher.startsWith("sym:"));
  assert.equal(await decryptWithSymmetricKey(roomKey, cipher), "ciao mondo 🌱");
  assert.equal(await decryptWithSymmetricKey(otherKey, cipher), null);
  assert.equal(await decryptWithSymmetricKey(roomKey, "plain text"), null);
});

test("decryptRoomKey follows keys_enc_pub -> creator_enc_pub -> creator fallback order", async () => {
  const creatorSk = ed.utils.randomPrivateKey();
  const creatorPk = bytesToHex(await ed.getPublicKeyAsync(creatorSk));
  const appSk = ed.utils.randomPrivateKey();
  const appPk = bytesToHex(await ed.getPublicKeyAsync(appSk));
  const modSk = ed.utils.randomPrivateKey();
  const modPk = bytesToHex(await ed.getPublicKeyAsync(modSk));
  const botSk = ed.utils.randomPrivateKey();
  const botPk = bytesToHex(await ed.getPublicKeyAsync(botSk));
  const roomKey = crypto.getRandomValues(new Uint8Array(32));

  // Encrypted by creator's Viso app key
  const byApp = await encryptRoomKeyForPeer(appSk, botPk, roomKey);
  assert.deepEqual(
    await decryptRoomKey(botSk, botPk, { creator: creatorPk, creator_enc_pub: appPk, encrypted_keys: { [botPk]: byApp } }),
    roomKey,
  );

  // Encrypted by rotating moderator (keys_enc_pub)
  const byMod = await encryptRoomKeyForPeer(modSk, botPk, roomKey);
  assert.deepEqual(
    await decryptRoomKey(botSk, botPk, { creator: creatorPk, keys_enc_pub: modPk, encrypted_keys: { [botPk]: byMod } }),
    roomKey,
  );

  // River rooms and missing keys return null
  assert.equal(await decryptRoomKey(botSk, botPk, { river: { owner: creatorPk }, creator: creatorPk, encrypted_keys: { [botPk]: byApp } }), null);
  assert.equal(await decryptRoomKey(botSk, botPk, { creator: creatorPk, encrypted_keys: {} }), null);
});

test("computeRoomJoinProof produces deterministic 64-hex HMAC", () => {
  const roomKey = new Uint8Array(32).fill(7);
  const pk = "AB".repeat(32);
  const p1 = computeRoomJoinProof(roomKey, "privroom_1", pk);
  const p2 = computeRoomJoinProof(roomKey, "privroom_1", pk.toLowerCase());
  assert.match(p1, /^[0-9a-f]{64}$/);
  assert.equal(p1, p2);
});

test("verifyProfileEncPub accepts valid v3/legacy/Viso signatures and rejects tampered or cross-app certs", async () => {
  const masterSk = ed.utils.randomPrivateKey();
  const masterPk = bytesToHex(await ed.getPublicKeyAsync(masterSk));
  const encSk = ed.utils.randomPrivateKey();
  const encPk = bytesToHex(await ed.getPublicKeyAsync(encSk));
  const appPath = "/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/";

  // Direct v3 signature
  const v3Msg = lp("radica/profile/v4", [masterPk, "Alice", "hi", "", encPk, 100]);
  const v3Sig = bytesToHex(await ed.signAsync(enc.encode(v3Msg), masterSk));
  assert.equal(
    await verifyProfileEncPub(masterPk, { v: 3, display_name: "Alice", bio: "hi", avatar_url: "", enc_pub: encPk, updated_at: 100, sig: v3Sig }, appPath),
    encPk,
  );

  // Tampered bio falls back to masterPk
  assert.equal(
    await verifyProfileEncPub(masterPk, { v: 3, display_name: "Alice", bio: "evil", avatar_url: "", enc_pub: encPk, updated_at: 100, sig: v3Sig }, appPath),
    masterPk,
  );

  // Legacy profile signature
  const legMsg = `radica/profile/v3:${masterPk}:Alice:hi::${encPk}:100`;
  const legSig = bytesToHex(await ed.signAsync(enc.encode(legMsg), masterSk));
  assert.equal(
    await verifyProfileEncPub(masterPk, { display_name: "Alice", bio: "hi", avatar_url: "", enc_pub: encPk, updated_at: 100, sig: legSig }, appPath),
    encPk,
  );

  // Viso-delegated profile signature
  const ts = 1_700_000_000_000;
  const challenge = `wd1.${encPk}.deadbeef`;
  const base = `http://127.0.0.1:7509${appPath}`;
  const certSig = bytesToHex(await ed.signAsync(makeConnectMsg(hexToBytes(masterPk), base, challenge, ts), masterSk));
  const appSig = bytesToHex(await ed.signAsync(enc.encode(v3Msg), encSk));
  assert.equal(
    await verifyProfileEncPub(masterPk, { v: 3, display_name: "Alice", bio: "hi", avatar_url: "", enc_pub: encPk, updated_at: 100, sig: appSig, cert: { base, challenge, ts, sig: certSig } }, appPath),
    encPk,
  );

  // Wrong app path in cert is rejected
  const foreignBase = "http://127.0.0.1:7509/v1/contract/web/OtherApp/";
  const foreignCertSig = bytesToHex(await ed.signAsync(makeConnectMsg(hexToBytes(masterPk), foreignBase, challenge, ts), masterSk));
  assert.equal(
    await verifyProfileEncPub(masterPk, { v: 3, display_name: "Alice", bio: "hi", avatar_url: "", enc_pub: encPk, updated_at: 100, sig: appSig, cert: { base: foreignBase, challenge, ts, sig: foreignCertSig } }, appPath),
    masterPk,
  );
});
