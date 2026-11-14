import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAudioQueueState,
  enqueueInQueue,
  filterFreetunesReleases,
  formatAudioTime,
  nextQueueIndex,
  playInQueue,
  prevQueueIndex,
  trackWaveformBars,
  type AudioQueueTrack,
} from "../src/audioPlayer.ts";
import type { FtReleaseItem } from "../src/freetunes.ts";

const trackA: AudioQueueTrack = {
  releaseId: "relA",
  params: "00".repeat(48),
  trackIndex: 0,
  title: "Track A",
  artist: "Artist 1",
  releaseTitle: "Album 1",
  durationMs: 125000,
  chunks: ["c1"],
};

const trackB: AudioQueueTrack = {
  releaseId: "relB",
  params: "11".repeat(48),
  trackIndex: 0,
  title: "Track B",
  artist: "Artist 2",
  releaseTitle: "Album 2",
  durationMs: 180000,
  chunks: ["c2"],
};

test("audioPlayer: queue state, play, enqueue, next/prev navigation", () => {
  let s = createAudioQueueState();
  assert.equal(s.currentIndex, -1);

  s = playInQueue(s, trackA);
  assert.equal(s.queue.length, 1);
  assert.equal(s.currentIndex, 0);
  assert.equal(s.playing, true);

  s = enqueueInQueue(s, trackB);
  assert.equal(s.queue.length, 2);
  assert.equal(s.currentIndex, 0);

  // Deduplicate enqueue
  s = enqueueInQueue(s, trackB);
  assert.equal(s.queue.length, 2);

  assert.equal(nextQueueIndex(s), 1);
  assert.equal(prevQueueIndex({ ...s, currentIndex: 1 }), 0);

  // Jump to existing track on playInQueue
  s = playInQueue(s, trackB);
  assert.equal(s.currentIndex, 1);
  assert.equal(nextQueueIndex(s), -1);
});

test("audioPlayer: formatAudioTime and deterministic trackWaveformBars", () => {
  assert.equal(formatAudioTime(0), "0:00");
  assert.equal(formatAudioTime(65), "1:05");
  assert.equal(formatAudioTime(-4), "0:00");

  const bars1 = trackWaveformBars("seed1", 16);
  const bars2 = trackWaveformBars("seed1", 16);
  assert.equal(bars1.length, 16);
  assert.deepEqual(bars1, bars2);
  assert.ok(bars1.every((b) => b >= 25 && b <= 100));
});

test("audioPlayer: filterFreetunesReleases respects hiddenAuthors, following, and query", () => {
  const items: FtReleaseItem[] = [
    { id: "1", params: "a".repeat(96), owner: "a".repeat(64), title: "Ambient Waves", artist: "Alice", ts: 10 },
    { id: "2", params: "b".repeat(96), owner: "b".repeat(64), title: "Noise Rock", artist: "Bob", ts: 20 },
  ];

  const hidden = new Set(["b".repeat(64)]);
  const res1 = filterFreetunesReleases(items, { hiddenAuthors: hidden });
  assert.equal(res1.length, 1);
  assert.equal(res1[0].id, "1");

  const res2 = filterFreetunesReleases(items, { onlyFollowing: true, following: new Set(["b".repeat(64)]) });
  assert.equal(res2.length, 1);
  assert.equal(res2[0].id, "2");

  const res3 = filterFreetunesReleases(items, { query: "ambient" });
  assert.equal(res3.length, 1);
  assert.equal(res3[0].id, "1");
});
