import { escapeHtml } from "./html.ts";
import type { PostCategory } from "./types.ts";
import type { TrustBadgeInfo } from "./wot.ts";

/** Render a Web-of-Trust / Supporter / GhostKey / PoH trust pill with semantic label spans for mobile compaction. */
export function renderTrustBadgeHtml(
  trust: Pick<TrustBadgeInfo, "label" | "badgeClass" | "icon" | "description">,
  opts?: { skipRooted?: boolean },
): string {
  if (opts?.skipRooted && trust.label === "Rooted") return "";
  return `<span class="gram-trust-badge ${escapeHtml(trust.badgeClass)}" title="${escapeHtml(trust.description)}" aria-label="${escapeHtml(trust.label)}"><span class="badge-icon" aria-hidden="true">${trust.icon}</span><span class="badge-label">${escapeHtml(trust.label)}</span></span>`;
}

/** Render anonymous Viso Proof-of-Personhood provider badges (GitHub / Google) with compact-friendly labels. */
export function renderPohProviderBadgesHtml(opts: {
  github: boolean;
  google: boolean;
  githubIcon: string;
  googleIcon: string;
}): string {
  const parts: string[] = [];
  if (opts.github) {
    parts.push(
      `<span class="gram-trust-badge badge-github-poh" title="Verified GitHub account (≥ 1 year old) via Anonymous Viso PoH" aria-label="Verified GitHub">${opts.githubIcon}<span class="badge-label">GitHub</span></span>`,
    );
  }
  if (opts.google) {
    parts.push(
      `<span class="gram-trust-badge badge-google-poh" title="Verified Google account via Anonymous Viso PoH" aria-label="Verified Google">${opts.googleIcon}<span class="badge-label">Google</span></span>`,
    );
  }
  return parts.join("");
}

/** Render a Viso ante commitment PoW badge, keeping the bit count visible on narrow mobile headers. */
export function renderAnteBadgeHtml(
  bits: number | undefined,
  tier: { id: string; label: string } | null,
): string {
  if (!tier || bits === undefined) return "";
  return `<span class="gram-trust-badge badge-ante-${escapeHtml(tier.id)}" title="Verified Viso ante PoW commitment (${bits} bits)" aria-label="${escapeHtml(tier.label)} ${bits} bits"><span class="badge-icon" aria-hidden="true">⚡</span><span class="badge-label-long">${escapeHtml(tier.label)} · </span><span class="badge-ante-bits">${bits}b</span></span>`;
}

/** Render the secondary post context row (community link, mod pill, category/repost/NSFW markers). */
export function renderPostSubMetaHtml(opts: {
  communityId?: string;
  communitySlug?: string;
  authorIsMod?: boolean;
  category: PostCategory;
  categoryIconHtml?: string;
  isRepost?: boolean;
  repostIconHtml?: string;
  isNsfw?: boolean;
}): string {
  const parts: string[] = [];
  const slug = opts.communitySlug || (opts.communityId ? opts.communityId.replace(/^c_/, "") : "");
  if (opts.communityId && slug) {
    parts.push(
      `<span class="comm-badge community-link" data-community="${escapeHtml(opts.communityId)}" title="View Community">r/${escapeHtml(slug)}</span>`,
    );
  }
  if (opts.authorIsMod && slug) {
    parts.push(
      `<span class="gram-trust-badge badge-mod" title="Moderator of r/${escapeHtml(slug)}">mod</span>`,
    );
  }
  if (opts.category !== "thought" && opts.categoryIconHtml) {
    parts.push(
      `<span class="gram-category-tag ${escapeHtml(opts.category)}" title="${escapeHtml(opts.category)}">${opts.categoryIconHtml}</span>`,
    );
  }
  if (opts.isRepost && opts.repostIconHtml) {
    parts.push(
      `<span class="gram-category-tag repost" title="Shares someone's post">${opts.repostIconHtml} reposted</span>`,
    );
  }
  if (opts.isNsfw) {
    parts.push(
      `<span class="gram-category-tag nsfw" title="18+ Adult Content (Moderated On-Device)">NSFW</span>`,
    );
  }
  return parts.join("");
}
