import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildNewsletterEmail,
  cacheArticlePayload,
  countWords,
  deleteArticleDraft,
  estimateReadingMinutes,
  extractArticleTags,
  formatArticlePostCaption,
  getCachedArticlePayload,
  isArticlePost,
  loadArticleDrafts,
  parseArticleCaption,
  parseArticlePayload,
  renderArticleFeedCardHtml,
  renderArticleMarkdown,
  saveArticleDraft,
  serializeArticlePayload,
  type ArticlePayload,
  type StorageLike,
} from "../src/articles.ts";

function memStore(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

const PUBKEY = "a".repeat(64);
const HASH = "b".repeat(64);

test("articles: word count and reading time calculation", () => {
  assert.equal(countWords(""), 0);
  assert.equal(estimateReadingMinutes(""), 1);

  const words450 = Array.from({ length: 450 }, (_, i) => `word${i}`).join(" ");
  assert.equal(countWords(words450), 450);
  assert.equal(estimateReadingMinutes(words450, 200), 3);
});

test("articles: extractArticleTags normalizes, deduplicates, and caps at 6", () => {
  const tags = extractArticleTags("#Freenet, privacy, TECH, #freenet, p2p, web3, decentral, extra");
  assert.deepEqual(tags, ["freenet", "privacy", "tech", "p2p", "web3", "decentral"]);
});

test("articles: serializeArticlePayload and parseArticlePayload round-trip", () => {
  const payload: ArticlePayload = {
    v: 1,
    title: "Decentralized Publishing",
    subtitle: "Why Freenet changes everything",
    body: "# Intro\n\nHello **world**.",
    tags: ["freenet", "essays"],
    readingMinutes: 2,
    publishedAt: 1700000000000,
    author: PUBKEY,
  };
  const bytes = serializeArticlePayload(payload);
  const parsed = parseArticlePayload(bytes);
  assert.deepEqual(parsed, payload);

  // Rejects invalid payloads
  assert.equal(parseArticlePayload(new TextEncoder().encode("{}")), null);
  assert.equal(parseArticlePayload(new TextEncoder().encode(JSON.stringify({ ...payload, v: 2 }))), null);
  assert.equal(parseArticlePayload(new TextEncoder().encode(JSON.stringify({ ...payload, author: "short" }))), null);
});

test("articles: formatArticlePostCaption and parseArticleCaption round-trip", () => {
  const caption = formatArticlePostCaption({
    title: "Zero-Server Newsletters",
    subtitle: "Substack meets post-quantum mail",
    readingMinutes: 4,
    tags: ["freenet", "mail"],
    hash: HASH,
  });
  assert.equal(isArticlePost({ caption }), true);
  assert.equal(isArticlePost({ caption: "Just a regular thought" }), false);

  const ref = parseArticleCaption(caption);
  assert.ok(ref);
  assert.equal(ref.hash, HASH);
  assert.equal(ref.title, "Zero-Server Newsletters");
  assert.equal(ref.subtitle, "Substack meets post-quantum mail");
  assert.equal(ref.readingMinutes, 4);
  assert.deepEqual(ref.tags, ["freenet", "mail"]);
});

test("articles: renderArticleMarkdown renders rich Markdown and blocks XSS", () => {
  const md = [
    "# Main Title",
    "",
    "Paragraph with **bold**, *italic*, `inline`, and [safe](https://freenet.org) and [bad](javascript:alert(1)).",
    "",
    "> Quoted insight",
    "",
    "- Item one",
    "- Item two",
    "",
    "```ts",
    "const x = '<script>alert(1)</script>';",
    "```",
  ].join("\n");

  const html = renderArticleMarkdown(md);
  assert.match(html, /<h1 class="article-h1">Main Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code class="article-inline-code">inline<\/code>/);
  assert.match(html, /<a href="https:\/\/freenet\.org" class="article-md-link" target="_blank" rel="noopener noreferrer">safe<\/a>/);
  assert.doesNotMatch(html, /javascript:/i);
  assert.match(html, /<blockquote class="article-quote">Quoted insight<\/blockquote>/);
  assert.match(html, /<ul class="article-ul"><li>Item one<\/li><li>Item two<\/li><\/ul>/);
  assert.doesNotMatch(html, /<script>/);
});

test("articles: drafts persistence and article cache", () => {
  const store = memStore();
  saveArticleDraft(PUBKEY, { id: "d1", title: "Draft 1", subtitle: "", body: "Body 1", tags: ["a"], updatedAt: 100 }, store);
  saveArticleDraft(PUBKEY, { id: "d2", title: "Draft 2", subtitle: "Sub", body: "Body 2", tags: [], updatedAt: 200 }, store);
  const loaded = loadArticleDrafts(PUBKEY, store);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].id, "d2"); // sorted newest first

  const afterDel = deleteArticleDraft(PUBKEY, "d2", store);
  assert.equal(afterDel.length, 1);
  assert.equal(afterDel[0].id, "d1");

  const payload: ArticlePayload = {
    v: 1,
    title: "Cached",
    subtitle: "",
    body: "Hello",
    tags: [],
    readingMinutes: 1,
    publishedAt: 123,
    author: PUBKEY,
  };
  cacheArticlePayload(HASH, payload, store);
  assert.deepEqual(getCachedArticlePayload(HASH, store), payload);
});

test("articles: buildNewsletterEmail and renderArticleFeedCardHtml", () => {
  const email = buildNewsletterEmail({
    title: "Issue #1",
    subtitle: "Welcome to Radica",
    body: "# Hello\n\nThis is **our** first newsletter.",
    readingMinutes: 3,
    authorName: "Alice",
    permalink: "http://127.0.0.1:7509/#article=p1&author=" + PUBKEY,
  });
  assert.equal(email.subject, "[Newsletter] Issue #1");
  assert.match(email.content, /By Alice · 3 min read/);
  assert.match(email.content, /#article=p1&author=/);

  const cardHtml = renderArticleFeedCardHtml(
    { id: "p1", author: PUBKEY, caption: "", timestamp: 123 },
    { hash: HASH, title: "Issue #1", subtitle: "Welcome", readingMinutes: 3, tags: ["news"] }
  );
  assert.match(cardHtml, /article-feed-card/);
  assert.match(cardHtml, /Issue #1/);
  assert.match(cardHtml, /3 min read/);
  assert.match(cardHtml, /#news/);
});
