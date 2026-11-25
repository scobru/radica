// Durable keys (see CONTEXT.md): page-storage keys that must outlive a browser refresh in Freenet's sandboxed shell,
// where only the URL hash survives one. Every write to a durable key is copied to the node's delegate, all of them in
// one package per persona; at sign-in the package fills in what the page lost. The page wins when it already holds a key.

import { safeStorage } from "./storage.ts";
import { DURABLE_PREFIXES, isDurableStorageKey } from "./storageKeys.ts";

export { DURABLE_PREFIXES };

/** The delegate refuses values over 256 KB. */
const MAX_PACKAGE = 256 * 1024;
const SAVE_DELAY_MS = 1500;

export const isDurable = isDurableStorageKey;
const packageKey = (persona: string) => `durable:${persona}`;

export interface DurableStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  keys(): string[];
  onWrite?: (key: string) => void;
}

export interface DurableNode {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export function createDurable(store: DurableStore, node: DurableNode, delayMs = SAVE_DELAY_MS) {
  let persona = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started!: () => void;
  const ready = new Promise<void>((r) => (started = r));

  const save = async () => {
    const pkg: Record<string, string> = {};
    for (const k of store.keys().filter(isDurable)) {
      const v = store.getItem(k);
      if (v !== null) pkg[k] = v;
    }
    const json = JSON.stringify(pkg);
    // shortcut: an oversized package is not saved at all; split the largest prefix into its own node entry if this logs
    if (json.length > MAX_PACKAGE) return console.warn(`[Durable] ${json.length} bytes, over the node's limit: not saved`);
    await node.put(packageKey(persona), json);
  };

  const scheduleSave = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void save().catch((e) => console.warn("[Durable] Could not save to the node", e)), delayMs);
  };

  return {
    /** At sign-in: bring back the durable keys the page lost, then copy every later write of one to the node. */
    async start(who: string): Promise<void> {
      persona = who;
      let saved: Record<string, unknown> = {};
      try {
        saved = JSON.parse((await node.get(packageKey(who))) || "{}");
      } catch {}
      for (const [k, v] of Object.entries(saved))
        if (isDurable(k) && typeof v === "string" && store.getItem(k) === null) store.setItem(k, v);
      store.onWrite = (key) => isDurable(key) && scheduleSave();
      if (store.keys().some(isDurable)) scheduleSave(); // what was written before sign-in reaches the node too
      started();
    },

    /** Resolves once start() brought back what the node kept. */
    ready,

    /** Save now instead of after the delay (tests, page hide). */
    flush: () => {
      clearTimeout(timer);
      return persona ? save() : Promise.resolve();
    },
  };
}

export const durable = createDurable(safeStorage, {
  get: (key) => import("./delegate.ts").then((m) => m.nodeGet(key), () => null),
  put: (key, value) => import("./delegate.ts").then((m) => m.nodePut(key, value), () => {}),
});

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void durable.flush());
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void durable.flush();
    });
  }
}

