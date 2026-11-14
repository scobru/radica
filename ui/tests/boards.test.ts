import test from "node:test";
import assert from "node:assert/strict";
import {
  addItemToBoard,
  boardPermalink,
  createBoard,
  filterVisibleBoards,
  parseBoardHash,
  parseBoardPostCaption,
  removeItemFromBoard,
  serializeBoardPostCaption,
} from "../src/boards.ts";

test("boards: create, addItemToBoard deduplicates, removeItemFromBoard", () => {
  let b = createBoard("pk1", "Freenet Gems", "Best posts on the network", "public");
  b = addItemToBoard(b, { postId: "p1", author: "pk2", captionPreview: "Hello", addedAt: 100 });
  b = addItemToBoard(b, { postId: "p1", author: "pk2", captionPreview: "Hello", note: "Updated note", addedAt: 101 });
  assert.equal(b.items.length, 1);
  assert.equal(b.items[0].note, "Updated note");

  b = addItemToBoard(b, { postId: "p2", author: "pk3", captionPreview: "Second", addedAt: 102 });
  assert.equal(b.items.length, 2);

  b = removeItemFromBoard(b, "pk2", "p1");
  assert.equal(b.items.length, 1);
  assert.equal(b.items[0].postId, "p2");
});

test("boards: serializeBoardPostCaption and parseBoardPostCaption round-trip", () => {
  let b = createBoard("pk1", "Design Refs", "UI inspiration", "public");
  b = addItemToBoard(b, { postId: "p10", author: "pk9", captionPreview: "Clean card", note: "Great spacing", addedAt: 500 });
  const caption = serializeBoardPostCaption(b);
  assert.ok(caption.includes("#board="));
  const parsed = parseBoardPostCaption(caption);
  assert.ok(parsed);
  assert.equal(parsed.id, b.id);
  assert.equal(parsed.title, "Design Refs");
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].note, "Great spacing");
});

test("boards: boardPermalink and parseBoardHash round-trip", () => {
  const link = boardPermalink("ownerKey", "brd_123");
  const parsed = parseBoardHash(link);
  assert.deepEqual(parsed, { boardId: "brd_123", owner: "ownerKey" });
  assert.equal(parseBoardHash("#post=abc"), null);
});

test("boards: filterVisibleBoards respects privacy and moderation", () => {
  const pub = createBoard("alice", "Public", "", "public");
  const priv = createBoard("alice", "Secret", "", "private");
  const hidden = createBoard("mallory", "Spam", "", "public");

  const forBob = filterVisibleBoards([pub, priv, hidden], {
    viewerPubkey: "bob",
    hiddenAuthors: new Set(["mallory"]),
  });
  assert.deepEqual(forBob.map((b) => b.id), [pub.id]);

  const forAlice = filterVisibleBoards([pub, priv, hidden], {
    viewerPubkey: "alice",
    hiddenAuthors: new Set(["mallory"]),
  });
  assert.deepEqual(forAlice.map((b) => b.id), [pub.id, priv.id]);
});
