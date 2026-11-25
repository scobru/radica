import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  foldDelegationProofs,
  foldGhostkeyBundles,
  foldPohProofs,
  foldSupporterTokens,
  latestByAuthor,
  type LogEntry,
} from "../src/logfold.ts";
import { LogStore, type LogNetworkAdapter, type LogStorageLike } from "../src/logStore.ts";
import { REFRESH_EVERY_MS } from "../src/refresh.ts";

function makeMemoryStorage(): LogStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

function entry(
  author: string,
  id: string,
  ts: number,
  body: string,
  sig = "aa",
  v = 2,
  nonce = 0,
): LogEntry {
  return { author, id, ts, body, sig, v, nonce };
}

describe("logfold author-latest folds", () => {
  it("latestByAuthor breaks equal-ts ties deterministically by higher signature regardless of order", () => {
    const low = entry("alice", "1", 100, '{"receipt":"old"}', "11");
    const high = entry("alice", "2", 100, '{"receipt":"new"}', "ff");
    const bobOlder = entry("bob", "1", 90, '{"receipt":"b1"}', "ff");
    const bobNewer = entry("bob", "2", 95, '{"receipt":"b2"}', "01");

    const fwd = latestByAuthor([low, high, bobOlder, bobNewer]);
    const rev = latestByAuthor([bobNewer, high, bobOlder, low]);
    assert.equal(fwd.get("alice")?.sig, "ff");
    assert.equal(rev.get("alice")?.sig, "ff");
    assert.equal(fwd.get("bob")?.id, "2");
    assert.equal(rev.get("bob")?.id, "2");
  });

  it("folds supporterTokens, ghostkeyBundles, pohProofs, and delegationProofs safely", () => {
    const alice = "a".repeat(64);
    const bob = "b".repeat(64);
    const validDel = {
      version: 1,
      from: alice,
      to: bob,
      scope: "radica",
      time_ms: 100,
      sig_from: "11".repeat(64),
      sig_to: "22".repeat(64),
    };

    const supporters = foldSupporterTokens([
      entry(alice, "1", 10, JSON.stringify({ receipt: "tok1" }), "01"),
      entry(alice, "2", 10, JSON.stringify({ receipt: null }), "ff"),
      entry(bob, "1", 10, "{not-json", "aa"),
    ]);
    assert.deepEqual(supporters, [
      { author: alice, token: null },
      { author: bob, token: null },
    ]);

    const ghosts = foldGhostkeyBundles([
      entry(alice, "1", 10, JSON.stringify({ bundle: "deadbeef" })),
      entry(bob, "1", 10, JSON.stringify({ bundle: "NOT-HEX!" })),
    ]);
    assert.deepEqual(ghosts, [
      { author: alice, bundle: "deadbeef" },
      { author: bob, bundle: null },
    ]);

    const pohs = foldPohProofs([
      entry(alice, "1", 10, JSON.stringify({ proof: "abcd", delegation: validDel })),
      entry(bob, "1", 10, JSON.stringify({ proof: "zzz", delegation: { broken: true } })),
    ]);
    assert.deepEqual(pohs, [
      { author: alice, proof: "abcd", delegation: validDel },
      { author: bob, proof: null },
    ]);

    const dels = foldDelegationProofs([
      entry(alice, "1", 10, JSON.stringify({ proof: validDel })),
      entry(bob, "1", 10, JSON.stringify({ proof: { v: 99 } })),
    ]);
    assert.deepEqual(dels, [
      { author: alice, proof: validDel },
      { author: bob, proof: null },
    ]);
  });
});

describe("LogStore stateful engine", () => {
  it("memoizes folds by raw stored JSON and invalidates on save or clearCache", () => {
    const storage = makeMemoryStorage();
    const net: LogNetworkAdapter = {
      get: async () => null,
      push: async () => {},
      liveAge: () => null,
    };
    const store = new LogStore({
      storage,
      net,
      isConnected: () => false,
      identity: () => null,
      onApplied: () => {},
      onChanged: () => {},
    });

    let computeCount = 0;
    const first = store.memo("supporters", "supporters", (list) => {
      computeCount++;
      return list.length;
    });
    const second = store.memo("supporters", "supporters", (list) => {
      computeCount++;
      return list.length;
    });
    assert.equal(first, 0);
    assert.equal(second, 0);
    assert.equal(computeCount, 1);

    store.save("supporters", [entry("a".repeat(64), "1", 10, '{"receipt":"r1"}')]);
    const third = store.memo("supporters", "supporters", (list) => {
      computeCount++;
      return list.length;
    });
    assert.equal(third, 1);
    assert.equal(computeCount, 2);

    store.clearCache();
    store.memo("supporters", "supporters", (list) => {
      computeCount++;
      return list.length;
    });
    assert.equal(computeCount, 3);
    store.dispose();
  });

  it("handles append PoW scoping, stateSlot ids, and offline/failed retry scheduling", async () => {
    const storage = makeMemoryStorage();
    const me = "a".repeat(64);
    const peer = "b".repeat(64);
    let pushShouldFail = false;
    const pushed: { id: string; count: number }[] = [];
    const applied: string[] = [];
    let connected = true;
    let clock = 1000;
    const grinds: number[] = [];

    const net: LogNetworkAdapter = {
      get: async () => ({ entries: {} }),
      push: async (id, value) => {
        if (pushShouldFail) throw new Error("network down");
        pushed.push({ id, count: Object.keys((value as { entries: Record<string, LogEntry> }).entries).length });
      },
      liveAge: () => null,
    };

    const store = new LogStore({
      storage,
      net,
      isConnected: () => connected,
      identity: () => ({ pubkey: me, sign: async (m) => `sig:${m.length}` }),
      onApplied: (n) => applied.push(n),
      onChanged: () => {},
      grind: () => {
        grinds.push(1);
        return 42;
      },
      now: () => clock,
      retryDelayMs: 60_000,
    });

    // Owner-scoped own log skips PoW; chat_read uses deterministic stateSlot id.
    await store.append(`inbox/${me}`, { type: "chat_read", room: "r1", upto: 10 }, { flush: true });
    assert.equal(grinds.length, 0);
    const ownEntries = store.entries(`inbox/${me}`);
    assert.equal(ownEntries.length, 1);
    assert.match(ownEntries[0].id, /^chat_read:/);
    assert.equal(store.hasUnsent(`inbox/${me}`), false);
    assert.deepEqual(applied, [`inbox/${me}`]);

    // Shared log grinds PoW and marks unsent when push fails.
    pushShouldFail = true;
    await store.append("communities", { type: "community_join", community_id: "c_test" }, { flush: true });
    assert.equal(grinds.length, 1);
    assert.equal(store.entries("communities")[0].nonce, 42);
    assert.equal(store.hasUnsent("communities"), true);

    // Offline append to another person's inbox grinds PoW and queues retry.
    connected = false;
    clock = 2000;
    await store.append(`inbox/${peer}`, { type: "dm_ref", room: "r1" });
    assert.equal(grinds.length, 2);
    assert.equal(store.hasUnsent(`inbox/${peer}`), true);

    assert.equal(pushed[0]?.id, `log:inbox/${me}`);
    store.dispose();
  });

  it("verifies ingress on take, skips forged entries, pushes newer local missing entries, and suppresses no-op notifications", async () => {
    const storage = makeMemoryStorage();
    const pushed: Record<string, LogEntry>[] = [];
    const changed: string[] = [];
    const postTake: string[] = [];

    const validLocal = entry("alice", "1", 200, '{"ok":true}', "sig-valid");
    const tamperedLocal = entry("alice", "2", 999, '{"tampered":true}', "sig-forged");
    const olderRemote = entry("alice", "1", 150, '{"ok":false}', "sig-valid");
    const validRemote = entry("bob", "1", 180, '{"b":1}', "sig-valid");
    const forgedRemote = entry("mallory", "1", 999, '{"evil":true}', "sig-forged");

    const store = new LogStore({
      storage,
      net: {
        get: async () => null,
        push: async (_id, val) => {
          pushed.push((val as { entries: Record<string, LogEntry> }).entries);
        },
        liveAge: () => null,
      },
      isConnected: () => true,
      identity: () => null,
      onApplied: () => {},
      onChanged: (n) => changed.push(n),
      onPostTake: (n) => postTake.push(n),
      verify: async (_msg, sig) => sig === "sig-valid",
    });

    store.save("room/r1", [validLocal, tamperedLocal]);
    await store.take("room/r1", {
      "alice:1": olderRemote,
      "bob:1": validRemote,
      "mallory:1": forgedRemote,
    });

    // validLocal beats olderRemote, tamperedLocal and forgedRemote are dropped, validRemote is kept.
    const saved = store.entries("room/r1");
    assert.equal(saved.length, 2);
    assert.equal(saved.some((e) => e.id === "2" && e.author === "alice"), false);
    assert.equal(saved.some((e) => e.author === "mallory"), false);
    assert.equal(saved.find((e) => e.author === "alice")?.ts, 200);
    assert.deepEqual(changed, ["room/r1"]);
    assert.deepEqual(postTake, ["room/r1"]);
    assert.equal(pushed.length, 1);
    assert.equal(pushed[0]["alice:1"]?.ts, 200);

    // Repeating take with identical remote state triggers no second write or onChanged.
    await store.take("room/r1", {
      "alice:1": validLocal,
      "bob:1": validRemote,
    });
    assert.deepEqual(changed, ["room/r1"]);
    store.dispose();
  });

  it("applies delta/state changes, backs off on transient refresh failure, and honors shouldFetch", async () => {
    const storage = makeMemoryStorage();
    let now = 100_000;
    let failGet = false;
    let getCount = 0;
    const loaded: string[] = [];
    const existing = entry("alice", "1", 10, '{"x":1}', "sig-valid");
    const deltaEntry = entry("bob", "1", 20, '{"y":2}', "sig-valid");
    const stateEntry = entry("alice", "2", 30, '{"z":3}', "sig-valid");

    const store = new LogStore({
      storage,
      net: {
        get: async () => {
          getCount++;
          if (failGet) throw new Error("timeout");
          return { entries: { "alice:2": stateEntry } };
        },
        push: async () => {},
        liveAge: () => null,
      },
      isConnected: () => true,
      identity: () => null,
      onApplied: () => {},
      onChanged: () => {},
      onLoaded: (n) => loaded.push(n),
      verify: async () => true,
      now: () => now,
    });

    store.save("supporters", [existing]);
    await store.applyChange("supporters", {
      delta: JSON.stringify({ entries: { "bob:1": deltaEntry } }),
    });
    assert.equal(store.entries("supporters").length, 2);
    assert.equal(store.hasLoaded("supporters"), true);
    assert.deepEqual(loaded, ["supporters"]);

    // Corrupt change payload falls back to force refresh; merge preserves verified local entries alongside remote state.
    await store.applyChange("supporters", { state: "{broken" });
    assert.equal(getCount, 1);
    assert.equal(store.entries("supporters").length, 3);
    assert.equal(store.entries("supporters").some((e) => e.id === "2"), true);

    // Throttling blocks immediate non-forced refresh.
    await store.refresh("supporters", false);
    assert.equal(getCount, 1);

    // Forced failure backs off lastRefresh to now - REFRESH_EVERY_MS + 5_000 (~5s cooldown).
    failGet = true;
    now += REFRESH_EVERY_MS + 1000;
    await store.refresh("supporters", false);
    assert.equal(getCount, 2);

    // 2s later still throttled; 6s later allowed again.
    failGet = false;
    now += 2_000;
    await store.refresh("supporters", false);
    assert.equal(getCount, 2);

    now += 4_000;
    await store.refresh("supporters", false);
    assert.equal(getCount, 3);
    store.dispose();
  });
});
