import { sha256 } from "@noble/hashes/sha2.js";
import type { ChatMessage } from "./types.ts";

export interface PreviewItem {
  text: string;
  sender: string;
  timestamp: number;
  optimistic?: boolean;
}

const enc = new TextEncoder();

/** Closed-room preview hydration must skip community rooms, the currently open room, and unchanged stamps. */
export function shouldHydratePreview(opts: {
  type: "dm" | "priv" | "comm" | "secret";
  roomId: string;
  openRoomId: string | null;
  stamp: number;
  lastHydratedStamp: number | undefined;
}): boolean {
  if (opts.type === "comm") return false;
  if (opts.openRoomId && opts.roomId === opts.openRoomId) return false;
  if (!opts.stamp || opts.lastHydratedStamp === opts.stamp) return false;
  return true;
}

/** Never overwrite a newer or pending optimistic preview with an older stored message. */
export function shouldUpdateCachedPreview(prev: PreviewItem | undefined, next: PreviewItem): boolean {
  if (!prev) return true;
  if (next.timestamp > prev.timestamp) return true;
  if (next.timestamp < prev.timestamp) return false;
  if (prev.optimistic && !next.optimistic) return true;
  if (!prev.optimistic && next.optimistic) return false;
  return prev.text !== next.text;
}

/** Deterministic SHA-256 Signal-style 60-digit safety number (12 blocks of 5 digits) over sorted Ed25519/room keys. */
export function computeSafetyBlocks(myPubkey: string, targetMaterial: string): string[] {
  const canonical = [myPubkey.toLowerCase(), targetMaterial.toLowerCase()].sort().join(":");
  const d1 = sha256(enc.encode(`radica-e2ee-v1:a:${canonical}`));
  const d2 = sha256(enc.encode(`radica-e2ee-v1:b:${canonical}`));
  const buf = new Uint8Array(64);
  buf.set(d1, 0);
  buf.set(d2, 32);
  const blocks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const off = i * 5;
    const val =
      ((buf[off] * 0x100000000 +
        ((buf[off + 1] << 24) >>> 0) +
        (buf[off + 2] << 16) +
        (buf[off + 3] << 8) +
        buf[off + 4]) >>>
        0) %
      100000;
    blocks.push(String(val).padStart(5, "0"));
  }
  return blocks;
}

/** Whether a user has posting permissions in a room (channels allow owner/mods only). */
export function canPostInRoom(opts: {
  isChannel?: boolean;
  creator?: string;
  moderators?: string[];
  userPubkey: string;
}): boolean {
  if (!opts.isChannel) return true;
  if (!opts.userPubkey) return false;
  if (opts.creator === opts.userPubkey) return true;
  if (opts.moderators?.includes(opts.userPubkey)) return true;
  return false;
}

/** Group room join log entries occurring within 5 minutes into River-style system join events. */
export function computeLogJoins(roomId: string, entries: { author: string; ts: number; body: string }[]): ChatMessage[] {
  const joins: { author: string; ts: number }[] = [];
  for (const e of entries) {
    try {
      const b = JSON.parse(e.body);
      if ((b.type === "community_join" || b.type === "room_join") && (b.community_id === roomId || b.roomId === roomId || `comm_${b.community_id}` === roomId)) {
        joins.push({ author: e.author, ts: e.ts });
      }
    } catch {}
  }
  if (!joins.length) return [];
  joins.sort((a, b) => a.ts - b.ts);
  const grouped: { authors: string[]; ts: number }[] = [];
  for (const j of joins) {
    const last = grouped[grouped.length - 1];
    if (last && j.ts - last.ts <= 5 * 60 * 1000) {
      if (!last.authors.includes(j.author)) last.authors.push(j.author);
    } else {
      grouped.push({ authors: [j.author], ts: j.ts });
    }
  }
  return grouped.map((g) => ({
    id: `join_${g.authors[0]}_${g.ts}`,
    room_id: roomId,
    sender: g.authors[0],
    join_members: g.authors,
    text: "",
    timestamp: g.ts,
    sig: "",
    system_event: "join" as const,
  }));
}

/** Format River-style join announcement: "A joined", "A and B joined", or "N people joined". */
export function formatJoinNotice(members: string[], me: string, getDisplayName: (pk: string) => string): string {
  const names = members.map((pk) => (pk === me ? "You" : getDisplayName(pk)));
  if (names.length === 1) return `${names[0]} joined`;
  if (names.length === 2) return `${names[0]} and ${names[1]} joined`;
  if (names.length <= 4) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} joined`;
  return `${names.length} people joined`;
}


export interface RoomMeta {
  lastTs: number;
  lastSender: string;
  rawText: string;
  count: number;
  optimistic: boolean;
}

/** What a room's stored messages (`raw`, the JSON as stored) say about its last one; those up to `cleared` are hidden. */
export function roomMetaOf(raw: string | null, cleared: number): RoomMeta {
  const none = { lastTs: 0, lastSender: "", rawText: "", count: 0, optimistic: false };
  try {
    const visible = (raw ? (JSON.parse(raw) as ChatMessage[]) : []).filter((m) => m.timestamp > cleared);
    const last = visible[visible.length - 1];
    if (!last) return none;
    return {
      lastTs: last.timestamp || 0,
      lastSender: last.sender || "",
      rawText: last.text || "",
      count: visible.length,
      optimistic: last.id.startsWith("msg_opt_"),
    };
  } catch {
    return none;
  }
}

/** Elements whose touch interactions must not trigger mobile stage back navigation */
export const STAGE_SWIPE_IGNORED_SELECTOR =
  ".rm-msg-row, .rm-composer-outer, .rm-pinned-bar, input, textarea, select, pre, code, .carousel-track, audio, video";

/** Whether a touch swipe qualifies for returning back to inbox on mobile. */
export function isStageBackSwipe(opts: {
  dx: number;
  dy: number;
  dt: number;
  isIgnoredTarget?: boolean;
}): boolean {
  if (opts.isIgnoredTarget) return false;
  return opts.dx > 76 && opts.dy < 48 && opts.dx > opts.dy * 1.8 && opts.dt < 550;
}

export type MessageSwipePhase = "pending" | "horizontal";

/**
 * Classifies a touchmove step for swipe-to-mention on incoming messages so vertical
 * or slightly diagonal scrolling cancels immediately without mutating row transforms.
 */
export function resolveMessageSwipeStep(opts: {
  phase: MessageSwipePhase;
  dx: number;
  dy: number;
  maxOffset?: number;
}): { phase: MessageSwipePhase; offset: number } | null {
  const { phase, dx, dy, maxOffset = 80 } = opts;
  const absDy = Math.abs(dy);
  if (absDy > 30 || dx < -6) return null;

  if (phase === "pending") {
    if (absDy > 10) return null;
    const absDx = Math.abs(dx);
    if (absDy >= absDx && Math.hypot(dx, dy) > 8) return null;
    if (dx >= 12 && dx > absDy * 1.6) {
      return { phase: "horizontal", offset: Math.min(dx, maxOffset) };
    }
    return { phase: "pending", offset: 0 };
  }

  return { phase: "horizontal", offset: Math.max(0, Math.min(dx, maxOffset)) };
}

/**
 * Decides whether `renderThread` should adjust `scrollTop` after reconciling rows.
 * Skips redundant writes when rows did not change or while the user is actively
 * touching/scrolling (preserving native mobile momentum).
 */
export function resolveThreadScrollAction(opts: {
  scrollToBottom: boolean;
  switchedConv: boolean;
  rowsChanged: boolean;
  wasNearBottom: boolean;
  isUserScrolling: boolean;
}): "bottom" | "preserve" | "none" {
  if (opts.scrollToBottom || opts.switchedConv) return "bottom";
  if (!opts.rowsChanged || opts.isUserScrolling) return "none";
  return opts.wasNearBottom ? "bottom" : "preserve";
}

/** An unterminated "@name" right before the caret, if any: "@" at the string's start or after whitespace, with no
 *  space typed yet after it. Returns the "@"'s index (to replace from) and the partial name typed so far. */
export function detectMentionTrigger(textBeforeCaret: string): { at: number; query: string } | null {
  const m = /(?:^|\s)@([a-zA-Z0-9_]{0,24})$/.exec(textBeforeCaret);
  return m ? { at: textBeforeCaret.length - m[1].length - 1, query: m[1] } : null;
}

/** The mention candidates whose display name contains `query` (case-insensitive), nearest-typed-first order kept, capped. */
export function filterMentionCandidates<T extends { name: string }>(candidates: T[], query: string, limit = 8): T[] {
  const q = query.toLowerCase();
  return candidates.filter((c) => c.name.toLowerCase().includes(q)).slice(0, limit);
}

