// Turning the signed entries of a log (log-contract) into app state. The contract guarantees who wrote each entry;
// what an author may do (moderate, edit a community) is decided here, by replaying entries in a fixed order.
import { RADICA_MAINTAINER, type ChatMessage, type Community, type PrivateRoom } from "./types.ts";
import type { Cert } from "./whoiam.ts";
import { sha256 } from "@noble/hashes/sha2.js";
import { ANNOUNCE_POW_BITS, powBits } from "./pow.ts";

export type LogEntry = { author: string; id: string; ts: number; body: string; sig: string; cert?: Cert };

const ordered = (entries: LogEntry[]) =>
  [...entries].sort((a, b) => a.ts - b.ts || (a.author + a.id < b.author + b.id ? -1 : 1));

const enc = new TextEncoder();
const INVALID_JSON = Symbol();
const entryJson = new WeakMap<LogEntry, unknown>();
function parseBody(e: LogEntry): unknown {
  if (entryJson.has(e)) return entryJson.get(e);
  try {
    const b = JSON.parse(e.body);
    entryJson.set(e, b);
    return b;
  } catch {
    entryJson.set(e, INVALID_JSON);
    return INVALID_JSON;
  }
}

// A log is folded once per room it feeds (the inbox: once per conversation), always from the same array: sort and parse it once.
// Arrays of entries are never changed after they are built (callers make a new one), so the array is the key.
const parsed = new WeakMap<LogEntry[], { e: LogEntry; b: any }[]>();
function bodies(entries: LogEntry[]): { e: LogEntry; b: any }[] {
  const hit = parsed.get(entries);
  if (hit) return hit;
  const out: { e: LogEntry; b: any }[] = [];
  parsed.set(entries, out);
  for (const e of ordered(entries)) {
    const b = parseBody(e);
    if (b !== INVALID_JSON) out.push({ e, b });
  }
  return out;
}

const isMod = (c: Community, pk: string) => pk === c.creator || c.moderators.includes(pk);

/** Communities from the `communities` log, on top of `base` (the built-in ones). */
export function foldCommunities(entries: LogEntry[], base: Community[]): Community[] {
  const map = new Map<string, Community>(base.map((c) => [c.id, structuredClone(c)]));
  for (const { e, b } of bodies(entries)) {
    const a = e.author;
    if (b.type === "community_create") {
      const m = b.community ?? {};
      if (typeof m.id !== "string" || !/^c_[a-z0-9_]{1,40}$/.test(m.id)) continue;
      const cur = map.get(m.id);
      if (!cur) {
        map.set(m.id, {
          id: m.id,
          slug: m.id.slice(2),
          name: String(m.name ?? "").slice(0, 100),
          description: String(m.description ?? "").slice(0, 2000),
          avatar_url: typeof m.avatar_url === "string" ? m.avatar_url : undefined,
          created_at: e.ts,
          creator: a,
          moderators: [a],
          members: [a],
          banned_members: [],
          deleted_post_ids: [],
          require_trusted_to_post: typeof m.require_trusted_to_post === "boolean" ? m.require_trusted_to_post : undefined,
          sig: e.sig,
        });
      } else if (cur.creator === a) {
        cur.name = String(m.name ?? cur.name).slice(0, 100);
        cur.description = String(m.description ?? cur.description).slice(0, 2000);
        if (typeof m.avatar_url === "string") cur.avatar_url = m.avatar_url;
        if (typeof m.require_trusted_to_post === "boolean") cur.require_trusted_to_post = m.require_trusted_to_post;
      }
      continue;
    }
    const c = map.get(b.community_id);
    if (!c) continue;
    const banned = (c.banned_members ??= []);
    const t = typeof b.target === "string" ? b.target : "";
    switch (b.type) {
      case "community_join":
        if (!banned.includes(a) && !c.members.includes(a)) c.members.push(a);
        break;
      case "community_leave":
        c.members = c.members.filter((m) => m !== a);
        break;
      case "community_mod_add":
        if (isMod(c, a) && t && !banned.includes(t) && !c.moderators.includes(t)) c.moderators.push(t);
        break;
      case "community_mod_remove":
        if (t !== c.creator && (a === c.creator || a === t)) c.moderators = c.moderators.filter((m) => m !== t);
        break;
      case "community_ban":
        if (isMod(c, a) && t && t !== c.creator) {
          if (!banned.includes(t)) banned.push(t);
          c.members = c.members.filter((m) => m !== t);
          c.moderators = c.moderators.filter((m) => m !== t);
        }
        break;
      case "community_unban":
        if (isMod(c, a)) c.banned_members = banned.filter((m) => m !== t);
        break;
      case "community_delete_post":
        if ((isMod(c, a) || a === b.post_author) && typeof b.post_id === "string" && !c.deleted_post_ids.includes(b.post_id))
          c.deleted_post_ids.push(b.post_id);
        break;
    }
  }
  for (const c of map.values()) {
    if ((c.id === "c_radica" || c.slug === "radica") && !c.moderators.includes(RADICA_MAINTAINER)) {
      c.moderators.push(RADICA_MAINTAINER);
    }
  }
  return [...map.values()];
}

/** The reactions a message can get: a closed set, so a log entry cannot put arbitrary text on someone's message. (River 4x4 grid) */
export const CHAT_REACTIONS = [
  "👍", "❤️", "😂", "👀",
  "🔥", "😮", "😢", "😡",
  "🎉", "🤔", "👏", "✅",
  "💯", "🙏", "😍", "🥳",
];

/**
 * Chat messages from a log: each message must be sent by the entry's author.
 * `canDelete(author, message)` says who may remove a message; `blocked(sender)` hides senders (e.g. banned).
 */
/** A conversation once per message, in time order: the same message can reach storage by more than one path (the log,
 *  the live broadcast, a resend), and a copy appended out of order showed again at the bottom of the thread. The same
 *  message is the same id, or the same signature (it covers the id, the text and the time). */
export function dedupeChat<T extends { id: string; sig?: string; timestamp: number }>(list: T[]): T[] {
  const ids = new Set<string>();
  const sigs = new Set<string>();
  const out: T[] = [];
  for (const m of list) {
    if (ids.has(m.id) || (m.sig && sigs.has(m.sig))) continue;
    ids.add(m.id);
    if (m.sig) sigs.add(m.sig);
    out.push(m);
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

export function foldChat(
  entries: LogEntry[],
  roomId: string,
  canDelete: (author: string, m: ChatMessage) => boolean = (a, m) => a === m.sender,
  blocked: (sender: string) => boolean = () => false,
  canReact: (author: string, m: ChatMessage) => boolean = () => true
): ChatMessage[] {
  const msgs = new Map<string, ChatMessage>();
  const deletes: { author: string; id: string }[] = [];
  const edits: { author: string; id: string; text: string; ts: number }[] = [];
  const reacts = new Map<string, { author: string; id: string; emoji: string; on: boolean; ts: number }>(); // the latest word of each person on each emoji
  for (const { e, b } of bodies(entries)) {
    if (b.type === "chat" && b.message?.sender === e.author && b.message.room_id === roomId && typeof b.message.id === "string") {
      const { reactions: _forged, ...message } = b.message; // reactions come only from signed chat_react entries
      msgs.set(b.message.id, message);
    } else if ((b.type === "chat_delete" || b.type === "chat_burn") && b.roomId === roomId) {
      deletes.push({ author: e.author, id: b.messageId });
    } else if (b.type === "chat_edit" && b.roomId === roomId && typeof b.messageId === "string" && typeof b.text === "string") {
      edits.push({ author: e.author, id: b.messageId, text: b.text, ts: e.ts });
    } else if (b.type === "chat_react" && b.roomId === roomId && typeof b.messageId === "string" && CHAT_REACTIONS.includes(b.emoji)) {
      const k = `${e.author}|${b.messageId}|${b.emoji}`;
      if ((reacts.get(k)?.ts ?? -1) <= e.ts) reacts.set(k, { author: e.author, id: b.messageId, emoji: b.emoji, on: b.on === true, ts: e.ts });
    }
  }
  for (const ed of edits) {
    const m = msgs.get(ed.id);
    if (m && ed.author === m.sender && (!m.edited_at || ed.ts >= m.edited_at)) {
      msgs.set(ed.id, { ...m, text: ed.text, edited_at: ed.ts });
    }
  }
  for (const d of deletes) {
    const m = msgs.get(d.id);
    if (m && canDelete(d.author, m)) msgs.delete(d.id);
  }
  for (const r of reacts.values()) {
    const m = msgs.get(r.id);
    if (!r.on || !m || blocked(r.author) || !canReact(r.author, m)) continue;
    const who = m.reactions?.[r.emoji] ?? [];
    msgs.set(r.id, { ...m, reactions: { ...m.reactions, [r.emoji]: [...who, r.author] } });
  }
  return [...msgs.values()].filter((m) => !blocked(m.sender)).sort((x, y) => x.timestamp - y.timestamp);
}

/**
 * The room as its creator last published it (in its own log or an invite), plus members who joined by link since.
 * A moderator the creator named can kick (`room_kick`, with the rotated keys): never the creator, never another moderator.
 * A kicked member cannot come back through an invite link (`room_join`); only the creator listing them again lets them in.
 */
export function foldRoom(entries: LogEntry[], roomId: string): PrivateRoom | null {
  let room: PrivateRoom | null = null;
  const kicked = new Set<string>();
  const joined: Record<string, string> = {}; // who came in by link -> their key copy
  for (const { e, b } of bodies(entries)) {
    if ((b.type === "private_room" || b.type === "room_invite") && b.room?.id === roomId && b.room.creator === e.author) {
      room = structuredClone(b.room);
      room!.moderators = (room!.moderators ?? []).filter((m) => m !== room!.creator && room!.members.includes(m));
      for (const m of room!.members) kicked.delete(m); // the creator listing someone again lets them in
      // the creator's copy may predate the joins by link: they stay in
      for (const [m, k] of Object.entries(joined)) {
        if (room!.members.includes(m)) continue;
        room!.members.push(m);
        if (k) room!.encrypted_keys = { ...room!.encrypted_keys, [m]: k };
      }
    } else if (b.type === "room_join" && b.roomId === roomId && room && !room.members.includes(e.author) && !kicked.has(e.author)) {
      room.members.push(e.author);
      joined[e.author] = typeof b.encrypted_key === "string" ? b.encrypted_key : "";
      // the key the joiner encrypted to themselves, so the room opens again after a reload
      if (typeof b.encrypted_key === "string") room.encrypted_keys = { ...room.encrypted_keys, [e.author]: b.encrypted_key };
    } else if (b.type === "room_leave" && b.roomId === roomId && room && e.author !== room.creator && room.members.includes(e.author)) {
      // a member leaves on their own: gone from the list, and their key copy with them
      room.members = room.members.filter((m) => m !== e.author);
      delete joined[e.author];
      room.moderators = (room.moderators ?? []).filter((m) => m !== e.author);
      room.encrypted_keys = Object.fromEntries(Object.entries(room.encrypted_keys ?? {}).filter(([m]) => m !== e.author));
    } else if (b.type === "room_kick" && b.roomId === roomId && room && typeof b.target === "string") {
      const byCreator = e.author === room.creator;
      const mods = room.moderators ?? [];
      const allowed = byCreator || mods.includes(e.author);
      if (!allowed || b.target === room.creator || !room.members.includes(b.target) || (!byCreator && mods.includes(b.target))) continue;
      room.members = room.members.filter((m) => m !== b.target);
      room.moderators = mods.filter((m) => m !== b.target);
      kicked.add(b.target);
      delete joined[b.target];
      const keys: Record<string, string> = typeof b.encrypted_keys === "object" && b.encrypted_keys ? b.encrypted_keys : {};
      room.encrypted_keys = Object.fromEntries(Object.entries(keys).filter(([m]) => room!.members.includes(m)));
      if (typeof b.name_encrypted === "string") room.name_encrypted = b.name_encrypted;
      room.keys_enc_pub = typeof b.keys_enc_pub === "string" ? b.keys_enc_pub : undefined;
    } else if (b.type === "room_avatar" && b.roomId === roomId && room) {
      const byCreator = e.author === room.creator;
      const mods = room.moderators ?? [];
      if (byCreator || mods.includes(e.author)) {
        room.avatar_url = typeof b.avatar_url === "string" && b.avatar_url.trim() ? b.avatar_url.trim() : undefined;
      }
    } else if (b.type === "room_pin" && b.roomId === roomId && room) {
      const byCreator = e.author === room.creator;
      const mods = room.moderators ?? [];
      if (byCreator || mods.includes(e.author)) {
        room.pinned_message_id = typeof b.messageId === "string" && b.messageId.trim() ? b.messageId.trim() : undefined;
      }
    }
  }
  return room;
}

/** Did `me` leave this room: they are no longer in it and their last join or leave entry in the room log is a leave. */
export function hasLeftRoom(entries: LogEntry[], roomId: string, me: string): boolean {
  const room = foldRoom(entries, roomId);
  if (!room || room.members.includes(me)) return false;
  let left = false;
  for (const { e, b } of bodies(entries)) {
    if (e.author !== me || b.roomId !== roomId) continue;
    if (b.type === "room_leave") left = true;
    else if (b.type === "room_join") left = false;
  }
  return left;
}

/** Authors a curator blocked, from their `blocklist/<curator>` log. Only the curator's own entries count; the newest per target wins. */
export function foldBlocklist(entries: LogEntry[], curator: string, type: "block" | "mod" = "block", initial: Iterable<string> = []): Set<string> {
  const blocked = new Set<string>(initial);
  for (const { e, b } of bodies(entries)) {
    if (e.author !== curator || b.type !== type || typeof b.target !== "string") continue;
    if (b.on === false) blocked.delete(b.target);
    else blocked.add(b.target);
  }
  return blocked;
}

/** The communities a curator hid (`c_<slug>` -> reason), from their `blocklist/<curator>` log: only their own entries count, the
 *  newest per community wins, and `on: false` shows it again. Hiding is not deleting: it hides for whoever follows that list. */
export function foldHiddenCommunities(entries: LogEntry[], curator: string): Map<string, string> {
  const hidden = new Map<string, string>();
  for (const { e, b } of bodies(entries)) {
    if (e.author !== curator || b.type !== "hide_community" || typeof b.target !== "string" || !/^c_[a-z0-9_]{1,40}$/.test(b.target)) continue;
    if (b.on === false) hidden.delete(b.target);
    else hidden.set(b.target, typeof b.reason === "string" ? b.reason.trim().slice(0, 200) : "");
  }
  return hidden;
}

/** Posts a curator reported (`<author>:<post id>` -> reason), from their `blocklist/<curator>` log. Only the curator's own
 *  entries count; the newest per target wins, and `on: false` withdraws a report. */
export function foldReports(entries: LogEntry[], curator: string): Map<string, string> {
  const reported = new Map<string, string>();
  for (const { e, b } of bodies(entries)) {
    if (e.author !== curator || b.type !== "report" || typeof b.target !== "string") continue;
    if (b.on === false) reported.delete(b.target);
    else reported.set(b.target, typeof b.reason === "string" ? b.reason.slice(0, 200) : "");
  }
  return reported;
}

/** Posts a moderator set aside without removing them (`dismiss` entries on their `blocklist/<curator>` log), newest wins. */
export function foldDismissed(entries: LogEntry[], curator: string): Set<string> {
  const dismissed = new Set<string>();
  for (const { e, b } of bodies(entries)) {
    if (e.author !== curator || b.type !== "dismiss" || typeof b.target !== "string") continue;
    if (b.on === false) dismissed.delete(b.target);
    else dismissed.add(b.target);
  }
  return dismissed;
}

export interface ReportedItem {
  /** `<author>:<post id>` */
  target: string;
  /** Different people who reported it: the newest entry of each counts once, a withdrawn one not at all. */
  reporters: number;
  /** The reports by what each reporter weighs for the reader (without weights: one each); the queue is in this order. */
  score: number;
  /** How many of the reporters weigh something (without weights: all). */
  trusted: number;
  reasons: string[];
  ts: number;
  /** Public keys of the reporters who reported this item. */
  reporterKeys?: string[];
  /** Detailed list of reports (reporter pubkey, reason, timestamp). */
  reports?: { reporter: string; reason: string; ts: number }[];
}

/**
 * The public `reports` log as a queue for Radica's moderators: one item per reported post, most reporters first, then
 * newest. `resolved` (posts already removed or dismissed by a moderator) are left out, and so is any target that is not
 * `<author>:<id>` shaped. The log is open to everybody and a key costs nothing, so what counts is how many different people
 * reported, not how many entries, and, given `weigh`, each by what they weigh for the reader: twenty fresh keys weigh
 * nothing, one person the reader trusts weighs a lot. What only strangers reported comes after, still listed.
 */
export function foldReportQueue(entries: LogEntry[], resolved: ReadonlySet<string>, max = 50, weigh: (reporter: string) => number = () => 1): ReportedItem[] {
  const latest = new Map<string, { e: LogEntry; b: any }>(); // `<reporter>|<target>` -> newest entry
  for (const { e, b } of bodies(entries)) {
    if (b.type !== "report" || typeof b.target !== "string" || !/^[0-9a-f]{64}:.+/.test(b.target)) continue;
    latest.set(`${e.author}|${b.target}`, { e, b });
  }
  const items = new Map<string, ReportedItem>();
  for (const { e, b } of latest.values()) {
    if (b.on === false || resolved.has(b.target)) continue;
    const item: ReportedItem = items.get(b.target) ?? { target: b.target, reporters: 0, score: 0, trusted: 0, reasons: [], ts: 0, reporterKeys: [], reports: [] };
    const w = weigh(e.author);
    item.reporters++;
    item.score += w;
    if (w > 0) item.trusted++;
    item.ts = Math.max(item.ts, e.ts);
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 200) : "";
    if (reason && !item.reasons.includes(reason) && item.reasons.length < 3) item.reasons.push(reason);
    if (!item.reporterKeys!.includes(e.author)) item.reporterKeys!.push(e.author);
    item.reports!.push({ reporter: e.author, reason, ts: e.ts });
    items.set(b.target, item);
  }
  for (const item of items.values()) {
    item.reports?.sort((a, b) => b.ts - a.ts);
  }
  return [...items.values()].sort((a, b) => b.score - a.score || b.reporters - a.reporters || b.ts - a.ts).slice(0, max);
}

/**
 * The media (an image's or a video's hash) of the posts `curator` reported: hidden wherever they are posted again, not
 * only in the reported post. A report names it in `media`; withdrawing the report frees it.
 */
export function foldReportedMedia(entries: LogEntry[], curator: string): Set<string> {
  const byTarget = new Map<string, string>();
  for (const { e, b } of bodies(entries)) {
    if (e.author !== curator || b.type !== "report" || typeof b.target !== "string") continue;
    if (b.on === false) byTarget.delete(b.target);
    else if (typeof b.media === "string" && /^[0-9a-f]{64}$/.test(b.media)) byTarget.set(b.target, b.media);
  }
  return new Set(byTarget.values());
}

const DAY = 864e5;
/** The people announced in the public directory in the last 30 days, each with a weight for a place in an Explore: a
 *  proof of work in their hello (powBits against their key) counts 2^(bits − ANNOUNCE_POW_BITS), so a share of the places
 *  costs compute in proportion; a hello without one (an old app) counts a quarter. Dates are the author's own, so they are
 *  clamped to now: a date in the future gains nothing. */
export function directoryWeights(entries: LogEntry[], now = Date.now()): Map<string, number> {
  const newest = new Map<string, LogEntry>();
  for (const e of entries) {
    const ts = Math.min(e.ts, now);
    if (now - ts > 30 * DAY) continue;
    const had = newest.get(e.author);
    if (!had || ts >= Math.min(had.ts, now)) newest.set(e.author, e);
  }
  const weights = new Map<string, number>();
  for (const [author, e] of newest) {
    let w = 0.25;
    const body = parseBody(e) as { pow?: { ts?: unknown; nonce?: unknown } } | typeof INVALID_JSON;
    if (body && body !== INVALID_JSON) {
      const pow = body.pow;
      if (pow && typeof pow.ts === "number" && typeof pow.nonce === "number" && Math.abs(pow.ts - e.ts) <= 2 * DAY && pow.ts <= now + 5 * 60_000) {
        const bits = powBits(author, pow.ts, pow.nonce, "hello");
        if (bits >= ANNOUNCE_POW_BITS) w = 2 ** (Math.min(bits, ANNOUNCE_POW_BITS + 6) - ANNOUNCE_POW_BITS);
      }
    }
    weights.set(author, w);
  }
  return weights;
}

/** `n` of `keys`, drawn by weight (unannounced ones count 0.1), the same draw for the same `seed`: the lane of newcomers an
 *  Explore keeps open beside the people I trust. Chosen by weight and not by date: however many identities announce, one
 *  party's share of the places follows the work it spent, and the lane is all it can take. */
export function laneSample(keys: string[], weights: Map<string, number>, n: number, seed: string): string[] {
  const draw = (pk: string) => {
    const h = sha256(enc.encode(`${seed}|${pk}`));
    const u = (h[0] * 2 ** 40 + h[1] * 2 ** 32 + h[2] * 2 ** 24 + h[3] * 2 ** 16 + h[4] * 2 ** 8 + h[5] + 1) / (2 ** 48 + 2);
    return u ** (1 / (weights.get(pk) ?? 0.1)); // Efraimidis-Spirakis: the biggest keys are a weighted draw without replacement
  };
  return keys.map((pk) => ({ pk, k: draw(pk) })).sort((a, b) => b.k - a.k).slice(0, n).map((x) => x.pk);
}

/** Per room, the time I last read it, from my own `chat_read` entries (so it follows me to a new login or device). */
export function foldChatRead(entries: LogEntry[], me: string): Record<string, number> {
  const marks: Record<string, number> = {};
  for (const { e, b } of bodies(entries)) {
    if (e.author === me && b.type === "chat_read" && typeof b.room === "string" && typeof b.upto === "number")
      marks[b.room] = Math.max(marks[b.room] ?? 0, b.upto);
  }
  return marks;
}

/** `list` (newest first) with `item` added, keeping the `max` newest whatever order they come in: the inbox log is
 *  read in key order (author, id), not by time. Same list when `item` is already there or older than all `max` kept. */
export function keepNewest<T extends { id: string; timestamp: number }>(list: T[], item: T, max: number): T[] {
  if (list.some((n) => n.id === item.id)) return list;
  if (list.length >= max && list.every((n) => item.timestamp <= n.timestamp)) return list; // a list stored unsorted, too
  return [...list, item].sort((a, b) => b.timestamp - a.timestamp).slice(0, max);
}

/** The chats I cleared (room id -> up to when), the conversations I removed (peer -> up to when) and the private rooms
 *  I removed from my list (room id -> still removed: my newest word wins, a join says false), from my own signed entries
 *  in my inbox: they hold on every device and after every sign-in. */
export function foldChatHides(entries: LogEntry[], me: string): { cleared: Record<string, number>; removed: Record<string, number>; rooms: Record<string, boolean> } {
  const out = { cleared: {} as Record<string, number>, removed: {} as Record<string, number>, rooms: {} as Record<string, boolean> };
  const roomTs: Record<string, number> = {};
  for (const { e, b } of bodies(entries)) {
    if (e.author !== me) continue;
    if (b.type === "room_hide" && typeof b.roomId === "string" && e.ts >= (roomTs[b.roomId] ?? -1)) {
      roomTs[b.roomId] = e.ts;
      out.rooms[b.roomId] = b.on !== false;
      continue;
    }
    if (typeof b.upto !== "number") continue;
    const [map, k] = b.type === "chat_clear" ? [out.cleared, b.room] : b.type === "chat_remove" ? [out.removed, b.peer] : [null, null];
    if (map && typeof k === "string") map[k] = Math.max(map[k] ?? 0, b.upto);
  }
  return out;
}

/**
 * Comment likes from a `reactions/<postAuthor>` log.
 * Keyed by `${postId}:${commentKey}` and `${commentKey}` (`<author>:<commentId>`).
 * Each liker's newest entry decides whether they liked it; returns Map<targetKey, likerPubkeys[]>.
 */
export function foldCommentLikes(entries: LogEntry[]): Map<string, string[]> {
  const latest = new Map<string, { author: string; target: string; bareKey: string; liked: boolean; ts: number }>();
  for (const { e, b } of bodies(entries)) {
    if (b.type === "comment_like" && typeof b.commentKey === "string") {
      const target = b.postId ? `${b.postId}:${b.commentKey}` : b.commentKey;
      const key = `${e.author}|${target}`;
      const prev = latest.get(key);
      const ts = typeof b.ts === "number" ? b.ts : e.ts;
      if (!prev || ts >= prev.ts) {
        latest.set(key, { author: e.author, target, bareKey: b.commentKey, liked: b.liked === true, ts });
      }
    }
  }
  const result = new Map<string, string[]>();
  for (const item of latest.values()) {
    if (!item.liked) continue;
    for (const k of [item.target, item.bareKey]) {
      const list = result.get(k) ?? [];
      if (!list.includes(item.author)) list.push(item.author);
      result.set(k, list);
    }
  }
  return result;
}

/**
 * Post dislikes from a `reactions/<postAuthor>` log.
 * Keyed by postId.
 * Each disliker's newest entry decides whether they disliked it; returns Map<postId, dislikerPubkeys[]>.
 */
export function foldPostDislikes(entries: LogEntry[]): Map<string, string[]> {
  const latest = new Map<string, { author: string; postId: string; disliked: boolean; ts: number }>();
  for (const { e, b } of bodies(entries)) {
    if (b.type === "post_dislike" && typeof b.postId === "string") {
      const key = `${e.author}|${b.postId}`;
      const prev = latest.get(key);
      const ts = typeof b.ts === "number" ? b.ts : e.ts;
      if (!prev || ts >= prev.ts) {
        latest.set(key, { author: e.author, postId: b.postId, disliked: b.disliked === true, ts });
      }
    }
  }
  const result = new Map<string, string[]>();
  for (const item of latest.values()) {
    if (!item.disliked) continue;
    const list = result.get(item.postId) ?? [];
    if (!list.includes(item.author)) list.push(item.author);
    result.set(item.postId, list);
  }
  return result;
}

/** The newest edit of each post, keyed `<author>:<post id>`. The key's author is the entry's signer, so only a post's
 *  own author can change what it says; readers look an edit up by the post's author. Captions over `max` are ignored. */
export function foldPostEdits(entries: LogEntry[], max = 4000): Map<string, { caption: string; ts: number }> {
  const out = new Map<string, { caption: string; ts: number }>();
  for (const { e, b } of bodies(entries)) {
    if (b?.type !== "edit" || typeof b.post !== "string" || typeof b.caption !== "string" || b.caption.length > max) continue;
    const key = `${e.author}:${b.post}`;
    const cur = out.get(key);
    if (!cur || e.ts >= cur.ts) out.set(key, { caption: b.caption, ts: e.ts });
  }
  return out;
}
