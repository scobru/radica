// Radica Notification Sound Synthesizer & Player
// Plays the crisp "pop" notification sound using the vendored pop.mp3 audio asset,
// with an on-device Web Audio API synthesizer as an instantaneous zero-dependency fallback.
// 100% offline, zero external network requests, fully compliant with Freenet's CSP.

import { safeStorage } from "./storage.ts";

export const SOUND_STORAGE_KEY = "radica_sound_enabled";

let sharedAudioCtx: AudioContext | null = null;
let popAudioBuffer: AudioBuffer | null = null;
let isFetchingAudio = false;
let lastPlayTime = 0;
const MIN_PLAY_INTERVAL_MS = 50; // Throttle rapid-fire notifications

export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      try {
        sharedAudioCtx = new AudioCtx();
      } catch {
        return null;
      }
    }
  }
  return sharedAudioCtx;
}

export async function preloadPopSound(url = "./sounds/pop.mp3"): Promise<boolean> {
  if (typeof window === "undefined" || typeof fetch === "undefined") return false;
  if (popAudioBuffer) return true;
  if (isFetchingAudio) return false;

  const ctx = getAudioContext();
  if (!ctx) return false;

  isFetchingAudio = true;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    popAudioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      ctx.decodeAudioData(arrayBuf, resolve, reject);
    });
    return true;
  } catch {
    return false;
  } finally {
    isFetchingAudio = false;
  }
}

// Browser Autoplay Policy: resume suspended AudioContext and preload on user gesture
if (typeof document !== "undefined") {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    void preloadPopSound();
  };
  document.addEventListener("click", unlockAudio, { passive: true });
  document.addEventListener("keydown", unlockAudio, { passive: true });
  if (typeof window !== "undefined") {
    setTimeout(() => { void preloadPopSound(); }, 500);
  }
}

export function isSoundEnabled(): boolean {
  return safeStorage.getItem(SOUND_STORAGE_KEY) !== "false";
}

export function setSoundEnabled(enabled: boolean): void {
  safeStorage.setItem(SOUND_STORAGE_KEY, enabled ? "true" : "false");
}

export function toggleSoundEnabled(): boolean {
  const next = !isSoundEnabled();
  setSoundEnabled(next);
  if (next) {
    playPopSound(true); // Instant audio feedback when turned on
  }
  return next;
}

function playBufferPop(ctx: AudioContext, buffer: AudioBuffer): boolean {
  try {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.7; // Gentle, crisp volume
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    return true;
  } catch {
    return false;
  }
}

export function playSynthesizedPop(ctx: AudioContext): boolean {
  try {
    const t = ctx.currentTime;

    // 1. Main pop / bubble tone (sine wave pitch sweep)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.035);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.085);

    // 2. High-frequency transient click for crispness
    const snapOsc = ctx.createOscillator();
    const snapGain = ctx.createGain();

    snapOsc.type = "triangle";
    snapOsc.frequency.setValueAtTime(1400, t);
    snapOsc.frequency.exponentialRampToValueAtTime(500, t + 0.015);

    snapGain.gain.setValueAtTime(0.07, t);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);

    snapOsc.connect(snapGain);
    snapGain.connect(ctx.destination);

    snapOsc.start(t);
    snapOsc.stop(t + 0.018);

    return true;
  } catch {
    return false;
  }
}

/**
 * Plays the "pop" notification sound.
 * Plays the decoded pop.mp3 buffer if available, or falls back to Web Audio synthesis.
 */
export function playPopSound(force = false): boolean {
  if (!force && !isSoundEnabled()) return false;

  const now = Date.now();
  if (!force && now - lastPlayTime < MIN_PLAY_INTERVAL_MS) return false;
  lastPlayTime = now;

  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    if (popAudioBuffer) {
      return playBufferPop(ctx, popAudioBuffer);
    }

    if (!isFetchingAudio && typeof fetch !== "undefined") {
      void preloadPopSound();
    }

    return playSynthesizedPop(ctx);
  } catch {
    return false;
  }
}

/**
 * Play a short walkie-talkie chirp ("start": rising double-tone, "end": falling roger-beep).
 * Respects the user's global sound setting (`isSoundEnabled()`).
 */
export function playWalkieChirp(kind: "start" | "end"): boolean {
  if (!isSoundEnabled()) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    if (kind === "start") {
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.setValueAtTime(880, t + 0.036);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } else {
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.setValueAtTime(587, t + 0.042);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.095);
    }
    return true;
  } catch {
    return false;
  }
}
