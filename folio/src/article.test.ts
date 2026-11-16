import test from "node:test";
import assert from "node:assert/strict";
import { ANONYMOUS_AUTHOR, buildPayload, countWords, estimateReadingMinutes, extractTags, parsePayload, serializePayload } from "./article.ts";

test("countWords strips markdown punctuation and link labels, counts the rest", () => {
  assert.equal(countWords("# Hello **world**"), 2);
  assert.equal(countWords("[a link](https://example.com)"), 2);
  assert.equal(countWords(""), 0);
});

test("estimateReadingMinutes is at least 1 and scales with word count", () => {
  assert.equal(estimateReadingMinutes(""), 1);
  assert.equal(estimateReadingMinutes("word ".repeat(400)), 2);
});

test("extractTags dedupes, lowercases, strips #, and caps at 6", () => {
  assert.deepEqual(extractTags("#Freenet, freenet privacy #Privacy a b c d e"), ["freenet", "privacy", "a", "b", "c", "d"]);
});

test("buildPayload rejects a missing title or empty body", () => {
  assert.throws(() => buildPayload({ title: "", subtitle: "", body: "x", tags: "" }), /title/i);
  assert.throws(() => buildPayload({ title: "x", subtitle: "", body: "   ", tags: "" }), /body/i);
});

test("buildPayload trims fields, fills in the rest, and marks the article anonymous", () => {
  const p = buildPayload({ title: " Hi ", subtitle: " sub ", body: "hello world", tags: "a b" });
  assert.equal(p.v, 1);
  assert.equal(p.title, "Hi");
  assert.equal(p.subtitle, "sub");
  assert.deepEqual(p.tags, ["a", "b"]);
  assert.equal(p.author, ANONYMOUS_AUTHOR);
  assert.match(p.author, /^[0-9a-f]{64}$/);
  assert.ok(p.publishedAt > 0);
});

test("serializePayload produces parseable JSON with the same fields", () => {
  const p = buildPayload({ title: "T", subtitle: "", body: "hello", tags: "" });
  const back = JSON.parse(new TextDecoder().decode(serializePayload(p)));
  assert.equal(back.title, "T");
  assert.equal(back.author, ANONYMOUS_AUTHOR);
});

test("parsePayload round-trips what serializePayload writes", () => {
  const p = buildPayload({ title: "T", subtitle: "S", body: "hello", tags: "a" });
  const back = parsePayload(serializePayload(p));
  assert.deepEqual(back, p);
});

test("parsePayload rejects malformed bytes", () => {
  assert.equal(parsePayload(new TextEncoder().encode("not json")), null);
  assert.equal(parsePayload(new TextEncoder().encode(JSON.stringify({ v: 1 }))), null);
});
