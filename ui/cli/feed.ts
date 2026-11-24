// The feed in the terminal chat: which posts to show, and how a post reads in a line. Pure, so a test can drive it.
import type { Post } from "../src/types.ts";

/** What decides whether I see a post: my own list, the lists I trust (Radica's default among them), the AI helper's holds. */
export interface FeedFilter {
  me: string;
  /** Authors I hid on this device. */
  hidden: Set<string>;
  /** Authors blocked by me or by a curator I trust. */
  blocked: (pubkey: string) => boolean;
  /** `<author>:<post id>` reported by me or by a trusted curator, or held by the AI helper. */
  reported: Set<string>;
}

/** Newest first, without hidden or blocked authors, reported or held posts, and sensitive (NSFW) ones: a terminal shows no
 *  media. My own posts always stay: an author sees their own, as in the app. */
export function visiblePosts(posts: Post[], f: FeedFilter): Post[] {
  return posts
    .filter((p) => p.author === f.me || (!f.hidden.has(p.author) && !f.blocked(p.author) && !f.reported.has(`${p.author}:${p.id}`) && !p.is_nsfw))
    .sort((a, z) => z.timestamp - a.timestamp);
}

/** `12. [2026-11-24 17:02] Alice: text …` — one post; `mask` hides bad words as the reader chose. */
export function postLine(n: number, p: Post, who: string, caption: string, mask: (t: string) => string, max = 600): string {
  const day = new Date(p.timestamp).toISOString().slice(0, 16).replace("T", " ");
  const text = mask(caption).replace(/\s+/g, " ").trim();
  const clipped = text.length > max ? `${text.slice(0, max)}…` : text;
  const extras = [p.media_uri ? "media" : "", Object.keys(p.comments ?? {}).length ? `${Object.keys(p.comments).length} comments` : ""].filter(Boolean);
  return `${String(n).padStart(2)}. [${day}] ${who}: ${clipped}${extras.length ? `  (${extras.join(", ")})` : ""}`;
}
