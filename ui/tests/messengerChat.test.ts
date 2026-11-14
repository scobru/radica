import test from "node:test";
import assert from "node:assert/strict";
import {
  canPostInRoom,
  computeSafetyBlocks,
  isStageBackSwipe,
  roomMetaOf,
  shouldHydratePreview,
  shouldUpdateCachedPreview,
  STAGE_SWIPE_IGNORED_SELECTOR,
} from "../src/messengerLogic.ts";

test("shouldHydratePreview: never hydrates the currently open room (prevents River optimistic microtask spinlock)", () => {
  assert.equal(
    shouldHydratePreview({
      type: "priv",
      roomId: "river_abc123",
      openRoomId: "river_abc123",
      stamp: 1,
      lastHydratedStamp: 1700000005000,
    }),
    false
  );
});

test("shouldHydratePreview: skips community rooms, empty stamps, and already-hydrated stamps, but hydrates closed E2EE rooms", () => {
  assert.equal(
    shouldHydratePreview({
      type: "comm",
      roomId: "comm_radica",
      openRoomId: null,
      stamp: 100,
      lastHydratedStamp: undefined,
    }),
    false
  );
  assert.equal(
    shouldHydratePreview({
      type: "dm",
      roomId: "dm_1",
      openRoomId: "river_abc123",
      stamp: 0,
      lastHydratedStamp: undefined,
    }),
    false
  );
  assert.equal(
    shouldHydratePreview({
      type: "priv",
      roomId: "river_closed",
      openRoomId: "river_abc123",
      stamp: 1,
      lastHydratedStamp: 1,
    }),
    false
  );
  assert.equal(
    shouldHydratePreview({
      type: "priv",
      roomId: "river_closed",
      openRoomId: "river_abc123",
      stamp: 1,
      lastHydratedStamp: undefined,
    }),
    true
  );
  assert.equal(
    shouldHydratePreview({
      type: "dm",
      roomId: "dm_1",
      openRoomId: "river_abc123",
      stamp: 200,
      lastHydratedStamp: 100,
    }),
    true
  );
});

test("shouldUpdateCachedPreview: never overwrites a newer optimistic preview with an older stored message", () => {
  const optimistic = { text: "just sent in River", sender: "me", timestamp: 2000, optimistic: true };
  const olderCached = { text: "older cached river msg", sender: "peer", timestamp: 1000 };
  assert.equal(shouldUpdateCachedPreview(optimistic, olderCached), false);

  const confirmedSameTs = { text: "just sent in River", sender: "me", timestamp: 2000, optimistic: false };
  assert.equal(shouldUpdateCachedPreview(optimistic, confirmedSameTs), true);

  const confirmedNewer = { text: "just sent in River", sender: "me", timestamp: 2005, optimistic: false };
  assert.equal(shouldUpdateCachedPreview(optimistic, confirmedNewer), true);

  assert.equal(shouldUpdateCachedPreview(confirmedNewer, confirmedNewer), false);
});

test("computeSafetyBlocks: returns 12 deterministic 5-digit blocks symmetrically", () => {
  const a = "aa".repeat(32);
  const b = "bb".repeat(32);
  const blocksAB = computeSafetyBlocks(a, b);
  const blocksBA = computeSafetyBlocks(b, a);
  assert.deepEqual(blocksAB, blocksBA);
  assert.equal(blocksAB.length, 12);
  for (const block of blocksAB) {
    assert.match(block, /^\d{5}$/);
  }
});

test("broadcast channels: read-only permission check and discussion linking", () => {
  const ownerPk = "1".repeat(64);
  const modPk = "2".repeat(64);
  const subscriberPk = "3".repeat(64);

  const channel = {
    id: "privroom_chan123",
    creator: ownerPk,
    name_encrypted: "",
    members: [ownerPk, modPk, subscriberPk],
    moderators: [modPk],
    encrypted_keys: {},
    created_at: Date.now(),
    sig: "",
    is_channel: true,
    linked_room_id: "privroom_disc456",
  };

  const isWriter = (pk: string) => canPostInRoom({
    isChannel: channel.is_channel,
    creator: channel.creator,
    moderators: channel.moderators,
    userPubkey: pk,
  });

  assert.equal(isWriter(ownerPk), true, "Owner can broadcast to channel");
  assert.equal(isWriter(modPk), true, "Moderator can broadcast to channel");
  assert.equal(isWriter(subscriberPk), false, "Subscriber cannot write in broadcast channel");
  assert.equal(channel.linked_room_id, "privroom_disc456", "Channel points to linked discussion room");

  assert.equal(canPostInRoom({ isChannel: false, creator: ownerPk, userPubkey: subscriberPk }), true, "Regular room allows subscriber to post");
});

test("conversation filter: separates broadcast channels from private groups", () => {
  const convs = [
    { key: "dm:1", type: "dm", isChannel: false },
    { key: "priv:group1", type: "priv", isChannel: false },
    { key: "priv:channel1", type: "priv", isChannel: true },
    { key: "comm:radica", type: "comm", isChannel: false },
  ];

  const filterConvs = (filter: "all" | "dm" | "priv" | "channel" | "comm") =>
    convs.filter((c) => {
      if (filter === "dm" && c.type !== "dm") return false;
      if (filter === "priv" && (c.type !== "priv" || c.isChannel)) return false;
      if (filter === "channel" && (c.type !== "priv" || !c.isChannel)) return false;
      if (filter === "comm" && c.type !== "comm") return false;
      return true;
    });

  const groupOnly = filterConvs("priv");
  assert.equal(groupOnly.length, 1);
  assert.equal(groupOnly[0].key, "priv:group1");

  const channelOnly = filterConvs("channel");
  assert.equal(channelOnly.length, 1);
  assert.equal(channelOnly[0].key, "priv:channel1");
});

test("post permalink: builds and parses #post=<id>&author=<pubkey> fragment", () => {
  const postId = "post_1730000000_abc";
  const author = "464b576da4cc5bcf31febd41a863ac251d04024c19f1786b24ca6620a0cce53b";
  const fragment = `#post=${encodeURIComponent(postId)}&author=${encodeURIComponent(author)}`;

  const params = new URLSearchParams(fragment.substring(1));
  assert.equal(params.get("post"), postId);
  assert.equal(params.get("author"), author);
});

test("broadcast channel invite link: serializes and parses chan and lr parameters", () => {
  const room = {
    id: "privroom_test_123",
    creator: "creator_pubkey_123",
    is_channel: true,
    linked_room_id: "privroom_disc_456",
  };

  const params = new URLSearchParams({ river_invite: "RiverCodeABC123" });
  params.set("room_id", room.id);
  params.set("creator", room.creator);
  if (room.is_channel) params.set("chan", "1");
  if (room.linked_room_id) params.set("lr", room.linked_room_id);

  const hash = `#${params.toString()}`;
  assert.match(hash, /chan=1/);
  assert.match(hash, /lr=privroom_disc_456/);
  assert.match(hash, /room_id=privroom_test_123/);

  const parsed = new URLSearchParams(hash.slice(1));
  const isChannel = parsed.get("chan") === "1" || parsed.get("is_channel") === "true";
  const linkedRoomId = parsed.get("lr") || parsed.get("linked_room_id") || undefined;
  const roomId = parsed.get("room_id");
  const creator = parsed.get("creator");

  assert.equal(isChannel, true);
  assert.equal(linkedRoomId, "privroom_disc_456");
  assert.equal(roomId, "privroom_test_123");
  assert.equal(creator, "creator_pubkey_123");
});

test("broadcast channel: unauthorized subscriber messages are filtered", () => {
  const owner = "owner_pk";
  const mod = "mod_pk";
  const subscriber = "subscriber_pk";

  const rawMessages = [
    { id: "1", sender: owner, text: "Welcome to Radica News announcement!" },
    { id: "2", sender: subscriber, text: "Can I type here?" },
    { id: "3", sender: mod, text: "Official update from moderator" },
  ];

  const channel = {
    creator: owner,
    moderators: [mod],
    is_channel: true,
  };

  const allowedSenders = new Set([channel.creator, ...(channel.moderators || [])]);
  const visible = rawMessages.filter((m) => allowedSenders.has(m.sender));

  assert.equal(visible.length, 2);
  assert.equal(visible.map((m) => m.id).join(","), "1,3");
  assert.equal(visible.some((m) => m.sender === subscriber), false);
});

test("chat reactions: River 4x4 square grid contains 16 valid reactions", async () => {
  const { CHAT_REACTIONS } = await import("../src/logfold.ts");
  assert.equal(CHAT_REACTIONS.length, 16);
  assert.ok(CHAT_REACTIONS.includes("👍"));
  assert.ok(CHAT_REACTIONS.includes("❤️"));
  assert.ok(CHAT_REACTIONS.includes("👀"));
  assert.ok(CHAT_REACTIONS.includes("🔥"));
  assert.ok(CHAT_REACTIONS.includes("🎉"));
});

test("room join events: computeLogJoins groups joins within 5 minutes into River-style join notices", async () => {
  const { computeLogJoins, formatJoinNotice } = await import("../src/messengerLogic.ts");
  const entries = [
    { author: "userA", ts: 1000, body: JSON.stringify({ type: "room_join", roomId: "privroom_test" }) },
    { author: "userB", ts: 1000 + 60 * 1000, body: JSON.stringify({ type: "room_join", roomId: "privroom_test" }) },
    { author: "userC", ts: 1000 + 10 * 60 * 1000, body: JSON.stringify({ type: "room_join", roomId: "privroom_test" }) },
  ];
  const joins = computeLogJoins("privroom_test", entries);
  assert.equal(joins.length, 2);
  assert.equal(joins[0].system_event, "join");
  assert.deepEqual(joins[0].join_members, ["userA", "userB"]);
  assert.equal(joins[1].system_event, "join");
  assert.deepEqual(joins[1].join_members, ["userC"]);

  assert.equal(formatJoinNotice(["userA"], "me", (pk) => pk), "userA joined");
  assert.equal(formatJoinNotice(["userA", "userB"], "me", (pk) => pk), "userA and userB joined");
  assert.equal(formatJoinNotice(["u1", "u2", "u3", "u4", "u5"], "me", (pk) => pk), "5 people joined");
});

test("roomMetaOf: a cleared chat has no last message, a newer one shows again", () => {
  const msg = (id: string, timestamp: number) => ({ id, room_id: "r", sender: "a", text: `t${timestamp}`, timestamp });
  const raw = JSON.stringify([msg("m1", 100), msg("msg_opt_2", 200)]);
  assert.deepEqual(roomMetaOf(raw, 0), { lastTs: 200, lastSender: "a", rawText: "t200", count: 2, optimistic: true });
  assert.equal(roomMetaOf(raw, 100).count, 1);
  assert.deepEqual(roomMetaOf(raw, 200), { lastTs: 0, lastSender: "", rawText: "", count: 0, optimistic: false });
  assert.equal(roomMetaOf(null, 0).count, 0);
  assert.equal(roomMetaOf("not json", 0).count, 0);
});

test("isStageBackSwipe: message rows and composer are excluded from mobile back navigation swipe", () => {
  assert.ok(STAGE_SWIPE_IGNORED_SELECTOR.includes(".rm-msg-row"));
  assert.ok(STAGE_SWIPE_IGNORED_SELECTOR.includes(".rm-composer-outer"));
  assert.ok(STAGE_SWIPE_IGNORED_SELECTOR.includes(".rm-pinned-bar"));

  // Swiping on a message row (tagging someone) must never trigger stage back navigation
  assert.equal(isStageBackSwipe({ dx: 80, dy: 10, dt: 200, isIgnoredTarget: true }), false);

  // Valid back swipe on stage background
  assert.equal(isStageBackSwipe({ dx: 80, dy: 10, dt: 200, isIgnoredTarget: false }), true);

  // Invalid swipes: too short, vertical/diagonal, or too slow
  assert.equal(isStageBackSwipe({ dx: 50, dy: 10, dt: 200, isIgnoredTarget: false }), false);
  assert.equal(isStageBackSwipe({ dx: 80, dy: 50, dt: 200, isIgnoredTarget: false }), false);
  assert.equal(isStageBackSwipe({ dx: 80, dy: 10, dt: 600, isIgnoredTarget: false }), false);
});

