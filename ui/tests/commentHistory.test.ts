import test from "node:test";
import assert from "node:assert/strict";
import { commentsBy } from "../src/commentHistory.ts";
import type { Post } from "../src/types.ts";

const pk = (c: string) => c.repeat(64);
const [ME, BOB, EVE] = [pk("a"), pk("b"), pk("c")];

const post = (id: string, author: string, comments: [string, string, number, string][]): Post => ({
  id,
  author,
  category: "thought",
  caption: "hi",
  timestamp: 1,
  sig: "",
  likes: {},
  comments: Object.fromEntries(comments.map(([cid, who, ts, text]) => [`${who}:${cid}`, { id: cid, post_id: id, author: who, text, timestamp: ts, sig: "" }])),
});

test("lists only the author's live comments, newest first", () => {
  const posts = [
    post("p1", BOB, [["c1", ME, 10, "first"], ["c2", EVE, 20, "not mine"]]),
    post("p2", EVE, [["c3", ME, 30, "later"], ["c4", ME, 40, ""]]), // c4 was taken back
  ];
  assert.deepEqual(commentsBy(posts, ME).map((e) => e.comment.text), ["later", "first"]);
});

test("the same post from two sources counts once", () => {
  const p = post("p1", BOB, [["c1", ME, 10, "once"]]);
  assert.equal(commentsBy([p, { ...p }], ME).length, 1);
});

test("hidden posts and hidden comments are left out", () => {
  const posts = [post("p1", EVE, [["c1", ME, 10, "on a hidden post"]]), post("p2", BOB, [["c2", ME, 20, "reported"], ["c3", ME, 30, "fine"]])];
  const out = commentsBy(posts, ME, { hidePost: (p) => p.author === EVE, hideComment: (c) => c.id === "c2" });
  assert.deepEqual(out.map((e) => e.comment.text), ["fine"]);
});

test("a post with no comments field does not break", () => {
  const p = { ...post("p1", BOB, []), comments: undefined } as unknown as Post;
  assert.deepEqual(commentsBy([p], ME), []);
});
