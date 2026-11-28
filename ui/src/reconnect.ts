// Reconnect and half-open-socket policy, after River's freenet/river#406 (backoff) and #382 (watchdog).
export const STABLE_MS = 15_000; // a connection must live this long before the backoff starts over
export const IDLE_PROBE_MS = 60_000; // silence on the socket before we ask the node something
export const PROBE_TIMEOUT_MS = 20_000; // an unanswered probe after this long: the socket is dead
export const WATCHDOG_TICK_MS = 10_000;

/** Wait before reconnect attempt number `fails` (0-based): 3s, 6s, ... capped at 60s. */
export const nextDelay = (fails: number): number => Math.min(3000 * 2 ** fails, 60_000);

/** What the watchdog does now. A half-open socket fires neither `close` nor `error`, so only silence tells.
 *  `probeAt` is when the outstanding probe was sent (0: none); `force` probes without waiting for silence. */
export function watchdog(now: number, lastMsg: number, probeAt: number, force: boolean): "wait" | "probe" | "answered" | "dead" {
  if (probeAt) return lastMsg >= probeAt ? "answered" : now - probeAt > PROBE_TIMEOUT_MS ? "dead" : "wait";
  return force || now - lastMsg >= IDLE_PROBE_MS ? "probe" : "wait";
}

/** Paces contract resubscribes after reconnect: interactive contracts in small 4-wide / 80ms bursts first,
 *  then background contracts in 3-wide / 150ms bursts so resume never saturates the JS main thread. */
export function resubscribeDelayMs(index: number, interactiveCount: number): number {
  const idx = Math.max(0, index);
  const ic = Math.max(0, interactiveCount);
  if (idx < ic) return Math.floor(idx / 4) * 80;
  const interactiveTail = Math.ceil(ic / 4) * 80;
  return interactiveTail + Math.floor((idx - ic) / 3) * 150;
}
