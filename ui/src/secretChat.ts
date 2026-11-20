// Secret Chat (Chat Segreta) Engine
// Implements Ephemeral Per-Message Ratchet Key Derivation (Perfect Forward Secrecy / PFS),
// Single-Device Local-Only Storage, Disappearing Messages (TTL auto-destruction),
// and Ephemeral Storage Slot Synchronization for Radica / Freenet.

import * as ed from "@noble/ed25519";
import { ed25519 as curveEd25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { SecretChatSession, ChatMessage } from "./types.ts";
import { safeStorage } from "./storage.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

export const SESSIONS_STORAGE_KEY = "radica_secret_sessions";
export const ACTIVE_TTL_STORAGE_KEY = "radica_secret_active_ttl";

export const TTL_PRESETS: { seconds: number; label: string }[] = [
  { seconds: 0, label: "Off" },
  { seconds: 10, label: "10s" },
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 300, label: "5m" },
  { seconds: 3600, label: "1h" },
  { seconds: 86400, label: "24h" },
];

export function formatTtlLabel(seconds?: number): string {
  if (!seconds || seconds <= 0) return "Off";
  const match = TTL_PRESETS.find((p) => p.seconds === seconds);
  if (match) return match.label;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export function getSecretRoomId(userA: string, userB: string): string {
  const [p1, p2] = [userA, userB].sort();
  return `secret_${p1}_${p2}`;
}

export function isSecretRoomId(roomId: string): boolean {
  return typeof roomId === "string" && roomId.startsWith("secret_");
}

export function peerFromSecretRoomId(roomId: string, myPubkey: string): string {
  if (!isSecretRoomId(roomId)) return "";
  const parts = roomId.slice(7).split("_");
  if (parts.length < 2) return "";
  return parts[0] === myPubkey ? parts[1] : parts[0];
}

const montPubCache = new Map<string, Uint8Array>();
const montPrivCache = new WeakMap<Uint8Array, Uint8Array>();

/** Convert an Ed25519 public key hex to an X25519 Montgomery public key. */
export function toMontgomeryPub(edPubHex: string): Uint8Array {
  let hit = montPubCache.get(edPubHex);
  if (hit) return hit;
  hit = curveEd25519.utils.toMontgomery(ed.etc.hexToBytes(edPubHex));
  if (montPubCache.size >= 512) montPubCache.clear();
  montPubCache.set(edPubHex, hit);
  return hit;
}

/** Convert an Ed25519 secret key to an X25519 Montgomery secret key. */
export function toMontgomeryPriv(edPrivBytes: Uint8Array): Uint8Array {
  let hit = montPrivCache.get(edPrivBytes);
  if (hit) return hit;
  hit = curveEd25519.utils.toMontgomerySecret(edPrivBytes);
  montPrivCache.set(edPrivBytes, hit);
  return hit;
}

/** HKDF SHA-256 derivation helper */
export function kdf(secret: Uint8Array, saltStr: string, infoStr: string, length = 32): Uint8Array {
  return hkdf(sha256, secret, enc.encode(saltStr), enc.encode(infoStr), length);
}

/** Generate a fresh Montgomery X25519 ephemeral keypair */
export function generateEphemeralKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const priv = crypto.getRandomValues(new Uint8Array(32));
  const pub = x25519.getPublicKey(priv);
  return { privateKey: priv, publicKey: pub };
}

/** Load secret chat sessions strictly from local device storage */
export function loadSecretChatSessions(): Record<string, SecretChatSession> {
  try {
    const raw = safeStorage.getItem(SESSIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Save a secret chat session strictly to local device storage */
export function saveSecretChatSession(session: SecretChatSession): void {
  const sessions = loadSecretChatSessions();
  sessions[session.sessionId] = session;
  safeStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
}

/** Retrieve an existing session for a peer, or null if none */
export function getSecretChatSession(myPubkey: string, peerPubkey: string): SecretChatSession | null {
  const [p1, p2] = [myPubkey, peerPubkey].sort();
  const sessionId = `sc_${p1}_${p2}`;
  const sessions = loadSecretChatSessions();
  return sessions[sessionId] || null;
}

/** Clear / reset a secret chat session */
export function clearSecretChatSession(myPubkey: string, peerPubkey: string): void {
  const [p1, p2] = [myPubkey, peerPubkey].sort();
  const sessionId = `sc_${p1}_${p2}`;
  const sessions = loadSecretChatSessions();
  delete sessions[sessionId];
  safeStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
}

/** Get active TTL for a secret chat room */
export function getActiveSecretChatTTL(roomId: string): number {
  try {
    const raw = safeStorage.getItem(`${ACTIVE_TTL_STORAGE_KEY}_${roomId}`);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/** Set active TTL for a secret chat room */
export function setActiveSecretChatTTL(roomId: string, ttlSeconds: number): void {
  safeStorage.setItem(`${ACTIVE_TTL_STORAGE_KEY}_${roomId}`, String(Math.max(0, ttlSeconds)));
}

/**
 * Initializes or loads a Secret Chat session.
 * Derives the initial root key and directional chain keys via Diffie-Hellman + HKDF.
 */
export function getOrCreateSecretSession(
  mySecretKey: Uint8Array,
  myPubkey: string,
  peerPubkey: string,
  initialTtl?: number,
  peerEncPub = peerPubkey
): SecretChatSession {
  const [p1, p2] = [myPubkey, peerPubkey].sort();
  const sessionId = `sc_${p1}_${p2}`;
  // A Viso user's key is their app key, not the persona: the key exchange must use the keys both sides really hold.
  const myEncPub = ed.etc.bytesToHex(curveEd25519.getPublicKey(mySecretKey));
  const existing = getSecretChatSession(myPubkey, peerPubkey);
  if (existing && (existing.peerEncPub ?? existing.peerPubkey) === peerEncPub && (existing.myEncPub ?? myEncPub) === myEncPub) {
    if (initialTtl !== undefined && initialTtl >= 0 && existing.ttlSeconds !== initialTtl) {
      existing.ttlSeconds = initialTtl;
      saveSecretChatSession(existing);
    }
    return existing;
  }

  // Generate local ephemeral keypair
  const ephem = generateEphemeralKeyPair();
  const myMontPriv = toMontgomeryPriv(mySecretKey);
  const peerMontPub = toMontgomeryPub(peerEncPub);

  // Initial Diffie-Hellman: mix ephemeral DH with identity DH
  const dh1 = x25519.getSharedSecret(ephem.privateKey, peerMontPub);
  const dh2 = x25519.getSharedSecret(myMontPriv, peerMontPub);
  const combinedDh = ed.etc.concatBytes(dh1, dh2);

  const rootKey = kdf(combinedDh, "radica_secret_chat_v1", "root");
  // Directional chains: lexicographical order guarantees both sides agree on send vs recv
  const isA = myPubkey < peerPubkey;
  const sendChainKey = kdf(rootKey, "chain_salt", isA ? "chain_a_to_b" : "chain_b_to_a");
  const recvChainKey = kdf(rootKey, "chain_salt", isA ? "chain_b_to_a" : "chain_a_to_b");

  const session: SecretChatSession = {
    sessionId,
    peerPubkey,
    myPubkey,
    peerEncPub,
    myEncPub,
    rootKey: ed.etc.bytesToHex(rootKey),
    sendChainKey: ed.etc.bytesToHex(sendChainKey),
    recvChainKey: ed.etc.bytesToHex(recvChainKey),
    sendCount: 0,
    recvCount: 0,
    ttlSeconds: initialTtl !== undefined ? initialTtl : 0,
    ephemeralPriv: ed.etc.bytesToHex(ephem.privateKey),
    ephemeralPub: ed.etc.bytesToHex(ephem.publicKey),
    createdAt: Date.now(),
    lastActive: Date.now(),
  };

  saveSecretChatSession(session);
  return session;
}

/**
 * Encrypt a secret chat message using a fresh derived message key (Perfect Forward Secrecy).
 * Immediately advances the send chain and wipes the message key from memory.
 */
export async function encryptSecretMessage(
  session: SecretChatSession,
  plaintext: string,
  ttlSeconds?: number
): Promise<{ ciphertext: string; updatedSession: SecretChatSession; payload: any }> {
  const ttl = ttlSeconds !== undefined ? ttlSeconds : session.ttlSeconds;
  const sendChainBytes = ed.etc.hexToBytes(session.sendChainKey);

  // Derive per-message key from current send chain
  const msgKeyBytes = kdf(sendChainBytes, "msg_salt", `msg_key_${session.sendCount}`);

  // Ratchet forward: advance the send chain key
  const nextSendChainBytes = kdf(sendChainBytes, "ratchet_salt", `step_${session.sendCount}`);
  session.sendChainKey = ed.etc.bytesToHex(nextSendChainBytes);
  const msgIndex = session.sendCount;
  session.sendCount += 1;
  session.lastActive = Date.now();

  const payload = {
    text: plaintext,
    ttl,
    sentAt: Date.now(),
    index: msgIndex,
  };

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    msgKeyBytes as any,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  // Zero out the key bytes from memory
  msgKeyBytes.fill(0);

  const encoded = enc.encode(JSON.stringify(payload));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as any },
    cryptoKey,
    encoded as any
  );

  const ivHex = ed.etc.bytesToHex(iv);
  const cipherHex = ed.etc.bytesToHex(new Uint8Array(cipherBuffer));

  // Ephemeral package: "secret:v1:ephemeralPubHex:msgIndex:ivHex:cipherHex"
  const ciphertext = `secret:v1:${session.ephemeralPub}:${msgIndex}:${ivHex}:${cipherHex}`;

  saveSecretChatSession(session);
  return { ciphertext, updatedSession: session, payload };
}

// Cache directional base chain + ratcheted steps per (dhInputs) so reading a 25-msg thread is O(N) instead of O(N^2) X25519+HKDF
const chainStepsCache = new Map<string, Uint8Array[]>();

/**
 * Decrypt a secret chat message.
 * Derives the unique message key for the given index, decrypts, and forgets the key.
 */
export async function decryptSecretMessage(
  mySecretKey: Uint8Array,
  myPubkey: string,
  peerPubkey: string,
  ciphertext: string,
  outgoing = false,
  /** The key the message was sealed to (outgoing) or by (incoming): the message's to_enc_pub / enc_pub. */
  peerEncPub = peerPubkey
): Promise<{ text: string; ttl: number; sentAt: number; index: number }> {
  if (!ciphertext || !ciphertext.startsWith("secret:v1:")) {
    return { text: ciphertext, ttl: 0, sentAt: Date.now(), index: 0 };
  }

  const parts = ciphertext.split(":");
  if (parts.length !== 6) {
    throw new Error("Invalid secret message format");
  }

  const [, , peerEphemPubHex, indexStr, ivHex, cipherHex] = parts;
  if (!/^\d+$/.test(indexStr)) {
    throw new Error("Invalid secret message index");
  }
  const msgIndex = Number(indexStr);
  if (!Number.isInteger(msgIndex) || msgIndex < 0 || msgIndex > 500) {
    throw new Error("Invalid secret message index");
  }
  if (!/^[0-9a-f]{64}$/i.test(peerEphemPubHex)) {
    throw new Error("Invalid secret message key");
  }
  const iv = ed.etc.hexToBytes(ivHex);
  if (iv.length !== 12) {
    throw new Error("Invalid secret message IV");
  }
  const cipherBytes = ed.etc.hexToBytes(cipherHex);

  // Ensure session exists
  let session = getSecretChatSession(myPubkey, peerPubkey);
  if (!session) {
    session = getOrCreateSecretSession(mySecretKey, myPubkey, peerPubkey, undefined, peerEncPub);
  }

  // Our own message: re-derive it from our send chain with our ephemeral key.
  if (outgoing && peerEphemPubHex !== session.ephemeralPub) {
    throw new Error("Own secret message from a previous session");
  }

  let dirty = false;
  // Update peer ephemeral pubkey if provided
  if (!outgoing && peerEphemPubHex && peerEphemPubHex.length === 64 && session.peerEphemeralPub !== peerEphemPubHex) {
    session.peerEphemeralPub = peerEphemPubHex;
    dirty = true;
  }

  const isA = myPubkey < peerPubkey;
  const dir = isA !== outgoing ? "chain_b_to_a" : "chain_a_to_b";
  const chainKey = `${myPubkey}|${peerEncPub}|${peerEphemPubHex}|${outgoing ? session.ephemeralPub : "in"}|${dir}`;
  let steps = chainStepsCache.get(chainKey);
  if (!steps) {
    const myMontPriv = toMontgomeryPriv(mySecretKey);
    const peerEphemPub = ed.etc.hexToBytes(peerEphemPubHex);
    const peerMontPub = toMontgomeryPub(peerEncPub);

    const dh1 = outgoing
      ? x25519.getSharedSecret(ed.etc.hexToBytes(session.ephemeralPriv), peerMontPub)
      : x25519.getSharedSecret(myMontPriv, peerEphemPub);
    const dh2 = x25519.getSharedSecret(myMontPriv, peerMontPub);
    const combinedDh = ed.etc.concatBytes(dh1, dh2);
    const rootKey = kdf(combinedDh, "radica_secret_chat_v1", "root");
    steps = [kdf(rootKey, "chain_salt", dir)];
    if (chainStepsCache.size >= 128) chainStepsCache.clear();
    chainStepsCache.set(chainKey, steps);
  }
  while (steps.length <= msgIndex) {
    const prev = steps.length - 1;
    steps.push(kdf(steps[prev], "ratchet_salt", `step_${prev}`));
  }
  const msgKeyBytes = kdf(steps[msgIndex], "msg_salt", `msg_key_${msgIndex}`);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    msgKeyBytes as any,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // Zero out the key bytes
  msgKeyBytes.fill(0);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as any },
    cryptoKey,
    cipherBytes as any
  );

  const jsonStr = dec.decode(decryptedBuffer);
  const payload = JSON.parse(jsonStr);

  // Advance session recvCount and save ONLY when state actually changed (avoid storage+delegate writes on every read!)
  if (!outgoing && msgIndex >= session.recvCount) {
    session.recvCount = msgIndex + 1;
    session.lastActive = Date.now();
    dirty = true;
  }
  if (dirty) saveSecretChatSession(session);

  return {
    text: typeof payload.text === "string" ? payload.text : "",
    ttl: typeof payload.ttl === "number" ? payload.ttl : 0,
    sentAt: typeof payload.sentAt === "number" ? payload.sentAt : Date.now(),
    index: msgIndex,
  };
}

/** Active timer handles for auto-destructing messages */
const activeTimers = new Map<string, any>();

/**
 * Schedule a self-destruct callback for a message with a TTL.
 * Calls onBurn when the expiration time is reached.
 */
export function scheduleMessageBurn(
  messageId: string,
  burnAt: number,
  onBurn: () => void
): () => void {
  if (activeTimers.has(messageId)) {
    clearTimeout(activeTimers.get(messageId));
    activeTimers.delete(messageId);
  }

  const remainingMs = Math.max(0, burnAt - Date.now());
  if (remainingMs <= 0) {
    onBurn();
    return () => {};
  }

  const timer = setTimeout(() => {
    activeTimers.delete(messageId);
    onBurn();
  }, remainingMs);

  activeTimers.set(messageId, timer);
  return () => {
    clearTimeout(timer);
    activeTimers.delete(messageId);
  };
}

/** Cancel a scheduled message burn */
export function cancelMessageBurn(messageId: string): void {
  if (activeTimers.has(messageId)) {
    clearTimeout(activeTimers.get(messageId));
    activeTimers.delete(messageId);
  }
}
