// Safe Storage abstraction for Freenet dApps.
//
// In Freenet's web container (shell.html), the webapp is served in a sandboxed iframe
// that lacks the 'allow-same-origin' flag. In this environment:
// - Accessing `window.localStorage` throws a SecurityError:
//   "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag."
// - Accessing `window.sessionStorage` also throws.
//
// SafeStorage provides a transparent, non-throwing storage interface that:
// 1. Attempts `window.localStorage` (when running outside the sandbox, e.g. Vite dev or Electron).
// 2. Uses `window.name` to survive in-frame navigations in sandboxed contexts.
// 3. Syncs essential auth/profile keys into the URL hash fragment (#auth_state=...). The hash is pushed to the
//    PARENT shell page through `{__freenet_shell__: true, type: "hash", hash}`: a browser refresh reloads the shell,
//    which forwards its own hash to the iframe. (history.replaceState inside the iframe alone is NOT enough.)
// 4. Maintains an in-memory Map fallback that never throws under any condition.

const utf8Enc = new TextEncoder();

// Helper to encode a state object to a compact, URL-safe base64 string
function encodeBase64State(obj: Record<string, string>): string {
  try {
    const json = JSON.stringify(obj);
    if (typeof window !== "undefined" && typeof window.btoa === "function") {
      const bytes = utf8Enc.encode(json);
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
      }
      return window.btoa(bin);
    }
    const globalBuffer = (globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer;
    if (globalBuffer) {
      return globalBuffer.from(json, "utf8").toString("base64");
    }
    return encodeURIComponent(json);
  } catch {
    return "";
  }
}

// Helper to decode state object from base64 supporting standard UTF-8, legacy, and raw formats
function decodeBase64State(rawB64: string): Record<string, string> | null {
  if (!rawB64) return null;
  // 1. Try standard UTF-8 Base64 decoding
  try {
    if (typeof window !== "undefined" && typeof window.atob === "function") {
      const binStr = window.atob(rawB64);
      const utf8Str = decodeURIComponent(
        Array.prototype.map
          .call(binStr, (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      const parsed = JSON.parse(utf8Str);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {}

  // 2. Try Node Buffer decoding
  try {
    const globalBuffer = (globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer;
    if (globalBuffer) {
      const json = globalBuffer.from(rawB64, "base64").toString("utf8");
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {}

  // 3. Try legacy decodeURIComponent(atob(rawB64))
  try {
    if (typeof window !== "undefined" && typeof window.atob === "function") {
      const legacy = decodeURIComponent(window.atob(rawB64));
      const parsed = JSON.parse(legacy);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {}

  // 4. Try raw atob
  try {
    if (typeof window !== "undefined" && typeof window.atob === "function") {
      const raw = window.atob(rawB64);
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {}

  return null;
}

class SafeStorage {
  private mem = new Map<string, string>();
  private localStorageAvailable: boolean | null = null;
  private windowNamePrefix = "__radica_store__:";
  private hashPrefix = "auth_state=";
  // Strictly capped at 7500 chars because Freenet's parent shell truncates at 8192 (location.hash.slice(0, 8192)).
  private static readonly MAX_HASH_LENGTH = 7500;

  constructor() {
    this.hydrateFromWindowName();
    this.hydrateFromHash();
    // a write waits up to SYNC_DELAY_MS to be persisted: do it now when the page goes away or hides
    globalThis.addEventListener?.("pagehide", () => this.flush());
    globalThis.document?.addEventListener("visibilitychange", () => document.hidden && this.flush());
  }

  // Persisting serializes the whole store into window.name (every cached feed: megabytes) and rebuilds the hash.
  // Done on each write it froze the page for seconds during a sync; now once per burst of writes.
  private static readonly SYNC_DELAY_MS = 1000;
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private scheduleSync(): void {
    if (this.syncTimer !== undefined) return;
    this.syncTimer = setTimeout(() => this.flush(), SafeStorage.SYNC_DELAY_MS);
  }

  /** Persist pending writes now. */
  public flush(): void {
    clearTimeout(this.syncTimer);
    this.syncTimer = undefined;
    this.syncPersistence();
  }

  private isLocalStorageAvailable(): boolean {
    if (this.localStorageAvailable !== null) return this.localStorageAvailable;
    try {
      if (typeof window === "undefined") {
        this.localStorageAvailable = false;
        return false;
      }
      const testKey = "__radica_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      this.localStorageAvailable = true;
      return true;
    } catch {
      this.localStorageAvailable = false;
      return false;
    }
  }

  private hydrateFromWindowName(): void {
    try {
      if (typeof window !== "undefined" && typeof window.name === "string" && window.name.startsWith(this.windowNamePrefix)) {
        const json = window.name.slice(this.windowNamePrefix.length);
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "string") {
              this.mem.set(k, v);
            }
          }
        }
      }
    } catch {
      // Ignore if window.name is invalid JSON
    }
  }

  public hydrateFromHashString(hashString: string): void {
    try {
      const hash = hashString.replace(/^#/, "");
      const parts = hash.split("&");
      for (const part of parts) {
        if (part.startsWith(this.hashPrefix)) {
          const rawB64 = part.slice(this.hashPrefix.length);
          const parsed = decodeBase64State(rawB64);
          if (parsed && typeof parsed === "object") {
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === "string") {
                this.mem.set(k, v);
              }
            }
          }
        }
      }
    } catch {
      // Ignore hash parsing errors
    }
  }

  private hydrateFromHash(): void {
    try {
      if (typeof window !== "undefined" && window.location.hash) {
        this.hydrateFromHashString(window.location.hash);
      }
    } catch {
      // Ignore hash parsing errors
    }
  }

  public computeBudgetedState(otherParts: string[] = []): { authObj: Record<string, string>; hash: string } {
    // The shell cuts the hash at 8192 chars and a cut hash is unreadable: everything, identity included, would be lost.
    // So the identity keys always go in, and the rest only while it fits (the private rooms also live in the node's delegate).
    const criticalPrefixes = ["radica_session", "radica_app_key", "radica_read_keys", "radica_ed25519_seed", "radica_signin_pending"];
    const softPrefixes = [
      "radica_profile_",
      "freenet_chat_peers_",
      "freenet_private_rooms",
      "radica_hidden_users",
      "radica_pinned_chats_",
      "radica_verified_chats_",
      "river_key_",
      "river_join_",
      "freenet_room_key_",
      "radica_fmail_store_",
      "radica_mail_alias_",
      "radica_mail_contacts_",
      "radica_mail_welcomed_",
    ];
    // Larger data: budgeted strictly up to MAX_HASH_LENGTH (7500 chars)
    const optionalPrefixes = ["freenet_feed_", "freenet_chat_"];

    const build = (obj: Record<string, string>): string => {
      const parts = [...otherParts];
      if (Object.keys(obj).length > 0) {
        const encoded = encodeBase64State(obj);
        if (encoded) {
          parts.push(this.hashPrefix + encoded);
        }
      }
      return parts.length > 0 ? "#" + parts.join("&") : "";
    };

    const authObj: Record<string, string> = {};
    for (const [k, v] of this.mem.entries()) {
      if (criticalPrefixes.some((p) => k.startsWith(p))) authObj[k] = v;
    }

    // Exact UTF-8 JSON byte cap matching Base64 <= MAX_HASH_LENGTH (avoids O(N) full-object stringify+btoa per check)
    const otherLen = otherParts.length > 0 ? otherParts.join("&").length + 1 : 0;
    const maxB64 = SafeStorage.MAX_HASH_LENGTH - (1 + otherLen + this.hashPrefix.length);
    const maxJsonBytes = maxB64 >= 4 ? Math.floor(maxB64 / 4) * 3 : 0;
    let curBytes = utf8Enc.encode(JSON.stringify(authObj)).length;
    let hasKeys = Object.keys(authObj).length > 0;

    const fits = (k: string, v: string): boolean => {
      if (curBytes + k.length + v.length + (hasKeys ? 6 : 5) > maxJsonBytes) return false;
      const entryBytes = (hasKeys ? 1 : 0) + utf8Enc.encode(JSON.stringify(k)).length + 1 + utf8Enc.encode(JSON.stringify(v)).length;
      return curBytes + entryBytes <= maxJsonBytes;
    };
    const setAuth = (k: string, v: string): void => {
      const entryBytes = (hasKeys ? 1 : 0) + utf8Enc.encode(JSON.stringify(k)).length + 1 + utf8Enc.encode(JSON.stringify(v)).length;
      authObj[k] = v;
      curBytes += entryBytes;
      hasKeys = true;
    };

    for (const prefix of softPrefixes) {
      for (const [k, v] of this.mem.entries()) {
        if (!k.startsWith(prefix)) continue;
        if (fits(k, v)) {
          setAuth(k, v);
        } else if (k === "freenet_private_rooms" && fits(k, "[]")) {
          // a room list that is too long: keep the newest rooms that fit
          try {
            const rooms = (JSON.parse(v) as { created_at?: number }[]).sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
            let low = 1, high = rooms.length, best = 0;
            while (low <= high) {
              const mid = (low + high) >> 1;
              if (fits(k, JSON.stringify(rooms.slice(0, mid)))) {
                best = mid;
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }
            if (best > 0) setAuth(k, JSON.stringify(rooms.slice(0, best)));
          } catch {
            // unreadable list: leave it out
          }
        }
      }
    }

    let myPersona = "";
    try {
      if (authObj["radica_session"]) myPersona = JSON.parse(authObj["radica_session"])?.persona ?? "";
    } catch {}
    const optionalEntries = [...this.mem.entries()].filter(([k]) => optionalPrefixes.some((p) => k.startsWith(p)));
    optionalEntries.sort(([ka], [kb]) => {
      const prio = (k: string) =>
        myPersona && k === `freenet_feed_${myPersona}` ? 0 : k.startsWith("freenet_feed_") && authObj[`radica_profile_${k.slice(13)}`] ? 1 : 2;
      return prio(ka) - prio(kb);
    });

    for (const [k, v] of optionalEntries) {
      if (curBytes + 12 > maxJsonBytes) break;
      if (fits(k, v)) {
        setAuth(k, v);
      } else if (k.startsWith("freenet_feed_") && fits(k, "{}")) {
        // Gracefully trim feed: omit duplicate profile, keep recent posts, prioritizing media on newest Moment(s)
        try {
          const feed = JSON.parse(v);
          if (feed && feed.posts) {
            // Omit redundant feed.profile if radica_profile_<owner> is already stored in authObj
            const feedToSave: Record<string, any> = { ...feed };
            if (feed.owner && authObj[`radica_profile_${feed.owner}`]) {
              delete feedToSave.profile;
            }

            const postList = Object.values(feed.posts).sort(
              (a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)
            ) as any[];

            // First check if feedToSave fits completely with all posts and all media!
            const fullCandidate = JSON.stringify(feedToSave);
            if (fits(k, fullCandidate)) {
              setAuth(k, fullCandidate);
            } else {
              // Smart fit: keep recent posts, prioritizing media on the most recent post(s)
              let currentPosts = postList.slice(0, 12).map((p) => ({ ...p }));

              const fitsPosts = (posts: any[]): boolean => {
                const postsMap = Object.fromEntries(posts.map((p) => [p.id, p]));
                return fits(k, JSON.stringify({ ...feedToSave, posts: postsMap }));
              };

              if (!fitsPosts(currentPosts)) {
                // Pass 1: Strip media_uri from older posts first (from index currentPosts.length - 1 down to 1),
                // keeping the newest post's media intact!
                for (let i = currentPosts.length - 1; i >= 1; i--) {
                  if (currentPosts[i].media_uri) {
                    currentPosts[i].media_uri = undefined;
                    if (fitsPosts(currentPosts)) break;
                  }
                }
              }

              // Pass 2: If still too large, drop older posts from the end, while preserving currentPosts[0] with media!
              while (currentPosts.length > 1 && !fitsPosts(currentPosts)) {
                currentPosts.pop();
              }

              // Pass 3: If even currentPosts[0] alone with media exceeds budget, strip media as last resort
              if (currentPosts.length === 1 && !fitsPosts(currentPosts)) {
                currentPosts[0].media_uri = undefined;
              }

              if (fitsPosts(currentPosts)) {
                const postsMap = Object.fromEntries(currentPosts.map((p) => [p.id, p]));
                setAuth(k, JSON.stringify({ ...feedToSave, posts: postsMap }));
              } else if (feedToSave.profile) {
                const emptyPosts = JSON.stringify({ ...feedToSave, posts: {} });
                if (fits(k, emptyPosts)) setAuth(k, emptyPosts);
              }
            }
          }
        } catch {}
      }
    }

    return { authObj, hash: build(authObj) };
  }

  private syncPersistence(): void {
    try {
      if (typeof window === "undefined") return;

      // Only sandboxed contexts without localStorage need window.name + URL hash persistence.
      if (!this.isLocalStorageAvailable()) {
        // 1. Sync essential & moderate keys to window.name (skip multi-MB network caches so serialization stays <1ms)
        try {
          const allObj: Record<string, string> = {};
          let bytes = 0;
          const MAX_WIN_NAME = 512 * 1024;
          for (const [k, v] of this.mem.entries()) {
            if (k.startsWith("freenet_log_") || k.startsWith("river_state_")) continue;
            if (v.length > 65536 || bytes + k.length + v.length > MAX_WIN_NAME) continue;
            allObj[k] = v;
            bytes += k.length + v.length;
          }
          window.name = this.windowNamePrefix + JSON.stringify(allObj);
        } catch (err) {
          console.warn("[SafeStorage] Could not sync state to window.name:", err);
        }

        // 2. Sync essential and budgeted keys to the URL hash
        const currentHash = window.location.hash.replace(/^#/, "");
        const otherParts = currentHash.split("&").filter((p) => p && !p.startsWith(this.hashPrefix));

        const { hash: newHash } = this.computeBudgetedState(otherParts);

        // Tell the parent shell: it is the page that gets reloaded on F5 and it forwards its hash to us.
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ __freenet_shell__: true, type: "hash", hash: newHash || "#" }, "*");
          }
        } catch {}
        // Keep the iframe's own URL in sync too (may be unsupported in opaque origins), preserving any active Back step in history.state.
        try {
          window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + newHash);
        } catch {}
      }
    } catch {
      // Ignore persistence sync constraints
    }
  }

  /** Called after a key changes (durable.ts copies durable keys to the node). */
  public onWrite?: (key: string) => void;

  /** Every key the page holds. */
  public keys(): string[] {
    const all = new Set(this.mem.keys());
    if (this.isLocalStorageAvailable()) {
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k !== null) all.add(k);
        }
      } catch {}
    }
    return [...all];
  }

  public getItem(key: string): string | null {
    const memVal = this.mem.get(key);
    if (memVal !== undefined) return memVal;
    if (this.isLocalStorageAvailable()) {
      try {
        const val = window.localStorage.getItem(key);
        if (val !== null) {
          this.mem.set(key, val);
          return val;
        }
      } catch {}
    }
    return null;
  }

  public setItem(key: string, value: string): void {
    if (this.getItem(key) === value) return;
    this.mem.set(key, value);
    this.scheduleSync();

    if (this.isLocalStorageAvailable()) {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
    }
    this.onWrite?.(key);
  }

  public removeItem(key: string): void {
    if (this.getItem(key) === null) return;
    this.mem.delete(key);
    this.scheduleSync();

    if (this.isLocalStorageAvailable()) {
      try {
        window.localStorage.removeItem(key);
      } catch {}
    }
    this.onWrite?.(key);
  }

  public clear(): void {
    this.mem.clear();
    this.scheduleSync();

    if (this.isLocalStorageAvailable()) {
      try {
        window.localStorage.clear();
      } catch {}
    }
  }
}

/** Viso's `#sk=<hex>` (sign-in with key=v1), taken out of the address before anything rewrites or forwards the hash:
 *  it is a secret, and the hash is pushed to the shell page (its URL, its history). */
let handedKey: string | null = null;
try {
  const m = typeof window !== "undefined" ? /(^#|&)sk=([0-9a-f]{64})/.exec(window.location.hash) : null;
  if (m) {
    handedKey = m[2];
    const rest = window.location.hash.replace(m[0], m[1]).replace(/^#&/, "#").replace(/&$/, "");
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + (rest === "#" ? "" : rest));
  }
} catch {}
/** The key Viso handed over, once. */
export function takeHandedKey(): string | null {
  const k = handedKey;
  handedKey = null;
  return k;
}

export const safeStorage = new SafeStorage();
