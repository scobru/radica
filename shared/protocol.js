// Zero-dependency protocol constants and canonical wire-format helpers shared between `ui/` and `attester/`.
// IMPORTANT: attester Docker images only mount `shared/` alongside `attester/`, with no root `node_modules`.
// Keep this module strictly stdlib-free ES2022 JS so both browser bundles and Node containers run it directly.

const enc = new TextEncoder();

/** Radica maintainer identity and default moderation authorities. */
export const RADICA_MAINTAINER = "464b576da4cc5bcf31febd41a863ac251d04024c19f1786b24ca6620a0cce53b";
export const RADICA_DEFAULT_MODS = ["3ac3e7f1f7535888597dbd8b25e362fa153eb10bfedd1e2df1b50299d7f2bf98"];
export const AI_REPORTERS = ["f7e890b950b78259767d164db5d28e3a685e0fcf8fc60ae1e927dd25b16ee191"];

/** Shared PoW difficulty (leading zero bits of BLAKE3) for log v2 and feed v3 contracts. */
export const LOG_POW_BITS = 12;

export function bytesToHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

export function leadingZeroBits(bytes) {
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    n += Math.clz32(b) - 24;
    if (b) break;
  }
  return n;
}

/** Length-prefixed canonical message framing: `<tag>|<UTF-8 byte length>:<field>...`. */
export function lp(tag, fields) {
  return `${tag}|` + fields.map((f) => `${enc.encode(String(f)).length}:${f}`).join("");
}

/** Legacy v1 log-contract signed message (must match log-contract/src/lib.rs `entry_msg`). */
export function logEntryMessage(log, app, author, id, ts, body) {
  const params = bytesToHex(enc.encode(`radica/${log}|${app}`));
  return `radica/log/v1:${params}:${author}:${id}:${ts}:${body}`;
}

/** v2 log-contract signed message using BLAKE3 hex of `body` (must match log-contract/src/lib.rs `entry_msg2`). */
export function logEntryMessage2(log, app, author, id, ts, bodyHashHex, nonce) {
  const params = bytesToHex(enc.encode(`radica/${log}|${app}`));
  return lp("radica/log/v2", [params, author, id, ts, bodyHashHex, nonce]);
}

/** Legacy v3 profile signature message. */
export function profileMessageV3(owner, displayName, bio, avatarUrl, encPub, updatedAt) {
  return `radica/profile/v3:${owner}:${displayName}:${bio}:${avatarUrl}:${encPub}:${updatedAt}`;
}

/** v4 length-prefixed profile signature message (must match contract/src/lib.rs `profile_msg4`). */
export function profileMessageV4(owner, p) {
  return lp("radica/profile/v4", [
    owner,
    p?.display_name ?? "",
    p?.bio ?? "",
    p?.avatar_url ?? "",
    p?.enc_pub ?? "",
    p?.updated_at ?? 0,
  ]);
}

/** Canonical UTF-8 message string for a supporter receipt signature. */
export function receiptMessageText(r) {
  const normDonor = String(r.donor_pk ?? "").trim().toLowerCase();
  const normTx = String(r.tx_hash ?? "").trim().toLowerCase();
  return `radica/receipt/v1:${normDonor}:${r.tier}:${r.chain}:${normTx}:${r.ts}`;
}

/** Canonical HMAC input proving room-key possession when joining via invite link. */
export function roomJoinProofMessage(roomId, pubkeyHex) {
  return `radica/room-join/v1|${roomId}|${String(pubkeyHex ?? "").toLowerCase()}`;
}

/** Binary message signed by Viso/whoiam: `"whoiam-connect-v1" || pk || u32le len || base || u32le len || challenge || u64le ts`. */
export function connectMessage(pk, base, challenge, ts) {
  const bBase = enc.encode(base);
  const bChal = enc.encode(challenge);
  const out = new Uint8Array(17 + pk.length + 4 + bBase.length + 4 + bChal.length + 8);
  const dv = new DataView(out.buffer);
  let o = 0;
  out.set(enc.encode("whoiam-connect-v1"), o); o += 17;
  out.set(pk, o); o += pk.length;
  dv.setUint32(o, bBase.length, true); o += 4;
  out.set(bBase, o); o += bBase.length;
  dv.setUint32(o, bChal.length, true); o += 4;
  out.set(bChal, o); o += bChal.length;
  dv.setBigUint64(o, BigInt(ts), true);
  return out;
}

const u32le = (n) => new Uint8Array(new Uint32Array([n]).buffer);
const u64le = (n) => new Uint8Array(new BigUint64Array([BigInt(n)]).buffer);

function concatBytes(...parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** `ante_core::pow::challenge_bytes`. */
export function anteChallengeBytes(purpose, vk) {
  const p = enc.encode(purpose);
  return concatBytes(enc.encode("ante:pow-challenge:v1"), u32le(p.length), p, vk);
}

/** `ante_core::proof::signing_bytes`. */
export function anteSigningBytes(vk, purpose, nonce, ts) {
  const p = enc.encode(purpose);
  return concatBytes(enc.encode("ante:proof-signature:v1"), vk, u32le(p.length), p, u64le(nonce), u64le(ts));
}

function cborHead(major, n) {
  const v = BigInt(n);
  if (v < 24n) return [(major << 5) | Number(v)];
  const w = v < 256n ? 1 : v < 65536n ? 2 : v < 2n ** 32n ? 4 : 8;
  return [
    (major << 5) | { 1: 24, 2: 25, 4: 26, 8: 27 }[w],
    ...Array.from({ length: w }, (_, i) => Number((v >> BigInt(8 * (w - 1 - i))) & 255n)),
  ];
}

function encodeCborChunks(v) {
  if (typeof v === "string") {
    const b = enc.encode(v);
    return [...cborHead(3, b.length), ...b];
  }
  if (Array.isArray(v)) return [...cborHead(4, v.length), ...v.flatMap(encodeCborChunks)];
  if (typeof v === "number") return cborHead(0, v);
  const entries = Object.entries(v);
  return [...cborHead(5, entries.length), ...entries.flatMap(([k, x]) => [...encodeCborChunks(k), ...encodeCborChunks(x)])];
}

/** Canonical CBOR encoder for AnteProof values (text-keyed maps, unsigned ints, strings, int arrays). */
export function anteCborEncode(v) {
  return Uint8Array.from(encodeCborChunks(v));
}
