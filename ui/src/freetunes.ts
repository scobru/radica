import type { ContractKey } from "@freenetorg/freenet-stdlib";
import { escapeHtml as esc } from "./html.ts";
import { keyOf } from "./riverPointer.ts";
import { hexToBytes, bytesToHex } from "./crypto.ts";
import { fromBase58 } from "./whoiam.ts";
import { defaultNodeOrigin } from "./orto.ts";

export const FREETUNES_SITE = "HiAQ4ucHkDKw6ShMa9ipX73h9XxdyGD5cN2DSW78Mqev";
export const FREETUNES_KEY = FREETUNES_SITE;
export const FREETUNES_REPO = "https://github.com/scobru/freetunes";

/** FreeTunes directory contract admin key (Scobru) and frozen BLAKE3 code hash of directory.wasm. */
export const FREETUNES_DIR_ADMIN = "464b576da4cc5bcf31febd41a863ac251d04024c19f1786b24ca6620a0cce53b";
export const FREETUNES_DIR_CODE_HASH = "b743ada1ba4ca5d133781b227ec495bb5a2351f2e4c234d53f204aa03aaa1a2f";

// FreeTunes releases linked in posts or listed by an artist: read from the network by their contract id and played inline.
// FreeTunes (github.com/scobru/freetunes) keeps a release as JSON in one contract and each ~512 KB slice of MP3 (and
// the cover) in a chunk contract of its own; the public directory contract indexes listed releases by owner persona.

const ID = "[1-9A-HJ-NP-Za-km-z]{20,60}";
// a release route, "#/r/<release id>.<parameters, hex>[/<track index>]", anywhere in a caption
const LINK_RE = new RegExp(`#\\/r\\/(${ID})\\.([0-9a-f]{96,})(?:\\/(\\d+))?`, "i");
const LINK_GLOBAL_RE = new RegExp(`#\\/r\\/(${ID})\\.([0-9a-f]{96,})(?:\\/(\\d+))?`, "gi");
const ARTIST_LINK_RE = /(?:\/v[12]\/contract\/web\/[1-9A-HJ-NP-Za-km-z]{20,60}\/?#\/a\/|(?:freenet:|fn:)[^\s#]+\/#\/a\/|#\/ft-artist\/)([0-9a-f]{64}|[1-9A-HJ-NP-Za-km-z]{35,60})/i;
const ARTIST_HASH_RE = /#\/a\/([0-9a-f]{64}|[1-9A-HJ-NP-Za-km-z]{35,60})/i;
const ID_RE = new RegExp(`^${ID}$`);
const HEX64_RE = /^[0-9a-f]{64}$/i;

export interface FtTrack { title: string; chunks: string[]; ms: number }
export interface FtRelease {
  title: string;
  artist: string;
  creator?: string;
  cover?: string;
  tracks: FtTrack[];
  artistAvatar?: string;
  artistBio?: string;
}

export interface FtReleaseItem {
  id: string;
  params: string;
  owner: string;
  title: string;
  artist: string;
  creator?: string;
  cover?: string;
  ts: number;
}

export interface FtArtistData {
  artistHex: string;
  artistName: string;
  creatorName?: string;
  releases: FtReleaseItem[];
}

export interface FtProfileInput {
  artistHex?: string;
  releases: { id: string; params: string }[];
}

/** Derive the Freenet ContractKey for FreeTunes' public release directory. */
export function freetunesDirKey(): ContractKey {
  return keyOf(FREETUNES_DIR_CODE_HASH, hexToBytes(FREETUNES_DIR_ADMIN));
}

/** Parse FreeTunes' directory contract state into validated, non-removed, non-blocked release items (newest first). */
export function parseFreetunesDirectory(state: Uint8Array): FtReleaseItem[] {
  try {
    const raw = JSON.parse(new TextDecoder().decode(state)) as {
      entries?: Record<string, Record<string, unknown>>;
      blocked?: { list?: unknown[] };
    };
    if (!raw || typeof raw.entries !== "object" || !raw.entries) return [];
    const blocked = new Set(
      Array.isArray(raw.blocked?.list)
        ? raw.blocked!.list.filter((x): x is string => typeof x === "string")
        : []
    );
    const out: FtReleaseItem[] = [];
    for (const [id, e] of Object.entries(raw.entries)) {
      if (!ID_RE.test(id) || blocked.has(id) || !e || typeof e !== "object") continue;
      if (e.removed === true) continue;
      const params = typeof e.params === "string" ? e.params.toLowerCase() : "";
      if (!/^[0-9a-f]{96,}$/.test(params)) continue;
      const owner = params.slice(0, 64);
      const cover = typeof e.cover === "string" && ID_RE.test(e.cover) ? e.cover : undefined;
      out.push({
        id,
        params,
        owner,
        title: str(e.title) || "Untitled",
        artist: str(e.artist) || "Unknown artist",
        cover,
        ts: Number(e.ts) || 0,
      });
    }
    return out.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

/** Filter directory releases belonging to a 64-hex artist persona. */
export function freetunesReleasesForArtist(entries: FtReleaseItem[], artistHex: string): FtReleaseItem[] {
  const norm = artistHex.trim().toLowerCase();
  if (!HEX64_RE.test(norm)) return [];
  return entries.filter((e) => e.owner === norm);
}

/** Extract all `#/r/<id>.<params>` release references in a block of text (e.g. posts or profile config). */
export function freetunesAllReleaseRefs(text: string): { id: string; params: string; owner: string }[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: { id: string; params: string; owner: string }[] = [];
  LINK_GLOBAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_GLOBAL_RE.exec(text)) !== null) {
    const id = m[1];
    const params = m[2].toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      out.push({ id, params, owner: params.slice(0, 64) });
    }
  }
  return out;
}

/** Parse Edit Profile input for FreeTunes: artist link (`#/a/<hex>`), 64-hex / Base58 persona, and/or `#/r/<id>.<params>` release links. */
export function parseFreetunesProfileInput(raw: string): FtProfileInput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const releases = freetunesAllReleaseRefs(trimmed).map(({ id, params }) => ({ id, params }));
  const artistMatch = ARTIST_HASH_RE.exec(trimmed);
  if (artistMatch) {
    const rawVal = artistMatch[1].trim();
    if (HEX64_RE.test(rawVal)) {
      return { artistHex: rawVal.toLowerCase(), releases };
    }
    const b58 = fromBase58(rawVal);
    if (b58 && b58.length === 32) {
      return { artistHex: bytesToHex(b58).toLowerCase(), releases };
    }
  }
  if (releases.length > 0) {
    return { artistHex: releases[0].params.slice(0, 64), releases };
  }
  if (HEX64_RE.test(trimmed)) {
    return { artistHex: trimmed.toLowerCase(), releases: [] };
  }
  const b58 = fromBase58(trimmed);
  if (b58 && b58.length === 32) {
    return { artistHex: bytesToHex(b58).toLowerCase(), releases: [] };
  }
  return null;
}

export function freetunesArtistHref(artistHex: string, origin = defaultNodeOrigin()): string {
  return `${origin}/v1/contract/web/${FREETUNES_SITE}/#/a/${artistHex.toLowerCase()}`;
}

export function freetunesReleaseHref(
  id: string,
  params?: string,
  track?: number,
  origin = defaultNodeOrigin()
): string {
  if (!params) return `${origin}/v1/contract/web/${FREETUNES_SITE}/`;
  const suffix = track !== undefined && track > 0 ? `/${track}` : "";
  return `${origin}/v1/contract/web/${FREETUNES_SITE}/#/r/${id}.${params}${suffix}`;
}

/** The first FreeTunes link in a caption: the release and the track it points at (0 when none). */
export function freetunesLink(caption: string): { release: string; track: number } | null {
  const m = LINK_RE.exec(caption);
  return m ? { release: m[1], track: Number(m[3] ?? 0) } : null;
}

/** Detailed FreeTunes release reference from a caption, including hex parameters for direct FreeTunes deep-linking. */
export function freetunesReleaseRef(
  caption: string
): { release: string; params: string; track: number; explicitTrack: boolean } | null {
  const m = LINK_RE.exec(caption);
  if (!m) return null;
  return {
    release: m[1],
    params: m[2].toLowerCase(),
    track: Number(m[3] ?? 0),
    explicitTrack: m[3] !== undefined,
  };
}

/** Detect a FreeTunes artist profile link (`.../HiAQ4uc.../#/a/<64-hex>`) in a caption. */
export function freetunesArtistLink(caption: string): string | null {
  const m = ARTIST_LINK_RE.exec(caption);
  return m ? m[1].toLowerCase() : null;
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/** A release contract's state, checked: it comes from the network, so only well-formed addresses are kept. */
export function parseRelease(state: Uint8Array): FtRelease | null {
  try {
    const meta = JSON.parse(JSON.parse(new TextDecoder().decode(state)).meta_json);
    if (meta.deleted || !Array.isArray(meta.tracks)) return null;
    const tracks = meta.tracks.flatMap((t: { title?: unknown; chunks?: { a?: unknown; ms?: unknown }[] }) => {
      const chunks = Array.isArray(t?.chunks) ? t.chunks : [];
      if (!chunks.length || !chunks.every((c) => typeof c?.a === "string" && ID_RE.test(c.a))) return [];
      return [{ title: str(t.title) || "Untitled", chunks: chunks.map((c) => c.a as string), ms: chunks.reduce((s, c) => s + (Number(c.ms) || 0), 0) }];
    });
    const cover = str(meta.cover?.addr);
    const artistAvatar = str(meta.artist_avatar);
    const artistBio = str(meta.artist_bio, 400);
    const creator = str(meta.creator || meta.creator_name);
    return {
      title: str(meta.title),
      artist: str(meta.artist),
      creator: creator || undefined,
      cover: ID_RE.test(cover) ? cover : undefined,
      tracks,
      artistAvatar: ID_RE.test(artistAvatar) ? artistAvatar : undefined,
      artistBio: artistBio || undefined,
    };
  } catch {
    return null;
  }
}

export const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The placeholder in a post: the same html every draw (the feed reuses unchanged cards), filled in by `fillFreetunes`. */
export const freetunesCard = (caption: string, origin = defaultNodeOrigin()): string => {
  const rel = freetunesReleaseRef(caption);
  if (rel) {
    return `<div class="ft-card" data-release="${rel.release}" data-params="${rel.params}" data-track="${rel.track}" data-explicit="${rel.explicitTrack ? "1" : "0"}"><span class="ft-note">♪ FreeTunes</span></div>`;
  }
  const artistHex = freetunesArtistLink(caption);
  if (artistHex) {
    const href = freetunesArtistHref(artistHex, origin);
    return (
      `<div class="ft-artist-card blog-post-card" data-ft-artist="${esc(artistHex)}">` +
      `<div class="blog-embed-card">` +
      `<div class="blog-embed-head">` +
      `<span class="blog-badge ft-badge">♪ FreeTunes Artist</span>` +
      `<span class="blog-embed-sitename">${esc(artistHex.slice(0, 8))}…</span>` +
      `</div>` +
      `<a class="blog-embed-title ft-artist-embed-name" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Artist on FreeTunes</a>` +
      `<div class="ft-artist-embed-releases"></div>` +
      `<div class="blog-embed-footer">` +
      `<a class="blog-embed-read" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Listen on FreeTunes \u2197</a>` +
      `</div>` +
      `</div>` +
      `</div>`
    );
  }
  return "";
};

type Fetch = (instance: string) => Promise<Uint8Array | null>;
const releases = new Map<string, Promise<FtRelease | null>>();
const coverUrls = new Map<string, Promise<string | null>>();
const once = (t: EventTarget, ev: string) => new Promise<void>((r) => t.addEventListener(ev, () => r(), { once: true }));

export function loadCachedRelease(id: string, get: Fetch): Promise<FtRelease | null> {
  let p = releases.get(id);
  if (!p) {
    p = get(id).then((s) => (s ? parseRelease(s) : null)).catch(() => null);
    releases.set(id, p);
    void p.then((r) => r || releases.delete(id));
  }
  return p;
}

export function loadCoverUrl(addr: string, get: Fetch): Promise<string | null> {
  let p = coverUrls.get(addr);
  if (!p) {
    p = get(addr)
      .then((b) => (b ? URL.createObjectURL(new Blob([b as BlobPart], { type: "image/jpeg" })) : null))
      .catch(() => null);
    coverUrls.set(addr, p);
    void p.then((u) => u || coverUrls.delete(addr));
  }
  return p;
}

function pauseOtherFtAudio(except: HTMLAudioElement): void {
  document.querySelectorAll<HTMLAudioElement>(".ft-card audio, .ft-profile-card audio, #cm-shared-audio, #global-audio-el").forEach((a) => {
    if (a !== except) a.pause();
  });
}

/** Fill the FreeTunes placeholders under `root` that are not filled yet: cover, titles, tracklist, and inline player. */
export function fillFreetunes(
  root: ParentNode,
  get: Fetch,
  origin = defaultNodeOrigin(),
  getArtist?: (artistHex: string) => Promise<FtArtistData | null>
): void {
  root.querySelectorAll<HTMLElement>(".ft-card:not([data-state])").forEach((card) => {
    card.dataset.state = "loading";
    const id = card.dataset.release!;
    const params = card.dataset.params || "";
    void loadCachedRelease(id, get).then((rel) => {
      let currentIdx = Math.min(Math.max(0, Number(card.dataset.track) || 0), Math.max(0, (rel?.tracks.length ?? 1) - 1));
      const initialTrack = rel?.tracks[currentIdx] ?? rel?.tracks[0];
      if (!rel || !initialTrack) {
        card.dataset.state = "missing";
        card.innerHTML = `<span class="ft-note">♪ FreeTunes: release not found on the network</span>`;
        return;
      }
      card.dataset.state = "ready";
      const multi = rel.tracks.length > 1;
      if (multi) card.classList.add("ft-card-album");
      const openHref = params ? freetunesReleaseHref(id, params, currentIdx, origin) : "";
      const tracklistHtml = multi
        ? `<div class="ft-tracklist">${rel.tracks
            .map(
              (tr, idx) =>
                `<button type="button" class="ft-track-row ${idx === currentIdx ? "active" : ""}" data-ft-idx="${idx}">` +
                `<span class="ft-track-num">${idx + 1}.</span>` +
                `<span class="ft-track-name">${esc(tr.title)}</span>` +
                `<span class="ft-track-dur">${fmtTime(tr.ms)}</span>` +
                `</button>`
            )
            .join("")}</div>`
        : "";
      const footerHtml = openHref
        ? `<div class="ft-card-foot"><a class="ft-open-link" href="${esc(openHref)}" target="_blank" rel="noopener noreferrer">Open on FreeTunes \u2197</a></div>`
        : "";

      card.innerHTML =
        `<div class="ft-card-main">` +
        `<div class="ft-cover">♪</div>` +
        `<div class="ft-info">` +
        `<b class="ft-active-title">${esc(initialTrack.title)}</b>` +
        `<small>${esc(rel.artist)}${multi ? ` · ${esc(rel.title)}` : ""}</small>` +
        `<small class="ft-status">${fmtTime(initialTrack.ms)}</small>` +
        `</div>` +
        `<button type="button" class="ft-play" aria-label="Play ${esc(initialTrack.title)}">▶</button>` +
        `</div>` +
        tracklistHtml +
        footerHtml +
        `<audio preload="none"></audio>`;

      if (rel.cover) {
        void loadCoverUrl(rel.cover, get).then((url) => {
          const cov = card.querySelector(".ft-cover");
          if (url && cov) cov.innerHTML = `<img alt="" src="${url}" />`;
        });
      }

      const audio = card.querySelector("audio")!;
      const btn = card.querySelector<HTMLButtonElement>(".ft-play")!;
      const titleEl = card.querySelector<HTMLElement>(".ft-active-title")!;
      const status = card.querySelector<HTMLElement>(".ft-status")!;
      const openLinkEl = card.querySelector<HTMLAnchorElement>(".ft-open-link");

      let loadedIdx = -1;
      let playGen = 0;

      audio.onplay = () => {
        pauseOtherFtAudio(audio);
        btn.textContent = "❚❚";
      };
      audio.onpause = () => (btn.textContent = "▶");
      audio.onended = () => {
        btn.textContent = "▶";
        if (multi && currentIdx + 1 < rel.tracks.length) {
          startTrack(currentIdx + 1);
        }
      };

      const startTrack = (idx: number) => {
        const tr = rel.tracks[idx];
        if (!tr) return;
        currentIdx = idx;
        loadedIdx = idx;
        const gen = ++playGen;
        titleEl.textContent = tr.title;
        btn.setAttribute("aria-label", `Play ${tr.title}`);
        if (openLinkEl && params) openLinkEl.href = freetunesReleaseHref(id, params, idx, origin);
        card.querySelectorAll<HTMLElement>(".ft-track-row").forEach((r) => {
          r.classList.toggle("active", Number(r.dataset.ftIdx) === idx);
        });
        audio.pause();
        status.textContent = "Loading…";
        void streamFreetunesTrack(
          audio,
          tr.chunks,
          get,
          (d, n) => {
            if (gen === playGen) status.textContent = d < n ? `Loading ${d}/${n}` : fmtTime(tr.ms);
          },
          () => gen === playGen
        ).catch(() => {
          if (gen === playGen) {
            loadedIdx = -1;
            status.textContent = "Could not load the track";
          }
        });
      };

      btn.onclick = () => {
        if (loadedIdx === currentIdx) {
          return void (audio.paused ? audio.play() : audio.pause());
        }
        startTrack(currentIdx);
      };

      card.querySelectorAll<HTMLButtonElement>(".ft-track-row").forEach((row) => {
        row.onclick = () => {
          const idx = Number(row.dataset.ftIdx) || 0;
          if (loadedIdx === idx) {
            void (audio.paused ? audio.play() : audio.pause());
          } else {
            startTrack(idx);
          }
        };
      });
    });
  });

  if (getArtist) {
    root.querySelectorAll<HTMLElement>(".ft-artist-card:not([data-state])").forEach((card) => {
      card.dataset.state = "loading";
      const pk = card.dataset.ftArtist || "";
      if (!pk) return;
      void getArtist(pk).then((data) => {
        if (!data || !data.releases.length) {
          card.dataset.state = "empty";
          return;
        }
        card.dataset.state = "ready";
        const nameEl = card.querySelector<HTMLElement>(".ft-artist-embed-name");
        const relEl = card.querySelector<HTMLElement>(".ft-artist-embed-releases");
        if (nameEl) nameEl.textContent = `${data.artistName} (${data.releases.length} release${data.releases.length === 1 ? "" : "s"})`;
        if (relEl) {
          relEl.innerHTML =
            `<div class="blog-card-pages" style="padding: 4px 0 8px;">` +
            data.releases
              .slice(0, 8)
              .map(
                (r) =>
                  `<a href="${esc(freetunesReleaseHref(r.id, r.params, undefined, origin))}" target="_blank" rel="noopener noreferrer">♪ ${esc(r.title)}</a>`
              )
              .join("") +
            `</div>`;
        }
      });
    });
  }
}

/** Inspect browser local storage for FreeTunes artist profile saved on this node. */
export function localFreetunesArtist(): { artistHex?: string; artistName?: string; creatorName?: string } {
  try {
    if (typeof localStorage === "undefined") return {};
    const creatorName = localStorage.getItem("ft-creator-name") || undefined;
    const artistName = creatorName || localStorage.getItem("ft-artist") || undefined;
    let artistHex: string | undefined;
    const session = localStorage.getItem("ft-session");
    if (session) {
      try {
        const parsed = JSON.parse(session);
        if (typeof parsed?.persona === "string" && HEX64_RE.test(parsed.persona)) {
          artistHex = parsed.persona.toLowerCase();
        }
      } catch {}
    }
    return { artistHex, artistName, creatorName };
  } catch {
    return {};
  }
}

/** Read unlisted FreeTunes releases saved in local storage on this node. */
export function localFreetunesReleases(): FtReleaseItem[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem("ft-releases");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: FtReleaseItem[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const hash = typeof item.hash === "string" ? item.hash : "";
      const ref = freetunesReleaseRef(hash);
      if (ref) {
        out.push({
          id: ref.release,
          params: ref.params,
          owner: ref.params.slice(0, 64),
          title: str(item.title) || "Untitled",
          artist: str(item.artist) || "Unknown artist",
          creator: typeof item.creator === "string" ? str(item.creator) : undefined,
          cover: typeof item.cover === "string" && ID_RE.test(item.cover) ? item.cover : undefined,
          ts: Date.now(),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Render an artist's releases card on their Radica profile, matching Delta / Orto / Asocial profile cards. */
export function freetunesProfileCard(
  data: FtArtistData | null,
  origin = defaultNodeOrigin(),
  authorDisplayName?: string
): string {
  if (!data || (!data.artistHex && !data.releases.length)) return "";
  const artistKey = (data.artistHex || data.releases[0]?.owner || "").toLowerCase();
  const href = freetunesArtistHref(artistKey, origin);
  const count = data.releases.length;
  const sub = count > 0 ? `${count} release${count === 1 ? "" : "s"} on FreeTunes` : "Artist on FreeTunes";
  const displayTitle =
    data.creatorName ||
    (data.artistName && data.artistName !== "FreeTunes Artist" ? data.artistName : "") ||
    authorDisplayName ||
    data.artistName ||
    "FreeTunes Artist";

  const itemsHtml = count > 0
    ? data.releases
        .slice(0, 8)
        .map((r) => {
          const relHref = freetunesReleaseHref(r.id, r.params, undefined, origin);
          return (
            `<div class="ft-prof-release" data-ft-rel="${esc(r.id)}">` +
            `<span class="ft-prof-cover" ${r.cover ? `data-ft-cover="${esc(r.cover)}"` : ""}>♪</span>` +
            `<button type="button" class="ft-prof-play" data-ft-play="${esc(r.id)}" title="Play preview" aria-label="Play ${esc(r.title)}">▶</button>` +
            `<a class="ft-prof-link" href="${esc(relHref)}" target="_blank" rel="noopener noreferrer">` +
            `<span class="ft-prof-title">${esc(r.title || "Untitled")}</span>` +
            `<span class="ft-prof-meta" data-ft-meta="${esc(r.id)}">${esc(r.artist)}</span>` +
            `</a>` +
            `</div>`
          );
        })
        .join("")
    : "";

  return (
    `<div class="blog-card ft-profile-card">` +
    `<div class="blog-card-head">` +
    `<span class="link-card-icon ft-prof-badge-icon" aria-hidden="true">♪</span>` +
    `<span class="link-card-text">` +
    `<span class="link-card-host">Music on FreeTunes</span>` +
    `<span class="link-card-title">${esc(displayTitle)}</span>` +
    `<span class="blog-card-desc">${esc(sub)}</span>` +
    `</span>` +
    `<div class="blog-card-actions">` +
    `<a class="blog-card-open" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="Open on FreeTunes" aria-label="Open on FreeTunes">\u2197</a>` +
    `<button type="button" class="blog-card-toggle" aria-label="Toggle section" title="Collapse / expand">` +
    `<svg class="blog-card-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
    `</button>` +
    `</div>` +
    `</div>` +
    (count > 0
      ? `<div class="ft-prof-releases">${itemsHtml}</div><audio preload="none"></audio>`
      : `<div class="ft-prof-empty"><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open artist profile on FreeTunes ↗</a></div>`) +
    `</div>`
  );
}

/** Hydrate cover thumbnails and inline play buttons inside `freetunesProfileCard`. */
export function fillFreetunesProfile(root: ParentNode, get: Fetch): void {
  root.querySelectorAll<HTMLElement>(".ft-profile-card:not([data-hydrated])").forEach((card) => {
    card.dataset.hydrated = "1";
    card.querySelectorAll<HTMLElement>("[data-ft-cover]").forEach((cov) => {
      const addr = cov.dataset.ftCover;
      if (!addr) return;
      void loadCoverUrl(addr, get).then((url) => {
        if (url && cov.isConnected) cov.innerHTML = `<img alt="" src="${url}" />`;
      });
    });

    const audio = card.querySelector("audio");
    if (!audio) return;
    let activeId = "";
    let playGen = 0;

    const syncBtns = (playing: boolean) => {
      card.querySelectorAll<HTMLButtonElement>("[data-ft-play]").forEach((b) => {
        b.textContent = playing && b.dataset.ftPlay === activeId ? "❚❚" : "▶";
      });
    };

    audio.onplay = () => {
      pauseOtherFtAudio(audio);
      syncBtns(true);
    };
    audio.onpause = audio.onended = () => syncBtns(false);

    card.querySelectorAll<HTMLButtonElement>("[data-ft-play]").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.ftPlay!;
        if (activeId === id) {
          return void (audio.paused ? audio.play() : audio.pause());
        }
        activeId = id;
        const gen = ++playGen;
        audio.pause();
        const metaEl = card.querySelector<HTMLElement>(`[data-ft-meta="${CSS.escape(id)}"]`);
        const origMeta = metaEl?.textContent || "";
        if (metaEl) metaEl.textContent = "Loading…";
        void loadCachedRelease(id, get).then((rel) => {
          if (gen !== playGen) return;
          const tr = rel?.tracks[0];
          if (!tr) {
            activeId = "";
            if (metaEl) metaEl.textContent = "Unavailable";
            return;
          }
          void streamFreetunesTrack(
            audio,
            tr.chunks,
            get,
            (d, n) => {
              if (gen === playGen && metaEl) {
                metaEl.textContent = d < n ? `Loading ${d}/${n}` : `${tr.title} · ${fmtTime(tr.ms)}`;
              }
            },
            () => gen === playGen
          ).catch(() => {
            if (gen === playGen) {
              activeId = "";
              if (metaEl) metaEl.textContent = origMeta || "Could not load";
            }
          });
        });
      };
    });
  });
}

async function chunk(get: Fetch, id: string): Promise<Uint8Array> {
  const b = await get(id);
  if (!b) throw new Error("chunk not found");
  return b;
}

/** Play a track while its chunks arrive (each is a valid MP3 piece); without MediaSource for MP3, download it all first. */
export async function streamFreetunesTrack(
  a: HTMLAudioElement,
  chunks: string[],
  get: Fetch,
  progress: (done: number, total: number) => void,
  stillCurrent: () => boolean = () => true
) {
  if (!("MediaSource" in window) || !MediaSource.isTypeSupported("audio/mpeg")) {
    const parts: Uint8Array[] = [];
    for (const c of chunks) {
      const part = await chunk(get, c);
      if (!stillCurrent()) return;
      parts.push(part);
      progress(parts.length, chunks.length);
    }
    a.src = URL.createObjectURL(new Blob(parts as BlobPart[], { type: "audio/mpeg" }));
    return void (await a.play().catch(() => {}));
  }
  const ms = new MediaSource();
  a.src = URL.createObjectURL(ms);
  await once(ms, "sourceopen");
  if (!stillCurrent()) return;
  const sb = ms.addSourceBuffer("audio/mpeg");
  let next = chunk(get, chunks[0]);
  for (let i = 0; i < chunks.length; i++) {
    const data = await next;
    if (!stillCurrent()) return;
    if (i + 1 < chunks.length) next = chunk(get, chunks[i + 1]); // fetch the next while this one is appended
    const done = once(sb, "updateend");
    sb.appendBuffer(data as BufferSource);
    await done;
    if (!stillCurrent()) return;
    if (i === 0) await a.play().catch(() => {});
    progress(i + 1, chunks.length);
  }
  if (stillCurrent() && ms.readyState === "open") ms.endOfStream();
}
