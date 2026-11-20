import { test } from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import {
  getSecretRoomId,
  isSecretRoomId,
  peerFromSecretRoomId,
  formatTtlLabel,
  getOrCreateSecretSession,
  encryptSecretMessage,
  decryptSecretMessage,
  scheduleMessageBurn,
  TTL_PRESETS,
} from "../src/secretChat.ts";

test("secretChat: room id identification and peer derivation", () => {
  const alice = "1111111111111111111111111111111111111111111111111111111111111111";
  const bob = "2222222222222222222222222222222222222222222222222222222222222222";

  const roomId = getSecretRoomId(bob, alice);
  assert.equal(roomId, `secret_${alice}_${bob}`);
  assert.equal(isSecretRoomId(roomId), true);
  assert.equal(isSecretRoomId("direct_alice_bob"), false);
  assert.equal(isSecretRoomId("privroom_123"), false);

  assert.equal(peerFromSecretRoomId(roomId, alice), bob);
  assert.equal(peerFromSecretRoomId(roomId, bob), alice);
});

test("secretChat: TTL labels and presets", () => {
  assert.equal(formatTtlLabel(0), "Off");
  assert.equal(formatTtlLabel(10), "10s");
  assert.equal(formatTtlLabel(30), "30s");
  assert.equal(formatTtlLabel(60), "1m");
  assert.equal(formatTtlLabel(300), "5m");
  assert.equal(formatTtlLabel(3600), "1h");
  assert.equal(formatTtlLabel(86400), "24h");
  assert.ok(TTL_PRESETS.length >= 7);
});

test("secretChat: ephemeral ratchet encryption & decryption with Forward Secrecy", async () => {
  // Alice identity
  const aliceSk = crypto.getRandomValues(new Uint8Array(32));
  const alicePk = ed.etc.bytesToHex(await ed.getPublicKeyAsync(aliceSk));

  // Bob identity
  const bobSk = crypto.getRandomValues(new Uint8Array(32));
  const bobPk = ed.etc.bytesToHex(await ed.getPublicKeyAsync(bobSk));

  // Alice initializes secret session
  const aliceSession = getOrCreateSecretSession(aliceSk, alicePk, bobPk, 30);
  assert.ok(aliceSession.sessionId);
  assert.equal(aliceSession.sendCount, 0);

  // Alice encrypts message 1
  const msg1 = "Secret message 1: meet at noon";
  const { ciphertext: c1, updatedSession: s1 } = await encryptSecretMessage(aliceSession, msg1, 30);
  assert.ok(c1.startsWith("secret:v1:"));
  assert.equal(s1.sendCount, 1);

  // Alice encrypts message 2 (ratchet step advances key)
  const msg2 = "Secret message 2: bring the key";
  const { ciphertext: c2, updatedSession: s2 } = await encryptSecretMessage(s1, msg2, 30);
  assert.notEqual(c1, c2);
  assert.equal(s2.sendCount, 2);

  // Bob decrypts message 1
  const dec1 = await decryptSecretMessage(bobSk, bobPk, alicePk, c1);
  assert.equal(dec1.text, msg1);
  assert.equal(dec1.ttl, 30);
  assert.equal(dec1.index, 0);

  // Bob decrypts message 2
  const dec2 = await decryptSecretMessage(bobSk, bobPk, alicePk, c2);
  assert.equal(dec2.text, msg2);
  assert.equal(dec2.ttl, 30);
  assert.equal(dec2.index, 1);

  // Alice re-reads her own sent messages (stored as ciphertext) after a reload
  const own1 = await decryptSecretMessage(aliceSk, alicePk, bobPk, c1, true);
  const own2 = await decryptSecretMessage(aliceSk, alicePk, bobPk, c2, true);
  assert.equal(own1.text, msg1);
  assert.equal(own2.text, msg2);
});

test("secretChat: message self-destruct scheduler triggers on burn", async () => {
  let burned = false;
  const burnAt = Date.now() + 50; // 50ms in the future
  scheduleMessageBurn("msg_test_burn", burnAt, () => {
    burned = true;
  });

  await new Promise((r) => setTimeout(r, 80));
  assert.equal(burned, true);
});

test("secretChat: notification item routing distinguishes secret chat from standard DM", () => {
  const alice = "1111111111111111111111111111111111111111111111111111111111111111";
  const bob = "2222222222222222222222222222222222222222222222222222222222222222";
  const secretRoom = getSecretRoomId(alice, bob);
  const plainRoom = alice < bob ? `${alice}:${bob}` : `${bob}:${alice}`;

  const resolveChatRoute = (n: { linkRoomId?: string; isSecret?: boolean; text: string }) => {
    return !!(
      n.isSecret ||
      (n.linkRoomId && isSecretRoomId(n.linkRoomId)) ||
      n.text.toLowerCase().includes("secret chat")
    );
  };

  assert.equal(
    resolveChatRoute({ linkRoomId: secretRoom, isSecret: true, text: "sent you a secret chat message 🔐" }),
    true
  );
  assert.equal(
    resolveChatRoute({ text: "sent you a secret chat message 🔐" }),
    true
  );
  assert.equal(
    resolveChatRoute({ linkRoomId: secretRoom, text: "sent a message" }),
    true
  );
  assert.equal(
    resolveChatRoute({ linkRoomId: plainRoom, text: "sent you an encrypted direct message 🔒" }),
    false
  );
});

test("secretChat: rejects negative or oversized msgIndex immediately without unbounded HKDF looping", async () => {
  const sk = crypto.getRandomValues(new Uint8Array(32));
  const pk = ed.etc.bytesToHex(await ed.getPublicKeyAsync(sk));
  const peer = "33".repeat(32);
  const iv = "00".repeat(12);
  const ct = "aa".repeat(32);
  await assert.rejects(
    decryptSecretMessage(sk, pk, peer, `secret:v1:${pk}:999999999:${iv}:${ct}`),
    /Invalid secret message index/,
  );
  await assert.rejects(
    decryptSecretMessage(sk, pk, peer, `secret:v1:${pk}:-1:${iv}:${ct}`),
    /Invalid secret message index/,
  );
});
