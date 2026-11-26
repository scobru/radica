import * as ed from "@noble/ed25519";
import { ed25519 as curveEd25519, x25519 } from "@noble/curves/ed25519.js";
import { blake3 } from "@noble/hashes/blake3.js";
import { sha512 } from "@noble/hashes/sha2.js";
import {
  LOG_POW_BITS,
  leadingZeroBits,
  logEntryMessage,
  logEntryMessage2,
  lp as sharedLp,
  profileMessageV3,
  profileMessageV4,
} from "../../shared/protocol.js";
import type { UserIdentity } from "./types.ts";

// Configure noble/ed25519 to use sha512
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = (...m) => Promise.resolve(sha512(ed.etc.concatBytes(...m)));

import {
  getStoredSession,
  getAppKeySecret,
  appPath,
  personaName,
  toBase58,
  fromBase58,
} from "./whoiam.ts";

import { safeStorage } from "./storage.ts";

export const bytesToHex = ed.etc.bytesToHex;
export const hexToBytes = ed.etc.hexToBytes;
export { personaName, toBase58, fromBase58 };

const enc = new TextEncoder();
const STORAGE_KEY = "radica_ed25519_seed";
const LEGACY_STORAGE_KEY = "spruce_ed25519_seed";

/** The signed-in identity, or null when the visitor has not signed in yet: nothing is created behind their back. */
export async function getIdentity(): Promise<UserIdentity | null> {
  const session = getStoredSession();

  if (session && session.type === "viso") {
    const appSk = await getAppKeySecret();
    const appPub = ed.etc.bytesToHex(await ed.getPublicKeyAsync(appSk));
    // the contracts accept writes only from the app key the Viso certificate names: a lost app key makes every write "bad signature"
    if (session.cert?.challenge.split(".")[1] !== appPub) {
      safeStorage.removeItem("radica_session");
      (globalThis as any).alert?.("Your Viso sign-in no longer matches this device's app key, so the network would refuse your posts. Sign in with Viso again from the Identity panel.");
      return getIdentity();
    }
    return {
      pubkey: session.persona,
      secretKey: appSk,
      type: "viso",
      personaName: personaName(session.persona),
      cert: session.cert,
      encPub: ed.etc.bytesToHex(await ed.getPublicKeyAsync(appSk)),
      sign: async (msg: string) => {
        const msgBytes = enc.encode(msg);
        const sig = await ed.signAsync(msgBytes, appSk);
        return ed.etc.bytesToHex(sig);
      },
    };
  }

  let hexSeed = safeStorage.getItem(STORAGE_KEY) || safeStorage.getItem(LEGACY_STORAGE_KEY);
  if (!hexSeed || hexSeed.length !== 64) return null;

  const secretKey = ed.etc.hexToBytes(hexSeed);
  const pubkeyBytes = await ed.getPublicKeyAsync(secretKey);
  const pubkey = ed.etc.bytesToHex(pubkeyBytes);

  return {
    pubkey,
    secretKey,
    type: "local",
    personaName: personaName(pubkey),
    encPub: pubkey,
    sign: async (msg: string) => {
      const msgBytes = enc.encode(msg);
      const sig = await ed.signAsync(msgBytes, secretKey);
      return ed.etc.bytesToHex(sig);
    },
  };
}

// Logs are checked whole on every refresh (takeLog verifies local entries too): the cache must hold every entry of every
// log, or a log bigger than it misses on every entry, every time (seconds of main-thread ed25519 per refresh).
const MAX_SIG_CACHE = 50_000;
const sigVerifyCache = new Map<string, boolean>(); // keys are one 64-char hash: ~5 MB when full

/** Ed25519 check of a hex signature by a hex pubkey; false on any malformed input. Cached by pubkey, signature, and message hash. */
export async function verifySignature(msg: string, sigHex: string, pubHex: string): Promise<boolean> {
  if (!sigHex || !pubHex) return false;
  const cacheKey = bytesToHex(blake3(enc.encode(`${pubHex}:${sigHex}:${msg}`)));
  const hit = sigVerifyCache.get(cacheKey);
  if (hit !== undefined) return hit;
  try {
    const ok = await ed.verifyAsync(ed.etc.hexToBytes(sigHex), enc.encode(msg), ed.etc.hexToBytes(pubHex));
    if (sigVerifyCache.size >= MAX_SIG_CACHE) {
      const oldest = sigVerifyCache.keys().next().value;
      if (oldest) sigVerifyCache.delete(oldest);
    }
    sigVerifyCache.set(cacheKey, ok);
    return ok;
  } catch {
    return false;
  }
}

const proofCache = new Map<string, boolean>();

/** Verify a record signed directly by `authorHex` or via a Viso delegation `cert` for this app. */
export async function verifyAuthorSignature(
  msg: string,
  sigHex: string,
  authorHex: string,
  cert?: { base: string; challenge: string; ts: number; sig: string },
): Promise<boolean> {
  if (!sigHex || !authorHex) return false;
  if (!cert) return verifySignature(msg, sigHex, authorHex);
  const m = /^wd1\.([0-9a-f]{64})\.[0-9a-f]+$/i.exec(cert.challenge ?? "");
  if (!m) return false;
  const app = appPath();
  if (app.startsWith("/v1/contract/web/")) {
    try {
      if (new URL(cert.base).pathname.replace(/\/+$/, "") !== app.replace(/\/+$/, "")) return false;
    } catch {
      return false;
    }
  }
  // one delegation signs all of a persona's entries: check it once, not once per entry (up to three ed25519 checks each)
  const proofKey = `${authorHex}:${cert.sig}:${cert.challenge}:${cert.ts}:${cert.base}`;
  let proofOk = proofCache.get(proofKey);
  if (proofOk === undefined) {
    const { verifyProof } = await import("./whoiam.ts");
    proofOk = await verifyProof({ ...cert, pk: authorHex });
    if (proofCache.size >= MAX_SIG_CACHE) proofCache.delete(proofCache.keys().next().value!);
    proofCache.set(proofKey, proofOk);
  }
  if (!proofOk) return false;
  return verifySignature(msg, sigHex, m[1].toLowerCase());
}

/** Log entry message: must match log-contract/src/lib.rs entry_msg. `log` is the name without the "radica/" prefix. */
export function formatLogEntryMessage(log: string, author: string, id: string, ts: number, body: string): string {
  return logEntryMessage(log, appPath(), author, id, ts, body);
}

/** v2 log entry message (entries with `v: 2`): must match log-contract/src/lib.rs entry_msg2. The body goes in by its
 *  BLAKE3 hash, so grinding the nonce stays cheap whatever its size. */
export function logMsg2(log: string, author: string, id: string, ts: number, body: string, nonce: number): string {
  return logEntryMessage2(log, appPath(), author, id, ts, ed.etc.bytesToHex(blake3(enc.encode(body))), nonce);
}

// Feed contract messages: must match contract/src/lib.rs exactly.
export function formatPostSignatureMessage(p: {
  id: string;
  author: string;
  category: string;
  caption: string;
  media_uri?: string;
  community_id?: string;
  location?: string;
  event_date?: string;
  is_nsfw?: boolean;
  timestamp: number;
}): string {
  return `radica/post/v2:${p.id}:${p.author}:${p.category}:${p.caption}:${p.media_uri || ""}:${p.community_id || ""}:${p.location || ""}:${p.event_date || ""}:${!!p.is_nsfw}:${p.timestamp}`;
}

export function formatCommentSignatureMessage(
  id: string,
  post_id: string,
  author: string,
  text: string,
  timestamp: number
): string {
  return `radica/comment/v2:${id}:${post_id}:${author}:${text}:${timestamp}`;
}

export function formatProfileSignatureMessage(
  owner: string,
  displayName: string,
  bio: string,
  avatarUrl: string,
  encPub: string,
  updatedAt: number
): string {
  return profileMessageV3(owner, displayName, bio, avatarUrl, encPub, updatedAt);
}

export function formatLikeSignatureMessage(owner: string, postId: string, liker: string, liked: boolean, ts: number): string {
  return `radica/like/v2:${owner}:${postId}:${liker}:${liked}:${ts}`;
}

/** `following` is sorted here, like the contract's BTreeSet. */
export function formatFollowingSignatureMessage(owner: string, updatedAt: number, following: string[]): string {
  return `radica/following/v2:${owner}:${updatedAt}:${[...following].sort().join(",")}`;
}

export function formatDeleteSignatureMessage(owner: string, postId: string): string {
  return `radica/delete/v2:${owner}:${postId}`;
}

// v3 feed messages (records with `v: 3`): `<tag>|` then each field as `<UTF-8 byte length>:<bytes>`, so a message reads
// back one way only. Must match contract/src/lib.rs `lp` and its *_msg3 builders exactly.
export const lp = sharedLp;
type PostFields = Parameters<typeof formatPostSignatureMessage>[0];
export const postMsg3 = (p: PostFields) =>
  lp("radica/post/v3", [p.id, p.author, p.category, p.caption, p.media_uri || "", p.community_id || "", p.location || "", p.event_date || "", !!p.is_nsfw, p.timestamp]);
export const commentMsg3 = (owner: string, c: { id: string; post_id: string; author: string; text: string; timestamp: number; nonce?: number }) =>
  lp("radica/comment/v3", [owner, c.post_id, c.id, c.author, c.text, c.timestamp, c.nonce ?? 0]);
export const likeMsg3 = (owner: string, postId: string, liker: string, l: { liked: boolean; ts: number; nonce?: number }) =>
  lp("radica/like/v3", [owner, postId, liker, l.liked, l.ts, l.nonce ?? 0]);
export const profileMsg4 = (owner: string, p: { display_name: string; bio: string; avatar_url: string; enc_pub?: string; updated_at: number }) =>
  profileMessageV4(owner, p);
/** `following` sorted by code unit, like the contract's BTreeSet of hex keys. */
export const followingMsg3 = (owner: string, updatedAt: number, following: string[]) =>
  lp("radica/following/v3", [owner, updatedAt, ...[...following].sort()]);
export const deleteMsg3 = (owner: string, postId: string) => lp("radica/delete/v3", [owner, postId]);

/** The feed contract's proof of work: comments and likes on someone else's feed need this many leading zero bits of BLAKE3(message). */
export const FEED_POW_BITS = LOG_POW_BITS;
export function powBits(msg: string): number {
  return leadingZeroBits(blake3(enc.encode(msg)));
}
/** The first nonce whose message meets FEED_POW_BITS (about 4k BLAKE3 hashes; hashing only, the signature comes once after). */
export function grindNonce(msgOf: (nonce: number) => string, from = 0): number {
  let n = from;
  while (powBits(msgOf(n)) < FEED_POW_BITS) n++;
  return n;
}

export function formatChatMessageSignatureMessage(
  id: string,
  roomId: string,
  sender: string,
  recipient: string = "community",
  text: string,
  timestamp: number
): string {
  return `${id}:${roomId}:${sender}:${recipient || "community"}:${text}:${timestamp}`;
}

export function formatCommunitySignatureMessage(
  id: string,
  slug: string,
  name: string,
  creator: string,
  createdAt: number
): string {
  return `${id}:${slug}:${name}:${creator}:${createdAt}`;
}

export function formatModActionSignatureMessage(
  communityId: string,
  action: "add_mod" | "remove_mod" | "delete_post",
  target: string,
  by: string,
  timestamp: number
): string {
  return `${communityId}:${action}:${target}:${by}:${timestamp}`;
}

// -------------------------------------------------------------
// 1-on-1 End-to-End Encryption (E2EE) via X25519 ECDH + AES-GCM
// -------------------------------------------------------------

const sharedKeyCache: Map<string, CryptoKey> = new Map();

export async function getSharedKey(mySecretKey: Uint8Array, peerPubkeyHex: string): Promise<CryptoKey> {
  const cacheKey = `${ed.etc.bytesToHex(mySecretKey.slice(0, 8))}_${peerPubkeyHex}`;
  const existing = sharedKeyCache.get(cacheKey);
  if (existing) return existing;

  // Convert Ed25519 secret and pubkey to Montgomery X25519 points
  const mySecX = curveEd25519.utils.toMontgomerySecret(mySecretKey);
  const peerPubBytes = ed.etc.hexToBytes(peerPubkeyHex);
  const peerPubX = curveEd25519.utils.toMontgomery(peerPubBytes);
  const sharedBytes = x25519.getSharedSecret(mySecX, peerPubX);

  const key = await crypto.subtle.importKey(
    "raw",
    sharedBytes as any,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  sharedKeyCache.set(cacheKey, key);
  return key;
}

export async function encryptDirectMessage(
  mySecretKey: Uint8Array,
  peerPubkeyHex: string,
  plaintext: string
): Promise<string> {
  try {
    const key = await getSharedKey(mySecretKey, peerPubkeyHex);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = enc.encode(plaintext);
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as any },
      key,
      encoded as any
    );
    const ivHex = ed.etc.bytesToHex(iv);
    const cipherHex = ed.etc.bytesToHex(new Uint8Array(ciphertextBuffer));
    return `e2e:${ivHex}:${cipherHex}`;
  } catch (err) {
    console.error("Encryption failed, refusing to send plaintext:", err);
    throw err; // never fall back to sending the message unencrypted
  }
}

/** App keys this device used before Viso's shared one replaced them: kept only to read what was sent to them. */
const readKeys: Uint8Array[] = [];
let readEncPubsP: Promise<string[]> | null = null;
export function addReadKeys(hexes: string[]): void {
  for (const h of hexes)
    if (/^[0-9a-f]{64}$/.test(h) && !readKeys.some((k) => ed.etc.bytesToHex(k) === h)) {
      readKeys.push(ed.etc.hexToBytes(h));
      readEncPubsP = null;
    }
}
/** The public keys of those old app keys (a message may carry a copy encrypted to one of them). */
export const readEncPubs = (): Promise<string[]> =>
  (readEncPubsP ??= Promise.all(readKeys.map(async (k) => ed.etc.bytesToHex(await ed.getPublicKeyAsync(k)))));

export async function decryptDirectMessage(
  mySecretKey: Uint8Array,
  peerPubkeyHex: string,
  messageText: string
): Promise<string> {
  if (!messageText || !messageText.startsWith("e2e:")) {
    return messageText;
  }
  const parts = messageText.split(":");
  if (parts.length !== 3) return messageText;
  const [, ivHex, cipherHex] = parts;
  for (const sk of [mySecretKey, ...readKeys]) {
    try {
      const key = await getSharedKey(sk, peerPubkeyHex);
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ed.etc.hexToBytes(ivHex) as any },
        key,
        ed.etc.hexToBytes(cipherHex) as any
      );
      return new TextDecoder().decode(decryptedBuffer);
    } catch {
      // not this key: try the next one
    }
  }
  console.warn("Decryption failed for direct message");
  return "[Encrypted message - unable to decrypt]";
}

// -------------------------------------------------------------
// E2EE Private Room Group Encryption (AES-256-GCM + X25519)
// -------------------------------------------------------------

export function generateRoomKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function formatPrivateRoomSignatureMessage(
  id: string,
  creator: string,
  createdAt: number
): string {
  return `${id}:${creator}:${createdAt}`;
}

const symmetricKeyCache: Map<string, CryptoKey> = new Map();

async function getCryptoKeyFromBytes(keyBytes: Uint8Array): Promise<CryptoKey> {
  const hexKey = ed.etc.bytesToHex(keyBytes);
  const existing = symmetricKeyCache.get(hexKey);
  if (existing) return existing;

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as any,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  symmetricKeyCache.set(hexKey, key);
  return key;
}

export async function encryptWithSymmetricKey(
  keyBytes: Uint8Array,
  plaintext: string
): Promise<string> {
  try {
    const key = await getCryptoKeyFromBytes(keyBytes);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = enc.encode(plaintext);
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as any },
      key,
      encoded as any
    );
    const ivHex = ed.etc.bytesToHex(iv);
    const cipherHex = ed.etc.bytesToHex(new Uint8Array(ciphertextBuffer));
    return `sym:${ivHex}:${cipherHex}`;
  } catch (err) {
    console.error("Symmetric room encryption failed:", err);
    throw err; // never fall back to sending the message unencrypted
  }
}

export async function decryptWithSymmetricKey(
  keyBytes: Uint8Array,
  messageText: string
): Promise<string> {
  if (!messageText || !messageText.startsWith("sym:")) {
    return messageText;
  }
  try {
    const parts = messageText.split(":");
    if (parts.length !== 3) return messageText;
    const [, ivHex, cipherHex] = parts;
    const iv = ed.etc.hexToBytes(ivHex);
    const ciphertext = ed.etc.hexToBytes(cipherHex);
    const key = await getCryptoKeyFromBytes(keyBytes);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as any },
      key,
      ciphertext as any
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    console.warn("Symmetric room decryption failed:", err);
    return "[Encrypted room message - unable to decrypt]";
  }
}

export async function encryptRoomKeyForPeer(
  mySecretKey: Uint8Array,
  peerPubkeyHex: string,
  roomKeyBytes: Uint8Array
): Promise<string> {
  const hexKey = ed.etc.bytesToHex(roomKeyBytes);
  return await encryptDirectMessage(mySecretKey, peerPubkeyHex, hexKey);
}

export async function decryptRoomKeyFromPeer(
  mySecretKey: Uint8Array,
  peerPubkeyHex: string,
  encryptedKeyString: string
): Promise<Uint8Array | null> {
  try {
    const decryptedHex = await decryptDirectMessage(
      mySecretKey,
      peerPubkeyHex,
      encryptedKeyString
    );
    if (!decryptedHex || decryptedHex.startsWith("[Encrypted")) {
      return null;
    }
    return ed.etc.hexToBytes(decryptedHex);
  } catch {
    return null;
  }
}

