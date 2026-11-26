import test from "node:test";
import assert from "node:assert/strict";
import { burnAtOf, checksHtml, createConversationState, deliveryOf, dmPeerOf, formatBurnRemaining, localReadMarks, nextTtl, READ_MARKS_KEY, seedReadMark, tickBurnCountdowns, triggerRowBurnAnimation, TYPING_SHOWN_MS, type ConversationDeps } from "../src/conversationState.ts";
import type { ChatMessage } from "../src/types.ts";

const A = "a".repeat(64);
const B = "b".repeat(64);

test("conversationState: burnAtOf prefers burn_at, else timestamp + ttl, else never", () => {
  assert.equal(burnAtOf({ timestamp: 1000, burn_at: 5000, ttl_seconds: 10 }), 5000);
  assert.equal(burnAtOf({ timestamp: 1000, ttl_seconds: 10 }), 11000);
  assert.equal(burnAtOf({ timestamp: 1000, ttl_seconds: 0 }), undefined);
  assert.equal(burnAtOf({ timestamp: 1000 }), undefined);
});

test("conversationState: nextTtl cycles the presets and wraps to Off", () => {
  assert.equal(nextTtl(0), 10);
  assert.equal(nextTtl(10), 30);
  assert.equal(nextTtl(86400), 0);
  assert.equal(nextTtl(12345), 0); // unknown value starts the cycle over
});

test("conversationState: dmPeerOf finds the peer of DMs and Secret Chats only", () => {
  assert.equal(dmPeerOf(`${A}:${B}`, A), B);
  assert.equal(dmPeerOf(`${A}:${B}`, B), A);
  assert.equal(dmPeerOf(`secret_${A}_${B}`, A), B);
  assert.equal(dmPeerOf(`${A}:${B}`, "c".repeat(64)), null);
  assert.equal(dmPeerOf("comm_radica", A), null);
  assert.equal(dmPeerOf("privroom_river_0123", A), null);
});

test("conversationState: delivery and its checks", () => {
  assert.equal(deliveryOf({ id: "msg_opt_1", timestamp: 5 }, 0), "sending");
  assert.equal(deliveryOf({ id: "m1", timestamp: 5 }, 0), "sent");
  assert.equal(deliveryOf({ id: "m1", timestamp: 5 }, 5), "read");
  assert.equal(deliveryOf({ id: "m1", timestamp: 6 }, 5), "sent");
  assert.equal(deliveryOf({ id: "m1", timestamp: 6, is_read: true }, 0), "read");
  assert.match(checksHtml("read", "rm"), /class="rm-checks read"/);
  assert.match(checksHtml("sending", "rv"), /^<span class="rv-checks sending".*<svg/);
  // a Secret Chat placeholder keeps its real id: the flag says it is still sealing
  assert.equal(deliveryOf({ id: "scmsg_1", timestamp: 5, pending: true }, 0), "sending");
  // signed here, not yet on the network: one ✓; on the network: ✓✓; read wins over both
  assert.equal(deliveryOf({ id: "m1", timestamp: 6 }, 0, false), "queued");
  assert.match(checksHtml("queued", "rm"), />✓<\/span>$/);
  assert.match(checksHtml("sent", "rm"), />✓✓<\/span>$/);
  assert.equal(deliveryOf({ id: "m1", timestamp: 6 }, 6, false), "read");
});

function memKV() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}
const readDeps = (): Pick<ConversationDeps, "readStore" | "logReadMarks" | "countSince" | "publishRead"> => ({
  readStore: memKV(),
  logReadMarks: () => ({}),
  countSince: () => 0,
  publishRead: () => {},
});

function msg(id: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id, room_id: "r", sender: A, text: "", timestamp: Date.now(), sig: "", ...extra };
}

test("conversationState: expired messages burn once, even across sweeps; others burn on time", async () => {
  const burned: string[] = [];
  const room = { roomId: `secret_${A}_${B}`, messages: [msg("old", { burn_at: Date.now() - 1 }), msg("soon", { burn_at: Date.now() + 150 }), msg("keep")] };
  const state = createConversationState({
    me: () => A,
    secretRooms: () => [room],
    burn: async (_roomId, id) => {
      burned.push(id);
    },
    sendTyping: () => {},
    ...readDeps(),
  });
  state.sweepBurns();
  state.sweepBurns();
  assert.deepEqual(burned, ["old"]);
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(burned, ["old", "soon"]);
});

test("conversationState: typing is throttled out and expires in", () => {
  let t = 10_000;
  const sent: string[] = [];
  const changes: string[] = [];
  const state = createConversationState({
    me: () => A,
    secretRooms: () => [],
    burn: async () => {},
    sendTyping: (r) => sent.push(r),
    ...readDeps(),
    now: () => t,
  });
  state.localTyping("r1");
  t += 1000;
  state.localTyping("r1");
  t += 2000;
  state.localTyping("r1");
  assert.deepEqual(sent, ["r1", "r1"]);

  state.onTypingChange((r) => changes.push(r));
  state.remoteTyping("r1", A); // me: ignored
  state.remoteTyping("r1", B);
  assert.deepEqual(state.typersIn("r1"), [B]);
  assert.deepEqual(changes, ["r1"]);
  t += TYPING_SHOWN_MS + 1;
  assert.deepEqual(state.typersIn("r1"), []);
});

test("conversationState: seedReadMark sets a missing read mark only", () => {
  const kv = memKV();
  seedReadMark(kv, "comm_x", 100);
  seedReadMark(kv, "comm_x", 200);
  assert.deepEqual(localReadMarks(kv), { comm_x: 100 });
  kv.setItem(READ_MARKS_KEY, "not json");
  assert.deepEqual(localReadMarks(kv), {});
});

test("conversationState: unread counts from the later read mark; never read: DMs from the start, rooms nothing", () => {
  const msgs: Record<string, number[]> = { [`${A}:${B}`]: [10, 20, 30], comm_x: [10, 20], [`secret_${A}_${B}`]: [5] };
  const published: string[] = [];
  let t = 1000;
  const kv = memKV();
  const state = createConversationState({
    me: () => A,
    secretRooms: () => [],
    burn: async () => {},
    sendTyping: () => {},
    readStore: kv,
    logReadMarks: () => ({ comm_x: 15 }), // read on my other device
    countSince: (room, since) => (msgs[room] ?? []).filter((ts) => ts > since).length,
    publishRead: (room, upto) => published.push(`${room}@${upto}`),
    now: () => t,
  });
  assert.equal(state.unread(`${A}:${B}`), 3); // never read DM: everything
  assert.equal(state.unread(`secret_${A}_${B}`), 1);
  assert.equal(state.unread("comm_y"), 0); // never read room: nothing
  assert.equal(state.unread("comm_x"), 1); // the other device read up to 15
  kv.setItem(READ_MARKS_KEY, JSON.stringify({ comm_x: 5 })); // this device read less: the later mark wins
  assert.equal(state.unread("comm_x"), 1);

  state.markRead(`${A}:${B}`);
  assert.equal(state.unread(`${A}:${B}`), 0);
  assert.deepEqual(published, [`${A}:${B}@1000`]);
  t = 2000;
  state.markRead(`${A}:${B}`); // nothing new: other devices are not told again
  assert.deepEqual(published, [`${A}:${B}@1000`]);
});

test("conversationState: triggerRowBurnAnimation adds burning class and removes row after animation", async () => {
  let removed = false;
  const classes = new Set<string>(["rm-msg-row"]);
  const mockRow: any = {
    dataset: {},
    offsetHeight: 48,
    style: {
      setProperty: (_k: string, _v: string) => {},
      maxHeight: "",
      overflow: "",
    },
    classList: {
      contains: (c: string) => classes.has(c),
      add: (c: string) => classes.add(c),
    },
    remove: () => {
      removed = true;
    },
  };

  let done = false;
  triggerRowBurnAnimation(mockRow, () => { done = true; });
  assert.equal(mockRow.dataset.burning, "1");
  assert.equal(classes.has("rm-msg-burning"), true);
  assert.equal(mockRow.style.maxHeight, "48px");
  assert.equal(mockRow.style.overflow, "hidden");

  // Re-triggering while burning is a safe no-op
  triggerRowBurnAnimation(mockRow);

  await new Promise((r) => setTimeout(r, 700));
  assert.equal(removed, true);
  assert.equal(done, true);
});

test("conversationState: formatBurnRemaining formats seconds, minutes, and hours cleanly", () => {
  assert.equal(formatBurnRemaining(500), "1s");
  assert.equal(formatBurnRemaining(9400), "10s");
  assert.equal(formatBurnRemaining(90_000), "1m 30s");
  assert.equal(formatBurnRemaining(120_000), "2m");
  assert.equal(formatBurnRemaining(3_900_000), "1h 5m");
});

test("conversationState: sweepBurns skips unopened incoming sealed secret messages until burn_started is true", () => {
  const burned: string[] = [];
  const sealedUnread = msg("in1", { sender: B, text: "secret:v2:abc:iv:ct", burn_at: Date.now() - 1000 });
  const sealedOpened = msg("in2", { sender: B, text: "secret:v2:abc:iv:ct", burn_at: Date.now() - 1000, burn_started: true });
  const room = { roomId: `secret_${A}_${B}`, messages: [sealedUnread, sealedOpened] };
  const state = createConversationState({
    me: () => A,
    secretRooms: () => [room],
    burn: async (_roomId, id) => {
      burned.push(id);
    },
    sendTyping: () => {},
    ...readDeps(),
  });
  state.sweepBurns();
  assert.deepEqual(burned, ["in2"]);
});
