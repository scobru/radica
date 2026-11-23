import test from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import { acceptMeshPacket, meshPacket, MESH_MAX_BYTES } from "../src/lanMesh.ts";
import { bytesToHex, formatChatMessageSignatureMessage } from "../src/crypto.ts";
import { getSecretRoomId } from "../src/secretChat.ts";
import type { ChatMessage } from "../src/types.ts";

async function person() {
  const sk = ed.utils.randomPrivateKey();
  return { sk, pk: bytesToHex(await ed.getPublicKeyAsync(sk)) };
}

async function signed(from: { sk: Uint8Array; pk: string }, to: string, room_id: string, text = "secret:v2:abc"): Promise<ChatMessage> {
  const m = { id: "scmsg_1", room_id, sender: from.pk, recipient: to, text, timestamp: 1700000000000 };
  const sig = bytesToHex(await ed.signAsync(new TextEncoder().encode(formatChatMessageSignatureMessage(m.id, m.room_id, m.sender, m.recipient, m.text, m.timestamp)), from.sk));
  return { ...m, sig, is_secret: true };
}

const none = () => false;

test("lanMesh: a signed message to me in our own conversation is accepted and marked via_lan", async () => {
  const [alice, bob] = [await person(), await person()];
  const secret = await signed(alice, bob.pk, getSecretRoomId(alice.pk, bob.pk));
  const got = await acceptMeshPacket(meshPacket(secret), bob.pk, none);
  assert.equal(got?.id, "scmsg_1");
  assert.equal(got?.via_lan, true);
  const dm = await signed(alice, bob.pk, [alice.pk, bob.pk].sort().join(":"), "e2e:x");
  assert.ok(await acceptMeshPacket(meshPacket(dm), bob.pk, none));
});

test("lanMesh: rejects tampered, misaddressed, foreign-room, blocked and oversized packets", async () => {
  const [alice, bob, carol] = [await person(), await person(), await person()];
  const ok = await signed(alice, bob.pk, getSecretRoomId(alice.pk, bob.pk));
  assert.equal(await acceptMeshPacket(meshPacket({ ...ok, text: "secret:v2:changed" }), bob.pk, none), null);
  assert.equal(await acceptMeshPacket(meshPacket(ok), carol.pk, none), null);
  assert.equal(await acceptMeshPacket(meshPacket(ok), bob.pk, (pk) => pk === alice.pk), null);
  // validly signed, but filed into Bob's conversation with Carol
  const foreign = await signed(alice, bob.pk, getSecretRoomId(carol.pk, bob.pk));
  assert.equal(await acceptMeshPacket(meshPacket(foreign), bob.pk, none), null);
  assert.equal(await acceptMeshPacket("x".repeat(MESH_MAX_BYTES + 1), bob.pk, none), null);
  assert.equal(await acceptMeshPacket("{not json", bob.pk, none), null);
  assert.equal(await acceptMeshPacket(meshPacket(ok), "", none), null);
});
