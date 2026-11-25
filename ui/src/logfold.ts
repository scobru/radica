// Turning the signed entries of a log (log-contract) into app state. The contract guarantees who wrote each entry;
// what an author may do (moderate, edit a community) is decided here, by replaying entries in a fixed order.
import { AI_REPORTERS, RADICA_MAINTAINER, type ChatMessage, type Community, type PrivateRoom } from "./types.ts";
import type { Cert } from "./whoiam.ts";
import { isDelegationProofShape, type DelegationProofV1, type PohLogEntry } from "./viso.ts";
import { sha256 } from "@noble/hashes/sha2.js";
import { ANNOUNCE_POW_BITS, powBits } from "./pow.ts";

export type LogEntry = { author: string; id: string; ts: number; body: string; sig: string; cert?: Cert; v?: number; nonce?: number };

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
const norm = (s: unknown): string => (typeof s === "string" ? s.toLowerCase() : "");

/** Whether `pubkey` is authorized to edit `c`'s title, description, and settings (founder, active moderator, or RADICA_MAINTAINER on system genesis communities). */
export function canEditCommunity(
  c: Pick<Community, "creator" | "moderators">,
  pubkey: string,
): boolean {
  const a = norm(pubkey);
  if (!a) return false;
  if (a === norm(c.creator)) return true;
  if (c.moderators.some((m) => norm(m) === a)) return true;
  if (norm(c.creator) === "system" && a === norm(RADICA_MAINTAINER)) return true;
  return false;
}

/** Whether `post` was deleted in `comm` (mod deletion stores bare `post.id`; author self-delete stores `<author>:<id>`). */
export function isPostDeletedInCommunity(
  comm: Pick<Community, "deleted_post_ids"> | null | undefined,
  post: { id: string; author: string },
): boolean {
  if (!comm) return false;
  return (
    comm.deleted_post_ids.includes(post.id) ||
    comm.deleted_post_ids.includes(`${norm(post.author)}:${post.id}`)
  );
}

/** Communities from the `communities` log, on top of `base` (the built-in ones). */
export function foldCommunities(entries: LogEntry[], base: Community[]): Community[] {
  const map = new Map<string, Community>(base.map((c) => [c.id, structuredClone(c)]));
  for (const c of map.values()) {
    if ((c.id === "c_radica" || c.slug === "radica") && !c.moderators.includes(RADICA_MAINTAINER)) {
      c.moderators.push(RADICA_MAINTAINER);
    }
  }
  const appointedBy = new Map<string, Map<string, string>>(); // commId -> (mod -> appointer)
  const creatorRevoked = new Map<string, Set<string>>(); // commId -> mods removed by creator (only creator can re-appoint)
  for (const { e, b } of bodies(entries)) {
    const a = norm(e.author);
    if (b.type === "community_create") {
      const m = b.community ?? {};
      if (typeof m.id !== "string" || !/^c_[a-z0-9_]{1,40}$/.test(m.id)) continue;
      const cur = map.get(m.id);
      if (!cur) {
        // ponytail: if community id embeds an 8..64 hex creator prefix (c_<hex>_...), bind creation to that author to block ts=0 front-running
        const prefixMatch = /^c_([0-9a-f]{8,64})(?:_|$)/.exec(m.id);
        if (prefixMatch && !a.startsWith(prefixMatch[1])) continue;
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
      } else if (canEditCommunity(cur, a)) {
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
    const t = norm(b.target);
    let appointers = appointedBy.get(c.id);
    if (!appointers) {
      appointers = new Map();
      appointedBy.set(c.id, appointers);
    }
    switch (b.type) {
      case "community_join":
        if (!banned.includes(a) && !c.members.includes(a)) c.members.push(a);
        break;
      case "community_leave":
        c.members = c.members.filter((m) => m !== a);
        break;
      case "community_mod_add": {
        const revoked = creatorRevoked.get(c.id);
        if (isMod(c, a) && t && !banned.includes(t) && !c.moderators.includes(t) && (a === c.creator || !revoked?.has(t))) {
          c.moderators.push(t);
          appointers.set(t, a);
          if (a === c.creator) revoked?.delete(t);
        }
        break;
      }
      case "community_mod_remove":
        if (t !== c.creator && (a === c.creator || a === t || (isMod(c, a) && (AI_REPORTERS.includes(t) || c.creator === "system")))) {
          const toRemove = new Set<string>([t]);
          const queue = [t];
          while (queue.length > 0) {
            const curMod = queue.shift()!;
            for (const [modKey, appointer] of appointers.entries()) {
              if (appointer === curMod && !toRemove.has(modKey) && modKey !== c.creator) {
                toRemove.add(modKey);
                queue.push(modKey);
              }
            }
          }
          for (const rem of toRemove) appointers.delete(rem);
          c.moderators = c.moderators.filter((m) => !toRemove.has(m));
          if (a === c.creator) {
            let rev = creatorRevoked.get(c.id);
            if (!rev) creatorRevoked.set(c.id, (rev = new Set()));
            for (const rem of toRemove) rev.add(rem);
          }
        }
        break;
      case "community_ban":
        // Moderators, the creator/owner, and Radica's maintainer cannot be banned directly (creator must demote a mod first).
        if (isMod(c, a) && t && t !== c.creator && !c.moderators.includes(t) && t !== RADICA_MAINTAINER) {
          if (!banned.includes(t)) banned.push(t);
          c.members = c.members.filter((m) => m !== t);
        }
        break;
      case "community_unban":
        if (isMod(c, a)) c.banned_members = banned.filter((m) => m !== t);
        break;
      case "community_delete_post":
        if (typeof b.post_id === "string") {
          if (isMod(c, a)) {
            if (!c.deleted_post_ids.includes(b.post_id)) c.deleted_post_ids.push(b.post_id);
          } else if (b.post_author === undefined || norm(b.post_author) === a) {
            // Non-mod authors can only mark their own post as deleted (scoped to authenticated signer `a`).
            const ownKey = `${a}:${b.post_id}`;
            if (!c.deleted_post_ids.includes(ownKey)) c.deleted_post_ids.push(ownKey);
          }
        }
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
  // Key messages by `${sender}:${messageId}` so a colliding `message.id` from another author can never overwrite or hijack.
  const msgs = new Map<string, ChatMessage>();
  const deletes: { author: string; id: string }[] = [];
  const edits: { author: string; id: string; text: string; copies?: Record<string, string>; ts: number }[] = [];
  const reacts = new Map<string, { author: string; id: string; emoji: string; on: boolean; ts: number }>(); // the latest word of each person on each emoji
  for (const { e, b } of bodies(entries)) {
    const a = norm(e.author);
    if (b.type === "chat" && norm(b.message?.sender) === a && b.message.room_id === roomId && typeof b.message.id === "string") {
      const { reactions: _forged, ...rest } = b.message; // reactions come only from signed chat_react entries
      msgs.set(`${a}:${b.message.id}`, { ...rest, sender: a });
    } else if ((b.type === "chat_delete" || b.type === "chat_burn") && b.roomId === roomId && typeof b.messageId === "string") {
      deletes.push({ author: a, id: b.messageId });
    } else if (b.type === "chat_edit" && b.roomId === roomId && typeof b.messageId === "string" && typeof b.text === "string") {
      edits.push({ author: a, id: b.messageId, text: b.text, copies: b.copies && typeof b.copies === "object" ? b.copies : undefined, ts: e.ts });
    } else if (b.type === "chat_react" && b.roomId === roomId && typeof b.messageId === "string" && CHAT_REACTIONS.includes(b.emoji)) {
      const k = `${a}|${b.messageId}|${b.emoji}`;
      if ((reacts.get(k)?.ts ?? -1) <= e.ts) reacts.set(k, { author: a, id: b.messageId, emoji: b.emoji, on: b.on === true, ts: e.ts });
    }
  }
  for (const ed of edits) {
    const mk = `${ed.author}:${ed.id}`;
    const m = msgs.get(mk);
    if (m && ed.author === m.sender && (!m.edited_at || ed.ts >= m.edited_at)) {
      // a Secret Chat edit always names its copies (maybe none); a DM edit does not and keeps what the message had
      msgs.set(mk, { ...m, text: ed.text, ...(ed.copies ? { copies: Object.keys(ed.copies).length ? ed.copies : undefined } : {}), edited_at: ed.ts });
    }
  }
  for (const d of deletes) {
    const ownKey = `${d.author}:${d.id}`;
    const own = msgs.get(ownKey);
    if (own && canDelete(d.author, own)) msgs.delete(ownKey);
    for (const [mk, m] of msgs) {
      if (mk !== ownKey && m.id === d.id && canDelete(d.author, m)) msgs.delete(mk);
    }
  }
  for (const r of reacts.values()) {
    if (!r.on || blocked(r.author)) continue;
    for (const [mk, m] of msgs) {
      if (m.id !== r.id || !canReact(r.author, m)) continue;
      const who = m.reactions?.[r.emoji] ?? [];
      if (!who.includes(r.author)) msgs.set(mk, { ...m, reactions: { ...m.reactions, [r.emoji]: [...who, r.author] } });
    }
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
    const a = norm(e.author);
    if ((b.type === "private_room" || b.type === "room_invite") && b.room?.id === roomId && norm(b.room.creator) === a) {
      room = structuredClone(b.room);
      room!.creator = a;
      room!.members = (room!.members ?? []).map((m) => norm(m));
      room!.moderators = (room!.moderators ?? []).map((m) => norm(m)).filter((m) => m !== room!.creator && room!.members.includes(m));
      for (const m of room!.members) kicked.delete(m); // the creator listing someone again lets them in
      // the creator's copy may predate the joins by link: they stay in
      for (const [m, k] of Object.entries(joined)) {
        if (room!.members.includes(m)) continue;
        room!.members.push(m);
        if (k) room!.encrypted_keys = { ...room!.encrypted_keys, [m]: k };
      }
    } else if (b.type === "room_join" && b.roomId === roomId && room && !room.members.includes(a) && !kicked.has(a)) {
      room.members.push(a);
      joined[a] = typeof b.encrypted_key === "string" ? b.encrypted_key : "";
      // the key the joiner encrypted to themselves, so the room opens again after a reload
      if (typeof b.encrypted_key === "string") room.encrypted_keys = { ...room.encrypted_keys, [a]: b.encrypted_key };
    } else if (b.type === "room_leave" && b.roomId === roomId && room && a !== room.creator && room.members.includes(a)) {
      // a member leaves on their own: gone from the list, and their key copy with them
      room.members = room.members.filter((m) => m !== a);
      delete joined[a];
      room.moderators = (room.moderators ?? []).filter((m) => m !== a);
      room.encrypted_keys = Object.fromEntries(Object.entries(room.encrypted_keys ?? {}).filter(([m]) => m !== a));
    } else if (b.type === "room_kick" && b.roomId === roomId && room && typeof b.target === "string") {
      const t = norm(b.target);
      const byCreator = a === room.creator;
      const mods = room.moderators ?? [];
      const targetIsGardener = AI_REPORTERS.some((g) => norm(g) === t);
      const allowed = byCreator || mods.includes(a);
      if (!allowed || t === room.creator || !room.members.includes(t) || (!byCreator && mods.includes(t) && !targetIsGardener)) continue;
      room.members = room.members.filter((m) => m !== t);
      room.moderators = mods.filter((m) => m !== t);
      kicked.add(t);
      delete joined[t];
      const keys: Record<string, string> = typeof b.encrypted_keys === "object" && b.encrypted_keys ? b.encrypted_keys : {};
      room.encrypted_keys = Object.fromEntries(Object.entries(keys).filter(([m]) => room!.members.includes(m)));
      for (const m of Object.keys(joined)) joined[m] = room.encrypted_keys[m] ?? "";
      if (typeof b.name_encrypted === "string") room.name_encrypted = b.name_encrypted;
      room.keys_enc_pub = typeof b.keys_enc_pub === "string" ? b.keys_enc_pub : undefined;
      room.gardener_enc_pub = undefined;
    } else if (b.type === "room_gardener" && b.roomId === roomId && room && typeof b.target === "string") {
      const t = norm(b.target);
      const byCreator = a === room.creator;
      const mods = room.moderators ?? [];
      if (a !== norm(RADICA_MAINTAINER) || !(byCreator || mods.includes(a)) || !AI_REPORTERS.some((g) => norm(g) === t)) continue;
      if (b.on === true) {
        kicked.delete(t);
        if (!room.members.includes(t)) room.members.push(t);
        room.moderators = mods;
        if (t !== room.creator && !room.moderators.includes(t)) room.moderators.push(t);
        if (typeof b.encrypted_key === "string" && b.encrypted_key) {
          room.encrypted_keys = { ...room.encrypted_keys, [t]: b.encrypted_key };
        }
        room.gardener_enc_pub =
          typeof b.inviter_enc_pub === "string" && /^[0-9a-f]{64}$/i.test(b.inviter_enc_pub)
            ? norm(b.inviter_enc_pub)
            : a;
      }
    } else if (b.type === "room_avatar" && b.roomId === roomId && room) {
      const byCreator = a === room.creator;
      const mods = room.moderators ?? [];
      if (byCreator || mods.includes(a)) {
        room.avatar_url = typeof b.avatar_url === "string" && b.avatar_url.trim() ? b.avatar_url.trim() : undefined;
      }
    } else if (b.type === "room_pin" && b.roomId === roomId && room) {
      const byCreator = a === room.creator;
      const mods = room.moderators ?? [];
      if (byCreator || mods.includes(a)) {
        room.pinned_message_id = typeof b.messageId === "string" && b.messageId.trim() ? b.messageId.trim() : undefined;
      }
    }
  }
  return room;
}

/** Creator-authorized members vs link-join proofs (`room_join.key_proof`) so a kick never rotates keys to spoofed joiners. */
export function roomJoinProofs(
  entries: LogEntry[],
  roomId: string,
): { creatorListed: Set<string>; joinProofs: Map<string, string> } {
  const creatorListed = new Set<string>();
  const moderators = new Set<string>();
  const joinProofs = new Map<string, string>();
  let creator = "";
  for (const { e, b } of bodies(entries)) {
    const a = norm(e.author);
    if ((b.type === "private_room" || b.type === "room_invite") && b.room?.id === roomId && norm(b.room.creator) === a) {
      creator = a;
      creatorListed.add(a);
      moderators.clear();
      for (const m of b.room.moderators ?? []) {
        const ml = norm(m);
        if (ml && ml !== creator) moderators.add(ml);
      }
      for (const m of b.room.members ?? []) {
        const ml = norm(m);
        if (ml) creatorListed.add(ml);
      }
    } else if (b.type === "room_join" && b.roomId === roomId && creator) {
      if (typeof b.key_proof === "string" && /^[0-9a-f]{64}$/i.test(b.key_proof)) {
        joinProofs.set(a, b.key_proof.toLowerCase());
      }
    } else if (b.type === "room_gardener" && b.roomId === roomId && b.on === true && creator && a === norm(RADICA_MAINTAINER) && (a === creator || moderators.has(a)) && typeof b.target === "string") {
      const t = norm(b.target);
      if (AI_REPORTERS.some((g) => norm(g) === t)) {
        creatorListed.add(t);
        if (t !== creator) moderators.add(t);
      }
    } else if (b.type === "room_leave" && b.roomId === roomId) {
      creatorListed.delete(a);
      moderators.delete(a);
      joinProofs.delete(a);
    } else if (b.type === "room_kick" && b.roomId === roomId && typeof b.target === "string") {
      const t = norm(b.target);
      creatorListed.delete(t);
      moderators.delete(t);
      joinProofs.delete(t);
    }
  }
  return { creatorListed, joinProofs };
}

/** Did `me` leave this room: they are no longer in it and their last join or leave entry in the room log is a leave. */
export function hasLeftRoom(entries: LogEntry[], roomId: string, me: string): boolean {
  const meNorm = norm(me);
  const room = foldRoom(entries, roomId);
  if (!room || room.members.includes(meNorm)) return false;
  let left = false;
  for (const { e, b } of bodies(entries)) {
    if (norm(e.author) !== meNorm || b.roomId !== roomId) continue;
    if (b.type === "room_leave") left = true;
    else if (b.type === "room_join") left = false;
  }
  return left;
}

/** Who joined a room through its link and has not left since (`room_join`, `room_leave`): a broadcast channel's
 *  subscribers, whom River drops from its members while they never write. Someone `removers` kicked stays out. */
export function roomJoiners(entries: LogEntry[], roomId: string, removers: ReadonlySet<string>): string[] {
  const inRoom = new Map<string, boolean>();
  const kicked = new Set<string>();
  for (const { e, b } of bodies(entries)) {
    if (b?.roomId !== roomId) continue;
    const a = norm(e.author);
    if (b.type === "room_join" && !kicked.has(a)) inRoom.set(a, true);
    else if (b.type === "room_leave") inRoom.set(a, false);
    else if (b.type === "room_kick" && (removers.has(e.author) || removers.has(a)) && typeof b.target === "string") {
      const t = norm(b.target);
      kicked.add(t);
      inRoom.set(t, false);
    }
  }
  return [...inRoom].filter(([, on]) => on).map(([pk]) => pk);
}

/** Authors a curator blocked, from their `blocklist/<curator>` log. Only the curator's own entries count; the newest per target wins. */
export function foldBlocklist(entries: LogEntry[], curator: string, type: "block" | "mod" = "block", initial: Iterable<string> = []): Set<string> {
  const cur = norm(curator);
  const blocked = new Set<string>([...initial].map((x) => norm(x)));
  for (const { e, b } of bodies(entries)) {
    if (norm(e.author) !== cur || b.type !== type || typeof b.target !== "string") continue;
    const t = norm(b.target);
    if (b.on === false) blocked.delete(t);
    else blocked.add(t);
  }
  return blocked;
}

/** The communities a curator hid (`c_<slug>` -> reason), from their `blocklist/<curator>` log: only their own entries count, the
 *  newest per community wins, and `on: false` shows it again. Hiding is not deleting: it hides for whoever follows that list. */
export function foldHiddenCommunities(entries: LogEntry[], curator: string): Map<string, string> {
  const cur = norm(curator);
  const hidden = new Map<string, string>();
  for (const { e, b } of bodies(entries)) {
    if (norm(e.author) !== cur || b.type !== "hide_community" || typeof b.target !== "string" || !/^c_[a-z0-9_]{1,40}$/.test(b.target)) continue;
    if (b.on === false) hidden.delete(b.target);
    else hidden.set(b.target, typeof b.reason === "string" ? b.reason.trim().slice(0, 200) : "");
  }
  return hidden;
}

/** Posts a curator reported (`<author>:<post id>` -> reason), from their `blocklist/<curator>` log. Only the curator's own
 *  entries count; the newest per target wins, and `on: false` withdraws a report. */
export function foldReports(entries: LogEntry[], curator: string): Map<string, string> {
  const cur = norm(curator);
  const reported = new Map<string, string>();
  for (const { e, b } of bodies(entries)) {
    if (norm(e.author) !== cur || b.type !== "report" || typeof b.target !== "string") continue;
    if (b.on === false) reported.delete(b.target);
    else reported.set(b.target, typeof b.reason === "string" ? b.reason.slice(0, 200) : "");
  }
  return reported;
}

/** Posts Radica's AI moderation helper is holding (`<author>:<post id>` set), from the public `reports` log: a
 *  `report` entry by one of `aiReporters` with `hold: true`, newest per reporter+target wins. Unlike a moderator's
 *  own report, this is not on anyone's blocklist, so a human "Dismiss" cannot touch it the same way; the caller is
 *  expected to also drop any target a moderator dismissed (see FreenetNetwork.aiHeldTargets). */
export function foldAiHolds(entries: LogEntry[], aiReporters: readonly string[]): Set<string> {
  const aiSet = new Set(aiReporters.map((r) => norm(r)));
  const held = new Map<string, boolean>(); // `<reporter>|<target>` -> currently held
  for (const { e, b } of bodies(entries)) {
    const a = norm(e.author);
    if (!aiSet.has(a) || b.type !== "report" || typeof b.target !== "string") continue;
    held.set(`${a}|${b.target}`, b.on !== false && b.hold === true);
  }
  const out = new Set<string>();
  for (const [key, isHeld] of held) if (isHeld) out.add(key.slice(key.indexOf("|") + 1));
  return out;
}

/** Posts a moderator set aside without removing them (`dismiss` entries on their `blocklist/<curator>` log), newest wins. */
export function foldDismissed(entries: LogEntry[], curator: string): Set<string> {
  const cur = norm(curator);
  const dismissed = new Set<string>();
  for (const { e, b } of bodies(entries)) {
    if (norm(e.author) !== cur || b.type !== "dismiss" || typeof b.target !== "string") continue;
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

export interface HandledReportItem {
  /** `<author>:<post id>` */
  target: string;
  /** Moderator public key who made the latest active decision. */
  moderator: string;
  /** Latest active decision recorded on that moderator's blocklist log. */
  action: "removed" | "dismissed";
  /** Reason recorded by the moderator (when removed). */
  reason: string;
  /** Timestamp of the moderator's decision. */
  ts: number;
  /** Number of distinct active reporters in the public `reports` log. */
  reporters: number;
  /** Up to 3 report reasons from the public `reports` log. */
  reasons: string[];
}

/**
 * Recent post-level moderation decisions made by Radica's global moderators (`report` = removed, `dismiss` = dismissed
 * on each moderator's `blocklist/<moderator>` log). Only each moderator's own entries count, newest per (moderator,
 * target) wins (`on: false` withdraws that moderator's decision), and across moderators the most recent active
 * decision wins for a target. Sorted newest decision first.
 */
export function foldHandledReports(
  modLogs: ReadonlyArray<{ moderator: string; entries: LogEntry[] }>,
  reportEntries: LogEntry[],
  max = 20,
): HandledReportItem[] {
  const latestDecision = new Map<string, { moderator: string; action: "removed" | "dismissed"; reason: string; ts: number }>();

  for (const { moderator, entries } of modLogs) {
    const byTarget = new Map<string, { action: "removed" | "dismissed"; reason: string; ts: number } | null>();
    for (const { e, b } of bodies(entries)) {
      if (e.author !== moderator || typeof b.target !== "string" || !/^[0-9a-f]{64}:.+/.test(b.target)) continue;
      if (b.type !== "report" && b.type !== "dismiss") continue;
      if (b.on === false) {
        byTarget.set(b.target, null);
      } else {
        byTarget.set(b.target, {
          action: b.type === "report" ? "removed" : "dismissed",
          reason: typeof b.reason === "string" ? b.reason.trim().slice(0, 200) : "",
          ts: e.ts,
        });
      }
    }
    for (const [target, dec] of byTarget) {
      if (!dec) continue;
      const prev = latestDecision.get(target);
      if (!prev || dec.ts > prev.ts || (dec.ts === prev.ts && moderator < prev.moderator)) {
        latestDecision.set(target, { moderator, ...dec });
      }
    }
  }

  if (!latestDecision.size) return [];

  const latestReports = new Map<string, { reporter: string; target: string; reason: string; on: boolean }>();
  for (const { e, b } of bodies(reportEntries)) {
    if (b.type !== "report" || typeof b.target !== "string" || !latestDecision.has(b.target)) continue;
    latestReports.set(`${e.author}|${b.target}`, {
      reporter: e.author,
      target: b.target,
      reason: typeof b.reason === "string" ? b.reason.trim().slice(0, 200) : "",
      on: b.on !== false,
    });
  }

  const reportMeta = new Map<string, { reporters: Set<string>; reasons: string[] }>();
  for (const r of latestReports.values()) {
    if (!r.on) continue;
    const meta = reportMeta.get(r.target) ?? { reporters: new Set<string>(), reasons: [] };
    meta.reporters.add(r.reporter);
    if (r.reason && !meta.reasons.includes(r.reason) && meta.reasons.length < 3) meta.reasons.push(r.reason);
    reportMeta.set(r.target, meta);
  }

  return [...latestDecision.entries()]
    .map(([target, dec]) => {
      const meta = reportMeta.get(target);
      return {
        target,
        moderator: dec.moderator,
        action: dec.action,
        reason: dec.reason,
        ts: dec.ts,
        reporters: meta?.reporters.size ?? 0,
        reasons: meta?.reasons ?? [],
      };
    })
    .sort((a, b) => b.ts - a.ts || (a.target < b.target ? -1 : 1))
    .slice(0, max);
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

/** Entries that only matter as of now, and what each is about: one per author and subject is enough. */
const STATE_SUBJECT: Record<string, (b: any) => unknown> = {
  chat_read: (b) => b.room,
  chat_clear: (b) => b.room,
  chat_remove: (b) => b.peer,
  notif_read: () => "",
  notif_clear: () => "",
  room_ref: (b) => b.roomId,
  room_hide: (b) => b.roomId,
  river_access: (b) => b.roomId,
  dm_ref: (b) => b.room, // "a conversation of mine changed": one per conversation and author
  handle_claim: () => "",
  handle_release: () => "",
};

export { foldHandles, normalizeHandle, formatHandle, isValidHandle, RESERVED_HANDLES } from "./handles.ts";

/** The id an author writes state under, the same for every write about one subject: the log contract keeps the
 *  newest entry under a key, so the log holds one per subject instead of one per write. Short enough for any subject
 *  (a DM room id is 129 characters). */
export function stateSlot(type: string, subject: unknown): string {
  const h = sha256(new TextEncoder().encode(`${type}|${String(subject ?? "")}`));
  return `${type}:${Array.from(h.slice(0, 12), (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** The fixed id a state entry is written under (`stateSlot` of its type and subject), or null for any other entry. */
export function stateSlotFor(body: { type?: unknown } & Record<string, unknown>): string | null {
  const subject = typeof body.type === "string" ? STATE_SUBJECT[body.type] : undefined;
  return subject ? stateSlot(body.type as string, subject(body)) : null;
}

/** Entries of a one-to-one conversation (a direct message or Secret Chat), which an inbox carried before each
 *  conversation got its own log (`dm/<room>`). */
export const DM_ENTRY_TYPES = new Set(["chat", "chat_edit", "chat_delete", "chat_burn", "chat_react"]);

export function isDmEntry(e: LogEntry): boolean {
  try {
    return DM_ENTRY_TYPES.has(JSON.parse(e.body).type);
  } catch {
    return false;
  }
}

/** A log as it moves to a new contract generation, without what no longer counts: the newest state entry per author
 *  and subject (read marks, hidden rooms…). An inbox also leaves behind its conversations, which now have logs of
 *  their own (their history stays readable in the previous generation, and an entry's signature names its log, so it
 *  cannot move), and the notifications its owner cleared. Every kept entry is unchanged, so its signature holds. */
export function compactLog(name: string, entries: Record<string, LogEntry>): Record<string, LogEntry> {
  const owner = name.startsWith("inbox/") ? name.slice("inbox/".length) : null;
  const newest = new Map<string, string>(); // author|type|subject -> entry key
  let cleared = -1; // the owner's "clear all notifications"
  const parsed: [string, LogEntry, any][] = [];
  for (const [k, e] of Object.entries(entries)) {
    let b: any = null;
    try {
      b = JSON.parse(e.body);
    } catch {}
    parsed.push([k, e, b]);
    const subject = b && STATE_SUBJECT[b.type];
    if (subject) {
      const g = `${e.author}|${b.type}|${String(subject(b) ?? "")}`;
      const cur = newest.get(g);
      if (!cur || e.ts > entries[cur].ts || (e.ts === entries[cur].ts && e.sig > entries[cur].sig)) newest.set(g, k);
    }
    if (owner && b?.type === "notif_clear" && e.author === owner && typeof b.upto === "number") cleared = Math.max(cleared, b.upto);
  }
  const keep = new Set(newest.values());
  const out: Record<string, LogEntry> = {};
  for (const [k, e, b] of parsed) {
    if (b && STATE_SUBJECT[b.type] && !keep.has(k)) continue;
    if (owner && b && (DM_ENTRY_TYPES.has(b.type) || (b.type === "notif" && e.ts <= cleared))) continue;
    out[k] = e;
  }
  return out;
}

/** A device's key is announced again at most this often (while the app starts), and a Secret Chat sender drops a key
 *  not announced for `SECRET_DEVICE_TTL_MS`: a lost or retired device stops receiving copies on its own. */
export const DEVICE_HEARTBEAT_MS = 7 * 24 * 60 * 60 * 1000;
export const SECRET_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const isKey = (k: unknown): k is string => typeof k === "string" && /^[0-9a-f]{64}$/.test(k);

/** Device keys `persona` revoked: for good, a later announcement of the same key does not bring it back (a thief's device
 *  could announce too, so an announcement cannot undo a revoke). */
export function revokedDeviceKeys(entries: LogEntry[], persona: string): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    const b = e.author === persona ? (parseBody(e) as { type?: unknown; enc_pub?: unknown } | null) : null;
    if (b?.type === "device_revoke" && isKey(b.enc_pub)) out.add(b.enc_pub);
  }
  return out;
}

/** The encryption keys `persona`'s devices announced in `devices/<persona>` and did not revoke, each with the time of its
 *  newest announcement, oldest first (entries by that persona only: the log contract checks the author). */
export function deviceKeyTimes(entries: LogEntry[], persona: string): Map<string, number> {
  const revoked = revokedDeviceKeys(entries, persona);
  const seen = new Map<string, number>();
  for (const e of entries) {
    if (e.author !== persona) continue;
    const b = parseBody(e) as { type?: unknown; enc_pub?: unknown } | null;
    if (b?.type === "device_revoke" || !isKey(b?.enc_pub) || revoked.has(b.enc_pub)) continue;
    seen.set(b.enc_pub, Math.max(seen.get(b.enc_pub) ?? 0, e.ts));
  }
  return new Map([...seen].sort((a, z) => a[1] - z[1]));
}

/** Pick each author's newest log entry, breaking equal-timestamp ties deterministically by higher signature. */
export function latestByAuthor(entries: LogEntry[]): Map<string, LogEntry> {
  const latest = new Map<string, LogEntry>();
  for (const e of entries) {
    const cur = latest.get(e.author);
    if (!cur || e.ts > cur.ts || (e.ts === cur.ts && e.sig > cur.sig)) {
      latest.set(e.author, e);
    }
  }
  return latest;
}

function parseEntryObj(e: LogEntry): Record<string, unknown> | null {
  const b = parseBody(e);
  return b !== INVALID_JSON && b !== null && typeof b === "object" ? (b as Record<string, unknown>) : null;
}

/** Each author's latest choice on the public supporters wall: their receipt token, or null when withdrawn. */
export function foldSupporterTokens(entries: LogEntry[]): { author: string; token: string | null }[] {
  return [...latestByAuthor(entries).values()].map((e) => {
    const t = parseEntryObj(e)?.receipt;
    return { author: e.author, token: typeof t === "string" ? t : null };
  });
}

/** Each author's latest GhostKey proof (bundle hex) in the `ghostkeys` log, or null when withdrawn; unchecked. */
export function foldGhostkeyBundles(entries: LogEntry[]): { author: string; bundle: string | null }[] {
  return [...latestByAuthor(entries).values()].map((e) => {
    const b = parseEntryObj(e)?.bundle;
    return { author: e.author, bundle: typeof b === "string" && /^[0-9a-f]+$/.test(b) ? b : null };
  });
}

/** Each author's latest Viso PoH proof (hex CBOR PohAttestationV1, optional delegation) in the `poh` log, or null when withdrawn. */
export function foldPohProofs(entries: LogEntry[]): PohLogEntry[] {
  return [...latestByAuthor(entries).values()].map((e) => {
    const obj = parseEntryObj(e);
    const p = obj?.proof;
    const del = isDelegationProofShape(obj?.delegation) ? obj.delegation : null;
    return {
      author: e.author,
      proof: typeof p === "string" && /^[0-9a-f]+$/.test(p) ? p : null,
      ...(del ? { delegation: del } : {}),
    };
  });
}

/** Each author's latest Viso persona delegation (`DelegationProofV1`) in the `delegations` log, or null when withdrawn. */
export function foldDelegationProofs(entries: LogEntry[]): { author: string; proof: DelegationProofV1 | null }[] {
  return [...latestByAuthor(entries).values()].map((e) => {
    const p = parseEntryObj(e)?.proof;
    return { author: e.author, proof: isDelegationProofShape(p) ? p : null };
  });
}
