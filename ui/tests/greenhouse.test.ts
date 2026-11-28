import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySeed,
  filterAndGroupSeeds,
  foldGreenhouse,
  formatSeedsForAi,
  greenhousePermalink,
  greenhouseTokens,
  parseGreenhouseHash,
  pickDefaultBucket,
  SEED_BUCKETS,
  sortSeeds,
  type Seed,
  type SeedSort,
} from "../src/greenhouse.ts";
import type { LogEntry } from "../src/logfold.ts";
import type { SupporterTier } from "../src/supporter.ts";

const DAY = 86_400_000;
const t0 = Date.now() - DAY;
let n = 0;
const entry = (author: string, ts: number, body: object): LogEntry => ({ author, id: `e${n++}`, ts, body: JSON.stringify(body), sig: "" });
const tiers: Record<string, SupporterTier> = { alice: "sprout", bob: "oak", carol: "root" };
const tierOf = (a: string) => tiers[a];

test("votes are weighted by tier, the newest vote of each supporter counts, non-supporters are ignored", () => {
  const seed = entry("alice", t0, { type: "seed", kind: "feature", title: "Dark mode", days: 7, receipt: "r" });
  const id = `alice:${seed.id}`;
  const out = foldGreenhouse(
    [
      seed,
      entry("bob", t0 + 1, { type: "vote", seed: id, v: 1 }),
      entry("carol", t0 + 2, { type: "vote", seed: id, v: 1 }),
      entry("carol", t0 + 3, { type: "vote", seed: id, v: -1 }), // changed her mind
      entry("mallory", t0 + 4, { type: "vote", seed: id, v: 1 }), // not a supporter
      entry("alice", t0 + 8 * DAY, { type: "vote", seed: id, v: 1 }), // after closing
    ],
    tierOf,
    "carol",
    "boss"
  );
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].up, out[0].down, out[0].voters, out[0].mine], [3, 2, 2, -1]);
});

test("a bug takes no downvotes, a non-supporter cannot plant, only the maintainer sets a status", () => {
  const bug = entry("bob", t0, { type: "seed", kind: "bug", title: "Crash", days: 14 });
  const id = `bob:${bug.id}`;
  const out = foldGreenhouse(
    [
      bug,
      entry("mallory", t0, { type: "seed", kind: "feature", title: "Spam" }),
      entry("alice", t0 + 1, { type: "vote", seed: id, v: -1 }),
      entry("carol", t0 + 2, { type: "status", seed: id, status: "done" }),
      entry("boss", t0 + 3, { type: "status", seed: id, status: "planned" }),
    ],
    tierOf,
    "alice",
    "boss"
  );
  assert.deepEqual(out.map((s) => [s.title, s.down, s.status]), [["Crash", 0, "planned"]]);
});

test("each author's newest receipt is the one checked", () => {
  const tokens = greenhouseTokens([entry("alice", 1, { type: "seed", receipt: "old" }), entry("alice", 2, { type: "vote", receipt: "new" })]);
  assert.equal(tokens.get("alice"), "new");
});

test("non-supporters with Sapling+ Linfa can plant and vote, taking the max of supporter tier and Linfa weight", () => {
  const linfaSeed = entry("dan", t0, { type: "seed", kind: "feature", title: "Linfa proposal", days: 7 });
  const id = `dan:${linfaSeed.id}`;
  const linfaWeights: Record<string, number> = {
    dan: 1,     // non-supporter, Sapling -> weight 1
    erin: 2,    // non-supporter, Tree -> weight 2
    alice: 3,   // sprout (tier weight 1) + Elder tree (linfa weight 3) -> max(1, 3) = 3
    mallory: 0, // non-supporter, Seed -> ignored
  };
  const out = foldGreenhouse(
    [
      linfaSeed,
      entry("mallory", t0, { type: "seed", kind: "feature", title: "Spam seed", days: 7 }),
      entry("erin", t0 + 1, { type: "vote", seed: id, v: 1 }),
      entry("alice", t0 + 2, { type: "vote", seed: id, v: 1 }),
      entry("mallory", t0 + 3, { type: "vote", seed: id, v: 1 }),
    ],
    tierOf,
    "dan",
    "boss",
    (a) => linfaWeights[a] ?? 0
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Linfa proposal");
  assert.deepEqual([out[0].up, out[0].down, out[0].voters], [5, 0, 2]);
});

test("greenhousePermalink builds a clean shareable URL hash", () => {
  assert.equal(greenhousePermalink("alice:e1"), "#greenhouse&seed=alice%3Ae1");
  assert.equal(
    greenhousePermalink("alice:e1", "https://radica.eth/#post=123"),
    "https://radica.eth/#greenhouse&seed=alice%3Ae1"
  );
});

test("parseGreenhouseHash extracts greenhouse modal navigation and targeted seed id", () => {
  assert.deepEqual(parseGreenhouseHash(""), { isGreenhouse: false });
  assert.deepEqual(parseGreenhouseHash("#post=123"), { isGreenhouse: false });
  assert.deepEqual(parseGreenhouseHash("#greenhouse"), { isGreenhouse: true, seedId: undefined });
  assert.deepEqual(parseGreenhouseHash("#greenhouse&seed=alice%3Ae1"), {
    isGreenhouse: true,
    seedId: "alice:e1",
  });
  assert.deepEqual(parseGreenhouseHash("#seed=bob%3Ae2"), {
    isGreenhouse: true,
    seedId: "bob:e2",
  });
  assert.deepEqual(parseGreenhouseHash("#greenhouse=carol%3Ae3"), {
    isGreenhouse: true,
    seedId: "carol:e3",
  });
});

test("statusIssuers (e.g. The Gardener bot) can update seed status while untrusted keys cannot, and maintainer overrides", () => {
  const bug = entry("alice", t0, { type: "seed", kind: "bug", title: "Fix scroll bug", days: 14, receipt: "r" });
  const id = `alice:${bug.id}`;
  const bot = "gardener_bot_key";
  const out = foldGreenhouse(
    [
      bug,
      entry("carol", t0 + 1, { type: "status", seed: id, status: "done" }), // ignored
      entry(bot, t0 + 2, { type: "status", seed: id, status: "done" }),
    ],
    tierOf,
    "alice",
    "boss",
    () => 0,
    [bot]
  );
  assert.equal(out[0].status, "done");
});

test("formatSeedsForAi outputs readable Markdown for AI agents and filters open seeds when requested", () => {
  const openSeed = entry("alice", t0, { type: "seed", kind: "feature", title: "Dark mode toggle", text: "Need toggle.", days: 14, receipt: "r" });
  const doneSeed = entry("bob", t0 + 1, { type: "seed", kind: "bug", title: "Already fixed", days: 14, receipt: "r" });
  const seeds = foldGreenhouse(
    [openSeed, doneSeed, entry("boss", t0 + 2, { type: "status", seed: `bob:${doneSeed.id}`, status: "done" })],
    tierOf,
    "alice",
    "boss"
  );
  const openMd = formatSeedsForAi(seeds, (pk) => `@${pk}`, true);
  assert.match(openMd, /Dark mode toggle/);
  assert.doesNotMatch(openMd, /Already fixed/);
  assert.match(openMd, /#greenhouse&seed=alice%3A/);
});


test("comments: only members comment, newest last, hidden and reported ones drop out but my own stay", () => {
  const seed = entry("alice", t0, { type: "seed", kind: "feature", title: "Dark mode", days: 7 });
  const id = `alice:${seed.id}`;
  const bad = entry("carol", t0 + 3, { type: "comment", seed: id, text: "spam" });
  const mine = entry("bob", t0 + 4, { type: "comment", seed: id, text: "reported but mine" });
  const entries = [
    seed,
    entry("bob", t0 + 1, { type: "comment", seed: id, text: "  nice  " }),
    entry("mallory", t0 + 2, { type: "comment", seed: id, text: "not a member" }),
    bad,
    mine,
    entry("bob", t0 + 5, { type: "comment", seed: id, text: "   " }), // empty
    entry("bob", t0 - 1, { type: "comment", seed: id, text: "before the seed" }),
  ];
  const hide = (_a: string, target: string) => target === `carol:${bad.id}` || target === `bob:${mine.id}`;
  const out = foldGreenhouse(entries, tierOf, "bob", "boss", () => 0, [], hide)[0];
  assert.deepEqual(out.comments.map((c) => c.text), ["nice", "reported but mine"]);
});

const makeSeed = (overrides: Partial<Seed> = {}): Seed => ({
  id: overrides.id ?? "alice:s1",
  author: overrides.author ?? "alice",
  kind: overrides.kind ?? "feature",
  title: overrides.title ?? "Sample seed",
  text: overrides.text ?? "",
  ts: overrides.ts ?? t0,
  closes: overrides.closes ?? t0 + 7 * DAY,
  up: overrides.up ?? 0,
  down: overrides.down ?? 0,
  voters: overrides.voters ?? 0,
  mine: overrides.mine ?? 0,
  status: overrides.status,
  comments: overrides.comments ?? [],
});

test("classifySeed routes open, triaged, and expired seeds into the right buckets", () => {
  const now = 1_700_000_000_000;
  assert.equal(classifySeed(makeSeed({ closes: now + DAY, status: undefined }), now), "voting");
  assert.equal(classifySeed(makeSeed({ closes: now + DAY, status: "done" }), now), "done");
  assert.equal(classifySeed(makeSeed({ closes: now - DAY, status: "done" }), now), "done");
  assert.equal(classifySeed(makeSeed({ closes: now - DAY, status: "planned" }), now), "planned");
  assert.equal(classifySeed(makeSeed({ closes: now + DAY, status: "planned" }), now), "planned");
  assert.equal(classifySeed(makeSeed({ closes: now + DAY, status: "considering" }), now), "planned");
  assert.equal(classifySeed(makeSeed({ closes: now - DAY, status: "considering" }), now), "planned");
  assert.equal(classifySeed(makeSeed({ closes: now + DAY, status: "not-now" }), now), "archive");
  assert.equal(classifySeed(makeSeed({ closes: now - DAY, status: "not-now" }), now), "archive");
  assert.equal(classifySeed(makeSeed({ closes: now - DAY, status: undefined }), now), "archive");
  assert.equal(classifySeed(makeSeed({ closes: now, status: undefined }), now), "archive");
});

test("filterAndGroupSeeds separates buckets, filters by kind and case-insensitive query, and keeps planned ahead of considering", () => {
  const now = 1_700_000_000_000;
  const seeds: Seed[] = [
    makeSeed({ id: "a:1", author: "alice_key", kind: "feature", title: "Open voting", text: "Dark theme", closes: now + 5 * DAY, up: 4 }),
    makeSeed({ id: "a:2", author: "bob_key", kind: "bug", title: "Open but done", text: "Fixed fast", closes: now + 5 * DAY, status: "done", ts: now - 1000 }),
    makeSeed({ id: "a:3", author: "carol_key", kind: "feature", title: "Closed planned", text: "Roadmap item", closes: now - 2 * DAY, status: "planned", up: 1, ts: now - 5000 }),
    makeSeed({ id: "a:4", author: "dan_key", kind: "bug", title: "High-vote considering", text: "Investigating", closes: now + DAY, status: "considering", up: 20, ts: now - 100 }),
    makeSeed({ id: "a:5", author: "erin_key", kind: "feature", title: "Open not-now", text: "Deferred", closes: now + 5 * DAY, status: "not-now" }),
    makeSeed({ id: "a:6", author: "frank_key", kind: "bug", title: "Expired untriaged", text: "Old bug", closes: now - DAY }),
  ];

  const all = filterAndGroupSeeds(seeds, { now });
  assert.deepEqual(all.voting.map((s) => s.id), ["a:1"]);
  assert.deepEqual(all.planned.map((s) => s.id), ["a:3", "a:4"]);
  assert.deepEqual(all.done.map((s) => s.id), ["a:2"]);
  assert.deepEqual(all.archive.map((s) => s.id), ["a:5", "a:6"]);

  // Inside "planned", planned always stays before considering across every sort mode
  for (const sort of ["votes", "newest", "discussed", "closing"] satisfies SeedSort[]) {
    const grouped = filterAndGroupSeeds(seeds, { now, sort });
    assert.deepEqual(grouped.planned.map((s) => s.id), ["a:3", "a:4"], `expected planned before considering for sort=${sort}`);
  }

  // Kind filters
  const bugs = filterAndGroupSeeds(seeds, { now, kind: "bug" });
  assert.deepEqual(bugs.voting, []);
  assert.deepEqual(bugs.planned.map((s) => s.id), ["a:4"]);
  assert.deepEqual(bugs.done.map((s) => s.id), ["a:2"]);
  assert.deepEqual(bugs.archive.map((s) => s.id), ["a:6"]);

  const features = filterAndGroupSeeds(seeds, { now, kind: "feature" });
  assert.deepEqual(features.voting.map((s) => s.id), ["a:1"]);
  assert.deepEqual(features.planned.map((s) => s.id), ["a:3"]);
  assert.deepEqual(features.done, []);
  assert.deepEqual(features.archive.map((s) => s.id), ["a:5"]);

  const explicitAll = filterAndGroupSeeds(seeds, { now, kind: "all" });
  assert.equal(SEED_BUCKETS.reduce((sum, b) => sum + explicitAll[b].length, 0), 6);

  // Case-insensitive query across title, text, displayName, and raw author
  const names: Record<string, string> = { alice_key: "Alice Wonder", carol_key: "Carol" };
  const byTitle = filterAndGroupSeeds(seeds, { now, query: "  ROADMAP " });
  assert.deepEqual(byTitle.planned.map((s) => s.id), ["a:3"]);

  const byText = filterAndGroupSeeds(seeds, { now, query: "dArK tHeMe" });
  assert.deepEqual(byText.voting.map((s) => s.id), ["a:1"]);

  const byDisplayName = filterAndGroupSeeds(seeds, { now, query: "WONDER", displayName: (pk) => names[pk] ?? pk });
  assert.deepEqual(byDisplayName.voting.map((s) => s.id), ["a:1"]);

  const byAuthorKey = filterAndGroupSeeds(seeds, { now, query: "ERIN_KEY", displayName: (pk) => names[pk] ?? pk });
  assert.deepEqual(byAuthorKey.archive.map((s) => s.id), ["a:5"]);
});

test("sortSeeds supports votes, newest, discussed, and closing without mutating input", () => {
  const now = 1_700_000_000_000;
  const s1 = makeSeed({ id: "s1", up: 2, down: 0, voters: 2, ts: now - 3000, closes: now + 5 * DAY, comments: [] });
  const s2 = makeSeed({
    id: "s2",
    up: 10,
    down: 1,
    voters: 4,
    ts: now - 2000,
    closes: now + 10 * DAY,
    comments: [{ id: "c1", author: "bob", text: "one", ts: now - 1000 }],
  });
  const s3 = makeSeed({
    id: "s3",
    up: 1,
    down: 0,
    voters: 1,
    ts: now - 1000,
    closes: now + 1 * DAY,
    comments: [
      { id: "c2", author: "bob", text: "a", ts: now - 900 },
      { id: "c3", author: "carol", text: "b", ts: now - 800 },
    ],
  });
  const sClosed = makeSeed({ id: "s4", up: 50, down: 0, voters: 10, ts: now - 500, closes: now - 2 * DAY, comments: [] });
  const input = [s1, s2, s3, sClosed];
  const snapshot = input.map((s) => s.id);

  assert.deepEqual(sortSeeds(input, "votes", "voting", now).map((s) => s.id), ["s4", "s2", "s1", "s3"]);
  assert.deepEqual(sortSeeds(input, "newest", "voting", now).map((s) => s.id), ["s4", "s3", "s2", "s1"]);
  assert.deepEqual(sortSeeds(input, "discussed", "voting", now).map((s) => s.id), ["s3", "s2", "s4", "s1"]);
  assert.deepEqual(sortSeeds(input, "closing", "voting", now).map((s) => s.id), ["s3", "s1", "s2", "s4"]);
  assert.deepEqual(input.map((s) => s.id), snapshot);
});

test("pickDefaultBucket follows voting -> planned -> done -> archive and falls back to voting", () => {
  const s = makeSeed();
  assert.equal(pickDefaultBucket({ voting: [s], planned: [s], done: [s], archive: [s] }), "voting");
  assert.equal(pickDefaultBucket({ voting: [], planned: [s], done: [s], archive: [s] }), "planned");
  assert.equal(pickDefaultBucket({ voting: [], planned: [], done: [s], archive: [s] }), "done");
  assert.equal(pickDefaultBucket({ voting: [], planned: [], done: [], archive: [s] }), "archive");
  assert.equal(pickDefaultBucket({ voting: [], planned: [], done: [], archive: [] }), "voting");
});

test("formatSeedsForAi(..., true) includes open voting and closed-window planned/considering while excluding done, not-now, and expired untriaged", () => {
  const openVoting = makeSeed({ id: "a:v", title: "Open Voting Seed", closes: Date.now() + 5 * DAY });
  const closedPlanned = makeSeed({ id: "a:p", title: "Closed Planned Seed", closes: Date.now() - 2 * DAY, status: "planned" });
  const closedConsidering = makeSeed({ id: "a:c", title: "Closed Considering Seed", closes: Date.now() - 2 * DAY, status: "considering" });
  const openDone = makeSeed({ id: "a:d", title: "Open Done Seed", closes: Date.now() + 5 * DAY, status: "done" });
  const openNotNow = makeSeed({ id: "a:n", title: "Open Not Now Seed", closes: Date.now() + 5 * DAY, status: "not-now" });
  const expiredUntriaged = makeSeed({ id: "a:e", title: "Expired Untriaged Seed", closes: Date.now() - 2 * DAY });

  const md = formatSeedsForAi(
    [openVoting, closedPlanned, closedConsidering, openDone, openNotNow, expiredUntriaged],
    (pk) => `@${pk}`,
    true
  );
  assert.match(md, /Open Voting Seed/);
  assert.match(md, /Closed Planned Seed/);
  assert.match(md, /Closed Considering Seed/);
  assert.doesNotMatch(md, /Open Done Seed/);
  assert.doesNotMatch(md, /Open Not Now Seed/);
  assert.doesNotMatch(md, /Expired Untriaged Seed/);
});

test("foldGreenhouse Layer 2 seed moderation drops hidden/reported/AI-held seeds for readers while authors keep their own", () => {
  const hiddenAuthorSeed = entry("carol", t0, { type: "seed", kind: "feature", title: "Hidden Author Seed", days: 7 });
  const reportedSeed = entry("alice", t0 + 1, { type: "seed", kind: "bug", title: "Reported Seed", days: 7 });
  const aiHeldOwnSeed = entry("bob", t0 + 2, { type: "seed", kind: "feature", title: "My AI-Held Seed", days: 7 });
  const visibleSeed = entry("alice", t0 + 3, { type: "seed", kind: "feature", title: "Visible Seed", days: 7 });

  const hideAuthor = (author: string) => author === "carol";
  const isReportedOrHeld = (target: string) => target === `alice:${reportedSeed.id}` || target === `bob:${aiHeldOwnSeed.id}`;
  const entries = [hiddenAuthorSeed, reportedSeed, aiHeldOwnSeed, visibleSeed];

  const bobView = foldGreenhouse(
    entries,
    tierOf,
    "bob",
    "boss",
    () => 0,
    [],
    () => false,
    (author, target) => hideAuthor(author) || isReportedOrHeld(target)
  );
  assert.deepEqual(
    bobView.map((s) => s.title),
    ["Visible Seed", "My AI-Held Seed"]
  );

  // Even when a reader's own author key is marked hidden, the author still sees their own seed
  const carolView = foldGreenhouse(
    entries,
    tierOf,
    "carol",
    "boss",
    () => 0,
    [],
    () => false,
    (author, target) => hideAuthor(author) || isReportedOrHeld(target)
  );
  assert.deepEqual(
    carolView.map((s) => s.title),
    ["Visible Seed", "Hidden Author Seed"]
  );

  // 7-arg callers get Layer 2 seed filtering automatically via hideComment fallback
  const sevenArgView = foldGreenhouse(
    entries,
    tierOf,
    "bob",
    "boss",
    () => 0,
    [],
    (author, target) => hideAuthor(author) || isReportedOrHeld(target)
  );
  assert.deepEqual(
    sevenArgView.map((s) => s.title),
    ["Visible Seed", "My AI-Held Seed"]
  );
});
