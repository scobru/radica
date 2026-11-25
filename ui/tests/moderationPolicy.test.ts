import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HIDDEN_USERS_KEY,
  TRUSTED_BLOCKLISTS_KEY,
  buildModerationPolicy,
  isGlobalModerator,
  postMediaHash,
  readHiddenUsers,
  readTrustedCurators,
  reportRecipients,
  resolveModerationCurators,
  setHiddenUser,
  setTrustedCurator,
  submitContentReport,
  type ModerationLogSource,
  type StorageLike,
} from "../src/moderationPolicy.ts";
import { RADICA_MAINTAINER, type Post } from "../src/types.ts";

function memStore(initial: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

function makeLogs(overrides: Partial<{
  mods: Record<string, string[]>;
  blocked: Record<string, string[]>;
  reported: Record<string, string[]>;
  reportedMedia: Record<string, string[]>;
  hiddenComms: Record<string, Record<string, string>>;
  aiHolds: string[];
}> = {}): ModerationLogSource {
  return {
    modsOf: (c) => new Set(overrides.mods?.[c] ?? []),
    blockedBy: (c) => new Set(overrides.blocked?.[c] ?? []),
    reportedBy: (c) => new Map((overrides.reported?.[c] ?? []).map((k) => [k, {}])),
    reportedMediaBy: (c) => new Set(overrides.reportedMedia?.[c] ?? []),
    hiddenCommunitiesBy: (c) => new Map(Object.entries(overrides.hiddenComms?.[c] ?? {})),
    aiHeldTargets: () => new Set(overrides.aiHolds ?? []),
  };
}

const ME = "1".repeat(64);
const ALICE = "2".repeat(64);
const BOB = "3".repeat(64);
const MOD1 = "4".repeat(64);
const CURATOR2 = "5".repeat(64);
const HASH1 = "a".repeat(64);
const HASH2 = "b".repeat(64);
const HASH3 = "c".repeat(64);

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "p1",
    author: ALICE,
    category: "thought",
    caption: "hello",
    timestamp: 1000,
    sig: "sig",
    likes: {},
    comments: {},
    ...overrides,
  };
}

test("moderationPolicy: hidden users and trusted curators storage semantics", () => {
  const store = memStore();
  assert.deepEqual(readHiddenUsers(store), []);
  setHiddenUser(store, ALICE, true);
  assert.deepEqual(readHiddenUsers(store), [ALICE]);
  setHiddenUser(store, ALICE, false);
  assert.deepEqual(readHiddenUsers(store), []);
  assert.equal(store.getItem(HIDDEN_USERS_KEY), "[]");

  // Absent key defaults to RADICA_MAINTAINER
  assert.deepEqual(readTrustedCurators(store), [RADICA_MAINTAINER]);
  // Explicit empty list opts out without falling back
  store.setItem(TRUSTED_BLOCKLISTS_KEY, "[]");
  assert.deepEqual(readTrustedCurators(store), []);

  setTrustedCurator(store, CURATOR2, true);
  assert.deepEqual(readTrustedCurators(store), [CURATOR2]);
});

test("moderationPolicy: resolveModerationCurators expands global mods only when maintainer trusted", () => {
  const logs = makeLogs({ mods: { [RADICA_MAINTAINER]: [MOD1] } });
  const defaultStore = memStore();
  assert.deepEqual(resolveModerationCurators(defaultStore, logs), [RADICA_MAINTAINER, MOD1]);
  assert.equal(isGlobalModerator(MOD1, logs), true);
  assert.equal(isGlobalModerator(ALICE, logs), false);

  const optedOutStore = memStore({ [TRUSTED_BLOCKLISTS_KEY]: JSON.stringify([CURATOR2]) });
  assert.deepEqual(resolveModerationCurators(optedOutStore, logs), [CURATOR2]);
});

test("moderationPolicy: postMediaHash extracts image, video, and radica-video-blob hashes", () => {
  assert.equal(postMediaHash(makePost({ media_uri: `radica-media:${HASH1} radica-media:${HASH2}` })), HASH1);
  assert.equal(postMediaHash(makePost({ media_uri: `radica-video:${HASH2}:${"d".repeat(64)}` })), HASH2);
  assert.equal(postMediaHash(makePost({ caption: `Check this\n\nradica-video-blob:${HASH3}|30` })), HASH3);
  assert.equal(postMediaHash(makePost({ caption: "plain text" })), null);
});

test("moderationPolicy: buildModerationPolicy enforces Layer 2 across curators, global mods, AI holds, media, and author self-visibility", () => {
  const store = memStore({ [HIDDEN_USERS_KEY]: JSON.stringify([BOB]) });
  const logs = makeLogs({
    mods: { [RADICA_MAINTAINER]: [MOD1] },
    blocked: { [MOD1]: [ME], [CURATOR2]: [] },
    reported: {
      [ME]: [`${ALICE}:own-report`],
      [MOD1]: [`${ALICE}:mod-report`],
    },
    reportedMedia: { [RADICA_MAINTAINER]: [HASH2] },
    hiddenComms: { [MOD1]: { c_spam: "spam" } },
    aiHolds: [`${ALICE}:ai-held`],
  });

  const reportedWithMedia = makePost({ id: "mod-report", author: ALICE, media_uri: `radica-media:${HASH1}` });
  const policy = buildModerationPolicy({
    me: ME,
    store,
    logs,
    knownPosts: [reportedWithMedia],
  });

  // Author self-visibility: even if a moderator blocked ME, ME still sees ME's own posts and comments
  assert.equal(policy.isAuthorHidden(ME), false);
  assert.equal(policy.isPostHidden(makePost({ id: "ai-held", author: ME, media_uri: `radica-media:${HASH2}` })), null);
  assert.equal(policy.isCommentHidden({ id: "c1", author: ME }), false);
  assert.equal(policy.isReleaseHidden(ME, "rel1"), false);

  // Local hide & curator blocks
  assert.equal(policy.isPostHidden(makePost({ author: BOB })), "author");
  assert.equal(policy.isCommentHidden({ id: "c2", author: BOB }), true);

  // Own report, global mod report, and AI hold
  assert.equal(policy.isPostHidden(makePost({ id: "own-report", author: ALICE })), "reported");
  assert.equal(policy.isPostHidden(makePost({ id: "mod-report", author: ALICE })), "reported");
  assert.equal(policy.isPostHidden(makePost({ id: "ai-held", author: ALICE })), "reported");
  assert.equal(policy.isReleaseHidden(ALICE, "mod-report"), true);

  // Reported media (direct reportedMediaBy AND transitive from reportedWithMedia)
  assert.equal(policy.isPostHidden(makePost({ id: "reupload-1", author: ALICE, media_uri: `radica-media:${HASH1}` })), "reported");
  assert.equal(policy.isPostHidden(makePost({ id: "reupload-2", author: ALICE, caption: `radica-video-blob:${HASH2}` })), "reported");

  // Hidden community checked only when checkCommunity is true
  const commPost = makePost({ id: "ok", author: ALICE, community_id: "c_spam" });
  assert.equal(policy.isPostHidden(commPost), null);
  assert.equal(policy.isPostHidden(commPost, { checkCommunity: true }), "community");
});

test("moderationPolicy: reportRecipients and submitContentReport route notifications to global mods and community mods", async () => {
  const logs = makeLogs({ mods: { [RADICA_MAINTAINER]: [MOD1] } });
  const calls: Array<{ kind: string; args: unknown[] }> = [];
  const sink = {
    reportPost: async (...args: unknown[]) => {
      calls.push({ kind: "report", args });
    },
    addNotification: async (...args: unknown[]) => {
      calls.push({ kind: "notif", args });
    },
  };

  const res = await submitContentReport({
    author: ALICE,
    targetId: "p9",
    reason: "  spam link  ",
    mediaHash: HASH1,
    community: { slug: "tech", creator: BOB, moderators: [MOD1, BOB] },
    reporterPubkey: ME,
    authorDisplayName: "Alice",
    logs,
    sink,
  });

  assert.deepEqual(res.recipients, [RADICA_MAINTAINER, MOD1, BOB]);
  assert.deepEqual(
    reportRecipients({ globalMods: [MOD1], community: { creator: BOB, moderators: [MOD1] } }),
    [RADICA_MAINTAINER, MOD1, BOB],
  );
  assert.equal(calls[0].kind, "report");
  assert.deepEqual(calls[0].args, [ALICE, "p9", "spam link", HASH1, false]);
  assert.equal(calls.filter((c) => c.kind === "notif").length, 3);
});
