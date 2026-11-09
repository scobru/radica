import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ContractKey } from "@freenetorg/freenet-stdlib";
import { loadRiver } from "../src/river.ts";
import { anchorOf, keyOf } from "../src/riverPointer.ts";
import { RiverRooms, roomOwnerSk, vkOf } from "../src/riverRooms.ts";
import { bytesToHex } from "../src/crypto.ts";

// One network every peer shares: a contract is its state, and an update runs River's own apply, as the node does.
async function world() {
  const call = await loadRiver(readFileSync(new URL("../src/wasm/river.wasm", import.meta.url)));
  const net = new Map<string, Uint8Array>();
  const owners = new Map<string, string>(); // contract key -> owner vk, to apply deltas
  const fake = {
    getRaw: async (k: ContractKey) => net.get(k.encode()) ?? null,
    putRaw: async (k: ContractKey, _c: Uint8Array, _p: Uint8Array, s: Uint8Array) => void net.set(k.encode(), s),
    updateRaw: async (k: ContractKey, d: Uint8Array) => {
      const owner = owners.get(k.encode())!;
      net.set(k.encode(), Uint8Array.from(Buffer.from(call({ op: "apply", owner_vk: owner, state: bytesToHex(net.get(k.encode())!), delta: bytesToHex(d) }).state, "hex")));
    },
  };
  const peer = () => {
    const store = new Map<string, string>();
    const rooms = new RiverRooms(call, fake, async () => anchorOf(null), async () => new Uint8Array(), {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    });
    // the fake needs each room's owner: learn it when a room is created
    const create = rooms.create.bind(rooms);
    rooms.create = async (...a) => {
      const owner = await create(...a);
      for (const [k, s] of net) if (!owners.get(k) && s) owners.set(k, owner);
      return owner;
    };
    return rooms;
  };
  return { call, peer, net };
}

const sk = (n: number) => new Uint8Array(32).fill(n);

test("river rooms: create, invite, join by first message, kick; outsiders read nothing", async () => {
  const { peer } = await world();
  const [ann, bob, eve] = [sk(1), sk(2), sk(3)];
  const [A, B, E] = [peer(), peer(), peer()];

  const owner = await A.create(ann, "privroom_1", "SOS", "Ann");
  assert.equal(owner, vkOf(roomOwnerSk(ann, "privroom_1"))); // derived again anywhere from Ann's key
  await A.say(roomOwnerSk(ann, "privroom_1"), owner, "hello"); // the owner key speaks for the owner

  const join = await A.invite(roomOwnerSk(ann, "privroom_1"), owner, vkOf(bob));
  await B.say(bob, owner, "hi", join, "Bob");
  await B.say(bob, owner, "again"); // now a member: no invitation needed

  const view = B.read((await B.load(owner, true))!, owner, bob);
  assert.equal(view.name, "SOS");
  assert.deepEqual(view.messages.map((m) => m.text), ["hello", "hi", "again"]);

  // River's actions and moderators through the service: Bob replies and reacts, Ann makes Bob a moderator
  const hello = view.messages.find((m) => m.text === "hello")!.id;
  await B.say(bob, owner, "re: hello", undefined, undefined, hello);
  await B.act(bob, owner, "react", hello, { emoji: "🌱" });
  await A.setDeputies(roomOwnerSk(ann, "privroom_1"), owner, [vkOf(bob)]);
  const v2 = A.read((await A.load(owner, true))!, owner, roomOwnerSk(ann, "privroom_1"));
  assert.equal(v2.messages.find((m) => m.text === "re: hello")!.reply_to, hello);
  assert.deepEqual(v2.messages.find((m) => m.id === hello)!.reactions["🌱"], [vkOf(bob)]);
  assert.ok(v2.members.find((m) => m.vk === vkOf(bob))!.deputy);
  await A.setDeputies(roomOwnerSk(ann, "privroom_1"), owner, []);

  // Bob's identity moves to another client (River's Export ID / Import ID): still one Bob, writing as before
  const token = await B.exportIdentity(bob, owner, join, "Bob");
  const moved = peer().importIdentity(token);
  assert.equal(moved.sk, bytesToHex(bob));
  const B2 = peer();
  await B2.say(Uint8Array.from(Buffer.from(moved.sk, "hex")), owner, "from my other client", moved.join);
  const v3 = A.read((await A.load(owner, true))!, owner, roomOwnerSk(ann, "privroom_1"));
  assert.equal(v3.members.filter((m) => m.vk === vkOf(bob)).length, 1);
  assert.ok(v3.messages.some((m) => m.text === "from my other client" && m.author === vkOf(bob)));

  await assert.rejects(E.say(eve, owner, "spam"), /no room secret/);
  assert.equal(E.read((await E.load(owner, true))!, owner, eve).messages.length, 0);

  await A.kick(roomOwnerSk(ann, "privroom_1"), owner, vkOf(bob));
  await A.say(roomOwnerSk(ann, "privroom_1"), owner, "bob is gone");
  await assert.rejects(B.say(bob, owner, "still here?"));
  B.changed(owner); // what the room's subscription does when it changes
  const after = B.read((await B.load(owner))!, owner, bob).messages;
  assert.ok(!after.some((m) => m.text === "bob is gone")); // River drops his copy of the secret with him: he reads nothing now
});

test("river rooms: in-room DMs reach the other side, as in River's own UI", async () => {
  const { peer } = await world();
  const [ann, bob] = [sk(1), sk(2)];
  const [A, B] = [peer(), peer()];
  const [annOwner, annVk, bobVk] = [roomOwnerSk(ann, "privroom_2"), vkOf(roomOwnerSk(ann, "privroom_2")), vkOf(bob)];
  const owner = await A.create(ann, "privroom_2", "SOS", "Ann");
  assert.equal(owner, annVk);
  const join = await A.invite(annOwner, owner, bobVk);
  await B.say(bob, owner, "hi", join, "Bob");

  await A.dm(annOwner, owner, bobVk, "from Ann");
  await B.dm(bob, owner, annVk, "from Bob");
  assert.deepEqual(B.read((await B.load(owner, true))!, owner, bob).dms.map((d) => [d.sender, d.text]), [[annVk, "from Ann"]]);
  assert.deepEqual(A.read((await A.load(owner, true))!, owner, annOwner).dms.map((d) => [d.sender, d.text]), [[bobVk, "from Bob"]]);
});


test("river rooms: unread counting and baseline tracking for group messages", async () => {
  const { peer } = await world();
  const [ann, bob] = [sk(1), sk(2)];
  const [A, B] = [peer(), peer()];
  const [annOwner, bobVk] = [roomOwnerSk(ann, "privroom_unread"), vkOf(bob)];
  const owner = await A.create(ann, "privroom_unread", "Group", "Ann");
  const join = await A.invite(annOwner, owner, bobVk);

  // Bob sends 2 messages
  await B.say(bob, owner, "msg 1", join, "Bob");
  await B.say(bob, owner, "msg 2");

  const v = A.read((await A.load(owner, true))!, owner, annOwner);
  assert.equal(v.messages.length, 2);

  // Baseline at 0: 2 unread
  const unread0 = v.messages.filter((m) => m.author !== vkOf(annOwner) && m.time_ms > 0);
  assert.equal(unread0.length, 2);

  // Mark read up to msg 1 time: 1 unread
  const lastSeen = v.messages[0].time_ms;
  const unreadAfterSeen = v.messages.filter((m) => m.author !== vkOf(annOwner) && m.time_ms > lastSeen);
  assert.equal(unreadAfterSeen.length, 1);
  assert.equal(unreadAfterSeen[0].text, "msg 2");
});

test("river rooms: a room left under River's previous contract is found and carried forward", async () => {
  const { call, peer, net } = await world();
  const [A, B] = [peer(), peer()];
  const ann = sk(5);
  const owner = await A.create(ann, "privroom_old", "Before v11", "Ann");
  // move the room to where the previous generation keyed it, as if nobody wrote to it since River re-keyed
  const params = Uint8Array.from(Buffer.from(call({ op: "params", owner_vk: owner }).params, "hex"));
  const previous = call({ op: "legacy" }).code_hashes[0];
  const [current] = [...net.keys()];
  const state = net.get(current)!;
  net.delete(current);
  net.set(keyOf(previous, params).encode(), state);

  const found = await B.load(owner, true);
  assert.equal(found, bytesToHex(state));
  assert.equal(B.read(found!, owner, roomOwnerSk(ann, "privroom_old")).name, "Before v11");
  assert.deepEqual(net.get(current), state, "carried forward under the current key");
});
