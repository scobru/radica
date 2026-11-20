import type { FeedState } from "./types.ts";

/** Apply `d` (a change the network has not accepted yet) on top of `f`, with the feed contract's merge rules. */
export function overlayFeed(f: FeedState, d: FeedState): FeedState {
  // ponytail: inline (ts, sig) tuple tie-break matching contract/src/lib.rs
  const newer = (tsA = 0, sigA = "", tsB = 0, sigB = "") => tsA > tsB || (tsA === tsB && sigA > sigB);
  if (d.profile && (!f.profile || newer(d.profile.updated_at, d.profile.sig, f.profile.updated_at, f.profile.sig))) f.profile = d.profile;
  if (newer(d.following_updated_at, d.following_sig, f.following_updated_at, f.following_sig)) {
    f.following = d.following;
    f.following_updated_at = d.following_updated_at;
    f.following_sig = d.following_sig;
    f.following_cert = d.following_cert;
    f.following_v = d.following_v;
  }
  for (const [id, del] of Object.entries(d.deleted ?? {})) {
    delete f.posts[id];
    if (!f.deleted?.[id] || del.sig > f.deleted[id].sig) f.deleted = { ...f.deleted, [id]: del };
  }
  for (const [id, p] of Object.entries(d.posts)) {
    if (f.deleted?.[id]) continue;
    const cur = (f.posts[id] ??= { ...p, likes: {}, comments: {} });
    cur.comments = { ...cur.comments };
    for (const [k, c] of Object.entries(p.comments ?? {})) if (!cur.comments[k] || c.sig > cur.comments[k].sig) cur.comments[k] = c;
    cur.likes = { ...cur.likes };
    for (const [k, l] of Object.entries(p.likes ?? {})) if (!cur.likes[k] || newer(l.ts, l.sig, cur.likes[k].ts, cur.likes[k].sig)) cur.likes[k] = l;
  }
  return f;
}
