// Eager profile extras (`wallets/`, `delta/`, `orto/`, `asocial/`, `freetunes/`, `freetree/`, `fh/`):
// shared pure helpers for resolving the latest owner-signed entry, backing up the current user's own entries in durable
// storage, and safely merging network refreshes with in-progress Edit Profile inputs.

import type { LogEntry } from "./logfold.ts";
import { WALLET_KINDS, type Wallets } from "./wallets.ts";

export const PROFILE_EXTRA_LOGS = ["wallets", "delta", "orto", "asocial", "freetunes", "freetree", "fh"] as const;
export type ProfileExtraKind = (typeof PROFILE_EXTRA_LOGS)[number];

export const PROFILE_EXTRAS_BACKUP_PREFIX = "radica_profile_extras_";

/** Every personal extra log name belonging to `pubkey`. */
export function profileExtraLogNames(pubkey: string): string[] {
  return PROFILE_EXTRA_LOGS.map((kind) => `${kind}/${pubkey}`);
}

/** Whether `name` is one of the 7 personal profile-extra logs (`<kind>/<pubkey>`). */
export function isProfileExtraLog(name: string): boolean {
  return PROFILE_EXTRA_LOGS.some((kind) => name.startsWith(`${kind}/`));
}

/** The newest log entry authored by `pubkey` (case-insensitive pubkey match; newest `ts`, `sig` tie-break). */
export function latestOwnLogEntry(entries: LogEntry[], pubkey: string): LogEntry | undefined {
  const owner = pubkey.toLowerCase();
  let best: LogEntry | undefined;
  for (const e of entries) {
    if (!e || typeof e.author !== "string" || e.author.toLowerCase() !== owner) continue;
    if (!best || e.ts > best.ts || (e.ts === best.ts && e.sig > best.sig)) best = e;
  }
  return best;
}

type KVStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** Persist a compact snapshot of `pubkey`'s latest signed profile-extra entries into durable page storage. */
export function backupOwnProfileExtras(
  store: Pick<KVStore, "setItem">,
  pubkey: string,
  readEntries: (logName: string) => LogEntry[]
): void {
  if (!pubkey) return;
  const out: Partial<Record<ProfileExtraKind, LogEntry>> = {};
  for (const kind of PROFILE_EXTRA_LOGS) {
    const latest = latestOwnLogEntry(readEntries(`${kind}/${pubkey}`), pubkey);
    if (latest) out[kind] = latest;
  }
  store.setItem(`${PROFILE_EXTRAS_BACKUP_PREFIX}${pubkey}`, JSON.stringify(out));
}

const HEX64_RE = /^[0-9a-f]{64}$/i;
const HEX128_RE = /^[0-9a-f]{128}$/i;

function isValidLogEntry(e: unknown): e is LogEntry {
  if (!e || typeof e !== "object") return false;
  const r = e as Record<string, unknown>;
  return (
    typeof r.author === "string" &&
    HEX64_RE.test(r.author) &&
    typeof r.id === "string" &&
    typeof r.ts === "number" &&
    Number.isFinite(r.ts) &&
    typeof r.body === "string" &&
    typeof r.sig === "string" &&
    HEX128_RE.test(r.sig)
  );
}

/** Merge backed-up own profile-extra entries from durable storage into `freenet_log_<kind>/<pubkey>`. */
export function restoreOwnProfileExtras(store: KVStore, pubkey: string): boolean {
  if (!pubkey) return false;
  const raw = store.getItem(`${PROFILE_EXTRAS_BACKUP_PREFIX}${pubkey}`);
  if (!raw) return false;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object") return false;

  const owner = pubkey.toLowerCase();
  let changed = false;
  for (const kind of PROFILE_EXTRA_LOGS) {
    const candidate = parsed[kind];
    if (!isValidLogEntry(candidate) || candidate.author.toLowerCase() !== owner) continue;

    const storageKey = `freenet_log_${kind}/${pubkey}`;
    let existing: Record<string, LogEntry> = {};
    try {
      const prev = store.getItem(storageKey);
      if (prev) existing = JSON.parse(prev) || {};
    } catch {
      existing = {};
    }
    const entryKey = `${candidate.author}:${candidate.id}`;
    const cur = existing[entryKey];
    if (!cur || candidate.ts > cur.ts || (candidate.ts === cur.ts && candidate.sig > cur.sig)) {
      existing[entryKey] = candidate;
      store.setItem(storageKey, JSON.stringify(existing));
      changed = true;
    }
  }
  return changed;
}

/** Merge freshly loaded wallet addresses into Edit Profile inputs without overwriting fields the user has edited. */
export function mergeLoadedWalletInputs(
  currentValues: Record<string, string>,
  touchedKinds: ReadonlySet<string>,
  loadedWallets: Wallets
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { kind } of WALLET_KINDS) {
    out[kind] = touchedKinds.has(kind) ? (currentValues[kind] ?? "") : (loadedWallets[kind] ?? "");
  }
  return out;
}

/** Guard Edit Profile saves so untouched empty inputs never overwrite remote values whose log has not finished loading. */
export function shouldPersistProfileField(opts: {
  dirty: boolean;
  loaded: boolean;
  nextValue: string;
  currentValue: string;
}): boolean {
  if (opts.nextValue === opts.currentValue) return false;
  return opts.dirty || opts.loaded;
}
