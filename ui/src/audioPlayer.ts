// Pure audio queue, SoundCloud-style FreeTunes stream filtering, and formatting helpers (TASK-008).
// Zero DOM dependencies so it can be unit-tested directly in Node.
import type { FtReleaseItem } from "./freetunes.ts";

export interface AudioQueueTrack {
  releaseId: string;
  params: string;
  trackIndex: number;
  title: string;
  artist: string;
  releaseTitle: string;
  owner?: string;
  coverId?: string;
  durationMs: number;
  chunks: string[];
}

export interface AudioQueueState {
  queue: AudioQueueTrack[];
  currentIndex: number;
  playing: boolean;
  volume: number;
}

export function createAudioQueueState(): AudioQueueState {
  return {
    queue: [],
    currentIndex: -1,
    playing: false,
    volume: 0.85,
  };
}

export const trackKey = (t: Pick<AudioQueueTrack, "releaseId" | "trackIndex">): string =>
  `${t.releaseId}:${t.trackIndex}`;

/**
 * Play `track` immediately: if it is already in the queue, jump to it;
 * otherwise append it and select it as current.
 */
export function playInQueue(state: AudioQueueState, track: AudioQueueTrack): AudioQueueState {
  const k = trackKey(track);
  const existingIdx = state.queue.findIndex((q) => trackKey(q) === k);
  if (existingIdx !== -1) {
    return { ...state, currentIndex: existingIdx, playing: true };
  }
  const nextQueue = [...state.queue, track];
  return { ...state, queue: nextQueue, currentIndex: nextQueue.length - 1, playing: true };
}

/** Enqueue `track` without interrupting current playback (unless queue is empty). */
export function enqueueInQueue(state: AudioQueueState, track: AudioQueueTrack): AudioQueueState {
  const k = trackKey(track);
  if (state.queue.some((q) => trackKey(q) === k)) return state;
  const nextQueue = [...state.queue, track];
  const currentIndex = state.currentIndex === -1 ? 0 : state.currentIndex;
  return { ...state, queue: nextQueue, currentIndex };
}

export function nextQueueIndex(state: AudioQueueState): number {
  if (!state.queue.length) return -1;
  if (state.currentIndex + 1 < state.queue.length) return state.currentIndex + 1;
  return -1;
}

export function prevQueueIndex(state: AudioQueueState): number {
  if (!state.queue.length) return -1;
  if (state.currentIndex > 0) return state.currentIndex - 1;
  return 0;
}

/** Format seconds into `m:ss`. */
export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Deterministic pseudo-waveform heights (24 bars, 25..100%) for SoundCloud-style track rows. */
export function trackWaveformBars(seed: string, count = 24): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= i + 0x9e3779b9;
    h = Math.imul(h, 16777619);
    const norm = ((h >>> 0) % 76) + 25;
    bars.push(norm);
  }
  return bars;
}

/**
 * Filter FreeTunes directory releases by hidden authors (moderation), following set, and search query.
 */
export function filterFreetunesReleases(
  items: FtReleaseItem[],
  opts: {
    query?: string;
    following?: Set<string>;
    onlyFollowing?: boolean;
    hiddenAuthors?: Set<string>;
  } = {}
): FtReleaseItem[] {
  const q = (opts.query || "").trim().toLowerCase();
  const hidden = opts.hiddenAuthors;
  const following = opts.following;
  return items.filter((item) => {
    if (hidden?.has(item.owner)) return false;
    if (opts.onlyFollowing && following && !following.has(item.owner)) return false;
    if (q) {
      const hay = `${item.title} ${item.artist}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
