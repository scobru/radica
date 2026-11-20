import test from "node:test";
import assert from "node:assert/strict";
import { lightFeed, lightFeedAsync } from "../src/feedlight.ts";

const raw = JSON.stringify({ posts: { a: { id: "a", category: "thought", timestamp: 1 }, b: { id: "b", category: "thought", timestamp: 3 }, c: { id: "c", category: "thought", timestamp: 2 } }, profile: { display_name: "Ann" }, following: ["k1", 7] });

test("newest first, capped, with profile", () => {
  const f = lightFeed(raw, 2);
  assert.deepEqual(f.posts.map((p) => p.id), ["b", "c"]);
  assert.equal(f.profile?.display_name, "Ann");
  assert.deepEqual(f.following, ["k1"]);
});
test("async falls back to inline without Worker", async () => {
  assert.equal((await lightFeedAsync(raw)).posts[0].id, "b");
});
test("unreadable feed is empty", async () => {
  assert.deepEqual((await lightFeedAsync("{oops")).posts, []);
});
test("a delta is applied to the stored feed", async () => {
  const delta = JSON.stringify({ owner: "", posts: { d: { id: "d", category: "thought", timestamp: 4, likes: {}, comments: {} } }, following: [] });
  const f = await lightFeedAsync(raw, delta);
  assert.equal(f.posts[0].id, "d");
  assert.ok(JSON.parse(f.text!).posts.a, "older posts are kept");
});
test("an unreadable delta gives no text", async () => {
  assert.equal((await lightFeedAsync(raw, "{oops")).text, undefined);
});

test("lightFeedAsync: a worker that fails to load falls back to parsing here, the waiting call included", async () => {
  const raw = JSON.stringify({ posts: { a: { id: "a", category: "thought", timestamp: 1 } } });
  (globalThis as any).Worker = class {
    onerror: (() => void) | null = null;
    postMessage() {
      setTimeout(() => this.onerror?.(), 0); // like Safari when the sandboxed page may not load the worker script
    }
    terminate() {}
  };
  try {
    assert.equal((await lightFeedAsync(raw)).posts[0].id, "a");
    assert.equal((await lightFeedAsync(raw)).posts[0].id, "a"); // and later calls do not wait on it
  } finally {
    delete (globalThis as any).Worker;
  }
});

test("a post whose signed fields were re-split is dropped", () => {
  const ok = { id: "a", category: "thought", caption: "hi: there", media_uri: "radica-media:" + "ab".repeat(32) + " https://x.org/a.png", community_id: "c_radica", event_date: "2026-11-20", timestamp: 1 };
  const bad = [
    { ...ok, id: "b", caption: "hi", media_uri: " there" }, // caption text pushed into media
    { ...ok, id: "c", media_uri: "b:c" },
    { ...ok, id: "d", community_id: "x:y" },
    { ...ok, id: "e", category: "thought:hi" },
    { ...ok, id: "f", event_date: "Rome" },
  ];
  const raw = JSON.stringify({ posts: Object.fromEntries([ok, ...bad].map((p) => [p.id, p])) });
  assert.deepEqual(lightFeed(raw).posts.map((p) => p.id), ["a"]);
});
