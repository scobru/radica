// Secret Chat transport (see CONTEXT.md): storing, sending, reading and burning Secret Chat messages. The crypto is in
// secretChat.ts; this module only needs page storage, the blocklist, a room's stored messages and a way to deliver an
// entry to inbox logs, so FreenetClient plugs in the network and a test plugs in memory.

import type { ChatMessage, UserIdentity } from "./types.ts";
import { cancelMessageBurn, decryptSecretMessage, getActiveSecretChatTTL, getSecretChatSession, getSecretRoomId } from "./secretChat.ts";
import { drDecrypt, drEncrypt, PREFIX_V2 } from "./secretRatchet.ts";
import { burnAtOf } from "./conversationState.ts";
import { formatChatMessageSignatureMessage } from "./crypto.ts";

export interface SecretChatTransport {
  /** Page storage (messages, peers). */
  store: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  /** People `me` has blocked. */
  blockedBy(me: string): Set<string>;
  /** A room's stored messages, without those before the last time I cleared it. */
  visibleChat(roomId: string): ChatMessage[];
  /** Deliver `entry` live to open tabs and peers, and into each of these inbox logs. */
  deliver(entry: object, inboxes: string[]): Promise<void>;
  /** The key `pubkey` decrypts with (Viso: their app key). */
  encPubOf(pubkey: string): Promise<string>;
}

/** The scratchpad keeps the newest messages of a Secret Chat only. */
const MAX_STORED = 25;
const UNREADABLE = "[Secret message - unable to decrypt or forward secrecy key expired]";

const peersKey = (me: string) => `radica_secret_peers_${me}`;
const removedKey = (me: string, peer: string) => `radica_secret_removed_${me}_${peer}`;
const roomKey = (roomId: string) => `freenet_chat_${roomId}`;
const readList = <T>(t: SecretChatTransport, key: string): T[] => JSON.parse(t.store.getItem(key) || "[]");

// A v2 message key is deleted once used, so a message opens once: its plain text is kept here, on this device only.
interface Plain {
  /** The room, to drop entries whose message is gone. */
  r: string;
  /** The ciphertext's tail: an edit is a new ciphertext under the same id. */
  c: string;
  text: string;
  ttl: number;
  sentAt: number;
}
const plainKey = (me: string) => `radica_secret_plain_${me}`;
// shortcut: the newest plain texts within 64 KB, so the durable package (256 KB cap) is never refused; older ones read as unreadable after a reload
const PLAIN_MAX_BYTES = 64 * 1024;
const tagOf = (ciphertext: string) => ciphertext.slice(-32);
const readPlain = (t: SecretChatTransport, me: string): Record<string, Plain> => JSON.parse(t.store.getItem(plainKey(me)) || "{}");
function writePlain(t: SecretChatTransport, me: string, plain: Record<string, Plain>): void {
  const entries = Object.entries(plain).sort((a, z) => z[1].sentAt - a[1].sentAt);
  let json = JSON.stringify(Object.fromEntries(entries));
  while (json.length > PLAIN_MAX_BYTES && entries.length) {
    entries.pop();
    json = JSON.stringify(Object.fromEntries(entries));
  }
  t.store.setItem(plainKey(me), json);
}
function keepPlain(t: SecretChatTransport, me: string, id: string, p: Plain): void {
  writePlain(t, me, { ...readPlain(t, me), [id]: p });
}

// One ratchet step at a time per (me, peer): two overlapping reads would each draw a random ratchet key and the last
// save would win, splitting the session from the peer's.
// shortcut: per page only; two tabs of one identity can still race, add a lock (Web Locks API) if that is ever seen
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(fn, fn);
  queues.set(key, run.catch(() => {}));
  return run;
}

export function secretChatPeers(t: SecretChatTransport, me: string): string[] {
  const blocked = t.blockedBy(me);
  return readList<string>(t, peersKey(me)).filter((p) => !blocked.has(p));
}

/** `ts`: when the message that adds the peer was sent; a chat I removed comes back only with a newer message. */
export function addSecretChatPeer(t: SecretChatTransport, me: string, peer: string, ts = Date.now()): void {
  if (!me || !peer || me === peer || t.blockedBy(me).has(peer)) return;
  if (ts <= Number(t.store.getItem(removedKey(me, peer)) || 0)) return;
  const peers = readList<string>(t, peersKey(me));
  if (!peers.includes(peer)) t.store.setItem(peersKey(me), JSON.stringify([...peers, peer]));
}

export function removeSecretChatPeer(t: SecretChatTransport, me: string, peer: string): void {
  if (!me || !peer) return;
  // the inbox log still holds the old messages: remember when, or the next refresh brings the chat back
  t.store.setItem(removedKey(me, peer), String(Date.now()));
  t.store.setItem(peersKey(me), JSON.stringify(readList<string>(t, peersKey(me)).filter((p) => p !== peer)));
}

/** Seal `text` with a fresh ratchet key, keep the ciphertext, and deliver it to both inboxes. Returns the message with
 *  its plain text, for the sender's own screen. */
export async function sendSecretChatMessage(
  t: SecretChatTransport,
  identity: UserIdentity,
  recipient: string,
  text: string,
  ttlSeconds?: number,
  replyTo?: string,
  /** The id of the placeholder already on screen, so the real message replaces it instead of showing beside it. */
  id = `scmsg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
): Promise<ChatMessage> {
  const roomId = getSecretRoomId(identity.pubkey, recipient);
  const timestamp = Date.now();
  const ttl = ttlSeconds ?? getActiveSecretChatTTL(roomId);

  // shortcut: sealed to the peer's profile key only, so a Viso peer's other devices cannot read it; add per-device copies like DMs if asked
  const toEncPub = await t.encPubOf(recipient);
  const ciphertext = await serial(`${identity.pubkey}|${recipient}`, () =>
    drEncrypt(t.store, identity.secretKey, identity.pubkey, recipient, toEncPub, { text, ttl, sentAt: timestamp })
  );
  keepPlain(t, identity.pubkey, id, { r: roomId, c: tagOf(ciphertext), text, ttl, sentAt: timestamp });
  const sig = await identity.sign(formatChatMessageSignatureMessage(id, roomId, identity.pubkey, recipient, ciphertext, timestamp));

  const message: ChatMessage = {
    id,
    room_id: roomId,
    sender: identity.pubkey,
    recipient,
    text: ciphertext,
    timestamp,
    sig,
    is_secret: true,
    enc_pub: identity.encPub,
    to_enc_pub: toEncPub,
    ttl_seconds: ttl,
    burn_at: ttl > 0 ? timestamp + ttl * 1000 : undefined,
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  const stored = [...readList<ChatMessage>(t, roomKey(roomId)).filter((m) => m.id !== id), message].slice(-MAX_STORED);
  t.store.setItem(roomKey(roomId), JSON.stringify(stored)); // ciphertext at rest

  addSecretChatPeer(t, identity.pubkey, recipient);
  addSecretChatPeer(t, recipient, identity.pubkey);
  await t.deliver({ type: "chat", message }, [recipient, identity.pubkey]);
  return { ...message, text };
}

/** Replace the text of my own Secret Chat message: sealed anew like a message (never as plain text, an inbox log is public)
 *  and delivered to both inboxes, where it takes the old ciphertext's place. */
export async function editSecretMessage(t: SecretChatTransport, identity: UserIdentity, peer: string, messageId: string, newText: string): Promise<void> {
  const roomId = getSecretRoomId(identity.pubkey, peer);
  const list = readList<ChatMessage>(t, roomKey(roomId));
  const msg = list.find((m) => m.id === messageId);
  if (!msg || msg.sender !== identity.pubkey) throw new Error("Only my own message can be edited");
  const ttl = msg.ttl_seconds ?? 0; // the message keeps its burn time
  const toEncPub = msg.to_enc_pub || (await t.encPubOf(peer));
  const ciphertext = await serial(`${identity.pubkey}|${peer}`, () =>
    drEncrypt(t.store, identity.secretKey, identity.pubkey, peer, toEncPub, { text: newText, ttl, sentAt: msg.timestamp })
  );
  keepPlain(t, identity.pubkey, messageId, { r: roomId, c: tagOf(ciphertext), text: newText, ttl, sentAt: msg.timestamp });
  msg.text = ciphertext;
  msg.edited_at = Date.now();
  t.store.setItem(roomKey(roomId), JSON.stringify(list));
  await t.deliver({ type: "chat_edit", roomId, messageId, text: ciphertext }, [peer, identity.pubkey]);
}

const secretPlainCache = new Map<string, { text: string; ttl: number }>();

/** The Secret Chat with `peer`, decrypted; messages past their burn time are dropped from storage. */
export async function readSecretChat(t: SecretChatTransport, identity: UserIdentity, peer: string): Promise<ChatMessage[]> {
  const me = identity.pubkey;
  const roomId = getSecretRoomId(me, peer);
  const messages = t.visibleChat(roomId);
  const now = Date.now();
  const live = messages.filter((m) => !m.burn_at || m.burn_at > now);
  if (live.length !== messages.length) t.store.setItem(roomKey(roomId), JSON.stringify(live));

  // v2: one at a time and oldest first, since each message moves the ratchet
  const plain = await serial(`${me}|${peer}`, async () => {
    const plain = readPlain(t, me);
    let plainChanged = false;
    // forgotten when its own timer is up, never for missing from the room: after a reload the room comes back from
    // the network later, and a key that opened a message once cannot open it again.
    // shortcut: a message the peer deleted keeps its plain text here until PLAIN_MAX_BYTES evicts it; drop it in the
    // chat_delete handler if that matters.
    for (const [id, p] of Object.entries(plain))
      if (p.r === roomId && p.ttl > 0 && p.sentAt + p.ttl * 1000 <= now) {
        delete plain[id];
        plainChanged = true;
      }
    for (const msg of [...live].sort((a, z) => a.timestamp - z.timestamp)) {
      if (!msg.text?.startsWith(PREFIX_V2) || plain[msg.id]?.c === tagOf(msg.text)) continue;
      if (msg.sender === me) continue; // mine from another device: its key never was here
      try {
        const d = (await drDecrypt(t.store, identity.secretKey, me, peer, msg.enc_pub || peer, msg.text)) as Partial<Plain>;
        const ttl = typeof d.ttl === "number" ? d.ttl : 0;
        plain[msg.id] = { r: roomId, c: tagOf(msg.text), text: typeof d.text === "string" ? d.text : "", ttl, sentAt: typeof d.sentAt === "number" ? d.sentAt : msg.timestamp };
        plainChanged = true;
      } catch {
        // not ours, damaged, or its key already used: shown as unreadable below
      }
    }
    if (plainChanged) writePlain(t, me, plain);
    return plain;
  });

  const sessionEphem = getSecretChatSession(me, peer)?.ephemeralPub ?? "";

  return Promise.all(
    live.map(async (msg) => {
      if (msg.text?.startsWith(PREFIX_V2)) {
        const p = plain[msg.id];
        if (!p || p.c !== tagOf(msg.text)) return { ...msg, text: UNREADABLE };
        return { ...msg, text: p.text, ttl_seconds: p.ttl, burn_at: burnAtOf({ ...msg, ttl_seconds: p.ttl }) };
      }
      if (!msg.text?.startsWith("secret:v1:")) return { ...msg, text: UNREADABLE };
      // v1, before the Double Ratchet: still opened from the identity key, for the messages sent with it
      const outgoing = msg.sender === me;
      const cacheKey = `${me}|${peer}|${outgoing ? sessionEphem : "in"}|${msg.text}`;
      const hit = secretPlainCache.get(cacheKey);
      if (hit) {
        return { ...msg, text: hit.text, ttl_seconds: hit.ttl, burn_at: burnAtOf({ ...msg, ttl_seconds: hit.ttl }) };
      }
      try {
        const peerEnc = (outgoing ? msg.to_enc_pub : msg.enc_pub) || peer;
        const dec = await decryptSecretMessage(identity.secretKey, me, peer, msg.text, outgoing, peerEnc);
        if (secretPlainCache.size >= 1024) secretPlainCache.clear();
        secretPlainCache.set(cacheKey, { text: dec.text, ttl: dec.ttl });
        return { ...msg, text: dec.text, ttl_seconds: dec.ttl, burn_at: burnAtOf({ ...msg, ttl_seconds: dec.ttl }) };
      } catch {
        return { ...msg, text: UNREADABLE };
      }
    })
  );
}

/** Remove a message here and tell my other devices and the peer to remove it too. */
export function burnSecretMessage(t: SecretChatTransport, roomId: string, messageId: string, me?: string, peer?: string): void {
  cancelMessageBurn(messageId);
  t.store.setItem(roomKey(roomId), JSON.stringify(readList<ChatMessage>(t, roomKey(roomId)).filter((m) => m.id !== messageId)));
  if (me) {
    const plain = readPlain(t, me);
    if (plain[messageId]) {
      delete plain[messageId];
      writePlain(t, me, plain);
    }
  }
  const inboxes = [me, peer].filter((k): k is string => !!k);
  void t.deliver({ type: "chat_burn", roomId, messageId }, inboxes).catch(() => {});
}
