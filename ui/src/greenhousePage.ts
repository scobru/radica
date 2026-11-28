// The Greenhouse page: plant a seed (an idea or a bug), vote on the open ones, and (the maintainer) mark what became of
// them. Supporters, GhostKey holders, and members with Sapling+ Linfa plant and vote; anyone can read. main.ts calls initGreenhouse once.
import { freenet } from "./freenet.ts";
import { safeStorage } from "./storage";
import { escapeHtml } from "./html.ts";
import { confirmDialog, promptDialog, showToast } from "./dialogs.ts";
import { renderChatText } from "./caption.ts";
import { verifyReceipt, supporterStorageKey, type SupporterTier } from "./supporter.ts";
import { analyzeTextContent, maskProfanity } from "./moderation.ts";
import {
  classifySeed,
  filterAndGroupSeeds,
  foldGreenhouse,
  formatSeedsForAi,
  greenhousePermalink,
  greenhouseTokens,
  MAX_COMMENT,
  pickDefaultBucket,
  SEED_BUCKETS,
  SEED_DAYS,
  SEED_STATUSES,
  TIER_WEIGHT,
  type Seed,
  type SeedBucket,
  type SeedComment,
  type SeedKind,
  type SeedSort,
} from "./greenhouse.ts";
import { AI_REPORTERS, RADICA_MAINTAINER } from "./types.ts";
import { verifiedGhostkeys } from "./ghostkey.ts";
import { verifiedPohs, parseStoredPoh } from "./viso.ts";
import { renderIcon } from "./icons.ts";

export interface GreenhouseLinfaInfo {
  weights: Map<string, number>;
  myStage?: string;
  myTotal?: number;
}

let whoAmI: () => string | null = () => null;
let displayName: (pubkey: string) => string = (pk) => pk.slice(0, 8);
let linfaForAuthors: (authors: string[]) => Promise<GreenhouseLinfaInfo> = async () => ({ weights: new Map() });
let showToastNotice: ((msg: string, type?: "info" | "warning" | "error") => void) | undefined;
let myLinfaWeight = 0;
let isHidden: (author: string) => boolean = () => false;
let isReported: (target: string) => boolean = () => false;
let hideAuthor: ((author: string) => void) | undefined;
let reportComment: ((author: string, id: string, reason: string) => Promise<void>) | undefined;
let requireIdentity: ((action?: string) => boolean) | undefined;
let shouldMaskBadWords: () => boolean = () => true;
let targetSeedToFocus: string | null = null;
let activeBucket: SeedBucket = "voting";
let userPickedTab = false;
let kindFilter: "all" | SeedKind = "all";
let searchQuery = "";
let sortOverride: SeedSort | "" = "";
let composerOpen = false;
let lastCanVote = false;
let lastMe = "";
const verified = new Map<string, SupporterTier | null>(); // `${author}|${token}` -> tier, or null when it does not verify

const BUCKET_META: Record<SeedBucket, string> = {
  voting: "🗳️ Voting",
  planned: "🗓️ Planned",
  done: "✅ Done",
  archive: "📦 Archive",
};

const myGhostkey = (): string | null => {
  const me = whoAmI();
  return me ? safeStorage.getItem(`radica_ghostkey_${me}`) : null;
};

const myPoh = (): string | null => {
  const me = whoAmI();
  return me ? (parseStoredPoh(safeStorage.getItem(`radica_poh_${me}`))?.proof ?? null) : null;
};

const myToken = (): string | null => {
  const me = whoAmI();
  return me ? safeStorage.getItem(supporterStorageKey(me)) : null;
};

async function tiers(): Promise<(author: string) => SupporterTier | undefined> {
  const tokens = greenhouseTokens(freenet.greenhouseEntries());
  const me = whoAmI();
  const mine = myToken();
  if (me && mine) tokens.set(me, mine); // my own receipt counts here before my first entry carries it
  await Promise.all(
    [...tokens].map(async ([author, token]) => {
      const k = `${author}|${token}`;
      if (!verified.has(k)) verified.set(k, await verifyReceipt(token, author).then((r) => r.tier, () => null));
    })
  );
  // a verified Freenet GhostKey votes with the top weight: it is Freenet's own donor proof
  const ghosts = new Set(await verifiedGhostkeys(freenet.ghostkeyBundles()).catch(() => [] as string[]));
  if (me && myGhostkey()) ghosts.add(me);
  // an anonymous Viso Proof-of-Personhood holder votes against Sybils with Sprout weight (1 vote per human)
  const humans = new Set(await verifiedPohs(freenet.pohProofs()).catch(() => [] as string[]));
  if (me && myPoh()) humans.add(me);
  return (author) => {
    if (ghosts.has(author) || author === RADICA_MAINTAINER) return "oak"; // the maintainer votes with the top weight too
    const t = tokens.get(author);
    return (t && verified.get(`${author}|${t}`)) || (humans.has(author) ? "sprout" : undefined);
  };
}

const left = (ms: number) => {
  const h = Math.ceil(ms / 3_600_000);
  return h > 48 ? `${Math.ceil(h / 24)} days left` : `${h} h left`;
};

function commentHtml(c: SeedComment, _seedId: string, me: string): string {
  const others = c.author !== me;
  return `<div class="gh-comment"><span class="author-clickable" data-author="${escapeHtml(c.author)}"><b>${escapeHtml(displayName(c.author))}</b></span> ${renderChatText(c.text, displayName)}
    ${others ? `<button type="button" class="btn-secondary btn-xs" data-gh-report="${escapeHtml(c.id)}" data-gh-author="${escapeHtml(c.author)}" aria-label="Report comment">Report</button><button type="button" class="btn-secondary btn-xs" data-gh-hide="${escapeHtml(c.author)}" aria-label="Hide author">Hide author</button>` : ""}
  </div>`;
}

function seedHtml(s: Seed, canVote: boolean, isMaintainer: boolean, me = ""): string {
  const bucket = classifySeed(s);
  const open = s.closes > Date.now();
  const outcome = open ? left(s.closes - Date.now()) : s.up > s.down ? "🌱 Sprouted" : "🥀 Withered";
  const titleText = shouldMaskBadWords() ? maskProfanity(s.title) : s.title;
  const vote = (v: 1 | -1, label: string, title: string) =>
    `<button type="button" class="btn-secondary btn-xs${s.mine === v ? " active" : ""}" data-gh-vote="${v}" data-gh-seed="${escapeHtml(s.id)}" title="${title}" ${canVote && open ? "" : "disabled"}>${label}</button>`;
  const statusPill = s.status
    ? `<span class="gh-status-pill" data-status="${s.status}">${SEED_STATUSES[s.status]}</span>`
    : "";
  const statusSelect = isMaintainer
    ? `<select class="gh-status" data-gh-seed="${escapeHtml(s.id)}" aria-label="Status"><option value="">No status</option>${Object.entries(SEED_STATUSES)
        .map(([k, l]) => `<option value="${k}"${s.status === k ? " selected" : ""}>${l}</option>`)
        .join("")}</select>`
    : "";
  const others = s.author !== me;
  const modBtns = others
    ? `<button type="button" class="btn-secondary btn-xs" data-gh-report-seed="${escapeHtml(s.id)}" data-gh-author="${escapeHtml(s.author)}" aria-label="Report proposal">Report</button><button type="button" class="btn-secondary btn-xs" data-gh-hide="${escapeHtml(s.author)}" aria-label="Hide author">Hide author</button>`
    : "";
  const classes = [
    "gh-seed",
    bucket === "done" ? "gh-seed-done" : "",
    bucket === "archive" ? "gh-archived" : "",
    !open && bucket === "archive" ? "closed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const statusAttr = s.status ? ` data-status="${s.status}"` : "";
  return `<div class="${classes}" id="gh-seed-${escapeHtml(s.id)}" data-gh-seed="${escapeHtml(s.id)}"${statusAttr}>
    <div class="gh-seed-head"><span class="identity-badge">${s.kind === "bug" ? "🐛 Bug" : "💡 Feature"}</span><strong>${escapeHtml(titleText)}</strong>${statusPill}</div>
    ${s.text ? `<div class="gh-seed-text">${renderChatText(s.text, displayName)}</div>` : ""}
    <div class="gh-seed-meta">by <span class="author-clickable" data-author="${escapeHtml(s.author)}">${escapeHtml(displayName(s.author))}</span> · ${outcome} · ${s.voters} ${s.voters === 1 ? "voter" : "voters"} ${statusSelect}</div>
    <div class="gh-seed-votes">
      ${vote(1, `▲ ${s.up}`, s.kind === "bug" ? "Me too" : "I want this")}${s.kind === "feature" ? vote(-1, `▼ ${s.down}`, "I don't want this") : ""}
      <button type="button" class="btn-secondary btn-xs gh-share-btn" data-gh-share="${escapeHtml(s.id)}" data-gh-title="${escapeHtml(titleText)}" title="Share link to this proposal" aria-label="Share proposal">
        ${renderIcon("share2", { className: "icon-xs" })} Share
      </button>
      <button type="button" class="btn-secondary btn-xs gh-copy-ai-btn" data-gh-copy="${escapeHtml(s.id)}" title="Copy proposal formatted for an AI agent" aria-label="Copy proposal for AI">
        🤖 Copy for AI
      </button>
      ${modBtns}
    </div>
    <details class="gh-comments" data-gh-comments="${escapeHtml(s.id)}">
      <summary>💬 ${s.comments.length} ${s.comments.length === 1 ? "comment" : "comments"}</summary>
      ${s.comments.map((c) => commentHtml(c, s.id, me)).join("")}
      ${canVote ? `<form class="gh-comment-form" data-gh-seed="${escapeHtml(s.id)}"><input name="text" maxlength="${MAX_COMMENT}" placeholder="Write a comment…" autocomplete="off" required /><button type="submit" class="btn-primary btn-xs">Send</button></form>` : ""}
    </details>
  </div>`;
}

function emptyBucketHtml(bucket: SeedBucket, grouped: Record<SeedBucket, Seed[]>): string {
  if (lastRenderedSeeds.length === 0) {
    return `<div class="gh-empty"><p>Nothing planted yet.</p></div>`;
  }
  const hasFilters = kindFilter !== "all" || searchQuery.trim().length > 0;
  const otherNonEmpty = SEED_BUCKETS.filter((b) => b !== bucket && grouped[b].length > 0);
  if (otherNonEmpty.length > 0) {
    return `<div class="gh-empty">
      <p>No proposals in ${BUCKET_META[bucket]}${hasFilters ? " matching your filters" : ""}.</p>
      <div class="gh-empty-jumps">${otherNonEmpty
        .map((b) => `<button type="button" class="btn-secondary btn-xs gh-jump-tab" data-gh-jump="${b}">View ${BUCKET_META[b]} (${grouped[b].length})</button>`)
        .join("")}</div>
    </div>`;
  }
  return `<div class="gh-empty">
    <p>No proposals match your current filter or search.</p>
    <div class="gh-empty-jumps"><button type="button" class="btn-secondary btn-xs gh-reset-filters-btn">Clear filters</button></div>
  </div>`;
}

function syncTabsAndPanels(focusTab = false): void {
  const tablist = document.getElementById("greenhouse-tabs");
  tablist?.querySelectorAll<HTMLButtonElement>("[data-gh-tab]").forEach((tab) => {
    const selected = tab.dataset.ghTab === activeBucket;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) {
      tab.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (focusTab) tab.focus();
    }
  });
  const list = document.getElementById("greenhouse-list");
  list?.querySelectorAll<HTMLElement>("[data-gh-panel]").forEach((panel) => {
    const selected = panel.dataset.ghPanel === activeBucket;
    if (selected) {
      panel.removeAttribute("hidden");
      if (!panel.querySelector("a, button, input, select, textarea, summary, [tabindex]")) {
        panel.tabIndex = 0;
      } else {
        panel.removeAttribute("tabindex");
      }
    } else {
      panel.setAttribute("hidden", "until-found");
      panel.removeAttribute("tabindex");
    }
  });
}

function selectBucket(bucket: SeedBucket, focusTab = false): void {
  activeBucket = bucket;
  syncTabsAndPanels(focusTab);
}

function resetFiltersAndPaint(): void {
  kindFilter = "all";
  searchQuery = "";
  const chips = document.getElementById("greenhouse-kind-filters");
  chips?.querySelectorAll<HTMLButtonElement>("[data-gh-kind]").forEach((btn) => {
    const active = btn.dataset.ghKind === "all";
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  const searchEl = document.getElementById("greenhouse-search") as HTMLInputElement | null;
  if (searchEl) searchEl.value = "";
  paintGreenhouse(false);
}

function paintGreenhouse(allowAutoBucket = false): void {
  const list = document.getElementById("greenhouse-list");
  if (!list) return;
  const grouped = filterAndGroupSeeds(lastRenderedSeeds, {
    kind: kindFilter,
    query: searchQuery,
    sort: sortOverride || undefined,
    displayName,
  });
  if (allowAutoBucket && !userPickedTab && !targetSeedToFocus && lastRenderedSeeds.length > 0) {
    activeBucket = pickDefaultBucket(grouped);
  }
  for (const b of SEED_BUCKETS) {
    const countEl = document.querySelector<HTMLElement>(`[data-gh-count="${b}"]`);
    if (countEl) countEl.textContent = String(grouped[b].length);
  }
  // a redraw must not close an open thread or eat a half-written comment
  const kept = new Map<string, { open: boolean; draft: string }>();
  list.querySelectorAll<HTMLElement>("details.gh-comments").forEach((d) =>
    kept.set(d.dataset.ghComments!, { open: (d as HTMLDetailsElement).open, draft: d.querySelector<HTMLInputElement>("input[name=text]")?.value ?? "" })
  );
  const isMaintainer = lastMe === RADICA_MAINTAINER;
  list.innerHTML = SEED_BUCKETS.map((b) => {
    const bucketSeeds = grouped[b];
    let innerHtml: string;
    if (bucketSeeds.length === 0) {
      innerHtml = emptyBucketHtml(b, grouped);
    } else if (b === "planned") {
      const planned = bucketSeeds.filter((s) => s.status === "planned");
      const considering = bucketSeeds.filter((s) => s.status === "considering");
      if (planned.length > 0 && considering.length > 0) {
        innerHtml =
          `<h4 class="gh-subhead">🗓️ Planned (${planned.length})</h4>` +
          planned.map((s) => seedHtml(s, lastCanVote, isMaintainer, lastMe)).join("") +
          `<h4 class="gh-subhead">🔍 Considering (${considering.length})</h4>` +
          considering.map((s) => seedHtml(s, lastCanVote, isMaintainer, lastMe)).join("");
      } else {
        innerHtml = bucketSeeds.map((s) => seedHtml(s, lastCanVote, isMaintainer, lastMe)).join("");
      }
    } else {
      innerHtml = bucketSeeds.map((s) => seedHtml(s, lastCanVote, isMaintainer, lastMe)).join("");
    }
    const isSelected = b === activeBucket;
    return `<section role="tabpanel" id="gh-panel-${b}" aria-labelledby="gh-tab-${b}" data-gh-panel="${b}"${isSelected ? "" : ' hidden="until-found"'}><div class="gh-panel-body">${innerHtml}</div></section>`;
  }).join("");
  syncTabsAndPanels(false);
  restoreThreads(list, kept);
}

/** Redraw the page from the log as it is here (a refresh from the network redraws it again when it lands). */
export async function renderGreenhouse(): Promise<void> {
  const list = document.getElementById("greenhouse-list");
  if (!list) return;
  const me = whoAmI() ?? "";
  const entries = freenet.greenhouseEntries();
  const authors = [...new Set([...entries.map((e) => e.author), ...(me ? [me] : [])])];
  const [tierOf, linfaInfo] = await Promise.all([
    tiers(),
    linfaForAuthors(authors).catch(() => ({ weights: new Map<string, number>() }) as GreenhouseLinfaInfo),
  ]);
  myLinfaWeight = me ? (linfaInfo.weights.get(me) ?? 0) : 0;
  const canVote = Boolean(tierOf(me) || myLinfaWeight > 0);
  lastCanVote = canVote;
  lastMe = me;
  if (!canVote) composerOpen = false;
  const plantBtn = document.getElementById("greenhouse-plant-btn") as HTMLButtonElement | null;
  if (plantBtn) {
    plantBtn.style.display = canVote ? "" : "none";
    plantBtn.setAttribute("aria-expanded", String(canVote && composerOpen));
  }
  const form = document.getElementById("greenhouse-form") as HTMLFormElement | null;
  const gate = document.getElementById("greenhouse-gate");
  if (form) form.hidden = !(canVote && composerOpen);
  if (gate) {
    gate.style.display = canVote ? "none" : "";
    if (!canVote) {
      const progress = linfaInfo.myStage ? ` (your plant: <b>${escapeHtml(linfaInfo.myStage)}</b>, ${Math.floor(linfaInfo.myTotal ?? 0)} / 12 Linfa)` : "";
      gate.innerHTML = `Anyone can read. To plant and vote, grow your <b>🌱 Linfa</b> to <b>Sapling</b> (12+ pts with replies or likes from your network)${progress}, or verify via <b>Identity → Support Radica</b> (Supporter badge, Freenet GhostKey, or Viso Human Proof).`;
    }
  }
  const seeds = foldGreenhouse(entries, tierOf, me, RADICA_MAINTAINER, (a) => linfaInfo.weights.get(a) ?? 0, AI_REPORTERS, (author, target) => isHidden(author) || isReported(target));
  lastRenderedSeeds = seeds;
  paintGreenhouse(true);
}

let lastRenderedSeeds: Seed[] = [];

function restoreThreads(list: HTMLElement, kept: Map<string, { open: boolean; draft: string }>): void {
  list.querySelectorAll<HTMLDetailsElement>("details.gh-comments").forEach((d) => {
    const k = kept.get(d.dataset.ghComments!);
    if (!k) return;
    d.open = k.open;
    const input = d.querySelector<HTMLInputElement>("input[name=text]");
    if (input) input.value = k.draft;
  });
}

async function append(body: object): Promise<void> {
  const token = myToken();
  if (!token && !myGhostkey() && !myPoh() && whoAmI() !== RADICA_MAINTAINER && myLinfaWeight <= 0) return;
  await freenet.greenhouseAppend(token ? { ...body, receipt: token } : body); // a GhostKey's proof is on the ghostkeys log, and Linfa is checked from signed posts
  // not awaited: the redraw reads every author's feed (slow), and callers must empty their box before it keeps drafts
  void renderGreenhouse().catch((err) => console.warn("Greenhouse redraw failed:", err));
}

async function copyTextWithFeedback(text: string, btn: HTMLButtonElement | null, toastMsg: string, shareMeta?: { title: string; text: string; url: string }): Promise<void> {
  const markCopied = () => {
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML = `${renderIcon("check", { className: "icon-xs" })} Copied!`;
      setTimeout(() => { btn.innerHTML = origHtml; }, 2000);
    }
    showToastNotice?.(toastMsg, "info");
  };
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      markCopied();
      return;
    }
  } catch {}
  if (shareMeta && typeof navigator.share === "function") {
    try {
      await navigator.share(shareMeta);
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    }
  }
  await promptDialog("Copy to clipboard:", { defaultValue: text, readOnly: true });
}

async function handleShareSeed(btn: HTMLButtonElement): Promise<void> {
  const seedId = btn.dataset.ghShare;
  if (!seedId) return;
  const title = btn.dataset.ghTitle || "Greenhouse Proposal";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const permalink = greenhousePermalink(seedId, `${origin}${pathname}`);
  await copyTextWithFeedback(permalink, btn, "Greenhouse proposal link copied to clipboard!", {
    title: `Radica Greenhouse: ${title}`,
    text: `Vote on "${title}" in the Radica Greenhouse`,
    url: permalink,
  });
}

export function focusGreenhouseSeed(seedId: string): boolean {
  const list = document.getElementById("greenhouse-list");
  if (!list) return false;
  let card =
    list.querySelector<HTMLElement>(`[data-gh-seed="${CSS.escape(seedId)}"]`) ||
    document.getElementById(`gh-seed-${seedId}`);
  if (!card && lastRenderedSeeds.some((s) => s.id === seedId) && (kindFilter !== "all" || searchQuery.trim())) {
    resetFiltersAndPaint();
    card =
      list.querySelector<HTMLElement>(`[data-gh-seed="${CSS.escape(seedId)}"]`) ||
      document.getElementById(`gh-seed-${seedId}`);
  }
  if (card) {
    const panel = card.closest<HTMLElement>("[data-gh-panel]");
    const bucket = panel?.dataset.ghPanel as SeedBucket | undefined;
    if (bucket && SEED_BUCKETS.includes(bucket) && bucket !== activeBucket) {
      userPickedTab = true;
      selectBucket(bucket, false);
    }
    card.scrollIntoView({ block: "center", behavior: "smooth" });
    card.classList.add("notif-flash");
    setTimeout(() => card.classList.remove("notif-flash"), 2500);
    return true;
  }
  return false;
}

export function initGreenhouse(deps: {
  whoAmI: () => string | null;
  displayName: (pubkey: string) => string;
  isHidden?: (author: string) => boolean; // hidden or blocked authors, by me or by the moderation I follow
  isReported?: (target: string) => boolean; // `${author}:${comment id}` reported by a curator or held by the AI helper
  hideAuthor?: (author: string) => void;
  report?: (author: string, id: string, reason: string) => Promise<void>;
  requireIdentity?: (action?: string) => boolean;
  linfaForAuthors?: (authors: string[]) => Promise<GreenhouseLinfaInfo>;
  showToast?: (msg: string, type?: "info" | "warning" | "error") => void;
  shouldMaskBadWords?: () => boolean;
}): void {
  whoAmI = deps.whoAmI;
  displayName = deps.displayName;
  if (deps.linfaForAuthors) linfaForAuthors = deps.linfaForAuthors;
  showToastNotice = deps.showToast;
  if (deps.isHidden) isHidden = deps.isHidden;
  if (deps.isReported) isReported = deps.isReported;
  if (deps.shouldMaskBadWords) shouldMaskBadWords = deps.shouldMaskBadWords;
  hideAuthor = deps.hideAuthor;
  reportComment = deps.report;
  requireIdentity = deps.requireIdentity;
  const days = document.getElementById("greenhouse-days") as HTMLSelectElement | null;
  if (days) days.innerHTML = SEED_DAYS.map((d) => `<option value="${d}"${d === 14 ? " selected" : ""}>${d} days</option>`).join("");
  const weights = document.getElementById("greenhouse-weights");
  if (weights) weights.textContent = `Votes weigh by supporter tier or Linfa age (whichever is higher): 🌱 Sprout / Sapling / Young tree ${TIER_WEIGHT.sprout}, 🌿 Root / Tree ${TIER_WEIGHT.root}, 🌳 Oak / 👻 GhostKey / 🌲 Elder tree ${TIER_WEIGHT.oak}.`;

  const form = document.getElementById("greenhouse-form") as HTMLFormElement | null;
  const plantBtn = document.getElementById("greenhouse-plant-btn") as HTMLButtonElement | null;
  const cancelBtn = document.getElementById("greenhouse-form-cancel") as HTMLButtonElement | null;
  const setComposerOpen = (open: boolean) => {
    composerOpen = open;
    if (form) form.hidden = !(lastCanVote && composerOpen);
    plantBtn?.setAttribute("aria-expanded", String(lastCanVote && composerOpen));
    if (open) form?.querySelector<HTMLInputElement>("input[name=title]")?.focus();
  };
  plantBtn?.addEventListener("click", () => setComposerOpen(!composerOpen));
  cancelBtn?.addEventListener("click", () => {
    form?.reset();
    if (days) days.value = "14";
    setComposerOpen(false);
    plantBtn?.focus();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get("title") ?? "").trim();
    const text = String(fd.get("text") ?? "").trim();
    if (!title) return;
    const check = analyzeTextContent(`${title}\n${text}`);
    if (
      (check.containsPII || check.isToxic) &&
      !(await confirmDialog(
        `${check.warnings.join("\n") || "This proposal may contain personal data or abusive language."}\n\nPlant it anyway?`,
        { okLabel: "Plant anyway" }
      ))
    ) {
      return;
    }
    const btn = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (btn) btn.disabled = true;
    try {
      await append({ type: "seed", kind: fd.get("kind") === "bug" ? "bug" : "feature", title, text, days: Number(fd.get("days")) });
      form.reset();
      if (days) days.value = "14";
      setComposerOpen(false);
      userPickedTab = true;
      selectBucket("voting", false);
      showToastNotice?.("Seed planted in 🗳️ Voting!", "info");
    } catch (err) {
      showToast(`Could not plant it: ${(err as Error).message || err}`, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  const tablist = document.getElementById("greenhouse-tabs");
  tablist?.addEventListener("click", (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-gh-tab]");
    const bucket = tab?.dataset.ghTab as SeedBucket | undefined;
    if (!bucket || !SEED_BUCKETS.includes(bucket)) return;
    userPickedTab = true;
    selectBucket(bucket, false);
  });
  tablist?.addEventListener("keydown", (e) => {
    const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>("[data-gh-tab]"));
    if (!tabs.length) return;
    const curIdx = Math.max(0, tabs.findIndex((t) => t === document.activeElement || t.dataset.ghTab === activeBucket));
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (curIdx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIdx = (curIdx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabs.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const bucket = tabs[nextIdx]?.dataset.ghTab as SeedBucket | undefined;
    if (bucket && SEED_BUCKETS.includes(bucket)) {
      userPickedTab = true;
      selectBucket(bucket, true);
    }
  });

  const kindGroup = document.getElementById("greenhouse-kind-filters");
  kindGroup?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-gh-kind]");
    if (!btn) return;
    const nextKind = (btn.dataset.ghKind as "all" | SeedKind) || "all";
    if (nextKind === kindFilter) return;
    kindFilter = nextKind;
    kindGroup.querySelectorAll<HTMLButtonElement>("[data-gh-kind]").forEach((b) => {
      const active = b === btn;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    paintGreenhouse(false);
  });

  const searchInput = document.getElementById("greenhouse-search") as HTMLInputElement | null;
  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value;
    paintGreenhouse(false);
  });

  const sortSelect = document.getElementById("greenhouse-sort") as HTMLSelectElement | null;
  sortSelect?.addEventListener("change", () => {
    sortOverride = sortSelect.value as SeedSort | "";
    paintGreenhouse(false);
  });

  const list = document.getElementById("greenhouse-list");
  list?.addEventListener("beforematch", (e: Event) => {
    const panel = (e.target as HTMLElement).closest<HTMLElement>("[data-gh-panel]");
    const bucket = panel?.dataset.ghPanel as SeedBucket | undefined;
    if (bucket && SEED_BUCKETS.includes(bucket) && bucket !== activeBucket) {
      userPickedTab = true;
      selectBucket(bucket, false);
    }
  });
  list?.addEventListener("submit", async (e) => {
    const f = (e.target as HTMLElement).closest<HTMLFormElement>(".gh-comment-form");
    if (!f) return;
    e.preventDefault();
    const text = String(new FormData(f).get("text") ?? "").trim();
    if (!text) return;
    // on-device check: personal data or abusive wording is worth a second look before it goes to everyone
    const check = analyzeTextContent(text);
    if ((check.containsPII || check.isToxic) && !(await confirmDialog(`${check.warnings.join("\n") || "This comment may contain personal data or abusive language."}\n\nPost it anyway?`, { okLabel: "Post anyway" }))) return;
    const btn = f.querySelector<HTMLButtonElement>("button[type=submit]");
    if (btn) btn.disabled = true;
    // emptied before sending: the redraw after it keeps whatever an open box still holds as a draft
    f.reset();
    try {
      await append({ type: "comment", seed: f.dataset.ghSeed, text });
    } catch (err) {
      const box = f.querySelector<HTMLInputElement>("input[name=text]");
      if (box && !box.value) box.value = text;
      showToast(`Could not comment: ${(err as Error).message || err}`, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  list?.addEventListener("click", (e) => {
    const jumpBtn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-gh-jump]");
    if (jumpBtn) {
      const bucket = jumpBtn.dataset.ghJump as SeedBucket | undefined;
      if (bucket && SEED_BUCKETS.includes(bucket)) {
        userPickedTab = true;
        selectBucket(bucket, true);
      }
      return;
    }
    if ((e.target as HTMLElement).closest(".gh-reset-filters-btn")) {
      resetFiltersAndPaint();
      return;
    }
    const repSeedBtn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-gh-report-seed]");
    if (repSeedBtn) {
      if (requireIdentity && !requireIdentity("report content")) return;
      const author = repSeedBtn.dataset.ghAuthor!;
      const seedId = repSeedBtn.dataset.ghReportSeed!;
      const entryId = seedId.startsWith(`${author}:`) ? seedId.slice(author.length + 1) : seedId;
      void promptDialog(`Report this proposal by ${displayName(author)}?\n\nWhy (spam, abuse, illegal content…)? It is hidden for you and for whoever trusts your blocklist; Radica's moderators are notified.`, { okLabel: "Report" }).then((reason) => {
        if (reason !== null) {
          void reportComment?.(author, entryId, reason.trim()).then(
            () => {
              showToastNotice?.("Proposal reported and hidden.", "info");
              return renderGreenhouse();
            },
            (err) => showToast(`Could not report it: ${err.message || err}`, "error")
          );
        }
      });
      return;
    }
    const repBtn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-gh-report]");
    if (repBtn) {
      if (requireIdentity && !requireIdentity("report content")) return;
      const [author, target] = [repBtn.dataset.ghAuthor!, repBtn.dataset.ghReport!];
      void promptDialog(`Report this comment by ${displayName(author)}?\n\nWhy (spam, abuse, illegal content…)? It is hidden for you and for whoever trusts your blocklist; Radica's moderators are notified.`, { okLabel: "Report" }).then((reason) => {
        if (reason !== null) void reportComment?.(author, target, reason.trim()).then(renderGreenhouse, (err) => showToast(`Could not report it: ${err.message || err}`, "error"));
      });
      return;
    }
    const hideBtn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-gh-hide]");
    if (hideBtn) {
      hideAuthor?.(hideBtn.dataset.ghHide!);
      void renderGreenhouse();
      return;
    }
    const voteBtn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-gh-vote]");
    if (voteBtn) {
      const v = Number(voteBtn.dataset.ghVote);
      // pressing my current vote again takes it back
      void append({ type: "vote", seed: voteBtn.dataset.ghSeed, v: voteBtn.classList.contains("active") ? 0 : v }).catch((err) => showToast(`Could not vote: ${err.message || err}`, "error"));
      return;
    }
    const shareBtn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-gh-share]");
    if (shareBtn) {
      void handleShareSeed(shareBtn);
      return;
    }
    const copyBtn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-gh-copy]");
    if (copyBtn) {
      const seed = lastRenderedSeeds.find((s) => s.id === copyBtn.dataset.ghCopy);
      if (seed) void copyTextWithFeedback(formatSeedsForAi([seed], displayName), copyBtn, "Proposal copied for AI agent!");
      return;
    }
  });
  const exportAiBtn = document.getElementById("greenhouse-export-ai-btn") as HTMLButtonElement | null;
  exportAiBtn?.addEventListener("click", () => {
    void copyTextWithFeedback(formatSeedsForAi(lastRenderedSeeds, displayName, true), exportAiBtn, "Open & planned Greenhouse proposals copied for AI agent!");
  });
  list?.addEventListener("change", (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>(".gh-status");
    if (!sel) return;
    const val = sel.value as keyof typeof SEED_STATUSES | "";
    const msg =
      val === "done"
        ? "Marked ✅ Done — moved to Done tab"
        : val === "planned"
          ? "Marked 🗓️ Planned — moved to Planned tab"
          : val === "considering"
            ? "Marked 🔍 Considering — moved to Planned tab"
            : val === "not-now"
              ? "Marked 💤 Not now — moved to Archive tab"
              : "Status cleared";
    void freenet
      .greenhouseAppend({ type: "status", seed: sel.dataset.ghSeed, status: val || null })
      .then(async () => {
        await renderGreenhouse();
        showToastNotice?.(msg, "info");
      })
      .catch((err) => showToast(`Could not update status: ${(err as Error).message || err}`, "error"));
  });
}

const greenhouseLoaderHtml = (msg = "Loading Greenhouse proposals…") =>
  `<div class="greenhouse-loader" role="status" aria-live="polite"><div class="boot-bar"><span></span></div><p>${msg}</p></div>`;

/** Open the page: draw what is here, then what the network has. */
export async function openGreenhouse(targetSeedId?: string): Promise<void> {
  if (targetSeedId) targetSeedToFocus = targetSeedId;
  const list = document.getElementById("greenhouse-list");
  const hadSeeds = !!list?.querySelector(".gh-seed");
  if (list && !hadSeeds) {
    list.innerHTML = greenhouseLoaderHtml("Loading Greenhouse proposals…");
  }
  await renderGreenhouse();
  if (targetSeedToFocus && focusGreenhouseSeed(targetSeedToFocus)) {
    targetSeedToFocus = null;
  }
  if (list && !list.querySelector(".gh-seed")) {
    list.innerHTML = greenhouseLoaderHtml("Fetching proposals from the network…");
  }
  await freenet.refreshLog("greenhouse").catch(() => {});
  await renderGreenhouse();
  if (targetSeedToFocus) {
    focusGreenhouseSeed(targetSeedToFocus);
    targetSeedToFocus = null;
  }
}
