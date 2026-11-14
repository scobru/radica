import test from "node:test";
import assert from "node:assert/strict";
import { createDurable, type DurableStore } from "../src/durable.ts";

function memStore(): DurableStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  const store: DurableStore & { map: Map<string, string> } = {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
      store.onWrite?.(k);
    },
    keys: () => [...map.keys()],
  };
  return store;
}

function memNode() {
  const entries = new Map<string, string>();
  return { entries, get: async (k: string) => entries.get(k) ?? null, put: async (k: string, v: string) => void entries.set(k, v) };
}

test("durable: durable keys survive a refresh, other keys do not, the page wins over the node", async () => {
  const node = memNode();
  const before = memStore();
  const d1 = createDurable(before, node, 5);
  await d1.start("alice");
  before.setItem("radica_secret_sessions", '{"s":1}');
  before.setItem("radica_pinned_chats_alice", '["dm:x"]');
  before.setItem("freenet_chat_room1", "[]"); // not durable
  await d1.flush();
  assert.deepEqual(Object.keys(JSON.parse(node.entries.get("durable:alice")!)).sort(), ["radica_pinned_chats_alice", "radica_secret_sessions"]);

  // browser refresh: the page starts empty, except a key it already holds again
  const after = memStore();
  after.map.set("radica_pinned_chats_alice", '["dm:y"]');
  await createDurable(after, node, 5).start("alice");
  assert.equal(after.getItem("radica_secret_sessions"), '{"s":1}');
  assert.equal(after.getItem("radica_pinned_chats_alice"), '["dm:y"]');
  assert.equal(after.getItem("freenet_chat_room1"), null);
});

test("durable: writes made before sign-in reach the node once sign-in starts it", async () => {
  const node = memNode();
  const store = memStore();
  store.setItem("radica_hidden_users", '["bob"]');
  const d = createDurable(store, node, 5);
  await d.start("alice");
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(JSON.parse(node.entries.get("durable:alice")!), { radica_hidden_users: '["bob"]' });
});

test("durable: ready waits for start, so a welcome seen on another visit is back before it is checked", async () => {
  const node = memNode();
  node.entries.set("durable:alice", JSON.stringify({ radica_welcomed_alice: "1" }));
  const store = memStore();
  const d = createDurable(store, node, 5);
  let done = false;
  void d.ready.then(() => (done = true));
  await Promise.resolve();
  assert.equal(done, false);
  await d.start("alice");
  await d.ready;
  assert.equal(store.getItem("radica_welcomed_alice"), "1");
});

test("durable: multi-group pinning persists multiple pinned groups across sign-in and flush", async () => {
  const node = memNode();
  const store1 = memStore();
  const d1 = createDurable(store1, node, 5000); // long debounce
  await d1.start("alice");

  // User pins 2 groups
  const twoGroups = ["priv:group1", "priv:group2"];
  store1.setItem("radica_pinned_chats_alice", JSON.stringify(twoGroups));

  // Immediate flush should write to node without waiting for debounce
  await d1.flush();
  const nodePkg = JSON.parse(node.entries.get("durable:alice")!);
  assert.deepEqual(JSON.parse(nodePkg["radica_pinned_chats_alice"]), twoGroups);

  // Next session: store starts empty
  const store2 = memStore();
  const d2 = createDurable(store2, node, 5000);
  await d2.start("alice");
  await d2.ready;
  assert.deepEqual(JSON.parse(store2.getItem("radica_pinned_chats_alice")!), twoGroups);
});

