import test from "node:test";
import assert from "node:assert/strict";
import { foldGreenhouse, greenhouseTokens } from "../src/greenhouse.ts";
import type { LogEntry } from "../src/logfold.ts";
import type { SupporterTier } from "../src/supporter.ts";

const DAY = 86_400_000;
const t0 = Date.now() - DAY;
let n = 0;
const entry = (author: string, ts: number, body: object): LogEntry => ({ author, id: `e${n++}`, ts, body: JSON.stringify(body), sig: "" });
const tiers: Record<string, SupporterTier> = { alice: "sprout", bob: "oak", carol: "root" };
const tierOf = (a: string) => tiers[a];

test("votes are weighted by tier, the newest vote of each supporter counts, non-supporters are ignored", () => {
  const seed = entry("alice", t0, { type: "seed", kind: "feature", title: "Dark mode", days: 7, receipt: "r" });
  const id = `alice:${seed.id}`;
  const out = foldGreenhouse(
    [
      seed,
      entry("bob", t0 + 1, { type: "vote", seed: id, v: 1 }),
      entry("carol", t0 + 2, { type: "vote", seed: id, v: 1 }),
      entry("carol", t0 + 3, { type: "vote", seed: id, v: -1 }), // changed her mind
      entry("mallory", t0 + 4, { type: "vote", seed: id, v: 1 }), // not a supporter
      entry("alice", t0 + 8 * DAY, { type: "vote", seed: id, v: 1 }), // after closing
    ],
    tierOf,
    "carol",
    "boss"
  );
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].up, out[0].down, out[0].voters, out[0].mine], [3, 2, 2, -1]);
});

test("a bug takes no downvotes, a non-supporter cannot plant, only the maintainer sets a status", () => {
  const bug = entry("bob", t0, { type: "seed", kind: "bug", title: "Crash", days: 14 });
  const id = `bob:${bug.id}`;
  const out = foldGreenhouse(
    [
      bug,
      entry("mallory", t0, { type: "seed", kind: "feature", title: "Spam" }),
      entry("alice", t0 + 1, { type: "vote", seed: id, v: -1 }),
      entry("carol", t0 + 2, { type: "status", seed: id, status: "done" }),
      entry("boss", t0 + 3, { type: "status", seed: id, status: "planned" }),
    ],
    tierOf,
    "alice",
    "boss"
  );
  assert.deepEqual(out.map((s) => [s.title, s.down, s.status]), [["Crash", 0, "planned"]]);
});

test("each author's newest receipt is the one checked", () => {
  const tokens = greenhouseTokens([entry("alice", 1, { type: "seed", receipt: "old" }), entry("alice", 2, { type: "vote", receipt: "new" })]);
  assert.equal(tokens.get("alice"), "new");
});

test("non-supporters with Sapling+ Linfa can plant and vote, taking the max of supporter tier and Linfa weight", () => {
  const linfaSeed = entry("dan", t0, { type: "seed", kind: "feature", title: "Linfa proposal", days: 7 });
  const id = `dan:${linfaSeed.id}`;
  const linfaWeights: Record<string, number> = {
    dan: 1,     // non-supporter, Sapling -> weight 1
    erin: 2,    // non-supporter, Tree -> weight 2
    alice: 3,   // sprout (tier weight 1) + Elder tree (linfa weight 3) -> max(1, 3) = 3
    mallory: 0, // non-supporter, Seed -> ignored
  };
  const out = foldGreenhouse(
    [
      linfaSeed,
      entry("mallory", t0, { type: "seed", kind: "feature", title: "Spam seed", days: 7 }),
      entry("erin", t0 + 1, { type: "vote", seed: id, v: 1 }),
      entry("alice", t0 + 2, { type: "vote", seed: id, v: 1 }),
      entry("mallory", t0 + 3, { type: "vote", seed: id, v: 1 }),
    ],
    tierOf,
    "dan",
    "boss",
    (a) => linfaWeights[a] ?? 0
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Linfa proposal");
  assert.deepEqual([out[0].up, out[0].down, out[0].voters], [5, 0, 2]);
});
