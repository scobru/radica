// Freenet Mail interoperability for Radica personas:
// - Deterministic derivation of ML-DSA-65 (signing) and ML-KEM-768 (decryption) seeds from the persona's 32-byte master key
// - Official recovery key encoding & decoding (`fmail-key-1:<base58>`)
// - Address derivation (`name@<36-char base58>`)
// - Backup file export (.json) compatible with the official Freenet Mail Dioxus client (`testdata/identity-backup-v2.json`)

import { blake3 } from "@noble/hashes/blake3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { toBase58, fromBase58 } from "./whoiam.ts";

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

const enc = new TextEncoder();

export interface FreenetMailSeeds {
  mlDsaSeed: Uint8Array;
  mlKemSeed: Uint8Array;
}

export interface FreenetMailIdentity {
  alias: string;
  address: string;
  recoveryKey: string;
  seeds: FreenetMailSeeds;
  dsaVk: Uint8Array;
  kemEk: Uint8Array;
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

/**
 * Derive full mail identity (address, public keys, recovery key, backup JSON) from persona.
 */
export function deriveMailIdentity(alias: string, masterSecret: Uint8Array): FreenetMailIdentity {
  const seeds = deriveMailSeeds(masterSecret);
  const dsaKeys = ml_dsa65.keygen(seeds.mlDsaSeed);
  const kemKeys = ml_kem768.keygen(seeds.mlKemSeed);

  const addr24 = rawAddressOf(dsaKeys.publicKey);
  const address = formatAddress(addr24);
  const recoveryKey = encodeRecoveryKey(seeds.mlDsaSeed, seeds.mlKemSeed);

  return {
    alias,
    address,
    recoveryKey,
    seeds,
    dsaVk: dsaKeys.publicKey,
    kemEk: kemKeys.publicKey,
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
