import test from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import {
  formatPostSignatureMessage,
  formatCommentSignatureMessage,
  formatProfileSignatureMessage,
  formatLikeSignatureMessage,
  formatFollowingSignatureMessage,
  formatDeleteSignatureMessage,
  formatChatMessageSignatureMessage,
  formatCommunitySignatureMessage,
  formatModActionSignatureMessage,
  encryptDirectMessage,
  decryptDirectMessage,
  generateRoomKey,
  encryptWithSymmetricKey,
  decryptWithSymmetricKey,
  encryptRoomKeyForPeer,
  decryptRoomKeyFromPeer,
  formatPrivateRoomSignatureMessage,
  verifySignature,
  bytesToHex,
  hexToBytes,
} from "../src/crypto.ts";

test("crypto: message formatters generate deterministic structured strings", () => {
  const postMsg = formatPostSignatureMessage({
    id: "p123",
    author: "author_hex",
    category: "moment",
    caption: "Hello world!",
    media_uri: "data:image/webp;base64,AA",
    location: "Rome",
    timestamp: 1700000000,
  });
  assert.equal(postMsg, "radica/post/v2:p123:author_hex:moment:Hello world!:data:image/webp;base64,AA::Rome::false:1700000000");

  const commentMsg = formatCommentSignatureMessage("c456", "p123", "commenter_hex", "Great post!", 1700000050);
  assert.equal(commentMsg, "radica/comment/v2:c456:p123:commenter_hex:Great post!:1700000050");

  const profileMsg = formatProfileSignatureMessage("owner_hex", "Alice", "Decentralized builder", "avatar.png", "enc_hex", 1700000100);
  assert.equal(profileMsg, "radica/profile/v3:owner_hex:Alice:Decentralized builder:avatar.png:enc_hex:1700000100");

  assert.equal(formatLikeSignatureMessage("o", "p1", "l", true, 5), "radica/like/v2:o:p1:l:true:5");
  assert.equal(formatFollowingSignatureMessage("o", 7, ["bb", "aa"]), "radica/following/v2:o:7:aa,bb");
  assert.equal(formatDeleteSignatureMessage("o", "p1"), "radica/delete/v2:o:p1");

  const chatMsg = formatChatMessageSignatureMessage(
    "m789",
    "general",
    "alice_hex",
    "bob_hex",
    "Secret hello",
    1700000150
  );
  assert.equal(chatMsg, "m789:general:alice_hex:bob_hex:Secret hello:1700000150");

  const commMsg = formatCommunitySignatureMessage(
    "comm-tech",
    "tech",
    "Technology",
    "creator_hex",
    1700000200
  );
  assert.equal(commMsg, "comm-tech:tech:Technology:creator_hex:1700000200");

  const modMsg = formatModActionSignatureMessage(
    "comm-tech",
    "delete_post",
    "post_bad",
    "mod_hex",
    1700000250
  );
  assert.equal(modMsg, "comm-tech:delete_post:post_bad:mod_hex:1700000250");
});

test("crypto: 1-on-1 E2EE encryption & decryption via X25519 ECDH + AES-GCM", async () => {
  // Alice keypair
  const alicePriv = ed.utils.randomPrivateKey();
  const alicePub = await ed.getPublicKeyAsync(alicePriv);
  const alicePubHex = ed.etc.bytesToHex(alicePub);

  // Bob keypair
  const bobPriv = ed.utils.randomPrivateKey();
  const bobPub = await ed.getPublicKeyAsync(bobPriv);
  const bobPubHex = ed.etc.bytesToHex(bobPub);

  const secretMessage = "Confidential P2P transmission over Freenet 🚀🔒";

  // Alice encrypts for Bob
  const encrypted = await encryptDirectMessage(alicePriv, bobPubHex, secretMessage);
  assert.ok(encrypted.startsWith("e2e:"), "Ciphertext must have e2e: prefix");

  const parts = encrypted.split(":");
  assert.equal(parts.length, 3, "Encrypted format must be e2e:<ivHex>:<cipherHex>");
  assert.equal(parts[1].length, 24, "IV must be 12 bytes (24 hex characters)");
  assert.notEqual(parts[2], secretMessage, "Plaintext must not be exposed");

  // Bob decrypts from Alice
  const decryptedByBob = await decryptDirectMessage(bobPriv, alicePubHex, encrypted);
  assert.equal(decryptedByBob, secretMessage);

  // Bob replies to Alice
  const reply = "Received loud and clear, Alice!";
  const encryptedReply = await encryptDirectMessage(bobPriv, alicePubHex, reply);
  const decryptedByAlice = await decryptDirectMessage(alicePriv, bobPubHex, encryptedReply);
  assert.equal(decryptedByAlice, reply);
});

test("crypto: E2EE handles tampered ciphertexts and non-e2e plaintexts gracefully", async () => {
  const alicePriv = ed.utils.randomPrivateKey();
  const bobPriv = ed.utils.randomPrivateKey();
  const alicePubHex = ed.etc.bytesToHex(await ed.getPublicKeyAsync(alicePriv));
  const bobPubHex = ed.etc.bytesToHex(await ed.getPublicKeyAsync(bobPriv));

  const encrypted = await encryptDirectMessage(alicePriv, bobPubHex, "Secret data");

  // Tamper ciphertext
  const tampered = encrypted.slice(0, -4) + "0000";
  const decryptedTampered = await decryptDirectMessage(bobPriv, alicePubHex, tampered);
  assert.equal(decryptedTampered, "[Encrypted message - unable to decrypt]");

  // Plaintext without e2e: prefix passes through untouched
  const plainText = "Standard community chat message without encryption";
  const decryptedPlain = await decryptDirectMessage(bobPriv, alicePubHex, plainText);
  assert.equal(decryptedPlain, plainText);
});

test("crypto: Private Room group encryption (AES-256-GCM + X25519 ECIES)", async () => {
  // 1. Members: Alice (creator), Bob, Charlie, and Eve (intruder)
  const alicePriv = ed.utils.randomPrivateKey();
  const alicePubHex = ed.etc.bytesToHex(await ed.getPublicKeyAsync(alicePriv));

  const bobPriv = ed.utils.randomPrivateKey();
  const bobPubHex = ed.etc.bytesToHex(await ed.getPublicKeyAsync(bobPriv));

  const charliePriv = ed.utils.randomPrivateKey();
  const charliePubHex = ed.etc.bytesToHex(await ed.getPublicKeyAsync(charliePriv));

  const evePriv = ed.utils.randomPrivateKey();

  // 2. Room signature format
  const sigMsg = formatPrivateRoomSignatureMessage("privroom_123", alicePubHex, 1700000000);
  assert.equal(sigMsg, `privroom_123:${alicePubHex}:1700000000`);

  // 3. Alice generates symmetric 256-bit room key
  const roomKey = generateRoomKey();
  assert.equal(roomKey.length, 32);

  // 4. Alice encrypts the room key for Bob and Charlie
  const encryptedKeyForBob = await encryptRoomKeyForPeer(alicePriv, bobPubHex, roomKey);
  const encryptedKeyForCharlie = await encryptRoomKeyForPeer(alicePriv, charliePubHex, roomKey);

  // 5. Bob and Charlie successfully decrypt the room key
  const bobRecoveredKey = await decryptRoomKeyFromPeer(bobPriv, alicePubHex, encryptedKeyForBob);
  assert.ok(bobRecoveredKey !== null);
  assert.deepEqual(bobRecoveredKey, roomKey);

  const charlieRecoveredKey = await decryptRoomKeyFromPeer(charliePriv, alicePubHex, encryptedKeyForCharlie);
  assert.ok(charlieRecoveredKey !== null);
  assert.deepEqual(charlieRecoveredKey, roomKey);

  // 6. Eve cannot decrypt Bob's or Charlie's room key
  const eveAttempt = await decryptRoomKeyFromPeer(evePriv, alicePubHex, encryptedKeyForBob);
  assert.equal(eveAttempt, null);

  // 7. Group messaging with symmetric AES-256-GCM
  const encryptedRoomName = await encryptWithSymmetricKey(roomKey, "Secret Developers Council");
  assert.ok(encryptedRoomName.startsWith("sym:"));

  // Both Bob and Charlie can decrypt the room name
  const bobDecryptedName = await decryptWithSymmetricKey(bobRecoveredKey!, encryptedRoomName);
  assert.equal(bobDecryptedName, "Secret Developers Council");

  const charlieDecryptedName = await decryptWithSymmetricKey(charlieRecoveredKey!, encryptedRoomName);
  assert.equal(charlieDecryptedName, "Secret Developers Council");

  // Charlie broadcasts an encrypted message to the group
  const secretGroupMsg = "Welcome to the private decentralized council room! 🛡️⚡";
  const encryptedGroupMsg = await encryptWithSymmetricKey(charlieRecoveredKey!, secretGroupMsg);

  // Both Alice and Bob can decrypt Charlie's message
  const aliceDecryptedMsg = await decryptWithSymmetricKey(roomKey, encryptedGroupMsg);
  assert.equal(aliceDecryptedMsg, secretGroupMsg);

  const bobDecryptedMsg = await decryptWithSymmetricKey(bobRecoveredKey!, encryptedGroupMsg);
  assert.equal(bobDecryptedMsg, secretGroupMsg);

  // Eve (without the room key) cannot decrypt the group message
  const fakeKey = generateRoomKey();
  const eveDecryptedMsg = await decryptWithSymmetricKey(fakeKey, encryptedGroupMsg);
  assert.equal(eveDecryptedMsg, "[Encrypted room message - unable to decrypt]");
});

test("crypto: private room invite link key serialization and zero-knowledge fragment roundtrip", async () => {
  const roomKey = generateRoomKey();
  const keyHex = bytesToHex(roomKey);
  assert.equal(keyHex.length, 64);

  // Restore key from hex
  const restoredKey = hexToBytes(keyHex);
  assert.deepEqual(restoredKey, roomKey);

  // Test encryption with original, decryption with key recovered from invite fragment
  const secretText = "Top secret conversation via invite link! 🚀🔑";
  const encrypted = await encryptWithSymmetricKey(roomKey, secretText);
  const decrypted = await decryptWithSymmetricKey(restoredKey, encrypted);
  assert.equal(decrypted, secretText);
});


test("crypto: a message sent to an old app key still reads after Viso's shared key replaced it", async () => {
  const { encryptDirectMessage, decryptDirectMessage, addReadKeys, readEncPubs } = await import("../src/crypto.ts");
  const ed = await import("@noble/ed25519");
  const [peer, oldMine, newMine] = [ed.utils.randomPrivateKey(), ed.utils.randomPrivateKey(), ed.utils.randomPrivateKey()];
  const hex = ed.etc.bytesToHex;
  const peerPub = hex(await ed.getPublicKeyAsync(peer));
  const sealed = await encryptDirectMessage(peer, hex(await ed.getPublicKeyAsync(oldMine)), "hello");
  assert.equal(await decryptDirectMessage(newMine, peerPub, sealed), "[Encrypted message - unable to decrypt]");
  addReadKeys([hex(oldMine)]);
  assert.equal(await decryptDirectMessage(newMine, peerPub, sealed), "hello");
  assert.deepEqual(await readEncPubs(), [hex(await ed.getPublicKeyAsync(oldMine))]);
});

test("crypto: verifySignature binds cache key to message content", async () => {
  const sk = ed.utils.randomPrivateKey();
  const pk = bytesToHex(await ed.getPublicKeyAsync(sk));
  const msg1 = "hello message 1";
  const msg2 = "completely different message 2";
  const sig1 = bytesToHex(await ed.signAsync(new TextEncoder().encode(msg1), sk));

  assert.equal(await verifySignature(msg1, sig1, pk), true);
  // Reuse of (sig1, pk) for a different message MUST NOT hit cached true
  assert.equal(await verifySignature(msg2, sig1, pk), false);
});
