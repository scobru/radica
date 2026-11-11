import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveMailSeeds,
  encodeRecoveryKey,
  decodeRecoveryKey,
  deriveMailAddress,
  deriveMailIdentity,
  createIdentityBackupJson,
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
