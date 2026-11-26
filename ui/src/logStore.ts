// Stateful log engine and raw-keyed fold memoizer for Freenet log-contracts (`freenet_log_<name>`).
// Owns signature verification on ingress, PoW grinding on append, offline/failed push retries, and delta/state sync.

import { formatLogEntryMessage, grindNonce, logMsg2, verifyAuthorSignature } from "./crypto.ts";
import { stateSlotFor, type LogEntry } from "./logfold.ts";
import { REFRESH_EVERY_MS, shouldFetch, type Change } from "./refresh.ts";
import type { UserIdentity } from "./types.ts";
import type { Cert } from "./whoiam.ts";

export interface LogStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LogNetworkAdapter {
  get<T>(id: `log:${string}`, urgent?: boolean): Promise<T | null>;
  push(id: `log:${string}`, value: unknown): Promise<void>;
  liveAge(id: `log:${string}`): number | null;
}

export interface LogStoreDeps {
  storage: LogStorageLike;
  net: LogNetworkAdapter;
  isConnected: () => boolean;
  identity: () => Pick<UserIdentity, "pubkey" | "sign" | "cert"> | null;
  onApplied: (name: string) => void;
  onChanged: (name: string) => void;
  onLoaded?: (name: string) => void;
  onPostTake?: (name: string) => void;
  /** Every local entry of `name` is on the network (a push went through, or a fetch found nothing missing). */
  onSynced?: (name: string) => void;
  grind?: (msgOf: (nonce: number) => string) => number;
  verify?: (msg: string, sig: string, author: string, cert?: Cert) => Promise<boolean>;
  now?: () => number;
  scheduleRetry?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancelRetry?: (handle: ReturnType<typeof setTimeout>) => void;
  retryDelayMs?: number;
}

const LOG_KEY_PREFIX = "freenet_log_";
const TRANSIENT_RETRY_OFFSET_MS = 5_000;

export class LogStore {
  private readonly deps: LogStoreDeps;
  private readonly grind: (msgOf: (nonce: number) => string) => number;
  private readonly verify: (msg: string, sig: string, author: string, cert?: Cert) => Promise<boolean>;
  private readonly now: () => number;
  private readonly scheduleRetry: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly cancelRetry: (handle: ReturnType<typeof setTimeout>) => void;
  private readonly retryDelayMs: number;

  private recordCache = new Map<string, { raw: string; obj: Record<string, LogEntry>; list: LogEntry[] }>();
  private foldCache = new Map<string, { raw: string | null; value: unknown }>();
  private verifiedEntries = new WeakMap<LogEntry, string>();
  private lastRefresh = new Map<string, number>();
  private unsentLogs = new Set<string>();
  private loadedLogs = new Set<string>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(deps: LogStoreDeps) {
    this.deps = deps;
    this.grind = deps.grind ?? grindNonce;
    this.verify = deps.verify ?? verifyAuthorSignature;
    this.now = deps.now ?? (() => Date.now());
    this.scheduleRetry = deps.scheduleRetry ?? ((fn, ms) => setTimeout(fn, ms));
    this.cancelRetry = deps.cancelRetry ?? ((h) => clearTimeout(h));
    this.retryDelayMs = deps.retryDelayMs ?? REFRESH_EVERY_MS;
  }

  public raw(name: string): string | null {
    return this.deps.storage.getItem(`${LOG_KEY_PREFIX}${name}`);
  }

  public record(name: string): Record<string, LogEntry> {
    try {
      const raw = this.raw(name) || "{}";
      const hit = this.recordCache.get(name);
      if (hit?.raw === raw) return hit.obj;
      const obj = JSON.parse(raw) as Record<string, LogEntry>;
      const list = Object.values(obj);
      this.recordCache.set(name, { raw, obj, list });
      return obj;
    } catch {
      return {};
    }
  }

  public entries(name: string): LogEntry[] {
    const raw = this.raw(name) || "{}";
    const hit = this.recordCache.get(name);
    if (hit?.raw === raw) return hit.list;
    this.record(name);
    return this.recordCache.get(name)?.list ?? [];
  }

  public save(name: string, entries: LogEntry[]): void {
    this.deps.storage.setItem(
      `${LOG_KEY_PREFIX}${name}`,
      JSON.stringify(Object.fromEntries(entries.map((e) => [`${e.author}:${e.id}`, e]))),
    );
  }

  /** Memoize a derived fold over `logName`, automatically recomputing only when stored raw JSON changes. */
  public memo<T>(logName: string, foldKey: string, compute: (entries: LogEntry[]) => T): T {
    const raw = this.raw(logName);
    const hit = this.foldCache.get(foldKey);
    if (hit !== undefined && hit.raw === raw) return hit.value as T;
    const value = compute(this.entries(logName));
    this.foldCache.set(foldKey, { raw, value });
    return value;
  }

  public clearCache(): void {
    this.recordCache.clear();
    this.foldCache.clear();
  }

  public hasUnsent(name: string): boolean {
    return this.unsentLogs.has(name);
  }

  public hasLoaded(name: string): boolean {
    return this.loadedLogs.has(name);
  }

  public markLoaded(name: string): void {
    this.loadedLogs.add(name);
  }

  public dispose(): void {
    for (const timer of this.retryTimers.values()) this.cancelRetry(timer);
    this.retryTimers.clear();
  }

  /** Sign `body` as a new entry of log `name`, store and apply locally, and send or queue for retry. */
  public async append(name: string, body: object, opts?: { flush?: boolean }): Promise<void> {
    const me = this.deps.identity();
    if (!me) throw new Error("No identity to sign with");
    // State entries (read marks, hidden rooms...) go under one id per subject: the log keeps only the newest.
    const id =
      stateSlotFor(body as Record<string, unknown>) ??
      this.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const e: LogEntry = { author: me.pubkey, id, ts: this.now(), body: JSON.stringify(body), sig: "", v: 2, nonce: 0 };
    // The log contract requires PoW from everyone except an owner-scoped log's owner (`<name>/<my key>`).
    if (name.split("/").pop() !== me.pubkey || !name.includes("/")) {
      e.nonce = this.grind((n) => logMsg2(name, e.author, e.id, e.ts, e.body, n));
    }
    e.sig = await me.sign(logMsg2(name, e.author, e.id, e.ts, e.body, e.nonce!));
    if (me.cert) e.cert = me.cert;
    this.save(name, [...this.entries(name), e]);
    this.deps.onApplied(name);
    if (this.deps.isConnected()) {
      if (opts?.flush) await this.push(name, [e]);
      else void this.push(name, [e]);
    } else {
      this.unsentLogs.add(name);
      this.retryUnsent(name);
    }
  }

  private async push(name: string, entries: LogEntry[]): Promise<void> {
    try {
      await this.deps.net.push(`log:${name}`, {
        entries: Object.fromEntries(entries.map((e) => [`${e.author}:${e.id}`, e])),
      });
      this.unsentLogs.delete(name);
      this.deps.onSynced?.(name);
    } catch (e) {
      this.unsentLogs.add(name);
      console.warn("[Freenet] Could not send to log", name, e);
      this.retryUnsent(name);
    }
  }

  /** Re-try sending unsent entries until the network accepts them. */
  private retryUnsent(name: string): void {
    if (this.retryTimers.has(name)) return;
    this.retryTimers.set(
      name,
      this.scheduleRetry(async () => {
        await this.refresh(name, true);
        this.retryTimers.delete(name);
        if (this.unsentLogs.has(name)) this.retryUnsent(name);
      }, this.retryDelayMs),
    );
  }

  /** Fetch a log (and subscribe to it), push missing local entries, and notify listeners on changes. */
  public async refresh(name: string, force = false, urgent = false): Promise<void> {
    if (!this.deps.isConnected()) return;
    const now = this.now();
    const last = this.lastRefresh.get(name) ?? 0;
    if (!shouldFetch({ force, sinceLast: now - last, liveAge: this.deps.net.liveAge(`log:${name}`), unsent: this.unsentLogs.has(name) })) {
      return;
    }
    this.lastRefresh.set(name, now);
    try {
      const remote = (await this.deps.net.get<{ entries: Record<string, LogEntry> }>(`log:${name}`, urgent))?.entries ?? {};
      await this.take(name, remote);
      this.loadedLogs.add(name);
      this.deps.onLoaded?.(name);
    } catch (e) {
      // Allow quick retry (~5s) after a transient fetch timeout instead of hiding logs for a full minute.
      this.lastRefresh.set(name, this.now() - REFRESH_EVERY_MS + TRANSIENT_RETRY_OFFSET_MS);
      console.warn("[Freenet] Could not fetch log", name, e);
    }
  }

  /** Apply a pushed state or delta notification from the node, falling back to `refresh` on malformed payloads. */
  public async applyChange(name: string, c: Change): Promise<void> {
    try {
      const remote = c.state
        ? (JSON.parse(c.state).entries as Record<string, LogEntry> | undefined)
        : c.delta
          ? { ...this.record(name), ...(JSON.parse(c.delta).entries as Record<string, LogEntry> | undefined) }
          : undefined;
      if (remote) {
        this.lastRefresh.set(name, this.now());
        this.loadedLogs.add(name);
        await this.take(name, remote);
        this.deps.onLoaded?.(name);
        return;
      }
    } catch (e) {
      console.warn("[Freenet] Could not apply the change of log", name, e);
    }
    return this.refresh(name, true);
  }

  /** Verify local & remote entries, merge newer state, fire `onChanged` when stored text changes, and push `missing`. */
  public async take(name: string, remote: Record<string, LogEntry>): Promise<void> {
    const entryMsg = (e: LogEntry) =>
      e.v === 2 ? logMsg2(name, e.author, e.id, e.ts, e.body, e.nonce ?? 0) : formatLogEntryMessage(name, e.author, e.id, e.ts, e.body);
    const local = this.entries(name);
    const verifiedLocal: LogEntry[] = [];
    const localByKey = new Map<string, LogEntry>();
    for (const e of local) {
      if (!e || typeof e.author !== "string" || typeof e.id !== "string" || typeof e.ts !== "number" || typeof e.body !== "string") continue;
      // Verify local entries too (cached per object+log) so unverified storage never overrides verified remote state.
      const ok = this.verifiedEntries.get(e) === name || (await this.verify(entryMsg(e), e.sig, e.author, e.cert));
      if (ok) {
        this.verifiedEntries.set(e, name);
        verifiedLocal.push(e);
        localByKey.set(`${e.author}:${e.id}`, e);
      }
    }
    const checkedRemote: Record<string, LogEntry> = {};
    for (const [k, e] of Object.entries(remote)) {
      if (!e || k !== `${e.author}:${e.id}` || typeof e.ts !== "number" || typeof e.body !== "string") continue;
      const cur = localByKey.get(k);
      if (cur && cur.sig === e.sig && cur.ts === e.ts && cur.body === e.body && cur.v === e.v && cur.nonce === e.nonce) {
        checkedRemote[k] = e;
        continue;
      }
      if (await this.verify(entryMsg(e), e.sig, e.author, e.cert)) {
        checkedRemote[k] = e;
      }
    }
    const missing = verifiedLocal.filter((e) => {
      const r = checkedRemote[`${e.author}:${e.id}`];
      return !r || e.ts > r.ts || (e.ts === r.ts && e.sig > r.sig);
    });
    const remoteCount = Object.keys(checkedRemote).length;
    if (missing.length === 0 && verifiedLocal.length === remoteCount && verifiedLocal.length === local.length) {
      this.unsentLogs.delete(name);
      this.deps.onSynced?.(name);
      return;
    }
    const before = this.raw(name);
    this.save(name, [...Object.values(checkedRemote), ...missing]);
    if (this.raw(name) !== before) {
      this.deps.onChanged(name);
    }
    if (missing.length) await this.push(name, missing);
    else {
      this.unsentLogs.delete(name);
      this.deps.onSynced?.(name);
    }
    this.deps.onPostTake?.(name);
  }
}
