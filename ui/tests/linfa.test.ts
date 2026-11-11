import test from "node:test";
import assert from "node:assert/strict";
import { linfaOf, stageOf, seasonOf, POINTS, POST_DAYS_CAP, STRANGER_CAP, STAGES, WEEK_MS, type Trust } from "../src/linfa.ts";
import type { Post } from "../src/types.ts";

const DAY = 86_400_000;
const NOW = 400 * DAY;
const pk = (c: string) => c.repeat(64);
const [ME, ROOT, FRIEND] = [pk("a"), pk("b"), pk("c")];
const trust: Trust = (k) => (k === ME || k === ROOT ? 1 : k === FRIEND ? 2 : 0);

let n = 0;
const post = (author: string, o: { ts?: number; caption?: string; likes?: [string, number][]; comments?: [string, number, string?][] } = {}): Post => ({
  id: `p${++n}`,
  author,
  category: "thought",
  caption: o.caption ?? "hi",
  timestamp: o.ts ?? NOW - 30 * DAY,
  sig: "",
  likes: Object.fromEntries((o.likes ?? []).map(([k, ts]) => [k, { liked: true, ts, sig: "" }])),
  comments: Object.fromEntries((o.comments ?? []).map(([a, ts, text], i) => [`${a}:c${i}`, { id: `c${i}`, post_id: "", author: a, text: text ?? "yes", timestamp: ts, sig: "" }])),
});
const old = NOW - 20 * DAY;

test("nothing done is a seed", () => {
  assert.deepEqual(linfaOf([], ME, trust, NOW), {
    given: 0,
    received: 0,
    posting: 0,
    total: 0,
    week: 0,
    lastActiveTs: 0,
    season: { season: "spring", daysInactive: 0, vitality: 1, label: "Awakening" },
  });
  assert.equal(stageOf(0).name, "Seed");
});

test("answering counts more than being liked, and posting least", () => {
  const given = linfaOf([post(ROOT, { comments: [[ME, old]] })], ME, trust, NOW);
  const liked = linfaOf([post(ME, { likes: [[ROOT, old]] })], ME, trust, NOW);
  assert.equal(given.given, POINTS.replyGiven);
  assert.equal(liked.received, POINTS.likeReceived);
  assert.equal(liked.posting, POINTS.postDay);
  assert.ok(given.total > liked.received && liked.received >= liked.posting);
});

test("the other side's trust weighs each act: a root whole, a friend of a friend half, a stranger a quarter", () => {
  const of = (from: string) => linfaOf([post(ME, { likes: [[from, old]] })], ME, trust, NOW).received;
  assert.deepEqual([of(ROOT), of(FRIEND), of(pk("9"))], [1, 0.5, 0.25]);
});

test("a crowd of strangers cannot grow a tree", () => {
  const crowd: [string, number][] = Array.from({ length: 2000 }, (_, i) => [i.toString(16).padStart(64, "0"), old]);
  const l = linfaOf([post(ME, { likes: crowd, comments: crowd.map(([k, ts]) => [k, ts] as [string, number]) })], ME, trust, NOW);
  assert.equal(l.received, STRANGER_CAP);
});

test("my own likes and comments on my own posts count nothing, and a taken-back comment neither", () => {
  const l = linfaOf([post(ME, { likes: [[ME, old]], comments: [[ME, old], [ROOT, old, ""]] })], ME, trust, NOW);
  assert.equal(l.received, 0);
  assert.equal(l.given, 0);
});

test("a thread is one answer per person and post, in both directions", () => {
  const got = linfaOf([post(ME, { comments: [[ROOT, old], [ROOT, old + 1], [ROOT, old + 2]] })], ME, trust, NOW);
  assert.equal(got.received, POINTS.replyReceived);
  const gave = linfaOf([post(ROOT, { comments: [[ME, old], [ME, old + 1]] })], ME, trust, NOW);
  assert.equal(gave.given, POINTS.replyGiven);
});

test("posting counts once a day and stops after the first leaves", () => {
  const sameDay = [post(ME, { ts: 10 * DAY + 1 }), post(ME, { ts: 10 * DAY + 2 })];
  assert.equal(linfaOf(sameDay, ME, trust, NOW).posting, 1);
  const year = Array.from({ length: 365 }, (_, i) => post(ME, { ts: i * DAY + 5 }));
  assert.equal(linfaOf(year, ME, trust, NOW).posting, POST_DAYS_CAP);
});

test("being reposted counts, to the author of the shared post only", () => {
  const mine = post(ME, { ts: old });
  const repost = post(ROOT, { ts: old + 5, caption: `look\n\n/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/#post=${mine.id}&author=${ME}` });
  assert.equal(linfaOf([mine, repost], ME, trust, NOW).received, POINTS.repostReceived);
  assert.equal(linfaOf([mine, repost], FRIEND, trust, NOW).total, 0);
});

test("the week is what grew in the last seven days; a date in the future does not count yet", () => {
  const posts = [post(ROOT, { comments: [[ME, old]] }), post(ROOT, { comments: [[ME, NOW - DAY]] }), post(ROOT, { comments: [[ME, NOW + DAY]] })];
  const l = linfaOf(posts, ME, trust, NOW);
  assert.equal(l.total, 2 * POINTS.replyGiven);
  assert.equal(l.week, POINTS.replyGiven);
  assert.equal(linfaOf(posts, ME, trust, NOW + WEEK_MS + 2 * DAY).week, 0);
});

test("the parts add up to the total", () => {
  const posts = [post(ME, { ts: old, likes: [[ROOT, old], [FRIEND, old]], comments: [[pk("7"), old]] }), post(ROOT, { likes: [[ME, old]], comments: [[ME, old]] })];
  const l = linfaOf(posts, ME, trust, NOW);
  assert.equal(l.given + l.received + l.posting, l.total);
  assert.equal(l.total, 1 + 1 + 0.5 + 2 * 0.25 + 0.5 + 3);
});

test("ages: each starts at its threshold, with the way to the next", () => {
  for (const [i, s] of STAGES.entries()) {
    assert.equal(stageOf(s.at).index, i);
    if (i) assert.equal(stageOf(s.at - 0.01).index, i - 1);
  }
  const s = stageOf(26);
  assert.deepEqual([s.name, s.next?.name, s.progress], ["Sapling", "Young tree", 0.5]);
  assert.deepEqual([stageOf(9999).next, stageOf(9999).progress], [null, 1]);
});

test("seasons: dormancy and vitality change with inactivity, total Linfa preserved", () => {
  // Active / Spring (<= 7 days inactive)
  const springNow = seasonOf(NOW - 2 * DAY, NOW);
  assert.equal(springNow.season, "spring");
  assert.equal(springNow.vitality, 1);
  assert.equal(springNow.daysInactive, 2);

  // Autumn (8 to 30 days inactive)
  const autumnNow = seasonOf(NOW - 15 * DAY, NOW);
  assert.equal(autumnNow.season, "autumn");
  assert.equal(autumnNow.daysInactive, 15);
  assert.ok(autumnNow.vitality < 1 && autumnNow.vitality >= 0.35);

  // Dormant (> 30 days inactive)
  const dormantNow = seasonOf(NOW - 45 * DAY, NOW);
  assert.equal(dormantNow.season, "dormant");
  assert.equal(dormantNow.daysInactive, 45);
  assert.ok(dormantNow.vitality <= 0.35);

  // Awakening from 0 or empty activity
  assert.equal(seasonOf(0, NOW).season, "spring");
  assert.equal(seasonOf(0, NOW).vitality, 1);

  // Recent post awakens the tree to active spring
  const activePost = post(ME, { ts: NOW - 1 * DAY });
  const l = linfaOf([activePost], ME, trust, NOW);
  assert.equal(l.season.season, "spring");
  assert.equal(l.season.daysInactive, 1);
  assert.equal(l.season.vitality, 1);
});
