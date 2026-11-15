// Keeps a target post card centered while async images, videos, and Freenet embeds load above it.

export interface AnchorScrollOptions {
  durationMs?: number;
  tolerancePx?: number;
  windowObj?: Window & typeof globalThis;
  onStop?: () => void;
}

let activeCancel: (() => void) | null = null;

/** Cancel any active post scroll anchoring session. */
export function cancelAnchoredScroll(): void {
  if (activeCancel) {
    activeCancel();
    activeCancel = null;
  }
}

/**
 * Scroll `getTarget()` to the center of the viewport and keep it anchored while
 * async images/embeds inside `container` expand or change layout height.
 * Stops immediately on user scroll/touch/key input or after `durationMs`.
 */
export function anchorElementInViewport(
  getTarget: () => HTMLElement | null,
  container: HTMLElement | null,
  opts?: AnchorScrollOptions,
): () => void {
  cancelAnchoredScroll();

  const win = opts?.windowObj ?? (typeof window !== "undefined" ? window : undefined);
  const durationMs = opts?.durationMs ?? 3500;
  const tolerancePx = opts?.tolerancePx ?? 20;

  const initialTarget = getTarget();
  if (!initialTarget || !win) {
    opts?.onStop?.();
    return () => {};
  }

  let stopped = false;
  let rafId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const followUpTimers: ReturnType<typeof setTimeout>[] = [];
  let resizeObs: ResizeObserver | null = null;
  let mutObs: MutationObserver | null = null;

  const recenter = (force = false) => {
    if (stopped) return;
    const el = getTarget();
    if (!el || !el.isConnected) return;
    const rect = el.getBoundingClientRect();
    const vh = win.innerHeight || document.documentElement?.clientHeight || 800;
    const elCenter = rect.top + rect.height / 2;
    const delta = Math.abs(elCenter - vh / 2);
    if (force || delta > tolerancePx) {
      el.scrollIntoView({ block: "center", behavior: "auto" });
    }
  };

  const scheduleRecenter = () => {
    if (stopped || rafId !== null) return;
    if (typeof win.requestAnimationFrame === "function") {
      rafId = win.requestAnimationFrame(() => {
        rafId = null;
        recenter(false);
      });
    } else {
      recenter(false);
    }
  };

  const scrollKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
  const onUserInput = () => stop();
  const onKeyDown = (e: KeyboardEvent) => {
    if (scrollKeys.has(e.key)) stop();
  };
  const onLoadCapture = () => scheduleRecenter();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (rafId !== null && typeof win.cancelAnimationFrame === "function") {
      win.cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (timerId !== null) clearTimeout(timerId);
    for (const t of followUpTimers) clearTimeout(t);
    followUpTimers.length = 0;
    resizeObs?.disconnect();
    mutObs?.disconnect();
    container?.removeEventListener("load", onLoadCapture, true);
    win.removeEventListener("wheel", onUserInput);
    win.removeEventListener("touchstart", onUserInput);
    win.removeEventListener("pointerdown", onUserInput);
    win.removeEventListener("keydown", onKeyDown);
    if (activeCancel === stop) activeCancel = null;
    opts?.onStop?.();
  };

  activeCancel = stop;

  // Initial snap directly onto the post (never smooth-scroll against shifting heights).
  recenter(true);

  if (container) {
    container.addEventListener("load", onLoadCapture, true);
    if (typeof ResizeObserver !== "undefined") {
      resizeObs = new ResizeObserver(() => scheduleRecenter());
      resizeObs.observe(container);
      if (typeof document !== "undefined" && document.body && document.body !== container) {
        resizeObs.observe(document.body);
      }
    }
    if (typeof MutationObserver !== "undefined") {
      mutObs = new MutationObserver(() => scheduleRecenter());
      mutObs.observe(container, { childList: true, subtree: true });
    }
  }

  win.addEventListener("wheel", onUserInput, { passive: true });
  win.addEventListener("touchstart", onUserInput, { passive: true });
  win.addEventListener("pointerdown", onUserInput, { passive: true });
  win.addEventListener("keydown", onKeyDown);

  for (const delay of [80, 220, 500]) {
    followUpTimers.push(setTimeout(() => recenter(false), delay));
  }
  timerId = setTimeout(stop, durationMs);

  return stop;
}
