// A persona's comment history, drawn in the Comments tab of their profile.
//
// Comments are signed entries stored in the feed of the post they answer (`Post.comments`), not in the commenter's own
// feed, so this node can only list the ones it holds: counted from what it sees, like Linfa (linfa.ts). Nothing is stored.
import type { Comment, Post } from "./types.ts";

export interface CommentEntry {
  post: Post;
  comment: Comment;
}

/** What the reader does not want to see: posts and comments hidden, blocked, reported or AI-held (the feed's own rules). */
export interface CommentFilters {
  hidePost?: (post: Post) => boolean;
  hideComment?: (comment: Comment) => boolean;
}

/** Every live comment by `author` on the given posts, newest first. A comment its author took back has empty text. */
export function commentsBy(posts: Iterable<Post>, author: string, { hidePost, hideComment }: CommentFilters = {}): CommentEntry[] {
  const seen = new Set<string>();
  const out: CommentEntry[] = [];
  for (const post of posts) {
    const key = `${post.author}:${post.id}`;
    if (seen.has(key)) continue; // the same post can come from the explore timeline and from a feed
    seen.add(key);
    if (hidePost?.(post)) continue;
    for (const comment of Object.values(post.comments ?? {})) {
      if (comment.author !== author || comment.text === "" || hideComment?.(comment)) continue;
      out.push({ post, comment });
    }
  }
  return out.sort((a, b) => b.comment.timestamp - a.comment.timestamp);
}
