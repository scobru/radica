// Shared Walkie-Talkie live voice auto-play & Push-to-Talk (PTT) recording controller
// used by both Classic Chat (main.ts) and Messenger Chat (messengerChat.ts).
import {
  canRecordVoice,
  formatMediaDuration,
  playChatVoiceByHash,
  primeChatAudio,
  startVoiceRecording,
  type PreparedChatMedia,
  type VoiceRecorderSession,
} from "./chatMedia.ts";
import { playWalkieChirp } from "./sound.ts";
import type { ChatMessage } from "./types.ts";
import {
  createWalkieQueue,
  MIN_PTT_SEC,
  nextSequentialHash,
  PTT_HOLD_THRESHOLD_MS,
  readWalkieEnabled,
  STANDARD_VOICE_MAX_SEC,
  WALKIE_PTT_MAX_SEC,
  writeWalkieEnabled,
  type WalkieStore,
} from "./walkieTalkie.ts";

export interface ChatVoiceElements {
  walkieBtn: HTMLElement | null;
  walkieBar: HTMLElement | null;
  walkieText: HTMLElement | null;
  walkieResumeBtn: HTMLElement | null;
  walkieOffBtn: HTMLElement | null;
  pttBtn: HTMLElement | null;
  pttBar: HTMLElement | null;
  pttTimer: HTMLElement | null;
  pttHint: HTMLElement | null;
  pttSendBtn: HTMLElement | null;
  pttCancelBtn: HTMLElement | null;
  pttMeterBars: HTMLElement[];
}

export interface ChatVoiceControllerDeps {
  store: WalkieStore;
  elements: ChatVoiceElements;
  isVisible: () => boolean;
  hasConversation: () => boolean;
  isComposerDisabled: () => boolean;
  canStartPtt?: () => boolean;
  openRoomId: () => string;
  getShownMessages: () => ChatMessage[];
  getDraftText: () => string;
  focusComposer: () => void;
  getMessagesContainer: () => HTMLElement;
  onStagePrepared: (media: PreparedChatMedia) => void;
  onSendPrepared: (media: PreparedChatMedia) => Promise<void>;
  onFallbackAudioPicker: () => void;
  showToast: (msg: string, type?: "info" | "warning" | "error") => void;
}

export function formatWalkieStatusText(opts: { needsGesture: boolean; pendingCount: number }): string {
  if (opts.needsGesture) return "Browser blocked autoplay · Tap to play incoming voice";
  if (opts.pendingCount > 0) {
    return `Walkie-Talkie live · ${opts.pendingCount} voice message${opts.pendingCount > 1 ? "s" : ""} queued`;
  }
  return "Walkie-Talkie live · Auto-playing incoming voice";
}

export interface ChatVoiceController {
  isEnabled(): boolean;
  isRecordingVoice(): boolean;
  syncWalkieUi(): void;
  drainWalkieQueue(): Promise<void>;
  resetRoomWalkie(roomId: string, messages: ChatMessage[]): void;
  ingestRoomMessages(
    roomId: string,
    messages: ChatMessage[],
    myPubkey: string,
    isBlocked: (pk: string) => boolean,
    labelOf: (sender: string, caption: string) => string,
  ): void;
  toggleWalkie(): void;
  turnOffWalkie(): void;
  resumeBlockedWalkie(): Promise<void>;
  onVoiceEnded(endedHash: string): void;
  startPtt(handsFree: boolean, pointerId: number | null): Promise<void>;
  finishPttSend(): Promise<void>;
  cancelVoiceRec(): void;
  bindEvents(): void;
}

export function createChatVoiceController(deps: ChatVoiceControllerDeps): ChatVoiceController {
  const { elements } = deps;
  const walkieQueue = createWalkieQueue(readWalkieEnabled(deps.store));
  let walkieNeedsGesture = false;
  let blockedResumeHash: string | null = null;
  let walkieDraining = false;

  let activeVoiceRec: VoiceRecorderSession | null = null;
  let pttStarting = false;
  let pttPointerId: number | null = null;
  let pttStartedAt = 0;
  let pttElapsedSec = 0;
  let pttReleasedEarly = false;
  let pttHandsFree = false;
  let pttFinishing = false;

  const syncWalkieUi = () => {
    const hasConv = deps.hasConversation();
    const on = walkieQueue.enabled;
    if (elements.walkieBtn) {
      elements.walkieBtn.classList.toggle("active", on);
      elements.walkieBtn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (elements.walkieBar) elements.walkieBar.hidden = !on || !hasConv;
    if (elements.walkieResumeBtn) elements.walkieResumeBtn.hidden = !walkieNeedsGesture || !blockedResumeHash;
    if (elements.walkieText) {
      elements.walkieText.textContent = formatWalkieStatusText({
        needsGesture: walkieNeedsGesture,
        pendingCount: walkieQueue.pendingCount(),
      });
    }
  };

  const drainWalkieQueue = async () => {
    if (!deps.isVisible() || !walkieQueue.enabled || walkieDraining || walkieQueue.currentHash) return;
    walkieDraining = true;
    try {
      const container = deps.getMessagesContainer();
      while (walkieQueue.enabled && deps.isVisible() && !walkieQueue.currentHash) {
        const next = walkieQueue.dequeueNext();
        if (!next) break;
        const res = await playChatVoiceByHash(next.hash, container);
        if (res === "started") {
          walkieNeedsGesture = false;
          blockedResumeHash = null;
          playWalkieChirp("start");
          syncWalkieUi();
          return;
        }
        if (res === "blocked") {
          walkieNeedsGesture = true;
          blockedResumeHash = next.hash;
          walkieQueue.markFinished(next.hash);
          syncWalkieUi();
          return;
        }
        walkieQueue.markFinished(next.hash);
      }
      syncWalkieUi();
    } finally {
      walkieDraining = false;
    }
  };

  const resetPttUi = () => {
    if (elements.pttBar) elements.pttBar.hidden = true;
    elements.pttBtn?.classList.remove("recording");
    if (elements.pttSendBtn) elements.pttSendBtn.hidden = true;
    if (elements.pttTimer) elements.pttTimer.textContent = "0:00";
    if (elements.pttHint) elements.pttHint.textContent = "Release to send";
    for (const bar of elements.pttMeterBars) bar.style.height = "25%";
    pttPointerId = null;
    pttStartedAt = 0;
    pttElapsedSec = 0;
    pttReleasedEarly = false;
    pttHandsFree = false;
  };

  const cancelVoiceRec = () => {
    const rec = activeVoiceRec;
    activeVoiceRec = null;
    pttStarting = false;
    try {
      rec?.cancel();
    } catch {}
    resetPttUi();
  };

  const finishPttSend = async () => {
    if (!activeVoiceRec || pttFinishing) return;
    pttFinishing = true;
    const rec = activeVoiceRec;
    activeVoiceRec = null;
    const elapsed = pttElapsedSec;
    try {
      const prep = await rec.stop();
      resetPttUi();
      if (!prep || (prep.durationSec ?? elapsed) < MIN_PTT_SEC) {
        deps.showToast("Hold longer to record a voice note", "info");
        return;
      }
      playWalkieChirp("end");
      if (deps.getDraftText().trim()) {
        deps.onStagePrepared(prep);
        deps.focusComposer();
      } else {
        await deps.onSendPrepared(prep);
      }
    } catch (err: any) {
      resetPttUi();
      deps.showToast(err?.message || String(err), "error");
    } finally {
      pttFinishing = false;
    }
  };

  const startPtt = async (handsFree: boolean, pointerId: number | null) => {
    if (
      activeVoiceRec ||
      pttStarting ||
      deps.isComposerDisabled() ||
      !deps.hasConversation() ||
      (deps.canStartPtt && !deps.canStartPtt())
    ) {
      return;
    }
    primeChatAudio();
    pttStarting = true;
    pttHandsFree = handsFree;
    pttPointerId = pointerId;
    pttStartedAt = Date.now();
    pttElapsedSec = 0;
    pttReleasedEarly = false;
    if (elements.pttBar) elements.pttBar.hidden = false;
    elements.pttBtn?.classList.add("recording");
    if (elements.pttSendBtn) elements.pttSendBtn.hidden = !handsFree;
    if (elements.pttHint) elements.pttHint.textContent = handsFree ? "Recording · tap Send" : "Release to send";
    try {
      const session = await startVoiceRecording({
        maxSec: handsFree ? STANDARD_VOICE_MAX_SEC : WALKIE_PTT_MAX_SEC,
        onTick: (sec, level, _bytes, maxSec) => {
          pttElapsedSec = sec;
          if (elements.pttTimer) elements.pttTimer.textContent = `${formatMediaDuration(sec)} / ${formatMediaDuration(maxSec)}`;
          const base = Math.max(0.15, Math.min(1, level / 15));
          elements.pttMeterBars.forEach((b, idx) => {
            const w = 0.55 + 0.45 * Math.sin(sec * 12 + idx * 1.1);
            b.style.height = `${Math.round(Math.max(18, Math.min(100, base * w * 100)))}%`;
          });
        },
        onMaxReached: () => {
          void finishPttSend();
        },
      });
      pttStarting = false;
      activeVoiceRec = session;
      playWalkieChirp("start");
      if (pttReleasedEarly) {
        if (Date.now() - pttStartedAt < PTT_HOLD_THRESHOLD_MS) {
          pttHandsFree = true;
          if (elements.pttSendBtn) elements.pttSendBtn.hidden = false;
          if (elements.pttHint) elements.pttHint.textContent = "Recording · tap Send";
        } else {
          void finishPttSend();
        }
      }
    } catch (err: any) {
      pttStarting = false;
      resetPttUi();
      if (err?.code === "FALLBACK_CAPTURE") {
        deps.showToast("Microphone blocked in sandbox — pick an audio file instead", "warning");
        deps.onFallbackAudioPicker();
      } else {
        deps.showToast(err?.message || "Could not start microphone", "error");
      }
    }
  };

  const toggleWalkie = () => {
    const next = !walkieQueue.enabled;
    if (next) {
      primeChatAudio();
      playWalkieChirp("start");
    } else {
      playWalkieChirp("end");
    }
    walkieQueue.setEnabled(next);
    writeWalkieEnabled(deps.store, next);
    walkieNeedsGesture = false;
    blockedResumeHash = null;
    if (next) {
      walkieQueue.seedRoom(deps.openRoomId() || "", deps.getShownMessages());
    }
    syncWalkieUi();
    deps.showToast(next ? "Walkie-Talkie ON: incoming voice notes will auto-play" : "Walkie-Talkie OFF", "info");
  };

  const turnOffWalkie = () => {
    walkieQueue.setEnabled(false);
    writeWalkieEnabled(deps.store, false);
    walkieNeedsGesture = false;
    blockedResumeHash = null;
    playWalkieChirp("end");
    syncWalkieUi();
  };

  const resumeBlockedWalkie = async () => {
    primeChatAudio();
    const target = blockedResumeHash;
    walkieNeedsGesture = false;
    blockedResumeHash = null;
    if (target) {
      const res = await playChatVoiceByHash(target, deps.getMessagesContainer());
      if (res === "started") {
        playWalkieChirp("start");
        syncWalkieUi();
        return;
      }
    }
    void drainWalkieQueue();
  };

  const onVoiceEnded = (endedHash: string) => {
    walkieQueue.markFinished(endedHash);
    if (!deps.isVisible()) {
      syncWalkieUi();
      return;
    }
    if (walkieQueue.enabled && walkieQueue.pendingCount() > 0) {
      void drainWalkieQueue();
      return;
    }
    const container = deps.getMessagesContainer();
    const hashes = Array.from(
      container.querySelectorAll<HTMLElement>('.cm-audio-card[data-cm-kind="voice"][data-cm-hash]'),
    ).map((el) => el.dataset.cmHash || "");
    const nextHash = nextSequentialHash(hashes, endedHash);
    if (nextHash) {
      void playChatVoiceByHash(nextHash, container).then((res) => {
        if (res === "started" && walkieQueue.enabled) playWalkieChirp("start");
        syncWalkieUi();
      });
    } else {
      syncWalkieUi();
    }
  };

  return {
    isEnabled: () => walkieQueue.enabled,
    isRecordingVoice: () => Boolean(activeVoiceRec || pttStarting),
    syncWalkieUi,
    drainWalkieQueue,
    resetRoomWalkie(roomId: string, messages: ChatMessage[]) {
      cancelVoiceRec();
      walkieNeedsGesture = false;
      blockedResumeHash = null;
      walkieQueue.seedRoom(roomId, messages);
      syncWalkieUi();
    },
    ingestRoomMessages(roomId, messages, myPubkey, isBlocked, labelOf) {
      if (!walkieQueue.enabled) return;
      walkieQueue.ingestMessages(roomId, messages, myPubkey, isBlocked, labelOf);
      syncWalkieUi();
      void drainWalkieQueue();
    },
    toggleWalkie,
    turnOffWalkie,
    resumeBlockedWalkie,
    onVoiceEnded,
    startPtt,
    finishPttSend,
    cancelVoiceRec,
    bindEvents() {
      elements.walkieBtn?.addEventListener("click", () => toggleWalkie());
      elements.walkieOffBtn?.addEventListener("click", () => turnOffWalkie());
      elements.walkieResumeBtn?.addEventListener("click", () => void resumeBlockedWalkie());

      elements.pttBtn?.addEventListener("pointerdown", (e) => {
        if (!canRecordVoice()) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        if (activeVoiceRec && pttHandsFree) {
          void finishPttSend();
          return;
        }
        void startPtt(false, e.pointerId);
      });

      if (typeof window !== "undefined") {
        window.addEventListener("pointerup", (e) => {
          if (pttPointerId === null || e.pointerId !== pttPointerId) return;
          pttPointerId = null;
          if (pttStarting) {
            pttReleasedEarly = true;
            return;
          }
          if (!activeVoiceRec || pttHandsFree) return;
          if (Date.now() - pttStartedAt < PTT_HOLD_THRESHOLD_MS) {
            pttHandsFree = true;
            if (elements.pttSendBtn) elements.pttSendBtn.hidden = false;
            if (elements.pttHint) elements.pttHint.textContent = "Recording · tap Send";
          } else {
            void finishPttSend();
          }
        });

        window.addEventListener("pointercancel", (e) => {
          if (pttPointerId === null || e.pointerId !== pttPointerId) return;
          pttPointerId = null;
          if (!pttHandsFree) cancelVoiceRec();
        });
      }

      elements.pttCancelBtn?.addEventListener("click", () => cancelVoiceRec());
      elements.pttSendBtn?.addEventListener("click", () => void finishPttSend());
    },
  };
}
