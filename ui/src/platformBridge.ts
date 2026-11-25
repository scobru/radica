// Single typed seam for `window.__radicaNative` across Browser, Android, Desktop, and Node Terminal chat.

export interface RadicaNativeBridge {
  getAppMode?: () => string;
  isMessenger?: () => boolean;
  getAll?: () => string | null;
  setAll?: (json: string) => void;
  meshSend?: (json: string) => void;
  openExternal?: (url: string) => void;
  canRecordVoice?: () => boolean;
  startVoiceRec?: (maxSec: number) => void;
  stopVoiceRec?: () => void;
  cancelVoiceRec?: () => void;
}

export type NativeVoiceBridge = RadicaNativeBridge & {
  startVoiceRec: (maxSec: number) => void;
  stopVoiceRec: () => void;
};

/** Return the native wrapper bridge injected by Android, Desktop, or Node CLI, if present. */
export function getNativeBridge(): RadicaNativeBridge | undefined {
  return (globalThis as { __radicaNative?: RadicaNativeBridge }).__radicaNative;
}

export function hasNativeBridge(): boolean {
  return Boolean(getNativeBridge());
}

/** Query the native wrapper's app mode (`"messenger"` or `"full"`), returning `null` if unspecified or unavailable. */
export function getNativeAppMode(): "messenger" | "full" | null {
  const bridge = getNativeBridge();
  if (!bridge) return null;
  try {
    if (typeof bridge.getAppMode === "function") {
      const mode = bridge.getAppMode();
      if (mode === "messenger" || mode === "full") return mode;
    }
  } catch {}
  try {
    if (typeof bridge.isMessenger === "function" && bridge.isMessenger() === true) return "messenger";
  } catch {}
  return null;
}

/** Return the native microphone recording bridge when Desktop/Android exposes it and allows capture. */
export function getNativeVoiceBridge(): NativeVoiceBridge | null {
  const nb = getNativeBridge();
  if (!nb) return null;
  if (typeof nb.startVoiceRec !== "function" || typeof nb.stopVoiceRec !== "function") return null;
  if (typeof nb.canRecordVoice === "function" && !nb.canRecordVoice()) return null;
  return nb as NativeVoiceBridge;
}

/** Open an external http(s)/spore:radio URL through the native wrapper (or `window.open` when `fallbackWindowOpen` is set). */
export function openExternalUrl(
  rawUrl: string,
  opts: { baseHref?: string; fallbackWindowOpen?: boolean } = {},
): boolean {
  if (!rawUrl) return false;
  let resolved: string;
  try {
    const base = opts.baseHref ?? (typeof window !== "undefined" ? window.location?.href : undefined);
    resolved = base ? new URL(rawUrl, base).href : new URL(rawUrl).href;
  } catch {
    return false;
  }
  if (!/^https?:\/\/|^spore:radio:/i.test(resolved)) return false;

  const openExt = getNativeBridge()?.openExternal;
  if (typeof openExt === "function") {
    openExt(resolved);
    return true;
  }
  if (opts.fallbackWindowOpen && typeof window !== "undefined" && typeof window.open === "function") {
    window.open(resolved, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}
