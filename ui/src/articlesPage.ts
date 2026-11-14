// Dedicated Long-Form Articles & Decentralized Newsletters rail page (#articles-modal) — TASK-004.
import { escapeHtml as esc } from "./html.ts";
import {
  buildNewsletterEmail,
  cacheArticlePayload,
  countWords,
  deleteArticleDraft,
  estimateReadingMinutes,
  extractArticleTags,
  formatArticlePostCaption,
  getCachedArticlePayload,
  loadArticleDrafts,
  parseArticleCaption,
  parseArticlePayload,
  renderArticleMarkdown,
  saveArticleDraft,
  serializeArticlePayload,
  type ArticleDraft,
  type ArticlePayload,
  type ArticleRef,
} from "./articles.ts";
import { loadMailContacts, sendMailMessage, isValidMailAddress } from "./mailClient.ts";
import { analyzeImageFile, analyzeTextContent } from "./moderation.ts";
import type { Post, UserIdentity } from "./types.ts";
import type { FreenetMailIdentity } from "./freenetMail.ts";

export interface ArticlesPageDeps {
  getIdentity: () => UserIdentity | null;
  getAllPosts: () => Post[];
  getFollowing: () => Set<string>;
  getAuthorName: (pubkey: string) => string;
  getAuthorAvatar: (pubkey: string) => string;
  getMediaUrl: (mediaUri?: string) => Promise<string | undefined>;
  getArticleBytes: (hash: string) => Promise<Uint8Array | null>;
  putArticleBytes: (bytes: Uint8Array) => Promise<string>;
  publishArticlePost: (caption: string, coverUri?: string, isNsfw?: boolean, nsfwScore?: number) => Promise<Post>;
  compressCoverImage: (file: File) => Promise<string>;
  getMailIdentity: () => FreenetMailIdentity | null;
  openUserWall: (pubkey: string) => void;
  openPostInFeed: (postId: string, author: string) => void;
  toggleLike: (author: string, postId: string) => Promise<void>;
  saveToBoard?: (post: Post) => void;
  reportArticle?: (author: string, postId: string) => Promise<void>;
  hideAuthor?: (author: string) => void;
  shouldMaskBadWords?: () => boolean;
  getAppBaseUrl: () => string;
  showToast: (msg: string, isError?: boolean) => void;
  closeModal: () => void;
  onPublished?: () => void;
  getFreenetClient?: () => unknown;
}

type ArticlesFilter = "all" | "following" | "mine" | "drafts";
type ArticlesView = "list" | "reader" | "compose";

export function createArticlesPage(deps: ArticlesPageDeps) {
  const modal = document.getElementById("articles-modal") as HTMLElement | null;
  const countPill = document.getElementById("articles-count-pill") as HTMLElement | null;
  const listView = document.getElementById("articles-list-view") as HTMLElement | null;
  const readerView = document.getElementById("articles-reader-view") as HTMLElement | null;
  const composeView = document.getElementById("articles-compose-view") as HTMLElement | null;

  const searchInput = document.getElementById("articles-search-input") as HTMLInputElement | null;
  const tabsEl = document.getElementById("articles-filter-tabs") as HTMLElement | null;
  const gridEl = document.getElementById("articles-grid") as HTMLElement | null;

  const newBtn = document.getElementById("articles-new-btn") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("articles-close-btn") as HTMLButtonElement | null;

  // Compose elements
  const composeBackBtn = document.getElementById("articles-compose-back-btn") as HTMLButtonElement | null;
  const composeTitleInput = document.getElementById("article-compose-title") as HTMLInputElement | null;
  const composeSubInput = document.getElementById("article-compose-subtitle") as HTMLInputElement | null;
  const composeTagsInput = document.getElementById("article-compose-tags") as HTMLInputElement | null;
  const composeBodyInput = document.getElementById("article-compose-body") as HTMLTextAreaElement | null;
  const composeCoverInput = document.getElementById("article-compose-cover-input") as HTMLInputElement | null;
  const composeCoverPreview = document.getElementById("article-compose-cover-preview") as HTMLElement | null;
  const composePreviewEl = document.getElementById("article-compose-preview") as HTMLElement | null;
  const composeWriteTab = document.getElementById("article-compose-tab-write") as HTMLButtonElement | null;
  const composePreviewTab = document.getElementById("article-compose-tab-preview") as HTMLButtonElement | null;
  const composeStatsEl = document.getElementById("article-compose-stats") as HTMLElement | null;
  const composeDraftStatusEl = document.getElementById("article-compose-draft-status") as HTMLElement | null;
  const composeSaveDraftBtn = document.getElementById("article-compose-save-draft-btn") as HTMLButtonElement | null;
  const composeNewsletterCheck = document.getElementById("article-compose-newsletter-check") as HTMLInputElement | null;
  const composePublishBtn = document.getElementById("article-compose-publish-btn") as HTMLButtonElement | null;

  // Newsletter modal/panel
  const newsletterPanel = document.getElementById("article-newsletter-panel") as HTMLElement | null;
  const newsletterRecipientsEl = document.getElementById("article-newsletter-recipients") as HTMLElement | null;
  const newsletterExtraInput = document.getElementById("article-newsletter-extra") as HTMLInputElement | null;
  const newsletterSubjectEl = document.getElementById("article-newsletter-subject") as HTMLElement | null;
  const newsletterPreviewEl = document.getElementById("article-newsletter-preview") as HTMLElement | null;
  const newsletterSendBtn = document.getElementById("article-newsletter-send-btn") as HTMLButtonElement | null;
  const newsletterCancelBtn = document.getElementById("article-newsletter-cancel-btn") as HTMLButtonElement | null;
  const newsletterSelectAllBtn = document.getElementById("article-newsletter-select-all") as HTMLButtonElement | null;

  let activeFilter: ArticlesFilter = "all";
  let activeView: ArticlesView = "list";
  let editingDraftId = "";
  let composeCoverUri = "";
  let composeIsNsfw = false;
  let composeNsfwScore = 0;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  let activeNewsletterData: {
    title: string;
    subtitle: string;
    body: string;
    readingMinutes: number;
    permalink: string;
  } | null = null;

  function showView(view: ArticlesView) {
    activeView = view;
    if (listView) listView.style.display = view === "list" ? "" : "none";
    if (readerView) readerView.style.display = view === "reader" ? "" : "none";
    if (composeView) composeView.style.display = view === "compose" ? "" : "none";
    if (newBtn) newBtn.style.display = view === "list" ? "" : "none";
  }

  function collectArticlePosts(): Array<{ post: Post; ref: ArticleRef }> {
    const seen = new Set<string>();
    const items: Array<{ post: Post; ref: ArticleRef }> = [];
    for (const post of deps.getAllPosts()) {
      const key = `${post.author}:${post.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ref = parseArticleCaption(post.caption);
      if (ref) items.push({ post, ref });
    }
    items.sort((a, b) => b.post.timestamp - a.post.timestamp);
    return items;
  }

  function renderList() {
    if (!gridEl) return;
    const me = deps.getIdentity()?.pubkey || "";
    const following = deps.getFollowing();
    const query = (searchInput?.value || "").trim().toLowerCase();

    const allArticles = collectArticlePosts();
    if (countPill) {
      countPill.textContent = `${allArticles.length} ${allArticles.length === 1 ? "article" : "articles"}`;
    }

    if (activeFilter === "drafts") {
      const drafts = me ? loadArticleDrafts(me) : [];
      const filtered = query
        ? drafts.filter((d) =>
            d.title.toLowerCase().includes(query) ||
            d.subtitle.toLowerCase().includes(query) ||
            d.body.toLowerCase().includes(query)
          )
        : drafts;

      if (!filtered.length) {
        gridEl.innerHTML = `<div class="articles-empty">No saved drafts yet. Click <strong>New Article</strong> to start writing.</div>`;
        return;
      }

      gridEl.innerHTML = filtered
        .map((d) => {
          const mins = estimateReadingMinutes(d.body);
          const dateStr = new Date(d.updatedAt).toLocaleString();
          return (
            `<article class="article-list-card article-draft-card">` +
              `<div class="article-list-card-meta">` +
                `<span class="article-badge article-badge-draft">Draft</span>` +
                `<span class="article-read-time">${mins} min read · Updated ${esc(dateStr)}</span>` +
              `</div>` +
              `<h4 class="article-list-card-title">${esc(d.title || "Untitled Draft")}</h4>` +
              (d.subtitle ? `<p class="article-list-card-sub">${esc(d.subtitle)}</p>` : "") +
              `<div class="article-list-card-actions">` +
                `<button type="button" class="btn-primary btn-sm article-edit-draft-btn" data-draft-id="${esc(d.id)}">Continue Editing</button>` +
                `<button type="button" class="btn-secondary btn-sm article-delete-draft-btn" data-draft-id="${esc(d.id)}">Delete</button>` +
              `</div>` +
            `</article>`
          );
        })
        .join("");

      gridEl.querySelectorAll<HTMLButtonElement>(".article-edit-draft-btn").forEach((btn) => {
        btn.onclick = () => {
          const id = btn.dataset.draftId;
          const draft = drafts.find((d) => d.id === id);
          if (draft) openComposer(draft);
        };
      });
      gridEl.querySelectorAll<HTMLButtonElement>(".article-delete-draft-btn").forEach((btn) => {
        btn.onclick = () => {
          const id = btn.dataset.draftId;
          if (!id || !me) return;
          deleteArticleDraft(me, id);
          renderList();
        };
      });
      return;
    }

    const filtered = allArticles.filter(({ post, ref }) => {
      if (activeFilter === "following" && !following.has(post.author) && post.author !== me) return false;
      if (activeFilter === "mine" && post.author !== me) return false;
      if (query) {
        const authorName = deps.getAuthorName(post.author).toLowerCase();
        const hay = `${ref.title} ${ref.subtitle} ${ref.tags.join(" ")} ${authorName}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      gridEl.innerHTML = `<div class="articles-empty">No articles match this filter yet.</div>`;
      return;
    }

    gridEl.innerHTML = filtered
      .map(({ post, ref }) => {
        const authorName = deps.getAuthorName(post.author);
        const avatar = deps.getAuthorAvatar(post.author);
        const dateStr = new Date(post.timestamp).toLocaleDateString();
        const likeCount = Object.values(post.likes || {}).filter((l) => l.liked).length;
        const commentCount = Object.keys(post.comments || {}).length;
        const tagsHtml = ref.tags.length
          ? `<div class="article-card-tags">${ref.tags.map((t) => `<span class="article-tag-pill">#${esc(t)}</span>`).join("")}</div>`
          : "";
        return (
          `<article class="article-list-card">` +
            (post.media_uri ? `<div class="article-list-cover" data-cover-uri="${esc(post.media_uri)}"></div>` : "") +
            `<div class="article-list-card-body">` +
              `<div class="article-list-author-row">` +
                `<img class="article-author-avatar" src="${esc(avatar)}" alt="" />` +
                `<button type="button" class="article-author-link" data-author="${esc(post.author)}">${esc(authorName)}</button>` +
                `<span class="article-dot">·</span>` +
                `<span class="article-date">${esc(dateStr)}</span>` +
                `<span class="article-read-time">${ref.readingMinutes} min read</span>` +
              `</div>` +
              `<h4 class="article-list-card-title">${esc(ref.title)}</h4>` +
              (ref.subtitle ? `<p class="article-list-card-sub">${esc(ref.subtitle)}</p>` : "") +
              tagsHtml +
              `<div class="article-list-card-actions">` +
                `<button type="button" class="btn-primary btn-sm article-open-btn" data-post-id="${esc(post.id)}" data-author="${esc(post.author)}" data-hash="${esc(ref.hash)}">Read Article →</button>` +
                `<span class="article-stat-pill">♥ ${likeCount} · 💬 ${commentCount}</span>` +
              `</div>` +
            `</div>` +
          `</article>`
        );
      })
      .join("");

    // Resolve cover images asynchronously
    gridEl.querySelectorAll<HTMLElement>(".article-list-cover[data-cover-uri]").forEach((el) => {
      const uri = el.dataset.coverUri;
      if (!uri) return;
      void deps.getMediaUrl(uri).then((src) => {
        if (src) el.innerHTML = `<img src="${esc(src)}" alt="Article cover" loading="lazy" />`;
        else el.remove();
      });
    });

    gridEl.querySelectorAll<HTMLButtonElement>(".article-author-link").forEach((btn) => {
      btn.onclick = () => {
        const author = btn.dataset.author;
        if (author) deps.openUserWall(author);
      };
    });

    gridEl.querySelectorAll<HTMLButtonElement>(".article-open-btn").forEach((btn) => {
      btn.onclick = () => {
        const postId = btn.dataset.postId;
        const author = btn.dataset.author;
        const hash = btn.dataset.hash;
        if (postId && author && hash) void openReader({ postId, author, hash });
      };
    });
  }

  async function resolvePayload(hash: string): Promise<ArticlePayload | null> {
    const cached = getCachedArticlePayload(hash);
    if (cached) return cached;
    const bytes = await deps.getArticleBytes(hash).catch(() => null);
    if (!bytes) return null;
    const parsed = parseArticlePayload(bytes);
    if (parsed) cacheArticlePayload(hash, parsed);
    return parsed;
  }

  async function openReader(target: { postId: string; author: string; hash?: string }) {
    if (!modal || !readerView) return;
    modal.style.display = "flex";
    showView("reader");

    const post = deps.getAllPosts().find((p) => p.id === target.postId && p.author === target.author);
    const ref = post ? parseArticleCaption(post.caption) : null;
    const hash = target.hash || ref?.hash || "";

    const me = deps.getIdentity()?.pubkey || "";
    const authorName = deps.getAuthorName(target.author);
    const avatar = deps.getAuthorAvatar(target.author);

    readerView.innerHTML = `<div class="articles-reader-loading">Loading article from Freenet…</div>`;

    const payload = hash ? await resolvePayload(hash) : null;
    const title = payload?.title || ref?.title || "Untitled Article";
    const subtitle = payload?.subtitle || ref?.subtitle || "";
    const readingMinutes = payload?.readingMinutes || ref?.readingMinutes || 1;
    const tags = payload?.tags?.length ? payload.tags : ref?.tags || [];
    const publishedAt = payload?.publishedAt || post?.timestamp || Date.now();
    const coverUri = payload?.coverUri || post?.media_uri;
    const coverSrc = coverUri ? await deps.getMediaUrl(coverUri) : undefined;
    const bodyHtml = payload
      ? renderArticleMarkdown(payload.body, deps.shouldMaskBadWords?.() ?? true)
      : `<p class="article-missing-note">Full article body is still propagating on Freenet (<code>${esc(hash.slice(0, 12))}…</code>). Try refreshing in a moment.</p>`;

    const likeCount = post ? Object.values(post.likes || {}).filter((l) => l.liked).length : 0;
    const likedByMe = Boolean(post && me && post.likes?.[me]?.liked);
    const commentCount = post ? Object.keys(post.comments || {}).length : 0;
    const permalink = `${deps.getAppBaseUrl()}#article=${encodeURIComponent(target.postId)}&author=${encodeURIComponent(target.author)}`;

    readerView.innerHTML =
      `<div class="article-reader-shell">` +
        `<div class="article-reader-topbar">` +
          `<button type="button" class="btn-secondary btn-sm" id="article-reader-back-btn">← All Articles</button>` +
          `<div class="article-reader-top-actions">` +
            `<button type="button" class="btn-secondary btn-sm" id="article-reader-copy-link-btn">Copy Permalink</button>` +
            (target.author === me && payload
              ? `<button type="button" class="btn-primary btn-sm" id="article-reader-newsletter-btn">✉ Send as Newsletter</button>`
              : "") +
          `</div>` +
        `</div>` +
        (coverSrc ? `<div class="article-reader-cover"><img src="${esc(coverSrc)}" alt="${esc(title)}" /></div>` : "") +
        `<header class="article-reader-header">` +
          `<h1 class="article-reader-title">${esc(title)}</h1>` +
          (subtitle ? `<p class="article-reader-subtitle">${esc(subtitle)}</p>` : "") +
          `<div class="article-reader-byline">` +
            `<img class="article-author-avatar" src="${esc(avatar)}" alt="" />` +
            `<button type="button" class="article-author-link" id="article-reader-author-btn">${esc(authorName)}</button>` +
            `<span class="article-dot">·</span>` +
            `<span>${esc(new Date(publishedAt).toLocaleDateString())}</span>` +
            `<span class="article-dot">·</span>` +
            `<span class="article-read-time">${readingMinutes} min read</span>` +
          `</div>` +
          (tags.length ? `<div class="article-card-tags">${tags.map((t) => `<span class="article-tag-pill">#${esc(t)}</span>`).join("")}</div>` : "") +
        `</header>` +
        `<article class="article-reader-body">${bodyHtml}</article>` +
        `<footer class="article-reader-footer">` +
          `<button type="button" class="btn-secondary btn-sm ${likedByMe ? "is-liked" : ""}" id="article-reader-like-btn">♥ ${likeCount}</button>` +
          `<button type="button" class="btn-secondary btn-sm" id="article-reader-comments-btn">💬 Comments (${commentCount})</button>` +
          (deps.saveToBoard && post ? `<button type="button" class="btn-secondary btn-sm" id="article-reader-board-btn">📌 Board</button>` : "") +
          (target.author !== me && me
            ? `<button type="button" class="btn-secondary btn-sm" id="article-reader-report-btn" style="margin-left:auto;">🚩 Report</button>` +
              `<button type="button" class="btn-secondary btn-sm" id="article-reader-hide-btn">🚫 Hide Author</button>`
            : "") +
        `</footer>` +
      `</div>`;

    document.getElementById("article-reader-back-btn")?.addEventListener("click", () => {
      showView("list");
      renderList();
    });
    document.getElementById("article-reader-author-btn")?.addEventListener("click", () => {
      deps.openUserWall(target.author);
    });
    document.getElementById("article-reader-copy-link-btn")?.addEventListener("click", () => {
      void navigator.clipboard?.writeText(permalink);
      deps.showToast("Article permalink copied!");
    });
    const likeBtn = document.getElementById("article-reader-like-btn") as HTMLButtonElement | null;
    likeBtn?.addEventListener("click", async () => {
      if (!deps.getIdentity()) {
        await deps.toggleLike(target.author, target.postId);
        return;
      }
      const wasLiked = likeBtn.classList.contains("is-liked");
      const curCount = Number(likeBtn.textContent?.replace(/[^0-9]/g, "") || "0") || 0;
      const nextLiked = !wasLiked;
      const nextCount = Math.max(0, curCount + (nextLiked ? 1 : -1));
      likeBtn.classList.toggle("is-liked", nextLiked);
      likeBtn.textContent = `♥ ${nextCount}`;
      try {
        await deps.toggleLike(target.author, target.postId);
      } catch {
        likeBtn.classList.toggle("is-liked", wasLiked);
        likeBtn.textContent = `♥ ${curCount}`;
      }
    });
    document.getElementById("article-reader-comments-btn")?.addEventListener("click", () => {
      deps.closeModal();
      deps.openPostInFeed(target.postId, target.author);
    });
    document.getElementById("article-reader-board-btn")?.addEventListener("click", () => {
      if (post) deps.saveToBoard?.(post);
    });
    document.getElementById("article-reader-report-btn")?.addEventListener("click", async () => {
      await deps.reportArticle?.(target.author, target.postId);
      showView("list");
      renderList();
    });
    document.getElementById("article-reader-hide-btn")?.addEventListener("click", () => {
      deps.hideAuthor?.(target.author);
      showView("list");
      renderList();
    });
    document.getElementById("article-reader-newsletter-btn")?.addEventListener("click", () => {
      if (!payload) return;
      openNewsletterPanel({
        title: payload.title,
        subtitle: payload.subtitle,
        body: payload.body,
        readingMinutes: payload.readingMinutes,
        permalink,
      });
    });
  }

  function updateComposeStats() {
    const body = composeBodyInput?.value || "";
    const words = countWords(body);
    const mins = estimateReadingMinutes(body);
    if (composeStatsEl) composeStatsEl.textContent = `${words} words · ${mins} min read`;
  }

  function persistDraftNow() {
    const me = deps.getIdentity()?.pubkey;
    if (!me) return;
    const title = composeTitleInput?.value.trim() || "";
    const subtitle = composeSubInput?.value.trim() || "";
    const body = composeBodyInput?.value || "";
    const tags = extractArticleTags(composeTagsInput?.value || "");
    if (!title && !subtitle && !body.trim()) return;
    if (!editingDraftId) editingDraftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    saveArticleDraft(me, {
      id: editingDraftId,
      title,
      subtitle,
      body,
      coverUri: composeCoverUri || undefined,
      tags,
      updatedAt: Date.now(),
    });
    if (composeDraftStatusEl) composeDraftStatusEl.textContent = "Draft saved locally";
  }

  function scheduleDraftSave() {
    if (composeDraftStatusEl) composeDraftStatusEl.textContent = "Saving…";
    clearTimeout(draftTimer);
    draftTimer = setTimeout(persistDraftNow, 700);
  }

  function renderCoverPreview() {
    if (!composeCoverPreview) return;
    if (!composeCoverUri) {
      composeCoverPreview.innerHTML = "";
      composeCoverPreview.style.display = "none";
      return;
    }
    composeCoverPreview.style.display = "flex";
    composeCoverPreview.innerHTML =
      `<img src="${esc(composeCoverUri)}" alt="Cover preview" />` +
      `<button type="button" class="btn-secondary btn-sm" id="article-compose-cover-clear">Remove cover</button>`;
    document.getElementById("article-compose-cover-clear")?.addEventListener("click", () => {
      composeCoverUri = "";
      if (composeCoverInput) composeCoverInput.value = "";
      renderCoverPreview();
      scheduleDraftSave();
    });
  }

  function openComposer(draft?: ArticleDraft) {
    if (!deps.getIdentity()) {
      deps.showToast("Sign in first to write an article.", true);
      return;
    }
    editingDraftId = draft?.id || "";
    composeCoverUri = draft?.coverUri || "";
    if (composeTitleInput) composeTitleInput.value = draft?.title || "";
    if (composeSubInput) composeSubInput.value = draft?.subtitle || "";
    if (composeTagsInput) composeTagsInput.value = draft?.tags?.join(", ") || "";
    if (composeBodyInput) composeBodyInput.value = draft?.body || "";
    if (composeNewsletterCheck) composeNewsletterCheck.checked = false;
    if (composeDraftStatusEl) composeDraftStatusEl.textContent = draft ? "Draft loaded" : "";
    if (composeBodyInput) composeBodyInput.style.display = "";
    if (composePreviewEl) composePreviewEl.style.display = "none";
    composeWriteTab?.classList.add("active");
    composePreviewTab?.classList.remove("active");
    renderCoverPreview();
    updateComposeStats();
    showView("compose");
  }

  function openNewsletterPanel(data: {
    title: string;
    subtitle: string;
    body: string;
    readingMinutes: number;
    permalink: string;
  }) {
    const me = deps.getIdentity()?.pubkey;
    if (!me || !newsletterPanel || !newsletterRecipientsEl) return;
    activeNewsletterData = data;

    const contacts = loadMailContacts(me);
    const authorName = deps.getAuthorName(me);
    const email = buildNewsletterEmail({ ...data, authorName });

    if (newsletterSubjectEl) newsletterSubjectEl.textContent = email.subject;
    if (newsletterPreviewEl) newsletterPreviewEl.textContent = email.content;
    if (newsletterExtraInput) newsletterExtraInput.value = "";

    if (!contacts.length) {
      newsletterRecipientsEl.innerHTML = `<div class="articles-empty-sm">No Radica Mail contacts yet. Enter recipient addresses below.</div>`;
    } else {
      newsletterRecipientsEl.innerHTML = contacts
        .map(
          (c) =>
            `<label class="article-nl-recipient">` +
              `<input type="checkbox" class="article-nl-cb" value="${esc(c.address)}" checked />` +
              `<span class="article-nl-name">${esc(c.name || c.address.slice(0, 12) + "…")}</span>` +
              `<span class="article-nl-addr">${esc(c.address.slice(0, 16))}…</span>` +
            `</label>`
        )
        .join("");
    }

    newsletterPanel.style.display = "flex";
  }

  function wireEvents() {
    closeBtn?.addEventListener("click", () => deps.closeModal());
    newBtn?.addEventListener("click", () => openComposer());
    composeBackBtn?.addEventListener("click", () => {
      showView("list");
      renderList();
    });

    searchInput?.addEventListener("input", () => renderList());
    tabsEl?.querySelectorAll<HTMLButtonElement>(".articles-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFilter = (btn.dataset.filter as ArticlesFilter) || "all";
        tabsEl.querySelectorAll(".articles-filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderList();
      });
    });

    [composeTitleInput, composeSubInput, composeTagsInput, composeBodyInput].forEach((el) => {
      el?.addEventListener("input", () => {
        updateComposeStats();
        scheduleDraftSave();
      });
    });

    composeSaveDraftBtn?.addEventListener("click", () => {
      persistDraftNow();
      deps.showToast("Draft saved locally.");
    });

    composeWriteTab?.addEventListener("click", () => {
      if (composeBodyInput) composeBodyInput.style.display = "";
      if (composePreviewEl) composePreviewEl.style.display = "none";
      composeWriteTab.classList.add("active");
      composePreviewTab?.classList.remove("active");
    });

    composePreviewTab?.addEventListener("click", () => {
      if (composeBodyInput) composeBodyInput.style.display = "none";
      if (composePreviewEl) {
        composePreviewEl.style.display = "";
        composePreviewEl.innerHTML = renderArticleMarkdown(composeBodyInput?.value || "*Nothing to preview yet.*");
      }
      composePreviewTab.classList.add("active");
      composeWriteTab?.classList.remove("active");
    });

    // Quick Markdown toolbar buttons
    composeView?.querySelectorAll<HTMLButtonElement>(".article-md-tool").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!composeBodyInput) return;
        const snippet = btn.dataset.snippet || "";
        const start = composeBodyInput.selectionStart ?? composeBodyInput.value.length;
        const end = composeBodyInput.selectionEnd ?? start;
        const val = composeBodyInput.value;
        composeBodyInput.value = val.slice(0, start) + snippet + val.slice(end);
        composeBodyInput.focus();
        updateComposeStats();
        scheduleDraftSave();
      });
    });

    composeCoverInput?.addEventListener("change", async () => {
      const file = composeCoverInput.files?.[0];
      if (!file) return;
      try {
        const mod = await analyzeImageFile(file).catch(() => ({ isNSFW: false, score: 0, label: "safe" }));
        composeIsNsfw = mod.isNSFW;
        composeNsfwScore = mod.score;
        if (mod.isNSFW) {
          deps.showToast("Cover image flagged as NSFW by local moderation model.", false);
        }
        composeCoverUri = await deps.compressCoverImage(file);
        renderCoverPreview();
        scheduleDraftSave();
      } catch (e) {
        deps.showToast(`Cover image failed: ${(e as Error).message}`, true);
      }
    });

    composePublishBtn?.addEventListener("click", async () => {
      const identity = deps.getIdentity();
      if (!identity) return deps.showToast("Sign in first to publish.", true);
      const title = composeTitleInput?.value.trim() || "";
      const subtitle = composeSubInput?.value.trim() || "";
      const body = composeBodyInput?.value.trim() || "";
      const tags = extractArticleTags(composeTagsInput?.value || "");

      if (!title) return deps.showToast("Please add an article title.", true);
      if (!body) return deps.showToast("Please write the article body.", true);

      const textMod = analyzeTextContent(`${title}\n${subtitle}\n${body}`);
      if (textMod.containsPII || textMod.isToxic) {
        const proceed = confirm(`Local moderation warning: ${textMod.warnings.join(", ") || "flagged content"}. Publish anyway?`);
        if (!proceed) return;
      }

      const readingMinutes = estimateReadingMinutes(body);
      const payload: ArticlePayload = {
        v: 1,
        title,
        subtitle,
        body,
        coverUri: composeCoverUri || undefined,
        tags,
        readingMinutes,
        publishedAt: Date.now(),
        author: identity.pubkey,
      };

      composePublishBtn.disabled = true;
      composePublishBtn.textContent = "Publishing…";
      try {
        const bytes = serializeArticlePayload(payload);
        const hash = await deps.putArticleBytes(bytes);
        cacheArticlePayload(hash, payload);
        const caption = formatArticlePostCaption({ title, subtitle, readingMinutes, tags, hash });
        const post = await deps.publishArticlePost(caption, composeCoverUri || undefined, composeIsNsfw, composeNsfwScore);

        if (editingDraftId) {
          deleteArticleDraft(identity.pubkey, editingDraftId);
          editingDraftId = "";
        }

        const sendNl = Boolean(composeNewsletterCheck?.checked);
        deps.showToast("Article published to Freenet!");
        deps.onPublished?.();

        await openReader({ postId: post.id, author: post.author, hash });
        if (sendNl) {
          const permalink = `${deps.getAppBaseUrl()}#article=${encodeURIComponent(post.id)}&author=${encodeURIComponent(post.author)}`;
          openNewsletterPanel({ title, subtitle, body, readingMinutes, permalink });
        }
      } catch (e) {
        deps.showToast(`Publish failed: ${(e as Error).message}`, true);
      } finally {
        composePublishBtn.disabled = false;
        composePublishBtn.textContent = "Publish Article";
      }
    });

    newsletterCancelBtn?.addEventListener("click", () => {
      if (newsletterPanel) newsletterPanel.style.display = "none";
    });

    newsletterSelectAllBtn?.addEventListener("click", () => {
      const cbs = newsletterRecipientsEl?.querySelectorAll<HTMLInputElement>(".article-nl-cb");
      if (!cbs?.length) return;
      const allChecked = Array.from(cbs).every((c) => c.checked);
      cbs.forEach((c) => (c.checked = !allChecked));
    });

    newsletterSendBtn?.addEventListener("click", async () => {
      const me = deps.getIdentity()?.pubkey;
      if (!me || !activeNewsletterData) return;
      const selected = Array.from(newsletterRecipientsEl?.querySelectorAll<HTMLInputElement>(".article-nl-cb:checked") || []).map((c) => c.value);
      const extras = (newsletterExtraInput?.value || "")
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => s && isValidMailAddress(s));
      const recipients = [...new Set([...selected, ...extras])];
      if (!recipients.length) return deps.showToast("Select or enter at least one recipient.", true);

      const email = buildNewsletterEmail({
        ...activeNewsletterData,
        authorName: deps.getAuthorName(me),
      });
      const mailId = deps.getMailIdentity();
      if (!mailId) {
        return deps.showToast("Radica Mail identity is not ready yet. Open Mail once or wait a moment.", true);
      }
      newsletterSendBtn.disabled = true;
      newsletterSendBtn.textContent = `Sending (0/${recipients.length})…`;

      let sent = 0;
      let failed = 0;
      for (const to of recipients) {
        try {
          const res = await sendMailMessage(me, mailId, to, email.subject, email.content, undefined, {}, deps.getFreenetClient?.());
          if (res.networkDelivered) sent++;
          else failed++;
        } catch {
          failed++;
        }
        newsletterSendBtn.textContent = `Sending (${sent + failed}/${recipients.length})…`;
      }

      newsletterSendBtn.disabled = false;
      newsletterSendBtn.textContent = "Send Newsletter";
      if (newsletterPanel) newsletterPanel.style.display = "none";
      deps.showToast(
        failed === 0
          ? `Newsletter sent to ${sent} ${sent === 1 ? "recipient" : "recipients"}!`
          : `Newsletter sent to ${sent}, ${failed} saved locally (offline/timeout).`,
        failed > 0 && sent === 0
      );
    });
  }

  wireEvents();

  return {
    openList: () => {
      if (!modal) return;
      modal.style.display = "flex";
      showView("list");
      renderList();
    },
    openCompose: () => {
      if (!modal) return;
      modal.style.display = "flex";
      openComposer();
    },
    openReader,
    refresh: () => {
      if (modal && modal.style.display !== "none" && activeView === "list") renderList();
    },
  };
}
