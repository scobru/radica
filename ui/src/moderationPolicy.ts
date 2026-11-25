// Layer 2 & Layer 3 content moderation policy: hidden authors, curator blocklists, global moderators,
// reported posts/media, AI holds, hidden communities, and DOM-free report dispatch.
// Zero DOM or WASM dependencies so both the web app and Terminal chat (`ui/cli`) share one source of truth.
import { mediaRef, mediaUris } from "./media.ts";
import { parseBlobVideoRef } from "./reels.ts";
import { RADICA_MAINTAINER, type Comment, type Community, type Post } from "./types.ts";
import { videoRef } from "./video.ts";

export const HIDDEN_USERS_KEY = "radica_hidden_users";
export const TRUSTED_BLOCKLISTS_KEY = "radica_trusted_blocklists";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ModerationLogSource {
  modsOf(curator: string): Set<string>;
  blockedBy(curator: string): Set<string>;
  reportedBy(curator: string): Map<string, unknown>;
  reportedMediaBy(curator: string): Set<string>;
  hiddenCommunitiesBy(curator: string): Map<string, string>;
  aiHeldTargets(): Set<string>;
}

export interface ModerationActionSink {
  reportPost(author: string, postId: string, reason: string, mediaHash: string | null, notifyGlobal: boolean): Promise<void>;
  addNotification(
    recipient: string,
    item: { type: "report"; from: string; text: string; linkPostId: string; linkPostOwner: string },
  ): Promise<void>;
}

export type HiddenReason = "author" | "reported" | "community" | null;

export interface ModerationPolicy {
  me: string;
  curators: Set<string>;
  hiddenAuthors: Set<string>;
  reportedTargets: Set<string>;
  reportedMedia: Set<string>;
  hiddenCommunities: Map<string, string>;
  globalMod: boolean;
  isAuthorHidden(pubkey: string): boolean;
  isTargetReported(target: string): boolean;
  isPostHidden(
    post: Pick<Post, "id" | "author" | "media_uri" | "caption" | "community_id">,
    opts?: { checkCommunity?: boolean },
  ): HiddenReason;
  isCommentHidden(comment: Pick<Comment, "id" | "author">): boolean;
  isReleaseHidden(owner: string, releaseId: string): boolean;
}

/** Content-addressed media hash for a post's image, video, or long-form `radica-video-blob:` ref. */
export function postMediaHash(post: Pick<Post, "media_uri" | "caption">): string | null {
  return mediaRef(mediaUris(post.media_uri)[0]) ?? videoRef(post.media_uri)?.hash ?? parseBlobVideoRef(post.caption)?.hash ?? null;
}

/** Parse a JSON array of strings from storage; returns `null` when missing or invalid. */
export function readStringList(store: Pick<StorageLike, "getItem">, key: string): string[] | null {
  try {
    const raw = store.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : null;
  } catch {
    return null;
  }
}

export function readHiddenUsers(store: Pick<StorageLike, "getItem">): string[] {
  return readStringList(store, HIDDEN_USERS_KEY) ?? [];
}

export function setHiddenUser(store: StorageLike, pubkey: string, hide: boolean): string[] {
  const current = readHiddenUsers(store);
  if (!pubkey) return current;
  const next = hide ? [...current.filter((k) => k !== pubkey), pubkey] : current.filter((k) => k !== pubkey);
  store.setItem(HIDDEN_USERS_KEY, JSON.stringify(next));
  return next;
}

/** Curators whose blocklists are trusted. Absent key defaults to `[defaultCurator]`; explicit `[]` opts out. */
export function readTrustedCurators(store: Pick<StorageLike, "getItem">, defaultCurator = RADICA_MAINTAINER): string[] {
  const stored = readStringList(store, TRUSTED_BLOCKLISTS_KEY);
  return stored ?? [defaultCurator];
}

export function setTrustedCurator(store: StorageLike, pubkey: string, trust: boolean, defaultCurator = RADICA_MAINTAINER): string[] {
  const current = readTrustedCurators(store, defaultCurator);
  if (!pubkey) return current;
  const next = trust ? [...current.filter((k) => k !== pubkey), pubkey] : current.filter((k) => k !== pubkey);
  store.setItem(TRUSTED_BLOCKLISTS_KEY, JSON.stringify(next));
  return next;
}

/** Curators whose reports and blocks apply: trusted curators plus one-level global moderators when the maintainer is trusted. */
export function resolveModerationCurators(
  store: Pick<StorageLike, "getItem">,
  logs: Pick<ModerationLogSource, "modsOf">,
  defaultCurator = RADICA_MAINTAINER,
): string[] {
  const trusted = readTrustedCurators(store, defaultCurator);
  return trusted.includes(defaultCurator) ? [...new Set([...trusted, ...logs.modsOf(defaultCurator)])] : trusted;
}

export function isGlobalModerator(
  me: string | null | undefined,
  logs: Pick<ModerationLogSource, "modsOf">,
  defaultCurator = RADICA_MAINTAINER,
): boolean {
  return Boolean(me && (me === defaultCurator || logs.modsOf(defaultCurator).has(me)));
}

/** Build the combined Layer 2 visibility policy across local hides, trusted curators, global mods, and AI holds. */
export function buildModerationPolicy(opts: {
  me?: string | null;
  store: Pick<StorageLike, "getItem">;
  logs: ModerationLogSource;
  knownPosts?: Iterable<Post>;
  defaultCurator?: string;
}): ModerationPolicy {
  const me = opts.me || "";
  const defaultCurator = opts.defaultCurator ?? RADICA_MAINTAINER;
  const curators = new Set([...resolveModerationCurators(opts.store, opts.logs, defaultCurator), ...(me ? [me] : [])]);

  const hiddenAuthors = new Set(readHiddenUsers(opts.store));
  const reportedTargets = new Set<string>(opts.logs.aiHeldTargets());
  const reportedMedia = new Set<string>();
  const hiddenCommunities = new Map<string, string>();

  for (const c of curators) {
    for (const pk of opts.logs.blockedBy(c)) hiddenAuthors.add(pk);
    for (const k of opts.logs.reportedBy(c).keys()) reportedTargets.add(k);
    for (const h of opts.logs.reportedMediaBy(c)) reportedMedia.add(h);
    for (const [id, why] of opts.logs.hiddenCommunitiesBy(c)) hiddenCommunities.set(id, why);
  }

  if (opts.knownPosts) {
    for (const p of opts.knownPosts) {
      if (reportedTargets.has(`${p.author}:${p.id}`)) {
        const h = postMediaHash(p);
        if (h) reportedMedia.add(h);
      }
    }
  }

  const globalMod = isGlobalModerator(me, opts.logs, defaultCurator);
  const isAuthorHidden = (pubkey: string): boolean => (!me || pubkey !== me) && hiddenAuthors.has(pubkey);
  const isTargetReported = (target: string): boolean => reportedTargets.has(target);

  const isPostHidden = (
    post: Pick<Post, "id" | "author" | "media_uri" | "caption" | "community_id">,
    checkOpts?: { checkCommunity?: boolean },
  ): HiddenReason => {
    if (me && post.author === me) return null;
    if (hiddenAuthors.has(post.author)) return "author";
    if (checkOpts?.checkCommunity && post.community_id && hiddenCommunities.has(post.community_id)) return "community";
    if (reportedTargets.has(`${post.author}:${post.id}`)) return "reported";
    if (reportedMedia.size > 0) {
      const mh = postMediaHash(post);
      if (mh && reportedMedia.has(mh)) return "reported";
    }
    return null;
  };

  const isCommentHidden = (comment: Pick<Comment, "id" | "author">): boolean => {
    if (me && comment.author === me) return false;
    return hiddenAuthors.has(comment.author) || reportedTargets.has(`${comment.author}:${comment.id}`);
  };

  const isReleaseHidden = (owner: string, releaseId: string): boolean => {
    if (me && owner === me) return false;
    return hiddenAuthors.has(owner) || reportedTargets.has(`${owner}:${releaseId}`);
  };

  return {
    me,
    curators,
    hiddenAuthors,
    reportedTargets,
    reportedMedia,
    hiddenCommunities,
    globalMod,
    isAuthorHidden,
    isTargetReported,
    isPostHidden,
    isCommentHidden,
    isReleaseHidden,
  };
}

export function reportRecipients(opts: {
  defaultCurator?: string;
  globalMods: Iterable<string>;
  community?: Pick<Community, "creator" | "moderators">;
}): string[] {
  const defaultCurator = opts.defaultCurator ?? RADICA_MAINTAINER;
  const recipients = new Set<string>([defaultCurator, ...opts.globalMods]);
  if (opts.community) {
    recipients.add(opts.community.creator);
    for (const mod of opts.community.moderators) recipients.add(mod);
  }
  return [...recipients].filter(Boolean);
}

/** Publish a signed content report and notify global moderators (plus community creator/mods if applicable). */
export async function submitContentReport(opts: {
  author: string;
  targetId: string;
  reason: string;
  mediaHash?: string | null;
  community?: Pick<Community, "slug" | "creator" | "moderators">;
  reporterPubkey: string;
  authorDisplayName: string;
  logs: Pick<ModerationLogSource, "modsOf">;
  sink: ModerationActionSink;
  defaultCurator?: string;
}): Promise<{ recipients: string[] }> {
  const defaultCurator = opts.defaultCurator ?? RADICA_MAINTAINER;
  const trimmedReason = opts.reason.trim();
  await opts.sink.reportPost(opts.author, opts.targetId, trimmedReason, opts.mediaHash ?? null, !opts.community);

  const targetLabel = opts.author === opts.reporterPubkey ? "your" : `@${opts.authorDisplayName}'s`;
  const reasonSuffix = trimmedReason ? `: "${trimmedReason.slice(0, 80)}"` : "";
  const text = opts.community
    ? `reported ${targetLabel} post in r/${opts.community.slug}${reasonSuffix}`
    : `reported ${targetLabel} post${reasonSuffix}`;

  const recipients = reportRecipients({
    defaultCurator,
    globalMods: opts.logs.modsOf(defaultCurator),
    community: opts.community,
  });

  for (const recipient of recipients) {
    void opts.sink
      .addNotification(recipient, {
        type: "report",
        from: opts.reporterPubkey,
        text,
        linkPostId: opts.targetId,
        linkPostOwner: opts.author,
      })
      .catch(() => {});
  }

  return { recipients };
}
