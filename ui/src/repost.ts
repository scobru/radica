// Reposts. A repost is an ordinary post whose caption carries the permalink of the post it shares: the caption is
// signed, so the feed contract needs no new field (a new contract.wasm would move every feed to a new key). The
// reader's app draws the shared post under the reposter's own words; an older app shows the link.
import { escapeHtml as esc } from "./html.ts";

export interface RepostRef {
  id: string;
  author: string; // hex pubkey: whose feed holds the shared post
}

// "...#post=<id>&author=<64 hex>", whatever comes before it (a node's address, or just the app path)
const LINK_RE = /(?:^|(?<=\s))\S*#post=([\w-]{1,100})&author=([0-9a-f]{64})(?![0-9a-f])/;

/** The post a caption shares (its first permalink), or null. */
export function repostRef(caption: string): RepostRef | null {
  const m = LINK_RE.exec(caption ?? "");
  return m ? { id: m[1], author: m[2] } : null;
}

/** A repost's own words: the caption without the permalink (empty for a plain repost). */
export const repostText = (caption: string): string => caption.replace(LINK_RE, "").replace(/[ \t]+\n/g, "\n").trim();

/**
 * The permalink a repost carries. Relative to the node (`appPath` is the page's own path), so the reposter's node
 * address is not published and every reader opens it on their own node.
 */
export const repostLink = (appPath: string, ref: RepostRef): string => `${appPath}#post=${ref.id}&author=${ref.author}`;

/** The caption of a repost: the reposter's words (if any), then the permalink. */
export const repostCaption = (text: string, link: string): string => [text.trim(), link].filter(Boolean).join("\n\n");

/** The shared post's place in a card, filled in by the page once the post is found (see repostBody). */
export function repostCard(caption: string): string {
  const ref = repostRef(caption);
  if (!ref) return "";
  return `<div class="repost-card" data-repost-id="${esc(ref.id)}" data-repost-author="${esc(ref.author)}" role="button" tabindex="0" title="Open the original post"><p class="repost-note">Loading the original post…</p></div>`;
}

export interface RepostView {
  name: string;
  avatar: string; // an image URL, already safe to put in src
  time: string;
  textHtml: string; // the caption, already rendered
  mediaHtml: string; // the first picture, already rendered ("" for none)
}

/** What a repost card shows: the shared post, or a line saying why it is not shown. */
export const repostBody = (v: RepostView | string): string =>
  typeof v === "string"
    ? `<p class="repost-note">${esc(v)}</p>`
    : `<div class="repost-head"><img class="repost-avatar" src="${v.avatar}" alt="" loading="lazy" decoding="async" /><span class="repost-name">${esc(v.name)}</span><span class="repost-time">${esc(v.time)}</span></div>` +
      (v.textHtml ? `<div class="repost-text">${v.textHtml}</div>` : "") +
      (v.mediaHtml ? `<div class="repost-media">${v.mediaHtml}</div>` : "");
