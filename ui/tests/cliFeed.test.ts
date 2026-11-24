import test from "node:test";
import assert from "node:assert/strict";
import type { Post } from "../src/types.ts";
import { postLine, visiblePosts, type FeedFilter } from "../cli/feed.ts";

const post = (author: string, id: string, timestamp: number, extra: Partial<Post> = {}): Post =>
  ({ id, author, category: "thought", caption: `post ${id}`, is_nsfw: false, timestamp, sig: "", likes: {}, comments: {}, ...extra }) as Post;
const filter = (over: Partial<FeedFilter> = {}): FeedFilter => ({ me: "me", hidden: new Set(), blocked: () => false, reported: new Set(), ...over });

test("cli feed: newest first, and hidden, blocked, reported and sensitive posts are dropped", () => {
  const posts = [post("a", "1", 10), post("b", "2", 30), post("c", "3", 20), post("d", "4", 40), post("e", "5", 50, { is_nsfw: true }), post("f", "6", 5)];
  const shown = visiblePosts(posts, filter({ hidden: new Set(["a"]), blocked: (pk) => pk === "b", reported: new Set(["d:4"]) }));
  assert.deepEqual(shown.map((p) => p.id), ["3", "6"]);
});

test("cli feed: my own posts stay, even reported, held or sensitive", () => {
  const mine = [post("me", "1", 10, { is_nsfw: true }), post("me", "2", 20)];
  assert.deepEqual(visiblePosts(mine, filter({ blocked: () => true, reported: new Set(["me:2"]) })).map((p) => p.id), ["2", "1"]);
});

test("cli feed: a post line masks the text, collapses lines and clips; media and comments are noted", () => {
  const p = post("a", "1", Date.UTC(2026, 10, 24, 17, 2), { media_uri: "x", comments: { c1: {} as never } });
  const line = postLine(3, p, "Alice", "bad\n  word " + "x".repeat(700), (t) => t.replace("bad", "***"));
  assert.match(line, /^ 3\. \[2026-11-24 17:02\] Alice: \*\*\* word x+…  \(media, 1 comments\)$/);
});
