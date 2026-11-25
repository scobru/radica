// Shared video moderation policy & progressive fragmented-MP4 MediaSource streaming
// shared by Feed videos (`video.ts`) and Circular Video Messages (`chatMedia.ts`).
import type { ImageModerationResult } from "./moderation.ts";

/** Whether an MP4's first bytes declare movie fragments ("mvex" in its moov): playable progressively. */
export function isFragmentedMp4(head: Uint8Array): boolean {
  const n = Math.min(head.byteLength, 1 << 16);
  for (let i = 0; i + 4 <= n; i++) {
    if (head[i] === 0x6d && head[i + 1] === 0x76 && head[i + 2] === 0x65 && head[i + 3] === 0x78) return true;
  }
  return false;
}

/** True when a sampled video frame must block encoding/upload (unverified, flagged NSFW, or >= stopAt). */
export function isFrameBlocked(res: ImageModerationResult, stopAt: number): boolean {
  return Boolean(res.unverified || res.isNSFW || res.score >= stopAt);
}

/** Human-readable reason a sampled video frame was blocked, or null when safe. */
export function frameBlockReason(res: ImageModerationResult, stopAt: number): string | null {
  if (!isFrameBlocked(res, stopAt)) return null;
  if (res.unverified) return "Unverified (moderation model unavailable)";
  return res.label || "Sensitive content";
}

export interface FragmentedMp4Streamer {
  onPart(part: Uint8Array, index: number): void;
  finish(fullUrl: string | null): Promise<boolean>;
}

/**
 * Progressively stream fragmented-MP4 chunks into `video` via `MediaSource`, falling back cleanly to
 * assigning `fullUrl` when the runtime lacks `MediaSource` support, the clip isn't fragmented, or append fails.
 */
export function createFragmentedMp4Streamer(
  video: HTMLVideoElement,
  opts: {
    onStreamReady?: () => void;
    onFallback?: (url: string) => void;
  } = {},
): FragmentedMp4Streamer {
  let ms: MediaSource | null = null;
  let msUrl = "";
  let sb: SourceBuffer | null = null;
  let streaming = typeof MediaSource !== "undefined";
  let queue = Promise.resolve();

  const revokeMsUrl = () => {
    if (!msUrl) return;
    try {
      URL.revokeObjectURL(msUrl);
    } catch {}
    msUrl = "";
  };

  const startStream = async (head: Uint8Array) => {
    if (typeof MediaSource === "undefined" || !isFragmentedMp4(head)) throw new Error("not streamable");
    const M = await import("mediabunny");
    const mime = await new M.Input({ source: new M.BufferSource(head), formats: [M.MP4] }).getMimeType();
    if (!MediaSource.isTypeSupported(mime)) throw new Error(`no MediaSource for ${mime}`);
    ms = new MediaSource();
    msUrl = URL.createObjectURL(ms);
    video.src = msUrl;
    await new Promise((r) => ms!.addEventListener("sourceopen", r, { once: true }));
    sb = ms.addSourceBuffer(mime);
    opts.onStreamReady?.();
  };

  const appendPart = (part: Uint8Array) =>
    new Promise<void>((resolve, reject) => {
      sb!.addEventListener("updateend", () => resolve(), { once: true });
      sb!.addEventListener("error", () => reject(new Error("append failed")), { once: true });
      sb!.appendBuffer(part as BufferSource);
    });

  return {
    onPart(part: Uint8Array, index: number) {
      queue = queue
        .then(async () => {
          if (!streaming) return;
          if (index === 0) await startStream(part);
          await appendPart(part);
        })
        .catch(() => {
          streaming = false;
        });
    },
    async finish(fullUrl: string | null): Promise<boolean> {
      await queue;
      if (!fullUrl) {
        revokeMsUrl();
        return false;
      }
      if (streaming && sb && ms?.readyState === "open") {
        try {
          ms.endOfStream();
        } catch {}
      } else {
        revokeMsUrl();
        video.src = fullUrl;
        opts.onFallback?.(fullUrl);
      }
      return true;
    },
  };
}
