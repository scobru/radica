import test from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import type { ChatMessage, UserIdentity } from "../src/types.ts";
import {
  addSecretChatPeer,
  removeSecretChatPeer,
  burnSecretMessage,
  editSecretMessage,
  readBurnedSecretIds,
  readSecretChat,
  secretChatPeers,
  sendSecretChatMessage,
  type SecretChatTransport,
} from "../src/secretChatTransport.ts";

/** Published encryption keys (profiles): persona -> key. */
const encPubs = new Map<string, string>();

/** A local identity, or a Viso one: a persona key with a different app key that signs and decrypts. */
async function person(viso = false): Promise<UserIdentity> {
  const secretKey = crypto.getRandomValues(new Uint8Array(32));
  const encPub = ed.etc.bytesToHex(await ed.getPublicKeyAsync(secretKey));
  const pubkey = viso ? ed.etc.bytesToHex(await ed.getPublicKeyAsync(crypto.getRandomValues(new Uint8Array(32)))) : encPub;
  encPubs.set(pubkey, encPub);
  return { pubkey, secretKey, encPub, sign: async () => "sig" };
}

/** One device: its own page storage; `deliver` writes into the devices whose inbox is named. */
function device(network: Map<string, SecretChatTransport>, blocked: string[] = [], wire: object[] = []): SecretChatTransport {
  const map = new Map<string, string>();
  const t: SecretChatTransport = {
    store: { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) },
    blockedBy: () => new Set(blocked),
    visibleChat: (roomId) => JSON.parse(map.get(`freenet_chat_${roomId}`) || "[]"),
    encPubOf: async (k) => encPubs.get(k) ?? k,
    deliver: async (entry: any, inboxes) => {
      wire.push(entry); // what a public inbox log would hold
      for (const who of inboxes) {
        const other = network.get(who);
        if (!other || other === t) continue;
        if (entry.type === "chat_edit") {
          const key = `freenet_chat_${entry.roomId}`;
          const list: ChatMessage[] = JSON.parse(other.store.getItem(key) || "[]");
          const m = list.find((x) => x.id === entry.messageId);
          if (m) m.text = entry.text;
          other.store.setItem(key, JSON.stringify(list));
          continue;
        }
        if (entry.type !== "chat") continue;
        const key = `freenet_chat_${entry.message.room_id}`;
        other.store.setItem(key, JSON.stringify([...JSON.parse(other.store.getItem(key) || "[]"), entry.message]));
      }
    },
  };
  return t;
}

test("secretChatTransport: Alice sends, Bob reads it, and Alice still reads her own message", async () => {
  const [alice, bob] = [await person(), await person()];
  const network = new Map<string, SecretChatTransport>();
  const [ta, tb] = [device(network), device(network)];
  network.set(alice.pubkey, ta);
  network.set(bob.pubkey, tb);

  const sent = await sendSecretChatMessage(ta, alice, bob.pubkey, "ciao Bob", 0);
  assert.equal(sent.text, "ciao Bob");
  assert.ok(JSON.parse(ta.store.getItem(`freenet_chat_${sent.room_id}`)!)[0].text.startsWith("secret:v2:"), "stored sealed");

  assert.deepEqual((await readSecretChat(tb, bob, alice.pubkey)).map((m) => m.text), ["ciao Bob"]);
  assert.deepEqual((await readSecretChat(ta, alice, bob.pubkey)).map((m) => m.text), ["ciao Bob"]);
  assert.deepEqual(secretChatPeers(ta, alice.pubkey), [bob.pubkey]);
});

test("secretChatTransport: Viso users (app key, not persona key) read and are read", async () => {
  // one sender per pair: Secret Chat sessions live in the one global page storage, which the two test devices share
  for (const visoSends of [true, false]) {
    const [from, to] = visoSends ? [await person(true), await person()] : [await person(), await person(true)];
    const network = new Map<string, SecretChatTransport>();
    const [tf, tt] = [device(network), device(network)];
    network.set(from.pubkey, tf);
    network.set(to.pubkey, tt);

    await sendSecretChatMessage(tf, from, to.pubkey, "ciao", 0);
    assert.deepEqual((await readSecretChat(tt, to, from.pubkey)).map((m) => m.text), ["ciao"]);
    assert.deepEqual((await readSecretChat(tf, from, to.pubkey)).map((m) => m.text), ["ciao"]);
  }
});

test("secretChatTransport: expired and burned messages are gone; blocked people are not added", async () => {
  const [alice, bob] = [await person(), await person()];
  const ta = device(new Map());
  const roomKey = `freenet_chat_secret_${[alice.pubkey, bob.pubkey].sort().join("_")}`;
  const old: ChatMessage = { id: "old", room_id: "r", sender: bob.pubkey, text: "x", timestamp: 1, sig: "", burn_at: Date.now() - 1 };
  const keep: ChatMessage = { id: "keep", room_id: "r", sender: bob.pubkey, text: "plain", timestamp: 2, sig: "" };
  ta.store.setItem(roomKey, JSON.stringify([old, keep]));
  assert.deepEqual((await readSecretChat(ta, alice, bob.pubkey)).map((m) => m.id), ["keep"]);
  assert.deepEqual(JSON.parse(ta.store.getItem(roomKey)!).map((m: ChatMessage) => m.id), ["keep"]);

  burnSecretMessage(ta, roomKey.slice("freenet_chat_".length), "keep", alice.pubkey, bob.pubkey);
  assert.deepEqual(JSON.parse(ta.store.getItem(roomKey)!), []);

  const tBlocking = device(new Map(), [bob.pubkey]);
  addSecretChatPeer(tBlocking, alice.pubkey, bob.pubkey);
  assert.deepEqual(secretChatPeers(tBlocking, alice.pubkey), []);
});

test("secretChatTransport: a removed Secret Chat stays removed until a newer message", async () => {
  const [alice, bob] = [await person(), await person()];
  const ta = device(new Map());
  addSecretChatPeer(ta, alice.pubkey, bob.pubkey, 1000);
  removeSecretChatPeer(ta, alice.pubkey, bob.pubkey);
  addSecretChatPeer(ta, alice.pubkey, bob.pubkey, 1000); // the old inbox entry, replayed by a refresh
  assert.deepEqual(secretChatPeers(ta, alice.pubkey), []);
  addSecretChatPeer(ta, alice.pubkey, bob.pubkey, Date.now() + 1000); // a message sent after the removal
  assert.deepEqual(secretChatPeers(ta, alice.pubkey), [bob.pubkey]);
});

test("secretChatTransport: a timed message sent with the placeholder's id replaces it instead of showing twice", async () => {
  const [alice, bob] = [await person(), await person()];
  const network = new Map<string, SecretChatTransport>();
  const [ta, tb] = [device(network), device(network)];
  network.set(alice.pubkey, ta);
  network.set(bob.pubkey, tb);
  const id = "scmsg_placeholder_1";
  const roomKey = `freenet_chat_${(await sendSecretChatMessage(ta, alice, bob.pubkey, "first", 3600)).room_id}`;
  // the screen's placeholder, as main.ts stores it before sending
  ta.store.setItem(roomKey, JSON.stringify([...JSON.parse(ta.store.getItem(roomKey)!), { id, text: "ciao", sender: alice.pubkey }]));
  await sendSecretChatMessage(ta, alice, bob.pubkey, "ciao", 3600, undefined, id);
  const stored = JSON.parse(ta.store.getItem(roomKey)!);
  assert.equal(stored.filter((m: { id: string }) => m.id === id).length, 1);
  assert.ok(stored.find((m: { id: string }) => m.id === id).text.startsWith("secret:v2:"), "the placeholder's plain text is gone");
  assert.deepEqual((await readSecretChat(ta, alice, bob.pubkey)).map((m) => m.text), ["first", "ciao"]);
});

test("secretChatTransport: an edit reaches the peer sealed, and nothing readable goes onto the wire", async () => {
  const [alice, bob] = [await person(), await person()];
  const network = new Map<string, SecretChatTransport>();
  const wire: object[] = [];
  const [ta, tb] = [device(network, [], wire), device(network)];
  network.set(alice.pubkey, ta);
  network.set(bob.pubkey, tb);

  const sent = await sendSecretChatMessage(ta, alice, bob.pubkey, "ciao Bob", 0);
  await editSecretMessage(ta, alice, bob.pubkey, sent.id, "ciao Bob, anzi arrivederci");

  assert.deepEqual((await readSecretChat(tb, bob, alice.pubkey)).map((m) => m.text), ["ciao Bob, anzi arrivederci"], "the peer sees the edit");
  assert.deepEqual((await readSecretChat(ta, alice, bob.pubkey)).map((m) => m.text), ["ciao Bob, anzi arrivederci"], "so do I");
  assert.ok((await readSecretChat(ta, alice, bob.pubkey))[0].edited_at, "marked as edited");
  const edit = wire.find((e: any) => e.type === "chat_edit") as any;
  assert.ok(edit.text.startsWith("secret:v2:"), "sealed");
  assert.ok(!JSON.stringify(wire).includes("arrivederci"), "the new text never leaves in the clear");
});

test("secretChatTransport: only my own message can be edited", async () => {
  const [alice, bob] = [await person(), await person()];
  const network = new Map<string, SecretChatTransport>();
  const [ta, tb] = [device(network), device(network)];
  network.set(alice.pubkey, ta);
  network.set(bob.pubkey, tb);
  const sent = await sendSecretChatMessage(ta, alice, bob.pubkey, "ciao Bob", 0);
  await assert.rejects(() => editSecretMessage(tb, bob, alice.pubkey, sent.id, "forged"), /own message/);
});

test("secretChatTransport: a v2 message opens once, then reads from the kept plain text, and a burn forgets it", async () => {
  const [alice, bob] = [await person(), await person()];
  const network = new Map<string, SecretChatTransport>();
  const [ta, tb] = [device(network), device(network)];
  network.set(alice.pubkey, ta);
  network.set(bob.pubkey, tb);

  const sent = await sendSecretChatMessage(ta, alice, bob.pubkey, "once", 0);
  assert.deepEqual((await readSecretChat(tb, bob, alice.pubkey)).map((m) => m.text), ["once"]);
  // the message key is used up: a second read comes from the plain text Bob kept
  assert.deepEqual((await readSecretChat(tb, bob, alice.pubkey)).map((m) => m.text), ["once"]);
  assert.match(tb.store.getItem(`radica_secret_plain_${bob.pubkey}`) ?? "", /once/);

  burnSecretMessage(tb, sent.room_id, sent.id, bob.pubkey, alice.pubkey);
  assert.doesNotMatch(tb.store.getItem(`radica_secret_plain_${bob.pubkey}`) ?? "", /once/);
});

test("secretChatTransport: overlapping reads across a ratchet turn keep the session in step", async () => {
  const [alice, bob] = [await person(), await person()];
  const network = new Map<string, SecretChatTransport>();
  const [ta, tb] = [device(network), device(network)];
  network.set(alice.pubkey, ta);
  network.set(bob.pubkey, tb);

  await sendSecretChatMessage(ta, alice, bob.pubkey, "a1", 0);
  await Promise.all([readSecretChat(tb, bob, alice.pubkey), readSecretChat(tb, bob, alice.pubkey)]);
  await sendSecretChatMessage(tb, bob, alice.pubkey, "b1", 0);
  await Promise.all([readSecretChat(ta, alice, bob.pubkey), readSecretChat(ta, alice, bob.pubkey)]);
  await sendSecretChatMessage(ta, alice, bob.pubkey, "a2", 0);
  assert.deepEqual((await readSecretChat(tb, bob, alice.pubkey)).map((m) => m.text), ["a1", "b1", "a2"]);
});

test("secretChatTransport: a read before the room is back from the network keeps the plain texts (reload)", async () => {
  const [alice, bob] = [await person(), await person()];
  const network = new Map<string, SecretChatTransport>();
  const [ta, tb] = [device(network), device(network)];
  network.set(alice.pubkey, ta);
  network.set(bob.pubkey, tb);

  const sent = await sendSecretChatMessage(ta, alice, bob.pubkey, "dopo il reload", 0);
  assert.deepEqual((await readSecretChat(tb, bob, alice.pubkey)).map((m) => m.text), ["dopo il reload"]);

  // reload: the room's message list is page storage and comes back from the network later; the plain texts are durable
  const roomKey = `freenet_chat_${sent.room_id}`;
  const [inA, inB] = [ta.store.getItem(roomKey)!, tb.store.getItem(roomKey)!];
  ta.store.setItem(roomKey, "[]");
  tb.store.setItem(roomKey, "[]");
  await readSecretChat(ta, alice, bob.pubkey);
  await readSecretChat(tb, bob, alice.pubkey);
  ta.store.setItem(roomKey, inA);
  tb.store.setItem(roomKey, inB);

  assert.deepEqual((await readSecretChat(tb, bob, alice.pubkey)).map((m) => m.text), ["dopo il reload"]);
  assert.deepEqual((await readSecretChat(ta, alice, bob.pubkey)).map((m) => m.text), ["dopo il reload"]);
});

test("secretChatTransport: a timed message's plain text is forgotten once its time is up", async () => {
  const [alice, bob] = [await person(), await person()];
  const network = new Map<string, SecretChatTransport>();
  const [ta, tb] = [device(network), device(network)];
  network.set(alice.pubkey, ta);
  network.set(bob.pubkey, tb);

  await sendSecretChatMessage(ta, alice, bob.pubkey, "brucia", 1);
  assert.deepEqual((await readSecretChat(tb, bob, alice.pubkey)).map((m) => m.text), ["brucia"]);
  const realNow = Date.now;
  Date.now = () => realNow() + 2000;
  try {
    await readSecretChat(tb, bob, alice.pubkey);
  } finally {
    Date.now = realNow;
  }
  assert.doesNotMatch(tb.store.getItem(`radica_secret_plain_${bob.pubkey}`) ?? "", /brucia/);
});

test("secretChatTransport: recipient gets full disappearing countdown on open even after transit delay and burns locally", async () => {
  const [alice, bob] = [await person(), await person()];
  const network = new Map<string, SecretChatTransport>();
  const wire: object[] = [];
  const [ta, tb] = [device(network, [], wire), device(network, [], wire)];
  network.set(alice.pubkey, ta);
  network.set(bob.pubkey, tb);

  const sent = await sendSecretChatMessage(ta, alice, bob.pubkey, "delayed hello", 10);
  const realNow = Date.now;
  let bobOpenTime = realNow() + 15_000; // 15s later (> 10s sender TTL!)
  Date.now = () => bobOpenTime;
  try {
    const msgs = await readSecretChat(tb, bob, alice.pubkey);
    assert.equal(msgs.length, 1, "unopened message must not pre-burn before recipient decrypts it");
    assert.equal(msgs[0].text, "delayed hello");
    assert.equal(msgs[0].ttl_seconds, 10);
    assert.equal(msgs[0].burn_started, true);
    assert.ok(msgs[0].burn_at && msgs[0].burn_at >= bobOpenTime + 9_000, "burn_at starts from recipient open time");

    // 5s after opening: still visible with ~5s left
    bobOpenTime += 5_000;
    const mid = await readSecretChat(tb, bob, alice.pubkey);
    assert.equal(mid.length, 1);
    assert.equal(mid[0].burn_at, msgs[0].burn_at);

    // After full 10s on recipient side: expires cleanly
    bobOpenTime += 6_000;
    const expired = await readSecretChat(tb, bob, alice.pubkey);
    assert.equal(expired.length, 0);
  } finally {
    Date.now = realNow;
  }

  // Auto-burn (localOnly) removes locally & records burned id without emitting chat_burn to peer
  const sent2 = await sendSecretChatMessage(ta, alice, bob.pubkey, "second msg", 10);
  wire.length = 0;
  burnSecretMessage(ta, sent.room_id, sent2.id, alice.pubkey, bob.pubkey, { localOnly: true });
  assert.equal(wire.some((w: any) => w.type === "chat_burn"), false, "auto-burn stays local");
  assert.ok(readBurnedSecretIds(ta.store, alice.pubkey).has(sent2.id));
  assert.equal((await readSecretChat(ta, alice, bob.pubkey)).some((m) => m.id === sent2.id), false);

  // Manual delete on either side still emits chat_burn to peer
  burnSecretMessage(tb, sent.room_id, sent2.id, bob.pubkey, alice.pubkey);
  assert.ok(wire.some((w: any) => w.type === "chat_burn"), "manual delete informs peer");
});
