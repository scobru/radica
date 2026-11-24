// The feed in the terminal chat: which posts to show, and how a post reads in a line. Pure, so a test can drive it.
import type { Comment, Post } from "../src/types.ts";

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

/** The comments I see: not taken back by their author (empty), and not from hidden or blocked authors or reported ones; mine stay. */
export function visibleComments(post: Post, f: FeedFilter): Comment[] {
  return Object.values(post.comments ?? {})
    .filter((c) => c.text !== "" && (c.author === f.me || (!f.hidden.has(c.author) && !f.blocked(c.author) && !f.reported.has(`${c.author}:${c.id}`))))
    .sort((a, z) => a.timestamp - z.timestamp);
}

const stamp = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace("T", " ");

/** A post as one entry of the feed list: `n` its number in the last /feed; `mask` hides bad words as the reader chose. */
export function postItem(n: number, p: Post, who: string, caption: string, mask: (t: string) => string, f: FeedFilter, max = 600) {
  const text = mask(caption).replace(/\s+/g, " ").trim();
  const comments = visibleComments(p, f).length;
  const extras = [p.media_uri ? "media" : "", comments ? `${comments} comments` : ""].filter(Boolean);
  return { time: `${n}. ${stamp(p.timestamp)}`, who, mine: p.author === f.me, text: text.length > max ? `${text.slice(0, max)}…` : text, note: extras.join(", ") || undefined };
}

/** `12. [2026-11-24 17:02] Alice: text …`: one post on one line (line mode). */
export function postLine(n: number, p: Post, who: string, caption: string, mask: (t: string) => string, f: FeedFilter, max = 600): string {
  const i = postItem(n, p, who, caption, mask, f, max);
  return `${String(n).padStart(2)}. [${stamp(p.timestamp)}] ${who}: ${i.text}${i.note ? `  (${i.note})` : ""}`;
}

/** One post in full, with its visible comments: what Enter shows. */
export function postDetail(p: Post, who: string, caption: string, mask: (t: string) => string, f: FeedFilter, nameOf: (pk: string) => string): string {
  const comments = visibleComments(p, f);
  const lines = [`${who} · ${stamp(p.timestamp)}${p.media_uri ? " · media not shown" : ""}`, "", mask(caption).trim(), ""];
  lines.push(comments.length ? `— ${comments.length} comment${comments.length === 1 ? "" : "s"} —` : "— no comments —");
  for (const c of comments) lines.push("", `${nameOf(c.author)} · ${stamp(c.timestamp)}`, `  ${mask(c.text).replace(/\s+/g, " ").trim()}`);
  lines.push("", "Esc: back to the feed · /report and /hide act on this post");
  return lines.join("\n");
}
