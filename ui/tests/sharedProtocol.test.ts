import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3.js";
import {
  anteCborEncode,
  anteChallengeBytes,
  anteSigningBytes,
  bytesToHex,
  connectMessage as sharedConnectMessage,
  lp as sharedLp,
  logEntryMessage,
  logEntryMessage2,
  receiptMessageText,
  roomJoinProofMessage,
} from "../../shared/protocol.js";
import { foldBlocklist as sharedFoldBlocklist, foldPostEdits as sharedFoldPostEdits, foldRoom as sharedFoldRoom } from "../../shared/roomFold.js";
import {
  FEED_POW_BITS,
  formatLogEntryMessage,
  formatProfileSignatureMessage,
  logMsg2,
  lp,
  powBits,
  profileMsg4,
} from "../src/crypto.ts";
import { receiptMessage } from "../src/supporter.ts";
import { connectMessage as whoiamConnectMessage } from "../src/whoiam.ts";
import { bitsOf, challengeBytes, decodeProof, makeProof } from "../src/ante.ts";
import { foldBlocklist, foldPostEdits, foldRoom, roomJoinProofs } from "../src/logfold.ts";
import { computeRoomJoinProof } from "../src/privateRooms.ts";
import { AI_REPORTERS, RADICA_MAINTAINER } from "../src/types.ts";
import { computeRoomJoinProof as attesterComputeRoomJoinProof } from "../../attester/src/roomCrypto.js";
import { foldRoomState as attesterFoldRoomState, roomJoinProofs as attesterRoomJoinProofs } from "../../attester/src/moderator.js";

describe("shared protocol parity (UI <-> Attester)", () => {
  it("matches wire formatting across shared/protocol and UI crypto/supporter/whoiam/ante modules", async () => {
    const enc = new TextEncoder();
    assert.equal(lp("tag", ["a", 42, true]), sharedLp("tag", ["a", 42, true]));
    assert.equal(FEED_POW_BITS, 12);
    assert.equal(powBits("hello"), powBits("hello"));

    const body = JSON.stringify({ type: "chat", text: "ciao" });
    const app = "/v1/contract/web/test/";
    assert.equal(
      formatLogEntryMessage("communities", "alice", "1", 123, body),
      logEntryMessage("communities", "/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/", "alice", "1", 123, body).replace(
        bytesToHex(enc.encode(`radica/communities|/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/`)),
        bytesToHex(enc.encode(`radica/communities|/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/`)),
      ),
    );
    const bodyHash = bytesToHex(blake3(enc.encode(body)));
    const fromUiV2 = logMsg2("communities", "alice", "1", 123, body, 7);
    assert.ok(fromUiV2.includes(bodyHash));
    assert.equal(
      logEntryMessage2("communities", app, "alice", "1", 123, bodyHash, 7).startsWith("radica/log/v2|"),
      true,
    );

    assert.match(formatProfileSignatureMessage("a", "n", "b", "u", "e", 1), /^radica\/profile\/v3:/);
    assert.match(profileMsg4("a", { display_name: "n", bio: "b", avatar_url: "u", enc_pub: "e", updated_at: 1 }), /^radica\/profile\/v4\|/);

    const r = { donor_pk: "AB".repeat(32), tier: "root" as const, chain: "eth" as const, tx_hash: "0xFF", ts: 999 };
    assert.equal(new TextDecoder().decode(receiptMessage(r)), receiptMessageText(r));

    const pk = new Uint8Array(32).fill(5);
    assert.deepEqual(whoiamConnectMessage(pk, "https://example.com", "chal", 55), sharedConnectMessage(pk, "https://example.com", "chal", 55));

    assert.deepEqual(challengeBytes("purpose", pk), anteChallengeBytes("purpose", pk));
    const sk = new Uint8Array(32).fill(9);
    const vk = await ed.getPublicKeyAsync(sk);
    const proof = await makeProof(sk, "purpose", 1, 100);
    const decoded = decodeProof(proof);
    assert.equal(bitsOf(anteChallengeBytes("purpose", vk), 1) >= 0, true);
    assert.ok(anteSigningBytes(vk, "purpose", 1, 100).length > 32);
    assert.deepEqual(proof, anteCborEncode({
      identity_vk: Array.from(vk),
      purpose: "purpose",
      nonce: 1,
      ts: 100,
      signature: Array.from(decoded.signature),
    }));
  });

  it("matches computeRoomJoinProof between UI and Attester", () => {
    const key = new Uint8Array(32).fill(3);
    const pk = "AbCd".repeat(16);
    assert.equal(roomJoinProofMessage("privroom_1", pk), `radica/room-join/v1|privroom_1|${pk.toLowerCase()}`);
    assert.equal(
      computeRoomJoinProof(key, "privroom_1", pk),
      attesterComputeRoomJoinProof(key, "privroom_1", pk),
    );
  });
});

describe("shared roomFold parity (UI <-> Attester)", () => {
  it("folds room_avatar, room_pin, room_gardener, and lowercased encrypted_keys identically", () => {
    const owner = RADICA_MAINTAINER;
    const mod = "a".repeat(64);
    const upperMember = "B".repeat(64);
    const roomId = "privroom_parity_1";
    const entries = [
      {
        author: owner,
        id: "1",
        ts: 10,
        sig: "s1",
        body: JSON.stringify({
          type: "private_room",
          room: {
            id: roomId,
            creator: owner,
            name_encrypted: "sym:1:2",
            members: [owner, mod],
            moderators: [mod],
            encrypted_keys: { [owner]: "e2e:owner", [upperMember]: "e2e:member" },
            created_at: 10,
            sig: "rsig",
          },
        }),
      },
      {
        author: mod,
        id: "2",
        ts: 20,
        sig: "s2",
        body: JSON.stringify({ type: "room_avatar", roomId, avatar_url: "radica-media:abc" }),
      },
      {
        author: mod,
        id: "3",
        ts: 30,
        sig: "s3",
        body: JSON.stringify({ type: "room_pin", roomId, messageId: "msg_42" }),
      },
      {
        author: owner,
        id: "4",
        ts: 40,
        sig: "s4",
        body: JSON.stringify({
          type: "room_gardener",
          roomId,
          on: true,
          target: AI_REPORTERS[0],
          encrypted_key: "e2e:gardener",
          inviter_enc_pub: owner,
        }),
      },
    ];

    const uiRoom = foldRoom(entries, roomId);
    const attesterRoom = attesterFoldRoomState(entries, roomId, AI_REPORTERS[0], owner);
    assert.deepEqual(uiRoom, attesterRoom);
    assert.equal(attesterRoom?.avatar_url, "radica-media:abc");
    assert.equal(attesterRoom?.pinned_message_id, "msg_42");
    assert.equal(attesterRoom?.encrypted_keys["b".repeat(64)], "e2e:member");
    assert.equal(attesterRoom?.encrypted_keys[AI_REPORTERS[0]], "e2e:gardener");

    const uiProofs = roomJoinProofs(entries, roomId);
    const attProofs = attesterRoomJoinProofs(entries, roomId, owner);
    assert.deepEqual(uiProofs, attProofs);
    assert.deepEqual(sharedFoldRoom(entries, roomId, { maintainerPk: owner, aiReporters: AI_REPORTERS }), uiRoom);
  });

  it("shares foldPostEdits and foldBlocklist semantics", () => {
    const entries = [
      { author: "alice", id: "1", ts: 10, sig: "a", body: JSON.stringify({ type: "edit", post: "p1", caption: "v1" }) },
      { author: "alice", id: "2", ts: 20, sig: "b", body: JSON.stringify({ type: "edit", post: "p1", caption: "v2" }) },
    ];
    assert.equal(foldPostEdits(entries).get("alice:p1")?.caption, "v2");
    assert.deepEqual(foldPostEdits(entries), sharedFoldPostEdits(entries));

    const modLogs = [
      { author: "alice", id: "1", ts: 1, sig: "a", body: JSON.stringify({ type: "block", target: "bob", on: true }) },
      { author: "alice", id: "2", ts: 2, sig: "b", body: JSON.stringify({ type: "block", target: "Bob", on: false }) },
    ];
    assert.equal(foldBlocklist(modLogs, "alice").size, 0);
    assert.deepEqual(foldBlocklist(modLogs, "alice"), sharedFoldBlocklist(modLogs, "alice"));
  });
});
