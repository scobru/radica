// The Freenet apps Radica works with, and how to support its development: a quiet footer in the right panel and a
// card on the Updates page. Apps with a known site key open on the reader's own node; the others on their repository.
import type { IconName } from "./icons.ts";
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
export const AULA_SITE = "GbG8dmva2QsVJMqCnv9iTXwwdbVjKMfZcTRCF94oTUes";
export const HIVE_SITE = "AqiX61ZEVgTVWudkbTqDv8w57vsQ24ZhjytEGVwzas7A";
export const ATLAS_SITE = "771DvtPMwt2PumPyrFvsz7fpvU1gogcmb5qtS1yYEEH9";
export const FOLIO_SITE = "pzYToSx8kK9xZmc1a5A4nvwy1npgcMMedA4xj7cLaqK";
export { FREEHOLE_SITE, FREEHOLE_REPO, WORMHOLE_SITE, WORMHOLE_REPO } from "./wormhole.ts";
export { FREETREE_SITE, FREETREE_REPO } from "./freetree.ts";

export type AppGroup = "communication" | "media" | "tools" | "identity";
export type AppFilter = "all" | "pinned" | "node" | "builtin";

export interface CustomAppRecord {
  id: string;
  name: string;
  what: string;
  key: string;
}

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
  /** Functional launcher category */
  group?: AppGroup;
  /** Existing SVG icon name from icons.ts */
  icon?: IconName;
  /** Built-in Radica rail button ID when the app also has an integrated in-app view */
  builtInBtn?: string;
  /** User-added custom Freenet site */
  custom?: boolean;
  /** Generic, function-first heading shown ONLY in the Apps launcher grid (e.g. "Chat" for River), with `name`
   *  (the actual product) shown underneath it there. Everywhere else (search, footer, tests) still uses `name`. */
  launcherLabel?: string;
}

export const ECOSYSTEM: EcosystemApp[] = [
  { name: "River", launcherLabel: "Chat", what: "group chat", key: "raAqMhMG7KUpXBU2SxgCQ3Vh4PYjttxdSWd9ftV7RLv", repo: "https://github.com/freenet/river", author: "Freenet core", category: "integrated", group: "communication", icon: "messageSquare", builtInBtn: "open-chat-btn" },
  { name: "Freenet Mail", launcherLabel: "Mail", what: "decentralized post-quantum encrypted email", key: FREENET_MAIL_CONTAINER_KEY, repo: "https://github.com/freenet/mail", author: "Freenet core", category: "integrated", group: "communication", icon: "messageCircle", builtInBtn: "open-mail-btn" },
  { name: "Viso", launcherLabel: "Identity", what: "identity and sign-in", key: VISO_KEY, repo: "https://github.com/scobru/viso", author: "by @scobru", category: "integrated", group: "identity", icon: "shield" },
  { name: "FreeTunes", launcherLabel: "Music", what: "music releases, played inside posts", key: FREETUNES_SITE, repo: "https://github.com/scobru/freetunes", author: "by @scobru", category: "integrated", group: "media", icon: "music", builtInBtn: "open-music-btn" },
  { name: "FreePolls", launcherLabel: "Polls", what: "anonymous polls in posts and chat", key: FREEPOLLS_SITE, repo: "https://github.com/scobru/freepolls", author: "by @scobru", category: "integrated", group: "tools", icon: "barChart2" },
  { name: "FreeNames", launcherLabel: "Names", what: "short names, profile sites and resolved links in posts", key: FREENAMES_KEY, repo: "https://github.com/scobru/freenames", author: "by @scobru", category: "integrated", group: "identity", icon: "globe" },
  { name: "Delta", launcherLabel: "Blog", what: "blogs linked from profiles", key: DELTA_WEB, repo: "https://github.com/freenet/delta", author: "Freenet core", category: "integrated", group: "media", icon: "fileText" },
  { name: "Orto", launcherLabel: "Organizer", what: "encrypted organizer; reads your Radica feed in its Feeds tab", key: ORTO_SITE, repo: "https://github.com/scobru/orto", author: "by @scobru", category: "integrated", group: "tools", icon: "calendar" },
  { name: "Asocial", launcherLabel: "Games", what: "browser & HTML5 games, played inside posts", key: ASOCIAL_SITE, repo: ASOCIAL_REPO, author: "by porky11", category: "integrated", group: "media", icon: "smile" },
  { name: "Fisherman's Horizon", launcherLabel: "Bookmarks", what: "curate & pin Freenet sites; shared bookmark lists", key: FH_SITE, repo: FH_REPO, author: "by @scobru", category: "integrated", group: "tools", icon: "bookmark" },
  { name: "FreeHole", launcherLabel: "File Transfer", what: "sovereign P2P & Freenet file transfer; send & receive files via mnemonic codes", key: FREEHOLE_SITE, repo: FREEHOLE_REPO, author: "by @scobru", category: "integrated", group: "tools", icon: "share2" },
  { name: "Freetree", launcherLabel: "Linktree", what: "decentralized linktree; transforms Delta link pages into profile hubs", key: FREETREE_SITE, repo: FREETREE_REPO, author: "by @scobru", category: "integrated", group: "identity", icon: "link" },
  { name: "Aula", launcherLabel: "Classroom", what: "decentralized classroom & coursework on Freenet (classes, assignments, grades)", key: AULA_SITE, repo: "https://github.com/scobru/aula", author: "by @scobru", category: "affiliated", group: "tools", icon: "layers" },
  { name: "Hive", launcherLabel: "Git", what: "decentralized Git & code collaboration on Freenet", key: HIVE_SITE, repo: "", author: "by @holdmylatte", category: "affiliated", group: "tools", icon: "folder" },
  { name: "Atlas", launcherLabel: "Web App", what: "companion Freenet web app launched directly on your local node", key: ATLAS_SITE, repo: "", category: "affiliated", group: "tools", icon: "globe" },
  { name: "Folio", launcherLabel: "Write Article", what: "account-free Markdown writer: get a radica-article: token to paste into any post", key: FOLIO_SITE, repo: "", author: "by @scobru", category: "integrated", group: "media", icon: "fileText" },
];

export const RADICA_BUILTIN_APPS: EcosystemApp[] = [
  {
    name: "Moments",
    what: "photo & video moments gallery + vertical Reels player (Instagram-style)",
    repo: "https://github.com/scobru/radica",
    author: "Radica built-in",
    category: "integrated",
    group: "media",
    icon: "image",
    builtInBtn: "open-media-btn",
  },
  {
    name: "Communities",
    what: "decentralized r/forums, threads, voting & community hubs (Reddit-style)",
    repo: "https://github.com/scobru/radica",
    author: "Radica built-in",
    category: "integrated",
    group: "communication",
    icon: "users",
    builtInBtn: "open-communities-btn",
  },
  {
    name: "Articles",
    what: "long-form Markdown articles & decentralized newsletters inside Radica",
    repo: "https://github.com/scobru/radica",
    author: "Radica built-in",
    category: "integrated",
    group: "media",
    icon: "fileText",
    builtInBtn: "open-articles-btn",
  },
];

export const LAUNCHER_APPS: EcosystemApp[] = [...RADICA_BUILTIN_APPS, ...ECOSYSTEM];

export const hrefOf = (app: EcosystemApp, origin: string): string => (app.key ? `${origin}/v1/contract/web/${app.key}/#/` : app.repo);

export function appId(app: Pick<EcosystemApp, "name" | "key">): string {
  return app.key || app.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Accepts a bare Base58 contract key or a `/v1/contract/web/<key>` URL and returns the normalized key, or `""` if invalid. */
export function normalizeSiteKey(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const urlMatch = s.match(/\/v1\/contract\/web\/([1-9A-HJ-NP-Za-km-z]{16,80})/);
  if (urlMatch) return urlMatch[1];
  return /^[1-9A-HJ-NP-Za-km-z]{16,80}$/.test(s) ? s : "";
}

export function customRecordToApp(rec: CustomAppRecord): EcosystemApp {
  return {
    name: rec.name,
    what: rec.what || "Custom Freenet site",
    key: rec.key,
    repo: "",
    author: "Custom",
    category: "affiliated",
    group: "tools",
    icon: "globe",
    custom: true,
  };
}

export function filterLauncherApps(
  apps: EcosystemApp[],
  opts: { query?: string; filter?: AppFilter; pinned?: Set<string> } = {}
): EcosystemApp[] {
  const q = (opts.query || "").trim().toLowerCase();
  const filter = opts.filter || "all";
  const pinned = opts.pinned || new Set<string>();
  const filtered = apps.filter((a) => {
    if (filter === "pinned" && !pinned.has(appId(a))) return false;
    if (filter === "node" && !a.key) return false;
    if (filter === "builtin" && !a.builtInBtn) return false;
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      (a.launcherLabel || "").toLowerCase().includes(q) ||
      a.what.toLowerCase().includes(q) ||
      (a.author || "").toLowerCase().includes(q) ||
      (a.key || "").toLowerCase().includes(q)
    );
  });
  return filtered.sort((a, b) => Number(pinned.has(appId(b))) - Number(pinned.has(appId(a))));
}
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
