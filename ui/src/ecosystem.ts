// The Freenet apps Radica works with, and how to support its development: a quiet footer in the right panel and a
// card on the Updates page. Apps with a known site key open on the reader's own node; the others on their repository.
import { FREEPOLLS_SITE } from "./freepolls.ts";
import { FREENAMES_KEY } from "./freenames.ts";
import { DELTA_WEB } from "./delta.ts";
import { VISO_KEY } from "./whoiam.ts";
import { FREETUNES_SITE } from "./freetunes.ts";
import { ASOCIAL_SITE, ASOCIAL_REPO } from "./asocial.ts";
import { FH_SITE, FH_REPO } from "./fh.ts";
import { FREEHOLE_SITE, FREEHOLE_REPO, WORMHOLE_SITE, WORMHOLE_REPO } from "./wormhole.ts";
import { FREETREE_SITE, FREETREE_REPO } from "./freetree.ts";
import { FREENET_MAIL_CONTAINER_KEY } from "./freenetMail.ts";
import { escapeHtml as esc } from "./html.ts";

export const SUPPORT_URL = "https://buymeacoffee.com/scobru";
export const DONATE_URL = "https://scobru.github.io/radica/donate/";
export const ORTO_SITE = "9eBjDkH6ZXA6ehUyWBBjT6Xg4tQE4ALZjSsgXERds4yZ";
export { FREEHOLE_SITE, FREEHOLE_REPO, WORMHOLE_SITE, WORMHOLE_REPO } from "./wormhole.ts";
export { FREETREE_SITE, FREETREE_REPO } from "./freetree.ts";

export interface EcosystemApp {
  name: string;
  what: string;
  /** Site key on Freenet (opens on the reader's node), when known. */
  key?: string;
  /** Repository, used when there is no site key. */
  repo: string;
  /** Project author or maintainer */
  author?: string;
  /** App relationship: 'integrated' (connected directly in Radica) or 'affiliated' (autonomous sister / companion dApp) */
  category?: "integrated" | "affiliated";
}

export const ECOSYSTEM: EcosystemApp[] = [
  { name: "River", what: "group chat; Radica's private rooms are River rooms", repo: "https://github.com/freenet/river", author: "Freenet core", category: "integrated" },
  { name: "Freenet Mail", what: "decentralized post-quantum encrypted email", key: FREENET_MAIL_CONTAINER_KEY, repo: "https://github.com/freenet/mail", author: "Freenet core", category: "integrated" },
  { name: "Viso", what: "identity and sign-in", key: VISO_KEY, repo: "https://github.com/scobru/viso", author: "by @scobru", category: "integrated" },
  { name: "FreeTunes", what: "music releases, played inside posts", key: FREETUNES_SITE, repo: "https://github.com/scobru/freetunes", author: "by @scobru", category: "integrated" },
  { name: "FreePolls", what: "anonymous polls in posts and chat", key: FREEPOLLS_SITE, repo: "https://github.com/scobru/freepolls", author: "by @scobru", category: "integrated" },
  { name: "FreeNames", what: "short names, profile sites and resolved links in posts", key: FREENAMES_KEY, repo: "https://github.com/scobru/freenames", author: "by @scobru", category: "integrated" },
  { name: "Delta", what: "blogs linked from profiles", key: DELTA_WEB, repo: "https://github.com/freenet/delta", author: "Freenet core", category: "integrated" },
  { name: "Orto", what: "encrypted organizer; reads your Radica feed in its Feeds tab", key: ORTO_SITE, repo: "https://github.com/scobru/orto", author: "by @scobru", category: "integrated" },
  { name: "Asocial", what: "browser & HTML5 games, played inside posts", key: ASOCIAL_SITE, repo: ASOCIAL_REPO, author: "by porky11", category: "integrated" },
  { name: "Fisherman's Horizon", what: "curate & pin Freenet sites; shared bookmark lists", key: FH_SITE, repo: FH_REPO, author: "by @scobru", category: "integrated" },
  { name: "FreeHole", what: "sovereign P2P & Freenet file transfer; send & receive files via mnemonic codes", key: FREEHOLE_SITE, repo: FREEHOLE_REPO, author: "by @scobru", category: "integrated" },
  { name: "Freetree", what: "decentralized linktree; transforms Delta link pages into profile hubs", key: FREETREE_SITE, repo: FREETREE_REPO, author: "by @scobru", category: "integrated" },
  { name: "Spore", what: "sovereign P2P desktop music client; Soulseek-style crate digging & library sharing on Freenet", repo: "https://github.com/scobru/spore", author: "by @scobru", category: "affiliated" },
];

const hrefOf = (app: EcosystemApp, origin: string) => (app.key ? `${origin}/v1/contract/web/${app.key}/#/` : app.repo);
const link = (href: string, label: string, cls: string, title = "") =>
  `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ""}>${esc(label)}</a>`;

/** One quiet line under the right panel: the apps, then the support links. */
export function ecosystemFooter(origin: string): string {
  const apps = ECOSYSTEM.map((a) => link(hrefOf(a, origin), a.name, "eco-link", a.what)).join(`<span aria-hidden="true"> · </span>`);
  return `<div>Built on Freenet with ${apps}</div><div>${link(DONATE_URL, "🌱 Become a Supporter", "eco-link eco-supporter")} <span aria-hidden="true">·</span> ${link(SUPPORT_URL, "\u2615 Support Radica (Coffee)", "eco-link eco-support")}</div>`;
}

/** The longer version for the Updates page: what each app does, and the support options. */
export function ecosystemCard(origin: string): string {
  const rows = ECOSYSTEM.map((a) => {
    const isScobru = a.author === "by @scobru";
    const badgeCls = isScobru ? "eco-author-badge eco-author-scobru" : "eco-author-badge";
    const authorBadge = a.author ? `<span class="${badgeCls}">${esc(a.author)}</span>` : "";
    const typeBadge = a.category === "affiliated"
      ? `<span class="eco-type-badge eco-type-affiliated" title="Autonomous sovereign dApp in the Freenet ecosystem">Affiliated App</span>`
      : "";
    return `<li>${link(hrefOf(a, origin), a.name, "eco-name")}${authorBadge}${typeBadge} <span class="eco-what">${esc(a.what)}</span></li>`;
  }).join("");
  return `
    <div class="eco-support-box">
      <h4>Support Radica</h4>
      <p class="eco-note">Radica is 100% decentralized, open-source and maintained independently. You can support its development in two ways:</p>
      <div class="eco-support-options">
        <div class="eco-support-card">
          <div class="eco-support-card-title">🌱 Become a Radica Supporter</div>
          <p class="eco-support-card-desc">Support on Base with USDC. Get an on-chain zero-knowledge proof unlocking the <b>✨ Supporter badge</b>, voting rights in <b>🌱 Greenhouse</b>, and instant Web-of-Trust verification without anti-bot delays.</p>
          <div class="eco-support-card-actions">
            <a class="btn-primary btn-sm eco-donate-btn" href="${esc(DONATE_URL)}" target="_blank" rel="noopener noreferrer">🌱 Donate on Base &amp; get proof</a>
            <button type="button" class="btn-secondary btn-sm" id="eco-open-identity-support-btn">Manage badge / GhostKey</button>
          </div>
        </div>
        <div class="eco-support-card">
          <div class="eco-support-card-title">☕ Buy me a coffee</div>
          <p class="eco-support-card-desc">Quick fiat donation to fuel independent development and ongoing improvements.</p>
          <div class="eco-support-card-actions">
            ${link(SUPPORT_URL, "\u2615 Buy me a coffee", "btn-secondary btn-sm eco-support-btn")}
          </div>
        </div>
      </div>
    </div>
    <div class="eco-apps-box">
      <h4>Works with &amp; Affiliated Apps</h4>
      <p class="eco-note">Radica connects seamlessly with these decentralized apps on Freenet, alongside affiliated sovereign desktop and companion dApps created by Radica's creator (@scobru) and community contributors:</p>
      <ul class="eco-list">${rows}</ul>
    </div>
  `;
}
