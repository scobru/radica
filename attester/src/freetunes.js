// FreeTunes check, no network: is a track published in FreeTunes an existing one (MusicBrainz)? If so, the bot files a
// "copyright" report in FreeTunes' reports contract, the queue its moderator sees. It only reports; it hides nothing.
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { anteCborEncode, anteChallengeBytes, anteSigningBytes, leadingZeroBits } from "../../shared/protocol.js";

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

const zeroBits = leadingZeroBits;
export const challengeBytes = anteChallengeBytes;
const u64le = (n) => new Uint8Array(new BigUint64Array([BigInt(n)]).buffer);
const cat = (...p) => Uint8Array.from(p.flatMap((x) => [...x]));
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

/** The `AnteProof` (hex CBOR) the reports contract checks for `report`, made by the ante identity `sk`. */
export async function anteProof(sk, report, ts = Date.now()) {
  const vk = await ed.getPublicKeyAsync(sk), purpose = purposeOf(report);
  const nonce = grind(challengeBytes(purpose, vk));
  const signature = await ed.signAsync(anteSigningBytes(vk, purpose, nonce, ts), sk);
  const proof = bytesToHex(anteCborEncode({ identity_vk: Array.from(vk), purpose, nonce, ts, signature: Array.from(signature) }));
  return { a: bytesToHex(vk), proof };
}

/** The reports-contract delta that files `report` (key `<target>:<track>:<ante identity>`). */
export async function reportDelta(sk, report) {
  const { a, proof } = await anteProof(sk, report);
  return { reports: { [`${report.target}:${report.track}:${a}`]: { ...report, a, proof } } };
}
