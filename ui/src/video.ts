// Post videos. Made on-device: frames sampled and scanned first (a blocked video is never encoded), then transcoded to
// a small H.264 + AAC MP4 with Mediabunny (WebCodecs). Published like a big chat attachment (sealed chunks + manifest,
// chatMedia.ts), so nodes hold ciphertext. A post names one as "radica-video:<manifest hash>:<key hex>[:<poster hash>]",
// the poster being the first scanned frame (a JPEG), sealed with the same key.
import type { ImageModerationResult } from "./moderation";
import { mediaHashOf } from "./media.ts";
import { type ChunkProgress, keepChatMediaUrl, sealWithKey, MAX_CHAT_FILE_BYTES, resolveChatMediaUrl, sealChatMediaChunked, uploadChatMedia, scanTimes, isFragmentedMp4, type ChatMediaItem } from "./chatMedia.ts";

export { scanTimes, isFragmentedMp4 };

export const VIDEO_PREFIX = "radica-video:";
// The MP4 must fit the 25 MB chunked attachment cap, and readers download it whole: the longer the video, the lower
// the bitrate (and height), down to MIN_VIDEO_BPS. 10% kept for the MP4 container and encoder overshoot.
const BUDGET_BITS = MAX_CHAT_FILE_BYTES * 0.9 * 8;
const AUDIO_BPS = 64_000;
const MIN_VIDEO_BPS = 250_000;
const MAX_VIDEO_BPS = 1_200_000;
export const MAX_VIDEO_SEC = Math.floor(BUDGET_BITS / (MIN_VIDEO_BPS + AUDIO_BPS));

/** Video bitrate and height for a clip of `duration` s from a `sourceHeight` source; null when it is too long. */
export function videoPlan(duration: number, sourceHeight: number): { bitrate: number; height: number } | null {
  const bitrate = Math.min(MAX_VIDEO_BPS, Math.floor(BUDGET_BITS / duration) - AUDIO_BPS);
  if (!(bitrate >= MIN_VIDEO_BPS)) return null;
  return { bitrate, height: Math.min(sourceHeight, bitrate >= 800_000 ? 720 : bitrate >= 450_000 ? 480 : 360) };
}

export function videoRef(uri?: string): { hash: string; keyHex: string; posterHash?: string } | null {
  const m = /^radica-video:([0-9a-f]{64}):([0-9a-f]{64})(?::([0-9a-f]{64}))?$/.exec(uri ?? "");
  return m ? { hash: m[1], keyHex: m[2], ...(m[3] ? { posterHash: m[3] } : {}) } : null;
}

const item = (hash: string, keyHex: string): ChatMediaItem => ({ raw: "", kind: "file", mime: "video/mp4", hash, keyHex });

/**
 * Scan `file` frame by frame with `scan`; stops at the first unverified or blocked (>= stopAt) frame. When nothing
 * stopped it, transcode it. Returns the worst scan, a poster blob, and the MP4 bytes (absent when stopped).
 */
export async function prepareVideo(
  file: Blob,
  scan: (frame: HTMLCanvasElement | OffscreenCanvas) => Promise<ImageModerationResult>,
  stopAt: number,
  onProgress?: (stage: "scan" | "encode", p: number) => void
): Promise<{ worst: ImageModerationResult; poster: Blob | null; bytes?: Uint8Array; audioDropped?: boolean }> {
  const M = await import("mediabunny");
  const input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS });
  const duration = await input.computeDuration();
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("No video track in this file.");
  const plan = videoPlan(duration, track.displayHeight);
  if (!plan) throw new Error(`Video is ${Math.round(duration)} s, over the ${Math.floor(MAX_VIDEO_SEC / 60)} min limit.`);

  const times = scanTimes(duration);
  const sink = new M.CanvasSink(track, { height: Math.min(512, track.displayHeight), fit: "contain" });
  let worst: ImageModerationResult = { isNSFW: false, score: 0, label: "Safe" };
  let poster: Blob | null = null;
  let i = 0;
  for await (const frame of sink.canvasesAtTimestamps(times)) {
    onProgress?.("scan", ++i / times.length);
    if (!frame) continue;
    await new Promise<void>((r) => setTimeout(r, 0));
    const c = frame.canvas;
    if (!poster) poster = c instanceof HTMLCanvasElement ? await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.8)) : await c.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    const r = await scan(c);
    if (r.unverified || r.score > worst.score) worst = r;
    if (r.unverified || r.score >= stopAt) return { worst, poster };
  }

  // AAC plays everywhere, but not every browser can encode it (WebCodecs): Opus in MP4 then (Chrome, Firefox, Safari 17+)
  const audioCodec = (await M.canEncodeAudio("aac", { bitrate: AUDIO_BPS })) ? "aac" : "opus";
  const output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: "fragmented" }), target: new M.BufferTarget() });
  const conversion = await M.Conversion.init({
    input,
    output,
    video: { codec: "avc", bitrate: plan.bitrate, keyFrameInterval: 2, forceTranscode: true, ...(plan.height < track.displayHeight ? { height: plan.height } : {}) },
    audio: { codec: audioCodec, bitrate: AUDIO_BPS, forceTranscode: true },
  });
  if (!conversion.isValid) throw new Error("This browser cannot encode this video (H.264).");
  // the conversion stays valid without its sound: say so instead of posting a silent video unannounced
  const audioDropped = conversion.discardedTracks.some((d) => d.track.isAudioTrack());
  conversion.onProgress = (p) => onProgress?.("encode", p);
  await conversion.execute();
  const bytes = new Uint8Array(output.target.buffer!);
  if (bytes.byteLength > MAX_CHAT_FILE_BYTES) throw new Error("Encoded video is too big; try a shorter clip.");
  return { worst, poster, bytes, audioDropped };
}

/** Seal and publish the MP4; returns the post's media_uri. Kept locally so our own post plays at once. */
export async function publishVideo(bytes: Uint8Array, put: (b: Uint8Array) => Promise<unknown>, onProgress?: (done: number, total: number) => void, poster?: Blob | null): Promise<string> {
  const { blobs, hash, keyHex } = await sealChatMediaChunked(bytes);
  keepChatMediaUrl(hash, keyHex, bytes, "file", "video/mp4");
  let posterPart = "";
  if (poster) {
    const plain = new Uint8Array(await poster.arrayBuffer());
    const sealed = await sealWithKey(plain, keyHex);
    blobs.push(sealed);
    posterPart = `:${mediaHashOf(sealed)}`;
    keepChatMediaUrl(mediaHashOf(sealed), keyHex, plain, "img", "image/jpeg");
  }
  await uploadChatMedia(blobs, put, onProgress);
  return `${VIDEO_PREFIX}${hash}:${keyHex}${posterPart}`;
}

/** A blob: URL for the poster a media_uri names; null for a video posted without one, or when it is missing. */
export function videoPosterUrl(uri: string, get: (hash: string) => Promise<Uint8Array | null>): Promise<string | null> {
  const ref = videoRef(uri);
  if (!ref?.posterHash) return Promise.resolve(null);
  return resolveChatMediaUrl({ raw: "", kind: "img", mime: "image/jpeg", hash: ref.posterHash, keyHex: ref.keyHex }, get);
}

/**
 * A <video> for the video a media_uri names. A fragmented MP4 (posted since streaming) starts playing as its pieces
 * arrive, through MediaSource; older videos, or a browser without MediaSource for its codecs, play once whole.
 * `onReady` runs once, when the video can be shown; `done` is false when the video could not be fetched.
 */
export function playVideo(
  uri: string,
  get: (hash: string) => Promise<Uint8Array | null>,
  onProgress?: ChunkProgress,
  onReady?: (video: HTMLVideoElement) => void
): { video: HTMLVideoElement; done: Promise<boolean> } {
  const video = document.createElement("video");
  Object.assign(video, { controls: true, autoplay: true, playsInline: true });
  let shown = false;
  const show = () => !shown && ((shown = true), onReady?.(video));
  let ms: MediaSource | null = null;
  let msUrl = "";
  let sb: SourceBuffer | null = null;
  let streaming = true;
  let queue = Promise.resolve();

  const start = async (head: Uint8Array) => {
    if (typeof MediaSource === "undefined" || !isFragmentedMp4(head)) throw new Error("not streamable");
    const M = await import("mediabunny");
    const mime = await new M.Input({ source: new M.BufferSource(head), formats: [M.MP4] }).getMimeType();
    if (!MediaSource.isTypeSupported(mime)) throw new Error(`no MediaSource for ${mime}`);
    ms = new MediaSource();
    msUrl = URL.createObjectURL(ms);
    video.src = msUrl;
    await new Promise((r) => ms!.addEventListener("sourceopen", r, { once: true }));
    sb = ms.addSourceBuffer(mime);
    show();
  };
  const append = (part: Uint8Array) =>
    new Promise<void>((resolve, reject) => {
      sb!.addEventListener("updateend", () => resolve(), { once: true });
      sb!.addEventListener("error", () => reject(new Error("append failed")), { once: true });
      sb!.appendBuffer(part as BufferSource);
    });
  const onPart = (part: Uint8Array, index: number) => {
    queue = queue
      .then(async () => {
        if (!streaming) return;
        if (index === 0) await start(part);
        await append(part);
      })
      .catch(() => {
        streaming = false; // played once whole instead
      });
  };

  const done = videoUrl(uri, get, onProgress, onPart).then(async (url) => {
    await queue;
    if (!url) {
      if (msUrl) URL.revokeObjectURL(msUrl);
      return false;
    }
    if (streaming && sb && ms?.readyState === "open") ms.endOfStream();
    else {
      if (msUrl) URL.revokeObjectURL(msUrl);
      video.src = url;
      show();
    }
    return true;
  });
  return { video, done };
}

/** A blob: URL for the video a media_uri names, or null when it is missing. */
export function videoUrl(
  uri: string,
  get: (hash: string) => Promise<Uint8Array | null>,
  onProgress?: ChunkProgress,
  onPart?: (part: Uint8Array, index: number) => void
): Promise<string | null> {
  const ref = videoRef(uri);
  return ref ? resolveChatMediaUrl(item(ref.hash, ref.keyHex), get, onProgress, onPart) : Promise.resolve(null);
}
