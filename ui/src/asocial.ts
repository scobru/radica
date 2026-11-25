// Asocial game integration (gitlab.com/porky11/asocial) for Radica.
// Asocial is a decentralized platform for small browser and HTML5/WASM games on Freenet.
// Games run as web contracts on the reader's node (/v1/contract/web/<key>/) and can be played
// directly inside Radica posts and linked to user profiles.
import { escapeHtml as esc } from "./html.ts";
import { defaultNodeOrigin } from "./orto.ts";
import { ContractKey } from "@freenetorg/freenet-stdlib";
import { blake3 } from "@noble/hashes/blake3.js";
import { fromBase58, toBase58, hexToBytes } from "./crypto.ts";
import { openExternalUrl } from "./platformBridge.ts";

/** Asocial's portal web app contract on Freenet. */
export const ASOCIAL_SITE = "BhhLhAiMAcZaSEJ31Zwri59D3F3E112DY6w3J51iLJT9";
export const ASOCIAL_REPO = "https://gitlab.com/porky11/asocial";

/** Frozen code hash of Asocial records contract (asocial_records_contract.wasm). */
export const ASOCIAL_RECORDS_CODE = "GFJgDcUKCX48Q7b5Z5sUpsVLABggWNggF2XQJMh3Rjcs";
export const ASOCIAL_RECORDS_CODE_BYTES = fromBase58(ASOCIAL_RECORDS_CODE);

export interface AsocialWorkItem {
  title: string;
  kind?: string;
  description?: string;
  siteId?: string;
  address?: string;
  href?: string;
}

export interface AsocialData {
  key: string;
  name?: string;
  about?: string;
  works: AsocialWorkItem[];
}

const BS58_ID = "[1-9A-HJ-NP-Za-km-z]{20,60}";

// Patterns to detect Asocial works/games in captions:
// 1) #work/<publisher>/<title> or #/work/... or #asocial/work/... or full node url with #work/...
const WORK_HASH_RE = new RegExp(`(?:#\\/?work\\/|#\\/?asocial(?:-work)?\\/|\\/v1\\/contract\\/web\\/[^/\\s]+\\/#\\/?work\\/)(${BS58_ID})\\/([^?\\s#]+)(?:\\?([^\\s]+))?`, "i");

// 2) Explicit direct asocial game web app contract: #asocial-game/<contractKey> or #game/<contractKey>
const GAME_CONTRACT_RE = new RegExp(`(?:#\\/?asocial-game\\/|#\\/?game\\/)(${BS58_ID})(?:\\?([^\\s]+))?`, "i");

// 3) Person / profile links: #person/<key> or #/person/<key>
const PERSON_HASH_RE = new RegExp(`(?:#\\/?person\\/|#\\/?asocial-person\\/|\\/v1\\/contract\\/web\\/[^/\\s]+\\/#\\/?person\\/)(${BS58_ID})`, "i");
const RAW_KEY_RE = new RegExp(`^(${BS58_ID}|[0-9a-fA-F]{64})$`);

export interface AsocialWorkRef {
  raw: string;
  publisher?: string;
  title: string;
  siteKey?: string;
  params?: string;
}

/** Detect an Asocial game or work link inside a post caption. */
export function asocialLink(caption: string): AsocialWorkRef | null {
  if (!caption) return null;

  const mWork = WORK_HASH_RE.exec(caption);
  if (mWork) {
    const rawTitle = mWork[2];
    const decodedTitle = (() => {
      try {
        return decodeURIComponent(rawTitle);
      } catch {
        return rawTitle;
      }
    })();
    return {
      raw: mWork[0],
      publisher: mWork[1],
      title: decodedTitle,
      params: mWork[3],
    };
  }

  const mGame = GAME_CONTRACT_RE.exec(caption);
  if (mGame) {
    return {
      raw: mGame[0],
      siteKey: mGame[1],
      title: "Asocial Game",
      params: mGame[2],
    };
  }

  return null;
}

/** Parse an Asocial author or person key from an input string or URL. */
export function asocialPersonOf(input: string): string | null {
  const s = input.trim();
  const m = PERSON_HASH_RE.exec(s);
  if (m) return m[1];
  return RAW_KEY_RE.test(s) ? s : null;
}

/** Helper to shorten a base58 or hex key for display. */
function shortKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-6)}`;
}

/** Get the external URL to open an Asocial work on the node's portal or fallback to repo. */
export function asocialWorkHref(work: AsocialWorkRef, origin = defaultNodeOrigin()): string {
  if (ASOCIAL_SITE) {
    if (work.publisher && work.title) {
      return `${origin}/v1/contract/web/${ASOCIAL_SITE}/#work/${work.publisher}/${encodeURIComponent(work.title)}${work.params ? `?${work.params}` : ""}`;
    }
    if (work.siteKey) {
      return `${origin}/v1/contract/web/${work.siteKey}/`;
    }
  }
  if (work.siteKey) {
    return `${origin}/v1/contract/web/${work.siteKey}/`;
  }
  if (work.publisher && work.title) {
    return `https://p11c.xyz/asocial/#work/${work.publisher}/${encodeURIComponent(work.title)}${work.params ? `?${work.params}` : ""}`;
  }
  return ASOCIAL_REPO;
}

/** Get the link to an Asocial author profile. */
export function asocialPersonHref(key: string, origin = defaultNodeOrigin()): string {
  const cleanKey = asocialPersonOf(key) || key;
  if (ASOCIAL_SITE) {
    return `${origin}/v1/contract/web/${ASOCIAL_SITE}/#person/${cleanKey}`;
  }
  return `https://p11c.xyz/asocial/#person/${cleanKey}`;
}

/** The placeholder card rendered inside a Radica post. */
export function asocialCard(caption: string, origin = defaultNodeOrigin()): string {
  const work = asocialLink(caption);
  if (!work) return "";

  const openHref = asocialWorkHref(work, origin);
  const cleanTitle = work.title.replace(/[-_]/g, " ");

  return (
    `<div class="asocial-card" ` +
      `data-title="${esc(work.title)}" ` +
      (work.publisher ? `data-publisher="${esc(work.publisher)}" ` : "") +
      (work.siteKey ? `data-site="${esc(work.siteKey)}" ` : "") +
      (work.params ? `data-params="${esc(work.params)}" ` : "") +
    `>` +
      `<div class="asocial-card-head">` +
        `<span class="asocial-badge">&#x1F3AE; Asocial Game</span>` +
        (work.publisher ? `<span class="asocial-pubkey">by ${esc(shortKey(work.publisher))}</span>` : "") +
      `</div>` +
      `<div class="asocial-card-body">` +
        `<div class="asocial-card-icon" aria-hidden="true">&#x1F579;&#xFE0F;</div>` +
        `<div class="asocial-card-info">` +
          `<div class="asocial-card-title">${esc(cleanTitle)}</div>` +
          `<div class="asocial-card-desc">Decentralized HTML5 game on Freenet</div>` +
        `</div>` +
        `<button type="button" class="asocial-play-btn btn-primary btn-sm" aria-label="Play ${esc(cleanTitle)}">` +
          `&#x25B6; Play in Radica` +
        `</button>` +
      `</div>` +
      `<div class="asocial-card-footer">` +
        `<a class="asocial-ext-link" href="${esc(openHref)}" target="_blank" rel="noopener noreferrer">` +
          `Open in Asocial &nearr;` +
        `</a>` +
      `</div>` +
    `</div>`
  );
}

/** Initialize all Asocial cards under root without mounting untrusted inline iframes. */
export function fillAsocial(root: ParentNode, origin = defaultNodeOrigin()): void {
  root.querySelectorAll<HTMLElement>(".asocial-card:not([data-initialized])").forEach((card) => {
    card.dataset.initialized = "true";
    const playBtn = card.querySelector<HTMLButtonElement>(".asocial-play-btn");
    if (!playBtn) return;

    playBtn.addEventListener("click", () => {
      const title = card.dataset.title || "Asocial Game";
      const publisher = card.dataset.publisher;
      const siteKey = card.dataset.site;
      const params = card.dataset.params || "";

      const validId = (v?: string): v is string => !!v && new RegExp(`^${BS58_ID}$`).test(v);
      let gameUrl = "";
      if (validId(siteKey)) {
        gameUrl = `${origin}/v1/contract/web/${siteKey}/${params ? `?${params}` : ""}`;
      } else if (ASOCIAL_SITE && validId(publisher)) {
        gameUrl = `${origin}/v1/contract/web/${ASOCIAL_SITE}/#work/${publisher}/${encodeURIComponent(title)}${params ? `?${params}` : ""}`;
      } else if (validId(publisher)) {
        gameUrl = `${origin}/v1/contract/web/${publisher}/`;
      }
      if (!gameUrl) return;

      // Never embed untrusted third-party web contracts in an inline same-origin iframe:
      // open in a separate browser tab/window and render a safe launch panel.
      try {
        openExternalUrl(gameUrl, { fallbackWindowOpen: true });
      } catch {}

      const initialHtml = card.innerHTML;
      const cleanTitle = title.replace(/[-_]/g, " ");
      const wrap = document.createElement("div");
      wrap.className = "asocial-player-wrap";
      const bar = document.createElement("div");
      bar.className = "asocial-player-toolbar";
      const titleEl = document.createElement("span");
      titleEl.className = "asocial-player-title";
      const titleBold = document.createElement("b");
      titleBold.textContent = cleanTitle;
      titleEl.append("\u{1F3AE} ", titleBold);
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "asocial-tool-btn asocial-close-btn";
      closeBtn.title = "Back to card";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.textContent = "\u2715";
      bar.append(titleEl, closeBtn);

      const panel = document.createElement("div");
      panel.className = "asocial-launch-panel";
      const info = document.createElement("p");
      info.textContent = validId(siteKey)
        ? `Asocial game (${shortKey(siteKey)}) opens in its own browser tab to keep your Radica session isolated.`
        : "Asocial game opens in its own browser tab to keep your Radica session isolated.";
      const link = document.createElement("a");
      link.className = "btn-primary btn-sm";
      link.href = gameUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open in new tab \u2197";
      panel.append(info, link);

      wrap.append(bar, panel);
      card.replaceChildren(wrap);

      closeBtn.onclick = () => {
        card.innerHTML = initialHtml;
        card.removeAttribute("data-initialized");
        fillAsocial(card.parentElement || card, origin);
      };
    });
  });
}

function littleEndian(value: number, bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  let rest = BigInt(value);
  for (let i = 0; i < bytes; i++) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

/** Decode a base58 or 64-hex public key string into a 32-byte Uint8Array. */
export function decodeKeyBytes(key: string): Uint8Array | null {
  const clean = asocialPersonOf(key) || key.trim();
  if (!clean) return null;
  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    return hexToBytes(clean);
  }
  try {
    const bytes = fromBase58(clean);
    if (bytes.length === 32) return bytes;
  } catch {}
  return null;
}

/** Contract parameters for a person's personal store (`own`). */
export function asocialOwnStoreParams(ownerBytes: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const name = enc.encode("own");
  const out = new Uint8Array(1 + 1 + 32 + 1 + 1 + 4 + name.length);
  out[0] = 0; // format
  out[1] = 1; // owner tag
  out.set(ownerBytes, 2);
  out[34] = 0; // work_bits
  out[35] = 0; // rules count
  out.set(littleEndian(0x1000, 4), 36); // cap = 4096
  out.set(name, 40);
  return out;
}

/** Contract parameters for a publisher's works store (`works\0` + catalog). */
export function asocialWorksStoreParams(publisherBytes: Uint8Array, catalog = "asocial"): Uint8Array {
  const enc = new TextEncoder();
  const name = enc.encode(`works\0${catalog}`);
  const out = new Uint8Array(1 + 1 + 32 + 1 + 1 + 4 + name.length);
  out[0] = 0;
  out[1] = 1;
  out.set(publisherBytes, 2);
  out[34] = 0;
  out[35] = 0;
  out.set(littleEndian(0x400, 4), 36); // cap = 1024
  out.set(name, 40);
  return out;
}

/** Compute the ContractKey for a person's `own` store on Freenet. */
export function asocialOwnStoreKey(ownerKeyOrBytes: string | Uint8Array): ContractKey {
  const bytes = typeof ownerKeyOrBytes === "string" ? decodeKeyBytes(ownerKeyOrBytes) : ownerKeyOrBytes;
  if (!bytes || bytes.length !== 32) throw new Error("Invalid owner key for asocial own store");
  const params = asocialOwnStoreParams(bytes);
  const instance = blake3(new Uint8Array([...ASOCIAL_RECORDS_CODE_BYTES, ...params]));
  return new ContractKey(instance, ASOCIAL_RECORDS_CODE_BYTES);
}

/** Compute the ContractKey for a publisher's `works` store in a catalog on Freenet. */
export function asocialWorksStoreKey(publisherKeyOrBytes: string | Uint8Array, catalog = "asocial"): ContractKey {
  const bytes = typeof publisherKeyOrBytes === "string" ? decodeKeyBytes(publisherKeyOrBytes) : publisherKeyOrBytes;
  if (!bytes || bytes.length !== 32) throw new Error("Invalid publisher key for asocial works store");
  const params = asocialWorksStoreParams(bytes, catalog);
  const instance = blake3(new Uint8Array([...ASOCIAL_RECORDS_CODE_BYTES, ...params]));
  return new ContractKey(instance, ASOCIAL_RECORDS_CODE_BYTES);
}

export interface RawRecord {
  author: Uint8Array;
  authorKey: string;
  slot: Uint8Array;
  slotText: string;
  written: number;
  body: Uint8Array;
  signature: Uint8Array;
}

/** Read raw records from an Asocial records store state. */
export function readRecords(bytes: Uint8Array): RawRecord[] {
  const records: RawRecord[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  const dec = new TextDecoder("utf-8", { fatal: false });
  while (at + 32 + 1 + 8 + 4 + 8 + 64 <= bytes.length) {
    const author = bytes.subarray(at, (at += 32));
    const slotLength = bytes[at++];
    if (at + slotLength + 8 + 4 + 8 + 64 > bytes.length) break;
    const slot = bytes.subarray(at, (at += slotLength));
    const written = Number(view.getBigUint64(at, true));
    at += 8;
    const bodyLength = view.getUint32(at, true);
    at += 4;
    if (at + bodyLength + 8 + 64 > bytes.length) break;
    const body = bytes.subarray(at, (at += bodyLength));
    at += 8; // skip nonce
    const signature = bytes.subarray(at, (at += 64));
    records.push({
      author,
      authorKey: toBase58(author),
      slot,
      slotText: dec.decode(slot),
      written,
      body,
      signature,
    });
  }
  return records;
}

function readVarint(bytes: Uint8Array, at: { pos: number }): number {
  let val = 0;
  let scale = 1;
  for (let i = 0; i < 10; i++) {
    if (at.pos >= bytes.length) break;
    const b = bytes[at.pos++];
    val += (b & 0x7f) * scale;
    scale *= 128;
    if ((b & 0x80) === 0) return val;
  }
  return val;
}

function readFields(body: Uint8Array): [number, Uint8Array][] {
  const fields: [number, Uint8Array][] = [];
  const at = { pos: 0 };
  while (at.pos < body.length) {
    const tag = readVarint(body, at);
    const length = readVarint(body, at);
    if (at.pos + length > body.length) break;
    const val = body.subarray(at.pos, at.pos + length);
    at.pos += length;
    fields.push([tag, val]);
  }
  return fields;
}

/** Parse an Asocial profile record (Tag 1 = name, Tag 2 = about). */
export function parseAsocialProfile(bytes: Uint8Array): { name?: string; about?: string } {
  const dec = new TextDecoder("utf-8", { fatal: false });
  const recs = readRecords(bytes);
  const profileRec = recs.slice().reverse().find((r) => r.slotText === "profile");
  if (!profileRec) return {};
  const fields = readFields(profileRec.body);
  let name: string | undefined;
  let about: string | undefined;
  for (const [tag, val] of fields) {
    if (tag === 1 && !name) name = dec.decode(val);
    if (tag === 2 && !about) about = dec.decode(val);
  }
  return { name, about };
}

const KINDS = ["page", "image", "audio", "video", "link"];

/** Parse works from an Asocial publisher's works store state. */
export function parseAsocialWorks(bytes: Uint8Array, publisherKey: string, origin = defaultNodeOrigin()): AsocialWorkItem[] {
  const dec = new TextDecoder("utf-8", { fatal: false });
  const recs = readRecords(bytes);
  const works: AsocialWorkItem[] = [];
  const seen = new Set<string>();

  // Process newest first
  for (let i = recs.length - 1; i >= 0; i--) {
    const r = recs[i];
    const slotTitle = r.slotText;
    if (!slotTitle || seen.has(slotTitle)) continue;
    seen.add(slotTitle);

    // Empty body represents a withdrawal
    if (r.body.length === 0) continue;

    const fields = readFields(r.body);
    let title = slotTitle;
    let kind: string | undefined;
    let description: string | undefined;
    let siteId: string | undefined;
    let address: string | undefined;

    for (const [tag, val] of fields) {
      if (tag === 1) {
        const kindIdx = readVarint(val, { pos: 0 });
        kind = KINDS[kindIdx] ?? "game";
      } else if (tag === 2 && val.length === 32) {
        siteId = toBase58(val);
      } else if (tag === 4) {
        address = dec.decode(val);
      } else if (tag === 5) {
        title = dec.decode(val) || title;
      } else if (tag === 9) {
        description = dec.decode(val);
      }
    }

    const href = asocialWorkHref({ raw: "", publisher: publisherKey, title }, origin);
    works.push({
      title,
      kind,
      description,
      siteId,
      address,
      href,
    });
  }

  return works;
}

/** Render the Asocial profile section for user profile modal. */
export function asocialProfileCard(
  pubkey: string,
  asocialKey: string,
  data?: AsocialData | null,
  origin = defaultNodeOrigin()
): string {
  const cleanKey = asocialPersonOf(asocialKey) || asocialKey;
  const href = asocialPersonHref(cleanKey, origin);
  const nickname = data?.name?.trim();
  const titleText = nickname || `@${shortKey(cleanKey)}`;
  const descText = nickname
    ? `@${shortKey(cleanKey)} • Creator & player on Asocial`
    : "Creator & player on Asocial (HTML5 games on Freenet)";

  let pages = "";
  if (data?.works && data.works.length > 0) {
    const list = data.works.slice(0, 10).map((w) => {
      const workHref = w.href || asocialWorkHref({ raw: "", publisher: cleanKey, title: w.title }, origin);
      return `<a href="${esc(workHref)}" target="_blank" rel="noopener noreferrer" title="${esc(w.description || w.title)}">${esc(w.title)}</a>`;
    }).join("");
    pages = `<div class="blog-card-pages">${list}</div>`;
  }

  return (
    `<div class="blog-card asocial-profile-card">` +
      `<div class="blog-card-head">` +
        `<span class="link-card-icon" aria-hidden="true">&#x1F3AE;</span>` +
        `<span class="link-card-text">` +
          `<span class="link-card-host">Asocial Games Profile</span>` +
          `<span class="link-card-title">${esc(titleText)}</span>` +
          `<span class="blog-card-desc">${esc(descText)}</span>` +
        `</span>` +
        `<div class="blog-card-actions">` +
          `<a class="blog-card-open" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="Open on Asocial" aria-label="Open on Asocial">&nearr;</a>` +
          `<button type="button" class="blog-card-toggle" aria-label="Toggle section" title="Collapse / expand">` +
            `<svg class="blog-card-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
          `</button>` +
        `</div>` +
      `</div>` +
      pages +
    `</div>`
  );
}
