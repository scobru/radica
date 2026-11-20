import test from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  encryptRoomKeyForPeer,
  decryptRoomKeyFromPeer,
  encryptWithSymmetricKey,
  decryptWithSymmetricKey,
  generateRoomKey,
} from "../src/crypto.ts";
import {
  encryptRoomKeyForPeer as botEncryptRoomKeyForPeer,
  decryptRoomKeyFromPeer as botDecryptRoomKeyFromPeer,
  encryptWithSymmetricKey as botEncryptWithSymmetricKey,
  decryptWithSymmetricKey as botDecryptWithSymmetricKey,
  computeRoomJoinProof as botComputeRoomJoinProof,
} from "../../attester/src/roomCrypto.js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

test("UI crypto.ts and attester roomCrypto.js interoperate bidirectionally for room keys, sym messages, and join proofs", async () => {
  const ownerSk = ed.utils.randomPrivateKey();
  const ownerPk = bytesToHex(await ed.getPublicKeyAsync(ownerSk));
  const botSk = ed.utils.randomPrivateKey();
  const botPk = bytesToHex(await ed.getPublicKeyAsync(botSk));
  const roomKey = generateRoomKey();

  // Owner (UI) seals roomKey -> Bot (attester) opens it
  const uiSealed = await encryptRoomKeyForPeer(ownerSk, botPk, roomKey);
  assert.deepEqual(await botDecryptRoomKeyFromPeer(botSk, ownerPk, uiSealed), roomKey);

  // Bot (attester) rotates roomKey -> Owner (UI) opens it
  const rotatedKey = generateRoomKey();
  const botSealed = await botEncryptRoomKeyForPeer(botSk, ownerPk, rotatedKey);
  assert.deepEqual(await decryptRoomKeyFromPeer(ownerSk, botPk, botSealed), rotatedKey);

  // UI sym -> Bot sym decrypt, and Bot sym -> UI sym decrypt
  const uiCipher = await encryptWithSymmetricKey(rotatedKey, "Hello from Radica UI 🌱");
  assert.equal(await botDecryptWithSymmetricKey(rotatedKey, uiCipher), "Hello from Radica UI 🌱");

  const botCipher = await botEncryptWithSymmetricKey(rotatedKey, "Warning from 🌱 The Gardener");
  assert.equal(await decryptWithSymmetricKey(rotatedKey, botCipher), "Warning from 🌱 The Gardener");

  // Join proof HMAC matches ui/src/freenet.ts computeRoomJoinProof formula
  const uiProof = bytesToHex(hmac(sha256, rotatedKey, new TextEncoder().encode(`radica/room-join/v1|privroom_123|${ownerPk.toLowerCase()}`)));
  assert.equal(botComputeRoomJoinProof(rotatedKey, "privroom_123", ownerPk), uiProof);
});
