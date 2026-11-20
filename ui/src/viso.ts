// A Viso persona's public profile (name and bio), read from the persona's own identity contract, as Viso's demo does.
// The node serving it is untrusted: the profile slot is shown only when its signature by the persona key checks out.
// Format: github.com/scobru/viso, docs/resources.md and common/src/state.rs.
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { blake3 } from "@noble/hashes/blake3.js";
import { bitsOf, challengeBytes, checkProof } from "./ante.ts";
import { fromBase58, toBase58 } from "./base58.ts";
import { asBytes, asNumber, asString, cborDecode, cborEncode, mapGet } from "./cbor.ts";
import { appPath } from "./whoiam.ts";

if (!ed.etc.sha512Sync) ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
if (!ed.etc.sha512Async) ed.etc.sha512Async = (...m) => Promise.resolve(sha512(ed.etc.concatBytes(...m)));

/** blake3 of Viso's identity_contract.wasm (ui/contracts, pinned in scripts/wasm-hashes.txt by its sha256 29aaf06a…).
 *  shortcut: a new Viso contract build moves every persona's address; update this hash with it. */
export const VISO_IDENTITY_CODE_HASH = "20ec0599f4b7c9f2e2d0034e26b8195eb2d02b8ccb791643f5751e75e2477a89";

const enc = new TextEncoder();
const hex = (h: string) => ed.etc.hexToBytes(h);
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const u32le = (n: number) => new Uint8Array(new Uint32Array([n]).buffer);
const u64le = (n: number) => new Uint8Array(new BigUint64Array([BigInt(n)]).buffer);

/** The contract's parameters, CBOR { version: 1, pubkey }: with the code hash they give the persona's address. */
export const visoIdentityParams = (pkHex: string) => cborEncode({ version: 1, pubkey: hex(pkHex) });

/** The persona's identity contract instance id: blake3(code hash || params), like any Freenet contract. */
export const visoIdentityInstance = (pkHex: string) => blake3(cat(hex(VISO_IDENTITY_CODE_HASH), visoIdentityParams(pkHex)));

/** The GhostKey proof a persona linked in Viso (its "ghostkey" slot), hex, or null. Not checked here: the proof is bound
 *  to the persona key on its own (see ghostkey.ts), so the slot's signature adds nothing. */
export function visoGhostkeyOf(state: Uint8Array): string | null {
  try {
    const s = cborDecode(state);
    if (mapGet(s, "destroyed") != null) return null;
    const b = asBytes(mapGet(mapGet(mapGet(s, "slots"), "ghostkey"), "bytes"));
    return b.length ? ed.etc.bytesToHex(b) : null;
  } catch {
    return null;
  }
}

/** A pinned Blind-RSA PoH issuer public key (matches `viso_core::poh::PohIssuer`). */
export interface PohIssuer {
  keyId: string;
  provider: string;
  tier: string;
  epoch: string;
  /** SubjectPublicKeyInfo (DER) hex of the RSA issuer public key. */
  spkiDerHex: string;
}

/** Verified Proof-of-Personhood attestation badge (matches `viso_core::poh::PohBadge`). */
export interface PohBadge {
  provider: string;
  tier: string;
  epoch: string;
  keyId: string;
}

/**
 * Trusted production Viso PoH issuers (`RSABSSA-SHA384-PSS-Randomized`, RFC 9474).
 * Synced alongside `viso_core::poh::POH_ISSUERS` via `viso/scripts/sync-poh-issuers.ps1`.
 */
// BEGIN VISO_POH_ISSUERS
export const VISO_POH_ISSUERS: readonly PohIssuer[] = [
  { keyId: "google:verified:2026", provider: "google", tier: "verified", epoch: "2026", spkiDerHex: "30820122300d06092a864886f70d01010105000382010f003082010a0282010100dbf4fabe185f56f849f054f2d56bb554a44f98c47cfdecee69c51fef125b052c68684fe8a1939136404734a092dfb5217edd23aa80f6c3355b6b3fd9a7e9e413c9778b7bbaf1037c37540b8458dc685c92e57aa37d89d219929f333e79ad98adf658ca19ee5feee906903f500414f7894009b225ddb5a88d38372260d04fe65786720c097278d8edb92c015879df988645459a838ee8cdb49c378606e09bc3f454710bab368641282135d408b444c7e91fb91d263e320edfef45a5791b7eb5d52f10d5c53c3e5de515f91ee3340e4fa4144f5ad64320db2bef17ff933b6ab440d12ca3e52a224af45892026783937b630dea73b09e15fc3a54f9382acd5362d70203010001" },
  { keyId: "github:age1y:2026", provider: "github", tier: "age1y", epoch: "2026", spkiDerHex: "30820122300d06092a864886f70d01010105000382010f003082010a0282010100d0670e59f5de85661c4d5b0ceff1e61ec25fa5710a41dd53a070c1caf817cf47b1e10a3f950802c32cb126481bfaa5f093fd80919e18f40f89a2375c198a70871b320b9faed46a0c1cf98c629d379c73e806f8b31742f10350b875a92909465b9b98fdf2c651bd609080d3eec4d6bbaa87bd5ed2c51164a4c77b1b38e5b70644906fa4eee9d55f7a791b048e9f50cad376ec5bb3919a764055f5c938c795a5d18dbf8523f773c8ed3e30bbbd850e6b16708a25ed75f4942d84f8973396eac8f820ea0f07c0a48a5912bbcd10f4e82fcbf96d565260c4329d4765f4420bc7a67ff7a1144fccdbfd11efb34b348332245171feae11ab9170e9c9cc237a0c7c2cff0203010001" },
];
// END VISO_POH_ISSUERS

const pohKeyCache = new Map<string, Promise<CryptoKey>>();

function importPohKey(keyId: string, spkiDerHex: string): Promise<CryptoKey> {
  const k = `${keyId}|${spkiDerHex}`;
  let p = pohKeyCache.get(k);
  if (!p) {
    p = globalThis.crypto.subtle.importKey(
      "spki",
      hex(spkiDerHex) as Uint8Array<ArrayBuffer>,
      { name: "RSA-PSS", hash: "SHA-384" },
      false,
      ["verify"],
    );
    pohKeyCache.set(k, p);
  }
  return p;
}

/** Domain-separated PoH message bound to `(keyId, pkHex)`: `"viso-poh-v1" || u32le(len) || keyId || pk32`. */
export function pohMsg(keyId: string, pkHex: string): Uint8Array {
  const pk = hex(pkHex);
  if (pk.length !== 32) throw new Error("expected 32-byte Ed25519 pubkey hex");
  const kb = enc.encode(keyId);
  return cat(enc.encode("viso-poh-v1"), u32le(kb.length), kb, pk);
}

/** Raw `poh:<provider>` slot bytes (CBOR `PohAttestationV1`), or null if absent, empty, or persona destroyed. */
export function visoPohRawOf(state: Uint8Array, slotName = "poh:github"): Uint8Array | null {
  try {
    const s = cborDecode(state);
    if (mapGet(s, "destroyed") != null) return null;
    const b = asBytes(mapGet(mapGet(mapGet(s, "slots"), slotName), "bytes"));
    return b.length ? b : null;
  } catch {
    return null;
  }
}

/** Verify a CBOR `PohAttestationV1` slot payload against `pkHex` and `issuers` via RFC 9474 RSABSSA-SHA384-PSS-Randomized. */
export async function verifyVisoPoh(
  attBytes: Uint8Array,
  pkHex: string,
  issuers: readonly PohIssuer[] = VISO_POH_ISSUERS,
): Promise<PohBadge | null> {
  try {
    if (!attBytes.length) return null;
    const att = cborDecode(attBytes);
    if (asNumber(mapGet(att, "version")) !== 1) return null;
    const keyId = asString(mapGet(att, "key_id"));
    const msgRandomizer = asBytes(mapGet(att, "msg_randomizer"));
    const sig = asBytes(mapGet(att, "sig"));
    if (!keyId || msgRandomizer.length !== 32 || !sig.length) return null;
    const issuer = issuers.find((i) => i.keyId === keyId);
    if (!issuer) return null;
    const cryptoKey = await importPohKey(issuer.keyId, issuer.spkiDerHex);
    const input = cat(msgRandomizer, pohMsg(keyId, pkHex));
    const ok = await globalThis.crypto.subtle.verify(
      { name: "RSA-PSS", saltLength: 48 },
      cryptoKey,
      sig as Uint8Array<ArrayBuffer>,
      input as Uint8Array<ArrayBuffer>,
    );
    return ok ? { provider: issuer.provider, tier: issuer.tier, epoch: issuer.epoch, keyId } : null;
  } catch {
    return null;
  }
}

/** Verified PoH badges (`poh:*` slots) in a Viso persona's identity contract state. */
export async function visoPohOf(
  state: Uint8Array,
  pkHex: string,
  issuers: readonly PohIssuer[] = VISO_POH_ISSUERS,
): Promise<PohBadge[]> {
  try {
    const s = cborDecode(state);
    if (mapGet(s, "destroyed") != null) return [];
    const slots = mapGet(s, "slots");
    if (!(slots instanceof Map)) return [];
    const out: PohBadge[] = [];
    for (const [k, v] of slots.entries()) {
      if (typeof k !== "string" || !k.startsWith("poh:")) continue;
      const bytes = asBytes(mapGet(v, "bytes"));
      if (!bytes.length) continue;
      const badge = await verifyVisoPoh(bytes, pkHex, issuers);
      if (badge) out.push(badge);
    }
    return out;
  } catch {
    return [];
  }
}

export interface PohLogEntry {
  author: string;
  proof: string | null;
  delegation?: DelegationProofV1 | null;
}

export interface StoredPohRecord {
  proof: string;
  delegation?: DelegationProofV1;
}

export interface DelegationProofV1 {
  version: number;
  from: string;
  to: string;
  scope: string;
  time_ms: number;
  sig_from: string;
  sig_to: string;
}

export interface VerifiedDelegation {
  fromHex: string;
  toHex: string;
  fromB58: string;
  toB58: string;
  scope: string;
  time_ms: number;
}

/** Parse a 32-byte Ed25519 pubkey encoded as base58 (preferred) or 64-char hex into lowercase hex. */
export function parseVisoPubkeyHex(s: string): string | null {
  try {
    const trimmed = s.trim();
    if (!trimmed) return null;
    const bytes = /^[0-9a-fA-F]{64}$/.test(trimmed) ? hex(trimmed.toLowerCase()) : fromBase58(trimmed);
    return bytes.length === 32 ? ed.etc.bytesToHex(bytes) : null;
  } catch {
    return null;
  }
}

export function isValidDelegationScope(scope: string): boolean {
  if (!scope || scope.length > 128) return false;
  for (let i = 0; i < scope.length; i++) {
    const c = scope.charCodeAt(i);
    if (c < 0x21 || c > 0x7e || c === 0x22 || c === 0x5c) return false;
  }
  return true;
}

export function delegationScopeMatches(scope: string, accepted: readonly string[] = ["*", "radica"]): boolean {
  if (!isValidDelegationScope(scope)) return false;
  if (accepted.includes(scope)) return true;
  if (!scope.startsWith("/v1/contract/web/") && !scope.startsWith("/v2/contract/web/")) return false;
  const cur = appPath().replace(/\/+$/, "");
  const expected = /^\/v[12]\/contract\/web\/[^/]+$/.test(cur)
    ? cur
    : "/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw";
  return scope.replace(/\/+$/, "") === expected;
}

/** Canonical Viso `DelegationProofV1` signed bytes: `"viso-delegation-v1" || from(32) || to(32) || u32le(len) || scope || u64le(time_ms)`. */
export function delegationMsg(fromBytes: Uint8Array, toBytes: Uint8Array, scope: string, timeMs: number): Uint8Array {
  const sb = enc.encode(scope);
  return cat(enc.encode("viso-delegation-v1"), fromBytes, toBytes, u32le(sb.length), sb, u64le(timeMs));
}

export function isDelegationProofShape(v: unknown): v is DelegationProofV1 {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.version === "number" &&
    typeof p.from === "string" &&
    typeof p.to === "string" &&
    typeof p.scope === "string" &&
    typeof p.time_ms === "number" &&
    typeof p.sig_from === "string" &&
    typeof p.sig_to === "string"
  );
}

/** Verify a dual-signed Viso `DelegationProofV1` (JSON string or object). */
export async function verifyVisoDelegation(
  input: string | DelegationProofV1,
  expectedFromHex?: string,
  acceptedScopes: readonly string[] = ["*", "radica"],
): Promise<VerifiedDelegation | null> {
  try {
    const proof: unknown = typeof input === "string" ? JSON.parse(input.trim()) : input;
    if (!isDelegationProofShape(proof)) return null;
    if (proof.version !== 1 || !Number.isSafeInteger(proof.time_ms) || proof.time_ms < 0) return null;
    if (!delegationScopeMatches(proof.scope, acceptedScopes)) return null;
    const fromHex = parseVisoPubkeyHex(proof.from);
    const toHex = parseVisoPubkeyHex(proof.to);
    if (!fromHex || !toHex || fromHex === toHex) return null;
    if (expectedFromHex && fromHex !== expectedFromHex.toLowerCase()) return null;
    if (!/^[0-9a-fA-F]{128}$/.test(proof.sig_from) || !/^[0-9a-fA-F]{128}$/.test(proof.sig_to)) return null;
    const fromBytes = hex(fromHex);
    const toBytes = hex(toHex);
    const msg = delegationMsg(fromBytes, toBytes, proof.scope, proof.time_ms);
    const okFrom = await ed.verifyAsync(hex(proof.sig_from.toLowerCase()), msg, fromBytes);
    if (!okFrom) return null;
    const okTo = await ed.verifyAsync(hex(proof.sig_to.toLowerCase()), msg, toBytes);
    if (!okTo) return null;
    return {
      fromHex,
      toHex,
      fromB58: toBase58(fromBytes),
      toB58: toBase58(toBytes),
      scope: proof.scope,
      time_ms: proof.time_ms,
    };
  } catch {
    return null;
  }
}

const checkedDelegations = new Map<string, Promise<VerifiedDelegation | null>>();

/** Verify Viso delegation entries from Radica's `"delegations"` log, caching checks per `(author, proof)`. */
export async function verifiedDelegations(
  entries: { author: string; proof: DelegationProofV1 | null }[],
): Promise<Map<string, VerifiedDelegation>> {
  const out = new Map<string, VerifiedDelegation>();
  if (!entries.some((e) => e.proof)) return out;
  const results = await Promise.all(
    entries.map(({ author, proof }) => {
      if (!proof) return Promise.resolve(null);
      const k = `${author}|${JSON.stringify(proof)}`;
      if (!checkedDelegations.has(k)) {
        checkedDelegations.set(k, verifyVisoDelegation(proof, author).catch(() => null));
      }
      return checkedDelegations.get(k)!;
    }),
  );
  entries.forEach((e, i) => {
    const v = results[i];
    if (v) out.set(e.author, v);
  });
  return out;
}

export function parseStoredPoh(raw: string | null): StoredPohRecord | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[0-9a-fA-F]+$/.test(trimmed)) return { proof: trimmed.toLowerCase() };
  try {
    const parsed = JSON.parse(trimmed) as { proof?: unknown; delegation?: unknown };
    if (typeof parsed?.proof === "string" && /^[0-9a-fA-F]+$/.test(parsed.proof)) {
      return {
        proof: parsed.proof.toLowerCase(),
        ...(isDelegationProofShape(parsed.delegation) ? { delegation: parsed.delegation } : {}),
      };
    }
  } catch {}
  return null;
}

export function serializeStoredPoh(proof: string, delegation?: DelegationProofV1 | null): string {
  return delegation ? JSON.stringify({ proof, delegation }) : proof;
}

type CheckedPohEntry = { badge: PohBadge; targetPk: string; direct: boolean; timeMs: number } | null;
const checkedPohEntries = new Map<string, Promise<CheckedPohEntry>>();

/** Verify PoH proofs (direct or via a verified `DelegationProofV1`) from Radica's `"poh"` log, returning `author -> PohBadge[]`.
 *  Deduplicates by `(attestedPersona, provider)` so one PoH attestation can vouch for at most one Radica author. */
export async function verifiedPohBadgesByAuthor(
  entries: PohLogEntry[],
  issuers: readonly PohIssuer[] = VISO_POH_ISSUERS,
): Promise<Map<string, PohBadge[]>> {
  const out = new Map<string, PohBadge[]>();
  if (!entries.some((e) => e.proof) || !issuers.length) return out;
  const issuerSig = issuers.map((i) => i.keyId).join(",");
  const results = await Promise.all(
    entries.map(({ author, proof, delegation }) => {
      if (!proof) return Promise.resolve<CheckedPohEntry>(null);
      const delKey = delegation ? JSON.stringify(delegation) : "";
      const k = `${author}|${proof}|${delKey}|${issuerSig}`;
      if (!checkedPohEntries.has(k)) {
        checkedPohEntries.set(
          k,
          (async (): Promise<CheckedPohEntry> => {
            if (delegation) {
              const del = await verifyVisoDelegation(delegation, author);
              if (!del) return null;
              const badge = await verifyVisoPoh(hex(proof), del.toHex, issuers);
              return badge ? { badge, targetPk: del.toHex, direct: false, timeMs: del.time_ms } : null;
            }
            const badge = await verifyVisoPoh(hex(proof), author, issuers);
            return badge ? { badge, targetPk: author.toLowerCase(), direct: true, timeMs: Number.MAX_SAFE_INTEGER } : null;
          })().catch(() => null),
        );
      }
      return checkedPohEntries.get(k)!;
    }),
  );

  // Enforce 1 attested persona -> at most 1 Radica author per provider (prevents 1->N Sybil cloning via DelegationProofV1).
  const winners = new Map<string, { author: string; direct: boolean; timeMs: number; badge: PohBadge }>();
  entries.forEach((e, i) => {
    const res = results[i];
    if (!res) return;
    const authorNorm = e.author.toLowerCase();
    const slotKey = `${res.targetPk}|${res.badge.provider}`;
    const prev = winners.get(slotKey);
    const beats =
      !prev ||
      (res.direct && !prev.direct) ||
      (res.direct === prev.direct && (res.timeMs > prev.timeMs || (res.timeMs === prev.timeMs && authorNorm < prev.author)));
    if (beats) {
      winners.set(slotKey, { author: e.author, direct: res.direct, timeMs: res.timeMs, badge: res.badge });
    }
  });

  for (const w of winners.values()) {
    const list = out.get(w.author) ?? [];
    list.push(w.badge);
    out.set(w.author, list);
  }
  return out;
}

/** Verify PoH proofs (direct or via a verified `DelegationProofV1`) from Radica's `"poh"` log, returning `author -> PohBadge`. */
export async function verifiedPohBadges(
  entries: PohLogEntry[],
  issuers: readonly PohIssuer[] = VISO_POH_ISSUERS,
): Promise<Map<string, PohBadge>> {
  const byAuthor = await verifiedPohBadgesByAuthor(entries, issuers);
  const out = new Map<string, PohBadge>();
  for (const [author, list] of byAuthor) {
    if (list.length) out.set(author, list[list.length - 1]);
  }
  return out;
}

/** Verify PoH proofs from Radica's `"poh"` log (`hex CBOR PohAttestationV1`), caching checks per `(author, proof, issuers)`. */
export async function verifiedPohs(
  entries: PohLogEntry[],
  issuers: readonly PohIssuer[] = VISO_POH_ISSUERS,
): Promise<string[]> {
  return [...(await verifiedPohBadges(entries, issuers)).keys()];
}

/** The signed profile in a persona's identity state, or null (no profile, a destroyed persona, a bad signature). */
export async function visoProfileOf(state: Uint8Array, pkHex: string): Promise<{ name: string; bio: string } | null> {
  try {
    const s = cborDecode(state);
    if (mapGet(s, "destroyed") != null) return null;
    const slot = mapGet(mapGet(s, "slots"), "profile");
    if (!slot) return null;
    const bytes = asBytes(mapGet(slot, "bytes"));
    const time = asNumber(mapGet(slot, "time_ms"));
    if (!bytes.length) return null; // a deleted profile
    const name = enc.encode("profile");
    const msg = cat(enc.encode("whoiam-slot-v1"), hex(pkHex), u32le(name.length), name, u64le(time), blake3(bytes));
    if (!(await ed.verifyAsync(asBytes(mapGet(slot, "sig")), msg, hex(pkHex)))) return null;
    const p = cborDecode(bytes);
    // Viso's own limits (64 and 280 characters); plain text, never markup
    return { name: [...asString(mapGet(p, "name"))].slice(0, 64).join("").trim(), bio: [...asString(mapGet(p, "bio"))].slice(0, 280).join("") };
  } catch {
    return null;
  }
}

export const VISO_ANTE_PURPOSE = "viso:persona-level:v1";

export interface AnteTier {
  id: "bronze" | "silver" | "gold";
  label: string;
  minBits: number;
}

/** Map achieved Viso `ante` PoW bits to a standard UI commitment tier badge (`16b Seeded`, `20b Forged`, `24b Veteran`). */
export function anteTierOf(bits: number): AnteTier | null {
  if (!Number.isFinite(bits) || bits < 16) return null;
  if (bits >= 24) return { id: "gold", label: "Veteran", minBits: 24 };
  if (bits >= 20) return { id: "silver", label: "Forged", minBits: 20 };
  return { id: "bronze", label: "Seeded", minBits: 16 };
}

/** Decode and verify a Viso persona's `ante` PoW commitment slot (`viso:persona-level:v1`), returning achieved bits or null. */
export async function visoAnteBits(state: Uint8Array, pkHex: string): Promise<number | null> {
  try {
    const s = cborDecode(state);
    if (mapGet(s, "destroyed") != null) return null;
    const bytes = asBytes(mapGet(mapGet(mapGet(s, "slots"), "ante"), "bytes"));
    if (!bytes.length) return null;
    const p = await checkProof(bytes, VISO_ANTE_PURPOSE, 0);
    if (ed.etc.bytesToHex(p.vk) !== pkHex.toLowerCase()) return null;
    return bitsOf(challengeBytes(p.purpose, p.vk), p.nonce);
  } catch {
    return null;
  }
}
