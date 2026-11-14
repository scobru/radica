// Pure Vertical Video Reels & freenet-blob long-form video helpers (TASK-006).
// Zero DOM dependencies so it can be unit-tested in Node.
import { videoRef } from "./video.ts";
import type { Post } from "./types.ts";

export const VIDEO_BLOB_PREFIX = "radica-video-blob:";
const VIDEO_BLOB_RE = /(?:^|\s)radica-video-blob:([0-9a-f]{64})(?:\|(\d+))?(?=\s|$)/i;

export interface BlobVideoRef {
  hash: string;
  durationSec?: number;
}

/** Extract a `radica-video-blob:<64-hex-hash>[|<durationSec>]` reference from a post caption, or null. */
export function parseBlobVideoRef(caption?: string): BlobVideoRef | null {
  if (!caption) return null;
  const m = VIDEO_BLOB_RE.exec(caption);
  if (!m) return null;
  const durationSec = m[2] ? Number(m[2]) : undefined;
  return {
    hash: m[1].toLowerCase(),
    ...(durationSec && Number.isFinite(durationSec) && durationSec > 0 ? { durationSec } : {}),
  };
}

/** Format a post caption carrying a `freenet-blob` long-form video manifest reference. */
export function formatBlobVideoCaption(text: string, hash: string, durationSec?: number): string {
  const token = durationSec && durationSec > 0
    ? `${VIDEO_BLOB_PREFIX}${hash.toLowerCase()}|${Math.round(durationSec)}`
    : `${VIDEO_BLOB_PREFIX}${hash.toLowerCase()}`;
  return [text.trim(), token].filter(Boolean).join("\n\n");
}

/** True when a post carries either a standard `radica-video:` or a `radica-video-blob:` video. */
export function isVideoReelPost(post: Pick<Post, "media_uri" | "caption">): boolean {
  return Boolean(videoRef(post.media_uri) || parseBlobVideoRef(post.caption));
}

/**
 * Filter & sort video posts for Moments Reels mode, applying local/AI/curator moderation.
 */
export function filterVideoReels(
  posts: Post[],
  opts: {
    hiddenAuthors?: Set<string>;
    reported?: Set<string>;
    reportedMedia?: Set<string>;
    myPubkey?: string;
    following?: Set<string>;
    onlyFollowing?: boolean;
  } = {}
): Post[] {
  const me = opts.myPubkey || "";
  const out: Post[] = [];
  const seen = new Set<string>();

  for (const p of posts) {
    if (!p || !isVideoReelPost(p)) continue;
    const key = `${p.author}:${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (opts.hiddenAuthors?.has(p.author)) continue;
    if (p.author !== me) {
      if (opts.reported?.has(key)) continue;
      const vref = videoRef(p.media_uri);
      if (vref && opts.reportedMedia?.has(vref.hash)) continue;
    }
    if (opts.onlyFollowing && opts.following && !opts.following.has(p.author) && p.author !== me) continue;
    out.push(p);
  }

  return out.sort((a, b) => b.timestamp - a.timestamp);
}

/** Clamp reel navigation index within `[0, total - 1]`. */
export function stepReelIndex(current: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, current + delta));
}
