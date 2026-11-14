import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterVideoReels,
  formatBlobVideoCaption,
  isVideoReelPost,
  parseBlobVideoRef,
  stepReelIndex,
} from "../src/reels.ts";
import type { Post } from "../src/types.ts";

const HASH1 = "a".repeat(64);
const HASH2 = "b".repeat(64);
const AUTH1 = "1".repeat(64);
const AUTH2 = "2".repeat(64);

function makePost(overrides: Partial<Post>): Post {
  return {
    id: "p1",
    author: AUTH1,
    category: "moment",
    caption: "",
    timestamp: 1000,
    sig: "sig",
    likes: {},
    comments: {},
    ...overrides,
  };
}

test("reels: formatBlobVideoCaption and parseBlobVideoRef round-trip", () => {
  const cap = formatBlobVideoCaption("Sunset timelapse", HASH1, 42);
  const parsed = parseBlobVideoRef(cap);
  assert.deepEqual(parsed, { hash: HASH1, durationSec: 42 });

  assert.equal(parseBlobVideoRef("plain post"), null);
});

test("reels: isVideoReelPost detects standard videoRef and blob video refs", () => {
  assert.equal(isVideoReelPost(makePost({ media_uri: `radica-video:${HASH1}|001122` })), false);
  const validKey = "c".repeat(64);
  assert.equal(isVideoReelPost(makePost({ media_uri: `radica-video:${HASH1}:${validKey}` })), true);
  assert.equal(isVideoReelPost(makePost({ caption: `Watch\n\nradica-video-blob:${HASH2}|90` })), true);
  assert.equal(isVideoReelPost(makePost({ caption: "Just text", media_uri: "radica-media:" + HASH1 })), false);
});

test("reels: filterVideoReels applies moderation (hidden, reported, own-post exception) and sorts newest first", () => {
  const posts: Post[] = [
    makePost({ id: "v1", author: AUTH1, timestamp: 100, caption: `radica-video-blob:${HASH1}` }),
    makePost({ id: "v2", author: AUTH2, timestamp: 300, caption: `radica-video-blob:${HASH2}` }),
    makePost({ id: "v3", author: AUTH2, timestamp: 200, caption: `radica-video-blob:${HASH1}` }),
  ];

  // Reported v2 is hidden for others, but v3 stays
  const res = filterVideoReels(posts, {
    myPubkey: AUTH1,
    reported: new Set([`${AUTH2}:v2`]),
  });
  assert.deepEqual(res.map((p) => p.id), ["v3", "v1"]);

  // Hidden author removes all of AUTH2
  const res2 = filterVideoReels(posts, {
    myPubkey: AUTH1,
    hiddenAuthors: new Set([AUTH2]),
  });
  assert.deepEqual(res2.map((p) => p.id), ["v1"]);
});

test("reels: stepReelIndex clamps safely", () => {
  assert.equal(stepReelIndex(0, -1, 3), 0);
  assert.equal(stepReelIndex(0, 1, 3), 1);
  assert.equal(stepReelIndex(2, 1, 3), 2);
  assert.equal(stepReelIndex(0, 1, 0), 0);
});
