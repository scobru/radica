import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  computeHotRank,
  computeNetScore,
  flairInfoForPost,
  formatThreadComposeCaption,
  sortRedditThreads,
  splitThreadTitleAndBody,
} from "../src/communitiesPage.ts";
import type { Post } from "../src/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readUi = (rel: string) => fs.readFileSync(path.join(__dirname, rel), "utf8");

function makePost(overrides: Partial<Post> & { id: string; timestamp: number }): Post {
  return {
    author: "a".repeat(64),
    category: "thought",
    caption: "Default thread",
    likes: {},
    comments: {},
    community_id: "comm-1",
    ...overrides,
  };
}

test("computeNetScore subtracts downvotes from upvotes", () => {
  assert.equal(computeNetScore(12, 4), 8);
  assert.equal(computeNetScore(2, 7), -5);
  assert.equal(computeNetScore(0, 0), 0);
});

test("computeHotRank rewards higher engagement and fresher posts", () => {
  const now = 1_700_000_000_000;
  const fresh = computeHotRank(5, 0, 2, now - 60_000, now);
  const stale = computeHotRank(5, 0, 2, now - 48 * 3_600_000, now);
  assert.ok(fresh > stale, "Fresher thread should outrank older thread with equal engagement");

  const active = computeHotRank(15, 1, 6, now - 3_600_000, now);
  const quiet = computeHotRank(1, 0, 0, now - 3_600_000, now);
  assert.ok(active > quiet, "Higher net score & comments should outrank quiet thread of same age");
});

test("sortRedditThreads supports hot, new, top24h, top7d, and topAll", () => {
  const now = 1_700_000_000_000;
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  const recentLow = makePost({ id: "recent-low", timestamp: now - HOUR, caption: "Recent low" });
  const recentHigh = makePost({ id: "recent-high", timestamp: now - 3 * HOUR, caption: "Recent high" });
  const weekOld = makePost({ id: "week-old", timestamp: now - 4 * DAY, caption: "4 days old" });
  const monthOldTop = makePost({ id: "month-top", timestamp: now - 25 * DAY, caption: "Month old top" });

  const scores = new Map<string, { likes: number; dislikes: number }>([
    ["recent-low", { likes: 1, dislikes: 0 }],
    ["recent-high", { likes: 20, dislikes: 2 }],
    ["week-old", { likes: 35, dislikes: 1 }],
    ["month-top", { likes: 100, dislikes: 0 }],
  ]);

  const getLikes = (p: Post) => scores.get(p.id)?.likes ?? 0;
  const getDislikes = (p: Post) => scores.get(p.id)?.dislikes ?? 0;
  const pool = [monthOldTop, recentLow, weekOld, recentHigh];

  assert.deepEqual(
    sortRedditThreads(pool, "new", getLikes, getDislikes, now).map((p) => p.id),
    ["recent-low", "recent-high", "week-old", "month-top"],
  );

  assert.equal(
    sortRedditThreads(pool, "hot", getLikes, getDislikes, now)[0].id,
    "recent-high",
    "Recent high-scoring thread should lead hot sort",
  );

  assert.deepEqual(
    sortRedditThreads(pool, "top24h", getLikes, getDislikes, now).map((p) => p.id),
    ["recent-high", "recent-low"],
  );

  assert.deepEqual(
    sortRedditThreads(pool, "top7d", getLikes, getDislikes, now).map((p) => p.id),
    ["week-old", "recent-high", "recent-low"],
  );

  assert.deepEqual(
    sortRedditThreads(pool, "topAll", getLikes, getDislikes, now).map((p) => p.id),
    ["month-top", "week-old", "recent-high", "recent-low"],
  );
});

test("splitThreadTitleAndBody splits title and optional body cleanly", () => {
  assert.deepEqual(splitThreadTitleAndBody("Release v2.0 is live\n\nHere are the full notes."), {
    title: "Release v2.0 is live",
    body: "Here are the full notes.",
  });

  assert.deepEqual(splitThreadTitleAndBody("Short announcement without body"), {
    title: "Short announcement without body",
    body: "",
  });

  const twoSentences =
    "Decentralized forums make censorship resistance practical. This longer follow-up paragraph explains all the protocol details across multiple nodes in the network.";
  assert.deepEqual(splitThreadTitleAndBody(twoSentences), {
    title: "Decentralized forums make censorship resistance practical.",
    body: "This longer follow-up paragraph explains all the protocol details across multiple nodes in the network.",
  });
});

test("flairInfoForPost maps thread categories and polls to Reddit flairs", () => {
  const thought = makePost({ id: "p1", timestamp: 1, category: "thought" });
  const moment = makePost({ id: "p2", timestamp: 1, category: "moment" });
  const event = makePost({ id: "p3", timestamp: 1, category: "event" });

  assert.equal(flairInfoForPost(thought, false).cssClass, "reddit-flair-thought");
  assert.equal(flairInfoForPost(moment, false).cssClass, "reddit-flair-moment");
  assert.equal(flairInfoForPost(event, false).cssClass, "reddit-flair-event");
  assert.equal(flairInfoForPost(thought, true).cssClass, "reddit-flair-poll");
  assert.equal(flairInfoForPost(thought, true).label, "Poll");
});

test("formatThreadComposeCaption joins title and body safely", () => {
  assert.equal(formatThreadComposeCaption("Title", "Body text"), "Title\n\nBody text");
  assert.equal(formatThreadComposeCaption("Title only", "   "), "Title only");
  assert.equal(formatThreadComposeCaption("", "Body only"), "Body only");
});

test("index.html and style.css wire the dedicated Communities Reddit page", () => {
  const html = readUi("../index.html");
  const css = readUi("../src/style.css");

  assert.match(html, /id="open-communities-btn"/);
  assert.match(html, /id="comm-reddit-view-btn"/);
  assert.match(html, /id="communities-modal" class="rail-page"/);
  assert.match(html, /id="reddit-threads-container"/);
  assert.match(html, /id="reddit-sidebar-content"/);

  assert.match(css, /\.reddit-layout\b/);
  assert.match(css, /\.reddit-vote-col\b/);
  assert.match(css, /\.reddit-post-card\b/);
});
