// Linfa (sap): how alive a persona's place in Radica is, shown as a plant on their profile (plant.ts).
//
// It is counted, never stored: this node adds it up from the signed posts, comments and likes it holds, so nobody can
// write themselves a number. It rewards answering more than posting, because a post is planted again when the last
// one was answered. And it flows through the reader's roots (their web of trust): what a stranger gives counts a
// little and only up to a cap, so a crowd of new identities cannot grow a tree. Two readers can therefore see two
// different plants for the same persona, like every count in Radica ("counted from what this node sees").
import { likers, type Post } from "./types.ts";
import { repostRef } from "./repost.ts";

/** What one act is worth before the trust of the other side weighs it. */
export const POINTS = { replyGiven: 3, repostReceived: 3, replyReceived: 2, likeReceived: 1, likeGiven: 0.5, postDay: 1 };
/** Posting alone grows the first leaves and no more: one point a day posted, up to this many days. */
export const POST_DAYS_CAP = 30;
/** All that strangers give, together, is worth this much at most. */
export const STRANGER_CAP = 20;
/** The other side's weight by the reader's trust in them: 1 a root (followed), 2 a friend of a friend, 0 a stranger. */
const TRUST_WEIGHT = { 1: 1, 2: 0.5, 0: 0.25 } as const;
export type Trust = (pubkey: string) => 0 | 1 | 2;

const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

export type PlantSeason = "spring" | "autumn" | "dormant";

export interface SeasonInfo {
  season: PlantSeason;
  daysInactive: number;
  vitality: number; // 0.1 to 1.0
  label: string;
}

export function seasonOf(lastActiveTs: number, now = Date.now()): SeasonInfo {
  if (!lastActiveTs || lastActiveTs <= 0) {
    return { season: "spring", daysInactive: 0, vitality: 1, label: "Awakening" };
  }
  const diff = Math.max(0, now - lastActiveTs);
  const daysInactive = Math.floor(diff / DAY_MS);

  if (daysInactive <= 7) {
    return { season: "spring", daysInactive, vitality: 1, label: "Active" };
  }
  if (daysInactive <= 30) {
    const t = (daysInactive - 7) / 23;
    const vitality = Math.max(0.35, 1 - t * 0.65);
    return { season: "autumn", daysInactive, vitality, label: `Autumn (${daysInactive}d inactive)` };
  }
  const t = Math.min(1, (daysInactive - 30) / 60);
  const vitality = Math.max(0.12, 0.35 - t * 0.23);
  return { season: "dormant", daysInactive, vitality, label: `Dormant (${daysInactive}d resting)` };
}

export interface Linfa {
  total: number;
  /** Grown in the last seven days. */
  week: number;
  /** Where it came from: answering others, being answered, posting. They add up to `total`. */
  given: number;
  received: number;
  posting: number;
  lastActiveTs: number;
  season: SeasonInfo;
}

interface Gain { ts: number; points: number; from: string; part: "given" | "received" }

/** Every act that feeds `who`'s Linfa, found in `posts` (what this node holds, `who`'s own posts among them). */
function gains(posts: Post[], who: string): { acts: Gain[]; postDays: number[]; lastActiveTs: number } {
  const acts: Gain[] = [];
  const days = new Map<number, number>(); // day -> the first post of that day
  let lastActiveTs = 0;
  for (const p of posts) {
    const comments = Object.values(p.comments ?? {}).filter((c) => c.text !== ""); // an empty one was taken back
    if (p.author === who) {
      lastActiveTs = Math.max(lastActiveTs, p.timestamp);
      const day = Math.floor(p.timestamp / DAY_MS);
      days.set(day, Math.min(days.get(day) ?? Infinity, p.timestamp));
      const answered = new Map<string, number>(); // one answer per person and post: a long thread is not a harvest
      for (const c of comments) if (c.author !== who) answered.set(c.author, Math.min(answered.get(c.author) ?? Infinity, c.timestamp));
      for (const [from, ts] of answered) acts.push({ ts, points: POINTS.replyReceived, from, part: "received" });
      for (const k of likers(p)) if (k !== who) acts.push({ ts: p.likes[k].ts, points: POINTS.likeReceived, from: k, part: "received" });
      continue;
    }
    const mine = comments.filter((c) => c.author === who);
    if (mine.length) {
      const ts = Math.max(...mine.map((c) => c.timestamp));
      lastActiveTs = Math.max(lastActiveTs, ts);
      acts.push({ ts: Math.min(...mine.map((c) => c.timestamp)), points: POINTS.replyGiven, from: p.author, part: "given" });
    }
    if (p.likes?.[who]?.liked) {
      lastActiveTs = Math.max(lastActiveTs, p.likes[who].ts);
      acts.push({ ts: p.likes[who].ts, points: POINTS.likeGiven, from: p.author, part: "given" });
    }
    if (repostRef(p.caption)?.author === who) {
      lastActiveTs = Math.max(lastActiveTs, p.timestamp);
      acts.push({ ts: p.timestamp, points: POINTS.repostReceived, from: p.author, part: "received" });
    }
  }
  return { acts, postDays: [...days.values()].sort((a, b) => a - b).slice(0, POST_DAYS_CAP), lastActiveTs };
}

/** The Linfa of `who` as the reader sees it now. */
export function linfaOf(posts: Post[], who: string, trust: Trust, now = Date.now()): Linfa {
  const { acts, postDays, lastActiveTs } = gains(posts, who);
  const upTo = (until: number) => {
    const sum = { given: 0, received: 0, posting: postDays.filter((ts) => ts <= until).length * POINTS.postDay };
    let strangers = 0;
    for (const a of acts.filter((a) => a.ts <= until).sort((x, y) => x.ts - y.ts)) {
      const tier = trust(a.from);
      let points = a.points * TRUST_WEIGHT[tier];
      if (tier === 0) {
        points = Math.min(points, STRANGER_CAP - strangers);
        strangers += points;
      }
      sum[a.part] += points;
    }
    return sum;
  };
  const all = upTo(now); // a date in the future (a contract has no clock) does not count yet
  const before = upTo(now - WEEK_MS);
  const total = all.given + all.received + all.posting;
  const season = seasonOf(lastActiveTs, now);
  return { ...all, total, week: total - (before.given + before.received + before.posting), lastActiveTs, season };
}

/** Minimum trusted interactions received before Linfa counts in Greenhouse (blocks unilateral bots and Sybil rings). */
export const MIN_TRUSTED_RECEIVED = 2;

/**
 * Sybil-resistant Greenhouse vote weight derived from `who`'s Linfa.
 * Ignores Tier-0 strangers and caps unilateral activity (`given`, `posting`) relative to trusted feedback received,
 * returning 0 below Sapling (12), 1 for Sapling/Young tree (12+), 2 for Tree (120+), and 3 for Elder tree (300+).
 */
export function linfaGreenhouseWeight(posts: Post[], who: string, trust: Trust, now = Date.now()): number {
  const { acts, postDays } = gains(posts, who);
  let trustedReceived = 0;
  let given = 0;
  for (const a of acts) {
    if (a.ts > now) continue;
    const tier = trust(a.from);
    if (tier === 0) continue;
    const pts = a.points * TRUST_WEIGHT[tier];
    if (a.part === "received") trustedReceived += pts;
    else given += pts;
  }
  if (trustedReceived < MIN_TRUSTED_RECEIVED) return 0;
  const posting = postDays.filter((ts) => ts <= now).length * POINTS.postDay;
  const effective = trustedReceived + Math.min(given, trustedReceived * 3) + Math.min(posting, trustedReceived * 2);
  if (effective >= 300) return 3;
  if (effective >= 120) return 2;
  if (effective >= 12) return 1;
  return 0;
}

/** The plant's ages. Not the supporter tiers (Sprout, Root, Oak): those are bought, these are grown. */
export const STAGES = [
  { at: 0, name: "Seed" },
  { at: 1, name: "Seedling" },
  { at: 12, name: "Sapling" },
  { at: 40, name: "Young tree" },
  { at: 120, name: "Tree" },
  { at: 300, name: "Elder tree" },
] as const;

/** The age a Linfa has reached, the next one, and how far along it is (0 to 1; 1 at the last age). */
export function stageOf(total: number): { index: number; name: string; next: { at: number; name: string } | null; progress: number } {
  let index = 0;
  while (index + 1 < STAGES.length && total >= STAGES[index + 1].at) index++;
  const next = STAGES[index + 1] ?? null;
  return { index, name: STAGES[index].name, next, progress: next ? (total - STAGES[index].at) / (next.at - STAGES[index].at) : 1 };
}
