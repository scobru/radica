import test from "node:test";
import assert from "node:assert/strict";
import {
  renderAnteBadgeHtml,
  renderPohProviderBadgesHtml,
  renderPostSubMetaHtml,
  renderTrustBadgeHtml,
} from "../src/badges.ts";

test("badges: trust badges wrap label inside .badge-label and skip Rooted when requested", () => {
  const rooted = {
    label: "Rooted",
    badgeClass: "badge-trusted-tier1",
    icon: "🌿",
    description: "Direct root connection",
  };
  assert.equal(renderTrustBadgeHtml(rooted, { skipRooted: true }), "");
  const rootedShown = renderTrustBadgeHtml(rooted);
  assert.match(rootedShown, /class="gram-trust-badge badge-trusted-tier1"/);
  assert.match(rootedShown, /<span class="badge-icon" aria-hidden="true">🌿<\/span><span class="badge-label">Rooted<\/span>/);

  const supporter = {
    label: "Supporter",
    badgeClass: "badge-trusted-tier2 badge-trusted-supporter",
    icon: "✨",
    description: 'Verified "Radica" supporter',
  };
  const html = renderTrustBadgeHtml(supporter, { skipRooted: true });
  assert.match(html, /title="Verified &#34;Radica&#34; supporter"/);
  assert.match(html, /<span class="badge-label">Supporter<\/span>/);
});

test("badges: PoH provider badges and ante commitment badges preserve icon/short-bits structure", () => {
  const poh = renderPohProviderBadgesHtml({
    github: true,
    google: true,
    githubIcon: "<svg data-ic='gh'></svg>",
    googleIcon: "<svg data-ic='g'></svg>",
  });
  assert.match(poh, /badge-github-poh[\s\S]*<svg data-ic='gh'><\/svg><span class="badge-label">GitHub<\/span>/);
  assert.match(poh, /badge-google-poh[\s\S]*<svg data-ic='g'><\/svg><span class="badge-label">Google<\/span>/);

  assert.equal(renderAnteBadgeHtml(undefined, null), "");
  const ante = renderAnteBadgeHtml(25, { id: "gold", label: "Veteran" });
  assert.match(ante, /class="gram-trust-badge badge-ante-gold"/);
  assert.match(ante, /<span class="badge-label-long">Veteran · <\/span><span class="badge-ante-bits">25b<\/span>/);
});

test("badges: post sub-meta groups community, mod, category, repost, and NSFW pills", () => {
  assert.equal(renderPostSubMetaHtml({ category: "thought" }), "");
  const html = renderPostSubMetaHtml({
    communityId: "c_radica",
    communitySlug: "radica",
    authorIsMod: true,
    category: "moment",
    categoryIconHtml: "<svg data-cat='moment'></svg>",
    isRepost: true,
    repostIconHtml: "<svg data-rep='1'></svg>",
    isNsfw: true,
  });
  assert.match(html, /class="comm-badge community-link" data-community="c_radica"[^>]*>r\/radica<\/span>/);
  assert.match(html, /class="gram-trust-badge badge-mod" title="Moderator of r\/radica">mod<\/span>/);
  assert.match(html, /class="gram-category-tag moment" title="moment"><svg data-cat='moment'><\/svg><\/span>/);
  assert.match(html, /class="gram-category-tag repost"[^>]*><svg data-rep='1'><\/svg> reposted<\/span>/);
  assert.match(html, /class="gram-category-tag nsfw"[^>]*>NSFW<\/span>/);
});
