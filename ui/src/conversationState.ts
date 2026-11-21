// Conversation state (see CONTEXT.md): everything about a conversation that is not the message text — when each
// message burns, how far the peer has read, who is typing, the next TTL. Both chat views (Messenger and Classic)
// read it from here instead of keeping their own copies.

import type { ChatMessage } from "./types.ts";
import { TTL_PRESETS, isSecretRoomId, peerFromSecretRoomId, scheduleMessageBurn } from "./secretChat.ts";

/** Send at most one "typing" signal per this many ms. */
export const TYPING_SEND_EVERY_MS = 2500;
/** A "typing" signal shows for this long unless another one arrives. */
export const TYPING_SHOWN_MS = 4000;

/** When a message burns, or undefined if it never does. */
export function burnAtOf(m: Pick<ChatMessage, "timestamp" | "ttl_seconds" | "burn_at">): number | undefined {
  if (m.burn_at) return m.burn_at;
  return m.ttl_seconds && m.ttl_seconds > 0 ? m.timestamp + m.ttl_seconds * 1000 : undefined;
}

/** The TTL after `current` in the preset cycle (Off → 10s → … → 24h → Off). */
export function nextTtl(current: number): number {
  const i = TTL_PRESETS.findIndex((p) => p.seconds === current);
  return TTL_PRESETS[(i + 1) % TTL_PRESETS.length].seconds;
}

/** The other person of a one-to-one conversation (direct message or Secret Chat); null for rooms and communities. */
export function dmPeerOf(roomId: string, me: string): string | null {
  if (isSecretRoomId(roomId)) return peerFromSecretRoomId(roomId, me) || null;
  const m = /^([0-9a-f]{64}):([0-9a-f]{64})$/.exec(roomId);
  if (!m) return null;
  return m[1] === me ? m[2] : m[2] === me ? m[1] : null;
}

export type Delivery = "sending" | "sent" | "read";

/** Where one of my messages stands: still going to the node, stored, or read by the peer (peer read mark). */
export function deliveryOf(m: Pick<ChatMessage, "id" | "timestamp" | "is_read">, peerReadUpto: number): Delivery {
  if (m.id.startsWith("msg_opt_")) return "sending";
  return m.is_read || (peerReadUpto > 0 && m.timestamp <= peerReadUpto) ? "read" : "sent";
}

/** The ✓ / ✓✓ marks of one of my messages; `prefix` is the view's class prefix ("rm" Messenger, "rv" Classic). */
export function checksHtml(delivery: Delivery, prefix: "rm" | "rv"): string {
  const title = delivery === "read" ? "Read by recipient" : delivery === "sending" ? "Sending to node…" : "Signed & stored on node";
  return `<span class="${prefix}-checks ${delivery === "read" ? "read" : ""}" title="${title}">${delivery === "sending" ? "✓" : "✓✓"}</span>`;
}

/** Animate and remove an expired message row with a smooth fade-away effect. */
export function triggerRowBurnAnimation(row: HTMLElement, onDone?: () => void): void {
  if (row.dataset.burning) return;
  row.dataset.burning = "1";

  const h = row.offsetHeight;
  if (h > 0) {
    row.style.setProperty("--rm-burn-start-height", `${h}px`);
    row.style.maxHeight = `${h}px`;
  }
  row.style.overflow = "hidden";
  row.classList.add(row.classList.contains("rm-msg-row") ? "rm-msg-burning" : "rv-msg-burning");

  setTimeout(() => {
    try {
      row.remove();
    } catch {}
    if (onDone) onDone();
  }, 650);
}

/** Format remaining burn time as compact human-readable text (`5s`, `1m 30s`, `1h 5m`). */
export function formatBurnRemaining(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Refresh every countdown ([data-burn-at]) under `root`; a run-out message fades out of the page. Removing it from
 *  storage is the job of `sweepBurns`, which runs whether or not the conversation is open. */
export function tickBurnCountdowns(root: ParentNode, now = Date.now()): void {
  root.querySelectorAll<HTMLElement>("[data-burn-at]").forEach((tag) => {
    const left = Number(tag.dataset.burnAt) - now;
    if (left > 0) {
      const val = tag.querySelector(".rm-ttl-val, .rv-ttl-val");
      if (val) val.textContent = formatBurnRemaining(left);
      if (left <= 3500) {
        tag.classList.add("urgent");
      } else {
        tag.classList.remove("urgent");
      }
      return;
    }
    const val = tag.querySelector(".rm-ttl-val, .rv-ttl-val");
    if (val) val.textContent = "0s";
    const row = tag.closest<HTMLElement>(".rm-msg-row, .chat-bubble");
    if (row && !row.dataset.burning) {
      triggerRowBurnAnimation(row);
    }
  });
}

/** Page-storage key of my read marks on this device: room id -> timestamp. */
export const READ_MARKS_KEY = "radica_chat_read";

type KeyValue = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** My read marks as stored on this device (the inbox log holds those of my other devices). */
export function localReadMarks(store: KeyValue): Record<string, number> {
  try {
    const marks = JSON.parse(store.getItem(READ_MARKS_KEY) || "{}");
    return marks && typeof marks === "object" ? marks : {};
  } catch {
    return {};
  }
}

/** Give a conversation a read mark of `at` unless it has one, so what came before does not count as unread. */
export function seedReadMark(store: KeyValue, roomId: string, at = Date.now()): void {
  const marks = localReadMarks(store);
  if (marks[roomId] === undefined) store.setItem(READ_MARKS_KEY, JSON.stringify({ ...marks, [roomId]: at }));
}

export interface ConversationDeps {
  /** My public key, once signed in. */
  me: () => string | undefined;
  /** The stored messages of every Secret Chat (still sealed is fine: only ids and burn times are read). */
  secretRooms: () => { roomId: string; messages: ChatMessage[] }[];
  /** Remove a message from storage and tell the peer. */
  burn: (roomId: string, messageId: string) => Promise<void>;
  sendTyping: (roomId: string) => void;
  /** Where this device keeps its read marks. */
  readStore: KeyValue;
  /** Read marks from my inbox log (my other devices). */
  logReadMarks: () => Record<string, number>;
  /** How many messages from others `roomId` holds newer than `since`. */
  countSince: (roomId: string, since: number) => number;
  /** Tell my other devices, and the peer of a direct message, that I read `roomId` up to `upto`. */
  publishRead: (roomId: string, upto: number) => void;
  now?: () => number;
}

export type ConversationState = ReturnType<typeof createConversationState>;

export function createConversationState(deps: ConversationDeps) {
  const now = deps.now ?? Date.now;
  const burning = new Set<string>();
  let lastTypingSent = 0;
  const typing = new Map<string, Map<string, number>>(); // room -> sender -> shown until
  const typingListeners = new Set<(roomId: string) => void>();
  const typingChanged = (roomId: string) => typingListeners.forEach((cb) => cb(roomId));

  /** My read marks: this device's and my other devices', the later of the two for each conversation. */
  const readMarks = (): Record<string, number> => {
    const marks = localReadMarks(deps.readStore);
    for (const [room, t] of Object.entries(deps.logReadMarks())) marks[room] = Math.max(marks[room] ?? 0, t);
    return marks;
  };

  /** Unread messages in `roomId`, counted from my read mark. Never read: a direct message or Secret Chat counts from
   *  its start (someone wrote to me), a room or community counts nothing (its history is not news). Pass `marks` from
   *  readMarks() when counting many conversations at once. */
  const unread = (roomId: string, marks = readMarks()): number => {
    const me = deps.me();
    if (!me) return 0;
    const since = marks[roomId] ?? (dmPeerOf(roomId, me) ? 0 : undefined);
    return since === undefined ? 0 : deps.countSince(roomId, since);
  };

  return {
    readMarks,
    unread,

    /** I am looking at `roomId`: read as of now. My other devices and the peer hear of it only when it changes
     *  something (there was something unread), so a conversation left open does not write on every redraw. */
    markRead(roomId: string): void {
      const hadUnread = unread(roomId) > 0;
      const upto = now();
      deps.readStore.setItem(READ_MARKS_KEY, JSON.stringify({ ...localReadMarks(deps.readStore), [roomId]: upto }));
      if (hadUnread) deps.publishRead(roomId, upto);
    },

    /** Schedule every stored message with a TTL to burn at its time; those already past burn now. Safe to call
     *  often (at sign-in and on every sync): a message is burned once. Unopened incoming Secret Chat messages start
     *  their burn timer when decrypted by the recipient rather than burning on the sender's clock in transit. */
    sweepBurns(): void {
      const me = deps.me();
      for (const { roomId, messages } of deps.secretRooms()) {
        for (const m of messages) {
          if (me && m.sender !== me && (m.text?.startsWith("secret:v2:") || m.text?.startsWith("secret:v1:")) && !m.burn_started) {
            continue;
          }
          const at = burnAtOf(m);
          if (!at || burning.has(m.id)) continue;
          scheduleMessageBurn(m.id, at, () => {
            if (burning.has(m.id)) return;
            burning.add(m.id);
            void deps.burn(roomId, m.id).catch((e) => {
              burning.delete(m.id);
              console.warn("[Conversation] Could not burn", m.id, e);
            });
          });
        }
      }
    },

    /** I typed in `roomId`: tell the peers, at most once per TYPING_SEND_EVERY_MS. */
    localTyping(roomId: string): void {
      const t = now();
      if (t - lastTypingSent <= TYPING_SEND_EVERY_MS) return;
      lastTypingSent = t;
      deps.sendTyping(roomId);
    },

    /** Someone signalled typing in `roomId`. */
    remoteTyping(roomId: string, sender: string): void {
      if (sender === deps.me()) return;
      if (!typing.has(roomId)) typing.set(roomId, new Map());
      typing.get(roomId)!.set(sender, now() + TYPING_SHOWN_MS);
      typingChanged(roomId);
      setTimeout(() => typingChanged(roomId), TYPING_SHOWN_MS + 50);
    },

    /** Who is typing in `roomId` right now (never me). */
    typersIn(roomId: string): string[] {
      const t = now();
      return [...(typing.get(roomId) ?? new Map<string, number>())].filter(([, until]) => until > t).map(([s]) => s);
    },

    /** Called with a room id whenever who is typing there may have changed. */
    onTypingChange(cb: (roomId: string) => void): () => void {
      typingListeners.add(cb);
      return () => typingListeners.delete(cb);
    },
  };
}
