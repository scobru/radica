// Pure, zero-dependency log-contract folds for Private Rooms, moderators, blocklists, and post edits.
// Shared by `ui/src/logfold.ts` and `attester/src/moderator.js` so UI and backend never drift.

const HEX64_RE = /^[0-9a-f]{64}$/i;
const norm = (s) => (typeof s === "string" ? s.toLowerCase() : "");

/** Deterministically order a log array or `{ [key]: entry }` record by `(ts, author + id)`. */
export function orderedEntries(entries) {
  const list = Array.isArray(entries) ? entries : Object.values(entries ?? {});
  return [...list].sort(
    (a, b) => (a?.ts ?? 0) - (b?.ts ?? 0) || (`${a?.author ?? ""}${a?.id ?? ""}` < `${b?.author ?? ""}${b?.id ?? ""}` ? -1 : 1),
  );
}

function parsedOrdered(entries) {
  const out = [];
  for (const e of orderedEntries(entries)) {
    if (!e || typeof e.body !== "string") continue;
    try {
      const b = JSON.parse(e.body);
      if (b && typeof b === "object") out.push({ e, b });
    } catch {}
  }
  return out;
}

/**
 * Fold `room/<id>` entries into the authoritative native PrivateRoom roster, encrypted keys, avatar, and pin.
 * Enforces creator-only descriptors, joiner-only self-joins (blocked if kicked), moderator/creator kicks with key rotation,
 * and AI Gardener authorization when configured. Normalizes keys and pubkeys to lowercase across UI and attester.
 */
export function foldRoom(entries, roomId, opts = {}) {
  let room = null;
  const kicked = new Set();
  const joined = {};
  const maintNorm = norm(opts.maintainerPk);
  const gardenerNorm = norm(opts.gardenerPk);
  const allowedAi = opts.aiReporters ? new Set(opts.aiReporters.map(norm).filter(Boolean)) : null;
  const gardenerSet = new Set([...(HEX64_RE.test(gardenerNorm) ? [gardenerNorm] : []), ...(allowedAi ?? [])]);

  for (const { e, b } of parsedOrdered(entries)) {
    const a = norm(e.author);
    if ((b.type === "private_room" || b.type === "room_invite") && b.room?.id === roomId && norm(b.room.creator) === a) {
      room = structuredClone(b.room);
      room.creator = a;
      if (typeof room.creator_enc_pub === "string") room.creator_enc_pub = norm(room.creator_enc_pub);
      if (typeof room.keys_enc_pub === "string") room.keys_enc_pub = norm(room.keys_enc_pub);
      if (typeof room.gardener_enc_pub === "string") room.gardener_enc_pub = norm(room.gardener_enc_pub);
      room.members = (room.members ?? []).map(norm).filter(Boolean);
      room.moderators = (room.moderators ?? []).map(norm).filter((m) => m !== room.creator && room.members.includes(m));
      const ek = {};
      for (const [k, v] of Object.entries(room.encrypted_keys ?? {})) {
        if (typeof v === "string") ek[norm(k)] = v;
      }
      room.encrypted_keys = ek;
      for (const m of room.members) kicked.delete(m);
      for (const [m, k] of Object.entries(joined)) {
        if (room.members.includes(m)) continue;
        room.members.push(m);
        if (k) room.encrypted_keys[m] = k;
      }
    } else if (b.type === "room_join" && b.roomId === roomId && room && !room.members.includes(a) && !kicked.has(a)) {
      room.members.push(a);
      joined[a] = typeof b.encrypted_key === "string" ? b.encrypted_key : "";
      if (typeof b.encrypted_key === "string") room.encrypted_keys = { ...room.encrypted_keys, [a]: b.encrypted_key };
    } else if (b.type === "room_leave" && b.roomId === roomId && room && a !== room.creator && room.members.includes(a)) {
      room.members = room.members.filter((m) => m !== a);
      delete joined[a];
      room.moderators = (room.moderators ?? []).filter((m) => m !== a);
      room.encrypted_keys = Object.fromEntries(Object.entries(room.encrypted_keys ?? {}).filter(([m]) => m !== a));
    } else if (b.type === "room_kick" && b.roomId === roomId && room && typeof b.target === "string") {
      const t = norm(b.target);
      const byCreator = a === room.creator;
      const mods = room.moderators ?? [];
      if (!(byCreator || mods.includes(a)) || t === room.creator || !room.members.includes(t) || (!byCreator && mods.includes(t) && !gardenerSet.has(t))) {
        continue;
      }
      room.members = room.members.filter((m) => m !== t);
      room.moderators = mods.filter((m) => m !== t);
      kicked.add(t);
      delete joined[t];
      const keys = {};
      if (b.encrypted_keys && typeof b.encrypted_keys === "object") {
        for (const [m, v] of Object.entries(b.encrypted_keys)) {
          const ml = norm(m);
          if (room.members.includes(ml) && typeof v === "string") keys[ml] = v;
        }
      }
      room.encrypted_keys = keys;
      for (const m of Object.keys(joined)) joined[m] = keys[m] ?? "";
      if (typeof b.name_encrypted === "string") room.name_encrypted = b.name_encrypted;
      room.keys_enc_pub = typeof b.keys_enc_pub === "string" ? norm(b.keys_enc_pub) : undefined;
      room.gardener_enc_pub = undefined;
    } else if (b.type === "room_gardener" && b.roomId === roomId && room && typeof b.target === "string") {
      const t = norm(b.target);
      const byCreator = a === room.creator;
      const mods = room.moderators ?? [];
      const maintOk = !maintNorm || a === maintNorm;
      const targetOk = HEX64_RE.test(t) && (!gardenerNorm || t === gardenerNorm) && (!allowedAi || allowedAi.has(t));
      if (!maintOk || !(byCreator || mods.includes(a)) || !targetOk) continue;
      if (b.on === true) {
        gardenerSet.add(t);
        kicked.delete(t);
        if (!room.members.includes(t)) room.members.push(t);
        room.moderators = mods;
        if (t !== room.creator && !room.moderators.includes(t)) room.moderators.push(t);
        if (typeof b.encrypted_key === "string" && b.encrypted_key) {
          room.encrypted_keys = { ...room.encrypted_keys, [t]: b.encrypted_key };
        }
        room.gardener_enc_pub = HEX64_RE.test(String(b.inviter_enc_pub ?? "")) ? norm(b.inviter_enc_pub) : a;
      }
    } else if (b.type === "room_avatar" && b.roomId === roomId && room) {
      if (a === room.creator || (room.moderators ?? []).includes(a)) {
        room.avatar_url = typeof b.avatar_url === "string" && b.avatar_url.trim() ? b.avatar_url.trim() : undefined;
      }
    } else if (b.type === "room_pin" && b.roomId === roomId && room) {
      if (a === room.creator || (room.moderators ?? []).includes(a)) {
        room.pinned_message_id = typeof b.messageId === "string" && b.messageId.trim() ? b.messageId.trim() : undefined;
      }
    }
  }
  return room;
}

/** Creator-authorized members vs link-join HMAC `key_proof` values from `room/<id>` entries. */
export function roomJoinProofs(entries, roomId, opts = {}) {
  const creatorListed = new Set();
  const moderators = new Set();
  const joinProofs = new Map();
  const maintNorm = norm(opts.maintainerPk);
  const allowedAi = opts.aiReporters ? new Set(opts.aiReporters.map(norm).filter(Boolean)) : null;
  let creator = "";

  for (const { e, b } of parsedOrdered(entries)) {
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
      if (typeof b.key_proof === "string" && HEX64_RE.test(b.key_proof)) {
        joinProofs.set(a, b.key_proof.toLowerCase());
      }
    } else if (
      b.type === "room_gardener" &&
      b.roomId === roomId &&
      b.on === true &&
      creator &&
      (!maintNorm || a === maintNorm) &&
      (a === creator || moderators.has(a)) &&
      typeof b.target === "string"
    ) {
      const t = norm(b.target);
      if (HEX64_RE.test(t) && (!allowedAi || allowedAi.has(t))) {
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

/** Newest caption edit per `<author>:<post id>` from the `post-edits` log. */
export function foldPostEdits(entries, max = 4000) {
  const out = new Map();
  for (const { e, b } of parsedOrdered(entries)) {
    if (b?.type !== "edit" || typeof b.post !== "string" || typeof b.caption !== "string" || b.caption.length > max) continue;
    const key = `${e.author}:${b.post}`;
    const cur = out.get(key);
    if (!cur || e.ts >= cur.ts) out.set(key, { caption: b.caption, ts: e.ts });
  }
  return out;
}

/** Curated set fold (`block` or `mod` entries on `blocklist/<curator>`), newest per target wins. */
export function foldBlocklist(entries, curator, type = "block", initial = [], opts = {}) {
  const cur = norm(curator);
  const seeded = [...(initial ?? [])].map((x) => (cur ? norm(x) : String(x)));
  const defSet = new Set(seeded);
  const out = new Set(seeded);
  for (const { e, b } of parsedOrdered(entries)) {
    if (cur && norm(e.author) !== cur) continue;
    if (b?.type !== type || typeof b.target !== "string") continue;
    const t = cur ? norm(b.target) : b.target;
    if (opts.requireHexTarget && cur && !HEX64_RE.test(t) && !defSet.has(t)) continue;
    if (b.on === false) out.delete(t);
    else out.add(t);
  }
  return out;
}
