// Secret Chat v2: the Double Ratchet (signal.org/docs/specifications/doubleratchet), so a message key is gone once used
// and a stolen identity key does not open messages already read. Sessions are Olm-style: one per (me, peer, base key),
// where the base key is the starter's first ratchet key. Two people who write first at the same time each start a
// session; both decrypt, and replies go out on the session last used. The storage is passed in so a test can give each
// side its own.
//
// Hybrid post-quantum: each side sends its ML-KEM-768 key in the header until the peer uses it, and from then on every
// new sending chain also mixes a fresh ML-KEM shared secret into the root key (its ciphertext rides in the chain's
// headers). A message is then safe unless both X25519 and ML-KEM fall; the first chain of a session, before any reply,
// is X25519 only.

import * as ed from "@noble/ed25519";
import { ed25519 as curveEd25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { toMontgomeryPriv, toMontgomeryPub } from "./secretChat.ts";

export const PREFIX_V2 = "secret:v2:";
export const DR_SESSIONS_KEY = "radica_secret_sessions_v2";
/** Keys one message may make us skip over (lost or reordered messages). */
const MAX_SKIP = 500;
/** Skipped keys a session keeps; the oldest go first. */
const MAX_SKIPPED_KEPT = 1000;
/** Sessions kept per peer; the least recently used go first. */
const MAX_SESSIONS = 8; // one per device key a message is sealed to (secretChatTransport.ts MAX_SECRET_KEYS = 4), and as many started by the peer

export interface DrStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DrSession {
  /** The starter's first ratchet public key: names the session in every header. */
  base: string;
  /** The peer's static key this session was made with (Viso: their app key). */
  peerEnc: string;
  rk: string;
  dhsPriv: string;
  dhsPub: string;
  dhr: string | null;
  cks: string | null;
  ckr: string | null;
  ns: number;
  nr: number;
  pn: number;
  /** `${ratchet pub}:${n}` -> message key, for messages that have not arrived yet. */
  skipped: Record<string, string>;
  used: number;
  /** The peer's ML-KEM-768 key, once they sent it. */
  peerKem?: string | null;
  /** The ML-KEM ciphertext of my current sending chain, sent in its headers. */
  kct?: string | null;
  /** The peer used my ML-KEM key: no need to send it any more. */
  ackd?: boolean;
}

interface Header {
  b: string;
  d: string;
  pn: number;
  n: number;
  /** My ML-KEM-768 encapsulation key, until the peer uses it. */
  e?: string;
  /** The ML-KEM ciphertext mixed into this chain. */
  k?: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const hex = ed.etc.bytesToHex;
const unhex = ed.etc.hexToBytes;

function kdfRk(rk: Uint8Array, dhOut: Uint8Array, kemSecret?: Uint8Array): [Uint8Array, Uint8Array] {
  const out = hkdf(sha256, kemSecret ? ed.etc.concatBytes(dhOut, kemSecret) : dhOut, rk, enc.encode("radica_dr_root"), 64);
  return [out.slice(0, 32), out.slice(32)];
}

// Its own ML-KEM key pair, derived from the identity key apart from Freenet Mail's, so the two protocols share nothing.
const kemCache = new WeakMap<Uint8Array, { publicKey: Uint8Array; secretKey: Uint8Array }>();
function kemKeys(mySecretKey: Uint8Array) {
  let k = kemCache.get(mySecretKey);
  if (!k) {
    k = ml_kem768.keygen(hkdf(sha256, mySecretKey, new Uint8Array(32), enc.encode("radica_secret_chat_ml_kem_768_v1"), 64));
    kemCache.set(mySecretKey, k);
  }
  return k;
}

/** A new sending chain from `dhOut`, mixed with a fresh ML-KEM secret for the peer when their key is known. */
function sendingChain(s: DrSession, rk: Uint8Array, dhOut: Uint8Array): [Uint8Array, Uint8Array] {
  if (!s.peerKem) {
    s.kct = null;
    return kdfRk(rk, dhOut);
  }
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(unhex(s.peerKem));
  s.kct = hex(cipherText);
  return kdfRk(rk, dhOut, sharedSecret);
}

function kdfCk(ck: Uint8Array): [Uint8Array, Uint8Array] {
  return [hmac(sha256, ck, Uint8Array.of(2)), hmac(sha256, ck, Uint8Array.of(1))]; // [next chain key, message key]
}

function newPair(): { priv: Uint8Array; pub: Uint8Array } {
  const priv = crypto.getRandomValues(new Uint8Array(32));
  return { priv, pub: x25519.getPublicKey(priv) };
}

/** X3DH without prekeys: DH(IK_starter, IK_other) ‖ DH(base, IK_other). */
function sharedSecret(dhIk: Uint8Array, dhBase: Uint8Array): Uint8Array {
  return hkdf(sha256, ed.etc.concatBytes(dhIk, dhBase), new Uint8Array(32), enc.encode("radica_secret_chat_v2"), 32);
}

const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

const pairKey = (me: string, peer: string) => `${me}|${peer}`;

function loadAll(store: DrStore): Record<string, DrSession[]> {
  try {
    return JSON.parse(store.getItem(DR_SESSIONS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSession(store: DrStore, me: string, peer: string, s: DrSession): void {
  const all = loadAll(store);
  const list = (all[pairKey(me, peer)] ?? []).filter((x) => x.base !== s.base);
  all[pairKey(me, peer)] = [s, ...list].sort((a, z) => z.used - a.used).slice(0, MAX_SESSIONS);
  store.setItem(DR_SESSIONS_KEY, JSON.stringify(all));
}

export function drSessions(store: DrStore, me: string, peer: string): DrSession[] {
  return loadAll(store)[pairKey(me, peer)] ?? [];
}

/** How the session messages to `peer` go out on is protected: "pq" once ML-KEM is mixed in either way, "dr" before
 *  that (the first chain, before any reply), null when there is no v2 session yet. */
export function drLevel(store: DrStore, me: string, peer: string): "pq" | "dr" | null {
  const s = drSessions(store, me, peer)[0];
  return !s ? null : s.kct || s.ackd ? "pq" : "dr";
}

/** Forget every v2 session with `peer` (a reset: the next message starts a new one). */
export function clearDrSessions(store: DrStore, me: string, peer: string): void {
  const all = loadAll(store);
  delete all[pairKey(me, peer)];
  store.setItem(DR_SESSIONS_KEY, JSON.stringify(all));
}

/** Associated data: both static keys and the header, so a message can't be replayed to someone else or re-headed. */
const ad = (senderEnc: string, receiverEnc: string, headerB64: string) => enc.encode(`${PREFIX_V2}${senderEnc}|${receiverEnc}|${headerB64}`);

async function aead(mk: Uint8Array, iv: Uint8Array, data: Uint8Array, aad: Uint8Array, encrypt: boolean): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", mk as BufferSource, { name: "AES-GCM" }, false, [encrypt ? "encrypt" : "decrypt"]);
  mk.fill(0);
  const params = { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource };
  return new Uint8Array(encrypt ? await crypto.subtle.encrypt(params, key, data as BufferSource) : await crypto.subtle.decrypt(params, key, data as BufferSource));
}

/**
 * Seal `payload` for `peer` on the session last used with them, starting one if there is none for their current key.
 * `peerEncPub` is the static key the peer decrypts with (Viso: their app key).
 */
export async function drEncrypt(store: DrStore, mySecretKey: Uint8Array, me: string, peer: string, peerEncPub: string, payload: object): Promise<string> {
  let s = drSessions(store, me, peer).find((x) => x.peerEnc === peerEncPub && x.cks);
  if (!s) {
    const base = newPair();
    const peerIk = toMontgomeryPub(peerEncPub);
    const sk = sharedSecret(x25519.getSharedSecret(toMontgomeryPriv(mySecretKey), peerIk), x25519.getSharedSecret(base.priv, peerIk));
    const [rk, cks] = kdfRk(sk, x25519.getSharedSecret(base.priv, peerIk));
    s = { base: hex(base.pub), peerEnc: peerEncPub, rk: hex(rk), dhsPriv: hex(base.priv), dhsPub: hex(base.pub), dhr: hex(peerIk), cks: hex(cks), ckr: null, ns: 0, nr: 0, pn: 0, skipped: {}, used: 0 };
  }
  const [ck, mk] = kdfCk(unhex(s.cks!));
  const header: Header = { b: s.base, d: s.dhsPub, pn: s.pn, n: s.ns };
  if (!s.ackd) header.e = hex(kemKeys(mySecretKey).publicKey);
  if (s.kct) header.k = s.kct;
  s.cks = hex(ck);
  s.ns += 1;
  s.used = Date.now();
  const headerB64 = b64(JSON.stringify(header));
  const myEnc = hex(curveEd25519.getPublicKey(mySecretKey));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await aead(mk, iv, enc.encode(JSON.stringify(payload)), ad(myEnc, peerEncPub, headerB64), true);
  saveSession(store, me, peer, s);
  return `${PREFIX_V2}${headerB64}:${hex(iv)}:${hex(sealed)}`;
}

function skipTo(s: DrSession, until: number): void {
  if (!s.ckr) return;
  if (until - s.nr > MAX_SKIP) throw new Error("Too many skipped Secret Chat messages");
  let ck = unhex(s.ckr);
  while (s.nr < until) {
    const [next, mk] = kdfCk(ck);
    s.skipped[`${s.dhr}:${s.nr}`] = hex(mk);
    ck = next;
    s.nr += 1;
  }
  s.ckr = hex(ck);
  const keys = Object.keys(s.skipped);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SKIPPED_KEPT))) delete s.skipped[k];
}

/**
 * Open a v2 message from `peer` (`peerEncPub`: the key it was sealed by). Nothing in storage changes unless it opens,
 * and the message key is deleted once used: a message opens once, so keep its plain text.
 */
export async function drDecrypt(store: DrStore, mySecretKey: Uint8Array, me: string, peer: string, peerEncPub: string, ciphertext: string): Promise<unknown> {
  const parts = ciphertext.slice(PREFIX_V2.length).split(":");
  if (!ciphertext.startsWith(PREFIX_V2) || parts.length !== 3) throw new Error("Invalid secret message format");
  const [headerB64, ivHex, cipherHex] = parts;
  const h: Header = JSON.parse(unb64(headerB64));
  if (![h.b, h.d].every((k) => typeof k === "string" && /^[0-9a-f]{64}$/.test(k)) || !Number.isInteger(h.n) || !Number.isInteger(h.pn) || h.n < 0 || h.pn < 0)
    throw new Error("Invalid secret message header");
  if ((h.e !== undefined && !/^[0-9a-f]{2368}$/.test(h.e)) || (h.k !== undefined && !/^[0-9a-f]{2176}$/.test(h.k)))
    throw new Error("Invalid secret message key");

  const found = drSessions(store, me, peer).find((x) => x.base === h.b);
  let s: DrSession;
  if (found) {
    s = structuredClone(found);
  } else {
    // they started this session: the base key is their first ratchet key and our side of it is our static key
    if (h.d !== h.b) throw new Error("Secret Chat session not found");
    const myIk = toMontgomeryPriv(mySecretKey);
    const sk = sharedSecret(x25519.getSharedSecret(myIk, toMontgomeryPub(peerEncPub)), x25519.getSharedSecret(myIk, unhex(h.b)));
    const [rk, ckr] = kdfRk(sk, x25519.getSharedSecret(myIk, unhex(h.b)));
    const mine = newPair();
    s = { base: h.b, peerEnc: peerEncPub, rk: "", dhsPriv: hex(mine.priv), dhsPub: hex(mine.pub), dhr: h.b, cks: null, ckr: hex(ckr), ns: 0, nr: 0, pn: 0, skipped: {}, used: 0, peerKem: h.e ?? null };
    const [rk2, cks] = sendingChain(s, rk, x25519.getSharedSecret(mine.priv, unhex(h.b)));
    Object.assign(s, { rk: hex(rk2), cks: hex(cks) });
  }
  if (h.e) s.peerKem = h.e;

  let mk: Uint8Array;
  const skippedKey = `${h.d}:${h.n}`;
  if (s.skipped[skippedKey]) {
    mk = unhex(s.skipped[skippedKey]);
    delete s.skipped[skippedKey];
  } else {
    if (h.d !== s.dhr) {
      skipTo(s, h.pn);
      s.pn = s.ns;
      s.ns = 0;
      s.nr = 0;
      s.dhr = h.d;
      const kemSecret = h.k ? ml_kem768.decapsulate(unhex(h.k), kemKeys(mySecretKey).secretKey) : undefined;
      const [rk, ckr] = kdfRk(unhex(s.rk), x25519.getSharedSecret(unhex(s.dhsPriv), unhex(h.d)), kemSecret);
      if (h.k) s.ackd = true;
      const mine = newPair();
      const [rk2, cks] = sendingChain(s, rk, x25519.getSharedSecret(mine.priv, unhex(h.d)));
      Object.assign(s, { rk: hex(rk2), ckr: hex(ckr), cks: hex(cks), dhsPriv: hex(mine.priv), dhsPub: hex(mine.pub) });
    }
    if (h.n < s.nr) throw new Error("Secret Chat message already opened");
    skipTo(s, h.n);
    const [ck, key] = kdfCk(unhex(s.ckr!));
    s.ckr = hex(ck);
    s.nr += 1;
    mk = key;
  }

  const myEnc = hex(curveEd25519.getPublicKey(mySecretKey));
  const plain = await aead(mk, unhex(ivHex), unhex(cipherHex), ad(peerEncPub, myEnc, headerB64), false);
  s.used = Date.now();
  saveSession(store, me, peer, s);
  return JSON.parse(dec.decode(plain));
}
