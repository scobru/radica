// Freetree integration (github.com/scobru/freetree) for Radica.
// Decentralized Linktree on Freenet & Delta.
// Renders rich Freetree cards for shared links in posts and chat,
// and shows a persona's Freetree hub on their Radica profile.

import { escapeHtml as esc } from "./html.ts";
import { defaultNodeOrigin } from "./orto.ts";

/** Published Freetree web container contract key on Freenet. */
export const FREETREE_SITE = "4SC5QCzLzKWH9BSFFybivTynfBRkPw3PtXwegjXbPm8x";
export const FREETREE_REPO = "https://github.com/scobru/freetree";
export const FREETREE_PATH = `/v1/contract/web/${FREETREE_SITE}/`;

/** URL pointing to the Freetree web contract on Freenet. */
const FREETREE_URL_RE = new RegExp(
  `(?:freenet:|(?:https?:\\/\\/[^/\\s]+)?\\/v[12]\\/contract\\/web\\/)${FREETREE_SITE}\\/?(?:#\\/?([a-zA-Z0-9_-]+))?`,
  "i"
);

/** Prefixed link: freetree:<prefix>, #freetree/<prefix>, #freetree=<prefix> */
const PREFIXED_FREETREE_RE = /(?:freetree:|#\/?freetree\/|#\/?freetree=)([a-zA-Z0-9_-]+)/i;

export interface FreetreeRef {
  prefix?: string;
  isSite?: boolean;
  rawUrl?: string;
}

/** Parse a user's Freetree input (e.g. from Edit Profile): handle, hash, or link. */
export function parseFreetreeInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const urlMatch = FREETREE_URL_RE.exec(trimmed);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  const prefMatch = PREFIXED_FREETREE_RE.exec(trimmed);
  if (prefMatch && prefMatch[1]) return prefMatch[1];
  const cleaned = trimmed.replace(/^#\/?/, "").replace(/^[a-zA-Z0-9_-]+:\/\//, "");
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(cleaned)) return cleaned;
  return null;
}

/** Detect a Freetree link inside caption text. */
export function freetreeLink(caption: string): FreetreeRef | null {
  if (!caption) return null;

  const pref = PREFIXED_FREETREE_RE.exec(caption);
  if (pref) {
    return { prefix: pref[1] };
  }

  const urlMatch = FREETREE_URL_RE.exec(caption);
  if (urlMatch) {
    return {
      isSite: true,
      prefix: urlMatch[1] || undefined,
      rawUrl: urlMatch[0],
    };
  }

  return null;
}

/** Get the link to open a Freetree hub on Freenet web gateway. */
export function freetreeHref(origin = defaultNodeOrigin(), prefix?: string): string {
  if (prefix) {
    return `${origin}/v1/contract/web/${FREETREE_SITE}/#${encodeURIComponent(prefix)}`;
  }
  return `${origin}/v1/contract/web/${FREETREE_SITE}/#/`;
}

/** Render a Freetree card in feed and chat. */
export function freetreeCard(caption: string, origin = defaultNodeOrigin()): string {
  const ref = freetreeLink(caption);
  if (!ref) return "";

  const href = freetreeHref(origin, ref.prefix);
  const displayTitle = ref.prefix ? `@${ref.prefix} on Freetree` : "Freetree — Decentralized Linktree";

  return (
    `<div class="freetree-card blog-post-card"` + (ref.prefix ? ` data-freetree-prefix="${esc(ref.prefix)}"` : "") + `>` +
    `<div class="blog-embed-card">` +
    `<div class="blog-embed-head">` +
    `<span class="blog-badge freetree-badge">&#x1F332; Freetree Hub</span>` +
    `<span class="blog-embed-sitename">${ref.prefix ? `@${esc(ref.prefix)}` : "Freenet &amp; Delta"}</span>` +
    `</div>` +
    `<a class="blog-embed-title" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(displayTitle)}</a>` +
    `<p class="blog-embed-excerpt">Turns Delta link lists and freesites into fast, elegant, responsive Linktree profiles on Freenet.</p>` +
    `<div class="blog-embed-footer">` +
    `<a class="blog-embed-read" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open on Freetree \u2197</a>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

/** Render a user's Freetree Hub link on their Radica profile. */
export function freetreeProfileCard(
  _ownerLabel: string,
  prefix: string,
  origin = defaultNodeOrigin()
): string {
  const href = freetreeHref(origin, prefix);
  return (
    `<div class="blog-card freetree-profile-card">` +
    `<div class="blog-card-head">` +
    `<span class="link-card-icon" aria-hidden="true">&#x1F332;</span>` +
    `<span class="link-card-text">` +
    `<span class="link-card-host">Hub on Freetree</span>` +
    `<span class="link-card-title">${esc(prefix)}</span>` +
    `<span class="blog-card-desc">Decentralized link profile on Freenet &amp; Delta</span>` +
    `</span>` +
    `<div class="blog-card-actions">` +
    `<a class="blog-card-open" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="Open on Freetree" aria-label="Open on Freetree">\u2197</a>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

