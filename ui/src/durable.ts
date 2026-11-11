// Durable keys (see CONTEXT.md): page-storage keys that must outlive a browser refresh in Freenet's sandboxed shell,
// where only the URL hash survives one. Every write to a durable key is copied to the node's delegate, all of them in
// one package per persona; at sign-in the package fills in what the page lost. The page wins when it already holds a key.

import { safeStorage } from "./storage.ts";

/** Prefixes of the durable keys. Add a feature's prefix here and its data survives a refresh: nothing else to write. */
export const DURABLE_PREFIXES = [
  "radica_secret_sessions", // Secret Chat keys: without them my own sent messages turn unreadable
  "radica_secret_active_ttl_", // Secret Chat timers
  "radica_secret_peers_",
  "radica_secret_removed_", // when I removed a Secret Chat from the list: old inbox entries must not bring it back
  "radica_pinned_chats_",
  "radica_verified_chats_",
  "radica_hidden_users",
  "radica_trusted_blocklists",
  "radica_supporter_receipt_",
  "radica_saved_posts_",
  "radica_ghostkey_", // my GhostKey proof: its perks hold here even before the ghostkeys log arrives
  "radica_welcomed_", // the welcome tour, seen or skipped: it must not come back on every visit
  "freenet_notifs_dismissed_", // Activity items I opened: the inbox log would bring them back
  "radica_fmail_store_", // Radica Mail store: messages, drafts, read/unread states
  "radica_mail_alias_", // Radica Mail custom handle
  "radica_mail_contacts_", // Radica Mail address book contacts
  "radica_mail_welcomed_", // Flag to prevent duplicate welcome mail on fresh loads
];

/** The delegate refuses values over 256 KB. */
const MAX_PACKAGE = 256 * 1024;
const SAVE_DELAY_MS = 1500;

export const isDurable = (key: string) => DURABLE_PREFIXES.some((p) => key.startsWith(p));
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
