import { ARTICLE_PREFIX, buildPayload, countWords, estimateReadingMinutes, serializePayload } from "./article.ts";
import { renderMarkdown } from "./markdown.ts";
import { publishArticleBytes } from "./net.ts";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = el<HTMLFormElement>("form");
const titleEl = el<HTMLInputElement>("title");
const subtitleEl = el<HTMLInputElement>("subtitle");
const tagsEl = el<HTMLInputElement>("tags");
const bodyEl = el<HTMLTextAreaElement>("body");
const statsEl = el<HTMLSpanElement>("stats");
const publishBtn = el<HTMLButtonElement>("publish");
const resultEl = el<HTMLDivElement>("result");
const tokenEl = el<HTMLInputElement>("token");
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
    const payload = buildPayload({ title: titleEl.value, subtitle: subtitleEl.value, body: bodyEl.value, tags: tagsEl.value });
    const hash = await publishArticleBytes(serializePayload(payload));
    tokenEl.value = `${ARTICLE_PREFIX}${hash}`;
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
  void navigator.clipboard?.writeText(tokenEl.value);
});

el<HTMLButtonElement>("write-another").addEventListener("click", () => {
  form.reset();
  updateStats();
  showTab("write");
  resultEl.hidden = true;
  form.hidden = false;
  titleEl.focus();
});
