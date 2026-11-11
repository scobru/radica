// Spore Radio integration (github.com/scobru/spore) for Radica.
// Sovereign P2P Live Audio Streaming & Heartbeat Presence Detection on Freenet.
// Detects spore:radio:<key> links and renders interactive Live Radio cards with live/offline presence.

import { escapeHtml as esc } from "./html.ts";

export const SPORE_REPO = "https://github.com/scobru/spore";

export interface SporeRadioRef {
  djKey: string;
  stationName?: string;
  genre?: string;
  nowPlaying?: string;
  isLive?: boolean;
}

// Memory cache of known live stations and heartbeats
const RADIO_HEARTBEATS = new Map<string, { timestamp: number; nowPlaying?: string; stationName?: string }>();

/** Record an incoming or local radio heartbeat (e.g. from Freenet contract state) */
export function recordSporeRadioHeartbeat(djKey: string, stationName?: string, nowPlaying?: string, timestamp = Date.now()) {
  RADIO_HEARTBEATS.set(djKey.toLowerCase(), { timestamp, stationName, nowPlaying });
}

/** Check if a radio station is currently broadcasting (heartbeat received in the last 60 seconds) */
export function isSporeRadioLive(djKey: string): boolean {
  const hb = RADIO_HEARTBEATS.get(djKey.toLowerCase());
  if (!hb) return false;
  return Date.now() - hb.timestamp < 60_000;
}

/** Regex to detect spore:radio:<key>, spore://radio/<key>, #spore-radio/<key>, #spore-radio=<key> or markdown link [label](spore:radio:<key>) */
const SPORE_RADIO_RE = /(?:spore:radio:|spore:\/\/radio\/|#\/?spore-radio[\/=])([a-zA-Z0-9_-]{3,64})/i;
const SPORE_MD_RE = /\[([^\]]+)\]\((?:spore:radio:|spore:\/\/radio\/|#\/?spore-radio[\/=])([a-zA-Z0-9_-]{3,64})\)/i;

export function sporeRadioLink(caption: string): SporeRadioRef | null {
  if (!caption) return null;

  // 1. Check markdown format [Station Name](spore:radio:<key>)
  const mdMatch = SPORE_MD_RE.exec(caption);
  if (mdMatch) {
    const rawLabel = mdMatch[1];
    const key = mdMatch[2];
    const hb = RADIO_HEARTBEATS.get(key.toLowerCase());
    const live = hb ? Date.now() - hb.timestamp < 60_000 : undefined;
    return {
      djKey: key,
      stationName: rawLabel.replace(/^📻\s*/, ""),
      nowPlaying: hb?.nowPlaying,
      isLive: live,
    };
  }

  // 2. Check plain uri format spore:radio:<key>
  const match = SPORE_RADIO_RE.exec(caption);
  if (match) {
    const key = match[1];
    const hb = RADIO_HEARTBEATS.get(key.toLowerCase());
    const live = hb ? Date.now() - hb.timestamp < 60_000 : undefined;
    return {
      djKey: key,
      stationName: hb?.stationName,
      nowPlaying: hb?.nowPlaying,
      isLive: live,
    };
  }

  return null;
}

/** Render a Spore Radio Card in feeds and chat */
export function sporeRadioCard(caption: string): string {
  const ref = sporeRadioLink(caption);
  if (!ref) return "";

  const djDisplay = ref.djKey.length > 12 ? `${ref.djKey.slice(0, 8)}...` : ref.djKey;
  const station = ref.stationName || `Spore FM (@${djDisplay})`;
  const isLive = ref.isLive ?? true; // By default when freshly posted consider live unless heartbeat expired
  const nowPlaying = ref.nowPlaying || "Continuous P2P Audio Stream";
  const sporeUri = `spore:radio:${ref.djKey}`;

  const statusBadge = isLive
    ? `<span class="spore-radio-live-badge"><span class="spore-radio-pulse"></span>🔴 LIVE NOW</span>`
    : `<span class="spore-radio-offline-badge">⚪ OFFLINE</span>`;

  return (
    `<div class="spore-radio-card blog-post-card" data-dj-key="${esc(ref.djKey)}">` +
    `<div class="blog-embed-card spore-radio-embed">` +
    `<div class="blog-embed-head">` +
    `<span class="blog-badge spore-radio-badge">&#x1F4FB; Spore Radio</span>` +
    statusBadge +
    `<span class="spore-radio-ring-badge">4-Slot Ring Buffer</span>` +
    `</div>` +
    `<div class="spore-radio-body">` +
    `<div class="spore-radio-station-title">${esc(station)}</div>` +
    `<div class="spore-radio-meta">DJ: <b>@${esc(djDisplay)}</b> \u00B7 <span class="spore-radio-protocol">Freenet P2P Stream</span></div>` +
    `<div class="spore-radio-now-playing">` +
    `<span class="spore-radio-np-icon">&#x1F3B5;</span> ` +
    `<span class="spore-radio-np-text">${esc(nowPlaying)}</span>` +
    `</div>` +
    `</div>` +
    `<div class="spore-radio-footer">` +
    `<a class="btn-primary btn-xs spore-radio-listen-btn" href="${esc(sporeUri)}" target="_blank" rel="noopener noreferrer" title="Tune in via Spore Desktop Client">` +
    `&#x25B6; Tune In on Spore` +
    `</a>` +
    `<a class="btn-secondary btn-xs" href="${esc(SPORE_REPO)}" target="_blank" rel="noopener noreferrer" title="About Spore Client">` +
    `About Spore \u2197` +
    `</a>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}
