import { test } from "node:test";
import assert from "node:assert/strict";
import { nextDelay, watchdog, IDLE_PROBE_MS, PROBE_TIMEOUT_MS, resubscribeDelayMs } from "../src/reconnect.ts";

test("nextDelay: doubles from 3s and stops at 60s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 30].map(nextDelay), [3000, 6000, 12000, 24000, 48000, 60000, 60000]);
});

test("watchdog: a busy socket waits, a silent one is probed, an unanswered probe is dead", () => {
  assert.equal(watchdog(IDLE_PROBE_MS - 1, 0, 0, false), "wait");
  assert.equal(watchdog(IDLE_PROBE_MS, 0, 0, false), "probe");
  assert.equal(watchdog(1, 0, 0, true), "probe"); // tab became visible: probe now
  assert.equal(watchdog(1000 + PROBE_TIMEOUT_MS, 0, 1000, false), "wait");
  assert.equal(watchdog(1001 + PROBE_TIMEOUT_MS, 0, 1000, false), "dead");
  assert.equal(watchdog(1001 + PROBE_TIMEOUT_MS, 1500, 1000, false), "answered"); // any message after the probe proves life
});

test("resubscribeDelayMs: paces interactive contracts first (4-wide / 80ms) then background (3-wide / 150ms)", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => resubscribeDelayMs(i, 6)), [0, 0, 0, 0, 80, 80]);
  // interactiveTail = Math.ceil(6 / 4) * 80 = 160
  assert.deepEqual([6, 7, 8, 9, 10, 11, 12].map((i) => resubscribeDelayMs(i, 6)), [160, 160, 160, 310, 310, 310, 460]);
  // zero interactive contracts starts background at 0
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => resubscribeDelayMs(i, 0)), [0, 0, 0, 150, 150]);
  // negative inputs clamp cleanly
  assert.equal(resubscribeDelayMs(-2, -3), 0);
});
