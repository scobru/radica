import test from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import {
  bytesToHex,
  decryptRoomKeyFromPeer,
  decryptWithSymmetricKey,
  encryptRoomKeyForPeer,
  formatPrivateRoomSignatureMessage,
  hexToBytes,
  personaName,
  verifySignature,
} from "../src/crypto.ts";
import {
  buildPrivateRoomInviteLink,
  createNativeRoomDescriptor,
  filterChannelMessages,
  parseRoomInviteParams,
} from "../src/nativeRooms.ts";
import type { ChatMessage, UserIdentity } from "../src/types.ts";

async function makeIdentity(seedByte: number): Promise<UserIdentity> {
  const secretKey = new Uint8Array(32).fill(seedByte);
  const pubkey = ed.etc.bytesToHex(await ed.getPublicKeyAsync(secretKey));
  return {
    pubkey,
    secretKey,
    type: "local",
    personaName: personaName(pubkey),
    encPub: pubkey,
    sign: async (msg: string) =>
      ed.etc.bytesToHex(await ed.signAsync(new TextEncoder().encode(msg), secretKey)),
  };
}

test("nativeRooms: createNativeRoomDescriptor builds a signed native E2EE room without River", async () => {
  const alice = await makeIdentity(1);
  const { room, roomKey } = await createNativeRoomDescriptor(alice, "Native Council", "privroom_test_1", alice.encPub);

  assert.equal(room.river, undefined, "Default private room must be native (!room.river)");
  assert.equal(room.creator, alice.pubkey);
  assert.ok(room.name_encrypted.startsWith("sym:"), "Room name must be AES-GCM encrypted");
  assert.ok(room.encrypted_keys[alice.pubkey], "Creator must receive ECIES-encrypted room key");
  assert.equal(roomKey.length, 32);

  const validSig = await verifySignature(
    formatPrivateRoomSignatureMessage(room.id, alice.pubkey, room.created_at),
    room.sig,
    alice.pubkey
  );
  assert.equal(validSig, true, "Native room descriptor must carry a valid Ed25519 signature");

  const unwrapped = await decryptRoomKeyFromPeer(alice.secretKey, alice.encPub, room.encrypted_keys[alice.pubkey]);
  assert.ok(unwrapped instanceof Uint8Array);
  assert.equal(bytesToHex(unwrapped), bytesToHex(roomKey));
  assert.equal(await decryptWithSymmetricKey(unwrapped, room.name_encrypted), "Native Council");
});

test("nativeRooms: buildPrivateRoomInviteLink + parseRoomInviteParams roundtrip lr & lr_key for linked channels", async () => {
  const alice = await makeIdentity(2);
  const bob = await makeIdentity(3);

  const disc = await createNativeRoomDescriptor(alice, "Radica News · Comments", "privroom_disc_1", alice.encPub);
  const chan = await createNativeRoomDescriptor(alice, "Radica News", "privroom_chan_1", alice.encPub, {
    is_channel: true,
    linked_room_id: disc.room.id,
  });

  const url = buildPrivateRoomInviteLink(chan.room, chan.roomKey, "Radica News", disc.roomKey);
  const params = new URLSearchParams(url.split("#")[1] || "");
  const parsed = parseRoomInviteParams(params);

  assert.ok(parsed);
  assert.equal(parsed.roomId, chan.room.id);
  assert.equal(parsed.name, "Radica News");
  assert.equal(parsed.creator, alice.pubkey);
  assert.equal(parsed.is_channel, true);
  assert.equal(parsed.linked_room_id, disc.room.id);
  assert.equal(parsed.linked_key_hex, bytesToHex(disc.roomKey));
  assert.equal(parsed.river, undefined);

  // Simulate recipient Bob validating both symmetric keys and sealing them for self
  const chanKeyBytes = hexToBytes(parsed.keyHex);
  const discKeyBytes = hexToBytes(parsed.linked_key_hex!);
  assert.equal(chanKeyBytes.length, 32);
  assert.equal(discKeyBytes.length, 32);
  const bobSealedChan = await encryptRoomKeyForPeer(bob.secretKey, bob.encPub, chanKeyBytes);
  const bobSealedDisc = await encryptRoomKeyForPeer(bob.secretKey, bob.encPub, discKeyBytes);
  const bobChanKey = await decryptRoomKeyFromPeer(bob.secretKey, bob.encPub, bobSealedChan);
  const bobDiscKey = await decryptRoomKeyFromPeer(bob.secretKey, bob.encPub, bobSealedDisc);
  assert.equal(bytesToHex(bobChanKey!), bytesToHex(chan.roomKey));
  assert.equal(bytesToHex(bobDiscKey!), bytesToHex(disc.roomKey));
});

test("nativeRooms: filterChannelMessages enforces creator/moderator posting in native channels and preserves all in groups", () => {
  const creator = "aa".repeat(32);
  const moderator = "bb".repeat(32);
  const subscriber = "cc".repeat(32);

  const msgs: ChatMessage[] = [
    { id: "m1", sender: creator, text: "Official post", timestamp: 100, sig: "s1" },
    { id: "m2", sender: moderator, text: "Mod announcement", timestamp: 200, sig: "s2" },
    { id: "m3", sender: subscriber, text: "Unauthorized noise", timestamp: 300, sig: "s3" },
  ];

  const filtered = filterChannelMessages({ is_channel: true, creator, moderators: [moderator] }, msgs);
  assert.deepEqual(
    filtered.map((m) => m.id),
    ["m1", "m2"]
  );

  const groupMessages = filterChannelMessages({ is_channel: false, creator, moderators: [moderator] }, msgs);
  assert.deepEqual(
    groupMessages.map((m) => m.id),
    ["m1", "m2", "m3"]
  );
});
