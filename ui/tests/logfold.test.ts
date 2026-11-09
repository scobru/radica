import test from "node:test";
import assert from "node:assert/strict";
import { RADICA_MAINTAINER } from "../src/types.ts";
import { foldHiddenCommunities, directoryWeights, laneSample, foldBlocklist, foldReports, foldReportedMedia, foldReportQueue, foldDismissed, foldChatRead, foldChat, foldCommunities, foldRoom, hasLeftRoom, keepNewest, foldChatHides, foldCommentLikes, foldPostDislikes, foldPostEdits, compactLog, stateSlot, type LogEntry } from "../src/logfold.ts";

let n = 0;
const entry = (author: string, ts: number, body: object): LogEntry => ({ author, id: `e${n++}`, ts, body: JSON.stringify(body), sig: "" });
const [owner, mod, user, mallory] = ["aa", "bb", "cc", "dd"].map((c) => c.repeat(32));

test("logfold: community authority comes from the creator and its moderators", () => {
  const log = [
    entry(owner, 1, { type: "community_create", community: { id: "c_cats", name: "Cats" } }),
    entry(mallory, 2, { type: "community_create", community: { id: "c_cats", name: "Taken over" } }),
    entry(user, 3, { type: "community_join", community_id: "c_cats" }),
    entry(mallory, 4, { type: "community_mod_add", community_id: "c_cats", target: mallory }),
    entry(owner, 5, { type: "community_mod_add", community_id: "c_cats", target: mod }),
    entry(mallory, 6, { type: "community_ban", community_id: "c_cats", target: user }),
    entry(mod, 7, { type: "community_ban", community_id: "c_cats", target: mallory }),
    entry(mallory, 8, { type: "community_join", community_id: "c_cats" }),
    entry(mod, 9, { type: "community_ban", community_id: "c_cats", target: owner }),
    entry(user, 10, { type: "community_delete_post", community_id: "c_cats", post_id: "p1", post_author: owner }),
    entry(mod, 11, { type: "community_delete_post", community_id: "c_cats", post_id: "p2", post_author: user }),
  ];
  const [c] = foldCommunities(log, []);
  assert.equal(c.name, "Cats");
  assert.equal(c.creator, owner);
  assert.deepEqual(c.moderators, [owner, mod]);
  assert.deepEqual(c.members, [owner, user]);
  assert.deepEqual(c.banned_members, [mallory]);
  assert.deepEqual(c.deleted_post_ids, ["p2"]);
  // the order entries arrive in does not matter
  assert.deepEqual(foldCommunities([...log].reverse(), []), [c]);
});

test("logfold: c_radica always includes RADICA_MAINTAINER as moderator", () => {
  const [c] = foldCommunities([], [{
    id: "c_radica",
    name: "Radica Hub",
    slug: "radica",
    description: "Decentralized social commons, Freenet dApps, and network updates.",
    created_at: 1710000000000,
    creator: "system",
    moderators: ["system"],
    members: [],
    deleted_post_ids: [],
    sig: "genesis",
  }]);
  assert.equal(c.moderators.includes(RADICA_MAINTAINER), true);
});

test("logfold: chat keeps messages sent by the entry author and honors who may delete", () => {
  const msg = (id: string, sender: string, ts: number) => ({ id, room_id: "r", sender, text: id, timestamp: ts, sig: "" });
  const log = [
    entry(user, 1, { type: "chat", message: msg("m1", user, 1) }),
    entry(mallory, 2, { type: "chat", message: msg("m2", user, 2) }), // forged sender
    entry(mallory, 3, { type: "chat", message: msg("m3", mallory, 3) }),
    entry(mallory, 4, { type: "chat_delete", roomId: "r", messageId: "m1" }),
    entry(user, 5, { type: "chat", message: { ...msg("m4", user, 5), room_id: "other" } }),
  ];
  assert.deepEqual(foldChat(log, "r").map((m) => m.id), ["m1", "m3"]);
  assert.deepEqual(foldChat(log, "r", () => true, (s) => s === mallory).map((m) => m.id), []);
});

test("logfold: a room descriptor counts only from its creator", () => {
  const room = { id: "privroom_1", creator: owner, name_encrypted: "x", members: [owner, user], encrypted_keys: {}, created_at: 1, sig: "" };
  const log = [
    entry(owner, 1, { type: "private_room", room }),
    entry(mallory, 2, { type: "private_room", room: { ...room, members: [mallory] } }),
    entry(mod, 3, { type: "room_join", roomId: "privroom_1" }),
  ];
  assert.deepEqual(foldRoom(log, "privroom_1")?.members, [owner, user, mod]);
  assert.equal(foldRoom([log[1]], "privroom_1"), null);
});

test("logfold: a creator entry written after a join by link does not drop the joiner", () => {
  const room = { id: "privroom_1", creator: owner, name_encrypted: "x", members: [owner], encrypted_keys: {}, created_at: 1, sig: "" };
  const log = [
    entry(owner, 1, { type: "private_room", room }),
    entry(user, 2, { type: "room_join", roomId: "privroom_1", encrypted_key: "k" }),
    entry(owner, 3, { type: "private_room", room: { ...room, members: [owner, mod] } }), // stale copy: no user
  ];
  const r = foldRoom(log, "privroom_1")!;
  assert.deepEqual(r.members, [owner, mod, user]);
  assert.equal(r.encrypted_keys[user], "k");
});

test("logfold: room moderators can kick members, but not the creator or each other", () => {
  const room = { id: "privroom_1", creator: owner, name_encrypted: "n0", members: [owner, mod, user, mallory], moderators: [mod, mallory.replace(/d/g, "e")], encrypted_keys: {}, created_at: 1, sig: "" };
  const kick = (author: string, ts: number, target: string, extra: object = {}) =>
    entry(author, ts, { type: "room_kick", roomId: "privroom_1", target, name_encrypted: "n1", encrypted_keys: { [owner]: "k", [mod]: "k", [user]: "k", [mallory]: "k" }, keys_enc_pub: mod, ...extra });
  const log = [
    entry(owner, 1, { type: "private_room", room }),
    kick(mallory, 2, user), // not a moderator
    kick(mod, 3, owner), // the creator cannot be kicked
    kick(mod, 4, mod), // a moderator cannot kick a moderator (including themselves)
    kick(mod, 5, user), // allowed
  ];
  const r = foldRoom(log, "privroom_1")!;
  assert.deepEqual(r.members, [owner, mod, mallory]);
  assert.deepEqual(r.moderators, [mod]); // names that are not members are dropped
  assert.equal(r.name_encrypted, "n1");
  assert.equal(r.keys_enc_pub, mod);
  assert.deepEqual(Object.keys(r.encrypted_keys).sort(), [owner, mod, mallory].sort()); // the kicked member's key is gone
  assert.deepEqual(foldRoom([...log].reverse(), "privroom_1"), r); // arrival order does not matter
  // the creator can kick a moderator, who then loses the role
  const byOwner = foldRoom([...log, kick(owner, 6, mod, { keys_enc_pub: undefined })], "privroom_1")!;
  assert.deepEqual(byOwner.members, [owner, mallory]);
  assert.deepEqual(byOwner.moderators, []);
  assert.equal(byOwner.keys_enc_pub, undefined);
});

test("logfold: a member who joined by link keeps the key they stored in their join entry", () => {
  const room = { id: "privroom_1", creator: owner, name_encrypted: "x", members: [owner], encrypted_keys: { [owner]: "ko" }, created_at: 1, sig: "" };
  const log = [
    entry(owner, 1, { type: "private_room", room }),
    entry(user, 2, { type: "room_join", roomId: "privroom_1", encrypted_key: "ku" }),
    entry(mallory, 3, { type: "room_join", roomId: "privroom_1" }), // joined without a stored key
  ];
  const r = foldRoom(log, "privroom_1")!;
  assert.deepEqual(r.members, [owner, user, mallory]);
  assert.deepEqual(r.encrypted_keys, { [owner]: "ko", [user]: "ku" });
});

test("logfold: a member can leave a room, the creator cannot, and joining again brings them back", () => {
  const room = { id: "privroom_1", creator: owner, name_encrypted: "x", members: [owner, user, mod], moderators: [mod], encrypted_keys: { [owner]: "ko", [user]: "ku", [mod]: "km" }, created_at: 1, sig: "" };
  const log = [
    entry(owner, 1, { type: "private_room", room }),
    entry(user, 2, { type: "room_leave", roomId: "privroom_1" }),
    entry(owner, 3, { type: "room_leave", roomId: "privroom_1" }), // the creator stays
    entry(mod, 4, { type: "room_leave", roomId: "privroom_1" }),
    entry(mallory, 5, { type: "room_leave", roomId: "privroom_1" }), // not a member: nothing to remove
  ];
  const r = foldRoom(log, "privroom_1")!;
  assert.deepEqual(r.members, [owner]);
  assert.deepEqual(r.moderators, []);
  assert.deepEqual(r.encrypted_keys, { [owner]: "ko" });
  assert.equal(hasLeftRoom(log, "privroom_1", user), true);
  assert.equal(hasLeftRoom(log, "privroom_1", owner), false);
  const back = [...log, entry(user, 6, { type: "room_join", roomId: "privroom_1", encrypted_key: "ku2" })];
  assert.deepEqual(foldRoom(back, "privroom_1")!.members, [owner, user]);
  assert.equal(hasLeftRoom(back, "privroom_1", user), false);
});

test("logfold: a kicked member cannot rejoin by link, but one who left can; the creator can let a kicked member back in", () => {
  const room = { id: "privroom_1", creator: owner, name_encrypted: "x", members: [owner, user, mod, mallory], moderators: [], encrypted_keys: {}, created_at: 1, sig: "" };
  const kick = (ts: number, target: string) => entry(owner, ts, { type: "room_kick", roomId: "privroom_1", target, name_encrypted: "x2", encrypted_keys: {} });
  const join = (who: string, ts: number) => entry(who, ts, { type: "room_join", roomId: "privroom_1" });
  const log = [
    entry(owner, 1, { type: "private_room", room }),
    kick(2, mallory),
    entry(user, 3, { type: "room_leave", roomId: "privroom_1" }),
    join(mallory, 4), // kicked: ignored
    join(user, 5), // left on their own: may come back
  ];
  assert.deepEqual(foldRoom(log, "privroom_1")!.members, [owner, mod, user]);
  const reinvited = [...log, entry(owner, 6, { type: "private_room", room: { ...room, members: [owner, mod, user, mallory] } })];
  assert.deepEqual(foldRoom(reinvited, "privroom_1")!.members, [owner, mod, user, mallory]);
  assert.deepEqual(foldRoom([...reinvited, join(mallory, 7)], "privroom_1")!.members, [owner, mod, user, mallory]);
});

test("logfold: room avatar can be set on creation and updated by creator or moderator", () => {
  const room = {
    id: "privroom_pic",
    creator: owner,
    name_encrypted: "x",
    avatar_url: "data:image/jpeg;base64,orig",
    members: [owner, mod, user],
    moderators: [mod],
    encrypted_keys: {},
    created_at: 1,
    sig: "",
  };
  const log = [
    entry(owner, 1, { type: "private_room", room }),
    entry(user, 2, { type: "room_avatar", roomId: "privroom_pic", avatar_url: "data:image/jpeg;base64,unauthorized" }),
    entry(mod, 3, { type: "room_avatar", roomId: "privroom_pic", avatar_url: "data:image/jpeg;base64,updated_by_mod" }),
  ];
  const r = foldRoom(log, "privroom_pic")!;
  assert.equal(r.avatar_url, "data:image/jpeg;base64,updated_by_mod");

  const resetLog = [...log, entry(owner, 4, { type: "room_avatar", roomId: "privroom_pic", avatar_url: "" })];
  const r2 = foldRoom(resetLog, "privroom_pic")!;
  assert.equal(r2.avatar_url, undefined);
});

test("logfold: a blocklist only counts the curator's own entries, newest wins", () => {
  const log = [
    entry(owner, 1, { type: "block", target: mallory, on: true }),
    entry(mallory, 2, { type: "block", target: owner, on: true }), // not the curator: ignored
    entry(owner, 3, { type: "block", target: user, on: true }),
    entry(owner, 4, { type: "block", target: user, on: false }),
  ];
  assert.deepEqual([...foldBlocklist(log, owner)], [mallory]);
  assert.deepEqual([...foldBlocklist([...log].reverse(), owner)], [mallory]);
});

test("logfold: reports count only the curator's own entries, newest per post wins", () => {
  const log = [
    entry(owner, 1, { type: "report", target: "a:p1", reason: "spam" }),
    entry(owner, 2, { type: "report", target: "a:p2", reason: "abuse" }),
    entry(owner, 3, { type: "report", target: "a:p2", on: false }), // withdrawn
    entry(mallory, 4, { type: "report", target: "a:p3", reason: "x" }), // not the curator: ignored
    entry(owner, 5, { type: "block", target: "a" }), // a block is not a report
  ];
  assert.deepEqual([...foldReports(log, owner)], [["a:p1", "spam"]]);
});

test("logfold: chat read marks count only my own entries and keep the latest per room", () => {
  const log = [
    entry(owner, 1, { type: "chat_read", room: "r1", upto: 10 }),
    entry(owner, 2, { type: "chat_read", room: "r1", upto: 5 }),
    entry(owner, 3, { type: "chat_read", room: "r2", upto: 7 }),
    entry(mallory, 4, { type: "chat_read", room: "r1", upto: 999 }), // not me: ignored
  ];
  assert.deepEqual(foldChatRead(log, owner), { r1: 10, r2: 7 });
});

test("logfold: reactions: latest word per person, closed emoji set, forged ones and strangers ignored", () => {
  const up = "\u{1F44D}";
  const msg = (id: string, sender: string, extra: object = {}) => ({ id, room_id: "r", sender, text: id, timestamp: 1, sig: "", ...extra });
  const react = (a: string, ts: number, on: boolean, emoji = up, messageId = "m1") => entry(a, ts, { type: "chat_react", roomId: "r", messageId, emoji, on });
  const log = [
    entry(user, 1, { type: "chat", message: msg("m1", user, { reactions: { [up]: [mod, owner] }, reply_to: "x" }) }), // forged reactions are dropped
    react(mod, 2, true),
    react(owner, 3, true),
    react(owner, 4, false), // owner took it back
    react(mallory, 5, true),
    react(mod, 6, true, "\u{1F4A9}"), // not in the closed set
  ];
  const [m] = foldChat(log, "r");
  assert.deepEqual(m.reactions, { [up]: [mod, mallory] });
  assert.equal(m.reply_to, "x");
  // a direct message takes reactions only from its two people
  const dm = foldChat(log, "r", undefined, undefined, (a) => a === user || a === mod);
  assert.deepEqual(dm[0].reactions, { [up]: [mod] });
  // a reaction on a deleted message goes with it
  assert.deepEqual(foldChat([...log, entry(user, 9, { type: "chat_delete", roomId: "r", messageId: "m1" })], "r"), []);
});

test("logfold: notifications keep the newest ones whatever order the log gives them", () => {
  // the log comes in key order: author "aa"'s newest notification first, then many older ones of "bb"
  const incoming = [{ id: "aa:new", timestamp: 1000 }, ...Array.from({ length: 60 }, (_, i) => ({ id: `bb:${i}`, timestamp: i }))];
  let list: { id: string; timestamp: number }[] = [];
  for (const n of incoming) list = keepNewest(list, n, 50);
  assert.equal(list.length, 50);
  assert.equal(list[0].id, "aa:new");
  assert.equal(list[49].timestamp, 11); // the 49 newest of "bb" (59..11) follow it
  assert.equal(keepNewest(list, { id: "aa:new", timestamp: 1000 }, 50), list); // already there
  assert.equal(keepNewest(list, { id: "cc:old", timestamp: 5 }, 50), list); // older than all kept
});

test("logfold: my clears and removals hold; nobody else can clear for me", () => {
  const log = [
    entry(owner, 5, { type: "chat_clear", room: "dm_x", upto: 100 }),
    entry(owner, 6, { type: "chat_clear", room: "dm_x", upto: 50 }), // an older clear does not undo a newer one
    entry(owner, 7, { type: "chat_remove", peer: user, upto: 70 }),
    entry(mallory, 8, { type: "chat_clear", room: "dm_y", upto: 999 }), // written into my inbox by someone else
    entry(owner, 9, { type: "chat_remove", peer: mod }), // no upto: ignored
    entry(owner, 10, { type: "room_hide", roomId: "privroom_a" }),
    entry(owner, 12, { type: "room_hide", roomId: "privroom_a", on: false }), // joined again later
    entry(owner, 11, { type: "room_hide", roomId: "privroom_b" }),
    entry(mallory, 13, { type: "room_hide", roomId: "privroom_c" }),
  ];
  assert.deepEqual(foldChatHides(log, owner), { cleared: { dm_x: 100 }, removed: { [user]: 70 }, rooms: { privroom_a: false, privroom_b: true } });
});

test("logfold: comment likes track likers, newest toggle wins per person", () => {
  const commKey = "cc_author:comm_1";
  const postId = "post_100";
  const log = [
    entry(user, 10, { type: "comment_like", postId, commentKey: commKey, liked: true }),
    entry(mod, 11, { type: "comment_like", postId, commentKey: commKey, liked: true }),
    entry(user, 12, { type: "comment_like", postId, commentKey: commKey, liked: false }), // user unliked
    entry(user, 15, { type: "comment_like", postId, commentKey: commKey, liked: true }), // user liked again
    entry(mallory, 9, { type: "other_junk", foo: "bar" }), // unrelated entry ignored
    entry(mod, 20, { type: "comment_like", postId, commentKey: commKey, liked: false }), // mod unliked
    entry(owner, 25, { type: "comment_like", postId, commentKey: "cc_author:comm_2", liked: true }), // another comment
  ];

  const map = foldCommentLikes(log);
  // Full target and bare target both resolve
  assert.deepEqual(map.get(`${postId}:${commKey}`), [user]);
  assert.deepEqual(map.get(commKey), [user]);
  assert.deepEqual(map.get("cc_author:comm_2"), [owner]);
  assert.equal(map.get("non_existent"), undefined);
});

test("logfold: post dislikes track dislikers, newest toggle wins per person", () => {
  const author1 = "1".repeat(64);
  const author2 = "2".repeat(64);
  const postId = "post_123";

  const log = [
    entry(author1, 10, { type: "post_dislike", postId, disliked: true }),
    entry(author2, 12, { type: "post_dislike", postId, disliked: true }),
    entry(author1, 15, { type: "post_dislike", postId, disliked: false }), // author1 undisliked
  ];

  const map = foldPostDislikes(log);
  assert.deepEqual(map.get(postId), [author2]);
  assert.equal(map.get("other_post"), undefined);
});

test("logfold: message editing updates text and sets edited_at, prevents unauthorized edits", () => {
  const m1 = { id: "m1", room_id: "privroom_1", sender: user, text: "original text", timestamp: 10 };
  const log = [
    entry(user, 10, { type: "chat", message: m1 }),
    entry(mallory, 12, { type: "chat_edit", roomId: "privroom_1", messageId: "m1", text: "hacked text" }),
    entry(user, 15, { type: "chat_edit", roomId: "privroom_1", messageId: "m1", text: "updated text" }),
  ];
  const msgs = foldChat(log, "privroom_1");
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].text, "updated text");
  assert.equal(msgs[0].edited_at, 15);
});

test("logfold: room pinning allows creator and moderator to pin/unpin, ignores strangers", () => {
  const room = {
    id: "privroom_1",
    creator: owner,
    name_encrypted: "x",
    members: [owner, mod, mallory],
    moderators: [mod],
    encrypted_keys: {},
    created_at: 1,
    sig: "",
  };
  const log = [
    entry(owner, 1, { type: "private_room", room }),
    entry(mallory, 2, { type: "room_pin", roomId: "privroom_1", messageId: "msg_bad" }),
    entry(mod, 3, { type: "room_pin", roomId: "privroom_1", messageId: "msg_good" }),
  ];
  const r1 = foldRoom(log, "privroom_1")!;
  assert.equal(r1.pinned_message_id, "msg_good");

  const unpinLog = [...log, entry(owner, 4, { type: "room_pin", roomId: "privroom_1", messageId: "" })];
  const r2 = foldRoom(unpinLog, "privroom_1")!;
  assert.equal(r2.pinned_message_id, undefined);
});

test("logfold: blocked sender filters out messages and reactions in chat rooms", () => {
  const up = "\u{1F44D}";
  const m1: ChatMessage = { id: "m1", room_id: "r1", sender: user, text: "hello", timestamp: 10, sig: "" };
  const m2: ChatMessage = { id: "m2", room_id: "r1", sender: mallory, text: "spam", timestamp: 20, sig: "" };
  const log = [
    entry(user, 10, { type: "chat", message: m1 }),
    entry(mallory, 20, { type: "chat", message: m2 }),
    entry(mallory, 30, { type: "chat_react", roomId: "r1", messageId: "m1", emoji: up, on: true }),
    entry(mod, 35, { type: "chat_react", roomId: "r1", messageId: "m1", emoji: up, on: true }),
  ];

  const unblocked = foldChat(log, "r1");
  assert.equal(unblocked.length, 2);
  assert.deepEqual(unblocked[0].reactions?.[up], [mallory, mod]);

  const blocked = foldChat(log, "r1", () => true, (sender) => sender === mallory);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].id, "m1");
  assert.deepEqual(blocked[0].reactions?.[up], [mod]);
});

test("foldPostEdits keeps each author's newest edit of their own post", () => {
  const e = (author: string, id: string, ts: number, body: object): LogEntry => ({ author, id, ts, body: JSON.stringify(body), sig: "" });
  const edits = foldPostEdits([
    e("alice", "1", 10, { type: "edit", post: "p1", caption: "first" }),
    e("alice", "2", 30, { type: "edit", post: "p1", caption: "newest" }),
    e("alice", "3", 20, { type: "edit", post: "p1", caption: "older, read last" }),
    e("mallory", "4", 99, { type: "edit", post: "p1", caption: "not her post" }),
    e("alice", "5", 40, { type: "edit", post: "p2", caption: "x".repeat(5000) }),
  ]);
  assert.deepEqual(edits.get("alice:p1"), { caption: "newest", ts: 30 });
  assert.equal(edits.get("mallory:p1")?.caption, "not her post"); // keyed by its signer: never shown on alice's post
  assert.equal(edits.has("alice:p2"), false);
});

test("logfold: reported media follow the curator's own reports, and a withdrawn report frees them", () => {
  const [h1, h2, h3] = ["1", "2", "3"].map((c) => c.repeat(64));
  const log = [
    entry(owner, 1, { type: "report", target: "a:p1", reason: "nsfw", media: h1 }),
    entry(owner, 2, { type: "report", target: "b:p2", media: h2 }),
    entry(owner, 3, { type: "report", target: "b:p2", on: false }),
    entry(owner, 4, { type: "report", target: "c:p3", media: "not-a-hash" }),
    entry(mallory, 5, { type: "report", target: "d:p4", media: h3 }), // not the curator: ignored
  ];
  assert.deepEqual([...foldReportedMedia(log, owner)], [h1]);
});

test("dedupeChat: one copy per message (same id or same signature), in time order", async () => {
  const { dedupeChat } = await import("../src/logfold.ts");
  const a = { id: "a", sig: "s1", timestamp: 1 };
  const b = { id: "b", sig: "s2", timestamp: 3 };
  const out = dedupeChat([a, b, { ...a }, { id: "a2", sig: "s1", timestamp: 1 }, { id: "c", sig: "", timestamp: 2 }]);
  assert.deepEqual(out.map((m) => m.id), ["a", "c", "b"]);
});

test("logfold: the moderators a curator names are its own mod entries, apart from its blocks", () => {
  const log = [
    entry(owner, 1, { type: "mod", target: user, on: true }),
    entry(owner, 2, { type: "block", target: mallory, on: true }),
    entry(mallory, 3, { type: "mod", target: mallory, on: true }), // only the curator names moderators
  ];
  assert.deepEqual([...foldBlocklist(log, owner, "mod")], [user]);
  assert.deepEqual([...foldBlocklist(log, owner)], [mallory]);
  assert.deepEqual([...foldBlocklist([...log, entry(owner, 4, { type: "mod", target: user, on: false })], owner, "mod")], []);
});

test("logfold: moderators named from the start can be removed by the curator's own entry", () => {
  assert.deepEqual([...foldBlocklist([], owner, "mod", [user])], [user]);
  assert.deepEqual([...foldBlocklist([entry(owner, 1, { type: "mod", target: user, on: false })], owner, "mod", [user])], []);
});

test("logfold: directory weights count the work in a hello, clamp dates to now and drop the stale", async () => {
  const { solvePoW, ANNOUNCE_POW_BITS } = await import("../src/pow.ts");
  const now = 1_800_000_000_000;
  const proven = "1".repeat(64), legacy = "2".repeat(64), borrowed = "3".repeat(64), stale = "4".repeat(64), future = "5".repeat(64);
  const proof = await solvePoW(proven, now - 1000, ANNOUNCE_POW_BITS, "hello");
  const other = await solvePoW("9".repeat(64), now - 1000, ANNOUNCE_POW_BITS, "hello"); // someone else's work
  const hello = (author: string, ts: number, pow?: object) => entry(author, ts, pow ? { type: "hello", pow } : { type: "hello" });
  const w = directoryWeights(
    [
      hello(proven, now - 1000, { ts: now - 1000, nonce: proof.nonce }),
      hello(legacy, now - 1000),
      hello(borrowed, now - 1000, { ts: now - 1000, nonce: other.nonce }),
      hello(stale, now - 31 * 864e5),
      hello(future, now + 10 * 864e5),
    ],
    now,
  );
  assert.ok((w.get(proven) ?? 0) >= 1, "a proof for this key counts at least 1");
  assert.equal(w.get(legacy), 0.25, "no proof: a quarter");
  assert.equal(w.get(borrowed), 0.25, "another key's proof does not count");
  assert.equal(w.has(stale), false, "older than 30 days: gone");
  assert.equal(w.get(future), 0.25, "a future date is only now");
});

test("logfold: the lane is a weighted draw, stable for a seed, and a flood of identities cannot take it all", () => {
  const real = Array.from({ length: 20 }, (_, i) => `r${i}`);
  const bots = Array.from({ length: 1000 }, (_, i) => `b${i}`);
  const weights = new Map<string, number>([...real.map((k) => [k, 1] as [string, number]), ...bots.map((k) => [k, 0.25] as [string, number])]);
  const keys = [...bots, ...real];
  assert.deepEqual(laneSample(keys, weights, 30, "s1"), laneSample(keys, weights, 30, "s1"), "same seed, same lane");
  assert.equal(laneSample(keys, weights, 30, "s1").length, 30);
  let realSeen = 0;
  for (let i = 0; i < 40; i++) realSeen += laneSample(keys, weights, 30, `seed${i}`).filter((k) => k.startsWith("r")).length;
  assert.ok(realSeen / 40 >= 1.5, `real people keep their share: ${realSeen / 40} of 30 on average`); // ~2.2 of 30 expected: 20 real at 1 against 1000 bots at 0.25
  // more work, more weight: the same draw with a heavier real set shows far more of them
  const heavy = new Map(weights);
  for (const k of real) heavy.set(k, 16);
  let heavySeen = 0;
  for (let i = 0; i < 40; i++) heavySeen += laneSample(keys, heavy, 30, `seed${i}`).filter((k) => k.startsWith("r")).length;
  assert.ok(heavySeen > realSeen * 3, "weight follows work");
});

test("logfold: the report queue counts different reporters, skips resolved and withdrawn, and ranks by reporters", () => {
  const p1 = `${"a".repeat(64)}:p1`;
  const p2 = `${"a".repeat(64)}:p2`;
  const p3 = `${"b".repeat(64)}:p3`;
  const log = [
    entry(user, 1, { type: "report", target: p1, reason: "spam" }),
    entry(user, 2, { type: "report", target: p1, reason: "spam again" }), // same reporter: still one
    entry(mallory, 3, { type: "report", target: p1, reason: "spam" }),
    entry(user, 4, { type: "report", target: p2, reason: "abuse" }),
    entry(mallory, 5, { type: "report", target: p2, on: false }), // never counted
    entry(mallory, 6, { type: "report", target: p3 }), // resolved below
    entry(mallory, 7, { type: "report", target: "not-a-target" }),
  ];
  const queue = foldReportQueue(log, new Set([p3]));
  assert.deepEqual(queue.map((q) => [q.target, q.reporters]), [[p1, 2], [p2, 1]]);
  assert.deepEqual(queue[0].reasons, ["spam again", "spam"]);
  assert.deepEqual(queue[0].reporterKeys, [user, mallory]);
  assert.deepEqual(queue[0].reports, [
    { reporter: mallory, reason: "spam", ts: 3 },
    { reporter: user, reason: "spam again", ts: 2 },
  ]);
});

test("logfold: the report queue weighs reporters, so a swarm of fresh keys does not outrank one trusted person", () => {
  const swarm = Array.from({ length: 20 }, (_, i) => `f${i}`);
  const [victim, bad] = [`${"1".repeat(64)}:p1`, `${"2".repeat(64)}:p2`];
  const log = [...swarm.map((k, i) => entry(k, i + 1, { type: "report", target: victim })), entry(mod, 99, { type: "report", target: bad, reason: "abuse" })];
  const trusted = (k: string) => (k === mod ? 3 : 0);
  const unweighted = foldReportQueue(log, new Set());
  assert.equal(unweighted[0].target, victim, "as it was: counted by heads");
  const q = foldReportQueue(log, new Set(), 50, trusted);
  assert.deepEqual(q.map((i) => [i.target, i.score, i.trusted, i.reporters]), [[bad, 3, 1, 1], [victim, 0, 0, 20]], "weighed: the trusted one first, the swarm after, still listed");
});

test("logfold: a curator's hidden communities are their own entries, newest wins, and only real community ids", () => {
  const log = [
    entry(owner, 1, { type: "hide_community", target: "c_spam", reason: "offensive" }),
    entry(owner, 2, { type: "hide_community", target: "c_other" }),
    entry(owner, 3, { type: "hide_community", target: "c_other", on: false }),
    entry(mallory, 4, { type: "hide_community", target: "c_cats" }), // not the curator: ignored
    entry(owner, 5, { type: "hide_community", target: "not a community" }),
  ];
  assert.deepEqual([...foldHiddenCommunities(log, owner)], [["c_spam", "offensive"]]);
});

test("logfold: dismissals count only the moderator's own entries, newest wins", () => {
  const log = [
    entry(owner, 1, { type: "dismiss", target: "a:p1" }),
    entry(owner, 2, { type: "dismiss", target: "a:p2" }),
    entry(owner, 3, { type: "dismiss", target: "a:p2", on: false }),
    entry(mallory, 4, { type: "dismiss", target: "a:p3" }), // not the moderator: ignored
  ];
  assert.deepEqual([...foldDismissed(log, owner)], ["a:p1"]);
});

test("compactLog: one state entry per author and subject, and no message deleted by its sender or the inbox owner", () => {
  const me = "a".repeat(64), peer = "b".repeat(64), other = "c".repeat(64);
  const e = (author: string, id: string, ts: number, body: object): [string, LogEntry] => [`${author}:${id}`, { author, id, ts, body: JSON.stringify(body), sig: id }];
  const log = Object.fromEntries([
    e(me, "r1", 1, { type: "chat_read", room: "x", upto: 1 }),
    e(me, "r2", 2, { type: "chat_read", room: "x", upto: 2 }),
    e(me, "r3", 1, { type: "chat_read", room: "y", upto: 1 }),
    e(peer, "r4", 1, { type: "chat_read", room: "x", upto: 5 }), // another author's mark stays
    e(peer, "m1", 1, { type: "chat", message: { id: "m1", sender: peer } }),
    e(peer, "m2", 1, { type: "chat", message: { id: "m2", sender: peer } }),
    e(peer, "m3", 1, { type: "chat", message: { id: "m3", sender: peer } }),
    e(peer, "d1", 2, { type: "chat_burn", roomId: "x", messageId: "m1" }), // its sender burned it
    e(me, "d2", 2, { type: "chat_delete", roomId: "x", messageId: "m2" }), // the inbox owner deleted it
    e(other, "d3", 2, { type: "chat_delete", roomId: "x", messageId: "m3" }), // a stranger cannot
  ]);
  const out = compactLog(`inbox/${me}`, log);
  assert.deepEqual(Object.keys(out).map((k) => k.split(":")[1]).sort(), ["d1", "d2", "d3", "m3", "r2", "r3", "r4"]);
  assert.equal(stateSlot("chat_read", "x"), stateSlot("chat_read", "x"));
  assert.notEqual(stateSlot("chat_read", "x"), stateSlot("chat_read", "y"));
  assert.ok(stateSlot("chat_read", "z".repeat(200)).length <= 40);
});
