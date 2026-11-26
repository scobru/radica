import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "../src/crypto.ts";
import { parseRoomInviteParams } from "../src/nativeRooms.ts";
import { PrivateRoomManager, computeRoomJoinProof, mergeRoomBackup } from "../src/privateRooms.ts";
import { mergeRoomBackup as mergeFromShim } from "../src/roomBackup.ts";
import { blake3 } from "@noble/hashes/blake3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import type { LogEntry } from "../src/logfold.ts";
import { AI_REPORTERS, RADICA_MAINTAINER, type UserIdentity } from "../src/types.ts";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

function makeIdentity(seedByte: number): UserIdentity {
  const secretKey = new Uint8Array(32).fill(seedByte);
  const pubkey = bytesToHex(ed.getPublicKey(secretKey));
  return {
    pubkey,
    secretKey,
    encPub: pubkey,
    sign: async (msg: string) => bytesToHex(await ed.signAsync(new TextEncoder().encode(msg), secretKey)),
  };
}

function makeRoomHarness(initialIdentity: UserIdentity) {
  let current = initialIdentity;
  const storageMap = new Map<string, string>();
  const logs = new Map<string, LogEntry[]>();
  const nodeKV = new Map<string, string>();
  const broadcasts: unknown[] = [];
  const notifications: unknown[] = [];

  const mgr = new PrivateRoomManager({
    storage: {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => void storageMap.set(k, v),
      removeItem: (k) => void storageMap.delete(k),
    },
    flushStorage: () => {},
    logEntries: (name) => logs.get(name) ?? [],
    logAppend: async (name, body) => {
      const list = logs.get(name) ?? [];
      const ts = 1000 + list.length * 10;
      const bodyStr = JSON.stringify(body);
      const sig = await current.sign(`${name}:${list.length}:${bodyStr}`);
      list.push({ author: current.pubkey, id: String(list.length + 1), ts, body: bodyStr, sig, v: 2, nonce: 0 });
      logs.set(name, list);
    },
    refreshLog: async () => {},
    logOfRoom: (roomId) => `room/${roomId}`,
    nodeGet: async (k) => nodeKV.get(k) ?? null,
    nodePut: async (k, v) => void nodeKV.set(k, v),
    readKeysReady: async () => {},
    encPubOf: async (pk) => pk,
    isConnected: () => true,
    me: () => current.pubkey,
    visibleChat: (roomId) => JSON.parse(storageMap.get(`freenet_chat_${roomId}`) || "[]"),
    computeLogJoins: () => [],
    plain: async (_k, fn) => fn(),
    broadcast: (d) => broadcasts.push(d),
    addNotification: (to, n) => notifications.push({ to, ...n }),
    notifyListeners: () => {},
    peerDisplayName: () => "User",
    onPeerName: () => {},
    now: () => 5000,
  });

  return {
    mgr,
    storageMap,
    logs,
    nodeKV,
    broadcasts,
    notifications,
    setActor: (id: UserIdentity) => {
      current = id;
    },
  };
}

describe("PrivateRoomManager", () => {
  it("re-exports mergeRoomBackup through roomBackup.ts shim", () => {
    assert.equal(mergeFromShim, mergeRoomBackup);
  });

  it("creates native room, invites via link with key_proof, exchanges E2EE messages, kicks member and rotates key", async () => {
    const maintainer: UserIdentity = {
      ...makeIdentity(1),
      pubkey: RADICA_MAINTAINER,
    };
    const alice = makeIdentity(2);
    const bob = makeIdentity(3);
    const carol = makeIdentity(4);
    const h = makeRoomHarness(alice);

    // 1. Alice creates room with Bob invited directly.
    const room = await h.mgr.createPrivateRoom(alice, "Secret Squad", [bob.pubkey], "privroom_test_1");
    assert.equal(room.creator, alice.pubkey);
    assert.equal(room.members.includes(bob.pubkey), true);
    assert.equal(await h.mgr.getPrivateRoomDecryptedName(alice, room), "Secret Squad");

    // 2. Carol joins via hash invite link -> writes room_join with valid key_proof.
    const roomKey = await h.mgr.getPrivateRoomKey(alice, room);
    assert.ok(roomKey);
    const link = h.mgr.getPrivateRoomInviteLink(room, roomKey, "Secret Squad");
    const parsed = parseRoomInviteParams(new URLSearchParams(link.split("#")[1]));
    assert.ok(parsed);

    h.setActor(carol);
    const carolRoom = await h.mgr.joinPrivateRoomFromInvite(carol, parsed);
    assert.equal(carolRoom.members.includes(carol.pubkey), true);
    const carolJoinEntry = JSON.parse(h.logs.get("room/privroom_test_1")!.at(-1)!.body);
    assert.equal(carolJoinEntry.key_proof, computeRoomJoinProof(roomKey, "privroom_test_1", carol.pubkey));

    // 3. Carol sends encrypted message; Alice decrypts it.
    await h.mgr.sendPrivateRoomChatMessage(carol, carolRoom, "Hello E2EE!");
    h.setActor(alice);
    const msgs = await h.mgr.getPrivateRoomChatMessages(alice, room);
    assert.equal(msgs.some((m) => m.text === "Hello E2EE!"), true);

    // 4. Alice promotes Bob, then kicks Bob -> key rotates and Carol still decrypts room name with new key!
    await h.mgr.setPrivateRoomModerator(alice, "privroom_test_1", bob.pubkey, true);
    const postKick = await h.mgr.kickMemberFromPrivateRoom(alice, "privroom_test_1", bob.pubkey);
    assert.equal(postKick.members.includes(bob.pubkey), false);
    assert.equal(postKick.members.includes(carol.pubkey), true);
    assert.equal(postKick.encrypted_keys[bob.pubkey], undefined);

    h.setActor(carol);
    assert.equal(await h.mgr.getPrivateRoomDecryptedName(carol, postKick), "Secret Squad");
    h.setActor(bob);
    assert.equal(await h.mgr.getPrivateRoomKey(bob, postKick), null);

    // 5. Maintainer can add The Gardener when creator.
    h.setActor(maintainer);
    const mRoom = await h.mgr.createPrivateRoom(maintainer, "Gardener Room", [], "privroom_gardener_1");
    const withGardener = await h.mgr.addGardenerToPrivateRoom(maintainer, mRoom.id);
    assert.equal(withGardener.moderators?.includes(AI_REPORTERS[0]), true);

    // 6. Carol leaves room -> removed locally and room_leave appended.
    h.setActor(carol);
    await h.mgr.leavePrivateRoom(carol, "privroom_test_1");
    assert.equal((await h.mgr.getPrivateRooms(carol)).some((r) => r.id === "privroom_test_1"), false);

    h.mgr.dispose();
  });

  it("merges folded native vs River rooms and restores from node delegate", async () => {
    const alice = makeIdentity(10);
    const bob = makeIdentity(11);
    const h = makeRoomHarness(alice);

    // Native folded room drops kicked members authoritatively.
    h.mgr.mergeRemotePrivateRooms([
      {
        id: "privroom_m1",
        creator: alice.pubkey,
        name_encrypted: "old",
        members: [alice.pubkey, bob.pubkey],
        encrypted_keys: { [alice.pubkey]: "k1", [bob.pubkey]: "k2" },
        created_at: 1,
        sig: "s1",
      },
    ]);
    h.mgr.mergeFoldedRoom("privroom_m1", {
      id: "privroom_m1",
      creator: alice.pubkey,
      name_encrypted: "new",
      members: [alice.pubkey],
      encrypted_keys: { [alice.pubkey]: "k1-rot" },
      created_at: 1,
      sig: "s1",
    });
    const afterNative = h.mgr.readRooms().find((r) => r.id === "privroom_m1")!;
    assert.deepEqual(afterNative.members, [alice.pubkey]);
    assert.equal(afterNative.encrypted_keys[bob.pubkey], undefined);

    // Node restore merges unrestored backup rooms into empty storage.
    h.nodeKV.set(
      `privrooms:${alice.pubkey}`,
      JSON.stringify([
        {
          id: "privroom_restored",
          creator: alice.pubkey,
          name_encrypted: "n",
          members: [alice.pubkey],
          encrypted_keys: {},
          created_at: 2,
          sig: "s2",
        },
      ]),
    );
    h.mgr.startRestore();
    await h.mgr.getPrivateRooms(alice);
    assert.equal(h.mgr.readRooms().some((r) => r.id === "privroom_restored"), true);
    h.mgr.dispose();
  });

  it("keeps a River room as a read-only archive and migrates it from local members when the owner names it", async () => {
    const alice = makeIdentity(2);
    const bob = makeIdentity(3);
    const carol = makeIdentity(4);
    const roomId = "privroom_river_1";
    // River rooms were owned by a key derived from the creator's identity
    const owner = bytesToHex(ed25519.getPublicKey(blake3(new TextEncoder().encode(`radica/river-room-owner/v1:${roomId}`), { key: alice.secretKey })));
    const h = makeRoomHarness(alice);
    h.storageMap.set(
      "freenet_private_rooms",
      JSON.stringify([{ id: roomId, creator: alice.pubkey, name_encrypted: "", members: [alice.pubkey, bob.pubkey, carol.pubkey], moderators: [bob.pubkey], encrypted_keys: {}, created_at: 1, sig: "", river: { owner }, is_channel: true }]),
    );
    h.storageMap.set(`radica_river_archive_${roomId}`, JSON.stringify([{ id: "m1", room_id: roomId, sender: bob.pubkey, text: "hi from river", timestamp: 4000, sig: "" }]));
    const river = h.mgr.readRooms().find((r) => r.id === roomId)!;
    assert.equal(h.mgr.isRiverOwner(alice, { ...river, creator: "f".repeat(64) }), true); // from the River owner key alone
    assert.equal(h.mgr.isRiverOwner(bob, river), false);

    // the archive reads, nothing writes
    assert.deepEqual((await h.mgr.getPrivateRoomChatMessages(alice, river)).map((m) => m.text), ["hi from river"]);
    await assert.rejects(h.mgr.sendPrivateRoomChatMessage(alice, river, "late"), /retired/);
    await assert.rejects(h.mgr.inviteMemberToPrivateRoom(alice, roomId, bob.pubkey), /retired/);

    await assert.rejects(h.mgr.migrateRiverRoom(bob, roomId, "x"), /owner/);
    await assert.rejects(h.mgr.migrateRiverRoom(alice, roomId, " "), /name/);
    const native = await h.mgr.migrateRiverRoom(alice, roomId, "My Channel");
    assert.equal(native.river, undefined);
    assert.equal(native.is_channel, true);
    assert.equal(await h.mgr.getPrivateRoomDecryptedName(alice, native), "My Channel");
    assert.deepEqual([...native.members].sort(), [alice.pubkey, bob.pubkey, carol.pubkey].sort());
    assert.deepEqual(h.mgr.readRooms().find((r) => r.id === native.id)!.moderators, [bob.pubkey]);
    assert.equal(h.mgr.riverMigratedTo(river), native.id);
    assert.equal((await h.mgr.migrateRiverRoom(alice, roomId, "again")).id, native.id); // idempotent
    // a member's device sees the move from the owner's log entry alone
    h.storageMap.delete(`river_migrated_${roomId}`);
    assert.equal(h.mgr.riverMigratedTo(river), native.id);
    h.mgr.dispose();
  });
});
