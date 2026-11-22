import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHandle, isValidHandle, formatHandle, foldHandles, RESERVED_HANDLES } from "../src/handles.ts";
import type { LogEntry } from "../src/logfold.ts";

const A = "11".repeat(32);
const B = "22".repeat(32);
const C = "33".repeat(32);

function entry(author: string, id: string, ts: number, body: object): LogEntry {
  return {
    author,
    id,
    ts,
    body: JSON.stringify(body),
    sig: "sig_" + id,
  };
}

test("handles: normalizeHandle handles prefixes, spaces, case, length and regex", () => {
  assert.equal(normalizeHandle("alice"), "alice");
  assert.equal(normalizeHandle("@alice"), "alice");
  assert.equal(normalizeHandle("  @Alice_99  "), "alice_99");
  assert.equal(normalizeHandle("bob_the_builder"), "bob_the_builder");

  // Invalid: too short
  assert.equal(normalizeHandle("al"), null);
  assert.equal(normalizeHandle("@a"), null);

  // Invalid: too long (> 20 chars)
  assert.equal(normalizeHandle("a".repeat(21)), null);
  assert.equal(normalizeHandle("a".repeat(20)), "a".repeat(20));

  // Invalid characters
  assert.equal(normalizeHandle("alice-bob"), null);
  assert.equal(normalizeHandle("alice.bob"), null);
  assert.equal(normalizeHandle("alice!"), null);
  assert.equal(normalizeHandle("alice space"), null);

  // Reserved handles
  assert.equal(normalizeHandle("radica"), null);
  assert.equal(normalizeHandle("@ADMIN"), null);
  assert.equal(normalizeHandle("system"), null);
  assert.equal(normalizeHandle("freenet"), null);
  assert.equal(normalizeHandle("viso"), null);
});

test("handles: isValidHandle & formatHandle helpers", () => {
  assert.equal(isValidHandle("charlie"), true);
  assert.equal(isValidHandle("@charlie"), true);
  assert.equal(isValidHandle("no"), false);
  assert.equal(isValidHandle("radica"), false);

  assert.equal(formatHandle("charlie"), "@charlie");
  assert.equal(formatHandle("@charlie"), "@charlie");
  assert.equal(formatHandle("invalid!"), "");
  assert.equal(formatHandle(null), "");
});

test("handles: first claim takes the handle, later conflicting claim is rejected", () => {
  const entries: LogEntry[] = [
    entry(A, "1", 100, { type: "handle_claim", handle: "alice" }),
    entry(B, "2", 200, { type: "handle_claim", handle: "alice" }),
  ];

  const { byHandle, byPubkey } = foldHandles(entries);
  assert.equal(byHandle.get("alice"), A);
  assert.equal(byPubkey.get(A), "alice");
  assert.equal(byPubkey.get(B), undefined);
});

test("handles: author can change handle, freeing old handle for others", () => {
  const entries: LogEntry[] = [
    entry(A, "1", 100, { type: "handle_claim", handle: "alice" }),
    entry(B, "2", 200, { type: "handle_claim", handle: "alice" }), // Rejected (A still owns it)
    entry(A, "3", 300, { type: "handle_claim", handle: "alicia" }), // A moves to alicia
    entry(B, "4", 400, { type: "handle_claim", handle: "alice" }), // B can now claim alice!
  ];

  const { byHandle, byPubkey } = foldHandles(entries);
  assert.equal(byHandle.get("alicia"), A);
  assert.equal(byPubkey.get(A), "alicia");
  assert.equal(byHandle.get("alice"), B);
  assert.equal(byPubkey.get(B), "alice");
});

test("handles: author can release handle explicitly", () => {
  const entries: LogEntry[] = [
    entry(A, "1", 100, { type: "handle_claim", handle: "crypto_queen" }),
    entry(B, "2", 200, { type: "handle_claim", handle: "crypto_queen" }), // Rejected
    entry(A, "3", 300, { type: "handle_release" }), // A releases
    entry(C, "4", 400, { type: "handle_claim", handle: "crypto_queen" }), // C claims
  ];

  const { byHandle, byPubkey } = foldHandles(entries);
  assert.equal(byHandle.get("crypto_queen"), C);
  assert.equal(byPubkey.get(A), undefined);
  assert.equal(byPubkey.get(C), "crypto_queen");
});

test("handles: deterministic tie-break when timestamps are identical", () => {
  // Same ts 100: author A ("11"...) comes before B ("22"...)
  const entries: LogEntry[] = [
    entry(B, "b", 100, { type: "handle_claim", handle: "legend" }),
    entry(A, "a", 100, { type: "handle_claim", handle: "legend" }),
  ];

  const { byHandle } = foldHandles(entries);
  assert.equal(byHandle.get("legend"), A);
});

test("handles: ignores invalid authors, malformed json or empty claims", () => {
  const entries: LogEntry[] = [
    { author: "shortkey", id: "1", ts: 10, body: `{"type":"handle_claim","handle":"valid"}`, sig: "s" },
    entry(A, "2", 20, { type: "unknown" }),
    { author: A, id: "3", ts: 30, body: "not json", sig: "s" },
    entry(A, "4", 40, { type: "handle_claim", handle: "bad!char" }),
    entry(B, "5", 50, { type: "handle_claim", handle: "cool_user" }),
  ];

  const { byHandle, byPubkey } = foldHandles(entries);
  assert.equal(byHandle.size, 1);
  assert.equal(byHandle.get("cool_user"), B);
  assert.equal(byPubkey.get(B), "cool_user");
});
