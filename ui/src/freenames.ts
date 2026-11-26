// FreeNames (github.com/scobru/freenames): the short public names a persona owns, shown on its profile,
// and resolution of human-readable freenet:name/sub and fn:name identifiers to exact contract web URLs.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { ContractKey } from "@freenetorg/freenet-stdlib";
import { keyOf } from "./contractKey.ts";
import { hexToBytes } from "./crypto.ts";
import { escapeHtml as escape } from "./html.ts";

export const FREENAMES_KEY = "CDC7PTxNxfaNnJ3RJs8UrNHTScpT2NTujhvUiwirVejE";
const FREENAMES_PATH = `/v1/contract/web/${FREENAMES_KEY}/`;
const REGISTRY_ADMIN = "4498bd4c2ab992afa152bc9b968e246cf70dc4fa5a670b23c33e73b8516ce9f3"; // FreeNames' ui/src/lib.ts
// shortcut: blake3 of FreeNames' published ui/src/registry.wasm; if FreeNames ships new registry code, update it here
const REGISTRY_CODE = "79eba61ac4e4020f5b7823fd0f88db508909a82753e9bb3a8d1e91c37cb40476";

// shortcut: blake3 of FreeNames' published ui/src/zone.wasm; if FreeNames ships new zone code, update it here
const ZONE_CODE = "115ee6ed3d24f999d6765cfa1bdae0d75b41c80062dbb3274f4db84bc7510d15";

export interface RegState { claims: Record<string, Record<string, { nonce: number }>>; pins: { map: Record<string, string> } }

const enc = new TextEncoder();
const dec = new TextDecoder();

export const registryKey = (): ContractKey =>
  keyOf(REGISTRY_CODE, new Uint8Array([...hexToBytes(REGISTRY_ADMIN), ...enc.encode(FREENAMES_PATH)]));

/** A persona's zone: its records, name -> the contract id it points to. */
export const zoneKey = (persona: string): ContractKey =>
  keyOf(ZONE_CODE, new Uint8Array([...hexToBytes(persona), ...enc.encode(FREENAMES_PATH)]));

export const ID = /^[1-9A-HJ-NP-Za-km-z]{20,60}$/;
export const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const validName = (n: string) => NAME.test(n);
export const isKey = (s: string) => /^[0-9a-f]{64}$/.test(s);

/** The sites a zone points to, root (`@`) first, then by name; zone state from the network, so only well-formed
 *  names and ids are kept (the zone contract already checked each record's signature). */
export function sitesOf(state: Uint8Array): { name: string; target: string }[] {
  try {
    const recs = JSON.parse(dec.decode(state))?.records;
    if (!recs || typeof recs !== "object") return [];
    return Object.entries(recs as Record<string, { target?: unknown }>)
      .filter(([n, r]) => (n === "@" || NAME.test(n)) && typeof r?.target === "string" && ID.test(r.target))
      .map(([name, r]) => ({ name, target: r.target as string }))
      .sort((a, b) => (a.name === "@" ? -1 : b.name === "@" ? 1 : a.name.localeCompare(b.name)));
  } catch {
    return [];
  }
}

/** The owner of a registry name: the admin's pin if any ("" = reserved), else the claim with the lowest proof hash. */
export function ownerOf(s: RegState, name: string): string | null {
  if (name in s.pins.map) return s.pins.map[name] || null;
  let best: { o: string; h: string } | null = null;
  for (const [o, c] of Object.entries(s.claims[name] ?? {})) {
    const h = bytesToHex(sha256(enc.encode(`fnc1|${REGISTRY_ADMIN}|${name}|${o}|${c.nonce}`)));
    if (!best || h < best.h) best = { o, h };
  }
  return best?.o ?? null;
}

export function parseRegistryState(state: Uint8Array): RegState | null {
  try {
    const s = JSON.parse(dec.decode(state)) as RegState;
    if (typeof s?.claims !== "object" || typeof s?.pins?.map !== "object") return null;
    return s;
  } catch {
    return null;
  }
}

let cachedRegRaw = "";
let cachedByOwner: Map<string, string[]> | null = null;

/** The names a persona owns, sorted; registry state from the network, so malformed parts are ignored. */
export function namesOf(state: Uint8Array, persona: string): string[] {
  const raw = dec.decode(state);
  if (raw !== cachedRegRaw || !cachedByOwner) {
    cachedRegRaw = raw;
    cachedByOwner = new Map();
    try {
      const s = JSON.parse(raw) as RegState;
      if (typeof s?.claims === "object" && typeof s?.pins?.map === "object") {
        const names = new Set([...Object.keys(s.claims), ...Object.keys(s.pins.map)]);
        for (const n of names) {
          if (!NAME.test(n)) continue;
          const owner = ownerOf(s, n);
          if (!owner) continue;
          let list = cachedByOwner.get(owner);
          if (!list) cachedByOwner.set(owner, (list = []));
          list.push(n);
        }
        for (const list of cachedByOwner.values()) list.sort();
      }
    } catch {}
  }
  return cachedByOwner.get(persona)?.slice() ?? [];
}

/** FreeNames' lookup page for a name. */
export const nameHref = (origin: string, name: string) => `${origin}/v1/contract/web/${FREENAMES_KEY}/#/go/${encodeURIComponent(name)}`;

/** Target contract ID from a zone record (bare contract ID or /v1/contract/web/<id>/ path). */
export function targetOfRecord(zoneRaw: Uint8Array, sub: string): string | null {
  try {
    const data = JSON.parse(new TextDecoder().decode(zoneRaw));
    const rec = data?.records?.[sub];
    if (!rec || typeof rec.target !== "string" || !rec.target) return null;
    const m = rec.target.match(/(?:\/v[12]\/contract\/(?:web\/)?|^)([1-9A-HJ-NP-Za-km-z]{20,64})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export interface FreenameUri {
  first: string;     // e.g. "scobru" or 64-hex persona
  sub: string;       // e.g. "fh" or "@"
  subpath: string;   // e.g. "" or "/album/1#intro"
  canonical: string; // e.g. "scobru/fh" or "scobru"
}

const TRAILING_PUNCT = /[.,;:!?)\]]+$/;

/** Parses a freenet:name/sub or fn:name URI (or bare name if allowBare is true). Returns null if not a FreeNames URI. */
export function parseFreenameUri(input: string, allowBare = false): FreenameUri | null {
  const trimmed = input.trim();
  const m = allowBare
    ? /^(?:freenet:(?:\/\/)?:?|fn:)?(.+)$/i.exec(trimmed)
    : /^(?:freenet:(?:\/\/)?:?|fn:)(.+)$/i.exec(trimmed);
  if (!m) return null;
  const raw = m[1];

  const hashIdx = raw.search(/[?#]/);
  const pathPart = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
  const queryPart = hashIdx >= 0 ? raw.slice(hashIdx) : "";

  const segments = pathPart.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return null;

  const rawFirst = segments[0];
  // FreeNames names must not have uppercase letters (avoids mock/real mixed-case contract IDs)
  if (/[A-Z]/.test(rawFirst)) return null;

  const first = rawFirst.toLowerCase();
  if (!(isKey(first) || validName(first))) return null;

  // A contract ID is typically 32+ characters without hyphens (except 64-hex persona keys)
  if (first.length >= 32 && !isKey(first)) return null;

  const isFnScheme = trimmed.toLowerCase().startsWith("fn:") || (allowBare && !trimmed.toLowerCase().startsWith("freenet:"));

  if (segments.length === 1) {
    // Under freenet:, single segment without a subname is reserved for contract IDs or plain words
    if (!isFnScheme) return null;
    return {
      first,
      sub: "@",
      subpath: queryPart,
      canonical: first,
    };
  }

  const sub = segments[1].toLowerCase();
  if (sub !== "@" && !validName(sub)) return null;

  const extraPath = segments.slice(2).join("/");
  const fullSubpath = (extraPath ? `/${extraPath}` : "") + queryPart;

  return {
    first,
    sub,
    subpath: fullSubpath,
    canonical: sub === "@" ? first : `${first}/${sub}`,
  };
}

export interface ResolvedName {
  owner: string | null;
  target: string | null;
}

const resolvedCache = new Map<string, ResolvedName>();
const inflightResolutions = new Map<string, Promise<{ owner: string | null; target: string | null }>>();
const zoneCache = new Map<string, Promise<Uint8Array | null>>();

export function getResolvedFreename(canonical: string): ResolvedName | undefined {
  return resolvedCache.get(canonical);
}

export function setResolvedFreename(canonical: string, res: ResolvedName): void {
  resolvedCache.set(canonical, res);
}

export function clearResolvedFreenames(): void {
  resolvedCache.clear();
  inflightResolutions.clear();
  zoneCache.clear();
}

/** Resolves a FreeNames identifier to its owner persona and target contract ID. */
export async function resolveName(
  input: string,
  fetchRaw: (key: ContractKey) => Promise<Uint8Array | null>
): Promise<{ owner: string | null; target: string | null; canonical: string; subpath: string } | null> {
  const uri = parseFreenameUri(input, true);
  if (!uri) return null;

  const cached = getResolvedFreename(uri.canonical);
  if (cached) {
    return { owner: cached.owner, target: cached.target, canonical: uri.canonical, subpath: uri.subpath };
  }

  let p = inflightResolutions.get(uri.canonical);
  if (!p) {
    p = (async () => {
      let owner: string | null = null;
      if (isKey(uri.first)) {
        owner = uri.first;
      } else {
        const rawReg = await fetchRaw(registryKey()).catch(() => null);
        if (!rawReg) return { owner: null, target: null };
        const regState = parseRegistryState(rawReg);
        if (!regState) return { owner: null, target: null };
        owner = ownerOf(regState, uri.first);
      }
      if (!owner) {
        const res = { owner: null, target: null };
        setResolvedFreename(uri.canonical, res);
        return res;
      }

      let zP = zoneCache.get(owner);
      if (!zP) {
        zP = fetchRaw(zoneKey(owner)).catch(() => null);
        zoneCache.set(owner, zP);
      }
      const rawZone = await zP;
      const target = rawZone ? targetOfRecord(rawZone, uri.sub) : null;
      const res = { owner, target };
      setResolvedFreename(uri.canonical, res);
      return res;
    })();
    inflightResolutions.set(uri.canonical, p);
  }

  const res = await p;
  return { owner: res.owner, target: res.target, canonical: uri.canonical, subpath: uri.subpath };
}

export function defaultNodeOrigin(): string {
  const loc = globalThis.location;
  const onNode = loc && (loc.port === "7509" || loc.pathname?.includes("/v1/contract/"));
  return onNode ? loc.origin : "http://127.0.0.1:7509";
}

const shortKey = (k: string) => (k.length > 12 ? `${k.slice(0, 6)}\u2026${k.slice(-4)}` : k);

const FREENAME_CAPTION_RE = /(?:freenet:(?:\/\/)?[a-z0-9-]+\/[a-z0-9-@]+|fn:[a-z0-9-@]+|freenet:(?:\/\/)?[0-9a-f]{64}\/[a-z0-9-@]+)[^\s<>"']*/i;

/** Find the first FreeNames URI in a caption. */
export function freenameInCaption(caption: string): FreenameUri | null {
  const m = FREENAME_CAPTION_RE.exec(caption);
  if (!m) return null;
  const cleaned = m[0].replace(TRAILING_PUNCT, "");
  return parseFreenameUri(cleaned);
}

/** Render a FreeNames preview card for a post if it links to FreeNames. */
export function freenamesCard(caption: string, origin = defaultNodeOrigin()): string {
  const fn = freenameInCaption(caption);
  if (!fn) return "";
  const hit = getResolvedFreename(fn.canonical);
  const target = hit?.target;
  const cleanSub = fn.subpath.replace(/^\//, "");
  const href = target ? `${origin}/v1/contract/web/${target}/${cleanSub}` : nameHref(origin, fn.canonical);
  const resolved = Boolean(target);

  return (
    `<div class="fn-card" data-freenames="${escape(fn.canonical)}" data-subpath="${escape(fn.subpath)}"${resolved ? ' data-resolved="true"' : ""}>` +
      `<a class="fn-card-inner link-card" href="${escape(href)}" target="_blank" rel="noopener noreferrer nofollow" title="${escape(fn.canonical)}">` +
        `<span class="link-card-icon fn-icon" aria-hidden="true">&#x1F3F7;&#xFE0F;</span>` +
        `<span class="link-card-text">` +
          `<span class="link-card-host">FreeNames &middot; ${escape(fn.canonical)}</span>` +
          `<span class="link-card-title fn-card-title">${target ? `Open site (${shortKey(target)})` : `FreeNames: ${escape(fn.canonical)}`}</span>` +
        `</span>` +
        `<span class="fn-card-arrow" aria-hidden="true">&nearr;</span>` +
      `</a>` +
    `</div>`
  );
}

/** Fill FreeNames links and cards in a container once resolved. */
export function fillFreenames(
  root: ParentNode,
  freenet: { resolveFreename: (n: string) => Promise<{ owner: string | null; target: string | null } | null> },
  origin = defaultNodeOrigin()
): void {
  const links = root.querySelectorAll<HTMLAnchorElement>("a.fn-link:not([data-resolved='true'])");
  links.forEach(async (link) => {
    const fnName = link.dataset.freenames;
    if (!fnName) return;
    try {
      const res = await freenet.resolveFreename(fnName);
      if (res?.target) {
        const subpath = (link.dataset.subpath || "").replace(/^\//, "");
        const exactUrl = `${origin}/v1/contract/web/${res.target}/${subpath}`;
        link.href = exactUrl;
        link.dataset.resolved = "true";
        link.title = `FreeNames: ${fnName} → ${res.target}`;
      }
    } catch {
      // keep fallback
    }
  });

  const cards = root.querySelectorAll<HTMLElement>(".fn-card:not([data-resolved='true'])");
  cards.forEach(async (card) => {
    const fnName = card.dataset.freenames;
    if (!fnName) return;
    try {
      const res = await freenet.resolveFreename(fnName);
      if (res?.target) {
        card.dataset.resolved = "true";
        const subpath = (card.dataset.subpath || "").replace(/^\//, "");
        const exactUrl = `${origin}/v1/contract/web/${res.target}/${subpath}`;
        const a = card.querySelector<HTMLAnchorElement>("a.fn-card-inner");
        if (a) {
          a.href = exactUrl;
          a.title = `FreeNames: ${fnName} → ${res.target}`;
        }
        const titleEl = card.querySelector<HTMLElement>(".fn-card-title");
        if (titleEl) {
          titleEl.textContent = `Open site (${shortKey(res.target)})`;
        }
      }
    } catch {
      // keep fallback
    }
  });
}
