// FreeTunes check, no network: is a track published in FreeTunes an existing one (MusicBrainz)? If so, the bot files a
// "copyright" report in FreeTunes' reports contract, the queue its moderator sees. It only reports; it hides nothing.
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const enc = new TextEncoder();
export const REPORT_BITS = 18; // must match MIN_BITS in freetunes reports/src/lib.rs
export const MAX_TRACKS = 50; // the reports contract refuses a track index >= 50

/** Lowercase, no accents, no (brackets), no punctuation: "Señorita (Remastered)" ~ "senorita". */
export const norm = (s) =>
  String(s ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\(.*?\)|\[.*?\]/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Releases still listed in the directory (not taken down, not blocked), newest first. */
export function liveReleases(dir) {
  const blocked = new Set(dir?.blocked?.list ?? []);
  return Object.entries(dir?.entries ?? {})
    .filter(([id, e]) => e && !e.removed && !blocked.has(id) && typeof e.title === "string" && typeof e.artist === "string")
    .map(([instance, e]) => ({ instance, title: e.title, artist: e.artist, ts: e.ts }))
    .sort((a, b) => b.ts - a.ts);
}

/** The signed release state's tracks as `[{ i, title }]` (none for a tombstone or unparsable state). */
export function trackTitles(releaseState) {
  try {
    const m = JSON.parse(JSON.parse(releaseState).meta_json);
    if (m.deleted || !Array.isArray(m.tracks)) return { artist: "", tracks: [] };
    return { artist: String(m.artist ?? ""), tracks: m.tracks.slice(0, MAX_TRACKS).map((t, i) => ({ i, title: String(t?.title ?? "") })).filter((t) => norm(t.title)) };
  } catch {
    return { artist: "", tracks: [] };
  }
}

const lucene = (s) => s.replace(/["\\]/g, " ");
export const mbUrl = (artist, title) =>
  `https://musicbrainz.org/ws/2/recording?fmt=json&limit=5&query=${encodeURIComponent(`recording:"${lucene(title)}" AND artist:"${lucene(artist)}"`)}`;

/** The MusicBrainz recording that has this exact title (normalised) by this artist, or null. A loose hit is not a match:
 *  the report asks a person to look, so it must name something real. */
export function mbMatch(json, artist, title) {
  for (const r of json?.recordings ?? []) {
    if (!(r.score >= 90) || norm(r.title) !== norm(title)) continue;
    const by = (r["artist-credit"] ?? []).map((c) => c?.name ?? c?.artist?.name).filter(Boolean);
    if (by.some((n) => norm(n) === norm(artist))) return { mbid: String(r.id), title: r.title, artist: by.join(", ") };
  }
  return null;
}

/** The report body, as freetunes ui/src/ante.ts ReportBody; "[AI]" tells the moderator who is speaking. */
export const reportOf = (target, track, hit, ts) => ({
  target, track, kind: "copyright", contact: "", ts,
  note: `[AI] "${hit.title}" by ${hit.artist} exists on MusicBrainz (recording ${hit.mbid}); check the uploader owns it.`.replace(/\p{Cc}+/gu, " ").slice(0, 300),
});

// ---- ante proof (github.com/soudasuwa/ante), as freetunes ui/src/ante.ts: purpose, grind, signature, CBOR ----
export const purposeOf = (r) =>
  `freetunes:report:v1:${bytesToHex(blake3(enc.encode(`ftr1\n${r.target}\n${r.track}\n${r.kind}\n${r.note}\n${r.contact}\n${r.ts}`)))}`;

const u32le = (n) => new Uint8Array(new Uint32Array([n]).buffer);
const u64le = (n) => new Uint8Array(new BigUint64Array([BigInt(n)]).buffer);
const cat = (...p) => Uint8Array.from(p.flatMap((x) => [...x]));
const zeroBits = (d) => { let n = 0; for (const b of d) { n += Math.clz32(b) - 24; if (b) break; } return n; };
export const challengeBytes = (purpose, vk) => cat(enc.encode("ante:pow-challenge:v1"), u32le(enc.encode(purpose).length), enc.encode(purpose), vk);
export const bitsOf = (challenge, nonce) => zeroBits(blake3(cat(challenge, u64le(nonce))));

/** Smallest nonce with `bits` leading zero bits: about 2^bits hashes (a second or so at 18). */
export function grind(challenge, bits = REPORT_BITS) {
  const input = new Uint8Array(challenge.length + 8), view = new DataView(input.buffer);
  input.set(challenge);
  for (let nonce = 0; ; nonce++) {
    view.setBigUint64(challenge.length, BigInt(nonce), true);
    if (zeroBits(blake3(input)) >= bits) return nonce;
  }
}

// CBOR for the one shape an AnteProof has: a text-keyed map of text, uints and byte arrays written as int arrays.
const head = (major, n) => {
  n = BigInt(n);
  if (n < 24n) return [(major << 5) | Number(n)];
  const w = n < 256n ? 1 : n < 65536n ? 2 : n < 2n ** 32n ? 4 : 8;
  return [(major << 5) | { 1: 24, 2: 25, 4: 26, 8: 27 }[w], ...Array.from({ length: w }, (_, i) => Number((n >> BigInt(8 * (w - 1 - i))) & 255n))];
};
const cbor = (v) =>
  typeof v === "string" ? [...head(3, enc.encode(v).length), ...enc.encode(v)]
  : Array.isArray(v) ? [...head(4, v.length), ...v.flatMap(cbor)]
  : typeof v === "number" ? head(0, v)
  : [...head(5, Object.keys(v).length), ...Object.entries(v).flatMap(([k, x]) => [...cbor(k), ...cbor(x)])];

/** The `AnteProof` (hex CBOR) the reports contract checks for `report`, made by the ante identity `sk`. */
export async function anteProof(sk, report, ts = Date.now()) {
  const vk = await ed.getPublicKeyAsync(sk), purpose = purposeOf(report);
  const nonce = grind(challengeBytes(purpose, vk));
  const p = enc.encode(purpose);
  const signature = await ed.signAsync(cat(enc.encode("ante:proof-signature:v1"), vk, u32le(p.length), p, u64le(nonce), u64le(ts)), sk);
  const proof = bytesToHex(Uint8Array.from(cbor({ identity_vk: Array.from(vk), purpose, nonce, ts, signature: Array.from(signature) })));
  return { a: bytesToHex(vk), proof };
}

/** The reports-contract delta that files `report` (key `<target>:<track>:<ante identity>`). */
export async function reportDelta(sk, report) {
  const { a, proof } = await anteProof(sk, report);
  return { reports: { [`${report.target}:${report.track}:${a}`]: { ...report, a, proof } } };
}
