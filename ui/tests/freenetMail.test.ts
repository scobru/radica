import test from "node:test";
import assert from "node:assert/strict";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import {
  deriveMailSeeds,
  encodeRecoveryKey,
  decodeRecoveryKey,
  deriveMailAddress,
  deriveMailIdentity,
  createIdentityBackupJson,
  deriveInboxContractAddress,
  deriveTokenRecordContractAddress,
  deriveFingerprintWords,
  formatContactCard,
  encryptFreenetMailV1,
  decryptFreenetMailV1,
  isValidAftSlot,
  buildAftSignatureContent,
  FMAIL_TOKEN_PREFIX,
} from "../src/freenetMail.ts";
import {
  normalizeMailAddress,
  resolveFreemailSenderAddress,
  syncFreenetMailInbox,
  sendMailMessage,
  loadMailStore,
  saveMailStore,
} from "../src/mailClient.ts";

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

test("freenetMail: encryptFreenetMailV1 emits flat to array, signed Min10 AFT assignment & allocation record, and avoids slot collisions", async () => {
  const { ml_dsa65: dsa65 } = await import("@noble/post-quantum/ml-dsa.js");
  const fmail = await import("../src/freenetMail.ts");

  const alice = fmail.deriveMailIdentity("alice", new Uint8Array(32).fill(0x11));
  const bob = fmail.deriveMailIdentity("bob", new Uint8Array(32).fill(0x22));
  const now = new Date("2026-11-14T12:03:00.000Z");

  const enc1 = fmail.encryptFreenetMailV1(
    bob.kemEk,
    alice.dsaSk,
    alice.dsaVk,
    bob.inboxAddress,
    "Native Freemail Interop",
    "Testing AFT Min10 + flat DecryptedMessage.to",
    alice.alias,
    { tier: "Min10", now },
  );

  // Delta wraps AddMessages message whose encrypted content decrypts with flat `to`
  const delta1 = JSON.parse(enc1.deltaJson);
  const msgs1 = Array.isArray(delta1.AddMessages) ? delta1.AddMessages : delta1.AddMessages?.messages;
  assert.ok(Array.isArray(msgs1) && msgs1.length === 1);
  const wireMsg1 = msgs1[0];
  assert.ok(Array.isArray(wireMsg1.sender_vk) && wireMsg1.sender_vk.length === alice.dsaVk.length);

  const decrypted = fmail.decryptFreenetMailV1(bob.kemDk, new Uint8Array(wireMsg1.content));
  assert.ok(decrypted);
  assert.equal(decrypted.from, alice.alias);
  assert.ok(Array.isArray(decrypted.to) && decrypted.to.length === 1);
  assert.deepEqual(Array.from(decrypted.to[0]), Array.from(bob.kemEk));

  // Derive TokenAllocationRecord contract and confirm assignment is registered under Min10
  const expectedRec = fmail.deriveTokenRecordContractAddress(alice.dsaVk);
  assert.equal(enc1.tokenRecordAddress, expectedRec.address);
  assert.deepEqual(Array.from(enc1.tokenRecordInstanceBytes), Array.from(expectedRec.instanceBytes));
  const allocRecord = JSON.parse(enc1.tokenAllocationRecordJson);
  assert.ok(Array.isArray(allocRecord.tokens_by_tier?.Min10));
  assert.equal(allocRecord.tokens_by_tier.Min10.length, 1);

  // Verify AFT assignment validity and 41-byte ML-DSA-65 signature
  const a1 = enc1.tokenAssignment;
  assert.equal(a1.tier, "Min10");
  const slot1 = new Date(a1.time_slot);
  assert.equal(fmail.isValidAftSlot(slot1, "Min10"), true);
  const sigContent1 = fmail.buildAftSignatureContent("Min10", slot1, enc1.assignmentHash);
  assert.equal(sigContent1.length, 41);
  assert.equal(dsa65.verify(new Uint8Array(a1.signature), sigContent1, alice.dsaVk), true);

  // Slot collision avoidance steps backward to a strictly earlier unused valid Min10 slot
  const enc2 = fmail.encryptFreenetMailV1(
    bob.kemEk,
    alice.dsaSk,
    alice.dsaVk,
    bob.inboxAddress,
    "Second Message",
    "Must step AFT slot",
    alice.alias,
    { tier: "Min10", existingAssignments: [enc1.tokenAssignment], now },
  );
  const slot2 = new Date(enc2.tokenAssignment.time_slot);
  assert.equal(fmail.isValidAftSlot(slot2, "Min10"), true);
  assert.ok(slot2.getTime() < slot1.getTime());
});

test("freenetMail: normalizeMailAddress and parseFmailContactInput strip single-line and multi-line verify tokens", async () => {
  const fmail = await import("../src/freenetMail.ts");
  const mailClient = await import("../src/mailClient.ts");

  const bob = fmail.deriveMailIdentity("bob", new Uint8Array(32).fill(0x22));
  const words = bob.fingerprintWords.join("-");

  // Multi-line Contact Card format
  const multilineCard = `${bob.inboxAddress}\nverify: ${words}`;
  assert.equal(mailClient.normalizeMailAddress(multilineCard), bob.inboxAddress);

  // Single-line collapsed format produced when pasted into <input type="text">
  const singlelineCard = `${bob.inboxAddress} verify: ${words}`;
  assert.equal(mailClient.normalizeMailAddress(singlelineCard), bob.inboxAddress);

  // With alias@ and fmail: prefixes
  assert.equal(
    mailClient.normalizeMailAddress(`bob@${bob.inboxAddress} verify: ${words}`),
    `bob@${bob.inboxAddress}`,
  );
  assert.equal(
    mailClient.normalizeMailAddress(`fmail:${bob.inboxAddress} verify: ${words}`),
    bob.inboxAddress,
  );

  const parsedSingle = mailClient.parseFmailContactInput(singlelineCard, "Bob");
  assert.ok(parsedSingle);
  assert.equal(parsedSingle.name, "Bob");
  assert.equal(parsedSingle.address, bob.inboxAddress);

  const parsedBracketed = mailClient.parseFmailContactInput(`Bob <${singlelineCard}>`);
  assert.ok(parsedBracketed);
  assert.equal(parsedBracketed.name, "Bob");
  assert.equal(parsedBracketed.address, bob.inboxAddress);
});

test("freenetMail: resolveFreemailSenderAddress and syncFreenetMailInbox derive user@<44-char> from sender_vk and repair existing bare entries", async () => {
  const fmail = await import("../src/freenetMail.ts");
  const mailClient = await import("../src/mailClient.ts");
  const { safeStorage } = await import("../src/storage.ts");

  const alice = fmail.deriveMailIdentity("user", new Uint8Array(32).fill(0x33));
  const bob = fmail.deriveMailIdentity("bob", new Uint8Array(32).fill(0x44));
  const bobPubkey = "44".repeat(32);

  // Direct helper unit check
  const resolved = mailClient.resolveFreemailSenderAddress("user", alice.dsaVk);
  assert.equal(resolved.fromAddress, `user@${alice.inboxAddress}`);
  assert.ok(resolved.fromDisplay.includes("user"));
  const unresolved = mailClient.resolveFreemailSenderAddress("user", null);
  assert.equal(unresolved.fromAddress, "user");

  // Encrypt native-style message where DecryptedMessage.from has only local alias "user"
  const enc = fmail.encryptFreenetMailV1(
    bob.kemEk,
    alice.dsaSk,
    alice.dsaVk,
    bob.inboxAddress,
    "From native Freemail",
    "Body from native frontend",
    "user",
    { tier: "Min10", now: new Date("2026-11-14T12:15:00.000Z") },
  );
  const delta = JSON.parse(enc.deltaJson);
  const wireMsg = (Array.isArray(delta.AddMessages) ? delta.AddMessages : delta.AddMessages?.messages)[0];

  const mockFreenet = {
    appContract: async (key: string) => {
      if (key !== bob.inboxAddress) return null;
      return new TextEncoder().encode(
        JSON.stringify({
          owner_ek_bytes: Array.from(bob.kemEk),
          messages: [wireMsg],
          settings: { minimum_tier: "Min10", allow_verified_skip_token: false },
        }),
      );
    },
  };

  const sync1 = await mailClient.syncFreenetMailInbox(bobPubkey, bob, mockFreenet as any);
  assert.equal(sync1.error, undefined);
  assert.equal(sync1.newCount, 1);

  const store1 = mailClient.loadMailStore(bobPubkey, bob);
  const syncedMsg = store1.messages.find((m) => m.folder === "inbox" && m.subject === "From native Freemail");
  assert.ok(syncedMsg);
  assert.equal(syncedMsg.fromAddress, `user@${alice.inboxAddress}`);

  // Simulate an older locally cached entry that stored bare "user", then verify resync repairs it in-place
  const mem: Map<string, string> = (safeStorage as any).mem;
  for (const [k, v] of mem.entries()) {
    if (k.includes(bobPubkey) && v.includes("From native Freemail")) {
      const parsed = JSON.parse(v);
      parsed.messages = parsed.messages.map((m: any) =>
        m.id === syncedMsg.id ? { ...m, from: "user", fromAddress: "user" } : m,
      );
      safeStorage.setItem(k, JSON.stringify(parsed));
    }
  }
  assert.equal(
    mailClient.loadMailStore(bobPubkey, bob).messages.find((m: any) => m.id === syncedMsg.id)?.fromAddress,
    "user",
  );

  await mailClient.syncFreenetMailInbox(bobPubkey, bob, mockFreenet as any);
  const repairedMsg = mailClient.loadMailStore(bobPubkey, bob).messages.find((m: any) => m.id === syncedMsg.id);
  assert.ok(repairedMsg);
  assert.equal(repairedMsg.fromAddress, `user@${alice.inboxAddress}`);
  safeStorage.flush();
});

test("freenetMail: sendMailMessage dispatches RelatedStateAndDeltaUpdate via updateAppContractWithRelated when given collapsed verify token", async () => {
  const fmail = await import("../src/freenetMail.ts");
  const mailClient = await import("../src/mailClient.ts");
  const { safeStorage } = await import("../src/storage.ts");

  const alicePubkey = "55".repeat(32);
  const alice = fmail.deriveMailIdentity("alice", new Uint8Array(32).fill(0x55));
  const bob = fmail.deriveMailIdentity("bob", new Uint8Array(32).fill(0x66));
  const collapsedToken = `${bob.inboxAddress} verify: ${bob.fingerprintWords.join("-")}`;

  const fetchedKeys: string[] = [];
  const relatedCalls: Array<{ key: unknown; relatedId: Uint8Array; relatedState: Uint8Array; delta: Uint8Array }> = [];
  const legacyCalls: Array<{ key: unknown; delta: Uint8Array }> = [];

  const mockFreenet = {
    appContract: async (key: string) => {
      fetchedKeys.push(key);
      if (key === bob.inboxAddress) {
        return new TextEncoder().encode(
          JSON.stringify({
            owner_ek_bytes: Array.from(bob.kemEk),
            messages: [],
            settings: { minimum_tier: "Min10", allow_verified_skip_token: false },
          }),
        );
      }
      return null;
    },
    updateAppContractWithRelated: async (
      key: unknown,
      relatedId: Uint8Array,
      relatedState: Uint8Array,
      delta: Uint8Array,
    ) => {
      relatedCalls.push({ key, relatedId, relatedState, delta });
      return true;
    },
    updateAppContract: async (key: unknown, delta: Uint8Array) => {
      legacyCalls.push({ key, delta });
      return true;
    },
  };

  await mailClient.sendMailMessage(
    alicePubkey,
    alice,
    collapsedToken,
    "Outbound to Native Freemail",
    "Hello via RelatedStateAndDeltaUpdate",
    undefined,
    undefined,
    mockFreenet as any,
  );

  assert.ok(fetchedKeys.includes(bob.inboxAddress));
  assert.equal(relatedCalls.length, 1);
  assert.equal(legacyCalls.length, 0);
  assert.ok(relatedCalls[0].key);
  const expectedRel = fmail.deriveTokenRecordContractAddress(alice.dsaVk);
  assert.deepEqual(Array.from(relatedCalls[0].relatedId), Array.from(expectedRel.instanceBytes));

  const alloc = JSON.parse(new TextDecoder().decode(relatedCalls[0].relatedState));
  assert.ok(Array.isArray(alloc.tokens_by_tier?.Min10) && alloc.tokens_by_tier.Min10.length === 1);

  const delta = JSON.parse(new TextDecoder().decode(relatedCalls[0].delta));
  const msgs = Array.isArray(delta.AddMessages) ? delta.AddMessages : delta.AddMessages?.messages;
  assert.ok(Array.isArray(msgs) && msgs.length === 1);
  assert.ok(msgs[0].token_assignment);
  const decrypted = fmail.decryptFreenetMailV1(bob.kemDk, new Uint8Array(msgs[0].content));
  assert.ok(decrypted);
  assert.equal(decrypted.title, "Outbound to Native Freemail");
  assert.ok(Array.isArray(decrypted.to) && decrypted.to.length === 1);
  assert.deepEqual(Array.from(decrypted.to[0]), Array.from(bob.kemEk));

  safeStorage.flush();
});
