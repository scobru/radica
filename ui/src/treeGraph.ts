// Living Tree (Albero di Radica): pure botanical network graph engine & SVG/Inspector renderer.
// No DOM globals required — safe to test directly under Node.js.
import { escapeHtml, shortenKey } from "./html.ts";
import { plainMentions } from "./caption.ts";
import { plantSvg } from "./plant.ts";
import { freepollsLink } from "./freepolls.ts";
import { repostCountsOf } from "./repost.ts";
import { parseArticleCaption } from "./articles.ts";
import { likers, type Community, type Post, type PostCategory } from "./types.ts";

export type TreeViewMode = "full" | "canopy" | "roots";
export type TreeScope = "all" | "following";

export interface TreePeerInput {
  pubkey: string;
  name: string;
  trustTier: 0 | 1 | 2;
  isFollower?: boolean;
  postCount: number;
  commentCount: number;
  linfaTotal: number;
  fresh: boolean;
  joinedAt: number;
  supporter?: boolean;
}

export interface TreeStageInfo {
  index: number;
  name: string;
  nextName: string | null;
  progress: number;
  vitalityScore: number;
  trunkGirth: number;
  trunkHeight: number;
}

export interface TreeBoughNode {
  id: string;
  slug: string;
  label: string;
  isCommunity: boolean;
  x: number;
  y: number;
  startX: number;
  startY: number;
  angle: number;
  postCount: number;
  memberCount: number;
}

export interface TreeCommentLeafNode {
  id: string;
  postId: string;
  postAuthor: string;
  author: string;
  authorName: string;
  text: string;
  timestamp: number;
  x: number;
  y: number;
  branchX: number;
  branchY: number;
  angle: number;
  size: number;
  fresh: boolean;
  matched: boolean;
}

export interface TreePostBranchNode {
  id: string;
  author: string;
  authorName: string;
  boughId: string;
  category: PostCategory;
  isPoll: boolean;
  caption: string;
  timestamp: number;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  ctrlX: number;
  ctrlY: number;
  width: number;
  radius: number;
  fresh: boolean;
  hasBloom: boolean;
  matched: boolean;
  leaves: TreeCommentLeafNode[];
}

export interface TreeRootNode {
  pubkey: string;
  name: string;
  trustTier: 0 | 1 | 2;
  isMe: boolean;
  x: number;
  y: number;
  parentX: number;
  parentY: number;
  ctrlX: number;
  ctrlY: number;
  radius: number;
  width: number;
  fresh: boolean;
  postCount: number;
  commentCount: number;
  linfaTotal: number;
  matched: boolean;
  supporter?: boolean;
}

export type TreeSelection =
  | { type: "post"; postId: string; author: string }
  | { type: "comment"; postId: string; commentId: string; author: string }
  | { type: "root"; pubkey: string }
  | { type: "bough"; boughId: string }
  | null;

export interface TreeGraphModel {
  stage: TreeStageInfo;
  boughs: TreeBoughNode[];
  posts: TreePostBranchNode[];
  roots: TreeRootNode[];
  sapLinks: Array<{ fromX: number; fromY: number; toX: number; toY: number; kind: "post" | "comment" }>;
  minTs: number;
  maxTs: number;
  cutoffTs: number;
  stats: {
    users: number;
    communities: number;
    posts: number;
    comments: number;
    likes: number;
    freshPosts: number;
  };
}

export interface BuildTreeGraphInput {
  posts: Post[];
  communities: Community[];
  peers: TreePeerInput[];
  myPubkey: string;
  myName: string;
  mode?: TreeViewMode;
  scope?: TreeScope;
  communityFilter?: string;
  searchQuery?: string;
  focusAuthor?: string | null;
  timeProgress?: number;
  selection?: TreeSelection;
  now?: number;
}

const DAY_MS = 86_400_000;
const MAX_BOUGHS = 8;
const MAX_POSTS = 48;
const MAX_LEAVES_PER_POST = 10;
const MAX_ROOTS = 64;

const TREE_STAGES = [
  { at: 0, name: "Seed", height: 40, girth: 6 },
  { at: 15, name: "Sprout", height: 58, girth: 9 },
  { at: 60, name: "Sapling", height: 78, girth: 12.5 },
  { at: 180, name: "Young Tree", height: 98, girth: 16 },
  { at: 500, name: "Canopy Tree", height: 118, girth: 20 },
  { at: 1500, name: "Ancient Yggdrasil", height: 136, girth: 24 },
] as const;

const CATEGORY_BOUGHS: Record<PostCategory, { id: string; slug: string; label: string }> = {
  thought: { id: "bough:thought", slug: "thoughts", label: "Thoughts" },
  moment: { id: "bough:moment", slug: "moments", label: "Moments" },
  event: { id: "bough:event", slug: "events", label: "Events" },
};
const ARTICLE_BOUGH = { id: "bough:article", slug: "articles", label: "Articles" };

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const cut = (t: string, max = 14) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

/** Repeatable PRNG from any identifier so nodes stay anchored across redraws. */
function mulberry32(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quadPoint(sx: number, sy: number, cx: number, cy: number, ex: number, ey: number, t: number): [number, number] {
  const u = 1 - t;
  return [
    u * u * sx + 2 * u * t * cx + t * t * ex,
    u * u * sy + 2 * u * t * cy + t * t * ey,
  ];
}

/** Computes the botanical evolutionary stage of the entire network tree. */
export function computeNetworkTreeStage(
  usersCount: number,
  postsCount: number,
  commentsCount: number,
  communitiesCount: number
): TreeStageInfo {
  const u = Math.max(0, usersCount);
  const p = Math.max(0, postsCount);
  const c = Math.max(0, commentsCount);
  const com = Math.max(0, communitiesCount);
  const vitalityScore = u * 8 + com * 10 + p * 3 + c * 2;

  let index = 0;
  while (index + 1 < TREE_STAGES.length && vitalityScore >= TREE_STAGES[index + 1].at) {
    index++;
  }
  const cur = TREE_STAGES[index];
  const next = TREE_STAGES[index + 1] ?? null;
  const progress = next
    ? clamp((vitalityScore - cur.at) / Math.max(1, next.at - cur.at))
    : 1;

  const trunkHeight = next
    ? cur.height + (next.height - cur.height) * progress
    : cur.height + Math.min(18, (vitalityScore - cur.at) / 180);
  const trunkGirth = next
    ? cur.girth + (next.girth - cur.girth) * progress
    : cur.girth + Math.min(4, (vitalityScore - cur.at) / 400);

  return {
    index,
    name: cur.name,
    nextName: next ? next.name : null,
    progress,
    vitalityScore,
    trunkGirth: round1(trunkGirth),
    trunkHeight: round1(trunkHeight),
  };
}

function leafSvgPath(s: number): string {
  return `M0 0C${round1(s * 0.22)} ${round1(-s * 0.5)} ${round1(s * 0.74)} ${round1(-s * 0.42)} ${round1(s)} 0C${round1(s * 0.74)} ${round1(s * 0.42)} ${round1(s * 0.22)} ${round1(s * 0.5)} 0 0Z`;
}

/** Build the complete spatial model of Radica's Living Tree from current node state. */
export function buildTreeGraph(input: BuildTreeGraphInput): TreeGraphModel {
  const now = input.now ?? Date.now();
  const scope: TreeScope = input.scope ?? "all";
  const communityFilter = (input.communityFilter ?? "").trim();
  const query = (input.searchQuery ?? "").trim().toLowerCase();
  const timeProgress = clamp(input.timeProgress ?? 1, 0, 1);

  const peerMap = new Map<string, TreePeerInput>();
  for (const peer of input.peers) {
    if (peer.pubkey) peerMap.set(peer.pubkey, peer);
  }
  if (input.myPubkey && !peerMap.has(input.myPubkey)) {
    peerMap.set(input.myPubkey, {
      pubkey: input.myPubkey,
      name: input.myName || shortenKey(input.myPubkey),
      trustTier: 1,
      postCount: 0,
      commentCount: 0,
      linfaTotal: 0,
      fresh: false,
      joinedAt: 0,
    });
  }

  const nameOf = (pk: string): string => {
    if (pk === input.myPubkey && input.myName) return input.myName;
    return peerMap.get(pk)?.name || shortenKey(pk);
  };

  const isFollowingAllowed = (pk: string) => {
    if (scope !== "following") return true;
    if (pk === input.myPubkey) return true;
    return peerMap.get(pk)?.trustTier === 1;
  };

  // 1. Filter posts by scope and community to determine eligible candidates
  const eligiblePosts = input.posts.filter((p) => {
    if (!isFollowingAllowed(p.author)) return false;
    if (communityFilter && p.community_id !== communityFilter) return false;
    return true;
  });

  // 2. Compute activity timeline bounds from real posts and comments.
  // We NEVER include static genesis dates from seed communities (such as Freenet 2024 defaults)
  // because that would push the start of time 2+ years into the past and freeze the tree.
  let activityMinTs = Infinity;
  let activityMaxTs = -Infinity;
  const noteActivityTs = (ts: number | undefined) => {
    if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) {
      if (ts < activityMinTs) activityMinTs = ts;
      if (ts > activityMaxTs) activityMaxTs = ts;
    }
  };

  for (const p of eligiblePosts) {
    noteActivityTs(p.timestamp);
    for (const c of Object.values(p.comments ?? {})) {
      if (c && c.text !== "") noteActivityTs(c.timestamp);
    }
  }

  // Fallback to all input posts if no eligible posts yet
  if (!Number.isFinite(activityMinTs) || !Number.isFinite(activityMaxTs)) {
    for (const p of input.posts) {
      noteActivityTs(p.timestamp);
      for (const c of Object.values(p.comments ?? {})) {
        if (c && c.text !== "") noteActivityTs(c.timestamp);
      }
    }
  }

  let minTs = activityMinTs;
  let maxTs = activityMaxTs;
  if (!Number.isFinite(minTs) || !Number.isFinite(maxTs)) {
    minTs = now - DAY_MS;
    maxTs = now;
  } else if (maxTs - minTs < 60_000) {
    // If all posts are at the exact same timestamp or within 1 minute, create a clean 1-hour window
    minTs = Math.max(1, maxTs - 3_600_000);
  }

  const cutoffTs = minTs + (maxTs - minTs) * timeProgress;

  // 3. Stagger post appearance chronologically across the growth timeline [0.12 .. 0.94].
  // By blending chronological fraction and rank fraction:
  // - Strict chronological order is always preserved (older posts sprout first).
  // - Batch-imported or tightly clustered posts sprout progressively one by one instead of jumping at the end.
  // - At timeProgress >= 0.98, all eligible posts are guaranteed visible.
  const sortedPostsByTime = [...eligiblePosts].sort((a, b) => a.timestamp - b.timestamp);
  const postAppearThresholdMap = new Map<string, number>();
  const totalEligible = sortedPostsByTime.length;
  sortedPostsByTime.forEach((p, idx) => {
    const timeFrac =
      activityMaxTs > activityMinTs
        ? clamp((p.timestamp - activityMinTs) / (activityMaxTs - activityMinTs))
        : totalEligible === 1
          ? 0.5
          : idx / (totalEligible - 1);
    const rankFrac = totalEligible === 1 ? 0.5 : idx / (totalEligible - 1);
    const blendedFrac = 0.55 * timeFrac + 0.45 * rankFrac;
    const threshold = 0.12 + 0.82 * blendedFrac;
    postAppearThresholdMap.set(`${p.author}:${p.id}`, threshold);
  });

  const scopedPosts = sortedPostsByTime.filter((p) => {
    if (timeProgress >= 0.98) return true;
    const thresh = postAppearThresholdMap.get(`${p.author}:${p.id}`) ?? 0.5;
    return timeProgress >= thresh;
  });

  const repostCounts = repostCountsOf(scopedPosts);

  // Filter peers by time and scope
  const scopedPeers: TreePeerInput[] = [];
  for (const peer of peerMap.values()) {
    if (peer.pubkey === input.myPubkey) {
      scopedPeers.push(peer);
      continue;
    }
    if (!isFollowingAllowed(peer.pubkey)) continue;
    if (timeProgress < 0.98 && peer.joinedAt > 0 && peer.joinedAt > cutoffTs) continue;
    scopedPeers.push(peer);
  }

  // Count visible comments and likes on scoped posts
  let totalCommentsCount = 0;
  let totalLikesCount = 0;
  let freshPostsCount = 0;
  for (const p of scopedPosts) {
    if (now - p.timestamp <= DAY_MS) freshPostsCount++;
    totalLikesCount += likers(p).length;
    const pThresh = postAppearThresholdMap.get(`${p.author}:${p.id}`) ?? 0.12;
    const rawComments = Object.values(p.comments ?? {}).filter((c) => c && c.text !== "");
    for (let ci = 0; ci < rawComments.length; ci++) {
      const c = rawComments[ci];
      if (timeProgress >= 0.98) {
        totalCommentsCount++;
      } else {
        const cAppear = pThresh + 0.03 + (0.12 * (ci + 1)) / Math.max(1, rawComments.length + 1);
        if (timeProgress >= cAppear && c.timestamp <= cutoffTs) totalCommentsCount++;
      }
    }
  }

  // Filter communities: default seed communities are always present, user ones respect cutoffTs
  const activeCommunities = input.communities.filter((c) => {
    if (communityFilter && c.id !== communityFilter) return false;
    if (timeProgress >= 0.98) return true;
    if (!c.created_at || c.created_at <= 1720000000000) return true;
    return c.created_at <= cutoffTs;
  });

  const stage = computeNetworkTreeStage(
    scopedPeers.length,
    scopedPosts.length,
    totalCommentsCount,
    activeCommunities.length
  );

  // Select top posts (up to MAX_POSTS) sorted by recency & engagement
  const rankedPosts = [...scopedPosts]
    .sort((a, b) => {
      const aScore = b.timestamp - a.timestamp;
      if (Math.abs(aScore) > DAY_MS * 2) return aScore;
      const aEng = likers(a).length + Object.keys(a.comments ?? {}).length;
      const bEng = likers(b).length + Object.keys(b.comments ?? {}).length;
      return bEng - aEng || b.timestamp - a.timestamp;
    })
    .slice(0, MAX_POSTS);

  // Determine boughs (communities + fallback categories for non-community posts)
  const commById = new Map(activeCommunities.map((c) => [c.id, c]));
  const boughBuckets = new Map<string, { slug: string; label: string; isCommunity: boolean; memberCount: number; posts: Post[] }>();

  for (const c of activeCommunities) {
    boughBuckets.set(c.id, {
      slug: c.slug,
      label: `r/${c.slug}`,
      isCommunity: true,
      memberCount: c.members?.length ?? 0,
      posts: [],
    });
  }

  for (const p of rankedPosts) {
    if (p.community_id && boughBuckets.has(p.community_id)) {
      boughBuckets.get(p.community_id)!.posts.push(p);
    } else {
      const cat = parseArticleCaption(p.caption) ? ARTICLE_BOUGH : (CATEGORY_BOUGHS[p.category] ?? CATEGORY_BOUGHS.thought);
      if (!boughBuckets.has(cat.id)) {
        boughBuckets.set(cat.id, {
          slug: cat.slug,
          label: cat.label,
          isCommunity: false,
          memberCount: 0,
          posts: [],
        });
      }
      boughBuckets.get(cat.id)!.posts.push(p);
    }
  }

  // Keep only non-empty boughs, or fallback boughs if network is still tiny
  let boughEntries = [...boughBuckets.entries()].filter(([, v]) => v.posts.length > 0 || (communityFilter && v.isCommunity));
  if (boughEntries.length === 0) {
    boughEntries = [...boughBuckets.entries()].slice(0, 3);
  }
  if (boughEntries.length === 0) {
    boughEntries = [[CATEGORY_BOUGHS.thought.id, { slug: "thoughts", label: "Thoughts", isCommunity: false, memberCount: 0, posts: [] }]];
  }

  boughEntries.sort((a, b) => b[1].posts.length - a[1].posts.length || b[1].memberCount - a[1].memberCount);
  boughEntries = boughEntries.slice(0, MAX_BOUGHS);

  const selectedBoughIds = new Set(boughEntries.map(([id]) => id));
  const fallbackBoughId = boughEntries[0][0];

  const isGrowthActive = timeProgress < 0.98;
  const growthScale = isGrowthActive ? Math.max(0.15, timeProgress) : 1;

  const trunkHeightScale = isGrowthActive ? 0.40 + 0.60 * growthScale : 1;
  const trunkGirthScale = isGrowthActive ? 0.45 + 0.55 * growthScale : 1;
  const currentTrunkHeight = round1(stage.trunkHeight * trunkHeightScale);
  const currentTrunkGirth = round1(stage.trunkGirth * trunkGirthScale);

  if (isGrowthActive) {
    stage.trunkHeight = currentTrunkHeight;
    stage.trunkGirth = currentTrunkGirth;
  }

  const trunkTopX = 0;
  const trunkTopY = -currentTrunkHeight * 0.92;
  const boughs: TreeBoughNode[] = [];
  const boughCtrlMap = new Map<string, { cx: number; cy: number }>();

  const boughGrowth = isGrowthActive ? clamp((timeProgress - 0.05) / 0.45, 0.20, 1) : 1;
  const boughCount = boughEntries.length;
  boughEntries.forEach(([id, info], idx) => {
    const t = boughCount === 1 ? 0.5 : idx / (boughCount - 1);
    const angle = -Math.PI * 0.84 + t * Math.PI * 0.68; // spreads across upper canopy (-151° to -29°)
    const fullLength = 95 + Math.min(115, info.posts.length * 14 + stage.index * 12);
    const length = fullLength * boughGrowth;
    const endX = trunkTopX + Math.cos(angle) * length;
    const endY = trunkTopY + Math.sin(angle) * length;
    const bend = (idx % 2 === 0 ? -1 : 1) * 18 * boughGrowth;
    const cx = (trunkTopX + endX) / 2 - Math.sin(angle) * bend;
    const cy = (trunkTopY + endY) / 2 + Math.cos(angle) * bend;

    boughCtrlMap.set(id, { cx, cy });
    boughs.push({
      id,
      slug: info.slug,
      label: info.label,
      isCommunity: info.isCommunity,
      x: round1(endX),
      y: round1(endY),
      startX: round1(trunkTopX),
      startY: round1(trunkTopY),
      angle,
      postCount: info.posts.length,
      memberCount: info.memberCount,
    });
  });

  const boughById = new Map(boughs.map((b) => [b.id, b]));

  // Place Post Branches and Comment Leaves along their boughs
  const postsByBough = new Map<string, Post[]>();
  for (const p of rankedPosts) {
    const targetId =
      p.community_id && selectedBoughIds.has(p.community_id)
        ? p.community_id
        : selectedBoughIds.has(CATEGORY_BOUGHS[p.category]?.id)
          ? CATEGORY_BOUGHS[p.category].id
          : fallbackBoughId;
    const arr = postsByBough.get(targetId) ?? [];
    arr.push(p);
    postsByBough.set(targetId, arr);
  }

  const posts: TreePostBranchNode[] = [];
  for (const bough of boughs) {
    const list = postsByBough.get(bough.id) ?? [];
    const bCtrl = boughCtrlMap.get(bough.id)!;
    list.forEach((p, idx) => {
      const pThresh = postAppearThresholdMap.get(`${p.author}:${p.id}`) ?? 0.12;
      const branchGrowth = isGrowthActive ? clamp((timeProgress - pThresh) / 0.14, 0.25, 1) : 1;

      const rnd = mulberry32(`post:${p.id}`);
      const slotT = list.length === 1 ? 0.65 : 0.28 + (0.68 * idx) / (list.length - 1);
      const [sx, sy] = quadPoint(bough.startX, bough.startY, bCtrl.cx, bCtrl.cy, bough.x, bough.y, slotT);

      const side = idx % 2 === 0 ? 1 : -1;
      const spread = 0.42 + rnd() * 0.44;
      const branchAngle = bough.angle + side * spread + (rnd() - 0.5) * 0.16;
      const clampedAngle = Math.max(-Math.PI * 0.94, Math.min(-Math.PI * 0.06, branchAngle));

      const likesCount = likers(p).length;
      const rawComments = Object.values(p.comments ?? {}).filter((c) => c && c.text !== "");
      const visibleComments = rawComments
        .filter((c, ci) => {
          if (!isGrowthActive) return true;
          const cAppear = pThresh + 0.03 + (0.12 * (ci + 1)) / Math.max(1, rawComments.length + 1);
          return timeProgress >= cAppear && c.timestamp <= cutoffTs;
        })
        .sort((a, b) => a.timestamp - b.timestamp);

      const repostsCount = repostCounts.get(`${p.author}:${p.id}`) ?? 0;
      const engagement = likesCount + visibleComments.length + repostsCount;

      const fullBranchLen = 46 + Math.min(54, engagement * 4.5 + rnd() * 24);
      const branchLen = fullBranchLen * branchGrowth;
      const ex = sx + Math.cos(clampedAngle) * branchLen;
      const ey = sy + Math.sin(clampedAngle) * branchLen;
      const bend = (rnd() - 0.5) * 20 * branchGrowth;
      const ctrlX = (sx + ex) / 2 - Math.sin(clampedAngle) * bend;
      const ctrlY = (sy + ey) / 2 + Math.cos(clampedAngle) * bend;

      const authorName = nameOf(p.author);
      const isPoll = !!freepollsLink(p.caption ?? "");
      const postMatched =
        query.length > 0 &&
        (plainMentions(p.caption ?? "", nameOf).toLowerCase().includes(query) ||
          authorName.toLowerCase().includes(query) ||
          p.author.toLowerCase().includes(query) ||
          (p.community_id && commById.get(p.community_id)?.slug.toLowerCase().includes(query)));

      const leaves: TreeCommentLeafNode[] = visibleComments.slice(0, MAX_LEAVES_PER_POST).map((c, ci, arr) => {
        const cAppear = pThresh + 0.03 + (0.12 * (ci + 1)) / Math.max(1, arr.length + 1);
        const leafGrowth = isGrowthActive ? clamp((timeProgress - cAppear) / 0.10, 0.25, 1) : 1;
        const lt = arr.length === 1 ? 0.62 : 0.28 + (0.62 * ci) / (arr.length - 1);
        const [bx, by] = quadPoint(sx, sy, ctrlX, ctrlY, ex, ey, lt);
        const lSide = ci % 2 === 0 ? 1 : -1;
        const lAngle = clampedAngle + lSide * (0.68 + (ci % 3) * 0.14);
        const fullLSize = 9.5 + (ci % 3) * 1.6;
        const lSize = fullLSize * leafGrowth;
        const lx = bx + Math.cos(lAngle) * lSize;
        const ly = by + Math.sin(lAngle) * lSize;
        const cAuthorName = nameOf(c.author);
        const leafMatched =
          query.length > 0 &&
          (plainMentions(c.text ?? "", nameOf).toLowerCase().includes(query) ||
            cAuthorName.toLowerCase().includes(query) ||
            c.author.toLowerCase().includes(query));

        return {
          id: c.id,
          postId: p.id,
          postAuthor: p.author,
          author: c.author,
          authorName: cAuthorName,
          text: c.text,
          timestamp: c.timestamp,
          x: round1(lx),
          y: round1(ly),
          branchX: round1(bx),
          branchY: round1(by),
          angle: lAngle,
          size: round1(lSize),
          fresh: now - c.timestamp <= DAY_MS,
          matched: leafMatched,
        };
      });

      posts.push({
        id: p.id,
        author: p.author,
        authorName,
        boughId: bough.id,
        category: p.category,
        isPoll,
        caption: p.caption,
        timestamp: p.timestamp,
        likesCount,
        commentsCount: visibleComments.length,
        repostsCount,
        x: round1(ex),
        y: round1(ey),
        startX: round1(sx),
        startY: round1(sy),
        ctrlX: round1(ctrlX),
        ctrlY: round1(ctrlY),
        width: round1((1.8 + Math.min(2.2, engagement * 0.25)) * (0.5 + 0.5 * branchGrowth)),
        radius: round1((5.4 + Math.min(6, Math.sqrt(engagement + 1) * 1.7)) * (0.45 + 0.55 * branchGrowth)),
        fresh: now - p.timestamp <= DAY_MS,
        hasBloom: (likesCount + visibleComments.length >= 3) && (!isGrowthActive || branchGrowth >= 0.85),
        matched: Boolean(postMatched),
        leaves,
      });
    });
  }

  // Place Underground Roots (You at taproot, followed Tier 1, Tier 2, and newcomers)
  const rootGrowth = isGrowthActive ? clamp((timeProgress - 0.03) / 0.55, 0.25, 1) : 1;
  const tapX = 0;
  const tapY = round1(28 * (0.45 + 0.55 * rootGrowth));
  const roots: TreeRootNode[] = [];

  const mePeer = scopedPeers.find((p) => p.pubkey === input.myPubkey);
  if (mePeer) {
    roots.push({
      pubkey: mePeer.pubkey,
      name: mePeer.name || input.myName || "You",
      trustTier: 1,
      isMe: true,
      x: tapX,
      y: tapY,
      parentX: 0,
      parentY: 0,
      ctrlX: 0,
      ctrlY: round1(tapY / 2),
      radius: round1(11 * (0.5 + 0.5 * rootGrowth)),
      width: round1(3.4 * (0.5 + 0.5 * rootGrowth)),
      fresh: mePeer.fresh,
      postCount: mePeer.postCount,
      commentCount: mePeer.commentCount,
      linfaTotal: mePeer.linfaTotal,
      matched:
        query.length > 0 &&
        ((mePeer.name || "").toLowerCase().includes(query) || mePeer.pubkey.toLowerCase().includes(query)),
      supporter: mePeer.supporter,
    });
  }

  const otherPeers = scopedPeers
    .filter((p) => p.pubkey !== input.myPubkey)
    .sort((a, b) => {
      const tierOrder = (t: 0 | 1 | 2) => (t === 1 ? 0 : t === 2 ? 1 : 2);
      return (
        tierOrder(a.trustTier) - tierOrder(b.trustTier) ||
        Number(b.fresh) - Number(a.fresh) ||
        b.linfaTotal + b.postCount * 3 + b.commentCount * 2 - (a.linfaTotal + a.postCount * 3 + a.commentCount * 2)
      );
    })
    .slice(0, MAX_ROOTS - (mePeer ? 1 : 0));

  const tierGroups: Record<0 | 1 | 2, TreePeerInput[]> = {
    1: otherPeers.filter((p) => p.trustTier === 1),
    2: otherPeers.filter((p) => p.trustTier === 2),
    0: otherPeers.filter((p) => p.trustTier === 0),
  };

  const tierRadii: Record<0 | 1 | 2, [number, number]> = {
    1: [96, 142],
    2: [160, 210],
    0: [224, 276],
  };

  for (const tier of [1, 2, 0] as const) {
    const group = tierGroups[tier];
    if (group.length === 0) continue;
    const [rMin, rMax] = tierRadii[tier];
    group.forEach((peer, idx) => {
      const rnd = mulberry32(`root:${peer.pubkey}`);
      const frac = group.length === 1 ? 0.5 : idx / (group.length - 1);
      const angle = Math.PI * 0.12 + frac * Math.PI * 0.76 + (rnd() - 0.5) * 0.08;
      const fullDist = rMin + (rMax - rMin) * (0.25 + rnd() * 0.75);
      const dist = fullDist * rootGrowth;
      const x = tapX + Math.cos(angle) * dist;
      const y = tapY + Math.sin(angle) * dist;

      const bend = (rnd() - 0.5) * 34 * rootGrowth;
      const ctrlX = (tapX + x) / 2 - Math.sin(angle) * bend;
      const ctrlY = (tapY + y) / 2 + Math.cos(angle) * bend;
      const activity = peer.linfaTotal + peer.postCount * 3 + peer.commentCount * 2;
      const radius = (4.6 + Math.min(5.4, Math.sqrt(Math.max(1, activity)) * 0.65)) * (0.5 + 0.5 * rootGrowth);
      const matched =
        query.length > 0 &&
        (peer.name.toLowerCase().includes(query) || peer.pubkey.toLowerCase().includes(query));

      roots.push({
        pubkey: peer.pubkey,
        name: peer.name,
        trustTier: peer.trustTier,
        isMe: false,
        x: round1(x),
        y: round1(y),
        parentX: tapX,
        parentY: tapY,
        ctrlX: round1(ctrlX),
        ctrlY: round1(ctrlY),
        radius: round1(radius),
        width: round1((tier === 1 ? 2.4 : tier === 2 ? 1.7 : 1.2) * (0.5 + 0.5 * rootGrowth)),
        fresh: peer.fresh,
        postCount: peer.postCount,
        commentCount: peer.commentCount,
        linfaTotal: peer.linfaTotal,
        matched,
        supporter: peer.supporter,
      });
    });
  }

  // Compute Sap Filaments connecting selected/focused author roots to canopy posts & comments
  const sapLinks: Array<{ fromX: number; fromY: number; toX: number; toY: number; kind: "post" | "comment" }> = [];
  const rootByPubkey = new Map(roots.map((r) => [r.pubkey, r]));
  const sel = input.selection ?? null;

  const targetAuthor =
    input.focusAuthor ||
    (sel?.type === "root"
      ? sel.pubkey
      : sel?.type === "post" || sel?.type === "comment"
        ? sel.author
        : null);

  if (sel?.type === "post") {
    const postNode = posts.find((p) => p.id === sel.postId && p.author === sel.author);
    if (postNode) {
      const authorRoot = rootByPubkey.get(postNode.author);
      if (authorRoot) {
        sapLinks.push({ fromX: authorRoot.x, fromY: authorRoot.y, toX: postNode.x, toY: postNode.y, kind: "post" });
      }
      for (const leaf of postNode.leaves) {
        const commenterRoot = rootByPubkey.get(leaf.author);
        if (commenterRoot && commenterRoot.pubkey !== postNode.author) {
          sapLinks.push({ fromX: commenterRoot.x, fromY: commenterRoot.y, toX: leaf.x, toY: leaf.y, kind: "comment" });
        }
      }
    }
  } else if (sel?.type === "comment") {
    const postNode = posts.find((p) => p.id === sel.postId);
    const leafNode = postNode?.leaves.find((l) => l.id === sel.commentId);
    if (leafNode) {
      const cRoot = rootByPubkey.get(leafNode.author);
      if (cRoot) {
        sapLinks.push({ fromX: cRoot.x, fromY: cRoot.y, toX: leafNode.x, toY: leafNode.y, kind: "comment" });
      }
    }
  } else if (targetAuthor) {
    const authorRoot = rootByPubkey.get(targetAuthor);
    const fromX = authorRoot?.x ?? tapX;
    const fromY = authorRoot?.y ?? tapY;
    for (const p of posts) {
      if (p.author === targetAuthor) {
        sapLinks.push({ fromX, fromY, toX: p.x, toY: p.y, kind: "post" });
      }
      for (const leaf of p.leaves) {
        if (leaf.author === targetAuthor) {
          sapLinks.push({ fromX, fromY, toX: leaf.x, toY: leaf.y, kind: "comment" });
        }
      }
    }
  }

  return {
    stage,
    boughs,
    posts,
    roots,
    sapLinks,
    minTs,
    maxTs,
    cutoffTs,
    stats: {
      users: scopedPeers.length,
      communities: activeCommunities.length,
      posts: scopedPosts.length,
      comments: totalCommentsCount,
      likes: totalLikesCount,
      freshPosts: freshPostsCount,
    },
  };
}

function viewBoxFor(mode: TreeViewMode, zoom = 1, panX = 0, panY = 0): string {
  const safeZoom = Math.max(0.4, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
  const [baseCx, baseCy, baseW, baseH] =
    mode === "canopy"
      ? [0, -165, 720, 410]
      : mode === "roots"
        ? [0, 145, 720, 380]
        : [0, -25, 740, 680];

  const vbW = baseW / safeZoom;
  const vbH = baseH / safeZoom;
  const vbX = baseCx - (Number.isFinite(panX) ? panX : 0) - vbW / 2;
  const vbY = baseCy - (Number.isFinite(panY) ? panY : 0) - vbH / 2;
  return `${round1(vbX)} ${round1(vbY)} ${round1(vbW)} ${round1(vbH)}`;
}

/** Render the interactive Living Tree SVG from a prebuilt TreeGraphModel. */
export function renderTreeSvg(
  model: TreeGraphModel,
  opts?: { mode?: TreeViewMode; selection?: TreeSelection; zoom?: number; panX?: number; panY?: number }
): string {
  const mode: TreeViewMode = opts?.mode ?? "full";
  const selection = opts?.selection ?? null;
  const vb = viewBoxFor(mode, opts?.zoom, opts?.panX, opts?.panY);
  const { stage, boughs, posts, roots, sapLinks } = model;

  const isSelected = (kind: NonNullable<TreeSelection>["type"], id: string, extra?: string) => {
    if (!selection || selection.type !== kind) return false;
    if (kind === "post" && selection.type === "post") return selection.postId === id && selection.author === extra;
    if (kind === "comment" && selection.type === "comment") return selection.commentId === id && selection.postId === extra;
    if (kind === "root" && selection.type === "root") return selection.pubkey === id;
    if (kind === "bough" && selection.type === "bough") return selection.boughId === id;
    return false;
  };

  // 1. Trunk geometry (tapered bark path + inner sap veins)
  const gHalf = stage.trunkGirth / 2;
  const topY = -stage.trunkHeight * 0.94;
  const trunkPath =
    `M${round1(-gHalf * 1.45)} 4` +
    `Q${round1(-gHalf * 0.72)} ${round1(-stage.trunkHeight * 0.45)} ${round1(-gHalf * 0.46)} ${round1(topY)}` +
    `L${round1(gHalf * 0.46)} ${round1(topY)}` +
    `Q${round1(gHalf * 0.72)} ${round1(-stage.trunkHeight * 0.45)} ${round1(gHalf * 1.45)} 4Z`;

  const trunkVeins =
    stage.index >= 1
      ? `<path class="tree-trunk-vein" d="M-1.5 2Q${round1(-gHalf * 0.25)} ${round1(-stage.trunkHeight * 0.5)} -1 ${round1(topY + 4)}"/>` +
        `<path class="tree-trunk-vein" d="M2 2Q${round1(gHalf * 0.25)} ${round1(-stage.trunkHeight * 0.55)} 1.5 ${round1(topY + 4)}"/>`
      : "";

  // 2. Soil Horizon
  const soilHtml =
    `<g class="tree-soil-layer">` +
    `<path class="tree-soil-horizon" d="M-340 2Q0 -14 340 2Q0 16 -340 2Z"/>` +
    `<line class="tree-horizon-line" x1="-330" y1="2" x2="330" y2="2"/>` +
    `<text class="tree-zone-label" x="-318" y="-10">CANOPY · POSTS &amp; REPLIES</text>` +
    `<text class="tree-zone-label" x="-318" y="18">ROOTS · PERSONAS &amp; WEB OF TRUST</text>` +
    `</g>`;

  // 3. Underground Roots
  const rootPathsHtml: string[] = [];
  const rootNodesHtml: string[] = [];
  if (mode !== "canopy") {
    for (const r of roots) {
      if (!r.isMe) {
        const cls = [
          "tree-root-path",
          `tier-${r.trustTier}`,
          r.fresh ? "fresh" : "",
          r.matched ? "matched" : "",
        ]
          .filter(Boolean)
          .join(" ");
        rootPathsHtml.push(
          `<path class="${cls}" stroke-width="${r.width}" d="M${r.parentX} ${r.parentY} Q${r.ctrlX} ${r.ctrlY} ${r.x} ${r.y}"/>`
        );
      } else {
        rootPathsHtml.push(`<path class="tree-root-path taproot" stroke-width="4" d="M0 2 L${r.x} ${r.y}"/>`);
      }

      const selected = isSelected("root", r.pubkey);
      const nodeCls = [
        "tree-node",
        "tree-root-node",
        `tier-${r.trustTier}`,
        r.isMe ? "is-me" : "",
        r.fresh ? "fresh" : "",
        r.matched ? "matched" : "",
        selected ? "selected" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const showLabel = r.isMe || r.trustTier === 1 || r.fresh || r.matched || selected || roots.length <= 22;
      const labelY = r.y + r.radius + 11;
      rootNodesHtml.push(
        `<g class="${nodeCls}" data-node-type="root" data-pubkey="${escapeHtml(r.pubkey)}" tabindex="0" role="button" aria-label="Persona ${escapeHtml(r.name)} (${r.postCount} posts, ${r.commentCount} replies)">` +
          (r.fresh ? `<circle class="tree-pulse" cx="${r.x}" cy="${r.y}" r="${round1(r.radius + 4)}"/>` : "") +
          (r.supporter ? `<circle class="tree-supporter-ring" cx="${r.x}" cy="${r.y}" r="${round1(r.radius + 2.4)}"/>` : "") +
          `<circle class="tree-root-dot" cx="${r.x}" cy="${r.y}" r="${r.radius}"/>` +
          (showLabel
            ? `<text class="tree-node-label" x="${r.x}" y="${round1(labelY)}" text-anchor="middle">${escapeHtml(cut(r.name, 13))}</text>`
            : "") +
          `<title>${escapeHtml(r.name)} · ${r.postCount} posts · ${r.commentCount} replies · ${round1(r.linfaTotal)} Linfa</title>` +
          `</g>`
      );
    }
  }

  // 4. Crown Boughs, Post Branches, Comment Leaves, and Blooms
  const boughHtml: string[] = [];
  const branchHtml: string[] = [];
  const leafHtml: string[] = [];
  const bloomHtml: string[] = [];
  const postNodeHtml: string[] = [];
  const boughNodeHtml: string[] = [];

  if (mode !== "roots") {
    for (const b of boughs) {
      const bend = (boughs.indexOf(b) % 2 === 0 ? -1 : 1) * 18;
      const cx = (b.startX + b.x) / 2 - Math.sin(b.angle) * bend;
      const cy = (b.startY + b.y) / 2 + Math.cos(b.angle) * bend;
      const boughSelected = isSelected("bough", b.id);
      boughHtml.push(
        `<path class="tree-bough${boughSelected ? " selected" : ""}" stroke-width="${round1(Math.max(2.6, stage.trunkGirth * 0.28))}" d="M${b.startX} ${b.startY} Q${round1(cx)} ${round1(cy)} ${b.x} ${b.y}"/>`
      );
      boughNodeHtml.push(
        `<g class="tree-node tree-bough-node${b.isCommunity ? " community" : ""}${boughSelected ? " selected" : ""}" data-node-type="bough" data-bough-id="${escapeHtml(b.id)}" tabindex="0" role="button" aria-label="Bough ${escapeHtml(b.label)} (${b.postCount} posts)">` +
          `<rect class="tree-bough-pill" x="${round1(b.x - 42)}" y="${round1(b.y - 11)}" width="84" height="20" rx="10"/>` +
          `<text class="tree-bough-label" x="${b.x}" y="${round1(b.y + 3)}" text-anchor="middle">${escapeHtml(cut(b.label, 14))}</text>` +
          `<title>${escapeHtml(b.label)} · ${b.postCount} posts</title>` +
          `</g>`
      );
    }

    for (const p of posts) {
      const pSelected = isSelected("post", p.id, p.author);
      branchHtml.push(
        `<path class="tree-post-branch${p.fresh ? " fresh" : ""}${p.matched ? " matched" : ""}${pSelected ? " selected" : ""}" stroke-width="${p.width}" d="M${p.startX} ${p.startY} Q${p.ctrlX} ${p.ctrlY} ${p.x} ${p.y}"/>`
      );

      for (const l of p.leaves) {
        const lSelected = isSelected("comment", l.id, l.postId);
        const deg = round1((l.angle * 180) / Math.PI);
        const lCls = [
          "tree-node",
          "tree-comment-leaf",
          l.fresh ? "fresh" : "",
          l.matched ? "matched" : "",
          lSelected ? "selected" : "",
        ]
          .filter(Boolean)
          .join(" ");

        leafHtml.push(
          `<g class="${lCls}" data-node-type="comment" data-post-id="${escapeHtml(l.postId)}" data-comment-id="${escapeHtml(l.id)}" data-author="${escapeHtml(l.author)}" transform="translate(${l.branchX} ${l.branchY}) rotate(${deg})" tabindex="0" role="button" aria-label="Reply by ${escapeHtml(l.authorName)}">` +
            `<path class="tree-leaf-shape" d="${leafSvgPath(l.size)}"/>` +
            `<title>${escapeHtml(l.authorName)}: ${escapeHtml(cut(plainMentions(l.text), 80))}</title>` +
            `</g>`
        );
      }

      if (p.hasBloom) {
        const petals = [0, 72, 144, 216, 288]
          .map((a) => `<ellipse class="tree-bloom-petal" rx="1.8" ry="3.2" cy="-3.2" transform="rotate(${a})"/>`)
          .join("");
        bloomHtml.push(
          `<g class="tree-bloom" transform="translate(${round1(p.x + p.radius * 0.72)} ${round1(p.y - p.radius * 0.72)})">${petals}<circle class="tree-bloom-heart" r="1.4"/></g>`
        );
      }

      const catClass = p.isPoll ? "cat-poll" : `cat-${p.category}`;
      const pCls = [
        "tree-node",
        "tree-post-node",
        catClass,
        p.fresh ? "fresh" : "",
        p.matched ? "matched" : "",
        pSelected ? "selected" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const preview = plainMentions(p.caption || "").replace(/\s+/g, " ").trim();
      postNodeHtml.push(
        `<g class="${pCls}" data-node-type="post" data-post-id="${escapeHtml(p.id)}" data-author="${escapeHtml(p.author)}" tabindex="0" role="button" aria-label="Post by ${escapeHtml(p.authorName)}">` +
          (p.fresh ? `<circle class="tree-pulse" cx="${p.x}" cy="${p.y}" r="${round1(p.radius + 3.5)}"/>` : "") +
          `<circle class="tree-post-bud" cx="${p.x}" cy="${p.y}" r="${p.radius}"/>` +
          (p.commentsCount > 0
            ? `<text class="tree-post-count" x="${p.x}" y="${round1(p.y + 3)}" text-anchor="middle">${p.commentsCount}</text>`
            : "") +
          `<title>${escapeHtml(p.authorName)}: ${escapeHtml(cut(preview || "(media)", 90))} · ♥ ${p.likesCount} · 💬 ${p.commentsCount}</title>` +
          `</g>`
      );
    }
  }

  // 5. Sap Filaments tracing author roots -> posts/comments
  const sapHtml =
    mode === "full"
      ? sapLinks
          .map(
            (s) =>
              `<path class="tree-sap-filament kind-${s.kind}" d="M${round1(s.fromX)} ${round1(s.fromY)} Q0 0 ${round1(s.toX)} ${round1(s.toY)}"/>`
          )
          .join("")
      : "";

  const canopyGlow =
    mode !== "roots"
      ? `<circle class="tree-canopy-glow" cx="0" cy="${round1(-stage.trunkHeight - 60)}" r="${round1(125 + stage.index * 26)}" fill="url(#tree-canopy-grad)"/>`
      : "";

  return (
    `<svg class="radica-tree-svg" viewBox="${vb}" role="group" aria-label="Radica Living Tree graph">` +
    `<defs>` +
    `<radialGradient id="tree-canopy-grad" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="var(--linfa-leaf-1)" stop-opacity="0.24"/>` +
    `<stop offset="100%" stop-color="var(--linfa-leaf-1)" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    canopyGlow +
    soilHtml +
    (mode !== "canopy" ? `<g class="tree-roots-layer">${rootPathsHtml.join("")}${rootNodesHtml.join("")}</g>` : "") +
    `<g class="tree-trunk-layer"><path class="tree-trunk-path" d="${trunkPath}"/>${trunkVeins}</g>` +
    (sapHtml ? `<g class="tree-sap-layer">${sapHtml}</g>` : "") +
    (mode !== "roots"
      ? `<g class="tree-crown-layer">${boughHtml.join("")}${branchHtml.join("")}${leafHtml.join("")}${bloomHtml.join("")}${postNodeHtml.join("")}${boughNodeHtml.join("")}</g>`
      : "") +
    `</svg>`
  );
}

/** Render the right-hand inspector panel HTML for the current Living Tree selection. */
export function renderTreeInspectorHtml(
  model: TreeGraphModel,
  selection: TreeSelection,
  rawPosts: Post[],
  communities: Community[],
  getDisplayName: (pk: string) => string
): string {
  const { stage, stats } = model;

  if (!selection) {
    const pct = Math.round(stage.progress * 100);
    const nextHint = stage.nextName
      ? `${pct}% toward <b>${escapeHtml(stage.nextName)}</b>`
      : "Maximum botanical canopy reached — keep growing leaves!";

    return (
      `<div class="tree-insp-card">` +
      `<div class="tree-insp-kicker">Network Organism</div>` +
      `<h4 class="tree-insp-title">🌱 ${escapeHtml(stage.name)}</h4>` +
      `<div class="tree-insp-progress"><div class="tree-insp-bar"><span style="width: ${pct}%"></span></div><div class="tree-insp-sub">${nextHint}</div></div>` +
      `<div class="tree-stat-grid">` +
      `<div class="tree-stat-tile"><b>${stats.users}</b><span>Personas</span></div>` +
      `<div class="tree-stat-tile"><b>${stats.communities}</b><span>Boughs (r/)</span></div>` +
      `<div class="tree-stat-tile"><b>${stats.posts}</b><span>Branches</span></div>` +
      `<div class="tree-stat-tile"><b>${stats.comments}</b><span>Leaves</span></div>` +
      `<div class="tree-stat-tile"><b>${stats.likes}</b><span>Likes</span></div>` +
      `<div class="tree-stat-tile"><b>${stats.freshPosts}</b><span>Fresh 24h</span></div>` +
      `</div>` +
      `<div class="tree-legend">` +
      `<div><span class="tree-dot-sample bud"></span> Post branch (size = likes &amp; replies)</div>` +
      `<div><span class="tree-dot-sample leaf"></span> Comment leaf (bright = last 24h)</div>` +
      `<div><span class="tree-dot-sample root"></span> Persona root (pulses when active)</div>` +
      `</div>` +
      `<p class="tree-insp-hint">Click any root, bough, post branch, or leaf on the tree to trace sap links and jump straight into Radica.</p>` +
      `<button type="button" class="btn-secondary btn-sm tree-insp-btn" data-tree-open-milestones="true">🌱 View Network Milestones</button>` +
      `</div>`
    );
  }

  if (selection.type === "post") {
    const post = rawPosts.find((p) => p.id === selection.postId && p.author === selection.author);
    const branch = model.posts.find((p) => p.id === selection.postId && p.author === selection.author);
    const authorName = getDisplayName(selection.author);
    const comm = post?.community_id ? communities.find((c) => c.id === post.community_id) : undefined;
    const caption = post ? plainMentions(post.caption || "", getDisplayName) : branch?.caption || "";
    const likes = post ? likers(post).length : branch?.likesCount ?? 0;
    const comments = post
      ? Object.values(post.comments ?? {})
          .filter((c) => c && c.text !== "")
          .sort((a, b) => a.timestamp - b.timestamp)
      : [];

    const commentItems = comments.slice(0, 8).map((c) => {
      const cName = getDisplayName(c.author);
      const cText = plainMentions(c.text, getDisplayName);
      return (
        `<button type="button" class="tree-insp-leaf-item" data-tree-select-comment="${escapeHtml(c.id)}" data-tree-post-id="${escapeHtml(selection.postId)}" data-tree-author="${escapeHtml(c.author)}">` +
        `<span class="tree-insp-leaf-who">🍃 ${escapeHtml(cName)}</span>` +
        `<span class="tree-insp-leaf-text">${escapeHtml(cut(cText, 90))}</span>` +
        `</button>`
      );
    });

    return (
      `<div class="tree-insp-card">` +
      `<div class="tree-insp-head"><div><div class="tree-insp-kicker">Post Branch</div><h4 class="tree-insp-title">${escapeHtml(authorName)}</h4></div><button type="button" class="btn-secondary btn-xs" data-tree-clear-selection="true" title="Back to overview">✕</button></div>` +
      (comm ? `<div class="tree-insp-pill">r/${escapeHtml(comm.slug)}</div>` : `<div class="tree-insp-pill">${escapeHtml(branch?.isPoll ? "poll" : post?.category ?? "thought")}</div>`) +
      `<div class="tree-insp-body">${escapeHtml(cut(caption || "(Media post)", 280))}</div>` +
      `<div class="tree-insp-metrics"><span>♥ ${likes}</span><span>💬 ${comments.length}</span><span>🔁 ${branch?.repostsCount ?? 0}</span></div>` +
      `<div class="tree-insp-actions">` +
      `<button type="button" class="btn-primary btn-sm" data-tree-open-post="${escapeHtml(selection.postId)}" data-tree-author="${escapeHtml(selection.author)}">Open Post in Feed →</button>` +
      `<button type="button" class="btn-secondary btn-sm" data-tree-open-profile="${escapeHtml(selection.author)}">View Author</button>` +
      `<button type="button" class="btn-secondary btn-sm" data-tree-focus-author="${escapeHtml(selection.author)}">✨ Trace Author Sap</button>` +
      `</div>` +
      (commentItems.length
        ? `<div class="tree-insp-subhead">Leaves on this branch (${comments.length})</div><div class="tree-insp-leaf-list">${commentItems.join("")}</div>`
        : `<p class="tree-insp-hint">No reply leaves on this branch yet.</p>`) +
      `</div>`
    );
  }

  if (selection.type === "comment") {
    const post = rawPosts.find((p) => p.id === selection.postId);
    const comment = Object.values(post?.comments ?? {}).find((c) => c.id === selection.commentId);
    const authorName = getDisplayName(selection.author);
    const text = comment ? plainMentions(comment.text, getDisplayName) : "";
    const parentPreview = post ? plainMentions(post.caption || "", getDisplayName) : "";

    return (
      `<div class="tree-insp-card">` +
      `<div class="tree-insp-head"><div><div class="tree-insp-kicker">Comment Leaf</div><h4 class="tree-insp-title">🍃 ${escapeHtml(authorName)}</h4></div><button type="button" class="btn-secondary btn-xs" data-tree-clear-selection="true" title="Back to overview">✕</button></div>` +
      `<div class="tree-insp-body">${escapeHtml(cut(text || "(Reply)", 280))}</div>` +
      (parentPreview ? `<div class="tree-insp-quote">On branch: ${escapeHtml(cut(parentPreview, 110))}</div>` : "") +
      `<div class="tree-insp-actions">` +
      (post ? `<button type="button" class="btn-primary btn-sm" data-tree-open-post="${escapeHtml(post.id)}" data-tree-author="${escapeHtml(post.author)}">Open Thread in Feed →</button>` : "") +
      (post ? `<button type="button" class="btn-secondary btn-sm" data-tree-select-post="${escapeHtml(post.id)}" data-tree-author="${escapeHtml(post.author)}">↑ Select Parent Branch</button>` : "") +
      `<button type="button" class="btn-secondary btn-sm" data-tree-open-profile="${escapeHtml(selection.author)}">View Commenter</button>` +
      `</div>` +
      `</div>`
    );
  }

  if (selection.type === "root") {
    const root = model.roots.find((r) => r.pubkey === selection.pubkey);
    const name = root?.name || getDisplayName(selection.pubkey);
    const tierLabel = root?.isMe
      ? "You (Taproot)"
      : root?.trustTier === 1
        ? "Followed Root (Tier 1)"
        : root?.trustTier === 2
          ? "Friend of Friend / Supporter (Tier 2)"
          : "Discovered Peer";
    const linfaTotal = root?.linfaTotal ?? 0;

    return (
      `<div class="tree-insp-card">` +
      `<div class="tree-insp-head"><div><div class="tree-insp-kicker">Underground Root</div><h4 class="tree-insp-title">${escapeHtml(name)}</h4></div><button type="button" class="btn-secondary btn-xs" data-tree-clear-selection="true" title="Back to overview">✕</button></div>` +
      `<div class="tree-insp-mono">${escapeHtml(shortenKey(selection.pubkey))}</div>` +
      `<div class="tree-insp-pill">${escapeHtml(tierLabel)}</div>` +
      `<div class="tree-insp-mini-plant">${plantSvg(selection.pubkey, linfaTotal)}</div>` +
      `<div class="tree-insp-metrics"><span>🌿 ${round1(linfaTotal)} Linfa</span><span>🪵 ${root?.postCount ?? 0} posts</span><span>🍃 ${root?.commentCount ?? 0} replies</span></div>` +
      `<div class="tree-insp-actions">` +
      `<button type="button" class="btn-primary btn-sm" data-tree-open-profile="${escapeHtml(selection.pubkey)}">Open Profile →</button>` +
      `<button type="button" class="btn-secondary btn-sm" data-tree-focus-author="${escapeHtml(selection.pubkey)}">✨ Highlight Sap Activity</button>` +
      `</div>` +
      `</div>`
    );
  }

  // selection.type === "bough"
  const bough = model.boughs.find((b) => b.id === selection.boughId);
  const comm = bough?.isCommunity ? communities.find((c) => c.id === bough.id) : undefined;
  return (
    `<div class="tree-insp-card">` +
    `<div class="tree-insp-head"><div><div class="tree-insp-kicker">${bough?.isCommunity ? "Community Bough" : "Category Bough"}</div><h4 class="tree-insp-title">${escapeHtml(bough?.label ?? selection.boughId)}</h4></div><button type="button" class="btn-secondary btn-xs" data-tree-clear-selection="true" title="Back to overview">✕</button></div>` +
    (comm?.description ? `<div class="tree-insp-body">${escapeHtml(cut(comm.description, 220))}</div>` : "") +
    `<div class="tree-insp-metrics"><span>🪵 ${bough?.postCount ?? 0} branches</span>${bough?.isCommunity ? `<span>👥 ${bough.memberCount} members</span>` : ""}</div>` +
    `<div class="tree-insp-actions">` +
    (comm ? `<button type="button" class="btn-primary btn-sm" data-tree-open-comm="${escapeHtml(comm.id)}">Open r/${escapeHtml(comm.slug)} →</button>` : "") +
    (comm ? `<button type="button" class="btn-secondary btn-sm" data-tree-filter-comm="${escapeHtml(comm.id)}">Filter Tree to Bough</button>` : "") +
    `</div>` +
    `</div>`
  );
}
