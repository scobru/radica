// End-to-end encrypted images, voice notes, and audio attachments for Radica chat.
// Every attachment is sealed on-device with a fresh random 256-bit AES-GCM key before publishing to Freenet's
// content-addressed `media-contract` (up to 768 KB). The random key travels only inside the chat message itself,
// so Freenet nodes hold opaque ciphertext and deleting the message crypto-shreds the attachment key.

import { bytesToHex, hexToBytes } from "./crypto.ts";
import { mediaHashOf } from "./media.ts";
import { compressPostImageFile } from "./avatar.ts";
import { escapeHtml as esc } from "./html.ts";
import { renderIcon } from "./icons.ts";
import type { ImageModerationResult } from "./moderation.ts";
import { encodeFEC, decodeFEC } from "freenet-blob";

/** Hard cap enforced by media-contract/src/lib.rs (`MAX_MEDIA = 768 * 1024`). */
export const MAX_CHAT_MEDIA_SEALED = 768 * 1024;
/** 12-byte AES-GCM IV + 16-byte authentication tag = 28 bytes overhead. */
export const MAX_CHAT_MEDIA_PLAIN = MAX_CHAT_MEDIA_SEALED - 28;

/** Bigger files are split into sealed chunks (one media contract each) plus a sealed manifest listing them. */
export const MAX_CHAT_FILE_BYTES = 25 * 1024 * 1024;
const CHUNK_MANIFEST_MAGIC = "radica-chunks1\n";
const CHUNK_MANIFEST_FEC_MAGIC = "radica-fec1\n";

/** Longest voice note: the chat token stores durations up to an hour. */
export const MAX_VOICE_SEC = 3600;

/** Circular video messages ("video notes"): max 60s and 12 MB encrypted chunk cap. */
export const MAX_VNOTE_SEC = 60;
export const MAX_VNOTE_BYTES = 12 * 1024 * 1024;
const VNOTE_SCAN_EVERY_SEC = 2;

export const WAVEFORM_BARS = 28;

export type ChatMediaKind = "img" | "voice" | "audio" | "file" | "vnote";

export interface ChatMediaItem {
  raw: string;
  kind: ChatMediaKind;
  mime: string;
  hash: string; // 64-char hex BLAKE3 of sealed payload
  keyHex: string; // 64-char hex 256-bit AES-GCM key
  width?: number;
  height?: number;
  durationSec?: number;
  waveform?: number[]; // 0..15 integer bar heights
  sizeBytes?: number;
  filename?: string;
  posterHash?: string; // 64-char hex BLAKE3 of sealed JPEG poster for vnote
}

export interface PreparedChatMedia {
  kind: ChatMediaKind;
  bytes: Uint8Array;
  mime: string;
  label: string;
  previewUrl: string;
  width?: number;
  height?: number;
  durationSec?: number;
  waveform?: number[];
  sizeBytes?: number;
  filename?: string;
  posterBlob?: Blob;
}

export const SAFE_IMAGE_MIMES = new Set([
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/gif",
]);

export const SAFE_AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/aac",
]);

export const SAFE_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
]);

/** Normalize browser/OS video MIME strings to our safe video-note allowlist. */
export function normalizeVideoMime(rawMime: string, filename = ""): string | null {
  const base = (rawMime || "").split(";")[0].trim().toLowerCase();
  if (SAFE_VIDEO_MIMES.has(base)) return base;
  if (base === "video/quicktime" || base === "video/x-m4v") return "video/mp4";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "mp4" || ext === "m4v" || ext === "mov") return "video/mp4";
  if (ext === "webm") return "video/webm";
  return null;
}

/** Square output size and target bitrate for a circular video note; null if over the 60s cap. */
export function videoNotePlan(
  durationSec: number,
  sourceWidth: number,
  sourceHeight: number
): { size: number; bitrate: number } | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > MAX_VNOTE_SEC + 1.5) return null;
  const minDim = Math.min(sourceWidth || 360, sourceHeight || 360);
  const clamped = Math.max(160, Math.min(360, Math.floor(minDim)));
  const size = clamped & ~1; // keep even dimensions for H.264 YUV420
  const budgetBits = MAX_VNOTE_BYTES * 0.9 * 8;
  const audioBps = 48_000;
  const bitrate = Math.min(550_000, Math.floor(budgetBits / Math.max(1, durationSec)) - audioBps);
  if (!(bitrate >= 180_000)) return null;
  return { size, bitrate };
}

/** Seconds to sample for on-device frame moderation: every 2s, plus near the end. */
export function scanTimes(duration: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < duration; t += VNOTE_SCAN_EVERY_SEC) out.push(t);
  if (duration > 0 && out[out.length - 1] < duration - 0.5) out.push(duration - 0.5);
  return out;
}

/** Whether an MP4's first bytes declare movie fragments ("mvex" in its moov): playable progressively. */
export function isFragmentedMp4(head: Uint8Array): boolean {
  const n = Math.min(head.byteLength, 1 << 16);
  for (let i = 0; i + 4 <= n; i++) {
    if (head[i] === 0x6d && head[i + 1] === 0x76 && head[i + 2] === 0x65 && head[i + 3] === 0x78) return true;
  }
  return false;
}


/** Normalize browser/OS audio MIME strings to our strict safe allowlist. */
export function normalizeAudioMime(rawMime: string, filename = ""): string | null {
  const base = (rawMime || "").split(";")[0].trim().toLowerCase();
  if (SAFE_AUDIO_MIMES.has(base)) return base;
  if (base === "audio/mp3" || base === "audio/mpeg3" || base === "audio/x-mpeg-3") return "audio/mpeg";
  if (base === "audio/x-m4a" || base === "audio/m4a" || base === "video/mp4") return "audio/mp4";
  if (base === "audio/x-wav" || base === "audio/wave") return "audio/wav";
  if (base === "audio/x-aac") return "audio/aac";
  if (base === "audio/opus") return "audio/ogg";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "ogg" || ext === "oga" || ext === "opus") return "audio/ogg";
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  if (ext === "webm") return "audio/webm";
  if (ext === "wav") return "audio/wav";
  if (ext === "aac") return "audio/aac";
  return null;
}

export function formatMediaDuration(sec?: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(sec) ? (sec as number) : 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtensionIcon(filename = ""): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) return "📕";
  if (["zip", "tar", "gz", "7z", "rar", "bz2", "xz"].includes(ext)) return "📦";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "📝";
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx", "odp"].includes(ext)) return "📈";
  if (["txt", "md", "json", "xml", "yaml", "yml"].includes(ext)) return "📄";
  if (["mp3", "ogg", "wav", "flac", "aac", "m4a"].includes(ext)) return "🎵";
  if (["mp4", "webm", "mkv", "avi", "mov"].includes(ext)) return "🎬";
  return "📎";
}

export function defaultWaveform(seedHex: string, bars = WAVEFORM_BARS): number[] {
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const code = seedHex.charCodeAt(i % Math.max(1, seedHex.length)) || 7;
    const v = 3 + ((code * (i + 5) * 13) % 11);
    out.push(Math.max(2, Math.min(15, v)));
  }
  return out;
}

function encodeWaveformHex(wf?: number[]): string {
  if (!wf || !wf.length) return "";
  return wf
    .slice(0, 32)
    .map((v) => Math.max(0, Math.min(15, Math.round(v))).toString(16))
    .join("");
}

function decodeWaveformHex(hex?: string): number[] | undefined {
  if (!hex || !/^[0-9a-f]{1,32}$/i.test(hex)) return undefined;
  return Array.from(hex.toLowerCase(), (c) => parseInt(c, 16));
}

// Token syntax:
//   [radica-cm1:img:<mime>:<hash64>:<key64>:<w>x<h>]
//   [radica-cm1:<voice|audio>:<mime>:<hash64>:<key64>:<durSec>(:<wfHex>)?]
//   [radica-cm1:file:<mime>:<hash64>:<key64>:<sizeBytes>:<filenameHex>]
//   [radica-cm1:vnote:<mime>:<hash64>:<key64>:<durSec>(:<posterHash64>)?]
const TOKEN_RE = /\[radica-cm1:(img|voice|audio|file|vnote):([a-z0-9/+.-]+):([0-9a-f]{64}):([0-9a-f]{64}):([0-9a-z.]+)(?::([0-9a-f]+))?\]/gi;

export function encodeChatMediaToken(item: Omit<ChatMediaItem, "raw">): string {
  const hash = item.hash.toLowerCase();
  const keyHex = item.keyHex.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash) || !/^[0-9a-f]{64}$/.test(keyHex)) {
    throw new Error("Invalid media hash or encryption key");
  }
  if (item.kind === "img") {
    if (!SAFE_IMAGE_MIMES.has(item.mime)) throw new Error(`Unsupported image MIME: ${item.mime}`);
    const w = Math.max(0, Math.min(9999, Math.round(item.width ?? 0)));
    const h = Math.max(0, Math.min(9999, Math.round(item.height ?? 0)));
    return `[radica-cm1:img:${item.mime}:${hash}:${keyHex}:${w}x${h}]`;
  }
  if (item.kind === "file") {
    const size = Math.max(0, Math.round(item.sizeBytes ?? 0));
    const safeName = (item.filename || "file").slice(0, 120);
    const nameHex = bytesToHex(new TextEncoder().encode(safeName));
    const safeMime = item.mime && /^[a-z0-9/+.-]+$/i.test(item.mime) ? item.mime.toLowerCase() : "application/octet-stream";
    return `[radica-cm1:file:${safeMime}:${hash}:${keyHex}:${size}:${nameHex}]`;
  }
  if (item.kind === "vnote") {
    if (!SAFE_VIDEO_MIMES.has(item.mime)) throw new Error(`Unsupported video MIME: ${item.mime}`);
    const dur = Math.max(0, Math.min(MAX_VNOTE_SEC, Math.round((item.durationSec ?? 0) * 10) / 10));
    const pHash = item.posterHash?.toLowerCase();
    if (pHash && !/^[0-9a-f]{64}$/.test(pHash)) throw new Error("Invalid poster hash");
    return `[radica-cm1:vnote:${item.mime}:${hash}:${keyHex}:${dur}${pHash ? `:${pHash}` : ""}]`;
  }
  if (!SAFE_AUDIO_MIMES.has(item.mime)) throw new Error(`Unsupported audio MIME: ${item.mime}`);
  const dur = Math.max(0, Math.min(3600, Math.round((item.durationSec ?? 0) * 10) / 10));
  const wf = encodeWaveformHex(item.waveform);
  return `[radica-cm1:${item.kind}:${item.mime}:${hash}:${keyHex}:${dur}${wf ? `:${wf}` : ""}]`;
}

function parseMatchedToken(m: RegExpExecArray): ChatMediaItem | null {
  const raw = m[0];
  const kind = m[1].toLowerCase() as ChatMediaKind;
  const mime = m[2].toLowerCase();
  const hash = m[3].toLowerCase();
  const keyHex = m[4].toLowerCase();
  const meta1 = m[5].toLowerCase();
  const meta2 = m[6];

  if (kind === "img") {
    if (!SAFE_IMAGE_MIMES.has(mime)) return null;
    const dim = /^(\d{1,4})x(\d{1,4})$/.exec(meta1);
    const width = dim ? Number(dim[1]) : 0;
    const height = dim ? Number(dim[2]) : 0;
    return {
      raw,
      kind,
      mime,
      hash,
      keyHex,
      ...(width > 0 && height > 0 ? { width, height } : {}),
    };
  }

  if (kind === "file") {
    const sizeBytes = Number(meta1);
    let filename = "file";
    if (meta2 && /^[0-9a-f]+$/i.test(meta2)) {
      try {
        filename = new TextDecoder().decode(hexToBytes(meta2));
      } catch {}
    }
    return {
      raw,
      kind,
      mime: mime || "application/octet-stream",
      hash,
      keyHex,
      sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : undefined,
      filename,
    };
  }

  if (kind === "vnote") {
    if (!SAFE_VIDEO_MIMES.has(mime)) return null;
    const dur = Number(meta1);
    if (!Number.isFinite(dur) || dur < 0 || dur > MAX_VNOTE_SEC) return null;
    const posterHash = meta2 && /^[0-9a-f]{64}$/i.test(meta2) ? meta2.toLowerCase() : undefined;
    return {
      raw,
      kind,
      mime,
      hash,
      keyHex,
      durationSec: dur,
      ...(posterHash ? { posterHash } : {}),
    };
  }

  if (!SAFE_AUDIO_MIMES.has(mime)) return null;
  const dur = Number(meta1);
  if (!Number.isFinite(dur) || dur < 0 || dur > 3600) return null;
  const waveform = decodeWaveformHex(meta2);
  return {
    raw,
    kind,
    mime,
    hash,
    keyHex,
    durationSec: dur,
    ...(waveform ? { waveform } : {}),
  };
}

/** Extract all valid media attachments from a chat message and return the clean remaining caption text. */
export function parseChatMedia(text: string): { items: ChatMediaItem[]; caption: string } {
  if (!text || !text.includes("[radica-cm1:")) return { items: [], caption: text || "" };
  const items: ChatMediaItem[] = [];
  let out = "";
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const parsed = parseMatchedToken(m);
    if (!parsed) continue;
    out += text.slice(last, m.index);
    items.push(parsed);
    last = m.index + m[0].length;
  }
  if (!items.length) return { items: [], caption: text };
  out += text.slice(last);
  const caption = out.replace(/^\n+|\n+$/g, "").trim();
  return { items, caption };
}

/** Mask attachment tokens before PII/profanity regex passes so hex/digits inside tokens are never altered. */
export function maskChatMediaTokens(text: string): { masked: string; restore: (s: string) => string } {
  if (!text.includes("[radica-cm1:")) return { masked: text, restore: (s) => s };
  const saved: string[] = [];
  TOKEN_RE.lastIndex = 0;
  const masked = text.replace(TOKEN_RE, (full) => `\uE020${saved.push(full) - 1}\uE021`);
  return {
    masked,
    restore: (s: string) => (saved.length ? s.replace(/\uE020(\d+)\uE021/g, (_, i) => saved[Number(i)] ?? "") : s),
  };
}

/** Human-friendly single-line summary for Inbox previews, Reply banners, Quote boxes, and Search. */
export function summarizeChatMediaText(text: string, formatPlain?: (t: string) => string): string {
  const { items, caption } = parseChatMedia(text);
  const cleanCaption = (formatPlain ? formatPlain(caption) : caption).replace(/\s+/g, " ").trim();
  if (!items.length) return cleanCaption;

  const first = items[0];
  let badge = "📷 Photo";
  if (first.kind === "voice") {
    badge = `🎙️ Voice message (${formatMediaDuration(first.durationSec)})`;
  } else if (first.kind === "audio") {
    badge = `🎵 Audio (${formatMediaDuration(first.durationSec)})`;
  } else if (first.kind === "vnote") {
    badge = `🎥 Video message (${formatMediaDuration(first.durationSec)})`;
  } else if (first.kind === "file") {
    const sz = first.sizeBytes ? ` (${formatBytes(first.sizeBytes)})` : "";
    badge = `📄 ${first.filename || "File"}${sz}`;
  }
  if (items.length > 1) badge += ` +${items.length - 1}`;
  if (!cleanCaption) return badge;
  const shortPrefix =
    first.kind === "img"
      ? "📷"
      : first.kind === "voice"
      ? `🎙️ (${formatMediaDuration(first.durationSec)})`
      : first.kind === "audio"
      ? "🎵"
      : first.kind === "vnote"
      ? `🎥 (${formatMediaDuration(first.durationSec)})`
      : "📄";
  return `${shortPrefix} ${cleanCaption}`;
}

// ---------------------------------------------------------------------------
// Per-attachment AES-256-GCM encryption & BLAKE3 integrity verification
// ---------------------------------------------------------------------------

export async function sealChatMedia(plainBytes: Uint8Array): Promise<{
  sealed: Uint8Array;
  hash: string;
  keyHex: string;
}> {
  if (!plainBytes.byteLength) throw new Error("Media file is empty");
  if (plainBytes.byteLength > MAX_CHAT_MEDIA_PLAIN) {
    throw new Error(
      `Attachment is ${Math.round(plainBytes.byteLength / 1024)} KB, exceeding Freenet's ${Math.floor(MAX_CHAT_MEDIA_PLAIN / 1024)} KB chat media limit.`
    );
  }
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    cryptoKey,
    plainBytes as BufferSource
  );
  const sealed = new Uint8Array(12 + cipherBuf.byteLength);
  sealed.set(iv, 0);
  sealed.set(new Uint8Array(cipherBuf), 12);
  return {
    sealed,
    hash: mediaHashOf(sealed),
    keyHex: bytesToHex(keyBytes),
  };
}

export async function openChatMedia(
  sealed: Uint8Array,
  expectedHash: string,
  keyHex: string
): Promise<Uint8Array | null> {
  if (
    !sealed ||
    sealed.byteLength <= 28 ||
    sealed.byteLength > MAX_CHAT_MEDIA_SEALED ||
    !/^[0-9a-f]{64}$/i.test(expectedHash) ||
    !/^[0-9a-f]{64}$/i.test(keyHex)
  ) {
    return null;
  }
  if (mediaHashOf(sealed) !== expectedHash.toLowerCase()) return null;
  try {
    const keyBytes = hexToBytes(keyHex.toLowerCase());
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes as BufferSource,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    const iv = sealed.subarray(0, 12);
    const body = sealed.subarray(12);
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      cryptoKey,
      body as BufferSource
    );
    return new Uint8Array(plainBuf);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Decrypted Blob URL Cache (keyed by hash + key prefix, LRU capped)
// ---------------------------------------------------------------------------

const MAX_BLOB_URLS = 150;
const blobCache = new Map<string, string>(); // `${hash}:${keyPrefix}` -> blob: URL
const inflightResolves = new Map<string, Promise<string | null>>();

function cacheKeyOf(hash: string, keyHex: string): string {
  return `${hash.toLowerCase()}:${keyHex.toLowerCase().slice(0, 16)}`;
}

function safeMimeForKind(kind: ChatMediaKind, mime: string): string {
  if (kind === "img") return SAFE_IMAGE_MIMES.has(mime) ? mime : "image/jpeg";
  if (kind === "file") return mime && /^[a-z0-9/+.-]+$/i.test(mime) ? mime : "application/octet-stream";
  if (kind === "vnote") return SAFE_VIDEO_MIMES.has(mime) ? mime : "video/mp4";
  return SAFE_AUDIO_MIMES.has(mime) ? mime : "audio/webm";
}

export function keepChatMediaUrl(
  hash: string,
  keyHex: string,
  plainBytes: Uint8Array,
  kind: ChatMediaKind,
  mime: string
): string {
  const ck = cacheKeyOf(hash, keyHex);
  const existing = blobCache.get(ck);
  if (existing) return existing;
  const safeMime = safeMimeForKind(kind, mime);
  const url = URL.createObjectURL(new Blob([plainBytes as BlobPart], { type: safeMime }));
  blobCache.set(ck, url);
  if (blobCache.size > MAX_BLOB_URLS) {
    const [oldestKey, oldestUrl] = blobCache.entries().next().value as [string, string];
    try {
      URL.revokeObjectURL(oldestUrl);
    } catch {}
    blobCache.delete(oldestKey);
  }
  return url;
}

export function resolveChatMediaUrl(
  item: ChatMediaItem,
  getSealed: (hash: string) => Promise<Uint8Array | null>,
  onProgress?: ChunkProgress,
  onPart?: (part: Uint8Array, index: number) => void
): Promise<string | null> {
  const ck = cacheKeyOf(item.hash, item.keyHex);
  const hit = blobCache.get(ck);
  if (hit) return Promise.resolve(hit);
  let p = inflightResolves.get(ck);
  if (!p) {
    p = fetchChatMedia(item.hash, item.keyHex, getSealed, onProgress, onPart)
      .then((plain) => {
        if (!plain) return null;
        return keepChatMediaUrl(item.hash, item.keyHex, plain, item.kind, item.mime);
      })
      .catch(() => null)
      .finally(() => inflightResolves.delete(ck));
    inflightResolves.set(ck, p);
  }
  return p;
}

/** Revoke any cached decrypted Blob URLs referenced by a deleted/cleared message. */
export function revokeChatMediaInText(text: string): void {
  const { items } = parseChatMedia(text);
  for (const item of items) {
    const ck = cacheKeyOf(item.hash, item.keyHex);
    const url = blobCache.get(ck);
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      blobCache.delete(ck);
    }
  }
}

// ---------------------------------------------------------------------------
// Client-side Image Compression, Audio Decoding & Voice Note Recording
// ---------------------------------------------------------------------------

function dataUriToBytesAndMime(uri: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(uri);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!SAFE_IMAGE_MIMES.has(mime)) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

/**
 * Seal an attachment of any size up to MAX_CHAT_FILE_BYTES. Small ones give one blob, as before. Bigger ones are cut
 * into chunks sealed with the same key, followed by a sealed manifest of their hashes; `hash` names the manifest, so
 * the chat token format does not change. Publish every blob in `blobs`.
 */
export async function sealChatMediaChunked(plainBytes: Uint8Array): Promise<{
  blobs: Uint8Array[];
  hash: string;
  keyHex: string;
}> {
  if (plainBytes.byteLength <= MAX_CHAT_MEDIA_PLAIN) {
    const { sealed, hash, keyHex } = await sealChatMedia(plainBytes);
    return { blobs: [sealed], hash, keyHex };
  }
  if (plainBytes.byteLength > MAX_CHAT_FILE_BYTES) {
    throw new Error(
      `File is ${Math.round(plainBytes.byteLength / 1024 / 1024)} MB, over the ${MAX_CHAT_FILE_BYTES / 1024 / 1024} MB chat attachment limit.`
    );
  }
  const keyHex = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const blobs: Uint8Array[] = [];
  const hashes: string[] = [];

  const fecRes = encodeFEC(plainBytes, { shardSize: MAX_CHAT_MEDIA_PLAIN });
  for (let i = 0; i < fecRes.totalShards; i++) {
    const shard = fecRes.shards[i];
    const sealed = await sealWithKey(shard.data, keyHex);
    blobs.push(sealed);
    hashes.push(mediaHashOf(sealed));
  }

  const manifestData = JSON.stringify({
    k: fecRes.k,
    m: fecRes.m,
    total: fecRes.totalShards,
    shardSize: fecRes.shardSize,
    originalSize: fecRes.originalSize,
    hashes,
  });
  const manifest = await sealWithKey(new TextEncoder().encode(CHUNK_MANIFEST_FEC_MAGIC + manifestData), keyHex);
  blobs.push(manifest);
  return { blobs, hash: mediaHashOf(manifest), keyHex };
}

/**
 * Publish sealed blobs, a few at a time (each is a contract PUT that can take many seconds). A failed blob is tried once
 * more before giving up. `onProgress(done, total)` runs after each blob, so the sender sees how far the upload is.
 */
export async function uploadChatMedia(
  blobs: Uint8Array[],
  put: (blob: Uint8Array) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void,
  parallel = 3
): Promise<void> {
  let next = 0;
  let done = 0;
  onProgress?.(0, blobs.length);
  const worker = async () => {
    while (next < blobs.length) {
      const blob = blobs[next++];
      await put(blob).catch(() => put(blob));
      onProgress?.(++done, blobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, blobs.length) }, worker));
}

/**
 * Send a staged attachment: seal it, keep the plain copy for our own instant preview, publish every piece (with
 * progress), and return the chat token that names it. Both chat views send attachments through here.
 */
export async function sendChatAttachment(
  media: PreparedChatMedia,
  put: (blob: Uint8Array) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void
): Promise<string> {
  const { blobs, hash, keyHex } = await sealChatMediaChunked(media.bytes);
  keepChatMediaUrl(hash, keyHex, media.bytes, media.kind, media.mime);
  let posterHash: string | undefined;
  if (media.kind === "vnote" && media.posterBlob) {
    const posterPlain = new Uint8Array(await media.posterBlob.arrayBuffer());
    if (posterPlain.byteLength > 0 && posterPlain.byteLength <= MAX_CHAT_MEDIA_PLAIN) {
      const sealedPoster = await sealWithKey(posterPlain, keyHex);
      posterHash = mediaHashOf(sealedPoster);
      blobs.push(sealedPoster);
      keepChatMediaUrl(posterHash, keyHex, posterPlain, "img", "image/jpeg");
    }
  }
  await uploadChatMedia(blobs, put, onProgress);
  return encodeChatMediaToken({
    kind: media.kind,
    mime: media.mime,
    hash,
    keyHex,
    width: media.width,
    height: media.height,
    durationSec: media.durationSec,
    waveform: media.waveform,
    sizeBytes: media.sizeBytes,
    filename: media.filename,
    posterHash,
  });
}

export async function sealWithKey(plainBytes: Uint8Array, keyHex: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", hexToBytes(keyHex) as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, cryptoKey, plainBytes as BufferSource);
  const sealed = new Uint8Array(12 + cipherBuf.byteLength);
  sealed.set(iv, 0);
  sealed.set(new Uint8Array(cipherBuf), 12);
  return sealed;
}

/** Pieces of a chunked attachment fetched so far (`done` of `total`), and how many of them failed. */
export type ChunkProgress = (done: number, total: number, missing: number) => void;

/** Fetch and open an attachment; a chunk manifest is followed and its chunks joined. Null if any piece is missing. */
export async function fetchChatMedia(
  hash: string,
  keyHex: string,
  getSealed: (hash: string) => Promise<Uint8Array | null>,
  onProgress?: ChunkProgress,
  onPart?: (part: Uint8Array, index: number) => void
): Promise<Uint8Array | null> {
  const sealed = await getSealed(hash);
  const plain = sealed && (await openChatMedia(sealed, hash, keyHex));
  if (!plain) return null;

  // 1. Resilient FEC Manifest (freenet-blob)
  const textHead = new TextDecoder().decode(plain.subarray(0, Math.min(plain.byteLength, 32)));
  if (textHead.startsWith(CHUNK_MANIFEST_FEC_MAGIC)) {
    try {
      const jsonStr = new TextDecoder().decode(plain.subarray(CHUNK_MANIFEST_FEC_MAGIC.length));
      const { k, m, total, shardSize, originalSize, hashes } = JSON.parse(jsonStr);
      let done = 0;
      let missing = 0;
      onProgress?.(0, hashes.length, 0);

      const receivedShards: Array<{ index: number; data: Uint8Array }> = [];
      const ready: (Uint8Array | null | undefined)[] = [];
      let next = 0;
      const flush = () => {
        if (!onPart) return;
        while (ready[next] !== undefined && next < k) {
          onPart(ready[next]!, next++);
        }
      };

      await Promise.all(
        hashes.map(async (h: string, i: number) => {
          const open = async () => {
            const c = await getSealed(h).catch(() => null);
            return c && openChatMedia(c, h, keyHex);
          };
          const part = (await open()) ?? (await open());
          if (!part) {
            missing++;
          } else {
            receivedShards.push({ index: i, data: part });
            if (i < k) {
              const chunkLen = (i === k - 1) ? (originalSize - (k - 1) * shardSize) : shardSize;
              ready[i] = part.subarray(0, chunkLen);
              flush();
            }
          }
          onProgress?.(++done, hashes.length, missing);
        })
      );

      if (receivedShards.length < k) {
        console.warn(`[Radica FEC] Too many shards lost (${receivedShards.length}/${k} available).`);
        return null;
      }

      const decoded = decodeFEC(receivedShards, { enabled: true, k, m, total, shardSize, originalSize });
      if (onPart && next < k) {
        for (let i = next; i < k; i++) {
          const start = i * shardSize;
          const end = Math.min(start + shardSize, originalSize);
          onPart(decoded.subarray(start, end), i);
        }
      }
      return decoded;
    } catch (e) {
      console.error("[Radica FEC] Failed to decode resilient attachment:", e);
      return null;
    }
  }

  // 2. Legacy linear chunk manifest
  const head = new TextDecoder().decode(plain.subarray(0, CHUNK_MANIFEST_MAGIC.length));
  if (head !== CHUNK_MANIFEST_MAGIC) return plain;
  const hashes = new TextDecoder().decode(plain.subarray(CHUNK_MANIFEST_MAGIC.length)).split("\n");
  if (!hashes.length || hashes.some((h) => !/^[0-9a-f]{64}$/.test(h))) return null;
  let done = 0;
  let missing = 0;
  onProgress?.(0, hashes.length, 0);
  // `onPart` gets the chunks in order, each as soon as it and all before it are here (a player can start early)
  const ready: (Uint8Array | null | undefined)[] = [];
  let next = 0;
  const flush = () => {
    while (ready[next]) onPart!(ready[next]!, next++);
  };
  const parts = await Promise.all(
    hashes.map(async (h, i) => {
      // a piece not found at once is asked a second time: a node can miss it on the first try
      const open = async () => {
        const c = await getSealed(h).catch(() => null);
        return c && openChatMedia(c, h, keyHex);
      };
      const part = (await open()) ?? (await open());
      if (!part) missing++;
      else if (onPart) {
        ready[i] = part;
        flush();
      }
      onProgress?.(++done, hashes.length, missing);
      return part;
    })
  );
  if (parts.some((part) => !part)) return null;
  const total = parts.reduce((n, part) => n + part!.byteLength, 0);
  if (total > MAX_CHAT_FILE_BYTES) return null;
  const out = new Uint8Array(total);
  let off = 0;
  for (const part of parts) {
    out.set(part!, off);
    off += part!.byteLength;
  }
  return out;
}

function measureImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}

export async function prepareChatImageFile(file: File | Blob): Promise<PreparedChatMedia> {
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Selected file is not an image.");
  }
  let dataUri = await compressPostImageFile(file, 1280, 0.82);
  let decoded = dataUriToBytesAndMime(dataUri);
  if (!decoded || decoded.bytes.byteLength > MAX_CHAT_MEDIA_PLAIN) {
    dataUri = await compressPostImageFile(file, 860, 0.7);
    decoded = dataUriToBytesAndMime(dataUri);
  }
  if (!decoded) throw new Error("Could not encode image.");
  if (decoded.bytes.byteLength > MAX_CHAT_MEDIA_PLAIN) {
    throw new Error("Image is still too large after compression (max 750 KB).");
  }
  const { width, height } = await measureImageDimensions(dataUri);
  const previewUrl = URL.createObjectURL(new Blob([decoded.bytes as BlobPart], { type: decoded.mime }));
  const kb = Math.max(1, Math.round(decoded.bytes.byteLength / 1024));
  return {
    kind: "img",
    bytes: decoded.bytes,
    mime: decoded.mime,
    label: `Photo (${width && height ? `${width}×${height} · ` : ""}${kb} KB)`,
    previewUrl,
    ...(width && height ? { width, height } : {}),
  };
}

/** Downsample an array of non-negative amplitudes into `bars` integers in 2..15. */
export function normalizePeaksToBars(peaks: number[], bars = WAVEFORM_BARS): number[] {
  if (!peaks.length) return new Array(bars).fill(4);
  const bucketed: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i * peaks.length) / bars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / bars));
    let sum = 0;
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j++) {
      const v = Math.abs(peaks[j]) || 0;
      sum += v;
      if (v > max) max = v;
    }
    const avg = sum / Math.max(1, end - start);
    bucketed.push(max * 0.65 + avg * 0.35);
  }
  const peakMax = Math.max(...bucketed, 0.001);
  return bucketed.map((v) => Math.max(2, Math.min(15, Math.round((v / peakMax) * 13) + 2)));
}

async function analyzeAudioBlob(bytes: Uint8Array, mime: string): Promise<{ durationSec: number; waveform: number[] }> {
  const AudioCtx =
    typeof window !== "undefined"
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (AudioCtx) {
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioCtx();
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const audioBuf = await ctx.decodeAudioData(copy);
      const data = audioBuf.getChannelData(0);
      const step = Math.max(1, Math.floor(data.length / 280));
      const samples: number[] = [];
      for (let i = 0; i < data.length; i += step) samples.push(Math.abs(data[i]));
      return {
        durationSec: Math.max(0.5, Math.round(audioBuf.duration * 10) / 10),
        waveform: normalizePeaksToBars(samples, WAVEFORM_BARS),
      };
    } catch {
      // Fallback to HTMLAudioElement metadata below
    } finally {
      if (ctx) void ctx.close().catch(() => {});
    }
  }

  // Fallback duration via <audio> element
  const durationSec = await new Promise<number>((resolve) => {
    if (typeof Audio === "undefined") return resolve(0);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    const a = new Audio();
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : 0);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    setTimeout(() => done(a.duration), 2000);
    a.src = url;
  });

  return {
    durationSec,
    waveform: defaultWaveform(mediaHashOf(bytes).slice(0, 32), WAVEFORM_BARS),
  };
}

export async function prepareChatAudioFile(
  file: File | Blob,
  kind: "voice" | "audio" = "audio",
  knownDurationSec?: number,
  knownWaveform?: number[]
): Promise<PreparedChatMedia> {
  const filename = file instanceof File ? file.name : "";
  const mime = normalizeAudioMime(file.type, filename);
  if (!mime) {
    throw new Error("Unsupported audio format. Use MP3, OGG/Opus, WebM, M4A, WAV, or AAC.");
  }
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!bytes.byteLength) throw new Error("Audio file is empty.");
  if (bytes.byteLength > MAX_CHAT_FILE_BYTES) {
    const mb = Math.round(bytes.byteLength / 1024 / 1024);
    throw new Error(`Audio file is ${mb} MB, over the ${MAX_CHAT_FILE_BYTES / 1024 / 1024} MB chat attachment limit.`);
  }

  let durationSec = knownDurationSec ?? 0;
  let waveform = knownWaveform;
  if (!durationSec || !waveform?.length) {
    const analyzed = await analyzeAudioBlob(bytes, mime);
    if (!durationSec) durationSec = analyzed.durationSec;
    if (!waveform?.length) waveform = analyzed.waveform;
  }

  const previewUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const kb = Math.max(1, Math.round(bytes.byteLength / 1024));
  const baseTitle = kind === "voice" ? "Voice message" : filename ? filename.slice(0, 32) : "Audio";
  return {
    kind,
    bytes,
    mime,
    label: `${baseTitle} (${formatMediaDuration(durationSec)} · ${kb} KB)`,
    previewUrl,
    durationSec,
    waveform,
  };
}

export async function prepareChatDocFile(file: File | Blob, explicitName?: string): Promise<PreparedChatMedia> {
  const filename = explicitName || (file instanceof File ? file.name : "") || "document";
  const rawMime = (file.type || "").split(";")[0].trim().toLowerCase();
  const mime = /^[a-z0-9/+.-]+$/.test(rawMime) ? rawMime : "application/octet-stream";
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!bytes.byteLength) throw new Error("File is empty.");
  if (bytes.byteLength > MAX_CHAT_FILE_BYTES) {
    const mb = Math.round(bytes.byteLength / 1024 / 1024);
    throw new Error(`File is ${mb} MB, over the ${MAX_CHAT_FILE_BYTES / 1024 / 1024} MB chat attachment limit.`);
  }
  const previewUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const sizeBytes = bytes.byteLength;
  const kb = Math.max(1, Math.round(sizeBytes / 1024));
  return {
    kind: "file",
    bytes,
    mime,
    label: `${filename} (${kb} KB)`,
    previewUrl,
    sizeBytes,
    filename,
  };
}

export interface VoiceRecorderSession {
  stop: () => Promise<PreparedChatMedia | null>;
  cancel: () => void;
}

function pickRecorderMime(): { recorderMime: string; safeMime: string } {
  const candidates: [string, string][] = [
    ["audio/webm;codecs=opus", "audio/webm"],
    ["audio/ogg;codecs=opus", "audio/ogg"],
    ["audio/mp4", "audio/mp4"],
    ["audio/webm", "audio/webm"],
  ];
  if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
    for (const [rec, safe] of candidates) {
      if (MediaRecorder.isTypeSupported(rec)) return { recorderMime: rec, safeMime: safe };
    }
  }
  return { recorderMime: "", safeMime: "audio/webm" };
}

function tagFallbackCaptureError(err: unknown, fallbackMessage?: string): Error & { code?: string; cause?: unknown } {
  const msg =
    fallbackMessage ||
    (err instanceof Error && err.message ? err.message : String(err || "Capture unavailable"));
  const error = new Error(msg) as Error & { code?: string; cause?: unknown };
  error.code = "FALLBACK_CAPTURE";
  if (err !== undefined) error.cause = err;
  return error;
}

function isSandboxOrPermissionCaptureError(err: unknown): boolean {
  const name = (err as { name?: string })?.name || "";
  const msg = ((err as { message?: string })?.message || String(err)).toLowerCase();
  return (
    name === "SecurityError" ||
    name === "NotAllowedError" ||
    name === "NotFoundError" ||
    msg.includes("invalid security origin") ||
    msg.includes("secure") ||
    msg.includes("permissions policy") ||
    msg.includes("disallowed")
  );
}

export interface NativeVoiceBridge {
  canRecordVoice?: () => boolean;
  startVoiceRec?: (maxSec: number) => void;
  stopVoiceRec?: () => void;
  cancelVoiceRec?: () => void;
}

function getNativeVoiceBridge(): NativeVoiceBridge | null {
  const nb = (globalThis as { __radicaNative?: NativeVoiceBridge }).__radicaNative;
  if (!nb) return null;
  if (typeof nb.startVoiceRec !== "function" || typeof nb.stopVoiceRec !== "function") return null;
  if (typeof nb.canRecordVoice === "function" && !nb.canRecordVoice()) return null;
  return nb;
}

/** True when Desktop/Android native wrapper exposes a real microphone recording bridge. */
export function hasNativeVoiceBridge(): boolean {
  return getNativeVoiceBridge() !== null;
}

/** True on mobile/touch viewports where `<input type="file" capture="user">` launches the device camera. */
export function isTouchMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  return coarse || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

/** True when browser live getUserMedia + MediaRecorder capture is allowed (false in Freenet's opaque-origin shell iframe). */
export function canUseLiveMediaCapture(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!window.isSecureContext) return false;
  if (typeof window.origin === "string" && window.origin === "null") return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (typeof MediaRecorder === "undefined") return false;
  return true;
}

/** True when Push-to-Talk microphone capture is genuinely available (live Web API OR native Desktop/Android bridge). */
export function canRecordVoice(): boolean {
  return canUseLiveMediaCapture() || hasNativeVoiceBridge();
}

/** True when circular video message recording/capture adds real value beyond attachment file picking. */
export function canCaptureVideoNote(): boolean {
  return canUseLiveMediaCapture() || isTouchMobileDevice();
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function startNativeVoiceRecording(
  bridge: NativeVoiceBridge,
  opts: {
    maxSec?: number;
    onTick?: (elapsedSec: number, level0to15: number, approxBytes: number, maxSec: number) => void;
    onMaxReached?: () => void;
  }
): Promise<VoiceRecorderSession> {
  const maxSec = Math.max(1, Math.min(MAX_VOICE_SEC, opts.maxSec ?? MAX_VOICE_SEC));
  const samples: number[] = [];
  let maxTriggered = false;
  let stopped = false;
  let cancelled = false;
  let started = false;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveStop: ((val: PreparedChatMedia | null) => void) | null = null;
  let rejectStop: ((err: Error) => void) | null = null;
  const startedAt = Date.now();

  return new Promise<VoiceRecorderSession>((resolveStart, rejectStart) => {
    const startTimer = setTimeout(() => {
      cleanupListener();
      try {
        bridge.cancelVoiceRec?.();
      } catch {}
      rejectStart(new Error("Native microphone took too long to start."));
    }, 5000);

    const cleanupListener = () => {
      clearTimeout(startTimer);
      if (finishTimer) clearTimeout(finishTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("message", onMessage);
      }
    };

    const session: VoiceRecorderSession = {
      cancel() {
        if (cancelled || stopped) return;
        cancelled = true;
        cleanupListener();
        try {
          bridge.cancelVoiceRec?.();
        } catch {}
        resolveStop?.(null);
      },
      stop() {
        if (cancelled || stopped) return Promise.resolve(null);
        stopped = true;
        return new Promise<PreparedChatMedia | null>((res, rej) => {
          resolveStop = res;
          rejectStop = rej;
          finishTimer = setTimeout(() => {
            cleanupListener();
            rej(new Error("Native microphone stop timed out."));
          }, 8000);
          try {
            bridge.stopVoiceRec?.();
          } catch (err) {
            cleanupListener();
            rej(err instanceof Error ? err : new Error(String(err)));
          }
        });
      },
    };

    const onMessage = (ev: MessageEvent) => {
      const d = ev?.data as
        | {
            type?: string;
            event?: string;
            elapsedSec?: number;
            level?: number;
            approxBytes?: number;
            maxSec?: number;
            mime?: string;
            base64?: string;
            durationSec?: number;
            message?: string;
          }
        | undefined;
      if (!d || d.type !== "radica_native_voice") return;

      if (d.event === "started") {
        if (started) return;
        started = true;
        clearTimeout(startTimer);
        resolveStart(session);
        return;
      }

      if (d.event === "tick") {
        if (cancelled || stopped) return;
        const level = Math.max(2, Math.min(15, Number(d.level) || 2));
        samples.push((level - 2) / 13);
        const elapsed = Number(d.elapsedSec) || (Date.now() - startedAt) / 1000;
        const limit = Number(d.maxSec) || maxSec;
        opts.onTick?.(elapsed, level, Number(d.approxBytes) || 0, limit);
        if (!maxTriggered && elapsed >= limit) {
          maxTriggered = true;
          opts.onMaxReached?.();
        }
        return;
      }

      if (d.event === "done") {
        cleanupListener();
        if (cancelled || !d.base64) {
          resolveStop?.(null);
          return;
        }
        try {
          const bytes = base64ToBytes(d.base64);
          const mime = normalizeAudioMime(d.mime || "audio/wav") ?? "audio/wav";
          const dur = Math.max(0.5, Number(d.durationSec) || Math.round(((Date.now() - startedAt) / 1000) * 10) / 10);
          const wf = samples.length >= 4 ? normalizePeaksToBars(samples, WAVEFORM_BARS) : undefined;
          const blob = new Blob([bytes as BlobPart], { type: mime });
          void prepareChatAudioFile(blob, "voice", dur, wf).then(
            (prep) => resolveStop?.(prep),
            (err) => rejectStop?.(err instanceof Error ? err : new Error(String(err)))
          );
        } catch (err) {
          rejectStop?.(err instanceof Error ? err : new Error(String(err)));
        }
        return;
      }

      if (d.event === "cancelled") {
        cleanupListener();
        if (!started) rejectStart(new Error("Voice recording cancelled."));
        resolveStop?.(null);
        return;
      }

      if (d.event === "error") {
        cleanupListener();
        const err = new Error(d.message || "Native microphone recording failed.");
        if (!started) rejectStart(err);
        rejectStop?.(err);
      }
    };

    if (typeof window === "undefined") {
      clearTimeout(startTimer);
      rejectStart(new Error("Native voice recording requires a browser window."));
      return;
    }
    window.addEventListener("message", onMessage);
    try {
      bridge.startVoiceRec?.(maxSec);
    } catch (err) {
      cleanupListener();
      rejectStart(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function startVoiceRecording(opts: {
  maxSec?: number;
  onTick?: (elapsedSec: number, level0to15: number, approxBytes: number, maxSec: number) => void;
  onMaxReached?: () => void;
}): Promise<VoiceRecorderSession> {
  if (!canUseLiveMediaCapture()) {
    const bridge = getNativeVoiceBridge();
    if (bridge) return startNativeVoiceRecording(bridge, opts);
  }
  const maxSec = Math.max(1, Math.min(MAX_VOICE_SEC, opts.maxSec ?? MAX_VOICE_SEC));
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    const msg =
      typeof window !== "undefined" && !window.isSecureContext
        ? "Microphone requires a secure origin. Replace '127.0.0.1' with 'localhost' in your address bar (http://localhost:7509/...) to grant mic access."
        : "Microphone access is not available in this browser.";
    throw tagFallbackCaptureError(new Error(msg));
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err: unknown) {
    if (isSandboxOrPermissionCaptureError(err)) {
      const msg = (err as { message?: string })?.message || String(err);
      const isSec = msg.includes("Invalid security origin") || (err as { name?: string })?.name === "SecurityError";
      throw tagFallbackCaptureError(
        new Error(
          isSec
            ? "Freenet web gateway sandboxes contracts inside an iframe that blocks hardware mic access. You can attach audio files directly, or run via dev server / desktop app."
            : msg
        )
      );
    }
    throw err;
  }

  if (typeof MediaRecorder === "undefined") {
    stream.getTracks().forEach((t) => t.stop());
    throw tagFallbackCaptureError(new Error("Audio recording (MediaRecorder) is not supported in this browser."));
  }

  const { recorderMime, safeMime } = pickRecorderMime();
  let recorder: MediaRecorder;
  try {
    recorder = recorderMime
      ? new MediaRecorder(stream, { mimeType: recorderMime, audioBitsPerSecond: 24_000 })
      : new MediaRecorder(stream, { audioBitsPerSecond: 24_000 });
  } catch {
    recorder = new MediaRecorder(stream);
  }

  const chunks: Blob[] = [];
  let totalBytes = 0;
  let cancelled = false;
  let stopped = false;
  let maxTriggered = false;
  const startedAt = Date.now();
  const liveSamples: number[] = [];

  // Optional live mic amplitude sampling via Web Audio AnalyserNode
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let timeDomain: Uint8Array | null = null;
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      timeDomain = new Uint8Array(analyser.fftSize);
    }
  } catch {
    // Recording still succeeds without live AnalyserNode
  }

  const SAFE_RECORD_CAP = MAX_CHAT_FILE_BYTES - 20_480; // ~20 KB safety headroom before stop flush

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
      totalBytes += ev.data.size;
      if (!maxTriggered && totalBytes >= SAFE_RECORD_CAP) {
        maxTriggered = true;
        opts.onMaxReached?.();
      }
    }
  };

  const tickTimer = setInterval(() => {
    if (stopped || cancelled) return;
    let peak = 0.08;
    if (analyser && timeDomain) {
      analyser.getByteTimeDomainData(timeDomain as Uint8Array<ArrayBuffer>);
      let maxDev = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        const dev = Math.abs(timeDomain[i] - 128) / 128;
        if (dev > maxDev) maxDev = dev;
      }
      peak = maxDev;
    }
    liveSamples.push(peak);
    const level = Math.max(2, Math.min(15, Math.round(Math.min(1, peak * 3.2) * 13) + 2));
    const elapsedSec = (Date.now() - startedAt) / 1000;
    opts.onTick?.(elapsedSec, level, totalBytes, maxSec);
    if (!maxTriggered && elapsedSec >= maxSec) {
      maxTriggered = true;
      opts.onMaxReached?.();
    }
  }, 120);

  const cleanupHardware = () => {
    clearInterval(tickTimer);
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {}
    }
    if (audioCtx) {
      void audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  };

  recorder.start(250);

  return {
    cancel() {
      if (stopped || cancelled) return;
      cancelled = true;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {}
      cleanupHardware();
    },
    stop(): Promise<PreparedChatMedia | null> {
      if (cancelled) return Promise.resolve(null);
      if (stopped) return Promise.resolve(null);
      stopped = true;
      const elapsedSec = Math.max(0.5, Math.round(((Date.now() - startedAt) / 1000) * 10) / 10);
      return new Promise((resolve, reject) => {
        const finalize = async () => {
          cleanupHardware();
          if (cancelled || !chunks.length) return resolve(null);
          try {
            const actualMime = normalizeAudioMime(recorder.mimeType || safeMime) ?? safeMime;
            const blob = new Blob(chunks, { type: actualMime });
            const wf = liveSamples.length >= 4 ? normalizePeaksToBars(liveSamples, WAVEFORM_BARS) : undefined;
            const prepared = await prepareChatAudioFile(blob, "voice", elapsedSec, wf);
            resolve(prepared);
          } catch (err) {
            reject(err);
          }
        };
        if (recorder.state === "inactive") {
          void finalize();
        } else {
          recorder.addEventListener("stop", () => void finalize(), { once: true });
          try {
            recorder.stop();
          } catch {
            void finalize();
          }
        }
      });
    },
  };
}

export interface VideoNoteRecorderSession {
  stream: MediaStream;
  stop: () => Promise<{ blob: Blob; durationSec: number } | null>;
  cancel: () => void;
}

function pickVideoRecorderMime(): { recorderMime: string; safeMime: string } {
  const candidates: [string, string][] = [
    ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"],
    ["video/mp4", "video/mp4"],
    ["video/webm;codecs=vp9,opus", "video/webm"],
    ["video/webm;codecs=vp8,opus", "video/webm"],
    ["video/webm", "video/webm"],
  ];
  if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
    for (const [rec, safe] of candidates) {
      if (MediaRecorder.isTypeSupported(rec)) return { recorderMime: rec, safeMime: safe };
    }
  }
  return { recorderMime: "", safeMime: "video/webm" };
}

export async function startVideoNoteRecording(opts: {
  facingMode?: "user" | "environment";
  maxSec?: number;
  onTick?: (elapsedSec: number, maxSec: number) => void;
  onMaxReached?: () => void;
}): Promise<VideoNoteRecorderSession> {
  const maxSec = Math.max(1, Math.min(MAX_VNOTE_SEC, opts.maxSec ?? MAX_VNOTE_SEC));
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw tagFallbackCaptureError(new Error("Camera video recording is unavailable in this browser."));
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: opts.facingMode ?? "user",
        width: { ideal: 360 },
        height: { ideal: 360 },
        aspectRatio: { ideal: 1 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err: unknown) {
    if (isSandboxOrPermissionCaptureError(err)) {
      throw tagFallbackCaptureError(err);
    }
    throw err;
  }

  const { recorderMime, safeMime } = pickVideoRecorderMime();
  let recorder: MediaRecorder;
  try {
    recorder = recorderMime
      ? new MediaRecorder(stream, { mimeType: recorderMime, videoBitsPerSecond: 500_000, audioBitsPerSecond: 48_000 })
      : new MediaRecorder(stream, { videoBitsPerSecond: 500_000, audioBitsPerSecond: 48_000 });
  } catch {
    try {
      recorder = new MediaRecorder(stream);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      throw tagFallbackCaptureError(err);
    }
  }

  const chunks: Blob[] = [];
  let totalBytes = 0;
  let cancelled = false;
  let stopped = false;
  let maxTriggered = false;
  const startedAt = Date.now();
  const SAFE_VIDEO_REC_CAP = MAX_VNOTE_BYTES - 128 * 1024;

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
      totalBytes += ev.data.size;
      if (!maxTriggered && totalBytes >= SAFE_VIDEO_REC_CAP) {
        maxTriggered = true;
        opts.onMaxReached?.();
      }
    }
  };

  const tickTimer = setInterval(() => {
    if (stopped || cancelled) return;
    const elapsedSec = (Date.now() - startedAt) / 1000;
    opts.onTick?.(elapsedSec, maxSec);
    if (!maxTriggered && elapsedSec >= maxSec) {
      maxTriggered = true;
      opts.onMaxReached?.();
    }
  }, 150);

  const cleanup = () => {
    clearInterval(tickTimer);
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {}
    }
  };

  recorder.start(250);

  return {
    stream,
    cancel() {
      if (stopped || cancelled) return;
      cancelled = true;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {}
      cleanup();
    },
    stop(): Promise<{ blob: Blob; durationSec: number } | null> {
      if (cancelled || stopped) return Promise.resolve(null);
      stopped = true;
      const elapsedSec = Math.max(0.5, Math.round(((Date.now() - startedAt) / 1000) * 10) / 10);
      return new Promise((resolve) => {
        const finalize = () => {
          cleanup();
          if (cancelled || !chunks.length) return resolve(null);
          const actualMime = normalizeVideoMime(recorder.mimeType || safeMime) ?? safeMime;
          resolve({ blob: new Blob(chunks, { type: actualMime }), durationSec: elapsedSec });
        };
        if (recorder.state === "inactive") {
          finalize();
        } else {
          recorder.addEventListener("stop", finalize, { once: true });
          try {
            recorder.stop();
          } catch {
            finalize();
          }
        }
      });
    },
  };
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement | OffscreenCanvas, quality = 0.78): Promise<Blob | null> {
  if (typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement) {
    return new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  }
  if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  return null;
}

async function probeVideoFallbackMeta(file: Blob): Promise<{ durationSec: number; width: number; height: number; canvas: HTMLCanvasElement | null }> {
  if (typeof document === "undefined") return { durationSec: 0, width: 360, height: 360, canvas: null };
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    let settled = false;
    const finish = (canvas: HTMLCanvasElement | null) => {
      if (settled) return;
      settled = true;
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      const w = v.videoWidth || 360;
      const h = v.videoHeight || 360;
      URL.revokeObjectURL(url);
      resolve({ durationSec: dur, width: w, height: h, canvas });
    };
    const grabFrame = () => {
      try {
        const size = Math.max(160, Math.min(360, Math.min(v.videoWidth || 360, v.videoHeight || 360)));
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (ctx && v.videoWidth > 0 && v.videoHeight > 0) {
          const side = Math.min(v.videoWidth, v.videoHeight);
          const sx = Math.floor((v.videoWidth - side) / 2);
          const sy = Math.floor((v.videoHeight - side) / 2);
          ctx.drawImage(v, sx, sy, side, side, 0, 0, size, size);
        }
        finish(canvas);
      } catch {
        finish(null);
      }
    };
    v.onloadeddata = () => {
      if (v.duration && Number.isFinite(v.duration) && v.duration > 0.2) {
        try {
          v.currentTime = Math.min(0.2, v.duration / 2);
        } catch {
          grabFrame();
        }
      } else {
        grabFrame();
      }
    };
    v.onseeked = grabFrame;
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 3000);
    v.src = url;
  });
}

/**
 * Scan a circular video message frame-by-frame with Desert Ant (`opts.scan`), crop/transcode to square MP4
 * (with graceful fallback to validated input bytes if WebCodecs H.264 is unavailable), and prepare encrypted payload.
 */
export async function prepareChatVideoNote(
  file: File | Blob,
  opts?: {
    knownDurationSec?: number;
    scan?: (frame: HTMLCanvasElement | OffscreenCanvas) => Promise<ImageModerationResult>;
    stopAt?: number;
    onProgress?: (stage: "scan" | "encode", progress01: number) => void;
  }
): Promise<PreparedChatMedia> {
  const filename = file instanceof File ? file.name : "";
  const stopAt = opts?.stopAt ?? 0.8;
  let posterBlob: Blob | null = null;
  let duration = 0;
  let outBytes: Uint8Array | null = null;
  let outMime = "video/mp4";

  try {
    const M = await import("mediabunny");
    const input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS });
    const rawDur = await input.computeDuration().catch(() => 0);
    duration =
      Number.isFinite(rawDur) && rawDur > 0
        ? rawDur
        : opts?.knownDurationSec && opts.knownDurationSec > 0
        ? opts.knownDurationSec
        : 0;
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track found in this clip.");

    if (duration <= 0) {
      const probe = await probeVideoFallbackMeta(file);
      duration = probe.durationSec > 0 ? probe.durationSec : opts?.knownDurationSec || 1;
    }

    const plan = videoNotePlan(duration, track.displayWidth, track.displayHeight);
    if (!plan) {
      throw new Error(`Video message is ${Math.round(duration)}s, over the ${MAX_VNOTE_SEC}s limit.`);
    }

    const times = scanTimes(Math.min(duration, MAX_VNOTE_SEC));
    const sink = new M.CanvasSink(track, { width: 360, height: 360, fit: "cover" });
    let i = 0;
    for await (const frame of sink.canvasesAtTimestamps(times)) {
      opts?.onProgress?.("scan", ++i / Math.max(1, times.length));
      if (!frame) continue;
      await new Promise<void>((r) => setTimeout(r, 0));
      const c = frame.canvas;
      if (!posterBlob) posterBlob = await canvasToJpegBlob(c, 0.78);
      if (opts?.scan) {
        const res = await opts.scan(c);
        if (res.isNSFW || res.score >= stopAt) {
          throw new Error(`Video message blocked by on-device moderation (${res.label}).`);
        }
      }
    }

    try {
      const audioCodec = (await M.canEncodeAudio("aac", { bitrate: 48_000 })) ? "aac" : "opus";
      const output = new M.Output({
        format: new M.Mp4OutputFormat({ fastStart: "fragmented" }),
        target: new M.BufferTarget(),
      });
      const conversion = await M.Conversion.init({
        input,
        output,
        video: {
          codec: "avc",
          width: plan.size,
          height: plan.size,
          fit: "cover",
          bitrate: plan.bitrate,
          keyFrameInterval: 2,
          forceTranscode: true,
        },
        audio: { codec: audioCodec, bitrate: 48_000, forceTranscode: true },
      });
      if (conversion.isValid) {
        conversion.onProgress = (p) => opts?.onProgress?.("encode", p);
        await conversion.execute();
        const encoded = new Uint8Array(output.target.buffer!);
        if (encoded.byteLength > 0 && encoded.byteLength <= MAX_VNOTE_BYTES) {
          outBytes = encoded;
          outMime = "video/mp4";
        }
      }
    } catch {
      // Fall back to validated input bytes below when WebCodecs H.264 cannot encode in this runtime
    }
  } catch (err) {
    // Re-throw explicit moderation blocks and duration limit errors immediately
    const msg = (err as Error)?.message || String(err);
    if (msg.includes("blocked by on-device moderation") || msg.includes("over the") || msg.includes("No video track")) {
      throw err;
    }
  }

  if (!outBytes) {
    const fallbackMime = normalizeVideoMime(file.type, filename);
    if (!fallbackMime) {
      throw new Error("Unsupported video format. Please record or choose an MP4 or WebM video.");
    }
    const rawBytes = new Uint8Array(await file.arrayBuffer());
    if (!rawBytes.byteLength) throw new Error("Video message is empty.");
    if (rawBytes.byteLength > MAX_VNOTE_BYTES) {
      const mb = Math.round((rawBytes.byteLength / 1024 / 1024) * 10) / 10;
      throw new Error(`Video message is ${mb} MB, over the ${MAX_VNOTE_BYTES / 1024 / 1024} MB cap.`);
    }
    if (!posterBlob || duration <= 0) {
      const probe = await probeVideoFallbackMeta(file);
      if (duration <= 0) duration = probe.durationSec > 0 ? probe.durationSec : opts?.knownDurationSec ?? 0;
      if (duration > MAX_VNOTE_SEC + 1.5) {
        throw new Error(`Video message is ${Math.round(duration)}s, over the ${MAX_VNOTE_SEC}s limit.`);
      }
      if (probe.canvas) {
        if (!posterBlob) posterBlob = await canvasToJpegBlob(probe.canvas, 0.78);
        if (opts?.scan) {
          opts.onProgress?.("scan", 1);
          const res = await opts.scan(probe.canvas);
          if (res.isNSFW || res.score >= stopAt) {
            throw new Error(`Video message blocked by on-device moderation (${res.label}).`);
          }
        }
      }
    }
    outBytes = rawBytes;
    outMime = fallbackMime;
  }

  const finalDur = Math.max(0.5, Math.min(MAX_VNOTE_SEC, Math.round((duration || 1) * 10) / 10));
  const previewUrl = URL.createObjectURL(posterBlob ?? new Blob([outBytes as BlobPart], { type: outMime }));
  const kb = Math.max(1, Math.round(outBytes.byteLength / 1024));
  return {
    kind: "vnote",
    bytes: outBytes,
    mime: outMime,
    label: `Video message (${formatMediaDuration(finalDur)} · ${kb} KB)`,
    previewUrl,
    durationSec: finalDur,
    sizeBytes: outBytes.byteLength,
    ...(posterBlob ? { posterBlob } : {}),
  };
}

// ---------------------------------------------------------------------------
// Chat Bubble Media Cards & Interactive Hydration
// ---------------------------------------------------------------------------

/** `title` names an audio in the player bar (the message's first line), when the chat it came from is closed. */
export function chatMediaCardsHtml(items: ChatMediaItem[], title = ""): string {
  if (!items.length) return "";
  return items
    .map((item) => {
      const attrs = `data-cm-kind="${esc(item.kind)}" data-cm-mime="${esc(item.mime)}" data-cm-hash="${esc(item.hash)}" data-cm-key="${esc(item.keyHex)}"`;
      if (item.kind === "img") {
        const ratio =
          item.width && item.height
            ? `style="aspect-ratio: ${item.width} / ${item.height};"`
            : "";
        return `<div class="cm-card cm-img-card" ${attrs}>
          <div class="cm-img-wrap" ${ratio}>
            <div class="cm-img-status">Decrypting photo…</div>
          </div>
        </div>`;
      }

      if (item.kind === "file") {
        const fname = item.filename || "file";
        const icon = fileExtensionIcon(fname);
        const sizeStr = formatBytes(item.sizeBytes);
        return `<div class="cm-card cm-file-card" ${attrs} data-cm-filename="${esc(fname)}" data-cm-size="${item.sizeBytes ?? 0}">
          <div class="cm-file-icon">${icon}</div>
          <div class="cm-file-info">
            <div class="cm-file-name" title="${esc(fname)}">${esc(fname)}</div>
            <div class="cm-file-meta">${esc(sizeStr)} · Encrypted</div>
          </div>
          <button type="button" class="cm-file-download" title="Download ${esc(fname)}" aria-label="Download ${esc(fname)}">${renderIcon("download", { size: 14, className: "icon-xs" })}</button>
        </div>`;
      }

      if (item.kind === "vnote") {
        const durStr = formatMediaDuration(item.durationSec);
        const posterAttr = item.posterHash ? ` data-cm-poster="${esc(item.posterHash)}"` : "";
        return `<div class="cm-card cm-vnote-card" ${attrs} data-cm-dur="${item.durationSec ?? 0}"${posterAttr}>
          <div class="cm-vnote-stage" role="button" tabindex="0" aria-label="Play video message (${esc(durStr)})">
            <progress class="cm-vnote-ring" value="0" max="100" aria-label="Video message progress" aria-valuetext="0:00 of ${esc(durStr)}"></progress>
            <div class="cm-vnote-circle">
              <video class="cm-vnote-video" width="208" height="208" playsinline preload="none" loading="lazy"></video>
              <div class="cm-vnote-overlay" aria-hidden="true">▶</div>
              <div class="cm-vnote-badge" aria-hidden="true">${renderIcon("video", { size: 11, className: "icon-xs" })} <span>${esc(durStr)}</span></div>
            </div>
          </div>
          <div class="cm-vnote-controls">
            <button type="button" class="cm-speed-btn cm-vnote-mute" title="Mute / Unmute" aria-label="Mute or unmute video message" aria-pressed="false">${renderIcon("volume2", { size: 14, className: "icon-xs" })}</button>
            <button type="button" class="cm-speed-btn cm-vnote-speed" title="Playback speed">1×</button>
            <button type="button" class="cm-speed-btn cm-vnote-download" title="Download video message" aria-label="Download video message">${renderIcon("download", { size: 14, className: "icon-xs" })}</button>
          </div>
        </div>`;
      }

      const durStr = formatMediaDuration(item.durationSec);
      const bars = item.waveform?.length ? item.waveform : defaultWaveform(item.hash, WAVEFORM_BARS);
      const barsHtml = bars
        .map((h, idx) => {
          const pct = Math.round((Math.max(2, Math.min(15, h)) / 15) * 100);
          return `<span class="cm-wf-bar" data-bar-idx="${idx}" style="height: ${Math.max(16, pct)}%;"></span>`;
        })
        .join("");
      const kindBadge =
        item.kind === "voice"
          ? `${renderIcon("mic", { size: 11, className: "icon-xs" })} <span>Voice</span>`
          : `${renderIcon("music", { size: 11, className: "icon-xs" })} <span>Audio</span>`;
      return `<div class="cm-card cm-audio-card" ${attrs} data-cm-dur="${item.durationSec ?? 0}" data-cm-title="${esc(title.split("\n").find((l) => l.trim())?.trim().slice(0, 120) ?? "")}">
        <button type="button" class="cm-audio-play" aria-label="Play ${item.kind === "voice" ? "voice message" : "audio"}">▶</button>
        <div class="cm-audio-main">
          <div class="cm-waveform" role="slider" aria-label="Seek audio" tabindex="0">${barsHtml}</div>
          <div class="cm-audio-meta">
            <span class="cm-audio-time">${esc(durStr)}</span>
            <span class="cm-audio-kind">${kindBadge}</span>
          </div>
        </div>
        <button type="button" class="cm-speed-btn" title="Playback speed">1×</button>
        <button type="button" class="cm-speed-btn cm-audio-download" title="Download" aria-label="Download ${item.kind === "voice" ? "voice message" : "audio"}">${renderIcon("download", { size: 14, className: "icon-xs" })}</button>
      </div>`;
    })
    .join("");
}

function pauseAllOtherMedia(except?: HTMLMediaElement): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll<HTMLMediaElement>(".ft-card audio, .ft-profile-card audio, #cm-shared-audio, .cm-vnote-video").forEach((m) => {
    if (m !== except && !m.paused) m.pause();
  });
}

/** One player for every chat audio, outside the chat: a clip keeps playing when its chat closes (a card's own
 *  element would stop once removed), and an integrated bar below the active header (as in Telegram) shows it and
 *  lets you pause, resume, seek, or close it without ever blocking header navigation. */
const player = { el: null as HTMLAudioElement | null, hash: "" };
const PLAYER_EVENTS = ["play", "pause", "timeupdate", "ended", "emptied", "loadedmetadata", "ratechange"];
let voiceEndedHandler: ((endedHash: string) => void) | null = null;
const voiceCardStarters = new WeakMap<HTMLElement, () => Promise<"started" | "blocked" | "missing">>();

/** Register a callback fired when a chat voice/audio clip finishes naturally in the shared player. */
export function setVoiceEndedHandler(cb: ((endedHash: string) => void) | null): void {
  voiceEndedHandler = cb;
}

/** Prime the shared <audio> element during a user gesture so Walkie-Talkie autoplay stays permitted. */
export function primeChatAudio(): void {
  if (typeof document === "undefined") return;
  sharedAudio();
}

/** Programmatically start playback of a specific voice message card inside `root` (used by Walkie-Talkie mode). */
export async function playChatVoiceByHash(hash: string, root: ParentNode): Promise<"started" | "blocked" | "missing"> {
  const targetHash = hash.toLowerCase();
  const card = root.querySelector<HTMLElement>(`.cm-card[data-cm-kind="voice"][data-cm-hash="${targetHash}"]`);
  if (!card) return "missing";
  const starter = voiceCardStarters.get(card);
  if (!starter) return "missing";
  try {
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch {}
  return starter();
}

/** Dock the mini player bar into the slot corresponding to the current screen / view:
 *  - inside .rm-stage (below chat header) when viewing a conversation
 *  - inside .rm-inbox (below filter chips) when viewing the conversations list on mobile
 *  - inside .chat-modal-card (below classic header) in classic layout
 *  - inside #feed-view (below feed navigation) when chat modal is closed
 */
export function syncMiniPlayerSlot(): void {
  if (typeof document === "undefined") return;
  const bar = document.getElementById("cm-mini-player");
  if (!bar) return;
  const chatModal = document.getElementById("chat-modal");
  const isChatOpen = chatModal && chatModal.style.display !== "none" && chatModal.style.display !== "";

  let targetSlot: HTMLElement | null = null;
  if (isChatOpen) {
    const mode = chatModal.dataset.chatLayout || "messenger";
    if (mode === "classic") {
      targetSlot = document.getElementById("rm-classic-player-slot");
    } else {
      const workspace = document.getElementById("rm-workspace");
      const inbox = workspace?.querySelector<HTMLElement>(".rm-inbox");
      const isSinglePane = inbox ? getComputedStyle(inbox).display === "none" || inbox.offsetWidth === workspace?.offsetWidth : window.innerWidth <= 768; // ponytail: match @container messenger single-pane state
      const isThreadOpen = workspace?.classList.contains("mobile-thread-open");
      if (isSinglePane && !isThreadOpen) {
        targetSlot = document.getElementById("rm-inbox-player-slot");
      } else {
        targetSlot = document.getElementById("rm-player-slot") || document.getElementById("rm-inbox-player-slot");
      }
    }
  } else {
    targetSlot = document.getElementById("feed-player-slot");
  }

  if (targetSlot) {
    if (bar.parentElement !== targetSlot) {
      targetSlot.appendChild(bar);
    }
  } else if (bar.parentElement !== document.body) {
    document.body.appendChild(bar);
  }
}

function sharedAudio(): HTMLAudioElement {
  if (player.el) return player.el;
  const a = document.createElement("audio");
  a.id = "cm-shared-audio";
  a.preload = "none";
  const bar = document.createElement("div");
  bar.id = "cm-mini-player";
  bar.hidden = true;
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Now playing");
  bar.innerHTML = `<button type="button" class="cm-mini-toggle"></button><span class="cm-mini-title" title="Jump to audio"></span><span class="cm-mini-time"></span><button type="button" class="cm-mini-close" aria-label="Close player" title="Close player">✕</button>`;
  document.body.append(a);
  document.body.append(bar);
  syncMiniPlayerSlot();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", () => syncMiniPlayerSlot());
  }

  const toggle = bar.querySelector<HTMLButtonElement>(".cm-mini-toggle")!;
  const time = bar.querySelector<HTMLElement>(".cm-mini-time")!;
  const titleEl = bar.querySelector<HTMLElement>(".cm-mini-title")!;
  titleEl.addEventListener("click", () => {
    if (!player.hash) return;
    const card = document.querySelector(`.cm-card[data-cm-hash="${player.hash}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("playing");
      setTimeout(() => {
        if (player.hash !== card.getAttribute("data-cm-hash") || a.paused) {
          card.classList.remove("playing");
        }
      }, 1500);
    }
  });

  const paint = () => {
    bar.hidden = !player.hash || (a.paused && a.currentTime === 0);
    toggle.textContent = a.paused ? "▶" : "⏸";
    toggle.setAttribute("aria-label", a.paused ? "Play" : "Pause");
    const dur = Number.isFinite(a.duration) ? a.duration : 0;
    time.textContent = `${formatMediaDuration(a.currentTime)} / ${formatMediaDuration(dur)}`;
    if (!bar.hidden) syncMiniPlayerSlot();
  };
  for (const ev of PLAYER_EVENTS) a.addEventListener(ev, paint);
  a.addEventListener("play", () => pauseAllOtherMedia(a));
  a.addEventListener("ended", () => {
    const endedHash = player.hash;
    a.currentTime = 0;
    if (endedHash) voiceEndedHandler?.(endedHash);
  });
  toggle.addEventListener("click", () => void (a.paused ? a.play().catch(() => {}) : a.pause()));
  bar.querySelector(".cm-mini-close")!.addEventListener("click", () => {
    a.pause();
    player.hash = "";
    a.removeAttribute("src");
    a.load();
    paint();
  });
  player.el = a;
  return a;
}

/** Load `url` in the player as the clip `hash`, titled `title` in the bar. */
function loadInPlayer(hash: string, url: string, title: string, rate: number): HTMLAudioElement {
  const a = sharedAudio();
  if (player.hash !== hash) {
    player.hash = hash;
    a.src = url;
    a.playbackRate = rate;
    const titleEl = document.querySelector<HTMLElement>("#cm-mini-player .cm-mini-title");
    if (titleEl) titleEl.textContent = title;
  }
  syncMiniPlayerSlot();
  return a;
}

/** A ⬇️ button that decrypts the attachment (fetching it if needed) and saves it as `fname`. */
function wireDownload(
  dlBtn: HTMLButtonElement,
  item: ChatMediaItem,
  fname: string,
  getSealed: (hash: string) => Promise<Uint8Array | null>
): void {
  const defaultIcon = renderIcon("download", { size: 14, className: "icon-xs" });
  let downloading = false;
  dlBtn.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    if (downloading) return;
    downloading = true;
    dlBtn.disabled = true;
    dlBtn.textContent = "…";
    try {
      const blobUrl = await resolveChatMediaUrl(item, getSealed);
      if (!blobUrl) {
        dlBtn.innerHTML = renderIcon("alertTriangle", { size: 14, className: "icon-xs" });
        setTimeout(() => {
          dlBtn.innerHTML = defaultIcon;
        }, 2500);
        return;
      }
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      dlBtn.innerHTML = renderIcon("check", { size: 14, className: "icon-xs" });
      setTimeout(() => {
        dlBtn.innerHTML = defaultIcon;
      }, 2000);
    } catch {
      dlBtn.innerHTML = renderIcon("alertTriangle", { size: 14, className: "icon-xs" });
      setTimeout(() => {
        dlBtn.innerHTML = defaultIcon;
      }, 2500);
    } finally {
      downloading = false;
      dlBtn.disabled = false;
    }
  });
}

const AUDIO_EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/webm": "webm", "audio/wav": "wav", "audio/aac": "aac" };
const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };

const lazyPosterCallbacks = new WeakMap<Element, () => void>();
let sharedLazyPosterObserver: IntersectionObserver | null = null;

function observeLazyPoster(el: Element, cb: () => void): void {
  if (typeof IntersectionObserver === "undefined") {
    cb();
    return;
  }
  if (!sharedLazyPosterObserver) {
    sharedLazyPosterObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const fn = lazyPosterCallbacks.get(entry.target);
          lazyPosterCallbacks.delete(entry.target);
          observer.unobserve(entry.target);
          fn?.();
        }
      },
      { rootMargin: "200px 0px" }
    );
  }
  lazyPosterCallbacks.set(el, cb);
  sharedLazyPosterObserver.observe(el);
}

function syncVnoteRing(ring: HTMLProgressElement | null, cur: number, dur: number): void {
  if (!ring) return;
  const pct = dur > 0 ? Math.max(0, Math.min(100, Math.round((cur / dur) * 100))) : 0;
  ring.value = pct;
  ring.setAttribute("value", String(pct));
  ring.style.setProperty("--value", String(pct));
  ring.setAttribute("aria-valuetext", `${formatMediaDuration(cur)} of ${formatMediaDuration(dur)}`);
}

function hydrateVnoteCard(
  card: HTMLElement,
  item: ChatMediaItem,
  getSealed: (hash: string) => Promise<Uint8Array | null>
): void {
  card.dataset.cmState = "ready";
  const stage = card.querySelector<HTMLElement>(".cm-vnote-stage");
  const ring = card.querySelector<HTMLProgressElement>(".cm-vnote-ring");
  const video = card.querySelector<HTMLVideoElement>(".cm-vnote-video");
  const overlay = card.querySelector<HTMLElement>(".cm-vnote-overlay");
  const badge = card.querySelector<HTMLElement>(".cm-vnote-badge");
  const muteBtn = card.querySelector<HTMLButtonElement>(".cm-vnote-mute");
  const speedBtn = card.querySelector<HTMLButtonElement>(".cm-vnote-speed");
  const dlBtn = card.querySelector<HTMLButtonElement>(".cm-vnote-download");
  if (!stage || !video) return;

  const knownDur = Number(card.dataset.cmDur || 0);
  const speeds = [1, 1.5, 2];
  let speedIdx = 0;
  let loadStatus: "idle" | "loading" | "ready" | "error" = "idle";
  let msUrl = "";

  if (dlBtn) {
    wireDownload(dlBtn, item, `video-message.${VIDEO_EXT[item.mime] ?? "mp4"}`, getSealed);
  }

  if (item.posterHash) {
    const posterItem: ChatMediaItem = { raw: "", kind: "img", mime: "image/jpeg", hash: item.posterHash, keyHex: item.keyHex };
    observeLazyPoster(card, () => {
      void resolveChatMediaUrl(posterItem, getSealed).then((url) => {
        if (url && video.isConnected && !video.poster) {
          video.poster = url;
        }
      });
    });
  }

  const paintVnote = () => {
    const playing = !video.paused && !video.ended;
    card.classList.toggle("playing", playing);
    if (overlay) overlay.textContent = playing ? "⏸" : "▶";
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : knownDur;
    const cur = video.currentTime || 0;
    syncVnoteRing(ring, playing || cur > 0 ? cur : 0, dur);
    if (badge && loadStatus !== "loading" && loadStatus !== "error") {
      const label = playing && dur > 0 ? formatMediaDuration(Math.max(0, dur - cur)) : formatMediaDuration(dur);
      badge.innerHTML = `${renderIcon("video", { size: 11, className: "icon-xs" })} <span>${esc(label)}</span>`;
    }
  };

  video.addEventListener("play", () => {
    pauseAllOtherMedia(video);
    paintVnote();
  });
  video.addEventListener("pause", paintVnote);
  video.addEventListener("timeupdate", paintVnote);
  video.addEventListener("loadedmetadata", paintVnote);
  video.addEventListener("ended", () => {
    video.currentTime = 0;
    paintVnote();
  });

  const loadVideoSource = async (): Promise<boolean> => {
    if (loadStatus === "ready") return true;
    if (loadStatus === "loading") return false;
    loadStatus = "loading";
    if (badge) badge.textContent = "Decrypting…";

    const cached = blobCache.get(cacheKeyOf(item.hash, item.keyHex));
    if (cached) {
      video.src = cached;
      video.playbackRate = speeds[speedIdx];
      loadStatus = "ready";
      paintVnote();
      return true;
    }

    let ms: MediaSource | null = null;
    let sb: SourceBuffer | null = null;
    let streaming = typeof MediaSource !== "undefined";
    let queue = Promise.resolve();

    const startStream = async (head: Uint8Array) => {
      if (typeof MediaSource === "undefined" || !isFragmentedMp4(head)) throw new Error("not streamable");
      const M = await import("mediabunny");
      const detectedMime = await new M.Input({ source: new M.BufferSource(head), formats: [M.MP4] }).getMimeType();
      if (!MediaSource.isTypeSupported(detectedMime)) throw new Error(`no MediaSource for ${detectedMime}`);
      ms = new MediaSource();
      msUrl = URL.createObjectURL(ms);
      video.src = msUrl;
      video.playbackRate = speeds[speedIdx];
      await new Promise((r) => ms!.addEventListener("sourceopen", r, { once: true }));
      sb = ms.addSourceBuffer(detectedMime);
      loadStatus = "ready";
      paintVnote();
      pauseAllOtherMedia(video);
      void video.play().catch(() => {});
    };

    const appendPart = (part: Uint8Array) =>
      new Promise<void>((resolve, reject) => {
        sb!.addEventListener("updateend", () => resolve(), { once: true });
        sb!.addEventListener("error", () => reject(new Error("append failed")), { once: true });
        sb!.appendBuffer(part as BufferSource);
      });

    const onPart = (part: Uint8Array, index: number) => {
      queue = queue
        .then(async () => {
          if (!streaming) return;
          if (index === 0) await startStream(part);
          await appendPart(part);
        })
        .catch(() => {
          streaming = false;
        });
    };

    try {
      const fullUrl = await resolveChatMediaUrl(item, getSealed, undefined, onPart);
      await queue;
      if (!fullUrl) {
        if (msUrl) {
          URL.revokeObjectURL(msUrl);
          msUrl = "";
        }
        loadStatus = "error";
        if (badge) badge.textContent = "Tap to retry";
        return false;
      }
      const activeMs = ms as MediaSource | null;
      const activeSb = sb as SourceBuffer | null;
      if (streaming && activeSb && activeMs?.readyState === "open") {
        try {
          activeMs.endOfStream();
        } catch {}
      } else {
        if (msUrl) {
          URL.revokeObjectURL(msUrl);
          msUrl = "";
        }
        video.src = fullUrl;
        video.playbackRate = speeds[speedIdx];
      }
      loadStatus = "ready";
      paintVnote();
      return true;
    } catch {
      loadStatus = "error";
      if (badge) badge.textContent = "Tap to retry";
      return false;
    }
  };

  const togglePlay = async () => {
    if (loadStatus === "loading") return;
    if (loadStatus === "idle" || loadStatus === "error") {
      const ok = await loadVideoSource();
      if (!ok) return;
      if (video.paused) {
        pauseAllOtherMedia(video);
        await video.play().catch(() => {});
      }
      return;
    }
    if (video.paused) {
      pauseAllOtherMedia(video);
      await video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  stage.addEventListener("click", (ev) => {
    ev.stopPropagation();
    void togglePlay();
  });
  stage.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      ev.stopPropagation();
      void togglePlay();
    }
  });

  muteBtn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    video.muted = !video.muted;
    muteBtn.innerHTML = renderIcon(video.muted ? "volumeX" : "volume2", { size: 14, className: "icon-xs" });
    muteBtn.setAttribute("aria-pressed", video.muted ? "true" : "false");
  });

  speedBtn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    speedIdx = (speedIdx + 1) % speeds.length;
    video.playbackRate = speeds[speedIdx];
    speedBtn.textContent = `${speeds[speedIdx]}×`;
  });
}

export function fillChatMedia(
  root: ParentNode,
  getSealed: (hash: string) => Promise<Uint8Array | null>
): void {
  root.querySelectorAll<HTMLElement>(".cm-card:not([data-cm-state])").forEach((card) => {
    const kind = (card.dataset.cmKind || "img") as ChatMediaKind;
    const mime = card.dataset.cmMime || "";
    const hash = card.dataset.cmHash || "";
    const keyHex = card.dataset.cmKey || "";
    if (!hash || !keyHex) return;

    const filename = card.dataset.cmFilename || "";
    const sizeBytes = Number(card.dataset.cmSize || 0);
    const posterHash = card.dataset.cmPoster || undefined;

    const item: ChatMediaItem = {
      raw: "",
      kind,
      mime,
      hash,
      keyHex,
      durationSec: Number(card.dataset.cmDur || 0),
      sizeBytes: sizeBytes > 0 ? sizeBytes : undefined,
      filename: filename || undefined,
      ...(posterHash ? { posterHash } : {}),
    };

    if (kind === "img") {
      const wrap = card.querySelector<HTMLElement>(".cm-img-wrap");
      if (!wrap) return;
      const loadImg = () => {
        card.dataset.cmState = "loading";
        wrap.innerHTML = `<div class="cm-img-status">Decrypting photo…</div>`;
        void resolveChatMediaUrl(item, getSealed).then((blobUrl) => {
          if (!blobUrl) {
            card.dataset.cmState = "missing";
            wrap.innerHTML = `<button type="button" class="cm-retry-btn">Photo not on node yet · Tap to retry</button>`;
            wrap.querySelector(".cm-retry-btn")?.addEventListener("click", (ev) => {
              ev.stopPropagation();
              loadImg();
            });
            return;
          }
          card.dataset.cmState = "ready";
          const img = document.createElement("img");
          img.src = blobUrl;
          img.alt = "Encrypted chat photo";
          img.loading = "lazy";
          wrap.innerHTML = "";
          wrap.appendChild(img);
        });
      };
      loadImg();
      return;
    }

    if (kind === "file") {
      card.dataset.cmState = "ready";
      const dlBtn = card.querySelector<HTMLButtonElement>(".cm-file-download");
      const fname = card.dataset.cmFilename || item.filename || "file";
      if (dlBtn) wireDownload(dlBtn, item, fname, getSealed);
      return;
    }

    if (kind === "vnote") {
      hydrateVnoteCard(card, item, getSealed);
      return;
    }

    // Audio / Voice Note player hydration
    card.dataset.cmState = "ready";
    const playBtn = card.querySelector<HTMLButtonElement>(".cm-audio-play");
    const wfEl = card.querySelector<HTMLElement>(".cm-waveform");
    const timeEl = card.querySelector<HTMLElement>(".cm-audio-time");
    const speedBtn = card.querySelector<HTMLButtonElement>(".cm-speed-btn");
    if (!playBtn || !wfEl || !timeEl) return;
    const audioDl = card.querySelector<HTMLButtonElement>(".cm-audio-download");
    if (audioDl) wireDownload(audioDl, item, `${kind === "voice" ? "voice-note" : "audio"}.${AUDIO_EXT[mime] ?? "audio"}`, getSealed);

    const bars = Array.from(wfEl.querySelectorAll<HTMLElement>(".cm-wf-bar"));
    const knownDur = Number(card.dataset.cmDur || 0);
    const title = card.dataset.cmTitle || (kind === "voice" ? "Voice message" : "Audio");
    const speeds = [1, 1.5, 2];
    let speedIdx = 0;
    let loading = false;
    const shared = sharedAudio();
    const mine = () => player.hash === hash;

    // the card shows the player while it holds this clip; a card gone from the page stops listening
    const sync = () => {
      if (!card.isConnected) {
        for (const ev of PLAYER_EVENTS) shared.removeEventListener(ev, sync);
        return;
      }
      if (loading) return;
      const on = mine();
      const playing = on && !shared.paused;
      playBtn.textContent = playing ? "⏸" : "▶";
      card.classList.toggle("playing", playing);
      const dur = on && Number.isFinite(shared.duration) && shared.duration > 0 ? shared.duration : knownDur;
      const cur = on ? shared.currentTime : 0;
      const lit = Math.round((dur > 0 ? Math.max(0, Math.min(1, cur / dur)) : 0) * bars.length);
      bars.forEach((b, i) => b.classList.toggle("played", i < lit));
      timeEl.textContent = playing || cur > 0 ? `${formatMediaDuration(cur)} / ${formatMediaDuration(dur)}` : formatMediaDuration(dur);
      if (on && speedBtn) speedBtn.textContent = `${shared.playbackRate}×`;
    };
    for (const ev of PLAYER_EVENTS) shared.addEventListener(ev, sync);
    sync();

    const start = async (): Promise<boolean> => {
      if (mine()) return true;
      if (loading) return false;
      loading = true;
      timeEl.textContent = "Decrypting…";
      playBtn.disabled = true;
      try {
        const blobUrl = await resolveChatMediaUrl(item, getSealed);
        if (!blobUrl) {
          timeEl.textContent = "Not on node · Retry";
          return false;
        }
        loadInPlayer(hash, blobUrl, title, speeds[speedIdx]);
        return true;
      } finally {
        loading = false;
        playBtn.disabled = false;
        if (mine()) sync();
      }
    };

    if (kind === "voice") {
      voiceCardStarters.set(card, async () => {
        if (!card.isConnected) return "missing";
        if (!(await start())) return "missing";
        if (shared.paused) {
          try {
            await shared.play();
          } catch (err: unknown) {
            const name = (err as { name?: string })?.name;
            if (name === "NotAllowedError") return "blocked";
            return "missing";
          }
        }
        return "started";
      });
    }

    playBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!(await start())) return;
      if (shared.paused) await shared.play().catch(() => {});
      else shared.pause();
    });

    wfEl.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const rect = wfEl.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      if (!(await start())) return;
      const dur = Number.isFinite(shared.duration) && shared.duration > 0 ? shared.duration : knownDur;
      if (dur > 0) shared.currentTime = ratio * dur;
      if (shared.paused) await shared.play().catch(() => {});
    });

    speedBtn?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      speedIdx = (speedIdx + 1) % speeds.length;
      if (mine()) shared.playbackRate = speeds[speedIdx];
      speedBtn.textContent = `${speeds[speedIdx]}×`;
    });
  });
}

