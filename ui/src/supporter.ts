// Radica Supporter Receipt & Donation Verification Engine.
// Enables offline, cryptographically verifiable proof-of-support for ETH and BTC donations.
// No external RPC calls or centralized services required; verifiable purely via Ed25519 against RADICA_MAINTAINER.

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { receiptMessageText } from "../../shared/protocol.js";
import { RADICA_MAINTAINER } from "./types.ts";
import { safeStorage } from "./storage.ts";
import { appPath, verifyProof, type Cert } from "./whoiam.ts";

// Ensure noble ed25519 uses sha512
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = (...m) => Promise.resolve(sha512(ed.etc.concatBytes(...m)));

const enc = new TextEncoder();
const dec = new TextDecoder();


export type SupporterTier = "sprout" | "root" | "oak";
export type SupportedChain = "eth" | "btc";

export interface SupporterReceipt {
  v: 1;
  donor_pk: string; // 64-char hex Ed25519 public key of the donor
  tier: SupporterTier; // "sprout" ($1+), "root" ($50+), "oak" ($250+)
  chain: SupportedChain; // "eth" | "btc"
  tx_hash: string; // Empty in new receipts: an on-chain tx hash would link donor_pk to the donor's wallet. Kept so old tokens still verify.
  ts: number; // Unix timestamp (milliseconds)
  sig: string; // Hex Ed25519 signature by RADICA_MAINTAINER, or by the app key `cert` delegates
  cert?: Cert; // Viso sign-in: RADICA_MAINTAINER's delegation of the signing app key to Radica
}

export interface SupporterBadge {
  tier: SupporterTier;
  chain: SupportedChain;
  label: string;
  icon: string;
  badgeClass: string;
  description: string;
}

/** Keys trusted to issue supporter receipts: the maintainer, later the attester bot(s) and backups. Any one is enough,
 *  so no single key is needed to keep receipts coming; drop a leaked key here to stop trusting it. */
export const RECEIPT_ISSUERS: readonly string[] = [
  RADICA_MAINTAINER,
  "f1701795fa6b4a2e367ce09980a82c8f896a7a00a413f863502838789acb0830", // attester bot (attester/, CapRover)
];

export const TOKEN_PREFIX = "RADICA-RECEIPT-V1:";

/** Canonical UTF-8 message string for deterministic signature generation and verification. */
export function receiptMessage(r: {
  donor_pk: string;
  tier: SupporterTier;
  chain: SupportedChain;
  tx_hash: string;
  ts: number;
}): Uint8Array {
  return enc.encode(receiptMessageText(r));
}

/** Base64 helper supporting UTF-8 strings */
function toBase64(str: string): string {
  const bytes = enc.encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return dec.decode(bytes);
}

/** Serialize a SupporterReceipt into a single portable token string */
export function serializeReceipt(receipt: SupporterReceipt): string {
  return `${TOKEN_PREFIX}${toBase64(JSON.stringify(receipt))}`;
}

/** Parse a token string back into a SupporterReceipt without signature verification */
export function parseReceiptToken(token: string): SupporterReceipt {
  const trimmed = token.trim();
  if (!trimmed.startsWith(TOKEN_PREFIX)) {
    throw new Error(`Invalid receipt token prefix. Expected "${TOKEN_PREFIX}"`);
  }
  const rawJson = fromBase64(trimmed.slice(TOKEN_PREFIX.length));
  const parsed = JSON.parse(rawJson);

  if (
    parsed.v !== 1 ||
    typeof parsed.donor_pk !== "string" ||
    !["sprout", "root", "oak"].includes(parsed.tier) ||
    !["eth", "btc"].includes(parsed.chain) ||
    typeof parsed.tx_hash !== "string" ||
    typeof parsed.ts !== "number" ||
    typeof parsed.sig !== "string" ||
    (parsed.cert !== undefined &&
      (typeof parsed.cert?.base !== "string" ||
        typeof parsed.cert.challenge !== "string" ||
        typeof parsed.cert.ts !== "number" ||
        typeof parsed.cert.sig !== "string"))
  ) {
    throw new Error("Receipt format invalid or missing required fields");
  }

  return {
    v: 1,
    donor_pk: parsed.donor_pk.toLowerCase(),
    tier: parsed.tier,
    chain: parsed.chain,
    tx_hash: parsed.tx_hash.toLowerCase(),
    ts: parsed.ts,
    sig: parsed.sig.toLowerCase(),
    ...(parsed.cert && { cert: parsed.cert }),
  };
}

/**
 * Sign and issue a new SupporterReceipt.
 * `signerSk`: the maintainer's own Ed25519 secret key, or (Viso sign-in) the app key that `cert` delegates.
 * The maintainer checks the donation tx before signing; the tx is never embedded in the receipt.
 */
export async function issueReceipt(
  signerSk: Uint8Array,
  donorPk: string,
  tier: SupporterTier,
  chain: SupportedChain,
  ts: number = Date.now(),
  cert?: Cert
): Promise<string> {
  const payload = {
    donor_pk: donorPk.trim().toLowerCase(),
    tier,
    chain,
    tx_hash: "",
    ts,
  };

  const msg = receiptMessage(payload);
  const sigBytes = await ed.signAsync(msg, signerSk);
  const sig = ed.etc.bytesToHex(sigBytes);

  const receipt: SupporterReceipt = {
    v: 1,
    ...payload,
    sig,
    ...(cert && { cert }),
  };

  return serializeReceipt(receipt);
}

const verifiedReceiptCache = new Map<string, Promise<{ receipt?: SupporterReceipt; parseErr?: Error; sigErr?: Error }>>();

/**
 * Verifies a supporter receipt token completely offline against the trusted issuer keys.
 * Optional `expectedDonorPk`: if provided, ensures the receipt matches the active user's persona.
 */
export async function verifyReceipt(
  token: string,
  expectedDonorPk?: string,
  issuers: string | readonly string[] = RECEIPT_ISSUERS,
  app: string = appPath()
): Promise<SupporterReceipt> {
  const trusted = [issuers].flat();
  const cacheKey = `${token.trim()}|${trusted.join(",")}|${app}`;
  let pending = verifiedReceiptCache.get(cacheKey);
  if (!pending) {
    pending = (async (): Promise<{ receipt?: SupporterReceipt; parseErr?: Error; sigErr?: Error }> => {
      let receipt: SupporterReceipt;
      try {
        receipt = parseReceiptToken(token);
      } catch (e) {
        return { parseErr: e instanceof Error ? e : new Error(String(e)) };
      }

      let signers = trusted;
      if (receipt.cert) {
        // like the contracts: the delegation must be a trusted issuer's and bound to Radica's own path, not another app's
        const c = receipt.cert;
        const certApp = URL.canParse(c.base) ? new URL(c.base).pathname.replace(/\/+$/, "") : null;
        let delegatedByIssuer = false;
        if (app && certApp === app.replace(/\/+$/, ""))
          for (const pk of trusted) if ((delegatedByIssuer = await verifyProof({ ...c, pk }))) break;
        if (!delegatedByIssuer) {
          return { receipt, sigErr: new Error("Invalid maintainer delegation: receipt was not signed by the Radica maintainer.") };
        }
        signers = [c.challenge.split(".")[1] ?? ""];
      }

      const msg = receiptMessage(receipt);
      let isValid = false;
      for (const pk of signers) {
        try {
          if ((isValid = await ed.verifyAsync(ed.etc.hexToBytes(receipt.sig), msg, ed.etc.hexToBytes(pk)))) break;
        } catch {}
      }
      if (!isValid) {
        return { receipt, sigErr: new Error("Invalid cryptographic signature: receipt was not signed by the Radica maintainer.") };
      }

      return { receipt };
    })();
    if (verifiedReceiptCache.size >= 2048) verifiedReceiptCache.clear();
    verifiedReceiptCache.set(cacheKey, pending);
  }

  const { receipt, parseErr, sigErr } = await pending;
  if (parseErr || !receipt) throw parseErr ?? new Error("Receipt format invalid");
  if (expectedDonorPk && receipt.donor_pk !== expectedDonorPk.trim().toLowerCase()) {
    throw new Error(
      `Receipt belongs to another identity (@${receipt.donor_pk.slice(0, 8)}...), not your current identity.`
    );
  }
  if (sigErr) throw sigErr;
  return receipt;
}

/** The public supporters wall by tier: each author's token must be a valid receipt for that same author. */
export async function foldSupporters(
  entries: { author: string; token: string | null }[],
  issuers: string | readonly string[] = RECEIPT_ISSUERS,
  app: string = appPath()
): Promise<Record<SupporterTier, string[]>> {
  const wall: Record<SupporterTier, string[]> = { oak: [], root: [], sprout: [] };
  for (const { author, token } of entries) {
    if (!token) continue;
    try {
      wall[(await verifyReceipt(token, author, issuers, app)).tier].push(author);
    } catch {} // forged, someone else's, or malformed: not shown
  }
  return wall;
}


/** Storage key for active user's supporter receipt */
export const supporterStorageKey = (pubkey: string) => `radica_supporter_receipt_${pubkey.toLowerCase()}`;

/** Retrieve stored receipt from safeStorage */
export function getStoredReceipt(pubkey: string): SupporterReceipt | null {
  if (!pubkey) return null;
  const raw = safeStorage.getItem(supporterStorageKey(pubkey));
  if (!raw) return null;
  try {
    return parseReceiptToken(raw);
  } catch {
    return null;
  }
}

/** Receipt tokens the reader removed, so the attester's copy on the network is not adopted again (same prefix: durable). */
const removedReceiptsKey = (pubkey: string) => `radica_supporter_receipt_removed_${pubkey.toLowerCase()}`;
const removedReceipts = (pubkey: string): string[] => {
  try {
    return JSON.parse(safeStorage.getItem(removedReceiptsKey(pubkey)) || "[]");
  } catch {
    return [];
  }
};
export const isReceiptRemoved = (token: string, pubkey: string) => removedReceipts(pubkey).includes(token.trim());
/** Asking for the badge again (a receipt pasted, a proof sent) undoes a removal. */
export const unremoveReceipts = (pubkey: string) => safeStorage.removeItem(removedReceiptsKey(pubkey));

/** Store a verified receipt token in safeStorage (pasting one again undoes a removal) */
export function saveStoredReceipt(receiptToken: string, pubkey: string): void {
  safeStorage.setItem(supporterStorageKey(pubkey), receiptToken.trim());
  unremoveReceipts(pubkey);
}

/** Remove the stored receipt and remember it, with `alsoTokens` (the attester's copies), as removed */
export function clearStoredReceipt(pubkey: string, alsoTokens: string[] = []): void {
  const stored = safeStorage.getItem(supporterStorageKey(pubkey));
  const removed = new Set([...removedReceipts(pubkey), ...alsoTokens.map((t) => t.trim()), ...(stored ? [stored.trim()] : [])]);
  safeStorage.setItem(removedReceiptsKey(pubkey), JSON.stringify([...removed]));
  safeStorage.removeItem(supporterStorageKey(pubkey));
}

/** Generate badge UI metadata from a verified receipt */
export function supporterBadge(receipt: SupporterReceipt): SupporterBadge {

  if (receipt.tier === "oak") {
    return {
      tier: "oak",
      chain: receipt.chain,
      label: "Oak Supporter",
      icon: "🌳",
      badgeClass: "badge-supporter-oak",
      description: "Radica Pillar Sponsor — Verified Development Backer",
    };
  }

  if (receipt.tier === "root") {
    return {
      tier: "root",
      chain: receipt.chain,
      label: "Root Supporter",
      icon: "🌿",
      badgeClass: "badge-supporter-root",
      description: "Core Root Supporter — Verified Development Backer",
    };
  }

  return {
    tier: "sprout",
    chain: receipt.chain,
    label: "Sprout Supporter",
    icon: "🌱",
    badgeClass: "badge-supporter-sprout",
    description: "Community Supporter — Verified Development Backer",
  };
}
