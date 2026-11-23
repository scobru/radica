// Pure Walkie-Talkie queue, preferences, and sequential voice playback helpers (DOM-free for Node tests).

import { parseChatMedia } from "./chatMedia.ts";

export const WALKIE_STORAGE_KEY = "radica_walkie_talkie";
/** Walkie-Talkie burst cap (10s @ ~24 kbps <= ~30 KB, fits in one media-contract PUT for minimal latency). */
export const WALKIE_PTT_MAX_SEC = 10;
/** Standard hands-free / tap voice note cap inside chat. */
export const STANDARD_VOICE_MAX_SEC = 60;
/** Hold >= 450 ms triggers auto-send on release; shorter tap enters hands-free recording mode. */
export const PTT_HOLD_THRESHOLD_MS = 450;
/** Minimum recorded audio duration to avoid accidental tiny clicks. */
export const MIN_PTT_SEC = 0.5;

export interface WalkieQueueItem {
  msgId: string;
  hash: string;
  keyHex: string;
  mime: string;
  durationSec?: number;
  roomId: string;
  sender: string;
  title: string;
}

export interface WalkieStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readWalkieEnabled(store: Pick<WalkieStore, "getItem">): boolean {
  try {
    return store.getItem(WALKIE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeWalkieEnabled(store: Pick<WalkieStore, "setItem">, enabled: boolean): void {
  try {
    store.setItem(WALKIE_STORAGE_KEY, enabled ? "1" : "0");
  } catch {}
}

export interface WalkieQueueController {
  readonly enabled: boolean;
  readonly activeRoomId: string | null;
  readonly currentHash: string | null;
  setEnabled(on: boolean): void;
  seedRoom(roomId: string, existingMessages: ReadonlyArray<{ id: string }>): void;
  ingestMessages(
    roomId: string,
    messages: ReadonlyArray<{ id: string; sender: string; text: string }>,
    myPubkey: string,
    shouldSkipSender?: (sender: string) => boolean,
    formatTitle?: (sender: string, caption: string) => string
  ): WalkieQueueItem[];
  dequeueNext(): WalkieQueueItem | null;
  markFinished(hash: string): void;
  clearQueue(): void;
  pendingCount(): number;
  peekQueue(): WalkieQueueItem[];
}

export function createWalkieQueue(initialEnabled = false): WalkieQueueController {
  let enabled = initialEnabled;
  let activeRoomId: string | null = null;
  const seenMsgIds = new Set<string>();
  const playedHashes = new Set<string>();
  let queue: WalkieQueueItem[] = [];
  let currentHash: string | null = null;

  return {
    get enabled() {
      return enabled;
    },
    get activeRoomId() {
      return activeRoomId;
    },
    get currentHash() {
      return currentHash;
    },

    setEnabled(on: boolean) {
      enabled = on;
      if (!on) {
        queue = [];
        currentHash = null;
      }
    },

    seedRoom(roomId: string, existingMessages: ReadonlyArray<{ id: string }>) {
      activeRoomId = roomId || null;
      queue = [];
      currentHash = null;
      seenMsgIds.clear();
      for (const m of existingMessages) {
        if (m.id) seenMsgIds.add(m.id);
      }
    },

    ingestMessages(
      roomId: string,
      messages: ReadonlyArray<{ id: string; sender: string; text: string }>,
      myPubkey: string,
      shouldSkipSender?: (sender: string) => boolean,
      formatTitle?: (sender: string, caption: string) => string
    ): WalkieQueueItem[] {
      if (!enabled || !roomId || roomId !== activeRoomId) return [];
      const me = myPubkey.toLowerCase();
      const added: WalkieQueueItem[] = [];

      for (const m of messages) {
        if (!m.id || seenMsgIds.has(m.id)) continue;
        seenMsgIds.add(m.id);

        if (!m.sender || m.sender.toLowerCase() === me) continue;
        if (shouldSkipSender?.(m.sender)) continue;

        const { items, caption } = parseChatMedia(m.text || "");
        for (const item of items) {
          if (item.kind !== "voice") continue;
          const h = item.hash.toLowerCase();
          if (
            playedHashes.has(h) ||
            currentHash === h ||
            queue.some((q) => q.hash === h)
          ) {
            continue;
          }
          const title = formatTitle
            ? formatTitle(m.sender, caption)
            : (caption.split("\n").find((l) => l.trim())?.trim().slice(0, 80) || "Walkie-Talkie");
          const entry: WalkieQueueItem = {
            msgId: m.id,
            hash: h,
            keyHex: item.keyHex.toLowerCase(),
            mime: item.mime,
            ...(item.durationSec !== undefined ? { durationSec: item.durationSec } : {}),
            roomId,
            sender: m.sender,
            title,
          };
          queue.push(entry);
          added.push(entry);
        }
      }
      return added;
    },

    dequeueNext(): WalkieQueueItem | null {
      const next = queue.shift() ?? null;
      if (next) {
        currentHash = next.hash;
        playedHashes.add(next.hash);
      }
      return next;
    },

    markFinished(hash: string) {
      if (currentHash && hash.toLowerCase() === currentHash.toLowerCase()) {
        currentHash = null;
      }
    },

    clearQueue() {
      queue = [];
      currentHash = null;
    },

    pendingCount(): number {
      return queue.length;
    },

    peekQueue(): WalkieQueueItem[] {
      return queue.slice();
    },
  };
}

/** Given DOM-ordered voice hashes in a conversation and the clip that just ended, return the next hash to play. */
export function nextSequentialHash(orderedHashes: ReadonlyArray<string>, currentHash: string): string | null {
  if (!currentHash || !orderedHashes.length) return null;
  const target = currentHash.toLowerCase();
  const idx = orderedHashes.findIndex((h) => h.toLowerCase() === target);
  if (idx < 0 || idx + 1 >= orderedHashes.length) return null;
  return orderedHashes[idx + 1] || null;
}
