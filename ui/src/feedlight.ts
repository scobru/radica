import type { Post, ProfileInfo } from "./types.ts";
import { overlayFeed } from "./feedmerge.ts";

/** Posts kept per other person when drawing the timeline: it is paged 20 at a time, so older ones are never on the first screens. */
export const PEER_POSTS = 60;

/** What the page needs of another person's feed: their newest posts and their profile; `text`: the feed with a delta applied. */
export type LightFeed = { posts: Post[]; profile?: ProfileInfo; text?: string; total?: number; following?: string[] };

/** The stored feed `raw` with `delta` (from a change notification) applied, as JSON text. */
export function mergeFeedText(raw: string, delta: string): string {
  return JSON.stringify(overlayFeed(JSON.parse(raw), JSON.parse(delta)));
}

/** `lightFeed` of `raw`, or of `raw` with `delta` applied (then `text` is the merged feed). Throws on unreadable JSON. */
export function lightFeedOf(raw: string, delta?: string): LightFeed {
  if (delta === undefined) return lightFeed(raw);
  const text = mergeFeedText(raw, delta);
  return { ...lightFeed(text), text };
}

/** False for a post whose fields could have been re-split by whoever relayed it. The signed message joins the fields with ":"
 *  (contract `post_msg`), so text can move across a boundary and keep the signature valid. The fields between the free-text ones
 *  (caption, location) only take forms that cannot absorb such text. Self-contained: it is also copied into the worker below.
 *  shortcut: client-side only, a contract v2 with length-prefixed signatures removes the cause. */
export function isCanonicalPost(p: Post): boolean {
  const media = (p.media_uri ?? "").split(" ").filter(Boolean);
  return (
    (p.category === "thought" || p.category === "moment" || p.category === "event") &&
    media.every((u) => /^(radica-media:[0-9a-f]{64}|https?:\/\/\S+|data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+)$/.test(u)) &&
    (!p.community_id || /^[A-Za-z0-9_-]{1,100}$/.test(p.community_id)) &&
    (!p.event_date || /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(p.event_date))
  );
}

/** The newest `n` posts, the profile and whom the owner follows, of a stored feed. Parsing a big feed is what blocks the page, so this runs in a worker. */
export function lightFeed(raw: string, n = PEER_POSTS): LightFeed {
  const feed = JSON.parse(raw);
  const all = Object.values<Post>(feed.posts ?? {}).filter(isCanonicalPost);
  const posts = all.sort((a, b) => b.timestamp - a.timestamp).slice(0, n);
  const following = Array.isArray(feed.following) ? feed.following.filter((k: unknown) => typeof k === "string") : [];
  return { posts, profile: feed.profile ?? undefined, total: all.length, following };
}

let worker: Worker | undefined;
let workerUrl: string | undefined;
let bootTimer: ReturnType<typeof setTimeout> | undefined;
let broken = false;
let answered = false;
let seq = 0;
const waiting = new Map<number, { raw: string; delta?: string; resolve: (f: LightFeed) => void }>();

// Self-contained worker script loaded from a blob: URL so it runs inside Freenet's opaque-origin (null) sandboxed iframe
// where HTTP worker URLs throw SecurityError.
const WORKER_SRC = `
const PEER_POSTS = ${PEER_POSTS};
const isCanonicalPost = ${isCanonicalPost.toString()};
function overlayFeed(f, d) {
  const newer = (tsA = 0, sigA = "", tsB = 0, sigB = "") => tsA > tsB || (tsA === tsB && sigA > sigB);
  if (d.profile && (!f.profile || newer(d.profile.updated_at, d.profile.sig, f.profile.updated_at, f.profile.sig))) f.profile = d.profile;
  if (newer(d.following_updated_at, d.following_sig, f.following_updated_at, f.following_sig)) {
    f.following = d.following;
    f.following_updated_at = d.following_updated_at;
    f.following_sig = d.following_sig;
    f.following_cert = d.following_cert;
  }
  for (const [id, del] of Object.entries(d.deleted ?? {})) {
    delete f.posts[id];
    if (!f.deleted?.[id] || del.sig > f.deleted[id].sig) f.deleted = { ...f.deleted, [id]: del };
  }
  for (const [id, p] of Object.entries(d.posts ?? {})) {
    if (f.deleted?.[id]) continue;
    const cur = (f.posts[id] ??= { ...p, likes: {}, comments: {} });
    cur.comments = { ...cur.comments };
    for (const [k, c] of Object.entries(p.comments ?? {})) if (!cur.comments[k] || c.sig > cur.comments[k].sig) cur.comments[k] = c;
    cur.likes = { ...cur.likes };
    for (const [k, l] of Object.entries(p.likes ?? {})) if (!cur.likes[k] || newer(l.ts, l.sig, cur.likes[k].ts, cur.likes[k].sig)) cur.likes[k] = l;
  }
  return f;
}
function lightFeed(raw, n = PEER_POSTS) {
  const feed = JSON.parse(raw);
  const all = Object.values(feed.posts ?? {}).filter(isCanonicalPost);
  const posts = all.sort((a, b) => b.timestamp - a.timestamp).slice(0, n);
  const following = Array.isArray(feed.following) ? feed.following.filter((k) => typeof k === "string") : [];
  return { posts, profile: feed.profile ?? undefined, total: all.length, following };
}
self.onmessage = (e) => {
  let feed = { posts: [] };
  try {
    const { raw, delta } = e.data;
    if (delta === undefined) feed = lightFeed(raw);
    else {
      const text = JSON.stringify(overlayFeed(JSON.parse(raw), JSON.parse(delta)));
      feed = { ...lightFeed(text), text };
    }
  } catch {}
  self.postMessage({ id: e.data.id, feed });
};
`;

const parseInline = (raw: string, delta?: string): LightFeed => {
  try {
    return lightFeedOf(raw, delta);
  } catch {
    return { posts: [] };
  }
};

/** The worker could not load or run (Safari in Freenet's sandboxed page): parse here from now on, the waiting ones too. */
function giveUpWorker() {
  broken = true;
  clearTimeout(bootTimer);
  bootTimer = undefined;
  worker?.terminate();
  if (workerUrl) {
    URL.revokeObjectURL(workerUrl);
    workerUrl = undefined;
  }
  for (const w of waiting.values()) w.resolve(parseInline(w.raw, w.delta));
  waiting.clear();
}

/** Same as `lightFeedOf`, off the main thread; inline where there is no working Worker (tests, some browsers). Unreadable: no posts, no `text`. */
export function lightFeedAsync(raw: string, delta?: string): Promise<LightFeed> {
  if (broken || typeof Worker === "undefined") return Promise.resolve(parseInline(raw, delta));
  try {
    if (!worker) {
      workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      worker = Object.assign(new Worker(workerUrl), {
        onmessage: (e: MessageEvent<{ id: number; feed: LightFeed }>) => {
          if (!answered) {
            answered = true;
            clearTimeout(bootTimer);
            bootTimer = undefined;
          }
          waiting.get(e.data.id)?.resolve(e.data.feed);
          waiting.delete(e.data.id);
        },
        onerror: giveUpWorker, // otherwise a worker that never loads leaves every other person's feed unread
        onmessageerror: giveUpWorker,
      });
      bootTimer = setTimeout(() => answered || giveUpWorker(), 20000); // nor an error event: a worker silent from the start
    }
  } catch {
    broken = true;
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl);
      workerUrl = undefined;
    }
    return Promise.resolve(parseInline(raw, delta));
  }
  return new Promise((resolve) => {
    const id = ++seq;
    waiting.set(id, { raw, delta, resolve });
    worker!.postMessage({ id, raw, delta });
  });
}
