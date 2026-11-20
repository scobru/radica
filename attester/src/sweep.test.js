import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legacyHashes, sweep } from "./sweep.js";

test("legacyHashes reads the repo's ui/src/legacy.ts", () => {
  const ts = readFileSync(new URL("../../ui/src/legacy.ts", import.meta.url), "utf8");
  const feed = legacyHashes(ts, "feed");
  assert.ok(feed.length >= 2);
  assert.ok(!feed.includes(ts.match(/feed: "([0-9a-f]{64})"/)[1]), "CURRENT is not legacy");
  assert.ok(legacyHashes(ts, "log").length >= 1);
});

test("sweep moves what only an old generation holds, retries failures, respects the limit", async () => {
  const net = { "cur:a": "A", "old:b": "B", "old2:c": "C" }; // a already moved, b and c under old builds, d nowhere
  const puts = [];
  let failE = true;
  const get = async (id, h) => {
    if (id === "e" && failE) throw new Error("timeout");
    return net[`${h ?? "cur"}:${id}`] ?? null;
  };
  const done = new Set();
  const args = { ids: ["a", "b", "c", "d", "e"], done, legacy: ["old", "old2"], get, put: async (id, s) => puts.push([id, s]), limit: 10 };
  assert.deepEqual(await sweep(args), { moved: 2, checked: 5, failed: 1 });
  assert.deepEqual(puts, [["b", "B"], ["c", "C"]]);
  assert.deepEqual([...done], ["a", "b", "c", "d"]);
  failE = false;
  assert.deepEqual(await sweep(args), { moved: 0, checked: 1, failed: 0 });
  assert.equal((await sweep({ ...args, done: new Set(), limit: 2 })).checked, 2);
});

test("an id that keeps failing is settled after maxTries", async () => {
  const done = new Set();
  const tries = new Map();
  const args = { ids: ["x"], done, tries, maxTries: 2, legacy: [], get: async () => { throw new Error("timeout"); }, put: async () => {}, limit: 5 };
  await sweep(args);
  assert.ok(!done.has("x"));
  await sweep(args);
  assert.ok(done.has("x"));
});
