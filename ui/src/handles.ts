// Radica Handles (@handle): unique, human-readable identifiers registered in the shared Freenet "handles" log.
// Resolves to a 64-hex Ed25519 public key. First-come, first-served deterministic resolution.

import type { LogEntry } from "./logfold.ts";

export const RESERVED_HANDLES = new Set([
  "radica",
  "admin",
  "administrator",
  "root",
  "system",
  "moderator",
  "official",
  "support",
  "help",
  "security",
  "null",
  "undefined",
  "anonymous",
  "freenet",
  "viso",
]);

/**
 * Normalizes and validates a handle string.
 * Strips leading '@', trims, lowercases, and checks length (3..20) and character set (a-z, 0-9, _).
 * Returns the normalized handle without '@', or null if invalid or reserved.
 */
export function normalizeHandle(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim();
  if (s.startsWith("@")) s = s.slice(1);
  s = s.toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(s)) return null;
  if (RESERVED_HANDLES.has(s)) return null;
  return s;
}

/** Whether a handle is valid and available for claiming (syntax and reserved keywords check). */
export function isValidHandle(input: string | null | undefined): boolean {
  return normalizeHandle(input) !== null;
}

/** Formats a normalized handle with '@' prefix, or empty string if invalid. */
export function formatHandle(handle: string | null | undefined): string {
  const norm = normalizeHandle(handle);
  return norm ? `@${norm}` : "";
}

/**
 * Deterministically folds the shared "handles" log into bidirectional maps.
 * Resolution rules:
 * 1. Entries are replayed chronologically (ts ascending, deterministic tie-break on author + id).
 * 2. Earliest valid claim takes the handle (first-come, first-served).
 * 3. Conflicting claims by other authors while a handle is active are ignored.
 * 4. An author claiming a new handle releases their previous handle.
 * 5. An author publishing handle_release releases their handle.
 */
export function foldHandles(entries: LogEntry[]): {
  byHandle: Map<string, string>;
  byPubkey: Map<string, string>;
} {
  const byHandle = new Map<string, string>();
  const byPubkey = new Map<string, string>();

  const sorted = [...entries].sort((a, b) => a.ts - b.ts || (a.author + a.id < b.author + b.id ? -1 : 1));

  for (const e of sorted) {
    const author = (e.author ?? "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(author)) continue;

    let b: any;
    try {
      b = JSON.parse(e.body);
    } catch {
      continue;
    }

    if (b?.type === "handle_claim") {
      const target = typeof b.handle === "string" ? normalizeHandle(b.handle) : null;
      const currentHandle = byPubkey.get(author);

      if (!target) {
        // Empty or invalid handle: release current claim if any
        if (currentHandle) {
          byPubkey.delete(author);
          if (byHandle.get(currentHandle) === author) {
            byHandle.delete(currentHandle);
          }
        }
        continue;
      }

      // Check if handle is already held by someone else
      const existingOwner = byHandle.get(target);
      if (existingOwner && existingOwner !== author) {
        // Taken by an earlier valid claimant; ignore this claim
        continue;
      }

      // Release old handle if different
      if (currentHandle && currentHandle !== target) {
        if (byHandle.get(currentHandle) === author) {
          byHandle.delete(currentHandle);
        }
      }

      // Assign handle
      byHandle.set(target, author);
      byPubkey.set(author, target);
    } else if (b?.type === "handle_release") {
      const currentHandle = byPubkey.get(author);
      if (currentHandle) {
        byPubkey.delete(author);
        if (byHandle.get(currentHandle) === author) {
          byHandle.delete(currentHandle);
        }
      }
    }
  }

  return { byHandle, byPubkey };
}
