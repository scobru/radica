import { buildPayload, countWords, estimateReadingMinutes, serializePayload } from "./article.ts";
import { renderMarkdown } from "./markdown.ts";
import { publishArticleBytes } from "./net.ts";

// Radica resolves "#article=hash:<id>" straight from the media-contract, with no post or author behind it
// (scobru/radica ui/src/articlesPage.ts openAnonymousReader, ui/src/main.ts checkUrlPostHash).
// Radica's URL can't be derived from Folio's own location: on Freenet each app is its own contract instance
// at its own "/v1/contract/web/<key>/" path, so location.origin alone drops that path entirely. The reader
// has to tell Folio where Radica lives, once; it's then remembered in this browser.
const RADICA_URL_KEY = "folio_radica_url";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = el<HTMLFormElement>("form");
const titleEl = el<HTMLInputElement>("title");
const subtitleEl = el<HTMLInputElement>("subtitle");
const tagsEl = el<HTMLInputElement>("tags");
const radicaUrlEl = el<HTMLInputElement>("radica-url");
radicaUrlEl.value = localStorage.getItem(RADICA_URL_KEY) ?? import.meta.env.VITE_RADICA_URL ?? "";
const bodyEl = el<HTMLTextAreaElement>("body");
const statsEl = el<HTMLSpanElement>("stats");
const publishBtn = el<HTMLButtonElement>("publish");
const resultEl = el<HTMLDivElement>("result");
const permalinkEl = el<HTMLInputElement>("permalink");
const errorEl = el<HTMLParagraphElement>("error");

function updateStats() {
  statsEl.textContent = `${countWords(bodyEl.value)} words · ${estimateReadingMinutes(bodyEl.value)} min read`;
}
bodyEl.addEventListener("input", updateStats);
updateStats();

const previewEl = el<HTMLDivElement>("preview");
const tabWrite = el<HTMLButtonElement>("tab-write");
const tabPreview = el<HTMLButtonElement>("tab-preview");
function showTab(tab: "write" | "preview") {
  const isPreview = tab === "preview";
  if (isPreview) previewEl.innerHTML = renderMarkdown(bodyEl.value);
  bodyEl.hidden = isPreview;
  previewEl.hidden = !isPreview;
  tabWrite.classList.toggle("active", !isPreview);
  tabWrite.setAttribute("aria-selected", String(!isPreview));
  tabPreview.classList.toggle("active", isPreview);
  tabPreview.setAttribute("aria-selected", String(isPreview));
}
tabWrite.addEventListener("click", () => showTab("write"));
tabPreview.addEventListener("click", () => showTab("preview"));

form.addEventListener("submit", (e) => {
  e.preventDefault();
  void publish();
});

async function publish() {
  errorEl.hidden = true;
  publishBtn.disabled = true;
  publishBtn.textContent = "Publishing…";
  try {
    const radicaUrl = radicaUrlEl.value.trim();
    if (!radicaUrl) throw new Error("Enter the Radica URL readers will open this link from.");
    const base = radicaUrl.endsWith("/") ? radicaUrl : `${radicaUrl}/`;
    const payload = buildPayload({ title: titleEl.value, subtitle: subtitleEl.value, body: bodyEl.value, tags: tagsEl.value });
    const hash = await publishArticleBytes(serializePayload(payload));
    localStorage.setItem(RADICA_URL_KEY, radicaUrl);
    permalinkEl.value = `${base}#article=hash:${hash}`;
    resultEl.hidden = false;
    form.hidden = true;
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : String(err);
    errorEl.hidden = false;
  } finally {
    publishBtn.disabled = false;
    publishBtn.textContent = "Publish";
  }
}

el<HTMLButtonElement>("copy").addEventListener("click", () => {
  void navigator.clipboard?.writeText(permalinkEl.value);
});

el<HTMLButtonElement>("write-another").addEventListener("click", () => {
  form.reset();
  updateStats();
  showTab("write");
  resultEl.hidden = true;
  form.hidden = false;
  titleEl.focus();
});
