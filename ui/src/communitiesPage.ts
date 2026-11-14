import type { Post } from "./types.ts";

export type RedditSort = "hot" | "new" | "top24h" | "top7d" | "topAll";
export type RedditFlairFilter = "all" | "thought" | "moment" | "event" | "poll";
export type RedditViewMode = "card" | "compact";

const DAY_MS = 86_400_000;

/** Net score of a thread: upvotes (likes) minus downvotes (dislikes). */
export function computeNetScore(likesCount: number, dislikesCount: number): number {
  return likesCount - dislikesCount;
}

/** Reddit-style hotness rank combining net score, comment engagement, and time decay. */
export function computeHotRank(
  likesCount: number,
  dislikesCount: number,
  commentsCount: number,
  timestampMs: number,
  nowMs = Date.now(),
): number {
  const ageHours = Math.max(0, (nowMs - timestampMs) / 3_600_000);
  const engagement = computeNetScore(likesCount, dislikesCount) + commentsCount * 0.5;
  return (engagement + 2) / Math.pow(ageHours + 2, 1.4);
}

function visibleCommentsCount(post: Post): number {
  let count = 0;
  for (const c of Object.values(post.comments || {})) {
    if (c && c.text !== "") count++;
  }
  return count;
}

/** Sort community threads for the Reddit-style view (hot, new, top24h, top7d, topAll). */
export function sortRedditThreads(
  posts: Post[],
  sort: RedditSort,
  getLikesCount: (p: Post) => number,
  getDislikesCount: (p: Post) => number,
  nowMs = Date.now(),
): Post[] {
  if (sort === "new") {
    return [...posts].sort((a, b) => b.timestamp - a.timestamp);
  }
  if (sort === "hot") {
    return [...posts]
      .map((p) => ({
        p,
        rank: computeHotRank(getLikesCount(p), getDislikesCount(p), visibleCommentsCount(p), p.timestamp, nowMs),
      }))
      .sort((a, b) => b.rank - a.rank || b.p.timestamp - a.p.timestamp)
      .map((x) => x.p);
  }

  const since =
    sort === "top24h" ? nowMs - DAY_MS : sort === "top7d" ? nowMs - 7 * DAY_MS : -Infinity;

  return posts
    .filter((p) => p.timestamp >= since)
    .map((p) => ({ p, score: computeNetScore(getLikesCount(p), getDislikesCount(p)) }))
    .sort((a, b) => b.score - a.score || b.p.timestamp - a.p.timestamp)
    .map((x) => x.p);
}

function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace >= Math.floor(maxLen * 0.4) ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/** Split a post caption into a Reddit-style thread title and optional body. */
export function splitThreadTitleAndBody(caption: string): { title: string; body: string } {
  const trimmed = caption.trim();
  if (!trimmed) return { title: "", body: "" };

  const firstNl = trimmed.indexOf("\n");
  if (firstNl !== -1) {
    const firstLine = trimmed.slice(0, firstNl).trim();
    const rest = trimmed.slice(firstNl + 1).trim();
    if (firstLine.length <= 160) {
      return { title: firstLine, body: rest };
    }
    return {
      title: truncateAtWordBoundary(firstLine, 160),
      body: rest ? `${firstLine}\n\n${rest}` : firstLine,
    };
  }

  if (trimmed.length <= 140) {
    return { title: trimmed, body: "" };
  }

  // Look for a sentence boundary (. ! ?) where the title portion is 20..140 chars
  const boundaryRe = /([.!?])\s+/g;
  let match: RegExpExecArray | null;
  while ((match = boundaryRe.exec(trimmed)) !== null) {
    const endIdx = match.index + 1;
    if (endIdx >= 20 && endIdx <= 140) {
      return {
        title: trimmed.slice(0, endIdx).trim(),
        body: trimmed.slice(match.index + match[0].length).trim(),
      };
    }
    if (endIdx > 140) break;
  }

  return {
    title: truncateAtWordBoundary(trimmed, 120),
    body: trimmed,
  };
}

/** Map a post's category/poll status to a Reddit-style flair descriptor. */
export function flairInfoForPost(
  post: Post,
  isPoll = false,
): { key: RedditFlairFilter; label: string; cssClass: string; icon: string } {
  if (isPoll) {
    return { key: "poll", label: "Poll", cssClass: "reddit-flair-poll", icon: "📊" };
  }
  if (post.category === "moment") {
    return { key: "moment", label: "Media", cssClass: "reddit-flair-moment", icon: "📸" };
  }
  if (post.category === "event") {
    return { key: "event", label: "Event", cssClass: "reddit-flair-event", icon: "📅" };
  }
  return { key: "thought", label: "Discussion", cssClass: "reddit-flair-thought", icon: "💬" };
}

/** Combine a Reddit thread title and optional body into a signed post caption. */
export function formatThreadComposeCaption(title: string, body: string): string {
  const t = title.trim();
  const b = body.trim();
  if (t && b) return `${t}\n\n${b}`;
  return t || b;
}
