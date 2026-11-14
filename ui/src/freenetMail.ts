// Freenet Mail interoperability for Radica personas:
// - Deterministic derivation of ML-DSA-65 (signing) and ML-KEM-768 (decryption) seeds from the persona's 32-byte master key
// - Official recovery key encoding & decoding (`fmail-key-1:<base58>`)
// - Address derivation (`name@<36-char base58>`)
// - Backup file export (.json) compatible with the official Freenet Mail Dioxus client (`testdata/identity-backup-v2.json`)

import { blake3 } from "@noble/hashes/blake3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { toBase58, fromBase58 } from "./whoiam.ts";
import { BIP39_WORDLIST } from "./bip39Words.ts";

export const FMAIL_TOKEN_PREFIX = "fmail-key-1:";
export const FMAIL_PREFIX_STEM = "fmail-key-";
export const FMAIL_PAYLOAD_VERSION = 1;
export const ML_DSA_SEED_LEN = 32;
export const ML_KEM_SEED_LEN = 64;
export const CHECKSUM_LEN = 4;
export const BODY_LEN = 1 + ML_DSA_SEED_LEN + ML_KEM_SEED_LEN; // 97 bytes
export const PAYLOAD_LEN = BODY_LEN + CHECKSUM_LEN; // 101 bytes
export const ADDRESS_CHARS = 36;

export const ADDRESS_CONTEXT = "freenet-mail address v1";
export const CHECK_CONTEXT = "freenet-mail address check v1";

/** Stable container contract ID of the official Freenet Mail app. */
export const FREENET_MAIL_CONTAINER_KEY = "122f6AR7PyF8d8mhczuNQM4xrLtBf5t8g2iB7PEVT7KC";
/** Candidate inbox-v2 contract code hash. */
export const INBOX_V2_CODE_HASH = "GpuWR879xBi13sSeDhoT1zNzEhVmMBFSEr1aoJGCc8a6";
/** Official inbox v1 contract code hash (shipped in v0.2.7 and v1). */
export const INBOX_V1_CODE_HASH = "Av3KF7WSod8E5qkABKWDYenhPkF246rC5aUMcHZ3Frdc";
/** Official AFT token-allocation-record contract code hash (published v1). */
export const TOKEN_RECORD_V1_CODE_HASH = "4cLK44213nxHtt9pCZQgQkPg6sXGukcYojjRt6k1oEev";

export type AftTier =
  | "Min1"
  | "Min5"
  | "Min10"
  | "Min30"
  | "Hour1"
  | "Hour3"
  | "Hour6"
  | "Hour12"
  | "Day1"
  | "Day7"
  | "Day15"
  | "Day30"
  | "Day90"
  | "Day180"
  | "Day365";

export const AFT_TIERS: readonly AftTier[] = [
  "Min1",
  "Min5",
  "Min10",
  "Min30",
  "Hour1",
  "Hour3",
  "Hour6",
  "Hour12",
  "Day1",
  "Day7",
  "Day15",
  "Day30",
  "Day90",
  "Day180",
  "Day365",
];

export interface AftTokenAssignment {
  tier: AftTier;
  time_slot: string;
  generator: number[];
  signature: number[];
  assignment_hash: number[];
  token_record: number[];
}

export interface EncryptFreenetMailOptions {
  tier?: AftTier;
  existingAssignments?: AftTokenAssignment[];
  now?: Date;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface FreenetMailSeeds {
  mlDsaSeed: Uint8Array;
  mlKemSeed: Uint8Array;
}

export interface FreenetMailIdentity {
  alias: string;
  address: string; // 36-char v2 address
  inboxAddress: string; // 44-char native Freenet Mail contract instance ID
  fingerprintWords: string[]; // 6 BIP-39 fingerprint words
  fingerprintShort: string; // first 3 words, e.g. "pear-young-final"
  fingerprintFull: string; // all 6 words joined by "-"
  contactCard: string; // `${inboxAddress}\nverify: ${fingerprintFull}`
  recoveryKey: string;
  seeds: FreenetMailSeeds;
  dsaVk: Uint8Array;
  dsaSk: Uint8Array;
  kemEk: Uint8Array;
  kemDk: Uint8Array;
}

export interface FreenetMailBackupJson {
  version: number;
  alias: string;
  description: string;
  keys: {
    ml_dsa_seed: number[];
    ml_kem_seed: number[];
  };
}

/**
 * Deterministically derive ML-DSA-65 and ML-KEM-768 seeds from a 32-byte persona master secret.
 */
export function deriveMailSeeds(masterSecret: Uint8Array): FreenetMailSeeds {
  if (!masterSecret || masterSecret.length < 32) {
    throw new Error("Master secret must be at least 32 bytes");
  }
  const seed32 = masterSecret.slice(0, 32);

  // Derive 32 bytes for ML-DSA-65
  const mlDsaSeed = blake3(seed32, {
    context: enc.encode("freenet-mail ml-dsa-65 seed v1"),
  }).slice(0, 32);

  // Derive 64 bytes for ML-KEM-768 (32 bytes d + 32 bytes z)
  const d = blake3(seed32, {
    context: enc.encode("freenet-mail ml-kem-768 seed v1 d"),
  }).slice(0, 32);
  const z = blake3(seed32, {
    context: enc.encode("freenet-mail ml-kem-768 seed v1 z"),
  }).slice(0, 32);

  const mlKemSeed = new Uint8Array(64);
  mlKemSeed.set(d, 0);
  mlKemSeed.set(z, 32);

  return { mlDsaSeed, mlKemSeed };
}

/**
 * 4-byte checksum over body: SHA-256("fmail-key-1:" || body)[0..4].
 */
export function recoveryKeyChecksum(body: Uint8Array): Uint8Array {
  const prefix = enc.encode(FMAIL_TOKEN_PREFIX);
  const data = new Uint8Array(prefix.length + body.length);
  data.set(prefix, 0);
  data.set(body, prefix.length);
  return sha256(data).slice(0, CHECKSUM_LEN);
}

/**
 * Encode seeds into the official single-line `fmail-key-1:<base58>` recovery key.
 */
export function encodeRecoveryKey(dsaSeed: Uint8Array, kemSeed: Uint8Array): string {
  if (dsaSeed.length !== ML_DSA_SEED_LEN) {
    throw new Error(`ml_dsa_seed must be ${ML_DSA_SEED_LEN} bytes, got ${dsaSeed.length}`);
  }
  if (kemSeed.length !== ML_KEM_SEED_LEN) {
    throw new Error(`ml_kem_seed must be ${ML_KEM_SEED_LEN} bytes, got ${kemSeed.length}`);
  }

  const body = new Uint8Array(BODY_LEN);
  body[0] = FMAIL_PAYLOAD_VERSION;
  body.set(dsaSeed, 1);
  body.set(kemSeed, 1 + ML_DSA_SEED_LEN);

  const sum = recoveryKeyChecksum(body);
  const payload = new Uint8Array(PAYLOAD_LEN);
  payload.set(body, 0);
  payload.set(sum, BODY_LEN);

  return `${FMAIL_TOKEN_PREFIX}${toBase58(payload)}`;
}

/**
 * Decode an `fmail-key-1:...` token back into seeds.
 */
export function decodeRecoveryKey(text: string): FreenetMailSeeds {
  const compact = text.replace(/\s+/g, "");
  if (!compact) throw new Error("Empty recovery key");

  const lower = compact.toLowerCase();
  if (!lower.startsWith(FMAIL_TOKEN_PREFIX)) {
    if (lower.startsWith(FMAIL_PREFIX_STEM)) {
      const match = compact.match(/^fmail-key-(\d+):/i);
      if (match) throw new Error(`Unsupported recovery key version: ${match[1]}`);
    }
    throw new Error(`Invalid prefix. Recovery keys start with "${FMAIL_TOKEN_PREFIX}"`);
  }

  const encoded = compact.slice(FMAIL_TOKEN_PREFIX.length);
  const payload = fromBase58(encoded);
  if (payload.length !== PAYLOAD_LEN) {
    throw new Error(`Invalid recovery key payload length: expected ${PAYLOAD_LEN}, got ${payload.length}`);
  }

  const body = payload.slice(0, BODY_LEN);
  const sum = payload.slice(BODY_LEN);
  const expectedSum = recoveryKeyChecksum(body);

  for (let i = 0; i < CHECKSUM_LEN; i++) {
    if (sum[i] !== expectedSum[i]) {
      throw new Error("Invalid recovery key checksum: characters may be corrupted");
    }
  }

  if (body[0] !== FMAIL_PAYLOAD_VERSION) {
    throw new Error(`Unsupported payload version: ${body[0]}`);
  }

  const mlDsaSeed = body.slice(1, 1 + ML_DSA_SEED_LEN);
  const mlKemSeed = body.slice(1 + ML_DSA_SEED_LEN);

  return { mlDsaSeed, mlKemSeed };
}

/**
 * Derive 24-byte raw address from ML-DSA verifying key.
 */
export function rawAddressOf(mlDsaVk: Uint8Array): Uint8Array {
  return blake3(mlDsaVk, { context: enc.encode(ADDRESS_CONTEXT) }).slice(0, 24);
}

/**
 * 2-byte BLAKE3 checksum for display address.
 */
export function check2Of(addr24: Uint8Array): Uint8Array {
  return blake3(addr24, { context: enc.encode(CHECK_CONTEXT) }).slice(0, 2);
}

/**
 * Derive the 36-character Base58 mail address string.
 */
export function formatAddress(addr24: Uint8Array): string {
  const check = check2Of(addr24);
  const full = new Uint8Array(26);
  full.set(addr24, 0);
  full.set(check, 24);

  const text = toBase58(full);
  return "1".repeat(Math.max(0, ADDRESS_CHARS - text.length)) + text;
}

/**
 * Derive 36-character address and verifying key from ML-DSA seed.
 */
export function deriveMailAddress(mlDsaSeed: Uint8Array): { address: string; dsaVk: Uint8Array } {
  const keys = ml_dsa65.keygen(mlDsaSeed);
  const addr24 = rawAddressOf(keys.publicKey);
  return { address: formatAddress(addr24), dsaVk: keys.publicKey };
}

function deriveContractInstanceFromJsonParams(
  codeHashB58: string,
  paramsObj: unknown
): { instanceBytes: Uint8Array; address: string; paramsBytes: Uint8Array } {
  const codeKey = fromBase58(codeHashB58);
  const paramsBytes = enc.encode(JSON.stringify(paramsObj));
  const buf = new Uint8Array(codeKey.length + paramsBytes.length);
  buf.set(codeKey, 0);
  buf.set(paramsBytes, codeKey.length);
  const instanceBytes = blake3(buf);
  return { instanceBytes, address: toBase58(instanceBytes), paramsBytes };
}

/**
 * Derive the 44-character Base58 native inbox contract instance ID for Freenet Mail (v0.2.7 / v1).
 * Matches freenet-email `inbox_key_for`:
 *   code_key = bs58::decode(INBOX_V1_CODE_HASH)
 *   params = serde_json::to_vec(&InboxParams { pub_key: dsaVk })
 *   contract_id = blake3(code_key || params)
 */
export function deriveInboxContractAddress(dsaVk: Uint8Array): string {
  return deriveContractInstanceFromJsonParams(INBOX_V1_CODE_HASH, {
    pub_key: Array.from(dsaVk),
  }).address;
}

/**
 * Derive the sender's deterministic AFT TokenAllocationRecord contract instance ID & key params
 * from their ML-DSA-65 verifying key (`TokenDelegateParameters { generator_public_key }`).
 */
export function deriveTokenRecordContractAddress(dsaVk: Uint8Array): {
  address: string;
  instanceBytes: Uint8Array;
  paramsBytes: Uint8Array;
} {
  return deriveContractInstanceFromJsonParams(TOKEN_RECORD_V1_CODE_HASH, {
    generator_public_key: Array.from(dsaVk),
  });
}

const AFT_TIER_SPEC: Record<AftTier, { unit: "minute" | "hour" | "day" | "yearDay"; step: number }> = {
  Min1: { unit: "minute", step: 1 },
  Min5: { unit: "minute", step: 5 },
  Min10: { unit: "minute", step: 10 },
  Min30: { unit: "minute", step: 30 },
  Hour1: { unit: "hour", step: 1 },
  Hour3: { unit: "hour", step: 3 },
  Hour6: { unit: "hour", step: 6 },
  Hour12: { unit: "hour", step: 12 },
  Day1: { unit: "day", step: 1 },
  Day7: { unit: "yearDay", step: 7 },
  Day15: { unit: "yearDay", step: 15 },
  Day30: { unit: "yearDay", step: 30 },
  Day90: { unit: "yearDay", step: 90 },
  Day180: { unit: "yearDay", step: 180 },
  Day365: { unit: "yearDay", step: 365 },
};

function aftDayIndexInYear(date: Date): number {
  const yearEndPrev = Date.UTC(date.getUTCFullYear() - 1, 11, 31);
  const dayMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((dayMs - yearEndPrev) / 86_400_000);
}

/** Check whether `date` matches `Tier::is_valid_slot` in `freenet-aft-interface`. */
export function isValidAftSlot(date: Date, tier: AftTier): boolean {
  const spec = AFT_TIER_SPEC[tier];
  if (date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) return false;
  if (spec.unit === "minute") return date.getUTCMinutes() % spec.step === 0;
  if (date.getUTCMinutes() !== 0) return false;
  if (spec.unit === "hour") return date.getUTCHours() % spec.step === 0;
  if (date.getUTCHours() !== 0) return false;
  if (spec.unit === "day") return true;
  return aftDayIndexInYear(date) % spec.step === 0;
}

/** Normalize `date` forward to the nearest valid AFT slot for `tier`. */
export function normalizeAftSlot(date: Date, tier: AftTier): Date {
  if (isValidAftSlot(date, tier)) return new Date(date.getTime());
  const d = new Date(date.getTime());
  const spec = AFT_TIER_SPEC[tier];
  if (spec.unit === "minute") {
    if (d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0) {
      d.setUTCSeconds(0, 0);
      d.setUTCMinutes(d.getUTCMinutes() + 1);
    }
    const rem = d.getUTCMinutes() % spec.step;
    if (rem !== 0) d.setUTCMinutes(d.getUTCMinutes() + (spec.step - rem));
    return d;
  }
  if (spec.unit === "hour") {
    if (d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0) {
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() + 1);
    }
    const rem = d.getUTCHours() % spec.step;
    if (rem !== 0) d.setUTCHours(d.getUTCHours() + (spec.step - rem));
    return d;
  }
  if (d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0) {
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  for (let i = 0; i < 400 && !isValidAftSlot(d, tier); i++) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

function stepBackwardAftSlot(slot: Date, tier: AftTier): Date {
  const d = new Date(slot.getTime());
  const spec = AFT_TIER_SPEC[tier];
  if (spec.unit === "minute") {
    d.setUTCMinutes(d.getUTCMinutes() - spec.step);
    return d;
  }
  if (spec.unit === "hour") {
    d.setUTCHours(d.getUTCHours() - spec.step);
    return d;
  }
  if (spec.unit === "day") {
    d.setUTCDate(d.getUTCDate() - 1);
    return d;
  }
  for (let i = 0; i < 400; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (isValidAftSlot(d, tier)) return d;
  }
  return d;
}

/** Find a valid, unused AFT time slot starting from `now` normalized for `tier` and stepping backward on collision. */
export function findFreeAftSlot(
  now: Date,
  tier: AftTier,
  usedSlotIsoOrMs?: Iterable<string | number>
): Date {
  const usedSeconds = new Set<number>();
  if (usedSlotIsoOrMs) {
    for (const item of usedSlotIsoOrMs) {
      const sec =
        typeof item === "number"
          ? Math.floor(item > 1e12 ? item / 1000 : item)
          : Math.floor(Date.parse(item) / 1000);
      if (Number.isFinite(sec)) usedSeconds.add(sec);
    }
  }
  let candidate = normalizeAftSlot(now, tier);
  for (let i = 0; i < 5000; i++) {
    if (!usedSeconds.has(Math.floor(candidate.getTime() / 1000))) return candidate;
    candidate = stepBackwardAftSlot(candidate, tier);
  }
  return candidate;
}

/**
 * Build the 41-byte binary message signed by ML-DSA-65 for `TokenAssignment::signature_content`:
 *   [0]      tier index (u8)
 *   [1..9]   unix timestamp in seconds (i64 little-endian)
 *   [9..41]  32-byte blake3 assignment_hash
 */
export function buildAftSignatureContent(
  tier: AftTier,
  slot: Date,
  assignmentHash: Uint8Array
): Uint8Array {
  const tierIdx = AFT_TIERS.indexOf(tier);
  if (tierIdx < 0) throw new Error(`Invalid AFT tier: ${tier}`);
  if (assignmentHash.length !== 32) {
    throw new Error(`Invalid assignment_hash length: expected 32, got ${assignmentHash.length}`);
  }
  const buf = new Uint8Array(41);
  buf[0] = tierIdx;
  const view = new DataView(buf.buffer);
  view.setBigInt64(1, BigInt(Math.floor(slot.getTime() / 1000)), true);
  buf.set(assignmentHash, 9);
  return buf;
}

/**
 * Derive the 6 BIP-39 words fingerprint matching Freenet Mail's `fingerprint_words(&vk, &ek)`.
 * The first 3 words form the short key display (e.g. `pear-young-final`).
 */
export function deriveFingerprintWords(
  dsaVk: Uint8Array,
  kemEk: Uint8Array
): { words: string[]; shortKey: string; fullKey: string } {
  const hasher = blake3.create({});
  hasher.update(dsaVk);
  hasher.update(kemEk);
  const hash = hasher.digest();

  let n = 0n;
  for (let i = 0; i < 12; i++) {
    n = (n << 8n) | BigInt(hash[i]);
  }
  const words: string[] = [];
  for (let i = 0; i < 6; i++) {
    const shift = BigInt(96 - 11 * (i + 1));
    const idx = Number((n >> shift) & 0x7ffn);
    words.push(BIP39_WORDLIST[idx] || "unknown");
  }

  const shortKey = `${words[0]}-${words[1]}-${words[2]}`;
  const fullKey = words.join("-");
  return { words, shortKey, fullKey };
}

/**
 * Build the standard Freenet Mail Contact Card token string.
 * Format: `<inbox_address>\nverify: <word1-word2-word3-word4-word5-word6>`
 */
export function formatContactCard(inboxAddress: string, fullKey: string): string {
  return `${inboxAddress}\nverify: ${fullKey}`;
}

/**
 * Encrypt and seal a message into Freenet Mail v1 wire format.
 * Matches `contracts/inbox` and `mail-delegate/crypto.rs` encrypt_v1 & seal_v1,
 * including a signed AFT `TokenAssignment` and `TokenAllocationRecord` state.
 */
export function encryptFreenetMailV1(
  recipientEk: Uint8Array,
  senderDsaSk: Uint8Array,
  senderDsaVk: Uint8Array,
  _recipientInboxContractId: string,
  subject: string,
  contentText: string,
  senderAlias: string,
  options?: EncryptFreenetMailOptions
): {
  deltaJson: string;
  assignmentHash: Uint8Array;
  tokenAssignment: AftTokenAssignment;
  tokenRecordInstanceBytes: Uint8Array;
  tokenRecordAddress: string;
  tokenAllocationRecordJson: string;
} {
  // Plaintext DecryptedMessage JSON (MlKemEncapsKey is a tuple newtype -> flat byte array)
  const msgObj = {
    title: subject.trim(),
    content: contentText.trim(),
    from: senderAlias,
    to: [Array.from(recipientEk)],
    cc: [],
    time: (options?.now ?? new Date()).toISOString(),
  };
  const plaintext = enc.encode(JSON.stringify(msgObj));

  // 1. ML-KEM-768 encapsulate
  const { cipherText: kemCt, sharedSecret } = ml_kem768.encapsulate(recipientEk);

  // 2. HKDF-SHA256 message key derivation (context: "freenet-email-v1 message-key")
  const msgKey = hkdf(sha256, sharedSecret, undefined, enc.encode("freenet-email-v1 message-key"), 32);

  // 3. XChaCha20-Poly1305 with random 24-byte nonce
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(24));
  const cipher = xchacha20poly1305(msgKey, nonce);
  const sealed = cipher.encrypt(plaintext);

  // 4. Assemble content layout: nonce (24) | kemCt (1088) | sealed
  const content = new Uint8Array(24 + kemCt.length + sealed.length);
  content.set(nonce, 0);
  content.set(kemCt, 24);
  content.set(sealed, 24 + kemCt.length);

  // 5. ML-DSA-65 detached signature over content
  const signature = ml_dsa65.sign(content, senderDsaSk);

  // 6. Token assignment hash (blake3 of content)
  const assignmentHash = blake3(content);

  // 7. Signed AFT TokenAssignment + TokenAllocationRecord matching recipient minimum_tier
  const tier: AftTier = options?.tier && AFT_TIERS.includes(options.tier) ? options.tier : "Min10";
  const tokenRecord = deriveTokenRecordContractAddress(senderDsaVk);
  const validExisting = (options?.existingAssignments ?? []).filter(
    (a): a is AftTokenAssignment =>
      !!a &&
      AFT_TIERS.includes(a.tier) &&
      Array.isArray(a.generator) &&
      a.generator.length === 1952 &&
      Array.isArray(a.signature) &&
      a.signature.length > 0 &&
      typeof a.time_slot === "string"
  );
  const usedSlotsForTier = validExisting.filter((a) => a.tier === tier).map((a) => a.time_slot);
  const slot = findFreeAftSlot(options?.now ?? new Date(), tier, usedSlotsForTier);
  const aftSigContent = buildAftSignatureContent(tier, slot, assignmentHash);
  const aftSignature = ml_dsa65.sign(aftSigContent, senderDsaSk);

  const tokenAssignment: AftTokenAssignment = {
    tier,
    time_slot: slot.toISOString().replace(/\.000Z$/, "Z"),
    generator: Array.from(senderDsaVk),
    signature: Array.from(aftSignature),
    assignment_hash: Array.from(assignmentHash),
    token_record: Array.from(tokenRecord.instanceBytes),
  };

  const tokens_by_tier: Record<string, AftTokenAssignment[]> = {};
  const seenSlots = new Set<string>();
  for (const a of [...validExisting, tokenAssignment]) {
    const dedupeKey = `${a.tier}:${Math.floor(Date.parse(a.time_slot) / 1000)}`;
    if (seenSlots.has(dedupeKey)) continue;
    seenSlots.add(dedupeKey);
    if (!tokens_by_tier[a.tier]) tokens_by_tier[a.tier] = [];
    tokens_by_tier[a.tier].push(a);
  }
  for (const list of Object.values(tokens_by_tier)) {
    list.sort((a, b) => Date.parse(a.time_slot) - Date.parse(b.time_slot));
  }

  const storedMessage = {
    content: Array.from(content),
    token_assignment: tokenAssignment,
    sender_vk: Array.from(senderDsaVk),
    signature: Array.from(signature),
  };

  const delta = {
    AddMessages: {
      messages: [storedMessage],
    },
  };

  return {
    deltaJson: JSON.stringify(delta),
    assignmentHash,
    tokenAssignment,
    tokenRecordInstanceBytes: tokenRecord.instanceBytes,
    tokenRecordAddress: tokenRecord.address,
    tokenAllocationRecordJson: JSON.stringify({ tokens_by_tier }),
  };
}

/**
 * Decrypt a Freenet Mail v1 encrypted message payload.
 */
export function decryptFreenetMailV1(
  myKemDk: Uint8Array,
  contentBytes: Uint8Array
): {
  title: string;
  content: string;
  from: string;
  to?: Uint8Array[];
  time: string;
  thread_id?: string;
  in_reply_to?: string;
  quoted_excerpt?: string;
} | null {
  if (contentBytes.length < 24 + 1088) return null;

  try {
    const nonce = contentBytes.slice(0, 24);
    const kemCt = contentBytes.slice(24, 24 + 1088);
    const sealed = contentBytes.slice(24 + 1088);

    const sharedSecret = ml_kem768.decapsulate(kemCt, myKemDk);
    const msgKey = hkdf(sha256, sharedSecret, undefined, enc.encode("freenet-email-v1 message-key"), 32);

    const cipher = xchacha20poly1305(msgKey, nonce);
    const plaintext = cipher.decrypt(sealed);
    const parsed = JSON.parse(dec.decode(plaintext));
    const parsedTo = Array.isArray(parsed.to)
      ? parsed.to.map((t: any) => (Array.isArray(t) ? new Uint8Array(t) : new Uint8Array(t?.[0] || [])))
      : undefined;

    return {
      title: parsed.title || "(No Subject)",
      content: parsed.content || "",
      from: parsed.from || "unknown",
      to: parsedTo,
      time: parsed.time || new Date().toISOString(),
      thread_id: parsed.thread_id,
      in_reply_to: parsed.in_reply_to,
      quoted_excerpt: parsed.quoted_excerpt,
    };
  } catch {
    return null;
  }
}

/**
 * Sanitize an email alias: alphanumeric, dash, dot, underscore, max 32 chars.
 */
export function sanitizeMailAlias(name: string): string {
  if (!name) return "";
  let clean = name.trim().toLowerCase().replace(/[\s\t\n]+/g, "_").replace(/[^a-z0-9_\-\.]/g, "");
  clean = clean.replace(/^[_\-\.]+|[_\-\.]+$/g, "");
  if (clean.length > 32) clean = clean.substring(0, 32);
  return clean;
}

/**
 * Derive full mail identity (address, public keys, recovery key, backup JSON) from persona.
 */
export function deriveMailIdentity(alias: string, masterSecret: Uint8Array): FreenetMailIdentity {
  const cleanAlias = sanitizeMailAlias(alias) || "radica";
  const seeds = deriveMailSeeds(masterSecret);
  const dsaKeys = ml_dsa65.keygen(seeds.mlDsaSeed);
  const kemKeys = ml_kem768.keygen(seeds.mlKemSeed);

  const addr24 = rawAddressOf(dsaKeys.publicKey);
  const address = formatAddress(addr24);
  const inboxAddress = deriveInboxContractAddress(dsaKeys.publicKey);
  const fp = deriveFingerprintWords(dsaKeys.publicKey, kemKeys.publicKey);
  const contactCard = formatContactCard(inboxAddress, fp.fullKey);
  const recoveryKey = encodeRecoveryKey(seeds.mlDsaSeed, seeds.mlKemSeed);

  return {
    alias: cleanAlias,
    address,
    inboxAddress,
    fingerprintWords: fp.words,
    fingerprintShort: fp.shortKey,
    fingerprintFull: fp.fullKey,
    contactCard,
    recoveryKey,
    seeds,
    dsaVk: dsaKeys.publicKey,
    dsaSk: dsaKeys.secretKey,
    kemEk: kemKeys.publicKey,
    kemDk: kemKeys.secretKey,
  };
}

/**
 * Build exportable JSON object matching Freenet Mail's identity-backup-v2.json.
 */
export function createIdentityBackupJson(
  alias: string,
  seeds: FreenetMailSeeds,
  description = "Exported from Radica"
): FreenetMailBackupJson {
  return {
    version: 2,
    alias,
    description,
    keys: {
      ml_dsa_seed: Array.from(seeds.mlDsaSeed),
      ml_kem_seed: Array.from(seeds.mlKemSeed),
    },
  };
}

/**
 * Trigger a browser file download of the identity backup JSON.
 */
export function downloadIdentityBackup(alias: string, seeds: FreenetMailSeeds, description?: string): void {
  const json = createIdentityBackupJson(alias, seeds, description);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `freenet-mail-backup-${alias || "identity"}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
