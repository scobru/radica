import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, postMsg3, profileMsg4 } from "../src/crypto.ts";
import { WORKER_SRC } from "../src/feedlight.ts";
import { FeedStore, type FeedNetworkAdapter, type FeedStorageLike } from "../src/feedStore.ts";
import type { FeedState, Post, UserIdentity } from "../src/types.ts";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

function makeStorage(): FeedStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

function makeIdentity(seedByte: number): UserIdentity {
  const secretKey = new Uint8Array(32).fill(seedByte);
  const pubBytes = ed.getPublicKey(secretKey);
  const pubkey = bytesToHex(pubBytes);
  return {
    pubkey,
    secretKey,
    encPub: pubkey,
    sign: async (msg: string) => bytesToHex(await ed.signAsync(new TextEncoder().encode(msg), secretKey)),
  };
}

function makePost(author: string, id: string, caption: string, ts: number): Post {
  return {
    id,
    author,
    category: "thought",
    caption,
    timestamp: ts,
    sig: `sig_${id}`,
    comments: {},
    likes: {},
  };
}

describe("feedlight WORKER_SRC", () => {
  it("parses cleanly as standalone worker JS without syntax errors", () => {
    const fn = new Function("self", WORKER_SRC);
    assert.equal(typeof fn, "function");
  });
});

describe("FeedStore", () => {
  it("isolates returned following/top-level copies while keeping posts ref stability until saveFeed", async () => {
    const storage = makeStorage();
    const me = makeIdentity(1);
    const feed: FeedState = {
      owner: me.pubkey,
      posts: { p1: makePost(me.pubkey, "p1", "hi", 100) },
      following: ["peer1"],
    };
    storage.setItem(`freenet_feed_${me.pubkey}`, JSON.stringify(feed));

    const store = new FeedStore({
      storage,
      net: { getText: async () => null, push: async () => {}, liveAge: () => null, liveIds: () => ["feed:a"] },
      isConnected: () => false,
      me: () => me.pubkey,
      onPeerProfile: () => {},
      onChanged: () => {},
      yieldToMain: async () => {},
    });

    assert.equal(store.hostedFeeds(), 1);
    const a = await store.getFeed(me.pubkey);
    const b = await store.getFeed(me.pubkey);
    assert.equal(a.posts, b.posts); // Preserves UI `sizedPosts` ref check between cached reads.
    a.following.push("mutated-locally");
    const c = await store.getFeed(me.pubkey);
    assert.deepEqual(c.following, ["peer1"]);

    await store.saveFeed(c);
    const d = await store.getFeed(me.pubkey);
    assert.notEqual(d.posts, b.posts); // saveFeed refreshes `posts` reference.
  });

  it("handles peer delta ingestion, fallback refresh, and profile updates", async () => {
    const storage = makeStorage();
    const me = makeIdentity(1);
    const peer = makeIdentity(2);
    const peerFeed: FeedState = {
      owner: peer.pubkey,
      profile: { display_name: "Bob", bio: "", avatar_url: "", updated_at: 10, sig: "s1" },
      posts: { p1: makePost(peer.pubkey, "p1", "post one", 10) },
      following: [me.pubkey],
    };
    const profiles: string[] = [];
    let getTextCalls = 0;

    const net: FeedNetworkAdapter = {
      getText: async () => {
        getTextCalls++;
        return JSON.stringify(peerFeed);
      },
      push: async () => {},
      liveAge: () => null,
      liveIds: () => [],
    };
    const store = new FeedStore({
      storage,
      net,
      isConnected: () => true,
      me: () => me.pubkey,
      onPeerProfile: (_o, p) => profiles.push(p.display_name),
      onChanged: () => {},
      yieldToMain: async () => {},
    });

    storage.setItem(`freenet_feed_${peer.pubkey}`, JSON.stringify(peerFeed));
    await store.applyChange(peer.pubkey, {
      delta: JSON.stringify({
        owner: peer.pubkey,
        posts: { p2: makePost(peer.pubkey, "p2", "post two", 20) },
        following: [],
      }),
    });
    assert.deepEqual(store.followingOf(peer.pubkey), [me.pubkey]);
    assert.deepEqual(store.followersOf(me.pubkey), [peer.pubkey]);
    assert.equal(store.knownPostCount(), 2);
    assert.deepEqual(profiles, ["Bob"]);

    // Corrupt change falls back to full refresh.
    await store.applyChange(peer.pubkey, { delta: "{invalid" });
    assert.equal(getTextCalls, 1);
  });

  it("requeues lost own deletions and syncs fresh browser feed before migrating v3", async () => {
    const storage = makeStorage();
    const me = makeIdentity(3);
    const post = makePost(me.pubkey, "p1", "hello", 100);
    const remoteState: FeedState = {
      owner: me.pubkey,
      profile: { display_name: "Alice", bio: "bio", avatar_url: "", enc_pub: "old", updated_at: 10, sig: "old" },
      posts: { p1: post },
      following: ["f1"],
    };
    const pushedDeltas: FeedState[] = [];
    const scheduled: Array<() => void> = [];

    const store = new FeedStore({
      storage,
      net: {
        getText: async () => JSON.stringify(remoteState),
        push: async (_id, d) => void pushedDeltas.push(d as FeedState),
        liveAge: () => null,
        liveIds: () => [],
      },
      isConnected: () => true,
      me: () => me.pubkey,
      onPeerProfile: () => {},
      onChanged: () => {},
      yieldToMain: async () => {},
      now: () => 5000,
      schedule: (fn) => scheduled.push(fn),
    });

    let afterInitialFetch = false;
    await store.syncOwnFeed(me, {
      onAfterInitialFetch: () => {
        afterInitialFetch = true;
      },
    });
    assert.equal(afterInitialFetch, true);
    assert.equal(storage.getItem(`radica_feed_v4_${me.pubkey}`), "1");
    const migrated = await store.getFeed(me.pubkey);
    assert.equal(migrated.profile?.enc_pub, me.encPub);
    assert.equal(migrated.posts.p1.v, 3);
    assert.ok(await ed.verifyAsync(Buffer.from(migrated.posts.p1.sig, "hex"), new TextEncoder().encode(postMsg3(migrated.posts.p1)), Buffer.from(me.pubkey, "hex")));
    assert.ok(await ed.verifyAsync(Buffer.from(migrated.profile!.sig, "hex"), new TextEncoder().encode(profileMsg4(me.pubkey, migrated.profile!)), Buffer.from(me.pubkey, "hex")));

    // Test requeueLostDeletions when local tombstone is missing in fetched state.
    const withDel: FeedState = {
      owner: me.pubkey,
      posts: {},
      following: [],
      deleted: { p1: { sig: "delsig" } },
    };
    storage.setItem(`freenet_feed_${me.pubkey}`, JSON.stringify(withDel));
    const networkWithoutDel: FeedState = {
      owner: me.pubkey,
      posts: { p1: post },
      following: [],
    };
    await store.takeFeed(me.pubkey, JSON.stringify(networkWithoutDel));
    assert.equal(scheduled.length, 1);
    const afterTake = JSON.parse(storage.getItem(`freenet_feed_${me.pubkey}`)!);
    assert.equal(afterTake.posts.p1, undefined);
    assert.equal(afterTake.deleted.p1.sig, "delsig");
  });
});
