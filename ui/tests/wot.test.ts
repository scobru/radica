import { test } from "node:test";
import assert from "node:assert/strict";
import { WebOfTrust } from "../src/wot.ts";

test("wot: classifies tiers correctly (me, roots/direct, extended, stranger)", () => {
  const me = "a".repeat(64);
  const alice = "b".repeat(64);
  const bob = "c".repeat(64);
  const charlie = "d".repeat(64);
  const stranger = "e".repeat(64);

  const followingOf = (pk: string) => {
    if (pk === alice) return [bob]; // alice follows bob
    if (pk === bob) return [charlie]; // bob follows charlie
    return [];
  };

  const wot = new WebOfTrust(me, [alice], [], followingOf);

  assert.equal(wot.trustTier(me), 1);
  assert.equal(wot.trustTier(alice), 1); // direct root
  assert.equal(wot.trustTier(bob), 2); // friend of friend
  assert.equal(wot.trustTier(charlie), 0); // 3rd degree: outside immediate tier 2
  assert.equal(wot.trustTier(stranger), 0); // outsider
  assert.ok(wot.isTrusted(alice));
  assert.ok(wot.isTrusted(bob));
  assert.ok(!wot.isTrusted(stranger));
});

test("wot: stranger dislikes carry 0 penalty and cannot penalize a post (Sybil resistance)", () => {
  const me = "a".repeat(64);
  const friend = "b".repeat(64);
  const bots = Array.from({ length: 50 }, (_, i) => i.toString(16).padStart(64, "0"));

  const wot = new WebOfTrust(me, [friend], []);
  const post = { id: "post_test", author: "author_pk" };

  // 50 anonymous bots dislike the post
  const result = wot.evaluatePost(post, [], bots);

  assert.equal(result.trustedDislikers.length, 0);
  assert.equal(result.wotScore, 0);
  assert.equal(result.isPenalized, false);
  assert.equal(result.penaltyReason, null);
});

test("wot: direct contact dislike penalizes a post unless trusted likes outweigh it", () => {
  const me = "a".repeat(64);
  const alice = "b".repeat(64);
  const bob = "c".repeat(64);

  const wot = new WebOfTrust(me, [alice, bob], []);
  const post = { id: "post_1", author: "author_pk" };

  // Alice (trusted contact) dislikes the post
  const res1 = wot.evaluatePost(post, [], [alice]);
  assert.ok(res1.isPenalized);
  assert.equal(res1.trustedDislikers.length, 1);
  assert.equal(res1.trustedDislikers[0], alice);
  assert.equal(res1.penaltyReason, "Disliked by a contact in your Web-of-Trust");

  // Bob (also trusted) and Me like the post, counterbalancing Alice
  const res2 = wot.evaluatePost(post, [bob, me], [alice]);
  assert.equal(res2.isPenalized, false); // Positive score (4) > Negative score (3)
  assert.equal(res2.trustedLikers.length, 2);
});

test("wot: community moderators act as trusted authorities for community posts", () => {
  const me = "a".repeat(64);
  const commMod = "m".repeat(64);
  const author = "x".repeat(64);

  // Even if user does not directly follow the community mod
  const wot = new WebOfTrust(me, [], []);
  const post = { id: "post_comm", author, community_id: "c_radica" };

  const res = wot.evaluatePost(post, [], [commMod], [commMod]);
  assert.ok(res.isPenalized);
  assert.ok(res.trustedDislikers.includes(commMod));
});

test("wot: trustBadge returns proper badge metadata for tiers", () => {
  const me = "a".repeat(64);
  const alice = "b".repeat(64);
  const bob = "c".repeat(64);
  const stranger = "e".repeat(64);

  const wot = new WebOfTrust(me, [alice], [], (pk) => (pk === alice ? [bob] : []));

  const meBadge = wot.trustBadge(me);
  assert.equal(meBadge.tier, 1);
  assert.equal(meBadge.isTrusted, true);
  assert.equal(meBadge.icon, "🌿");
  assert.equal(meBadge.label, "Rooted");

  const aliceBadge = wot.trustBadge(alice);
  assert.equal(aliceBadge.tier, 1);
  assert.equal(aliceBadge.isTrusted, true);
  assert.equal(aliceBadge.icon, "🌿");

  const bobBadge = wot.trustBadge(bob);
  assert.equal(bobBadge.tier, 2);
  assert.equal(bobBadge.isTrusted, true);
  assert.equal(bobBadge.icon, "🌱");
  assert.equal(bobBadge.label, "Trusted");

  const strangerBadge = wot.trustBadge(stranger);
  assert.equal(strangerBadge.tier, 0);
  assert.equal(strangerBadge.isTrusted, false);
  assert.equal(strangerBadge.icon, "✨");
  assert.equal(strangerBadge.label, "New");
});

test("wot: recognizes verified supporters with elevated trust tier", () => {
  const me = "a".repeat(64);
  const stranger = "e".repeat(64);
  const supporter = "f".repeat(64);

  const wot = new WebOfTrust(me, [], [], () => [], [supporter]);

  assert.equal(wot.trustTier(supporter), 2);
  assert.equal(wot.isTrusted(supporter), true);

  const badge = wot.trustBadge(supporter);
  assert.equal(badge.tier, 2);
  assert.equal(badge.isTrusted, true);
  assert.equal(badge.label, "Supporter");
  assert.equal(badge.icon, "✨");

  // a supporter I also follow, and myself as a supporter, still show it
  const both = new WebOfTrust(me, [supporter], [], () => [], [supporter, me]);
  assert.equal(both.trustBadge(supporter).label, "Supporter");
  assert.equal(both.trustBadge(supporter).tier, 1);
  assert.equal(both.trustBadge(me).label, "Supporter");

  // Stranger remains untrusted Tier 0
  assert.equal(wot.trustTier(stranger), 0);
  assert.equal(wot.isTrusted(stranger), false);
});



test("I am vouched for only by someone else I trust, never by being in my own Tier 1", () => {
  const wot = new WebOfTrust("me", ["friend"]);
  assert.equal(wot.isTrusted("me"), true); // why isTrusted(me) cannot gate newcomer limits
  assert.equal(wot.vouches("me", []), false);
  assert.equal(wot.vouches("me", ["me"]), false);
  assert.equal(wot.vouches("me", ["stranger"]), false);
  assert.equal(wot.vouches("me", ["stranger", "friend"]), true);
});

test("wot: a verified GhostKey makes a stranger trusted, with its own badge", () => {
  const me = "a".repeat(64);
  const ghost = "9".repeat(64);
  const wot = new WebOfTrust(me, [], [], () => [], [], [ghost]);
  assert.equal(wot.trustTier(ghost), 2);
  assert.equal(wot.isTrusted(ghost), true);
  assert.equal(wot.trustBadge(ghost).label, "GhostKey");
  // a donor badge wins over the GhostKey one
  assert.equal(new WebOfTrust(me, [], [], () => [], [ghost], [ghost]).trustBadge(ghost).label, "Supporter");
});

test("wot: a verified Viso PoH human makes a stranger trusted Tier 2 with a Verified Human badge", () => {
  const me = "a".repeat(64);
  const human = "8".repeat(64);
  const wot = new WebOfTrust(me, [], [], () => [], [], [], [human]);
  assert.equal(wot.trustTier(human), 2);
  assert.equal(wot.isTrusted(human), true);
  assert.equal(wot.likeWeight(human), 1);
  assert.equal(wot.dislikeWeight(human), 1.5);
  const badge = wot.trustBadge(human);
  assert.equal(badge.label, "Verified Human");
  assert.equal(badge.icon, "🛡️");
  assert.equal(badge.badgeClass, "badge-trusted-tier2 badge-poh-human");
  // Supporter & GhostKey badges take precedence over Verified Human
  assert.equal(new WebOfTrust(me, [], [], () => [], [], [human], [human]).trustBadge(human).label, "GhostKey");
  assert.equal(new WebOfTrust(me, [], [], () => [], [human], [], [human]).trustBadge(human).label, "Supporter");
});
