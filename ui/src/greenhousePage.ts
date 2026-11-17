// The Greenhouse page: plant a seed (an idea or a bug), vote on the open ones, and (the maintainer) mark what became of
// them. Supporters, GhostKey holders, and members with Sapling+ Linfa plant and vote; anyone can read. main.ts calls initGreenhouse once.
import { freenet } from "./freenet.ts";
import { safeStorage } from "./storage";
import { escapeHtml } from "./html.ts";
import { renderChatText } from "./caption.ts";
import { verifyReceipt, supporterStorageKey, type SupporterTier } from "./supporter.ts";
import { analyzeTextContent } from "./moderation.ts";
import { foldGreenhouse, MAX_COMMENT, type SeedComment, formatSeedsForAi, greenhouseTokens, greenhousePermalink, SEED_DAYS, SEED_STATUSES, TIER_WEIGHT, type Seed } from "./greenhouse.ts";
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
let targetSeedToFocus: string | null = null;
const verified = new Map<string, SupporterTier | null>(); // `${author}|${token}` -> tier, or null when it does not verify

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

function commentHtml(c: SeedComment, seedId: string, me: string): string {
  const others = c.author !== me;
  return `<div class="gh-comment"><span class="author-clickable" data-author="${escapeHtml(c.author)}"><b>${escapeHtml(displayName(c.author))}</b></span> ${renderChatText(c.text, displayName)}
    ${others ? `<button type="button" class="btn-secondary btn-xs" data-gh-report="${escapeHtml(c.id)}" data-gh-author="${escapeHtml(c.author)}">Report</button><button type="button" class="btn-secondary btn-xs" data-gh-hide="${escapeHtml(c.author)}">Hide author</button>` : ""}
  </div>`;
}

function seedHtml(s: Seed, canVote: boolean, isMaintainer: boolean, me = ""): string {
  const open = s.closes > Date.now();
  const outcome = open ? left(s.closes - Date.now()) : s.up > s.down ? "🌱 Sprouted" : "🥀 Withered";
  const vote = (v: 1 | -1, label: string, title: string) =>
    `<button type="button" class="btn-secondary btn-xs${s.mine === v ? " active" : ""}" data-gh-vote="${v}" data-gh-seed="${escapeHtml(s.id)}" title="${title}" ${canVote && open ? "" : "disabled"}>${label}</button>`;
  const status = isMaintainer
    ? `<select class="gh-status" data-gh-seed="${escapeHtml(s.id)}" aria-label="Status"><option value="">No status</option>${Object.entries(SEED_STATUSES)
        .map(([k, l]) => `<option value="${k}"${s.status === k ? " selected" : ""}>${l}</option>`)
        .join("")}</select>`
    : s.status
      ? `<span class="identity-badge">${SEED_STATUSES[s.status]}</span>`
      : "";
  return `<div class="gh-seed${open ? "" : " closed"}" id="gh-seed-${escapeHtml(s.id)}" data-gh-seed="${escapeHtml(s.id)}">
    <div class="gh-seed-head"><span class="identity-badge">${s.kind === "bug" ? "🐛 Bug" : "💡 Feature"}</span><strong>${escapeHtml(s.title)}</strong></div>
    ${s.text ? `<div class="gh-seed-text">${renderChatText(s.text, displayName)}</div>` : ""}
    <div class="gh-seed-meta">by <span class="author-clickable" data-author="${escapeHtml(s.author)}">${escapeHtml(displayName(s.author))}</span> · ${outcome} · ${s.voters} ${s.voters === 1 ? "voter" : "voters"} ${status}</div>
    <div class="gh-seed-votes">
      ${vote(1, `▲ ${s.up}`, s.kind === "bug" ? "Me too" : "I want this")}${s.kind === "feature" ? vote(-1, `▼ ${s.down}`, "I don't want this") : ""}
      <button type="button" class="btn-secondary btn-xs gh-share-btn" data-gh-share="${escapeHtml(s.id)}" data-gh-title="${escapeHtml(s.title)}" title="Share link to this proposal">
        ${renderIcon("share2", { className: "icon-xs" })} Share
      </button>
      <button type="button" class="btn-secondary btn-xs gh-copy-ai-btn" data-gh-copy="${escapeHtml(s.id)}" title="Copy proposal formatted for an AI agent">
        🤖 Copy for AI
      </button>
    </div>
    <details class="gh-comments" data-gh-comments="${escapeHtml(s.id)}">
      <summary>💬 ${s.comments.length} ${s.comments.length === 1 ? "comment" : "comments"}</summary>
      ${s.comments.map((c) => commentHtml(c, s.id, me)).join("")}
      ${canVote ? `<form class="gh-comment-form" data-gh-seed="${escapeHtml(s.id)}"><input name="text" maxlength="${MAX_COMMENT}" placeholder="Write a comment…" autocomplete="off" required /><button type="submit" class="btn-primary btn-xs">Send</button></form>` : ""}
    </details>
  </div>`;
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
  const form = document.getElementById("greenhouse-form") as HTMLFormElement | null;
  const gate = document.getElementById("greenhouse-gate");
  if (form) form.style.display = canVote ? "flex" : "none";
  if (gate) {
    gate.style.display = canVote ? "none" : "";
    if (!canVote) {
      const progress = linfaInfo.myStage ? ` (your plant: <b>${escapeHtml(linfaInfo.myStage)}</b>, ${Math.floor(linfaInfo.myTotal ?? 0)} / 12 Linfa)` : "";
      gate.innerHTML = `Anyone can read. To plant and vote, grow your <b>🌱 Linfa</b> to <b>Sapling</b> (12+ pts with replies or likes from your network)${progress}, or verify via <b>Identity → Support Radica</b> (Supporter badge, Freenet GhostKey, or Viso Human Proof).`;
    }
  }
  const seeds = foldGreenhouse(entries, tierOf, me, RADICA_MAINTAINER, (a) => linfaInfo.weights.get(a) ?? 0, AI_REPORTERS, (author, target) => isHidden(author) || isReported(target));
  lastRenderedSeeds = seeds;
  // a redraw must not close an open thread or eat a half-written comment
  const kept = new Map<string, { open: boolean; draft: string }>();
  list.querySelectorAll<HTMLElement>("details.gh-comments").forEach((d) =>
    kept.set(d.dataset.ghComments!, { open: (d as HTMLDetailsElement).open, draft: d.querySelector<HTMLInputElement>("input[name=text]")?.value ?? "" })
  );
  list.innerHTML = seeds.length ? seeds.map((s) => seedHtml(s, canVote, me === RADICA_MAINTAINER, me)).join("") : `<p style="color: var(--text-muted); font-size: 0.85rem;">Nothing planted yet.</p>`;
  restoreThreads(list, kept);
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
  await renderGreenhouse();
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
  prompt("Copy to clipboard:", text);
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
  const card =
    list.querySelector<HTMLElement>(`[data-gh-seed="${CSS.escape(seedId)}"]`) ||
    document.getElementById(`gh-seed-${seedId}`);
  if (card) {
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
  linfaForAuthors?: (authors: string[]) => Promise<GreenhouseLinfaInfo>;
  showToast?: (msg: string, type?: "info" | "warning" | "error") => void;
}): void {
  whoAmI = deps.whoAmI;
  displayName = deps.displayName;
  if (deps.linfaForAuthors) linfaForAuthors = deps.linfaForAuthors;
  showToastNotice = deps.showToast;
  if (deps.isHidden) isHidden = deps.isHidden;
  if (deps.isReported) isReported = deps.isReported;
  hideAuthor = deps.hideAuthor;
  reportComment = deps.report;
  const days = document.getElementById("greenhouse-days") as HTMLSelectElement | null;
  if (days) days.innerHTML = SEED_DAYS.map((d) => `<option value="${d}"${d === 14 ? " selected" : ""}>${d} days</option>`).join("");
  const weights = document.getElementById("greenhouse-weights");
  if (weights) weights.textContent = `Votes weigh by supporter tier or Linfa age (whichever is higher): 🌱 Sprout / Sapling / Young tree ${TIER_WEIGHT.sprout}, 🌿 Root / Tree ${TIER_WEIGHT.root}, 🌳 Oak / 👻 GhostKey / 🌲 Elder tree ${TIER_WEIGHT.oak}.`;

  const form = document.getElementById("greenhouse-form") as HTMLFormElement | null;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get("title") ?? "").trim();
    if (!title) return;
    const btn = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (btn) btn.disabled = true;
    try {
      await append({ type: "seed", kind: fd.get("kind") === "bug" ? "bug" : "feature", title, text: String(fd.get("text") ?? "").trim(), days: Number(fd.get("days")) });
      form.reset();
      if (days) days.value = "14";
    } catch (err) {
      alert(`Could not plant it: ${(err as Error).message || err}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  const list = document.getElementById("greenhouse-list");
  list?.addEventListener("submit", async (e) => {
    const f = (e.target as HTMLElement).closest<HTMLFormElement>(".gh-comment-form");
    if (!f) return;
    e.preventDefault();
    const text = String(new FormData(f).get("text") ?? "").trim();
    if (!text) return;
    // on-device check: personal data or abusive wording is worth a second look before it goes to everyone
    const check = analyzeTextContent(text);
    if ((check.containsPII || check.isToxic) && !confirm(`${check.warnings.join("\n") || "This comment may contain personal data or abusive language."}\n\nPost it anyway?`)) return;
    const btn = f.querySelector<HTMLButtonElement>("button[type=submit]");
    if (btn) btn.disabled = true;
    try {
      await append({ type: "comment", seed: f.dataset.ghSeed, text });
      f.reset();
    } catch (err) {
      alert(`Could not comment: ${(err as Error).message || err}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  list?.addEventListener("click", (e) => {
    const repBtn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-gh-report]");
    if (repBtn) {
      const reason = prompt(`Report this comment by ${displayName(repBtn.dataset.ghAuthor!)}?\n\nWhy (spam, abuse, illegal content…)? It is hidden for you and for whoever trusts your blocklist; Radica's moderators are notified.`);
      if (reason !== null) void reportComment?.(repBtn.dataset.ghAuthor!, repBtn.dataset.ghReport!, reason.trim()).then(renderGreenhouse, (err) => alert(`Could not report it: ${err.message || err}`));
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
      void append({ type: "vote", seed: voteBtn.dataset.ghSeed, v: voteBtn.classList.contains("active") ? 0 : v }).catch((err) => alert(`Could not vote: ${err.message || err}`));
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
    void copyTextWithFeedback(formatSeedsForAi(lastRenderedSeeds, displayName, true), exportAiBtn, "Open Greenhouse proposals copied for AI agent!");
  });
  list?.addEventListener("change", (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>(".gh-status");
    if (sel) void freenet.greenhouseAppend({ type: "status", seed: sel.dataset.ghSeed, status: sel.value || null }).then(renderGreenhouse);
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
