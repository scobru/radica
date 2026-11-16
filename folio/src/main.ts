import { ARTICLE_PREFIX, buildPayload, countWords, estimateReadingMinutes, parsePayload, serializePayload } from "./article.ts";
import { escapeHtml, renderMarkdown } from "./markdown.ts";
import { fetchArticleBytes, publishArticleBytes } from "./net.ts";

const HASH_RE = /^#article=hash:([0-9a-f]{64})$/i;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function showReadView(hash: string) {
  const writeView = el<HTMLElement>("form").closest("main")!;
  const readView = el<HTMLElement>("read-view");
  const articleEl = el<HTMLElement>("read-article");
  writeView.hidden = true;
  readView.hidden = false;
  articleEl.innerHTML = `<p class="muted">Loading…</p>`;

  const bytes = await fetchArticleBytes(hash).catch(() => null);
  const payload = bytes && parsePayload(bytes);
  if (!payload) {
    articleEl.innerHTML = `<p class="error">This article (<code>${hash.slice(0, 12)}…</code>) was not found on Freenet. It may still be propagating, or the link is wrong.</p>`;
    return;
  }
  articleEl.innerHTML =
    `<h1 class="article-h1">${escapeHtml(payload.title)}</h1>` +
    (payload.subtitle ? `<p class="article-subtitle muted">${escapeHtml(payload.subtitle)}</p>` : "") +
    `<p class="muted small">${new Date(payload.publishedAt).toLocaleDateString()} · ${payload.readingMinutes} min read</p>` +
    renderMarkdown(payload.body);
}

const readHashMatch = HASH_RE.exec(location.hash);
if (readHashMatch) {
  void showReadView(readHashMatch[1].toLowerCase());
  el<HTMLAnchorElement>("read-write-link").addEventListener("click", (e) => {
    e.preventDefault();
    history.replaceState(null, "", location.pathname + location.search);
    location.reload();
  });
}

const form = el<HTMLFormElement>("form");
const titleEl = el<HTMLInputElement>("title");
const subtitleEl = el<HTMLInputElement>("subtitle");
const tagsEl = el<HTMLInputElement>("tags");
const bodyEl = el<HTMLTextAreaElement>("body");
const statsEl = el<HTMLSpanElement>("stats");
const publishBtn = el<HTMLButtonElement>("publish");
const resultEl = el<HTMLDivElement>("result");
const tokenEl = el<HTMLInputElement>("token");
const shareLinkEl = el<HTMLInputElement>("share-link");
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
    // Folio linking to itself: location already carries its own "/v1/contract/web/<key>/" path, so no guessing.
    shareLinkEl.value = `${location.origin}${location.pathname}#article=hash:${hash}`;
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

el<HTMLButtonElement>("copy-token").addEventListener("click", () => {
  void navigator.clipboard?.writeText(tokenEl.value);
});
el<HTMLButtonElement>("copy-link").addEventListener("click", () => {
  void navigator.clipboard?.writeText(shareLinkEl.value);
});

el<HTMLButtonElement>("write-another").addEventListener("click", () => {
  form.reset();
  updateStats();
  showTab("write");
  resultEl.hidden = true;
  form.hidden = false;
  titleEl.focus();
});
