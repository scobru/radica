import test from "node:test";
import assert from "node:assert/strict";
import { encodeChatMediaToken } from "../src/chatMedia.ts";
import {
  createWalkieQueue,
  nextSequentialHash,
  readWalkieEnabled,
  WALKIE_STORAGE_KEY,
  writeWalkieEnabled,
} from "../src/walkieTalkie.ts";

function voiceMsg(id: string, sender: string, hashChar: string, caption = "") {
  const token = encodeChatMediaToken({
    kind: "voice",
    mime: "audio/webm",
    hash: hashChar.repeat(64),
    keyHex: "f".repeat(64),
    durationSec: 4.5,
  });
  return { id, sender, text: caption ? `${caption}\n${token}` : token };
}

test("walkieTalkie: readWalkieEnabled and writeWalkieEnabled persist preference safely", () => {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };

  assert.equal(readWalkieEnabled(store), false);
  writeWalkieEnabled(store, true);
  assert.equal(map.get(WALKIE_STORAGE_KEY), "1");
  assert.equal(readWalkieEnabled(store), true);
  writeWalkieEnabled(store, false);
  assert.equal(map.get(WALKIE_STORAGE_KEY), "0");
  assert.equal(readWalkieEnabled(store), false);
});

test("walkieTalkie: seedRoom skips backlog and ingestMessages enqueues new incoming voice notes only", () => {
  const me = "a".repeat(64);
  const peer = "b".repeat(64);
  const blocked = "c".repeat(64);
  const q = createWalkieQueue(true);

  const oldMsg = voiceMsg("m0", peer, "1");
  q.seedRoom("room-1", [oldMsg]);
  assert.equal(q.pendingCount(), 0);

  const imgToken = encodeChatMediaToken({
    kind: "img",
    mime: "image/webp",
    hash: "2".repeat(64),
    keyHex: "e".repeat(64),
    width: 300,
    height: 300,
  });
  const vnoteToken = encodeChatMediaToken({
    kind: "vnote",
    mime: "video/mp4",
    hash: "3".repeat(64),
    keyHex: "e".repeat(64),
    durationSec: 8,
  });

  const added = q.ingestMessages(
    "room-1",
    [
      oldMsg, // already seen via seedRoom
      voiceMsg("m1", me, "4"), // own message skipped
      voiceMsg("m2", blocked, "5"), // blocked author skipped
      { id: "m3", sender: peer, text: imgToken }, // non-voice skipped
      { id: "m4", sender: peer, text: vnoteToken }, // vnote skipped (voice only)
      voiceMsg("m5", peer, "6", "Status check"), // valid incoming voice #1
      voiceMsg("m6", peer, "6"), // duplicate hash skipped
      voiceMsg("m7", peer, "7"), // valid incoming voice #2
    ],
    me,
    (pk) => pk === blocked
  );

  assert.equal(added.length, 2);
  assert.equal(q.pendingCount(), 2);
  assert.equal(q.peekQueue()[0].title, "Status check");

  // Dequeue and play in order
  const first = q.dequeueNext();
  assert.ok(first);
  assert.equal(first!.hash, "6".repeat(64));
  assert.equal(q.currentHash, "6".repeat(64));
  assert.equal(q.pendingCount(), 1);

  q.markFinished(first!.hash);
  assert.equal(q.currentHash, null);

  const second = q.dequeueNext();
  assert.ok(second);
  assert.equal(second!.hash, "7".repeat(64));

  // Re-ingesting played hash must not replay
  const again = q.ingestMessages("room-1", [voiceMsg("m8", peer, "6")], me);
  assert.equal(again.length, 0);

  // Disabling clears queue & ignores subsequent ingests
  q.setEnabled(false);
  assert.equal(q.pendingCount(), 0);
  assert.equal(q.ingestMessages("room-1", [voiceMsg("m9", peer, "8")], me).length, 0);
});

test("walkieTalkie: nextSequentialHash steps cleanly through ordered voice clips", () => {
  const hashes = ["a".repeat(64), "b".repeat(64), "c".repeat(64)];
  assert.equal(nextSequentialHash(hashes, "A".repeat(64)), "b".repeat(64));
  assert.equal(nextSequentialHash(hashes, "b".repeat(64)), "c".repeat(64));
  assert.equal(nextSequentialHash(hashes, "c".repeat(64)), null);
  assert.equal(nextSequentialHash(hashes, "d".repeat(64)), null);
  assert.equal(nextSequentialHash([], "a".repeat(64)), null);
});
