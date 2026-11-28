import { test } from "node:test";
import assert from "node:assert/strict";
import {
  guestPreferKeys,
  resolveFeedScope,
  shouldHideUnjoinedCommunityPost,
  shouldStartInGuestMode,
} from "../src/guestMode.ts";
import {
  HIDDEN_USERS_KEY,
  buildModerationPolicy,
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

function makeLogs(
  overrides: Partial<{
    mods: Record<string, string[]>;
    blocked: Record<string, string[]>;
    reported: Record<string, string[]>;
    reportedMedia: Record<string, string[]>;
    hiddenComms: Record<string, Record<string, string>>;
    aiHolds: string[];
  }> = {},
): ModerationLogSource {
  return {
    modsOf: (c) => new Set(overrides.mods?.[c] ?? []),
    blockedBy: (c) => new Set(overrides.blocked?.[c] ?? []),
    reportedBy: (c) => new Map((overrides.reported?.[c] ?? []).map((k) => [k, {}])),
    reportedMediaBy: (c) => new Set(overrides.reportedMedia?.[c] ?? []),
    hiddenCommunitiesBy: (c) => new Map(Object.entries(overrides.hiddenComms?.[c] ?? {})),
    aiHeldTargets: () => new Set(overrides.aiHolds ?? []),
  };
}

const ALICE = "1".repeat(64);
const BOB = "2".repeat(64);
const CAROL = "3".repeat(64);
const DAVE = "4".repeat(64);
const MOD1 = "5".repeat(64);
const BAD_HASH = "a".repeat(64);

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "p1",
    author: ALICE,
    category: "thought",
    caption: "hello public network",
    timestamp: 1000,
    sig: "sig",
    likes: {},
    comments: {},
    ...overrides,
  };
}

test("guestMode: shouldStartInGuestMode enables guest mode only without identity and outside Messenger", () => {
  assert.equal(shouldStartInGuestMode(false, false), true);
  assert.equal(shouldStartInGuestMode(true, false), false);
  assert.equal(shouldStartInGuestMode(false, true), false);
  assert.equal(shouldStartInGuestMode(true, true), false);
});

test("guestMode: resolveFeedScope preserves scopes when signed in and restricts guests to public scopes", () => {
  for (const scope of ["explore", "following", "myposts", "saved", "media"] as const) {
    assert.equal(resolveFeedScope(scope, true, false), scope);
    assert.equal(resolveFeedScope(scope, true, true), scope);
  }

  assert.equal(resolveFeedScope("explore", false), "explore");
  assert.equal(resolveFeedScope("media", false), "media");
  assert.equal(resolveFeedScope("following", false), "explore");
  assert.equal(resolveFeedScope("saved", false), "explore");
  assert.equal(resolveFeedScope("myposts", false, false), "explore");
  assert.equal(resolveFeedScope("myposts", false, true), "myposts");
});

test("guestMode: guestPreferKeys puts maintainer first, deduplicates, and strips blanks/whitespace", () => {
  const keys = guestPreferKeys(
    `  ${RADICA_MAINTAINER}  `,
    ["", "   ", ALICE, RADICA_MAINTAINER, ` ${BOB} `],
    [BOB, " ", CAROL, ALICE, ""],
  );
  assert.deepEqual(keys, [RADICA_MAINTAINER, ALICE, BOB, CAROL]);

  assert.deepEqual(guestPreferKeys("  ", ["", "  "], ["\t"]), []);
});

test("guestMode: shouldHideUnjoinedCommunityPost keeps public community posts visible for guests", () => {
  // Signed-out guests see public community posts (e.g. r/radica) in Explore
  assert.equal(shouldHideUnjoinedCommunityPost(false, false, true, false, false), false);
  assert.equal(shouldHideUnjoinedCommunityPost(false, true, true, false, false), false);

  // Signed-in users hide unjoined community posts on general Explore unless authored by them
  assert.equal(shouldHideUnjoinedCommunityPost(true, false, true, false, false), true);
  assert.equal(shouldHideUnjoinedCommunityPost(true, false, true, true, false), false);
  assert.equal(shouldHideUnjoinedCommunityPost(true, false, true, false, true), false);
  assert.equal(shouldHideUnjoinedCommunityPost(true, true, true, false, false), false);
  assert.equal(shouldHideUnjoinedCommunityPost(true, false, false, false, false), false);
});

test("guestMode: Layer 2 moderation policy (me === '') drops blocked, AI-held, locally hidden, and hidden community posts", () => {
  const store = memStore({ [HIDDEN_USERS_KEY]: JSON.stringify([CAROL]) });
  const logs = makeLogs({
    mods: { [RADICA_MAINTAINER]: [MOD1] },
    blocked: {
      [RADICA_MAINTAINER]: [BOB],
      [MOD1]: [DAVE],
    },
    reported: {
      [MOD1]: [`${ALICE}:mod-removed`],
    },
    reportedMedia: { [RADICA_MAINTAINER]: [BAD_HASH] },
    hiddenComms: { [RADICA_MAINTAINER]: { c_spam: "spam" } },
    aiHolds: [`${ALICE}:ai-held`],
  });

  const policy = buildModerationPolicy({
    me: "",
    store,
    logs,
  });

  assert.equal(policy.me, "");
  assert.equal(policy.globalMod, false);

  // Curator & global mod blocked authors dropped
  assert.equal(policy.isAuthorHidden(BOB), true);
  assert.equal(policy.isAuthorHidden(DAVE), true);
  assert.equal(policy.isPostHidden(makePost({ author: BOB })), "author");
  assert.equal(policy.isPostHidden(makePost({ author: DAVE })), "author");

  // Locally hidden user (radica_hidden_users) dropped even without an identity
  assert.equal(policy.isAuthorHidden(CAROL), true);
  assert.equal(policy.isPostHidden(makePost({ author: CAROL })), "author");
  assert.equal(policy.isCommentHidden({ id: "c1", author: CAROL }), true);

  // AI holds & curator-reported targets/media dropped
  assert.equal(policy.isPostHidden(makePost({ id: "ai-held", author: ALICE })), "reported");
  assert.equal(policy.isPostHidden(makePost({ id: "mod-removed", author: ALICE })), "reported");
  assert.equal(policy.isPostHidden(makePost({ id: "bad-media", author: ALICE, media_uri: `radica-media:${BAD_HASH}` })), "reported");

  // Hidden community dropped when checkCommunity is enabled
  const hiddenCommPost = makePost({ id: "in-hidden-comm", author: ALICE, community_id: "c_spam" });
  assert.equal(policy.isPostHidden(hiddenCommPost), null);
  assert.equal(policy.isPostHidden(hiddenCommPost, { checkCommunity: true }), "community");

  // Normal public posts (including public communities like r/radica) stay visible
  assert.equal(policy.isAuthorHidden(ALICE), false);
  assert.equal(policy.isPostHidden(makePost({ id: "ok-public", author: ALICE, community_id: "r_radica" }), { checkCommunity: true }), null);
  assert.equal(policy.isCommentHidden({ id: "c-ok", author: ALICE }), false);
});
