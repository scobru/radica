import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveMailSeeds,
  encodeRecoveryKey,
  decodeRecoveryKey,
  deriveMailAddress,
  deriveMailIdentity,
  createIdentityBackupJson,
  deriveInboxContractAddress,
  deriveFingerprintWords,
  formatContactCard,
  encryptFreenetMailV1,
  decryptFreenetMailV1,
  FMAIL_TOKEN_PREFIX,
} from "../src/freenetMail.ts";

test("freenetMail: encodes official fixture seeds to the exact official token", () => {
  // Official test fixture from freenet/mail/protocol/src/recovery_key.rs
  const dsa = new Uint8Array(32);
  for (let i = 0; i < 32; i++) dsa[i] = i;

  const kem = new Uint8Array(64);
  for (let i = 0; i < 64; i++) kem[i] = 100 + i;

  const token = encodeRecoveryKey(dsa, kem);
  const expectedToken =
    "fmail-key-1:Ax4ijNhMohvn7t2FBdYENew4FSw2LERAQm36723fcqM8q2fzYT4re5MvYhBJjLckN1iBpybsSW4VW6UKgwBEkRspZvMH5LEzKcGe2Ag9k86C7eHeaB7UE3cVEroRp8wMbwxywGL95";

  assert.equal(token, expectedToken);
});

test("freenetMail: decodes official token back to exact fixture seeds", () => {
  const token =
    "fmail-key-1:Ax4ijNhMohvn7t2FBdYENew4FSw2LERAQm36723fcqM8q2fzYT4re5MvYhBJjLckN1iBpybsSW4VW6UKgwBEkRspZvMH5LEzKcGe2Ag9k86C7eHeaB7UE3cVEroRp8wMbwxywGL95";

  const { mlDsaSeed, mlKemSeed } = decodeRecoveryKey(token);

  assert.equal(mlDsaSeed.length, 32);
  assert.equal(mlKemSeed.length, 64);

  for (let i = 0; i < 32; i++) {
    assert.equal(mlDsaSeed[i], i);
  }
  for (let i = 0; i < 64; i++) {
    assert.equal(mlKemSeed[i], 100 + i);
  }
});

test("freenetMail: tolerates whitespace and uppercase prefix in recovery key", () => {
  const token =
    "  FMAIL-KEY-1:Ax4ijNhMohvn7t2FBdYENew4FSw2LERAQm36723fcqM8q2fzYT4re5MvYhBJjLckN1iBpybsSW4VW6UKgwBEkRspZvMH5LEzKcGe2Ag9k86C7eHeaB7UE3cVEroRp8wMbwxywGL95 \n";

  const { mlDsaSeed, mlKemSeed } = decodeRecoveryKey(token);
  assert.equal(mlDsaSeed[0], 0);
  assert.equal(mlKemSeed[0], 100);
});

test("freenetMail: rejects corrupted tokens", () => {
  assert.throws(() => decodeRecoveryKey("not-a-token"), /Invalid prefix/);
  assert.throws(() => decodeRecoveryKey("fmail-key-2:xyz"), /Unsupported recovery key version: 2/);

  // Alter last char to corrupt checksum
  const corrupted =
    "fmail-key-1:Ax4ijNhMohvn7t2FBdYENew4FSw2LERAQm36723fcqM8q2fzYT4re5MvYhBJjLckN1iBpybsSW4VW6UKgwBEkRspZvMH5LEzKcGe2Ag9k86C7eHeaB7UE3cVEroRp8wMbwxywGL96";
  assert.throws(() => decodeRecoveryKey(corrupted), /Invalid recovery key checksum/);
});

test("freenetMail: deterministic seed derivation from master secret", () => {
  const secretA = new Uint8Array(32).fill(42);
  const secretB = new Uint8Array(32).fill(99);

  const seedsA1 = deriveMailSeeds(secretA);
  const seedsA2 = deriveMailSeeds(secretA);
  const seedsB = deriveMailSeeds(secretB);

  // Exact reproducibility
  assert.deepEqual(seedsA1.mlDsaSeed, seedsA2.mlDsaSeed);
  assert.deepEqual(seedsA1.mlKemSeed, seedsA2.mlKemSeed);

  // Different secrets produce different seeds
  assert.notDeepEqual(seedsA1.mlDsaSeed, seedsB.mlDsaSeed);
  assert.notDeepEqual(seedsA1.mlKemSeed, seedsB.mlKemSeed);
});

test("freenetMail: derives valid 36-char Base58 mail address", () => {
  const secret = new Uint8Array(32).fill(7);
  const { mlDsaSeed } = deriveMailSeeds(secret);
  const { address, dsaVk } = deriveMailAddress(mlDsaSeed);

  assert.equal(address.length, 36);
  assert.equal(dsaVk.length, 1952);
  assert.match(address, /^[1-9A-HJ-NP-Za-km-z]{36}$/);
});

test("freenetMail: full identity derivation and backup JSON export", () => {
  const masterSecret = new Uint8Array(32);
  for (let i = 0; i < 32; i++) masterSecret[i] = i * 3 + 1;

  const id = deriveMailIdentity("scobru", masterSecret);

  assert.equal(id.alias, "scobru");
  assert.equal(id.address.length, 36);
  assert.ok(id.recoveryKey.startsWith(FMAIL_TOKEN_PREFIX));
  assert.equal(id.dsaVk.length, 1952);
  assert.equal(id.kemEk.length, 1184);

  const backup = createIdentityBackupJson(id.alias, id.seeds, "Radica test backup");
  assert.equal(backup.version, 2);
  assert.equal(backup.alias, "scobru");
  assert.equal(backup.description, "Radica test backup");
  assert.equal(backup.keys.ml_dsa_seed.length, 32);
  assert.equal(backup.keys.ml_kem_seed.length, 64);
});

test("freenetMail: derives 44-char native Freenet Mail inbox address and BIP-39 fingerprint words", () => {
  const masterSecret = new Uint8Array(32);
  for (let i = 0; i < 32; i++) masterSecret[i] = 42 + i;

  const id = deriveMailIdentity("alice", masterSecret);

  // 1. Native inbox address is 43..44 Base58 characters
  assert.ok(id.inboxAddress);
  assert.ok(id.inboxAddress.length >= 43 && id.inboxAddress.length <= 44);
  assert.match(id.inboxAddress, /^[1-9A-HJ-NP-Za-km-z]{43,44}$/);

  // 2. Direct deriveInboxContractAddress produces the same result
  const directInbox = deriveInboxContractAddress(id.dsaVk);
  assert.equal(directInbox, id.inboxAddress);

  // 3. Fingerprint words (6 BIP-39 words)
  assert.equal(id.fingerprintWords.length, 6);
  assert.ok(id.fingerprintWords.every((w) => typeof w === "string" && w.length >= 3));

  // Short key is 3 words separated by dashes (matching native Freemail footer)
  assert.equal(id.fingerprintShort.split("-").length, 3);
  assert.equal(id.fingerprintShort, `${id.fingerprintWords[0]}-${id.fingerprintWords[1]}-${id.fingerprintWords[2]}`);

  // Full key is 6 words
  assert.equal(id.fingerprintFull.split("-").length, 6);
  assert.equal(id.fingerprintFull, id.fingerprintWords.join("-"));

  // 4. Contact card token format
  const card = formatContactCard(id.inboxAddress, id.fingerprintFull);
  assert.equal(card, `${id.inboxAddress}\nverify: ${id.fingerprintFull}`);
  assert.equal(id.contactCard, card);
});

test("freenetMail: encryptFreenetMailV1 and decryptFreenetMailV1 wire format roundtrip", () => {
  const aliceSecret = new Uint8Array(32).fill(11);
  const bobSecret = new Uint8Array(32).fill(22);

  const alice = deriveMailIdentity("alice", aliceSecret);
  const bob = deriveMailIdentity("bob", bobSecret);

  const subject = "Decentralized Greetings";
  const content = "Hello Bob, this is an ML-KEM-768 / ML-DSA-65 encrypted message.";

  // Alice encrypts for Bob's native inbox
  const { deltaJson, assignmentHash } = encryptFreenetMailV1(
    bob.kemEk,
    alice.dsaSk,
    alice.dsaVk,
    bob.inboxAddress,
    subject,
    content,
    alice.alias
  );

  assert.ok(assignmentHash instanceof Uint8Array);
  assert.equal(assignmentHash.length, 32);

  const delta = JSON.parse(deltaJson);
  assert.ok(delta.AddMessages);
  assert.equal(delta.AddMessages.messages.length, 1);

  const wireMsg = delta.AddMessages.messages[0];
  assert.ok(Array.isArray(wireMsg.content));
  assert.ok(wireMsg.content.length > 24 + 1088);
  assert.ok(Array.isArray(wireMsg.sender_vk));
  assert.equal(wireMsg.sender_vk.length, 1952);
  assert.ok(Array.isArray(wireMsg.signature));

  // Bob decrypts with his private KEM key
  const decrypted = decryptFreenetMailV1(bob.kemDk, new Uint8Array(wireMsg.content));
  assert.ok(decrypted);
  assert.equal(decrypted.title, subject);
  assert.equal(decrypted.content, content);
  assert.equal(decrypted.from, alice.alias);
});
