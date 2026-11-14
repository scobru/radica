import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTreeGraph,
  computeNetworkTreeStage,
  renderTreeInspectorHtml,
  renderTreeSvg,
  type TreePeerInput,
} from "../src/treeGraph.ts";
import type { Community, Post } from "../src/types.ts";

const ME = "aa".repeat(32);
const ALICE = "bb".repeat(32);
const BOB = "cc".repeat(32);
const STRANGER = "dd".repeat(32);
const NOW = 1_760_000_000_000;
const HOUR = 3_600_000;

function makePost(overrides: Partial<Post> & { id: string; author: string }): Post {
  return {
    category: "thought",
    caption: "Hello Freenet",
    timestamp: NOW - 2 * HOUR,
    sig: "sig",
    likes: {},
    comments: {},
    ...overrides,
  };
}

const COMM: Community = {
  id: "c_freenet",
  name: "Freenet Builders",
  slug: "freenet",
  description: "Decentralized apps and WASM contracts",
  created_at: NOW - 200 * HOUR,
  creator: ALICE,
  moderators: [ALICE],
  members: [ME, ALICE, BOB],
  deleted_post_ids: [],
  sig: "sig",
};

const PEERS: TreePeerInput[] = [
  { pubkey: ME, name: "You", trustTier: 1, postCount: 1, commentCount: 1, linfaTotal: 25, fresh: true, joinedAt: NOW - 150 * HOUR },
  { pubkey: ALICE, name: "Alice", trustTier: 1, postCount: 2, commentCount: 2, linfaTotal: 80, fresh: true, joinedAt: NOW - 180 * HOUR, supporter: true },
  { pubkey: BOB, name: "Bob", trustTier: 2, postCount: 1, commentCount: 1, linfaTotal: 18, fresh: false, joinedAt: NOW - 80 * HOUR },
  { pubkey: STRANGER, name: "<script>alert(1)</script>", trustTier: 0, postCount: 1, commentCount: 0, linfaTotal: 2, fresh: false, joinedAt: NOW - 20 * HOUR },
];

const POSTS: Post[] = [
  makePost({
    id: "p1",
    author: ALICE,
    community_id: "c_freenet",
    caption: "Launching Living Tree on Radica #radica",
    timestamp: NOW - 100 * HOUR,
    likes: {
      [ME]: { liked: true, ts: NOW - 90 * HOUR, sig: "s" },
      [BOB]: { liked: true, ts: NOW - 85 * HOUR, sig: "s" },
    },
    comments: {
      [`${ME}:c1`]: { id: "c1", post_id: "p1", author: ME, text: "Looks alive!", timestamp: NOW - 80 * HOUR, sig: "s" },
      [`${BOB}:c2`]: { id: "c2", post_id: "p1", author: BOB, text: "Nice leaves", timestamp: NOW - 5 * HOUR, sig: "s" },
    },
  }),
  makePost({
    id: "p2",
    author: BOB,
    category: "moment",
    caption: "Sunset moment",
    timestamp: NOW - 40 * HOUR,
    comments: {
      [`${ALICE}:c3`]: { id: "c3", post_id: "p2", author: ALICE, text: "<b>Bold reply</b>", timestamp: NOW - 2 * HOUR, sig: "s" },
    },
  }),
  makePost({
    id: "p3",
    author: STRANGER,
    category: "event",
    caption: "Newcomer meetup",
    timestamp: NOW - 10 * HOUR,
  }),
];

test("treeGraph: network stage evolves monotonically as users, communities, posts, and comments grow", () => {
  const s0 = computeNetworkTreeStage(0, 0, 0, 0);
  const s1 = computeNetworkTreeStage(3, 2, 2, 1);
  const s2 = computeNetworkTreeStage(25, 80, 120, 6);
  const s3 = computeNetworkTreeStage(120, 400, 900, 25);

  assert.equal(s0.name, "Seed");
  assert.ok(s1.index >= s0.index);
  assert.ok(s2.index > s1.index);
  assert.ok(s3.index >= s2.index);
  assert.ok(s3.trunkHeight > s0.trunkHeight);
  assert.ok(s3.trunkGirth > s0.trunkGirth);
  assert.equal(s3.name, "Ancient Yggdrasil");
});

test("treeGraph: builds boughs, post branches, comment leaves, and tiered underground roots", () => {
  const model = buildTreeGraph({
    posts: POSTS,
    communities: [COMM],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    now: NOW,
  });

  assert.equal(model.stats.users, 4);
  assert.equal(model.stats.posts, 3);
  assert.equal(model.stats.comments, 3);
  assert.equal(model.stats.likes, 2);

  const p1 = model.posts.find((p) => p.id === "p1");
  assert.ok(p1, "p1 branch present");
  assert.equal(p1.leaves.length, 2);
  assert.equal(p1.hasBloom, true, "p1 has >= 3 likes+comments so it blooms");

  const meRoot = model.roots.find((r) => r.pubkey === ME);
  const aliceRoot = model.roots.find((r) => r.pubkey === ALICE);
  const bobRoot = model.roots.find((r) => r.pubkey === BOB);
  const strangerRoot = model.roots.find((r) => r.pubkey === STRANGER);

  assert.ok(meRoot?.isMe);
  assert.equal(aliceRoot?.trustTier, 1);
  assert.equal(bobRoot?.trustTier, 2);
  assert.equal(strangerRoot?.trustTier, 0);
  assert.ok((aliceRoot?.y ?? 0) < (bobRoot?.y ?? 0) + 100);
});

test("treeGraph: timeProgress filters historical state and shrinks the tree", () => {
  const early = buildTreeGraph({
    posts: POSTS,
    communities: [COMM],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    timeProgress: 0.1,
    now: NOW,
  });
  const mid = buildTreeGraph({
    posts: POSTS,
    communities: [COMM],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    timeProgress: 0.5,
    now: NOW,
  });
  const full = buildTreeGraph({
    posts: POSTS,
    communities: [COMM],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    timeProgress: 1,
    now: NOW,
  });

  assert.ok(early.stats.posts <= mid.stats.posts);
  assert.ok(mid.stats.posts <= full.stats.posts);
  assert.ok(early.stage.trunkHeight < full.stage.trunkHeight, "trunk height grows with timeProgress");
  assert.ok(early.stage.trunkGirth < full.stage.trunkGirth, "trunk girth expands with timeProgress");
});

test("treeGraph: genesis community from years ago does not distort recent post timeline, and same-ts posts sprout progressively", () => {
  const ancientComm: Community = {
    ...COMM,
    id: "c_ancient",
    created_at: 1710000000000, // March 2024 genesis date
  };

  const sameTsPosts: Post[] = [
    makePost({ id: "st1", author: ALICE, timestamp: NOW - 5000, caption: "Post one" }),
    makePost({ id: "st2", author: ALICE, timestamp: NOW - 5000, caption: "Post two" }),
    makePost({ id: "st3", author: ALICE, timestamp: NOW - 5000, caption: "Post three" }),
    makePost({ id: "st4", author: ALICE, timestamp: NOW - 5000, caption: "Post four" }),
  ];

  const t01 = buildTreeGraph({
    posts: sameTsPosts,
    communities: [ancientComm],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    timeProgress: 0.05,
    now: NOW,
  });
  const t04 = buildTreeGraph({
    posts: sameTsPosts,
    communities: [ancientComm],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    timeProgress: 0.40,
    now: NOW,
  });
  const t08 = buildTreeGraph({
    posts: sameTsPosts,
    communities: [ancientComm],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    timeProgress: 0.80,
    now: NOW,
  });
  const t10 = buildTreeGraph({
    posts: sameTsPosts,
    communities: [ancientComm],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    timeProgress: 1.0,
    now: NOW,
  });

  // Timeline must not be anchored in 2024 (should be around NOW, within recent hours/days)
  assert.ok(t01.minTs >= NOW - 24 * 3600_000, "minTs reflects recent activity, not ancient 2024 genesis date");
  // Posts sprout progressively across growth
  assert.equal(t01.posts.length, 0, "at seed start, posts have not sprouted yet");
  assert.ok(t04.posts.length >= 1, "at 40%, earlier posts have sprouted");
  assert.ok(t08.posts.length >= t04.posts.length, "at 80%, more posts have sprouted");
  assert.equal(t10.posts.length, 4, "at 100%, all posts are fully visible");
});

test("treeGraph: scope, communityFilter, searchQuery, and sapLinks work as expected", () => {
  const followingOnly = buildTreeGraph({
    posts: POSTS,
    communities: [COMM],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    scope: "following",
    now: NOW,
  });
  assert.equal(followingOnly.stats.users, 2, "only ME and ALICE (tier 1)");
  assert.equal(followingOnly.stats.posts, 1, "only ALICE's post");

  const commOnly = buildTreeGraph({
    posts: POSTS,
    communities: [COMM],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    communityFilter: "c_freenet",
    now: NOW,
  });
  assert.equal(commOnly.stats.posts, 1);
  assert.equal(commOnly.posts[0].id, "p1");

  const searched = buildTreeGraph({
    posts: POSTS,
    communities: [COMM],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    searchQuery: "sunset",
    focusAuthor: ALICE,
    now: NOW,
  });
  assert.equal(searched.posts.find((p) => p.id === "p2")?.matched, true);
  assert.equal(searched.posts.find((p) => p.id === "p1")?.matched, false);
  assert.ok(searched.sapLinks.length >= 2, "focusAuthor traces sap to ALICE's post and comment");
});

test("treeGraph: renderTreeSvg emits finite coordinates, escapes HTML, and respects view modes", () => {
  const selection = { type: "post" as const, postId: "p1", author: ALICE };
  const model = buildTreeGraph({
    posts: POSTS,
    communities: [COMM],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    selection,
    now: NOW,
  });

  for (const mode of ["full", "canopy", "roots"] as const) {
    const svg = renderTreeSvg(model, { mode, selection, zoom: 1.5, panX: 12, panY: -8 });
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
    assert.ok(!svg.includes("<script>"), "untrusted script tag escaped");
    assert.ok(!svg.includes("<b>Bold reply</b>"), "reply HTML escaped");
    if (mode === "canopy") assert.doesNotMatch(svg, /class="tree-roots-layer"/);
    if (mode === "roots") assert.doesNotMatch(svg, /class="tree-crown-layer"/);
    if (mode === "full") assert.match(svg, /tree-sap-filament/);
  }
});

test("treeGraph: renderTreeInspectorHtml renders overview and node details safely", () => {
  const model = buildTreeGraph({
    posts: POSTS,
    communities: [COMM],
    peers: PEERS,
    myPubkey: ME,
    myName: "You",
    now: NOW,
  });
  const getName = (pk: string) => PEERS.find((p) => p.pubkey === pk)?.name ?? pk.slice(0, 6);

  const overview = renderTreeInspectorHtml(model, null, POSTS, [COMM], getName);
  assert.match(overview, /Network Organism/);
  assert.match(overview, /data-tree-open-milestones/);

  const postInsp = renderTreeInspectorHtml(model, { type: "post", postId: "p1", author: ALICE }, POSTS, [COMM], getName);
  assert.match(postInsp, /data-tree-open-post="p1"/);
  assert.match(postInsp, /Launching Living Tree on Radica/);

  const rootInsp = renderTreeInspectorHtml(model, { type: "root", pubkey: STRANGER }, POSTS, [COMM], getName);
  assert.ok(!rootInsp.includes("<script>"));
  assert.match(rootInsp, /linfa-plant/);
});
