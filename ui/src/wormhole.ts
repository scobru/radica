// FreeHole integration (github.com/scobru/freehole) for Radica.
// Sovereign Freenet chunk file transfers (formerly Wormhole).
// Detects mnemonic sync codes (e.g. 82-gentle-bird, wh:82-gentle-bird, fh:82-gentle-bird) and FreeHole web links,
// rendering rich transfer cards in feed posts and chat.

import { escapeHtml as esc } from "./html.ts";
import { defaultNodeOrigin } from "./orto.ts";

/** Published FreeHole web container contract key on Freenet. */
export const FREEHOLE_SITE = "6d7GS576m4QBnsHh6fjdYYJfBZbCkR1W7Cu2xaqa78sp";
export const FREEHOLE_REPO = "https://github.com/scobru/freehole";
export const FREEHOLE_PATH = `/v1/contract/web/${FREEHOLE_SITE}/`;

/** Backward-compatible aliases for legacy imports */
export const WORMHOLE_SITE = FREEHOLE_SITE;
export const WORMHOLE_REPO = FREEHOLE_REPO;
export const WORMHOLE_PATH = FREEHOLE_PATH;

/** Mnemonic sync code pattern: number-word-word (e.g. 82-gentle-bird, 14-calm-wave). */
const MNEMONIC_RE = /\b(\d{1,4}-[a-z]{3,16}-[a-z]{3,16})\b/i;

/** Prefixed code: freehole:<code>, fh:<code>, wh:<code>, wormhole:<code>, #fh/<code>, #fh=<code>, #wh/<code>, #wh=<code>, fh receive <code>, freehole receive <code>, wh receive <code> */
const PREFIXED_CODE_RE =
  /(?:freehole:|fh:|wh:|wormhole:|#\/?freehole\/|#\/?freehole=|#\/?fh\/|#\/?fh=|#\/?wh\/|#\/?wh=|#\/?wormhole\/|#\/?wormhole=|(?:freehole|fh|wh)\s+receive\s+)(\d{1,4}-[a-z]{3,16}-[a-z]{3,16})/i;

/** URL pointing to the FreeHole web contract on Freenet. */
const FREEHOLE_URL_RE = new RegExp(
  `(?:freenet:|(?:https?:\\/\\/[^/\\s]+)?\\/v[12]\\/contract\\/web\\/)${FREEHOLE_SITE}\\/?([^\\s]*)`,
  "i"
);

export interface FreeHoleRef {
  code?: string;
  isSite?: boolean;
  rawUrl?: string;
}

export type WormholeRef = FreeHoleRef;

/** Detect a FreeHole transfer code or link inside caption text. */
export function freeholeLink(caption: string): FreeHoleRef | null {
  if (!caption) return null;

  // 1. Check for explicit prefixed code or command
  const pref = PREFIXED_CODE_RE.exec(caption);
  if (pref) {
    return { code: pref[1].toLowerCase() };
  }

  // 2. Check for FreeHole Freenet web container link
  const urlMatch = FREEHOLE_URL_RE.exec(caption);
  if (urlMatch) {
    const sub = urlMatch[1] || "";
    const codeInUrl = MNEMONIC_RE.exec(sub);
    return {
      isSite: true,
      code: codeInUrl ? codeInUrl[1].toLowerCase() : undefined,
      rawUrl: urlMatch[0],
    };
  }

  // 3. Check for standalone mnemonic code when caption mentions freehole, wormhole, or transfer
  if (/\b(?:freehole|wormhole|p2p transfer|file transfer|wh\b|fh\b)/i.test(caption)) {
    const m = MNEMONIC_RE.exec(caption);
    if (m) {
      return { code: m[1].toLowerCase() };
    }
  }

  return null;
}

export const wormholeLink = freeholeLink;

/** Get the link to open a FreeHole transfer on Freenet web gateway. */
export function freeholeHref(origin = defaultNodeOrigin(), _code?: string): string {
  return `${origin}/v1/contract/web/${FREEHOLE_SITE}/#transfer`;
}

export const wormholeHref = freeholeHref;

/** Render a FreeHole card in feed and chat. */
export function freeholeCard(caption: string, origin = defaultNodeOrigin()): string {
  const ref = freeholeLink(caption);
  if (!ref) return "";

  const href = freeholeHref(origin, ref.code);

  if (ref.code) {
    return (
      `<div class="wormhole-card blog-post-card" data-wormhole-code="${esc(ref.code)}">` +
      `<div class="blog-embed-card">` +
      `<div class="blog-embed-head">` +
      `<span class="blog-badge wormhole-badge">&#x1F300; FreeHole P2P</span>` +
      `<span class="blog-embed-sitename">E2EE Transfer</span>` +
      `</div>` +
      `<div class="wormhole-code-box">` +
      `<span class="wormhole-code-label">Transfer Code:</span>` +
      `<code class="wormhole-code-val">${esc(ref.code)}</code>` +
      `<button type="button" class="wormhole-copy-btn btn-secondary btn-xs" data-copy-code="${esc(ref.code)}" title="Copy transfer code">Copy</button>` +
      `</div>` +
      `<p class="blog-embed-excerpt">Decentralized Freenet chunk contract file transfer with Reed-Solomon redundancy. Sovereign and serverless.</p>` +
      `<div class="wormhole-cli-snippet">` +
      `<code>fh receive ${esc(ref.code)} --freenet</code>` +
      `</div>` +
      `<div class="blog-embed-footer">` +
      `<a class="blog-embed-read" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Receive on FreeHole \u2197</a>` +
      `</div>` +
      `</div>` +
      `</div>`
    );
  }

  return (
    `<div class="wormhole-card blog-post-card">` +
    `<div class="blog-embed-card">` +
    `<div class="blog-embed-head">` +
    `<span class="blog-badge wormhole-badge">&#x1F300; FreeHole</span>` +
    `<span class="blog-embed-sitename">Freenet</span>` +
    `</div>` +
    `<a class="blog-embed-title" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Decentralized P2P File Transfer</a>` +
    `<p class="blog-embed-excerpt">High-performance sovereign file transfer using Freenet chunk contracts with Reed-Solomon redundancy.</p>` +
    `<div class="blog-embed-footer">` +
    `<a class="blog-embed-read" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open FreeHole \u2197</a>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

export const wormholeCard = freeholeCard;

/** Hydrate any interactive FreeHole elements (e.g. copy button). */
export function fillFreeHole(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".wormhole-copy-btn:not([data-bound])").forEach((btn) => {
    btn.dataset.bound = "true";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const code = btn.dataset.copyCode;
      if (!code) return;
      void navigator.clipboard.writeText(code).then(() => {
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = orig), 2000);
      });
    });
  });
}

export const fillWormhole = fillFreeHole;
