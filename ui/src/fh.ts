// Fisherman's Horizon integration (github.com/scobru/FH) for Radica.
// Reads a persona's public Freenet bookmark list contract (fh_list.wasm, parameterized by persona || app path)
// or an exported FH JSON list, and renders profile bookmark cards and shared-list embeds in posts and chat.

import type { ContractKey } from "@freenetorg/freenet-stdlib";
import { keyOf } from "./contractKey.ts";
import { hexToBytes, bytesToHex } from "./crypto.ts";
import { fromBase58, personaName } from "./whoiam.ts";
import { escapeHtml as esc } from "./html.ts";
import { defaultNodeOrigin } from "./orto.ts";

/** Published Fisherman's Horizon web container contract key. */
export const FH_SITE = "GyMDcXWozt4JNAz7mwPSpt9hjNyvijQRe4JhXzPAXPWm";
export const FH_REPO = "https://github.com/scobru/FH";
export const FH_APP_PATH = `/v1/contract/web/${FH_SITE}/`;

/** Frozen BLAKE3 code hash of Fisherman's Horizon list contract (src/contract.wasm). */
export const FH_LIST_CODE_HASH = "1ae51824e75d523815deb00bc2ab0053df50c2715943869b8fbc8f680a635ce3";

const enc = new TextEncoder();
const dec = new TextDecoder();

const ID_RE = /^[1-9A-HJ-NP-Za-km-z]{20,60}$/;
const HEX64_RE = /^[0-9a-f]{64}$/i;

export interface FhSite {
  name: string;
  key: string;
  hash: string;
  group: string;
}

export interface FhListData {
  persona?: string;
  siteKey?: string;
  sites: FhSite[];
  ts: number;
}

export type FhProfileInput =
  | { kind: "persona"; persona: string; siteKey: string; appPath: string }
  | { kind: "json"; sites: FhSite[] };

/** Extract a 64-hex Ed25519 persona key from hex or Base58. */
export function fhPersonaHex(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (HEX64_RE.test(s)) return s.toLowerCase();
  try {
    const bytes = fromBase58(s);
    return bytes && bytes.length === 32 ? bytesToHex(bytes).toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Derive the Freenet ContractKey for a persona's Fisherman's Horizon list contract. */
export function fhListKey(personaHex: string, appPath = FH_APP_PATH): ContractKey {
  const clean = fhPersonaHex(personaHex);
  if (!clean) throw new Error("Invalid persona key for Fisherman's Horizon list");
  const params = new Uint8Array([...hexToBytes(clean), ...enc.encode(appPath)]);
  return keyOf(FH_LIST_CODE_HASH, params);
}

const cleanHash = (h: unknown): string => {
  if (typeof h !== "string") return "";
  const t = h.trim().slice(0, 300);
  if (!t || /[\s"'<>\\]/.test(t)) return "";
  return t.startsWith("#") ? t : `#${t}`;
};

/** Parse and sanitize an array or JSON string of Fisherman's Horizon Site entries. */
export function parseFhSitesJson(raw: string | unknown[] | null | undefined): FhSite[] {
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (arr && typeof arr === "object" && !Array.isArray(arr)) {
      const rec = arr as Record<string, unknown>;
      if (typeof rec.list === "string") arr = JSON.parse(rec.list);
      else if (Array.isArray(rec.sites)) arr = rec.sites;
    }
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const seen = new Set<string>();
  const out: FhSite[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.trim() : "";
    if (!ID_RE.test(key) || seen.has(key)) continue;
    seen.add(key);
    const nameRaw = typeof r.name === "string" ? r.name.trim().slice(0, 80) : "";
    const groupRaw = typeof r.group === "string" ? r.group.trim().slice(0, 60) : "";
    out.push({
      name: nameRaw || `${key.slice(0, 8)}…`,
      key,
      hash: cleanHash(r.hash),
      group: groupRaw,
    });
  }
  return out;
}

/** Parse raw contract state bytes from Fisherman's Horizon's list contract. */
export function parseFhListState(state: Uint8Array): { sites: FhSite[]; ts: number } | null {
  try {
    const parsed = JSON.parse(dec.decode(state)) as { list?: unknown; ts?: unknown };
    if (typeof parsed?.list !== "string") return null;
    const sites = parseFhSitesJson(parsed.list);
    return { sites, ts: Number(parsed.ts) || 0 };
  } catch {
    return null;
  }
}

// Matches FH share links:
// - http://127.0.0.1:7509/v1/contract/web/<siteKey>/#/u/<id>
// - freenet:<siteOrName>/#/u/<id>
// - #/u/<id> or #/fh/<id>
const FH_WEB_SHARE_RE = /\/v[12]\/contract\/web\/([1-9A-HJ-NP-Za-km-z]{20,60})\/?#\/u\/([1-9A-HJ-NP-Za-km-z0-9a-f]{32,64})/i;
const FH_FN_SHARE_RE = /(?:freenet:|fn:)([a-z0-9-]+(?:\/[a-z0-9-]+)?|[1-9A-HJ-NP-Za-km-z]{20,60})\/?#\/u\/([1-9A-HJ-NP-Za-km-z0-9a-f]{32,64})/i;
const FH_HASH_ONLY_RE = /(?:^|\s)#\/(?:fh|u)\/([1-9A-HJ-NP-Za-km-z0-9a-f]{32,64})(?=$|\s)/i;

export interface FhShareRef {
  persona: string;
  siteKey: string;
  appPath: string;
}

/** Detect a Fisherman's Horizon shared-list link in a post or chat message. */
export function fhLink(caption: string): FhShareRef | null {
  if (!caption) return null;
  const web = FH_WEB_SHARE_RE.exec(caption);
  if (web) {
    const persona = fhPersonaHex(web[2]);
    if (persona) {
      const siteKey = web[1];
      return { persona, siteKey, appPath: `/v1/contract/web/${siteKey}/` };
    }
  }
  const fn = FH_FN_SHARE_RE.exec(caption);
  if (fn) {
    const persona = fhPersonaHex(fn[2]);
    if (persona) {
      const siteKey = ID_RE.test(fn[1]) ? fn[1] : FH_SITE;
      return { persona, siteKey, appPath: `/v1/contract/web/${siteKey}/` };
    }
  }
  const hashOnly = FH_HASH_ONLY_RE.exec(caption);
  if (hashOnly) {
    const persona = fhPersonaHex(hashOnly[1]);
    if (persona) {
      return { persona, siteKey: FH_SITE, appPath: FH_APP_PATH };
    }
  }
  return null;
}

/** Parse Edit Profile input for Fisherman's Horizon: share link, persona key (Base58/hex), or exported JSON. */
export function parseFhProfileInput(raw: string): FhProfileInput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const sites = parseFhSitesJson(trimmed);
    return sites.length ? { kind: "json", sites } : null;
  }

  const link = fhLink(trimmed);
  if (link) {
    return { kind: "persona", persona: link.persona, siteKey: link.siteKey, appPath: link.appPath };
  }

  const persona = fhPersonaHex(trimmed);
  if (persona) {
    return { kind: "persona", persona, siteKey: FH_SITE, appPath: FH_APP_PATH };
  }

  return null;
}

export function fhSiteHref(site: Pick<FhSite, "key" | "hash">, origin = defaultNodeOrigin()): string {
  return `${origin}/v1/contract/web/${site.key}/${site.hash || ""}`;
}

export function fhShareHref(personaHex?: string, origin = defaultNodeOrigin(), siteKey = FH_SITE): string {
  if (personaHex && HEX64_RE.test(personaHex)) {
    return `${origin}/v1/contract/web/${siteKey}/#/u/${personaName(personaHex.toLowerCase())}`;
  }
  return `${origin}/v1/contract/web/${siteKey}/`;
}

function renderSiteGroupsHtml(sites: FhSite[], origin: string, maxItems = 18): string {
  const shown = sites.slice(0, maxItems);
  const hasNamedGroups = shown.some((s) => s.group.length > 0);
  if (!hasNamedGroups) {
    return (
      `<div class="blog-card-pages fh-sites-pills">` +
      shown
        .map(
          (s) =>
            `<a href="${esc(fhSiteHref(s, origin))}" target="_blank" rel="noopener noreferrer" title="${esc(s.key)}">${esc(s.name)}</a>`
        )
        .join("") +
      (sites.length > maxItems ? `<span class="fh-more-pill">+${sites.length - maxItems} more</span>` : "") +
      `</div>`
    );
  }

  const groups = new Map<string, FhSite[]>();
  for (const s of shown) {
    const g = s.group || "Sites";
    let list = groups.get(g);
    if (!list) groups.set(g, (list = []));
    list.push(s);
  }

  return (
    `<div class="fh-groups-wrap">` +
    Array.from(groups.entries())
      .map(
        ([group, items]) =>
          `<div class="fh-group-row">` +
          `<span class="fh-group-label">${esc(group)}</span>` +
          `<div class="blog-card-pages fh-sites-pills">` +
          items
            .map(
              (s) =>
                `<a href="${esc(fhSiteHref(s, origin))}" target="_blank" rel="noopener noreferrer" title="${esc(s.key)}">${esc(s.name)}</a>`
            )
            .join("") +
          `</div>` +
          `</div>`
      )
      .join("") +
    (sites.length > maxItems ? `<div class="fh-more-note">+${sites.length - maxItems} more on Fisherman's Horizon</div>` : "") +
    `</div>`
  );
}

/** Render a user's Fisherman's Horizon curated Freenet links on their Radica profile. */
export function fhProfileCard(
  ownerLabel: string,
  data: FhListData | null,
  origin = defaultNodeOrigin()
): string {
  if (!data || !data.sites.length) return "";
  const href = fhShareHref(data.persona, origin, data.siteKey || FH_SITE);
  const countLabel = `${data.sites.length} curated Freenet site${data.sites.length === 1 ? "" : "s"}`;

  return (
    `<div class="blog-card fh-profile-card">` +
    `<div class="blog-card-head">` +
    `<span class="link-card-icon" aria-hidden="true">&#x2693;</span>` +
    `<span class="link-card-text">` +
    `<span class="link-card-host">Bookmarks on Fisherman's Horizon</span>` +
    `<span class="link-card-title">${esc(ownerLabel)}'s Freenet Links</span>` +
    `<span class="blog-card-desc">${esc(countLabel)} &bull; Click a site to open or import all in FH</span>` +
    `</span>` +
    `<div class="blog-card-actions">` +
    `<a class="blog-card-open" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="Open on Fisherman's Horizon" aria-label="Open on Fisherman's Horizon">\u2197</a>` +
    `<button type="button" class="blog-card-toggle" aria-label="Toggle section" title="Collapse / expand">` +
    `<svg class="blog-card-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
    `</button>` +
    `</div>` +
    `</div>` +
    renderSiteGroupsHtml(data.sites, origin, 24) +
    `</div>`
  );
}

/** Placeholder embed card for a Fisherman's Horizon shared list in a post or chat message. */
export function fhCard(caption: string, origin = defaultNodeOrigin()): string {
  const link = fhLink(caption);
  if (!link) return "";
  const href = fhShareHref(link.persona, origin, link.siteKey);
  const shortId = `${personaName(link.persona).slice(0, 10)}…`;
  return (
    `<div class="fh-card blog-post-card" data-fh-persona="${esc(link.persona)}" data-fh-site="${esc(link.siteKey)}" data-fh-path="${esc(link.appPath)}">` +
    `<div class="blog-embed-card">` +
    `<div class="blog-embed-head">` +
    `<span class="blog-badge fh-badge">&#x2693; Fisherman's Horizon</span>` +
    `<span class="blog-embed-sitename">@${esc(shortId)}</span>` +
    `</div>` +
    `<a class="blog-embed-title" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Shared Freenet Bookmarks</a>` +
    `<p class="blog-embed-excerpt fh-embed-status">Loading curated Freenet sites…</p>` +
    `<div class="fh-embed-sites"></div>` +
    `<div class="blog-embed-footer">` +
    `<a class="blog-embed-read" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open &amp; import on FH \u2197</a>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

/** Hydrate Fisherman's Horizon shared-list cards under `root`. */
export function fillFh(
  root: ParentNode,
  freenet: { fhList: (personaHex: string, appPath?: string, siteKey?: string) => Promise<FhListData | null> },
  origin = defaultNodeOrigin()
): void {
  root.querySelectorAll<HTMLElement>(".fh-card:not([data-state])").forEach((card) => {
    card.dataset.state = "loading";
    const persona = card.dataset.fhPersona || "";
    const siteKey = card.dataset.fhSite || FH_SITE;
    const appPath = card.dataset.fhPath || FH_APP_PATH;
    if (!persona) return;
    void freenet.fhList(persona, appPath, siteKey).then((data) => {
      const statusEl = card.querySelector<HTMLElement>(".fh-embed-status");
      const sitesEl = card.querySelector<HTMLElement>(".fh-embed-sites");
      if (!data || !data.sites.length) {
        card.dataset.state = "empty";
        if (statusEl) statusEl.textContent = "Open on Fisherman's Horizon to view or import this Freenet list.";
        return;
      }
      card.dataset.state = "ready";
      if (statusEl) {
        statusEl.textContent = `${data.sites.length} curated site${data.sites.length === 1 ? "" : "s"} on Freenet:`;
      }
      if (sitesEl) {
        sitesEl.innerHTML = renderSiteGroupsHtml(data.sites, origin, 12);
      }
    });
  });
}

