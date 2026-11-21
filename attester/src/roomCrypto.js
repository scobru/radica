// Native private room E2EE cryptography and verified enc_pub helpers matching ui/src/crypto.ts & ui/src/whoiam.ts.
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, randomBytes } from "node:crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const enc = new TextEncoder();
const dec = new TextDecoder();
const CURVE25519_P = (1n << 255n) - 19n;
const PKCS8_X25519_PREFIX = hexToBytes("302e020100300506032b656e04220420");
const SPKI_X25519_PREFIX = hexToBytes("302a300506032b656e032100");
const HEX64_RE = /^[0-9a-f]{64}$/i;

function modPow(base, exp, mod) {
  let res = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) res = (res * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return res;
}

/** Convert an Ed25519 32-byte seed to its clamped Montgomery X25519 private scalar. */
export function edSkToX25519(skBytes) {
  const h = sha512(skBytes).slice(0, 32);
  h[0] &= 248;
  h[31] &= 127;
  h[31] |= 64;
  return h;
}

/** Convert a 32-byte Ed25519 public key (birational map u = (1 + y) / (1 - y) mod p) to Montgomery X25519. */
export function edPubToX25519(edPubBytes) {
  if (!(edPubBytes instanceof Uint8Array) || edPubBytes.length !== 32) {
    throw new Error("Ed25519 public key must be 32 bytes");
  }
  const yBytes = Uint8Array.from(edPubBytes);
  yBytes[31] &= 0x7f;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(yBytes[i]);
  if (y >= CURVE25519_P || y === 1n) throw new Error("Invalid Ed25519 public key");
  const denom = (1n - y + CURVE25519_P) % CURVE25519_P;
  const u = ((1n + y) * modPow(denom, CURVE25519_P - 2n, CURVE25519_P)) % CURVE25519_P;
  const out = new Uint8Array(32);
  let v = u;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Derive the raw 32-byte X25519 shared secret between an Ed25519 seed and a peer's Ed25519 hex public key. */
export function x25519SharedSecret(myEdSkBytes, peerEdPubHex) {
  if (!HEX64_RE.test(String(peerEdPubHex ?? ""))) throw new Error("Invalid peer public key");
  const privDer = Buffer.concat([PKCS8_X25519_PREFIX, edSkToX25519(myEdSkBytes)]);
  const pubDer = Buffer.concat([SPKI_X25519_PREFIX, edPubToX25519(hexToBytes(peerEdPubHex))]);
  const privateKey = createPrivateKey({ key: privDer, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey({ key: pubDer, format: "der", type: "spki" });
  return new Uint8Array(diffieHellman({ privateKey, publicKey }));
}

function aesGcmEncrypt(keyBytes, plaintext, prefix) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes, iv);
  const body = Buffer.concat([cipher.update(enc.encode(plaintext)), cipher.final(), cipher.getAuthTag()]);
  return `${prefix}:${bytesToHex(iv)}:${bytesToHex(body)}`;
}

function aesGcmDecrypt(keyBytes, encoded, prefix) {
  if (typeof encoded !== "string" || !encoded.startsWith(`${prefix}:`)) return null;
  const parts = encoded.split(":");
  if (parts.length !== 3) return null;
  const [, ivHex, cipherHex] = parts;
  if (!/^[0-9a-f]{24}$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(cipherHex) || cipherHex.length % 2 !== 0) return null;
  try {
    const iv = hexToBytes(ivHex);
    const data = hexToBytes(cipherHex);
    if (data.length < 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyBytes, iv);
    decipher.setAuthTag(data.subarray(data.length - 16));
    const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
    return dec.decode(plain);
  } catch {
    return null;
  }
}

/** Seal a 32-byte symmetric room key to `peerEncPubHex` (`e2e:<iv>:<cipher>`). */
export async function encryptRoomKeyForPeer(mySk, peerEncPubHex, roomKeyBytes) {
  const shared = x25519SharedSecret(mySk, peerEncPubHex);
  return aesGcmEncrypt(shared, bytesToHex(roomKeyBytes), "e2e");
}

/** Open an `e2e:` encrypted 32-byte room key from `peerEncPubHex`, or null on failure. */
export async function decryptRoomKeyFromPeer(mySk, peerEncPubHex, encryptedKeyString) {
  try {
    const shared = x25519SharedSecret(mySk, peerEncPubHex);
    const hexKey = aesGcmDecrypt(shared, encryptedKeyString, "e2e");
    if (!hexKey || !HEX64_RE.test(hexKey)) return null;
    return hexToBytes(hexKey);
  } catch {
    return null;
  }
}

/** Decrypt a native room's symmetric key using `keys_enc_pub`, `creator_enc_pub`, or `creator`. */
export async function decryptRoomKey(mySk, myPkHex, room) {
  if (!room || room.river) return null;
  const myLower = String(myPkHex ?? "").toLowerCase();
  const keys = room.encrypted_keys ?? {};
  let encKey = keys[myPkHex] ?? keys[myLower];
  if (!encKey) {
    for (const [k, v] of Object.entries(keys)) {
      if (k.toLowerCase() === myLower) {
        encKey = v;
        break;
      }
    }
  }
  if (typeof encKey !== "string") return null;
  const candidates = [];
  for (const cand of [room.gardener_enc_pub, room.keys_enc_pub, room.creator_enc_pub, room.creator]) {
    if (typeof cand === "string" && HEX64_RE.test(cand)) {
      const low = cand.toLowerCase();
      if (!candidates.includes(low)) candidates.push(low);
    }
  }
  for (const peerEnc of candidates) {
    const key = await decryptRoomKeyFromPeer(mySk, peerEnc, encKey);
    if (key) return key;
  }
  return null;
}

/** Encrypt a room message with its 32-byte AES-256-GCM symmetric key (`sym:<iv>:<cipher>`). */
export async function encryptWithSymmetricKey(keyBytes, plaintext) {
  return aesGcmEncrypt(keyBytes, plaintext, "sym");
}

/** Decrypt a `sym:` room message with its 32-byte symmetric key, or null if invalid. */
export async function decryptWithSymmetricKey(keyBytes, encryptedText) {
  return aesGcmDecrypt(keyBytes, encryptedText, "sym");
}

/** Compute the HMAC-SHA256 `key_proof` matching `ui/src/freenet.ts` `computeRoomJoinProof`. */
export function computeRoomJoinProof(roomKeyBytes, roomId, pubkeyHex) {
  return bytesToHex(hmac(sha256, roomKeyBytes, enc.encode(`radica/room-join/v1|${roomId}|${String(pubkeyHex).toLowerCase()}`)));
}

function lp(tag, fields) {
  return `${tag}|` + fields.map((f) => `${enc.encode(String(f)).length}:${f}`).join("");
}

function connectMessage(pk, base, challenge, ts) {
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

async function verifyVisoProof(pkHex, cert) {
  try {
    const rawPk = hexToBytes(pkHex);
    const rawSig = hexToBytes(cert.sig);
    const candidates = [cert.base];
    const noSlash = cert.base.replace(/\/+$/, "");
    if (noSlash !== cert.base) candidates.push(noSlash);
    const withSlash = cert.base.endsWith("/") ? cert.base : `${cert.base}/`;
    if (withSlash !== cert.base) candidates.push(withSlash);
    for (const base of candidates) {
      if (await ed.verifyAsync(rawSig, connectMessage(rawPk, base, cert.challenge, cert.ts), rawPk)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Verify a persona's `ProfileInfo.enc_pub` (direct Ed25519 or Viso-delegated); returns verified hex or `pubkeyHex`. */
export async function verifyProfileEncPub(pubkeyHex, profile, appPath = "") {
  const pubLow = String(pubkeyHex ?? "").toLowerCase();
  const encPub = typeof profile?.enc_pub === "string" ? profile.enc_pub.toLowerCase() : "";
  if (!profile || !HEX64_RE.test(pubLow) || !HEX64_RE.test(encPub) || encPub === pubLow) return pubLow;
  const msg = profile.v === 3
    ? lp("radica/profile/v4", [pubLow, profile.display_name ?? "", profile.bio ?? "", profile.avatar_url ?? "", encPub, profile.updated_at ?? 0])
    : `radica/profile/v3:${pubLow}:${profile.display_name ?? ""}:${profile.bio ?? ""}:${profile.avatar_url ?? ""}:${encPub}:${profile.updated_at ?? 0}`;
  const sigHex = String(profile.sig ?? "");
  if (!sigHex) return pubLow;
  const cert = profile.cert;
  try {
    if (!cert) {
      return (await ed.verifyAsync(hexToBytes(sigHex), enc.encode(msg), hexToBytes(pubLow))) ? encPub : pubLow;
    }
    const m = /^wd1\.([0-9a-f]{64})\.[0-9a-f]+$/i.exec(cert.challenge ?? "");
    if (!m) return pubLow;
    if (appPath.startsWith("/v1/contract/web/")) {
      if (new URL(cert.base).pathname.replace(/\/+$/, "") !== appPath.replace(/\/+$/, "")) return pubLow;
    }
    if (!(await verifyVisoProof(pubLow, cert))) return pubLow;
    return (await ed.verifyAsync(hexToBytes(sigHex), enc.encode(msg), hexToBytes(m[1].toLowerCase()))) ? encPub : pubLow;
  } catch {
    return pubLow;
  }
}
