import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anchorElementInViewport, cancelAnchoredScroll } from "../src/scrollAnchor.ts";

describe("scrollAnchor: keeps linked post centered while async content expands above", () => {
  it("recenters when target drifts beyond tolerance and stops on user input", () => {
    let rectTop = 400; // center at 450 vs viewport center 400
    const scrollCalls: Array<ScrollIntoViewOptions | undefined> = [];
    const listeners = new Map<string, Set<EventListener>>();

    const targetEl = {
      isConnected: true,
      getBoundingClientRect: () => ({ top: rectTop, height: 100 } as DOMRect),
      scrollIntoView: (opts?: ScrollIntoViewOptions) => {
        scrollCalls.push(opts);
        rectTop = 350; // snap to center (top=350 + 50 = 400)
      },
    } as unknown as HTMLElement;

    let containerLoadHandler: EventListener | null = null;
    const container = {
      addEventListener: (_type: string, fn: EventListener) => {
        containerLoadHandler = fn;
      },
      removeEventListener: (_type: string, fn: EventListener) => {
        if (containerLoadHandler === fn) containerLoadHandler = null;
      },
    } as unknown as HTMLElement;

    const mockWindow = {
      innerHeight: 800,
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
      cancelAnimationFrame: () => {},
      addEventListener: (type: string, fn: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: EventListener) => {
        listeners.get(type)?.delete(fn);
      },
    } as unknown as Window & typeof globalThis;

    let stopped = false;
    const cancel = anchorElementInViewport(() => targetEl, container, {
      durationMs: 5000,
      tolerancePx: 20,
      windowObj: mockWindow,
      onStop: () => {
        stopped = true;
      },
    });

    // Initial snap occurred immediately
    assert.equal(scrollCalls.length, 1);

    // Async image above expanded, pushing target down by 140px
    rectTop = 490;
    assert.ok(containerLoadHandler, "load listener should be registered in capture phase");
    containerLoadHandler!(new Event("load"));
    assert.equal(scrollCalls.length, 2);

    // Small drift within tolerance (<= 20px) should NOT scroll again
    rectTop = 360;
    containerLoadHandler!(new Event("load"));
    assert.equal(scrollCalls.length, 2);

    // User wheel interaction stops anchoring immediately
    for (const fn of listeners.get("wheel") ?? []) {
      fn(new Event("wheel"));
    }
    assert.equal(stopped, true);
    assert.equal(containerLoadHandler, null);

    // Subsequent loads no longer scroll
    rectTop = 650;
    cancelAnchoredScroll();
    cancel();
    assert.equal(scrollCalls.length, 2);
  });

  it("handles missing target safely", () => {
    let stopped = false;
    const cancel = anchorElementInViewport(() => null, null, {
      onStop: () => {
        stopped = true;
      },
    });
    assert.equal(stopped, true);
    cancel();
  });
});
