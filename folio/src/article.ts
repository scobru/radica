// Pure article logic (no DOM), unit-testable in Node. Mirrors the wire shape Radica itself writes
// (ui/src/articles.ts ArticlePayload), so an article published here opens in Radica's Reader unchanged.

/** Radica's own token (ui/src/articles.ts ARTICLE_PREFIX): pasted into any post caption, Radica's
 *  parseArticleCaption finds it regardless of where it was written and renders a full Article card. */
export const ARTICLE_PREFIX = "radica-article:";

export interface ArticlePayload {
  v: 1;
  title: string;
  subtitle: string;
  body: string;
  coverUri?: string;
  tags: string[];
  readingMinutes: number;
  publishedAt: number;
  author: string; // 64-hex; Folio signs nothing, so this is always ANONYMOUS_AUTHOR (see README)
}

/** Folio has no identity: a fixed, obviously-fake 64-hex placeholder, not a real pubkey. Radica's reader for this
 *  permalink shape never trusts this field anyway — it shows every such article as "Anonymous" regardless. */
export const ANONYMOUS_AUTHOR = "0".repeat(64);

/** Count words in Markdown (stripping fenced code, link labels, and markdown punctuation). */
export function countWords(markdown: string): number {
  const cleaned = (markdown || "")
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[^\n]*/g, " "))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/** Reading time in whole minutes, minimum 1. */
export function estimateReadingMinutes(markdown: string, wpm = 200): number {
  const words = countWords(markdown);
  if (words <= 0) return 1;
  return Math.max(1, Math.ceil(words / Math.max(60, wpm)));
}

/** Normalize comma/space-separated tags into unique lowercase slugs without "#" (max 6). */
export function extractTags(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of (input || "").split(/[\s,;]+/)) {
    const clean = raw.replace(/^#+/, "").trim().toLowerCase().replace(/[^a-z0-9_À-ſ-]/g, "");
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 6) break;
  }
  return out;
}

/** Build a publishable payload from the editor's raw fields, or throw with a message fit to show the user. */
export function buildPayload(input: { title: string; subtitle: string; body: string; tags: string }): ArticlePayload {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required.");
  const body = input.body;
  if (!body.trim()) throw new Error("The article body is empty.");
  return {
    v: 1,
    title,
    subtitle: input.subtitle.trim(),
    body,
    tags: extractTags(input.tags),
    readingMinutes: estimateReadingMinutes(body),
    publishedAt: Date.now(),
    author: ANONYMOUS_AUTHOR,
  };
}

export function serializePayload(payload: ArticlePayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

/** Parse bytes fetched from media-contract back into an ArticlePayload, or null if malformed (mirrors
 * Radica's own parseArticlePayload validation — ui/src/articles.ts). */
export function parsePayload(bytes: Uint8Array): ArticlePayload | null {
  try {
    const obj = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ArticlePayload>;
    if (!obj || obj.v !== 1 || typeof obj.title !== "string" || !obj.title.trim() || typeof obj.body !== "string") return null;
    return {
      v: 1,
      title: obj.title.trim(),
      subtitle: typeof obj.subtitle === "string" ? obj.subtitle.trim() : "",
      body: obj.body,
      tags: Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === "string").slice(0, 6) : [],
      readingMinutes: typeof obj.readingMinutes === "number" && obj.readingMinutes > 0 ? obj.readingMinutes : estimateReadingMinutes(obj.body),
      publishedAt: typeof obj.publishedAt === "number" && obj.publishedAt > 0 ? obj.publishedAt : Date.now(),
      author: typeof obj.author === "string" && /^[0-9a-f]{64}$/i.test(obj.author) ? obj.author.toLowerCase() : ANONYMOUS_AUTHOR,
    };
  } catch {
    return null;
  }
}
