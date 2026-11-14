// Long-form Markdown articles & decentralized newsletter helpers (TASK-004).
// Pure logic (zero DOM dependencies) so it can be unit-tested in Node.
import { escapeHtml as esc } from "./html.ts";
import { maskProfanity } from "./moderation.ts";
import { safeStorage } from "./storage.ts";

export const ARTICLE_PREFIX = "radica-article:";
export const ARTICLE_DRAFTS_PREFIX = "radica_article_drafts_";
export const ARTICLE_CACHE_PREFIX = "radica_article_cache_";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ArticlePayload {
  v: 1;
  title: string;
  subtitle: string;
  body: string;
  coverUri?: string;
  tags: string[];
  readingMinutes: number;
  publishedAt: number;
  author: string; // 64-hex pubkey
}

export interface ArticleDraft {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  coverUri?: string;
  tags: string[];
  updatedAt: number;
}

export interface ArticleRef {
  hash: string; // 64-hex BLAKE3 hash of serialized ArticlePayload
  title: string;
  subtitle: string;
  readingMinutes: number;
  tags: string[];
}

const ARTICLE_HASH_RE = /(?:^|\s)radica-article:([0-9a-f]{64})(?=\s|$)/i;
const READING_RE = /(?:⏱️|⏱)\s*(\d+)\s*min\s*read/i;

/** Count words in a Markdown string (stripping fenced code markers and URLs). */
export function countWords(markdown: string): number {
  const cleaned = (markdown || "")
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[^\n]*/g, " "))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/** Estimate reading time in whole minutes (minimum 1 minute). */
export function estimateReadingMinutes(markdown: string, wpm = 200): number {
  const words = countWords(markdown);
  if (words <= 0) return 1;
  return Math.max(1, Math.ceil(words / Math.max(60, wpm)));
}

/** Normalize comma- or space-separated tags into unique lowercase slugs without `#` (max 6). */
export function extractArticleTags(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of (input || "").split(/[\s,;]+/)) {
    const clean = raw.replace(/^#+/, "").trim().toLowerCase().replace(/[^a-z0-9_\u00C0-\u017F-]/g, "");
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 6) break;
  }
  return out;
}

/** Serialize an ArticlePayload to UTF-8 JSON bytes for media-contract / blob storage. */
export function serializeArticlePayload(payload: ArticlePayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

/** Parse and validate an ArticlePayload from UTF-8 JSON bytes. Returns null if invalid. */
export function parseArticlePayload(bytes: Uint8Array): ArticlePayload | null {
  try {
    const raw = new TextDecoder().decode(bytes);
    const obj = JSON.parse(raw) as Partial<ArticlePayload>;
    if (!obj || obj.v !== 1) return null;
    if (typeof obj.title !== "string" || !obj.title.trim()) return null;
    if (typeof obj.body !== "string") return null;
    if (typeof obj.author !== "string" || !/^[0-9a-f]{64}$/i.test(obj.author)) return null;
    return {
      v: 1,
      title: obj.title.trim(),
      subtitle: typeof obj.subtitle === "string" ? obj.subtitle.trim() : "",
      body: obj.body,
      ...(typeof obj.coverUri === "string" && obj.coverUri.trim() ? { coverUri: obj.coverUri.trim() } : {}),
      tags: Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === "string" && t.length > 0).slice(0, 6) : [],
      readingMinutes: typeof obj.readingMinutes === "number" && obj.readingMinutes > 0 ? Math.round(obj.readingMinutes) : estimateReadingMinutes(obj.body),
      publishedAt: typeof obj.publishedAt === "number" && obj.publishedAt > 0 ? obj.publishedAt : Date.now(),
      author: obj.author.toLowerCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Format a signed Radica post caption that carries an article reference.
 * Backward-compatible with older clients (readable title, subtitle, reading time, #tags, and token).
 */
export function formatArticlePostCaption(meta: {
  title: string;
  subtitle?: string;
  readingMinutes: number;
  tags?: string[];
  hash: string;
}): string {
  const title = meta.title.trim() || "Untitled Article";
  const subtitle = (meta.subtitle || "").trim();
  const mins = Math.max(1, Math.round(meta.readingMinutes || 1));
  const tagLine = (meta.tags || []).map((t) => `#${t.replace(/^#+/, "")}`).join(" ");
  const metaParts = [`⏱️ ${mins} min read`];
  if (tagLine) metaParts.push(tagLine);

  const lines = [`📰 **${title}**`];
  if (subtitle) lines.push(subtitle);
  lines.push(metaParts.join(" · "));
  lines.push("");
  lines.push(`${ARTICLE_PREFIX}${meta.hash.toLowerCase()}`);
  return lines.join("\n");
}

/** Extract ArticleRef metadata from a post caption, or null if not an article post. */
export function parseArticleCaption(caption: string): ArticleRef | null {
  if (!caption) return null;
  const hashMatch = ARTICLE_HASH_RE.exec(caption);
  if (!hashMatch) return null;
  const hash = hashMatch[1].toLowerCase();

  const lines = caption
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(ARTICLE_PREFIX));

  let title = "Untitled Article";
  let subtitle = "";
  let readingMinutes = 1;
  const tags: string[] = [];

  if (lines.length > 0) {
    title = lines[0]
      .replace(/^📰\s*/, "")
      .replace(/^\*\*(.+)\*\*$/, "$1")
      .trim() || "Untitled Article";
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const rm = READING_RE.exec(line);
    if (rm) {
      readingMinutes = Math.max(1, Number(rm[1]) || 1);
      for (const tm of line.matchAll(/#([a-zA-Z0-9_\u00C0-\u017F-]+)/g)) {
        if (!tags.includes(tm[1].toLowerCase())) tags.push(tm[1].toLowerCase());
      }
    } else if (!subtitle) {
      subtitle = line;
    }
  }

  return { hash, title, subtitle, readingMinutes, tags: tags.slice(0, 6) };
}

export const isArticlePost = (post: { caption?: string }): boolean => Boolean(post.caption && parseArticleCaption(post.caption));

const SAFE_URL_RE = /^(?:https?:\/\/|freenet:|#)/i;

function renderInlineMarkdown(escapedLine: string): string {
  // Inline code spans first so contents are not formatted
  return escapedLine
    .split(/(`[^`\n]+`)/)
    .map((part, idx) => {
      if (idx % 2 === 1) {
        return `<code class="article-inline-code">${part.slice(1, -1)}</code>`;
      }
      let s = part;
      // Markdown links: [label](url)
      s = s.replace(/\[([^\]\r\n]{1,256})\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
        if (!SAFE_URL_RE.test(url)) return label;
        const isExternal = /^https?:\/\//i.test(url);
        const attrs = isExternal ? ` target="_blank" rel="noopener noreferrer"` : "";
        return `<a href="${url}" class="article-md-link"${attrs}>${label}</a>`;
      });
      // Bold, strike, italic
      s = s
        .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "<strong>$1</strong>")
        .replace(/~~(?=\S)([^~\n]*?\S)~~/g, "<del>$1</del>")
        .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, "$1<em>$2</em>")
        .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1<em>$2</em>");
      return s;
    })
    .join("");
}

/**
 * Render full long-form Markdown into sanitized HTML for the Article Reader.
 * Escapes all raw HTML first to prevent XSS.
 */
export function renderArticleMarkdown(markdown: string, maskWords = false): string {
  const source = maskWords ? maskProfanity(markdown || "") : (markdown || "");
  const escaped = esc(source).replace(/\r\n/g, "\n");
  const blocks = escaped.split(/(```(?:[a-zA-Z0-9_#-]+)?\n[\s\S]*?```)/g);
  const out: string[] = [];

  for (let b = 0; b < blocks.length; b++) {
    const chunk = blocks[b];
    if (!chunk) continue;
    if (b % 2 === 1) {
      const langMatch = /^```([a-zA-Z0-9_#-]+)?\n([\s\S]*?)```$/.exec(chunk);
      const code = langMatch ? langMatch[2] : chunk.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
      out.push(`<pre class="article-pre"><code>${code}</code></pre>`);
      continue;
    }

    const lines = chunk.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        i++;
        continue;
      }

      // Horizontal rule
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        out.push(`<hr class="article-hr" />`);
        i++;
        continue;
      }

      // Headings (# .. ####)
      const hMatch = /^(#{1,4})[ \t]+(.+)$/.exec(trimmed);
      if (hMatch) {
        const level = hMatch[1].length;
        out.push(`<h${level} class="article-h${level}">${renderInlineMarkdown(hMatch[2])}</h${level}>`);
        i++;
        continue;
      }

      // Blockquote (escaped '>' is '&#62;' or '&gt;' or '>')
      if (/^(?:&gt;|&#62;|>)[ \t]?/.test(trimmed)) {
        const qLines: string[] = [];
        while (i < lines.length && /^(?:&gt;|&#62;|>)[ \t]?/.test(lines[i].trim())) {
          qLines.push(renderInlineMarkdown(lines[i].trim().replace(/^(?:&gt;|&#62;|>)[ \t]?/, "")));
          i++;
        }
        out.push(`<blockquote class="article-quote">${qLines.join("<br />")}</blockquote>`);
        continue;
      }

      // Unordered list
      if (/^[-*+][ \t]+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*+][ \t]+/.test(lines[i].trim())) {
          items.push(`<li>${renderInlineMarkdown(lines[i].trim().replace(/^[-*+][ \t]+/, ""))}</li>`);
          i++;
        }
        out.push(`<ul class="article-ul">${items.join("")}</ul>`);
        continue;
      }

      // Ordered list
      if (/^\d+\.[ \t]+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.[ \t]+/.test(lines[i].trim())) {
          items.push(`<li>${renderInlineMarkdown(lines[i].trim().replace(/^\d+\.[ \t]+/, ""))}</li>`);
          i++;
        }
        out.push(`<ol class="article-ol">${items.join("")}</ol>`);
        continue;
      }

      // Paragraph (collect consecutive non-empty, non-block lines)
      const pLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^(?:-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
        !/^(#{1,4})[ \t]+/.test(lines[i].trim()) &&
        !/^(?:&gt;|&#62;|>)[ \t]?/.test(lines[i].trim()) &&
        !/^[-*+][ \t]+/.test(lines[i].trim()) &&
        !/^\d+\.[ \t]+/.test(lines[i].trim())
      ) {
        pLines.push(renderInlineMarkdown(lines[i].trim()));
        i++;
      }
      out.push(`<p class="article-p">${pLines.join("<br />")}</p>`);
    }
  }

  return out.join("\n");
}

// ── Local Drafts Persistence (backed by durable.ts) ──────────────────────────

export const articleDraftsKey = (pubkey: string): string => `${ARTICLE_DRAFTS_PREFIX}${pubkey}`;

export function loadArticleDrafts(pubkey: string, store: StorageLike = safeStorage): ArticleDraft[] {
  if (!pubkey) return [];
  try {
    const raw = store.getItem(articleDraftsKey(pubkey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((d): d is ArticleDraft => Boolean(d && typeof d.id === "string" && typeof d.body === "string"))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return [];
  }
}

export function saveArticleDraft(pubkey: string, draft: ArticleDraft, store: StorageLike = safeStorage): ArticleDraft[] {
  const drafts = loadArticleDrafts(pubkey, store).filter((d) => d.id !== draft.id);
  const next = [{ ...draft, updatedAt: draft.updatedAt || Date.now() }, ...drafts].slice(0, 30);
  store.setItem(articleDraftsKey(pubkey), JSON.stringify(next));
  return next;
}

export function deleteArticleDraft(pubkey: string, draftId: string, store: StorageLike = safeStorage): ArticleDraft[] {
  const next = loadArticleDrafts(pubkey, store).filter((d) => d.id !== draftId);
  store.setItem(articleDraftsKey(pubkey), JSON.stringify(next));
  return next;
}

// ── Local Article Payload Cache ──────────────────────────────────────────────

export function cacheArticlePayload(hash: string, payload: ArticlePayload, store: StorageLike = safeStorage): void {
  if (!/^[0-9a-f]{64}$/i.test(hash)) return;
  try {
    store.setItem(`${ARTICLE_CACHE_PREFIX}${hash.toLowerCase()}`, JSON.stringify(payload));
  } catch {
    // Ignore quota errors
  }
}

export function getCachedArticlePayload(hash: string, store: StorageLike = safeStorage): ArticlePayload | null {
  if (!/^[0-9a-f]{64}$/i.test(hash)) return null;
  try {
    const raw = store.getItem(`${ARTICLE_CACHE_PREFIX}${hash.toLowerCase()}`);
    if (!raw) return null;
    return parseArticlePayload(new TextEncoder().encode(raw));
  } catch {
    return null;
  }
}

// ── Newsletter Email Formatting (Radica Mail) ────────────────────────────────

export function buildNewsletterEmail(opts: {
  title: string;
  subtitle?: string;
  body: string;
  readingMinutes: number;
  authorName: string;
  permalink: string;
}): { subject: string; content: string } {
  const title = opts.title.trim() || "Untitled Article";
  const subject = `[Newsletter] ${title}`;
  const plainBody = opts.body
    .replace(/```[\s\S]*?```/g, "[code block]")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const excerpt = plainBody.length > 360 ? `${plainBody.slice(0, 357).trimEnd()}…` : plainBody;

  const lines = [
    `${title}`,
    ...(opts.subtitle?.trim() ? [opts.subtitle.trim()] : []),
    `By ${opts.authorName} · ${Math.max(1, opts.readingMinutes)} min read`,
    "",
    excerpt,
    "",
    `Read the full article on Radica:`,
    opts.permalink,
  ];
  return { subject, content: lines.join("\n") };
}

/** Render a compact Substack/Medium-style Article Preview Card for Feed & Wall posts. */
export function renderArticleFeedCardHtml(
  post: { id: string; author: string; caption: string; timestamp: number },
  ref: ArticleRef
): string {
  const tagsHtml = ref.tags.length
    ? `<div class="article-card-tags">${ref.tags.map((t) => `<span class="article-tag-pill">#${esc(t)}</span>`).join("")}</div>`
    : "";
  return (
    `<div class="article-feed-card" data-article-post-id="${esc(post.id)}" data-article-author="${esc(post.author)}" data-article-hash="${esc(ref.hash)}">` +
      `<div class="article-feed-card-top">` +
        `<span class="article-badge">Article</span>` +
        `<span class="article-read-time">${ref.readingMinutes} min read</span>` +
      `</div>` +
      `<h4 class="article-feed-card-title">${esc(ref.title)}</h4>` +
      (ref.subtitle ? `<p class="article-feed-card-sub">${esc(ref.subtitle)}</p>` : "") +
      tagsHtml +
      `<div class="article-feed-card-footer">` +
        `<button type="button" class="btn-primary btn-sm open-article-reader-btn" data-article-post-id="${esc(post.id)}" data-article-author="${esc(post.author)}" data-article-hash="${esc(ref.hash)}">Read Article →</button>` +
      `</div>` +
    `</div>`
  );
}
