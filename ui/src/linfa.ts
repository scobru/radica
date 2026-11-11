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

export interface Linfa {
  total: number;
  /** Grown in the last seven days. */
  week: number;
  /** Where it came from: answering others, being answered, posting. They add up to `total`. */
  given: number;
  received: number;
  posting: number;
}

interface Gain { ts: number; points: number; from: string; part: "given" | "received" }

/** Every act that feeds `who`'s Linfa, found in `posts` (what this node holds, `who`'s own posts among them). */
function gains(posts: Post[], who: string): { acts: Gain[]; postDays: number[] } {
  const acts: Gain[] = [];
  const days = new Map<number, number>(); // day -> the first post of that day
  for (const p of posts) {
    const comments = Object.values(p.comments ?? {}).filter((c) => c.text !== ""); // an empty one was taken back
    if (p.author === who) {
      const day = Math.floor(p.timestamp / DAY_MS);
      days.set(day, Math.min(days.get(day) ?? Infinity, p.timestamp));
      const answered = new Map<string, number>(); // one answer per person and post: a long thread is not a harvest
      for (const c of comments) if (c.author !== who) answered.set(c.author, Math.min(answered.get(c.author) ?? Infinity, c.timestamp));
      for (const [from, ts] of answered) acts.push({ ts, points: POINTS.replyReceived, from, part: "received" });
      for (const k of likers(p)) if (k !== who) acts.push({ ts: p.likes[k].ts, points: POINTS.likeReceived, from: k, part: "received" });
      continue;
    }
    const mine = comments.filter((c) => c.author === who);
    if (mine.length) acts.push({ ts: Math.min(...mine.map((c) => c.timestamp)), points: POINTS.replyGiven, from: p.author, part: "given" });
    if (p.likes?.[who]?.liked) acts.push({ ts: p.likes[who].ts, points: POINTS.likeGiven, from: p.author, part: "given" });
    if (repostRef(p.caption)?.author === who) acts.push({ ts: p.timestamp, points: POINTS.repostReceived, from: p.author, part: "received" });
  }
  return { acts, postDays: [...days.values()].sort((a, b) => a - b).slice(0, POST_DAYS_CAP) };
}

/** The Linfa of `who` as the reader sees it now. */
export function linfaOf(posts: Post[], who: string, trust: Trust, now = Date.now()): Linfa {
  const { acts, postDays } = gains(posts, who);
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
  return { ...all, total, week: total - (before.given + before.received + before.posting) };
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
