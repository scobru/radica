import { test } from "node:test";
import assert from "node:assert/strict";
import { NATIVE_BLOB_BUDGET, safeStorage } from "../src/storage.ts";

test("safeStorage: stores and retrieves items without throwing", () => {
  safeStorage.setItem("test_key", "test_val");
  assert.equal(safeStorage.getItem("test_key"), "test_val");

  safeStorage.removeItem("test_key");
  assert.equal(safeStorage.getItem("test_key"), null);
});

test("safeStorage: works when localStorage throws SecurityError", () => {
  const origLocalStorage = (globalThis as any).localStorage;
  try {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new DOMException(
          "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.",
          "SecurityError"
        );
      },
      configurable: true,
    });

    safeStorage.setItem("sandboxed_key", "secret123");
    assert.equal(safeStorage.getItem("sandboxed_key"), "secret123");
    safeStorage.removeItem("sandboxed_key");
    assert.equal(safeStorage.getItem("sandboxed_key"), null);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      value: origLocalStorage,
      configurable: true,
      writable: true,
    });
  }
});

test("safeStorage: preserves newest Moment media_uri in feed under budget and across hash reload", () => {
  const owner = "test_persona_pubkey_123456789";
  const profileKey = `radica_profile_${owner}`;
  const feedKey = `freenet_feed_${owner}`;

  safeStorage.setItem(
    profileKey,
    JSON.stringify({ display_name: "Tester", bio: "Bio", avatar_url: "data:image/svg+xml;base64,mock" })
  );

  const sampleMomentMedia = "data:image/webp;base64," + "A".repeat(1800);
  const feed = {
    owner,
    posts: {
      post_1: {
        id: "post_1",
        author: owner,
        category: "moment",
        caption: "Helicopter in the sky",
        media_uri: sampleMomentMedia,
        timestamp: Date.now(),
        sig: "sig_abc",
        likes: [],
        comments: {},
      },
      post_0: {
        id: "post_0",
        author: owner,
        category: "thought",
        caption: "Earlier thought",
        timestamp: Date.now() - 10000,
        sig: "sig_def",
        likes: [],
        comments: {},
      },
    },
    following: [],
    profile: { display_name: "Tester" },
  };

  safeStorage.setItem(feedKey, JSON.stringify(feed));

  // Compute the budgeted URL hash state
  const { authObj, hash } = safeStorage.computeBudgetedState();
  assert.ok(hash.length <= 7500, `Hash length ${hash.length} must be <= 7500`);
  assert.ok(authObj[feedKey], "Feed must be present in budgeted state");

  // Simulate F5 browser reload: clear memory and rehydrate strictly from hash
  safeStorage.clear();
  assert.equal(safeStorage.getItem(feedKey), null, "State must be empty after clear");

  safeStorage.hydrateFromHashString(hash);
  const reloaded = JSON.parse(safeStorage.getItem(feedKey) || "{}");
  assert.ok(reloaded.posts, "feed should contain posts after reload");
  assert.equal(reloaded.posts["post_1"]?.media_uri, sampleMomentMedia, "Newest Moment media_uri must survive reload");
  assert.equal(reloaded.posts["post_0"]?.caption, "Earlier thought", "Thought must survive reload");

  safeStorage.clear();
});

test("safeStorage: strips older moment media first when budget is tight, preserving newest moment media across reload", () => {
  const owner = "test_persona_pubkey_multi";
  const profileKey = `radica_profile_${owner}`;
  const feedKey = `freenet_feed_${owner}`;

  safeStorage.setItem(
    profileKey,
    JSON.stringify({ display_name: "MultiTester", bio: "Bio", avatar_url: "data:image/svg+xml;base64,mock" })
  );

  // Two moment images that together exceed 7500 char budget
  const momentMediaNew = "data:image/webp;base64," + "B".repeat(2400);
  const momentMediaOld = "data:image/webp;base64," + "C".repeat(3200);

  const feed = {
    owner,
    posts: {
      post_new: {
        id: "post_new",
        author: owner,
        category: "moment",
        caption: "Sunset today",
        media_uri: momentMediaNew,
        timestamp: 2000,
        sig: "sig_new",
        likes: [],
        comments: {},
      },
      post_old: {
        id: "post_old",
        author: owner,
        category: "moment",
        caption: "Helicopter yesterday",
        media_uri: momentMediaOld,
        timestamp: 1000,
        sig: "sig_old",
        likes: [],
        comments: {},
      },
    },
    following: [],
    profile: { display_name: "MultiTester" },
  };

  safeStorage.setItem(feedKey, JSON.stringify(feed));

  const { hash } = safeStorage.computeBudgetedState();
  assert.ok(hash.length <= 7500, `Hash length ${hash.length} must be <= 7500`);

  // Simulate F5 browser reload from hash
  safeStorage.clear();
  safeStorage.hydrateFromHashString(hash);

  const reloaded = JSON.parse(safeStorage.getItem(feedKey) || "{}");
  assert.ok(reloaded.posts, "feed should contain posts after reload");
  // Newest post keeps its media
  assert.equal(reloaded.posts["post_new"]?.media_uri, momentMediaNew, "Newest moment media must be kept across reload");
  // Older post is preserved (caption, comments, etc.) but its media is stripped to fit budget
  assert.equal(reloaded.posts["post_old"]?.caption, "Helicopter yesterday", "Older post caption must be kept across reload");
  assert.equal(reloaded.posts["post_old"]?.media_uri, undefined, "Older moment media should be stripped when exceeding budget");

  safeStorage.clear();
});

test("safeStorage: a big room list keeps newest rooms in budget and never exports secret keys to #auth_state", () => {
  safeStorage.setItem("radica_ed25519_seed", "ab".repeat(32));
  safeStorage.setItem("radica_read_keys", JSON.stringify(["ef".repeat(32)]));
  safeStorage.setItem("radica_session", JSON.stringify({ persona: "cd".repeat(32), type: "local" }));
  safeStorage.setItem("freenet_private_rooms", JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ id: `privroom_${i}`, created_at: i, keys: "k".repeat(1200) }))));
  const { authObj, hash } = safeStorage.computeBudgetedState();
  assert.ok(hash.length <= 7500, `hash is ${hash.length} chars`);
  assert.equal(authObj["radica_ed25519_seed"], undefined);
  assert.equal(authObj["radica_read_keys"], undefined);
  assert.equal(authObj["radica_session"], undefined);
  const kept = JSON.parse(authObj["freenet_private_rooms"] ?? "[]");
  assert.equal(kept[0]?.id, "privroom_19"); // newest first
  assert.ok(kept.length > 0 && kept.length < 20); // the newest rooms that fit; the rest is left to the node and the network
  safeStorage.removeItem("freenet_private_rooms");
  safeStorage.removeItem("radica_session");
  safeStorage.removeItem("radica_read_keys");
  safeStorage.removeItem("radica_ed25519_seed");
});

test("safeStorage: syncs the whole store to window.__radicaNative, unbudgeted", () => {
  const origLocalStorage = (globalThis as any).localStorage;
  const origBridge = (globalThis as any).__radicaNative;
  let blob: string | null = null;
  try {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new DOMException("sandboxed", "SecurityError");
      },
      configurable: true,
    });
    (globalThis as any).__radicaNative = {
      getAll: () => blob,
      setAll: (json: string) => {
        blob = json;
      },
    };

    const bigFeed = JSON.stringify({ posts: { a: "x".repeat(20000) } }); // far past the hash's 7500-char budget
    safeStorage.setItem("freenet_feed_native_test", bigFeed);
    safeStorage.syncNativeBridge();

    assert.ok(blob, "setAll must have been called");
    const synced = JSON.parse(blob!);
    assert.equal(synced["freenet_feed_native_test"], bigFeed, "the bridge gets the full value, not a trimmed one");

    // a log/room cache is still left out, same as the window.name sync
    safeStorage.setItem("freenet_log_test", "noise");
    safeStorage.syncNativeBridge();
    assert.ok(!("freenet_log_test" in JSON.parse(blob!)));

    // over the apps' size limit: feed caches go (biggest first) so pins and settings still get saved
    const huge = "y".repeat(NATIVE_BLOB_BUDGET);
    safeStorage.setItem("freenet_feed_native_huge", huge);
    safeStorage.setItem("radica_pinned_chats_native_test", JSON.stringify(["dm:abc"]));
    safeStorage.syncNativeBridge();
    const fitted = JSON.parse(blob!);
    assert.ok(blob!.length <= NATIVE_BLOB_BUDGET);
    assert.ok(!("freenet_feed_native_huge" in fitted), "the biggest feed cache is dropped");
    assert.equal(fitted["radica_pinned_chats_native_test"], JSON.stringify(["dm:abc"]));
    assert.equal(fitted["freenet_feed_native_test"], bigFeed, "smaller caches stay when it already fits");
    safeStorage.removeItem("freenet_feed_native_huge");
    safeStorage.removeItem("radica_pinned_chats_native_test");

    safeStorage.removeItem("freenet_feed_native_test");
    safeStorage.removeItem("freenet_log_test");
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      value: origLocalStorage,
      configurable: true,
      writable: true,
    });
    (globalThis as any).__radicaNative = origBridge;
  }
});

test("safeStorage: preserves pinned and verified chats across sandbox hash reload, while excluding secrets", () => {
  const me = "11".repeat(32);
  const pinnedKey = `radica_pinned_chats_${me}`;
  const verifiedKey = `radica_verified_chats_${me}`;
  safeStorage.setItem("radica_ed25519_seed", "ab".repeat(32));
  safeStorage.setItem(pinnedKey, JSON.stringify(["priv:channel1", "dm:peer2"]));
  safeStorage.setItem(verifiedKey, JSON.stringify(["priv:channel1"]));
  safeStorage.setItem("river_key_room123", "secretkey123");
  safeStorage.setItem("river_join_room123", JSON.stringify({ member: "mem1", secret: "sec1" }));

  const { authObj, hash } = safeStorage.computeBudgetedState();
  assert.ok(hash.length > 0);
  assert.equal(authObj["radica_ed25519_seed"], undefined);
  assert.equal(authObj["river_key_room123"], undefined);
  assert.equal(authObj["river_join_room123"], undefined);

  // Even a forged #auth_state= payload with secrets or sensitive config must be rejected by hydrateFromHashString
  const forgedPayload = Buffer.from(
    JSON.stringify({
      radica_ed25519_seed: "ff".repeat(32),
      radica_session: '{"persona":"bad"}',
      radica_viso_url: "https://evil.example/",
      radica_trusted_blocklists: '["attacker"]',
      river_key_room123: "stolen",
      [pinnedKey]: JSON.stringify(["priv:injected"]),
    }),
    "utf8",
  ).toString("base64");

  safeStorage.clear();
  assert.equal(safeStorage.getItem(pinnedKey), null);
  assert.equal(safeStorage.getItem(verifiedKey), null);

  safeStorage.hydrateFromHashString(hash);
  assert.deepEqual(JSON.parse(safeStorage.getItem(pinnedKey) || "[]"), ["priv:channel1", "dm:peer2"]);
  assert.deepEqual(JSON.parse(safeStorage.getItem(verifiedKey) || "[]"), ["priv:channel1"]);
  // Secrets never round-trip through hash
  assert.equal(safeStorage.getItem("river_key_room123"), null);
  assert.equal(safeStorage.getItem("river_join_room123"), null);

  // Attempt forged #auth_state= injection on top: secrets/security keys dropped, existing keys never overwritten
  safeStorage.hydrateFromHashString(`#auth_state=${forgedPayload}`);
  assert.equal(safeStorage.getItem("radica_ed25519_seed"), null);
  assert.equal(safeStorage.getItem("radica_session"), null);
  assert.equal(safeStorage.getItem("radica_viso_url"), null);
  assert.equal(safeStorage.getItem("radica_trusted_blocklists"), null);
  assert.equal(safeStorage.getItem("river_key_room123"), null);
  assert.deepEqual(JSON.parse(safeStorage.getItem(pinnedKey) || "[]"), ["priv:channel1", "dm:peer2"]);

  safeStorage.clear();
});

test("safeStorage: ignores #auth_state completely when real localStorage is available", () => {
  const origLocalStorage = (globalThis as any).localStorage;
  const origWindow = (globalThis as any).window;
  const store = new Map<string, string>();
  const mockLs = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  try {
    (globalThis as any).localStorage = mockLs;
    (globalThis as any).window = { ...(origWindow || {}), localStorage: mockLs };
    (safeStorage as any).localStorageAvailable = null;
    safeStorage.clear();
    const payload = Buffer.from(JSON.stringify({ radica_profile_test: "injected" }), "utf8").toString("base64");
    safeStorage.hydrateFromHashString(`#auth_state=${payload}`);
    assert.equal(safeStorage.getItem("radica_profile_test"), null);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      value: origLocalStorage,
      configurable: true,
      writable: true,
    });
    if (origWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = origWindow;
    (safeStorage as any).localStorageAvailable = null;
    safeStorage.clear();
  }
});

test("safeStorage: excludes radica_profile_extras_ from #auth_state= and rejects forged hash injection in sandbox", () => {
  const origLocalStorage = (globalThis as any).localStorage;
  const me = "22".repeat(32);
  const extrasKey = `radica_profile_extras_${me}`;
  const forged = JSON.stringify({ wallets: { author: me, id: "x", ts: 9999999999999, body: '{"btc":"1Attacker"}', sig: "aa".repeat(64) } });
  try {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new DOMException("sandboxed", "SecurityError");
      },
      configurable: true,
    });
    (safeStorage as any).localStorageAvailable = null;
    safeStorage.clear();
    safeStorage.setItem(extrasKey, forged);
    const { authObj } = safeStorage.computeBudgetedState();
    assert.equal(authObj[extrasKey], undefined, "radica_profile_extras_ must never be serialized to #auth_state=");

    safeStorage.clear();
    const payload = Buffer.from(JSON.stringify({ [extrasKey]: forged, [`radica_profile_${me}`]: '{"display_name":"Ok"}' }), "utf8").toString("base64");
    safeStorage.hydrateFromHashString(`#auth_state=${payload}`);
    assert.equal(safeStorage.getItem(extrasKey), null, "radica_profile_extras_ must be rejected from #auth_state= in sandbox");
    assert.equal(safeStorage.getItem(`radica_profile_${me}`), '{"display_name":"Ok"}');
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      value: origLocalStorage,
      configurable: true,
      writable: true,
    });
    (safeStorage as any).localStorageAvailable = null;
    safeStorage.clear();
  }
});

test("safeStorage.flush: skips bridge.setAll when clean, flushes once per mutation, and ignores identical values", () => {
  const origBridge = (globalThis as any).__radicaNative;
  let blob: string | null = null;
  let setAllCalls = 0;
  try {
    safeStorage.clear();
    safeStorage.flush();

    (globalThis as any).__radicaNative = {
      getAll: () => blob,
      setAll: (json: string) => {
        setAllCalls++;
        blob = json;
      },
    };

    // Nothing changed since flush -> skipped
    safeStorage.flush();
    assert.equal(setAllCalls, 0);

    // Mutation marks dirty and flushes once
    safeStorage.setItem("dirty_test_key", "v1");
    safeStorage.flush();
    assert.equal(setAllCalls, 1);
    assert.equal(JSON.parse(blob!)["dirty_test_key"], "v1");

    // Second flush with no new changes -> skipped
    safeStorage.flush();
    assert.equal(setAllCalls, 1);

    // Setting an identical value does not mark dirty
    safeStorage.setItem("dirty_test_key", "v1");
    safeStorage.flush();
    assert.equal(setAllCalls, 1);

    // Removing an existing key marks dirty and flushes once
    safeStorage.removeItem("dirty_test_key");
    safeStorage.flush();
    assert.equal(setAllCalls, 2);
    assert.equal("dirty_test_key" in JSON.parse(blob!), false);

    // Subsequent flush -> skipped again
    safeStorage.flush();
    assert.equal(setAllCalls, 2);
  } finally {
    safeStorage.clear();
    safeStorage.flush();
    (globalThis as any).__radicaNative = origBridge;
  }
});

test("safeStorage.syncNativeBridge: prunes largest freenet_feed_* entries under NATIVE_BLOB_BUDGET while keeping non-feed keys", () => {
  const origBridge = (globalThis as any).__radicaNative;
  let blob: string | null = null;
  try {
    safeStorage.clear();
    safeStorage.flush();
    (globalThis as any).__radicaNative = {
      getAll: () => blob,
      setAll: (json: string) => {
        blob = json;
      },
    };

    const pinnedVal = JSON.stringify(["dm:peer1", "priv:room1"]);
    const settingsVal = JSON.stringify({ theme: "dark", maskBadWords: true });
    safeStorage.setItem("radica_pinned_chats_prune_test", pinnedVal);
    safeStorage.setItem("radica_settings_prune_test", settingsVal);
    safeStorage.setItem("freenet_feed_small", "s".repeat(1024));
    safeStorage.setItem("freenet_feed_medium", "m".repeat(3_500_000));
    safeStorage.setItem("freenet_feed_largest", "L".repeat(4_000_000));

    safeStorage.syncNativeBridge();
    assert.ok(blob !== null, "setAll should be called");
    assert.ok(blob!.length <= NATIVE_BLOB_BUDGET, `blob length ${blob!.length} must be <= ${NATIVE_BLOB_BUDGET}`);

    const parsed = JSON.parse(blob!);
    assert.equal("freenet_feed_largest" in parsed, false, "largest feed cache should be pruned");
    assert.equal("freenet_feed_medium" in parsed, true, "medium feed cache should remain when it fits budget");
    assert.equal("freenet_feed_small" in parsed, true, "small feed cache should remain");
    assert.equal(parsed["radica_pinned_chats_prune_test"], pinnedVal);
    assert.equal(parsed["radica_settings_prune_test"], settingsVal);

    // Adding another huge feed drops both huge feeds while still preserving small feed & non-feed keys
    safeStorage.setItem("freenet_feed_huge_2", "H".repeat(3_600_000));
    safeStorage.syncNativeBridge();
    assert.ok(blob!.length <= NATIVE_BLOB_BUDGET);
    const parsed2 = JSON.parse(blob!);
    assert.equal("freenet_feed_largest" in parsed2, false);
    assert.equal("freenet_feed_huge_2" in parsed2, false);
    assert.equal("freenet_feed_medium" in parsed2, true);
    assert.equal("freenet_feed_small" in parsed2, true);
    assert.equal(parsed2["radica_pinned_chats_prune_test"], pinnedVal);
    assert.equal(parsed2["radica_settings_prune_test"], settingsVal);
  } finally {
    safeStorage.clear();
    safeStorage.flush();
    (globalThis as any).__radicaNative = origBridge;
  }
});
