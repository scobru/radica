import { buildPayload, countWords, estimateReadingMinutes, serializePayload } from "./article.ts";
import { publishArticleBytes } from "./net.ts";

// Radica resolves "#article=hash:<id>" straight from the media-contract, with no post or author behind it
// (scobru/radica ui/src/articlesPage.ts openAnonymousReader, ui/src/main.ts checkUrlPostHash).
const RADICA_BASE_URL = import.meta.env.VITE_RADICA_URL ?? `${location.origin}/`;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = el<HTMLFormElement>("form");
const titleEl = el<HTMLInputElement>("title");
const subtitleEl = el<HTMLInputElement>("subtitle");
const tagsEl = el<HTMLInputElement>("tags");
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
    permalinkEl.value = `${RADICA_BASE_URL}#article=hash:${hash}`;
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
  resultEl.hidden = true;
  form.hidden = false;
  titleEl.focus();
});
