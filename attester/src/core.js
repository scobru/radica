// The attester's decisions and signatures, with no network: Freenet and the chain are passed in, so tests run offline.
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { stringToHex } from "viem";
import { decodeProofToken, pubkeyOf, SCOPE } from "../../donate-app/src/lib.js";
import {
  LOG_POW_BITS,
  leadingZeroBits,
  logEntryMessage as sharedLogEntryMessage,
  logEntryMessage2 as sharedLogEntryMessage2,
  receiptMessageText,
} from "../../shared/protocol.js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const enc = new TextEncoder();
export const CLAIMS_LOG = "supporter-claims";
export const RECEIPTS_LOG = "supporter-receipts";
/** Semaphore turns a non-numeric string scope into its bytes32 encoding (ethers encodeBytes32String). */
export const SCOPE_FIELD = BigInt(stringToHex(SCOPE, { size: 32 })).toString();

/** Log entry signature: must match log-contract entry_msg and ui/src/crypto.ts formatLogEntryMessage. */
export const logEntryMessage = sharedLogEntryMessage;

/** v2 log entry message: must match log-contract entry_msg2 and ui/src/crypto.ts logMsg2. */
export function logEntryMessage2(log, app, author, id, ts, body, nonce) {
  return sharedLogEntryMessage2(log, app, author, id, ts, bytesToHex(blake3(enc.encode(body))), nonce);
}

const POW_BITS = LOG_POW_BITS; // log-contract POW_BITS: leading zero bits of BLAKE3(message), from everyone but a log's owner
function powBits(msg) {
  return leadingZeroBits(blake3(enc.encode(msg)));
}

export async function signEntry(sk, log, app, bodyObj, now = Date.now()) {
  const author = bytesToHex(await ed.getPublicKeyAsync(sk));
  const id = now.toString(36) + bytesToHex(crypto.getRandomValues(new Uint8Array(3)));
  const body = JSON.stringify(bodyObj);
  let nonce = 0;
  if (log.split("/").pop() !== author) while (powBits(logEntryMessage2(log, app, author, id, now, body, nonce)) < POW_BITS) nonce++;
  const sig = bytesToHex(await ed.signAsync(enc.encode(logEntryMessage2(log, app, author, id, now, body, nonce)), sk));
  return { author, id, ts: now, body, sig, v: 2, nonce };
}

/** Supporter receipt token: must match ui/src/supporter.ts issueReceipt (no tx hash, day-rounded time). */
export async function issueReceipt(sk, donorPk, tier, now = Date.now()) {
  const ts = Math.floor(now / 864e5) * 864e5;
  const payload = { donor_pk: donorPk.toLowerCase(), tier, chain: "eth", tx_hash: "", ts };
  const msg = receiptMessageText(payload);
  const sig = bytesToHex(await ed.signAsync(enc.encode(msg), sk));
  const json = JSON.stringify({ v: 1, ...payload, sig });
  return `RADICA-RECEIPT-V1:${btoa(String.fromCharCode(...enc.encode(json)))}`;
}

const UINT256_MAX_PLUS_1 = 1n << 256n;

/**
 * Canonical base-10 uint256 field element representation (`"0"` or `[1-9][0-9]*`, `< 2^256`).
 * Rejects padded `"077"`, hex `"0x..."`, whitespace, signs, and out-of-range values so
 * attacker formatting tricks cannot bypass `seen` nullifier deduplication.
 */
export function canonicalFieldStr(v) {
  if (typeof v === "bigint") {
    return v >= 0n && v < UINT256_MAX_PLUS_1 ? v.toString(10) : null;
  }
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v) || v < 0) return null;
    return BigInt(v).toString(10);
  }
  if (typeof v === "string") {
    if (!/^(0|[1-9][0-9]*)$/.test(v)) return null;
    const n = BigInt(v);
    return n < UINT256_MAX_PLUS_1 ? n.toString(10) : null;
  }
  return null;
}

/**
 * Decide on one claim entry. `seen` maps canonical decimal nullifier -> pubkey already attested;
 * `verifyOnChain(groupId, proof)` asks the Semaphore contract. Returns `{ ok: true, donor, tier, nullifier }` or `{ ok: false, reason }`.
 */
export async function judgeClaim(entry, { chainId, contract, groups, seen, verifyOnChain }) {
  let claim;
  try {
    const body = JSON.parse(entry.body);
    if (body.type !== "claim" || typeof body.token !== "string") return { ok: false, reason: "not a claim" };
    claim = decodeProofToken(body.token);
  } catch (e) {
    return { ok: false, reason: `bad token: ${e.message}` };
  }
  const { proof, tier } = claim;
  if (!proof || typeof proof !== "object") return { ok: false, reason: "bad proof format" };
  if (claim.chainId !== chainId || String(claim.contract).toLowerCase() !== contract.toLowerCase()) return { ok: false, reason: "other chain or contract" };
  if (String(claim.groupId) !== String(groups[tier])) return { ok: false, reason: "group does not match tier" };

  const nullifier = canonicalFieldStr(proof.nullifier);
  if (!nullifier) return { ok: false, reason: "bad proof nullifier" };
  const merkleTreeRoot = canonicalFieldStr(proof.merkleTreeRoot);
  const message = canonicalFieldStr(proof.message);
  const scope = canonicalFieldStr(proof.scope);
  if (
    !Number.isInteger(proof.merkleTreeDepth) ||
    proof.merkleTreeDepth < 1 ||
    proof.merkleTreeDepth > 32 ||
    !merkleTreeRoot ||
    !message ||
    !scope ||
    !Array.isArray(proof.points) ||
    proof.points.length !== 8
  ) {
    return { ok: false, reason: "bad proof format" };
  }
  const points = [];
  for (const p of proof.points) {
    const c = canonicalFieldStr(p);
    if (!c) return { ok: false, reason: "bad proof format" };
    points.push(c);
  }

  if (scope !== SCOPE_FIELD) return { ok: false, reason: "wrong scope" };
  let donor;
  try {
    donor = pubkeyOf(message);
  } catch {
    return { ok: false, reason: "bad message" };
  }
  if (donor !== String(entry.author ?? "").toLowerCase()) return { ok: false, reason: "proof is for another Radica key" };
  const prior = seen.get(nullifier);
  if (prior && String(prior).toLowerCase() !== donor) return { ok: false, reason: "donation already attested for another key" };

  const canonicalProof = {
    merkleTreeDepth: proof.merkleTreeDepth,
    merkleTreeRoot,
    nullifier,
    message,
    scope,
    points,
  };
  if (!(await verifyOnChain(BigInt(claim.groupId), canonicalProof))) return { ok: false, reason: "proof rejected on-chain" };
  return { ok: true, donor, tier, nullifier };
}

export { bytesToHex, hexToBytes };
