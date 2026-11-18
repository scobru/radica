// Freetree integration (github.com/scobru/freetree) for Radica.
// Decentralized Linktree on Freenet (Viso sign-in, Markdown links).
// Renders rich Freetree cards for shared links in posts and chat,
// and shows a persona's Freetree hub on their Radica profile.

import { escapeHtml as esc } from "./html.ts";
import { defaultNodeOrigin } from "./orto.ts";

/** Published Freetree web container contract key on Freenet. */
export const FREETREE_SITE = "4SC5QCzLzKWH9BSFFybivTynfBRkPw3PtXwegjXbPm8x";
export const FREETREE_REPO = "https://github.com/scobru/freetree";
export const FREETREE_PATH = `/v1/contract/web/${FREETREE_SITE}/`;

/** Freetree hash: a tree kept on Freenet (`u=<persona key, 64 hex>`, the short link Freetree's Export gives once the
 *  tree is saved), a portable tree (`data=<url-encoded base64 JSON>`) or a plain handle. */
const HASH_REF = "u=[0-9a-f]{64}|data=[A-Za-z0-9%._~-]+|[a-zA-Z0-9_-]+";
const MAX_DATA_REF = 16384;

/** URL pointing to the Freetree web contract on Freenet. */
const FREETREE_URL_RE = new RegExp(
  `(?:freenet:|(?:https?:\\/\\/[^/\\s]+)?\\/v[12]\\/contract\\/web\\/)${FREETREE_SITE}\\/?(?:#\\/?(${HASH_REF}))?`,
  "i"
);

/** Prefixed link: freetree:<prefix>, #freetree/<prefix>, #freetree=<prefix> */
const PREFIXED_FREETREE_RE = new RegExp(`(?:freetree:|#\\/?freetree\\/|#\\/?freetree=)(${HASH_REF})`, "i");

export interface FreetreeRef {
  prefix?: string;
  isSite?: boolean;
  rawUrl?: string;
}

/** `u=<key>` keys are hex: one spelling, so the same persona is one ref. */
const canon = (ref: string): string => (/^u=/i.test(ref) ? ref.toLowerCase() : ref);
const isUserRef = (ref: string): boolean => /^u=[0-9a-f]{64}$/.test(ref);
/** Refs whose hash is already URL-safe: not encoded again in a link. */
const isRawRef = (ref: string): boolean => /^(data|u)=/.test(ref);

let nameOf: (personaHex: string) => string = () => "";
/** How to name a persona key: Radica's display name for it (set once by main.ts). */
export function setFreetreeNames(fn: (personaHex: string) => string): void {
  nameOf = fn;
}

/** Parse a user's Freetree input (e.g. from Edit Profile): handle, hash, or link. */
export function parseFreetreeInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const urlMatch = FREETREE_URL_RE.exec(trimmed);
  if (urlMatch && urlMatch[1]) return canon(urlMatch[1]);
  const prefMatch = PREFIXED_FREETREE_RE.exec(trimmed);
  if (prefMatch && prefMatch[1]) return canon(prefMatch[1]);
  const cleaned = trimmed.replace(/^#\/?/, "").replace(/^[a-zA-Z0-9_-]+:\/\//, "");
  if (/^[0-9a-f]{64}$/i.test(cleaned)) return canon(`u=${cleaned}`); // a persona key on its own
  if (/^u=[0-9a-f]{64}$/i.test(cleaned)) return canon(cleaned);
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(cleaned)) return cleaned;
  if (cleaned.length <= MAX_DATA_REF && /^data=[A-Za-z0-9%._~-]+$/.test(cleaned)) return cleaned;
  return null;
}

/** Name of a portable tree ref (`data=…`, as written by Freetree's Export), or null. */
export function freetreeDataName(prefix: string): string | null {
  const m = /^data=(.+)$/.exec(prefix);
  if (!m || prefix.length > MAX_DATA_REF) return null;
  try {
    const bin = atob(decodeURIComponent(m[1]));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const n = (JSON.parse(json) as { n?: unknown }).n;
    return typeof n === "string" && n.trim() ? n.trim().slice(0, 64) : null;
  } catch {
    return null;
  }
}

/** Label for a ref: the persona's name for `u=…`, the tree's name for `data=…`, else the handle. */
function refLabel(prefix: string): string {
  if (isUserRef(prefix)) return nameOf(prefix.slice(2)) || `@${prefix.slice(2, 10)}…`;
  if (!prefix.startsWith("data=")) return prefix;
  return freetreeDataName(prefix) ?? "Linktree";
}

/** Detect a Freetree link inside caption text. */
export function freetreeLink(caption: string): FreetreeRef | null {
  if (!caption) return null;

  const pref = PREFIXED_FREETREE_RE.exec(caption);
  if (pref) {
    return { prefix: canon(pref[1]) };
  }

  const urlMatch = FREETREE_URL_RE.exec(caption);
  if (urlMatch) {
    return {
      isSite: true,
      prefix: urlMatch[1] ? canon(urlMatch[1]) : undefined,
      rawUrl: urlMatch[0],
    };
  }

  return null;
}

/** Get the link to open a Freetree hub on Freenet web gateway. */
export function freetreeHref(origin = defaultNodeOrigin(), prefix?: string): string {
  if (prefix) {
    // `data=…` is already URL-encoded by Freetree, `u=…` is plain hex: encoding again would break them.
    const hash = isRawRef(prefix) ? prefix : encodeURIComponent(prefix);
    return `${origin}/v1/contract/web/${FREETREE_SITE}/#${hash}`;
  }
  return `${origin}/v1/contract/web/${FREETREE_SITE}/#/`;
}

/** Render a Freetree card in feed and chat. */
export function freetreeCard(caption: string, origin = defaultNodeOrigin()): string {
  const ref = freetreeLink(caption);
  if (!ref) return "";

  const href = freetreeHref(origin, ref.prefix);
  const displayTitle = ref.prefix
    ? isRawRef(ref.prefix) ? `${refLabel(ref.prefix)} on Freetree` : `@${ref.prefix} on Freetree`
    : "Freetree — Decentralized Linktree";

  return (
    `<div class="freetree-card blog-post-card"` + (ref.prefix && !isRawRef(ref.prefix) ? ` data-freetree-prefix="${esc(ref.prefix)}"` : "") + `>` +
    `<div class="blog-embed-card">` +
    `<div class="blog-embed-head">` +
    `<span class="blog-badge freetree-badge">&#x1F332; Freetree Hub</span>` +
    `<span class="blog-embed-sitename">${ref.prefix ? (isRawRef(ref.prefix) ? esc(refLabel(ref.prefix)) : `@${esc(ref.prefix)}`) : "Freenet"}</span>` +
    `</div>` +
    `<a class="blog-embed-title" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(displayTitle)}</a>` +
    `<p class="blog-embed-excerpt">Your links in Markdown, as a fast, elegant Linktree profile on Freenet.</p>` +
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
    `<span class="link-card-title">${esc(refLabel(prefix))}</span>` +
    `<span class="blog-card-desc">Decentralized link profile on Freenet</span>` +
    `</span>` +
    `<div class="blog-card-actions">` +
    `<a class="blog-card-open" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="Open on Freetree" aria-label="Open on Freetree">\u2197</a>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

