// A Delta blog (freenet/delta) shown on a Radica profile and embedded in posts. A Delta site is one contract keyed by
// BLAKE3(code hash || CBOR{prefix}), prefix = the first 10 base58 chars of the owner key. Delta re-keys its site contract
// on releases and names the current code hash in a signed pointer record (Delta's FREENET.md): it is resolved like River's used to be.
import * as ed from "@noble/ed25519";
import type { ContractKey } from "@freenetorg/freenet-stdlib";
import { keyOf, nextFloor, type Floor } from "./contractKey.ts";
import { bytesToHex, hexToBytes } from "./crypto.ts";
import { safeStorage } from "./storage.ts";
import { escapeHtml as escape } from "./html.ts";
import { cleanExcerpt } from "./orto.ts";

/** Delta's web app. */
export const DELTA_WEB = "EqJ5YpEEV3XLqEvKWLQHFhGAac2qXzSUoE6k2zbdnXBr";
/** Delta's author key (river:v1:vk:54RwkjvbrXRzjyg4z2EbNCzw3Qwx5YpWQegpMyCTwibE): the trust anchor of its pointers. */
const DELTA_AUTHOR = "3c4fb1c726ac4bccc564fea5d1d74100ec5477605bfec868dea60879d9b6d975";
/** The pointer contract's frozen code hash (8wnAPaSRY1oYZCz723fdwK6BgzL6q8ozP3buVovXnt6v), the same as River's. */
const POINTER_CODE = "760a3ca41c6309112f1ddbff032fde9b6429c8fb0ad6f5a2bcb7184508ee300b";
const APP_ID = "delta.site-contract";
/** The site contract of Delta's pointer record version 1: used only until a record resolves. */
const BUNDLED_SITE_CODE = "90bc44f4f2e76aeb5aec732920c1d73ffa3d108f6e661ad84474774b246fabe3";
const FLOOR = "radica_delta_pointer"; // highest record ever verified on this install

const pointerParams = () => new Uint8Array([...hexToBytes(DELTA_AUTHOR), ...new TextEncoder().encode(APP_ID)]);
export const pointerKey = (): ContractKey => keyOf(POINTER_CODE, pointerParams());

/** A pointer record: version (u32 BE) || code hash || Ed25519 signature by Delta's author over
 *  `freenet-pointer/state-v1 || params || version || code hash`. Null when it is not one signed by Delta. */
export async function verifyPointer(state: Uint8Array): Promise<Floor | null> {
  if (state.length !== 100) return null;
  const version = new DataView(state.buffer, state.byteOffset).getUint32(0);
  if (version === 0) return null;
  const msg = new Uint8Array([...new TextEncoder().encode("freenet-pointer/state-v1"), ...pointerParams(), ...state.slice(0, 36)]);
  const ok = await ed.verifyAsync(state.slice(36), msg, hexToBytes(DELTA_AUTHOR), { zip215: false }).catch(() => false);
  return ok ? { version, codeHash: bytesToHex(state.slice(4, 36)) } : null;
}

/** The site code hash to read blogs under: resolve the pointer, keep the highest record seen; the built-in one until then. */
export async function resolveSiteCode(getRaw: (k: ContractKey) => Promise<Uint8Array | null>): Promise<string> {
  let floor: Floor | null = null;
  try {
    floor = JSON.parse(safeStorage.getItem(FLOOR) || "null");
  } catch {}
  try {
    const raw = await getRaw(pointerKey());
    const rec = raw ? await verifyPointer(raw) : null;
    if (rec) {
      floor = nextFloor(floor, rec);
      safeStorage.setItem(FLOOR, JSON.stringify(floor));
    }
  } catch (e) {
    console.warn("[Delta] Could not resolve the site-contract pointer", e);
  }
  return floor?.codeHash ?? BUNDLED_SITE_CODE;
}

const PREFIX = /^[1-9A-HJ-NP-Za-km-z]{10}$/;

/** A site prefix from what the user pastes: the prefix itself or a Delta address (`…/<Delta>/#<prefix>/<page>`). */
export function deltaPrefixOf(input: string): string | null {
  const s = input.trim();
  if (PREFIX.test(s)) return s;
  const hash = s.split("#")[1]?.split("/")[0] ?? "";
  return PREFIX.test(hash) ? hash : null;
}

/** Delta's params for a site: CBOR map { "prefix": <text> }, as ciborium writes SiteParameters. */
export function siteParams(prefix: string): Uint8Array {
  const p = new TextEncoder().encode(prefix);
  return new Uint8Array([0xa1, 0x66, ...new TextEncoder().encode("prefix"), 0x60 + p.length, ...p]);
}

export const siteKey = (codeHash: string, prefix: string): ContractKey => keyOf(codeHash, siteParams(prefix));

/** A Delta page in Delta's own web app. */
export const pageHref = (origin: string, prefix: string, pageId?: number): string =>
  `${origin}/v1/contract/web/${DELTA_WEB}/#${prefix}${pageId === undefined ? "" : `/${pageId}`}`;

/** Minimal CBOR reader (what ciborium writes: definite lengths, maps keyed by text or integers). */
export function decodeCbor(bytes: Uint8Array): unknown {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 0;
  const arg = (info: number): number => {
    if (info < 24) return info;
    const n = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
    if (!n) throw new Error("unsupported CBOR length");
    let x = 0;
    for (let k = 0; k < n; k++) x = x * 256 + bytes[i + k];
    i += n;
    return x;
  };
  const item = (): unknown => {
    if (i >= bytes.length) throw new Error("truncated CBOR");
    const b = bytes[i++];
    const major = b >> 5;
    const info = b & 31;
    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22 || info === 23) return null;
      if (info === 25) return (i += 2), null; // half floats: not in Delta's state
      if (info === 26) return (i += 4), v.getFloat32(i - 4);
      if (info === 27) return (i += 8), v.getFloat64(i - 8);
      throw new Error("unsupported CBOR simple value");
    }
    const n = arg(info);
    switch (major) {
      case 0: return n;
      case 1: return -1 - n;
      case 2: return bytes.slice(i, (i += n));
      case 3: return new TextDecoder().decode(bytes.slice(i, (i += n)));
      case 4: return Array.from({ length: n }, item);
      case 5: {
        const m: Record<string, unknown> = {};
        for (let k = 0; k < n; k++) {
          const key = item();
          m[String(key)] = item();
        }
        return m;
      }
      default: return item(); // tag: its content
    }
  };
  return item();
}

export type DeltaPage = { id: number; title: string; content?: string; order: number };
export type DeltaSite = { name: string; description: string; pages: DeltaPage[] };

/** Name, description and pages (in Delta's own order: `order`, then id) of a Delta SiteState; null when the bytes are not one. */
export function parseSite(state: Uint8Array): DeltaSite | null {
  try {
    const s = decodeCbor(state) as any;
    const cfg = s?.config?.config;
    if (typeof cfg?.name !== "string" || typeof s.pages !== "object") return null;
    const pages = Object.entries<any>(s.pages)
      .filter(([, p]) => typeof p?.title === "string")
      .map(([id, p]) => ({
        id: Number(id),
        title: p.title as string,
        ...(typeof p.content === "string" ? { content: p.content } : {}),
        order: Number(p.order) || 0,
      }))
      .sort((a, b) => a.order - b.order || a.id - b.id);
    return { name: cfg.name, description: typeof cfg.description === "string" ? cfg.description : "", pages };
  } catch {
    return null;
  }
}

export type DeltaUri = { prefix: string; pageId?: number };

/** Parse a Delta site prefix and optional page ID from a URL or string. */
export function parseDeltaUri(input: string): DeltaUri | null {
  const s = input.trim();
  const hashIdx = s.indexOf("#");
  if (hashIdx !== -1) {
    const rest = s.slice(hashIdx + 1);
    const parts = rest.split("/").filter(Boolean);
    if (parts[0] && PREFIX.test(parts[0])) {
      const pageId = parts[1] && /^\d+$/.test(parts[1]) ? Number(parts[1]) : undefined;
      return { prefix: parts[0], pageId };
    }
  }
  if (PREFIX.test(s)) {
    return { prefix: s };
  }
  return null;
}

const TRAILING_PUNCT = /[.,;:!?)\]]+$/;

const DELTA_CAPTION_RE = /(?:https?:\/\/[^\s<>"']+\/v[12]\/contract\/(?:web\/)?|freenet:(?:\/\/)?)?(?:EqJ5YpEEV3XLqEvKWLQHFhGAac2qXzSUoE6k2zbdnXBr|delta)\/?[^\s<>"']*#[1-9A-HJ-NP-Za-km-z]{10}(?:\/\d+)?/i;

/** Detect a Delta blog or page URL in a caption. */
export function deltaInCaption(caption: string): DeltaUri | null {
  const m = DELTA_CAPTION_RE.exec(caption);
  if (m) {
    const cleaned = m[0].replace(TRAILING_PUNCT, "");
    return parseDeltaUri(cleaned);
  }
  return null;
}

export function defaultNodeOrigin(): string {
  const loc = globalThis.location;
  const onNode = loc && (loc.port === "7509" || loc.pathname?.includes("/v1/contract/"));
  return onNode ? loc.origin : "http://127.0.0.1:7509";
}

/** Render a placeholder for a Delta blog card in a post if it links to Delta. */
export function deltaCard(caption: string, origin = defaultNodeOrigin()): string {
  const uri = deltaInCaption(caption);
  if (!uri) return "";
  const href = pageHref(origin, uri.prefix, uri.pageId);
  return (
    `<div class="delta-card blog-post-card" data-prefix="${escape(uri.prefix)}" data-page="${uri.pageId !== undefined ? uri.pageId : ""}">` +
      `<div class="blog-embed-card">` +
        `<div class="blog-embed-head">` +
          `<span class="blog-badge delta-badge">&#x1F4D6; Delta Blog</span>` +
        `</div>` +
        `<a class="blog-embed-title" href="${escape(href)}" target="_blank" rel="noopener noreferrer">Loading Delta blog&hellip;</a>` +
        `<div class="blog-embed-footer">` +
          `<a class="blog-embed-btn btn-secondary btn-sm" href="${escape(href)}" target="_blank" rel="noopener noreferrer">Open on Delta &nearr;</a>` +
        `</div>` +
      `</div>` +
    `</div>`
  );
}

/** Fill Delta blog card placeholders with fetched site data. */
export function fillDelta(
  root: ParentNode,
  freenet: { deltaSite: (prefix: string) => Promise<DeltaSite | null> },
  origin = defaultNodeOrigin()
): void {
  root.querySelectorAll<HTMLElement>(".delta-card:not([data-state])").forEach((card) => {
    card.dataset.state = "loading";
    const prefix = card.dataset.prefix;
    if (!prefix) return;
    const pageIdStr = card.dataset.page;
    const pageId = pageIdStr !== undefined && pageIdStr !== "" ? Number(pageIdStr) : undefined;

    void freenet.deltaSite(prefix).then((site) => {
      if (!site) {
        card.dataset.state = "missing";
        return;
      }
      card.dataset.state = "ready";
      if (pageId !== undefined) {
        const page = site.pages.find((p) => p.id === pageId);
        if (page) {
          const href = pageHref(origin, prefix, page.id);
          const excerpt = cleanExcerpt(page.content || "", 180);
          card.innerHTML =
            `<div class="blog-embed-card">` +
              `<div class="blog-embed-head">` +
                `<span class="blog-badge delta-badge">&#x1F4D6; Delta Blog</span>` +
                `<span class="blog-embed-sitename">${escape(site.name || prefix)}</span>` +
              `</div>` +
              `<a class="blog-embed-title" href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(page.title || "Untitled")}</a>` +
              (excerpt ? `<p class="blog-embed-excerpt">${escape(excerpt)}</p>` : "") +
              `<div class="blog-embed-footer">` +
                `<a class="blog-embed-btn btn-secondary btn-sm" href="${escape(href)}" target="_blank" rel="noopener noreferrer">Read on Delta &nearr;</a>` +
              `</div>` +
            `</div>`;
          return;
        }
      }

      // Root blog card
      const href = pageHref(origin, prefix);
      const desc = site.description || "";
      const pageCount = site.pages.length;
      card.innerHTML =
        `<div class="blog-embed-card">` +
          `<div class="blog-embed-head">` +
            `<span class="blog-badge delta-badge">&#x1F4D6; Delta Blog</span>` +
          `</div>` +
          `<a class="blog-embed-title" href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(site.name || prefix)}</a>` +
          (desc ? `<p class="blog-embed-excerpt">${escape(desc)}</p>` : "") +
          `<div class="blog-embed-footer">` +
            `<span class="blog-embed-meta">${pageCount} ${pageCount === 1 ? "page" : "pages"}</span>` +
            `<a class="blog-embed-btn btn-secondary btn-sm" href="${escape(href)}" target="_blank" rel="noopener noreferrer">Open Blog &nearr;</a>` +
          `</div>` +
        `</div>`;
    });
  });
}
