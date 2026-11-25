// Stateful Feed Store managing Freenet feed contracts (`freenet_feed_<owner>`):
// throttled fetches, delta/state ingestion, worker-based light parsing, pending push/retry, and v3 feed migration.

import {
  commentMsg3,
  deleteMsg3,
  followingMsg3,
  formatCommentSignatureMessage,
  postMsg3,
  profileMsg4,
  verifySignature,
} from "./crypto.ts";
import { isCanonicalPost, lightFeedAsync, type LightFeed } from "./feedlight.ts";
import { overlayFeed } from "./feedmerge.ts";
import { shouldFetch, type Change } from "./refresh.ts";
import type { Comment, FeedState, Post, ProfileInfo, UserIdentity } from "./types.ts";

export { FEED_BUDGET, FEED_SHOW, FEED_TARGET, feedBytes, oldestToFree } from "./feedsize.ts";
export { GONE_MESSAGE, whyGone, type WhyGone } from "./postGone.ts";

export interface FeedStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FeedNetworkAdapter {
  getText(id: `feed:${string}`, urgent?: boolean): Promise<string | null>;
  push(id: `feed:${string}`, value: unknown): Promise<void>;
  liveAge(id: `feed:${string}`): number | null;
  liveIds(): string[];
}

export interface FeedStoreDeps {
  storage: FeedStorageLike;
  net: FeedNetworkAdapter;
  isConnected: () => boolean;
  me: () => string;
  onPeerProfile: (owner: string, profile: ProfileInfo) => void;
  onChanged: () => void;
  yieldToMain?: () => Promise<void>;
  lightFeed?: (raw: string, delta?: string) => Promise<LightFeed>;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => void;
}

const FEED_KEY_PREFIX = "freenet_feed_";
const V4_MIGRATION_PREFIX = "radica_feed_v4_";
const PROFILE_FALLBACK_PREFIX = "radica_profile_";

const defaultYieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

export class FeedStore {
  public feedsPaused = false;

  private readonly deps: FeedStoreDeps;
  private readonly yieldToMain: () => Promise<void>;
  private readonly lightFeed: (raw: string, delta?: string) => Promise<LightFeed>;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => void;

  private lastRefresh = new Map<string, number>();
  private pending = new Map<string, FeedState[]>();
  private feedCache = new Map<string, { raw: string; feed: FeedState }>();
  private peerPostsCache = new Map<string, { raw: string; posts: Post[] }>();
  private peerFollowing = new Map<string, string[]>();
  private postTotals = new Map<string, number>();

  constructor(deps: FeedStoreDeps) {
    this.deps = deps;
    this.yieldToMain = deps.yieldToMain ?? defaultYieldToMain;
    this.lightFeed = deps.lightFeed ?? lightFeedAsync;
    this.now = deps.now ?? (() => Date.now());
    this.schedule = deps.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
  }

  public lastRefreshOf(owner: string): number {
    return this.lastRefresh.get(owner) ?? 0;
  }

  public hostedFeeds(): number {
    return this.deps.net.liveIds().filter((id) => id.startsWith("feed:")).length;
  }

  public knownPostCount(): number {
    let n = 0;
    for (const v of this.postTotals.values()) n += v;
    return n;
  }

  public followingOf(pubkey: string): string[] {
    return this.peerFollowing.get(pubkey) ?? [];
  }

  public followersOf(pubkey: string): string[] {
    return [...this.peerFollowing].filter(([k, f]) => k !== pubkey && f.includes(pubkey)).map(([k]) => k);
  }

  /** Fetch a feed from the network into local storage, throttled unless `force` or unsent local deltas exist. */
  public async refresh(owner: string, force = false, urgent = false): Promise<void> {
    if (!this.deps.isConnected()) return;
    if (this.feedsPaused && !force && !urgent) return;
    const me = this.deps.me();
    const now = this.now();
    const last = this.lastRefresh.get(owner) ?? 0;
    const unsent = (this.pending.get(owner)?.length ?? 0) > 0;
    if (!shouldFetch({ force, sinceLast: now - last, liveAge: this.deps.net.liveAge(`feed:${owner}`), unsent })) return;
    this.lastRefresh.set(owner, now);
    try {
      await this.pushPending(owner);
      const text = await this.deps.net.getText(`feed:${owner}`, urgent || owner === me);
      if (text !== null) await this.takeFeed(owner, text);
    } catch (e) {
      console.warn("[Freenet] Could not fetch feed", owner, e);
    }
  }

  /** Apply a pushed state or delta notification from the node, falling back to full refresh on error. */
  public async applyChange(owner: string, c: Change): Promise<void> {
    if (owner !== this.deps.me() && !this.pending.get(owner)?.length) {
      try {
        const stored = this.deps.storage.getItem(`${FEED_KEY_PREFIX}${owner}`);
        const light = c.state ? undefined : c.delta && stored ? await this.lightFeed(stored, c.delta) : null;
        const text = c.state ?? light?.text;
        if (text !== undefined) {
          this.lastRefresh.set(owner, this.now());
          return await this.takeFeed(owner, text, light ?? undefined);
        }
      } catch (e) {
        console.warn("[Freenet] Could not apply the change of feed", owner, e);
      }
    }
    return this.refresh(owner, true);
  }

  /** Store a feed's text, overlay unsent deltas/deletions, update caches/names, and notify listeners on change. */
  public async takeFeed(owner: string, text: string, light?: LightFeed): Promise<void> {
    await this.yieldToMain();
    const me = this.deps.me();
    const pend = this.pending.get(owner) ?? [];
    let json = text;
    let profile: ProfileInfo | undefined;
    if (pend.length || owner === me) {
      const feed: FeedState = JSON.parse(text);
      for (const d of pend) overlayFeed(feed, d);
      if (owner === me) this.requeueLostDeletions(feed);
      this.postTotals.set(owner, Object.keys(feed.posts ?? {}).length);
      json = JSON.stringify(feed);
      this.feedCache.set(`${FEED_KEY_PREFIX}${owner}`, { raw: json, feed });
      profile = feed.profile;
    } else {
      const l = light ?? (await this.lightFeed(text));
      this.peerPostsCache.set(owner, { raw: text, posts: l.posts });
      this.peerFollowing.set(owner, l.following ?? []);
      this.postTotals.set(owner, l.total ?? l.posts.length);
      profile = l.profile;
    }
    const key = `${FEED_KEY_PREFIX}${owner}`;
    const same = this.deps.storage.getItem(key) === json;
    if (!same) this.deps.storage.setItem(key, json);
    if (profile) this.deps.onPeerProfile(owner, profile);
    if (!same) this.deps.onChanged();
  }

  /** Re-queue deletions kept locally that are missing on the network so deleted posts do not resurrect. */
  public requeueLostDeletions(feed: FeedState): void {
    const key = `${FEED_KEY_PREFIX}${feed.owner}`;
    const raw = this.deps.storage.getItem(key);
    if (!raw) return;
    const hit = this.feedCache.get(key);
    let local: FeedState;
    try {
      local = hit?.raw === raw ? hit.feed : JSON.parse(raw);
    } catch {
      return;
    }
    const lost = Object.entries(local.deleted ?? {}).filter(([id]) => !feed.deleted?.[id]);
    if (!lost.length) return;
    const d: FeedState = { owner: feed.owner, posts: {}, following: [], deleted: Object.fromEntries(lost) };
    overlayFeed(feed, d);
    this.pending.set(feed.owner, [...(this.pending.get(feed.owner) ?? []), d]);
    this.lastRefresh.delete(feed.owner);
    this.schedule(() => void this.refresh(feed.owner, true), 0);
  }

  /** Load parsed feed for `ownerPubkey`, keeping `posts` reference stable for `sizedPosts` checks while isolating `following`. */
  public async getFeed(ownerPubkey: string): Promise<FeedState> {
    const key = `${FEED_KEY_PREFIX}${ownerPubkey}`;
    const raw = this.deps.storage.getItem(key);
    if (raw) {
      try {
        let parsed: FeedState;
        const hit = this.feedCache.get(key);
        if (hit?.raw === raw) {
          parsed = hit.feed;
        } else {
          parsed = JSON.parse(raw);
          if (ownerPubkey !== this.deps.me()) {
            for (const [id, p] of Object.entries(parsed.posts ?? {})) {
              if (!isCanonicalPost(p)) delete parsed.posts[id];
            }
          }
          this.feedCache.set(key, { raw, feed: parsed });
          this.postTotals.set(ownerPubkey, Object.keys(parsed.posts ?? {}).length);
        }
        const out: FeedState = { ...parsed, following: [...(parsed.following ?? [])] };
        if (!out.profile) {
          const profRaw = this.deps.storage.getItem(`${PROFILE_FALLBACK_PREFIX}${ownerPubkey}`);
          if (profRaw) {
            try {
              out.profile = JSON.parse(profRaw);
            } catch {}
          }
        }
        void this.refresh(ownerPubkey);
        return out;
      } catch {}
    }
    void this.refresh(ownerPubkey);
    return {
      owner: ownerPubkey,
      posts: {},
      following: [],
    };
  }

  /** Newest posts of another person's stored feed, parsed off the main thread when available. */
  public async peerPosts(pubkey: string): Promise<Post[]> {
    const raw = this.deps.storage.getItem(`${FEED_KEY_PREFIX}${pubkey}`);
    void this.refresh(pubkey);
    if (!raw) return [];
    const hit = this.peerPostsCache.get(pubkey);
    if (hit?.raw === raw) return hit.posts;
    const { posts, total, following } = await this.lightFeed(raw);
    this.peerPostsCache.set(pubkey, { raw, posts });
    this.peerFollowing.set(pubkey, following ?? []);
    this.postTotals.set(pubkey, total ?? posts.length);
    return posts;
  }

  /** Save `feed` locally and enqueue `delta` to push in background. */
  public async saveFeed(feed: FeedState, delta: FeedState = feed): Promise<void> {
    const key = `${FEED_KEY_PREFIX}${feed.owner}`;
    feed.posts = { ...feed.posts }; // new ref triggers UI `sizedPosts` check without re-parsing JSON in getFeed
    const raw = JSON.stringify(feed);
    this.deps.storage.setItem(key, raw);
    this.feedCache.set(key, { raw, feed });
    this.postTotals.set(feed.owner, Object.keys(feed.posts).length);
    if (!this.deps.isConnected()) return;
    this.pending.set(feed.owner, [...(this.pending.get(feed.owner) ?? []), delta]);
    void this.refresh(feed.owner, true);
  }

  private async pushPending(owner: string): Promise<void> {
    for (const d of this.pending.get(owner) ?? []) {
      try {
        await this.deps.net.push(`feed:${owner}`, d);
        this.pending.set(owner, (this.pending.get(owner) ?? []).filter((x) => x !== d));
      } catch (e) {
        console.warn("[Freenet] The network did not accept a change to feed", owner, e);
      }
    }
  }

  /** Sync own feed: on a fresh browser fetch from network first before migrating or updating `enc_pub`. */
  public async syncOwnFeed(identity: UserIdentity, opts?: { onAfterInitialFetch?: () => void }): Promise<void> {
    const feedKey = `${FEED_KEY_PREFIX}${identity.pubkey}`;
    if (!this.deps.storage.getItem(feedKey)) {
      await this.refresh(identity.pubkey, true, true);
    }
    opts?.onAfterInitialFetch?.();
    if (!this.deps.storage.getItem(feedKey)) return;
    await this.migrateOwnFeed(identity);
    const feed = await this.getFeed(identity.pubkey);
    let encPubChanged = false;
    if (feed.profile && feed.profile.enc_pub !== identity.encPub) {
      const pr = { ...feed.profile, enc_pub: identity.encPub, cert: identity.cert, updated_at: this.now(), v: 3 };
      pr.sig = await identity.sign(profileMsg4(identity.pubkey, pr));
      feed.profile = pr;
      encPubChanged = true;
    }
    const hasContent = Boolean(feed.profile) || Object.keys(feed.posts ?? {}).length > 0 || (feed.following?.length ?? 0) > 0;
    if (encPubChanged || hasContent) {
      await this.saveFeed(feed);
    }
  }

  /** One-time re-sign of own feed into length-prefixed v3 format. */
  public async migrateOwnFeed(identity: UserIdentity): Promise<void> {
    const marker = `${V4_MIGRATION_PREFIX}${identity.pubkey}`;
    if (this.deps.storage.getItem(marker)) return;
    const me = identity.pubkey;
    const feed = await this.getFeed(me);
    const posts: Record<string, Post> = {};
    for (const p of Object.values(feed.posts)) {
      if (p.author !== me) continue;
      const comments: Record<string, Comment> = {};
      for (const c of Object.values(p.comments || {})) {
        const msg = c.v === 3 ? commentMsg3(me, c) : formatCommentSignatureMessage(c.id, c.post_id, c.author, c.text, c.timestamp);
        if (c.post_id === p.id && (await verifySignature(msg, c.sig, c.author))) comments[`${c.author}:${c.id}`] = c;
      }
      const post: Post = { ...p, is_nsfw: !!p.is_nsfw, comments, likes: Array.isArray(p.likes) ? {} : p.likes || {} };
      post.cert = identity.cert;
      post.v = 3;
      post.sig = await identity.sign(postMsg3(post));
      posts[p.id] = post;
    }
    feed.posts = posts;
    const now = this.now();
    if (feed.profile) {
      const pr = { ...feed.profile };
      pr.enc_pub = identity.encPub;
      pr.cert = identity.cert;
      pr.updated_at = now;
      pr.v = 3;
      pr.sig = await identity.sign(profileMsg4(me, pr));
      feed.profile = pr;
    }
    if (feed.following.length) {
      feed.following_updated_at = now;
      feed.following_cert = identity.cert;
      feed.following_v = 3;
      feed.following_sig = await identity.sign(followingMsg3(me, feed.following_updated_at, feed.following));
    }
    const deleted: FeedState["deleted"] = {};
    for (const id of Object.keys(feed.deleted || {})) {
      deleted[id] = { sig: await identity.sign(deleteMsg3(me, id)), cert: identity.cert, v: 3 };
    }
    feed.deleted = deleted;
    this.deps.storage.setItem(`${FEED_KEY_PREFIX}${me}`, JSON.stringify(feed));
    this.deps.storage.setItem(marker, "1");
  }
}
