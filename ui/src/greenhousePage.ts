// The Greenhouse page: plant a seed (an idea or a bug), vote on the open ones, and (the maintainer) mark what became of
// them. Supporters, GhostKey holders, and members with Sapling+ Linfa plant and vote; anyone can read. main.ts calls initGreenhouse once.
import { freenet } from "./freenet.ts";
import { safeStorage } from "./storage";
import { escapeHtml } from "./html.ts";
import { renderChatText } from "./caption.ts";
import { verifyReceipt, supporterStorageKey, type SupporterTier } from "./supporter.ts";
import { foldGreenhouse, greenhouseTokens, SEED_DAYS, SEED_STATUSES, TIER_WEIGHT, type Seed } from "./greenhouse.ts";
import { RADICA_MAINTAINER } from "./types.ts";
import { verifiedGhostkeys } from "./ghostkey.ts";

export interface GreenhouseLinfaInfo {
  weights: Map<string, number>;
  myStage?: string;
  myTotal?: number;
}

let whoAmI: () => string | null = () => null;
let displayName: (pubkey: string) => string = (pk) => pk.slice(0, 8);
let linfaForAuthors: (authors: string[]) => Promise<GreenhouseLinfaInfo> = async () => ({ weights: new Map() });
let myLinfaWeight = 0;
const verified = new Map<string, SupporterTier | null>(); // `${author}|${token}` -> tier, or null when it does not verify

const myGhostkey = (): string | null => {
  const me = whoAmI();
  return me ? safeStorage.getItem(`radica_ghostkey_${me}`) : null;
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
  return (author) => {
    if (ghosts.has(author) || author === RADICA_MAINTAINER) return "oak"; // the maintainer votes with the top weight too
    const t = tokens.get(author);
    return (t && verified.get(`${author}|${t}`)) || undefined;
  };
}

const left = (ms: number) => {
  const h = Math.ceil(ms / 3_600_000);
  return h > 48 ? `${Math.ceil(h / 24)} days left` : `${h} h left`;
};

function seedHtml(s: Seed, canVote: boolean, isMaintainer: boolean): string {
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
  return `<div class="gh-seed${open ? "" : " closed"}">
    <div class="gh-seed-head"><span class="identity-badge">${s.kind === "bug" ? "🐛 Bug" : "💡 Feature"}</span><strong>${escapeHtml(s.title)}</strong></div>
    ${s.text ? `<div class="gh-seed-text">${renderChatText(s.text, displayName)}</div>` : ""}
    <div class="gh-seed-meta">by <span class="author-clickable" data-author="${escapeHtml(s.author)}">${escapeHtml(displayName(s.author))}</span> · ${outcome} · ${s.voters} ${s.voters === 1 ? "voter" : "voters"} ${status}</div>
    <div class="gh-seed-votes">${vote(1, `▲ ${s.up}`, s.kind === "bug" ? "Me too" : "I want this")}${s.kind === "feature" ? vote(-1, `▼ ${s.down}`, "I don't want this") : ""}</div>
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
      gate.innerHTML = `Anyone can read. To plant and vote, grow your <b>🌱 Linfa</b> to <b>Sapling</b> (12+ pts with replies or likes from your network)${progress}, or support Radica via <b>Identity → Support Radica</b> (Supporter badge or Freenet GhostKey).`;
    }
  }
  const seeds = foldGreenhouse(entries, tierOf, me, RADICA_MAINTAINER, (a) => linfaInfo.weights.get(a) ?? 0);
  list.innerHTML = seeds.length ? seeds.map((s) => seedHtml(s, canVote, me === RADICA_MAINTAINER)).join("") : `<p style="color: var(--text-muted); font-size: 0.85rem;">Nothing planted yet.</p>`;
}

async function append(body: object): Promise<void> {
  const token = myToken();
  if (!token && !myGhostkey() && whoAmI() !== RADICA_MAINTAINER && myLinfaWeight <= 0) return;
  await freenet.greenhouseAppend(token ? { ...body, receipt: token } : body); // a GhostKey's proof is on the ghostkeys log, and Linfa is checked from signed posts
  await renderGreenhouse();
}

export function initGreenhouse(deps: {
  whoAmI: () => string | null;
  displayName: (pubkey: string) => string;
  linfaForAuthors?: (authors: string[]) => Promise<GreenhouseLinfaInfo>;
}): void {
  whoAmI = deps.whoAmI;
  displayName = deps.displayName;
  if (deps.linfaForAuthors) linfaForAuthors = deps.linfaForAuthors;
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
  list?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-gh-vote]");
    if (!btn) return;
    const v = Number(btn.dataset.ghVote);
    // pressing my current vote again takes it back
    void append({ type: "vote", seed: btn.dataset.ghSeed, v: btn.classList.contains("active") ? 0 : v }).catch((err) => alert(`Could not vote: ${err.message || err}`));
  });
  list?.addEventListener("change", (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>(".gh-status");
    if (sel) void freenet.greenhouseAppend({ type: "status", seed: sel.dataset.ghSeed, status: sel.value || null }).then(renderGreenhouse);
  });
}

const greenhouseLoaderHtml = (msg = "Loading Greenhouse proposals…") =>
  `<div class="greenhouse-loader" role="status" aria-live="polite"><div class="boot-bar"><span></span></div><p>${msg}</p></div>`;

/** Open the page: draw what is here, then what the network has. */
export async function openGreenhouse(): Promise<void> {
  const list = document.getElementById("greenhouse-list");
  const hadSeeds = !!list?.querySelector(".gh-seed");
  if (list && !hadSeeds) {
    list.innerHTML = greenhouseLoaderHtml("Loading Greenhouse proposals…");
  }
  await renderGreenhouse();
  if (list && !list.querySelector(".gh-seed")) {
    list.innerHTML = greenhouseLoaderHtml("Fetching proposals from the network…");
  }
  await freenet.refreshLog("greenhouse").catch(() => {});
  await renderGreenhouse();
}
