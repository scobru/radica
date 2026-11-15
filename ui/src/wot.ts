// Web-of-Trust (WoT) Dislike & Reputation Engine for Radica.
//
// In decentralized, censorship-resistant networks like Freenet, anonymous accounts can be spawned at zero cost (Sybil attacks).
// A flat 1-account = 1-vote downvote system is vulnerable to brigading and coordinated trolling.
//
// Radica's Web-of-Trust evaluates reactions subjectively through the reader's own social graph:
// - Tier 1 (Direct Trust / "Roots"): People the reader follows directly, plus the reader's trusted curators.
// - Tier 2 (Extended Trust): People followed by Tier 1 peers (friends of friends).
// - Outsiders (Tier 0): Unknown personas outside the reader's network. Their dislikes carry zero penalty weight.
//
// Furthermore, community creators and moderators act as Tier 1 authorities within their respective community posts.

export interface PostReactionEvaluation {
  wotScore: number;
  trustedLikers: string[];
  trustedDislikers: string[];
  isPenalized: boolean;
  penaltyReason: string | null;
}

export interface TrustBadgeInfo {
  tier: 0 | 1 | 2;
  isTrusted: boolean;
  label: string;
  badgeClass: string;
  icon: string;
  description: string;
}

export class WebOfTrust {
  public readonly me: string;
  public readonly tier1: Set<string>;
  public readonly tier2: Set<string>;
  public readonly supporters: Set<string>;
  /** People a Freenet GhostKey vouches for: trusted like supporters. */
  public readonly ghostkeys: Set<string>;
  /** People verified by an anonymous Viso Proof-of-Personhood (e.g. GitHub): trusted against Sybils. */
  public readonly humans: Set<string>;

  constructor(
    me: string,
    directFollowing: string[],
    trustedCurators: string[] = [],
    followingOf: (pubkey: string) => string[] = () => [],
    supporters: string[] = [],
    ghostkeys: string[] = [],
    humans: string[] = []
  ) {
    this.me = me;
    this.supporters = new Set(supporters);
    this.ghostkeys = new Set(ghostkeys);
    this.humans = new Set(humans);
    this.tier1 = new Set([me, ...directFollowing, ...trustedCurators]);

    // Build Tier 2 from connections of Tier 1 members
    this.tier2 = new Set<string>();
    for (const pk of this.tier1) {
      if (pk === me) continue;
      const peers = followingOf(pk) || [];
      for (const p of peers) {
        if (!this.tier1.has(p)) {
          this.tier2.add(p);
        }
      }
    }
  }

  public trustTier(pubkey: string): 0 | 1 | 2 {
    if (this.tier1.has(pubkey)) return 1;
    if (this.tier2.has(pubkey) || this.supporters.has(pubkey) || this.ghostkeys.has(pubkey) || this.humans.has(pubkey)) return 2;
    return 0;
  }

  /** What a like from `pubkey` counts for me: my roots (and a community's moderators) 2, friends of friends and supporters 1, strangers 0. */
  public likeWeight(pubkey: string, isMod = false): number {
    return this.tier1.has(pubkey) || isMod ? 2 : this.trustTier(pubkey) === 2 ? 1 : 0;
  }

  /** The same for a dislike: 3, 1.5, 0 (a direct contact's dislike is a strong signal). */
  public dislikeWeight(pubkey: string, isMod = false): number {
    return this.tier1.has(pubkey) || isMod ? 3 : this.trustTier(pubkey) === 2 ? 1.5 : 0;
  }

  public isTrusted(pubkey: string): boolean {
    return this.tier1.has(pubkey) || this.tier2.has(pubkey) || this.supporters.has(pubkey) || this.ghostkeys.has(pubkey) || this.humans.has(pubkey);
  }

  /**
   * Whether someone else I trust follows `pubkey`. For my own key this is what "trusted" should mean: I am always in my
   * own Tier 1, so isTrusted(me) is always true and would lift every newcomer limit.
   */
  public vouches(pubkey: string, followers: string[]): boolean {
    return followers.some((k) => k !== pubkey && this.isTrusted(k));
  }

  public trustBadge(pubkey: string): TrustBadgeInfo {
    const tier = this.trustTier(pubkey);
    // a verified supporter shows it even when they are also in my roots (or are me)
    if (this.supporters.has(pubkey)) {
      return {
        tier,
        isTrusted: true,
        label: "Supporter",
        badgeClass: "badge-trusted-tier2 badge-trusted-supporter",
        icon: "✨",
        description: tier === 1 ? (pubkey === this.me ? "Your profile · Verified Radica supporter" : "Verified Radica supporter · in your roots") : "Verified Radica supporter",
      };
    }
    if (this.ghostkeys.has(pubkey)) {
      return {
        tier,
        isTrusted: true,
        label: "GhostKey",
        badgeClass: "badge-trusted-tier2 badge-ghostkey",
        icon: "👻",
        description: "Vouched for by a Freenet GhostKey",
      };
    }
    if (this.humans.has(pubkey)) {
      return {
        tier,
        isTrusted: true,
        label: "Verified Human",
        badgeClass: "badge-trusted-tier2 badge-poh-human",
        icon: "🛡️",
        description: tier === 1 ? (pubkey === this.me ? "Your profile · Anonymous Proof-of-Personhood via Viso (GitHub)" : "Anonymous Proof-of-Personhood via Viso (GitHub) · in your roots") : "Anonymous Proof-of-Personhood via Viso (GitHub)",
      };
    }
    if (tier === 1) {
      return {
        tier: 1,
        isTrusted: true,
        label: "Rooted",
        badgeClass: "badge-trusted-tier1",
        icon: "🌿",
        description: pubkey === this.me ? "Your profile" : "Direct root connection (Web-of-Trust Tier 1)",
      };
    }
    if (tier === 2) {
      return {
        tier: 2,
        isTrusted: true,
        label: "Trusted",
        badgeClass: "badge-trusted-tier2",
        icon: "🌱",
        description: "Extended Web-of-Trust (Friend of a friend)",
      };
    }
    return {
      tier: 0,
      isTrusted: false,
      label: "New",
      badgeClass: "badge-untrusted",
      icon: "✨",
      description: "Outside your Web-of-Trust (New peer / Pending connection)",
    };
  }

  /**
   * Evaluates a post against this reader's Web-of-Trust.
   *
   * Outsider dislikes have 0 weight and cannot penalize a post.
   * Direct contacts (Tier 1) and Community Moderators have full weight.
   * Extended contacts (Tier 2) have fractional weight.
   */
  public evaluatePost(
    post: { id: string; author: string; community_id?: string },
    likers: string[],
    dislikers: string[],
    communityMods: string[] = []
  ): PostReactionEvaluation {
    const modSet = new Set(communityMods.filter((m) => m !== "system"));

    const trustedLikers: string[] = [];
    const trustedDislikers: string[] = [];

    let positiveScore = 0;
    let negativeScore = 0;

    // Evaluate likes
    for (const liker of likers) {
      const w = this.likeWeight(liker, modSet.has(liker));
      if (w > 0) {
        trustedLikers.push(liker);
        positiveScore += w;
      }
    }

    // Evaluate dislikes
    for (const disliker of dislikers) {
      const w = this.dislikeWeight(disliker, modSet.has(disliker));
      if (w > 0) {
        trustedDislikers.push(disliker);
        negativeScore += w;
      }
      // outsiders weigh nothing
    }

    const wotScore = positiveScore - negativeScore;

    // A post is penalized if trusted negative signals outweigh trusted positive signals
    const isPenalized =
      trustedDislikers.length > 0 &&
      negativeScore > positiveScore;

    let penaltyReason: string | null = null;
    if (isPenalized) {
      penaltyReason =
        trustedDislikers.length === 1
          ? "Disliked by a contact in your Web-of-Trust"
          : `Disliked by ${trustedDislikers.length} contacts in your Web-of-Trust`;
    }

    return {
      wotScore,
      trustedLikers,
      trustedDislikers,
      isPenalized,
      penaltyReason,
    };
  }
}

