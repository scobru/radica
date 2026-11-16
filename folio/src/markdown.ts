// Markdown-to-HTML preview, copied from Radica's own renderArticleMarkdown (ui/src/articles.ts) minus the
// profanity mask (not needed: this only previews the author's own draft, never someone else's text — Radica's
// own Reader re-renders the published body with its mask applied before showing it to other readers).

const SAFE_URL_RE = /^(?:https?:\/\/|freenet:|#)/i;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderInlineMarkdown(escapedLine: string): string {
  return escapedLine
    .split(/(`[^`\n]+`)/)
    .map((part, idx) => {
      if (idx % 2 === 1) return `<code class="article-inline-code">${part.slice(1, -1)}</code>`;
      let s = part;
      s = s.replace(/\[([^\]\r\n]{1,256})\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
        if (!SAFE_URL_RE.test(url)) return label;
        const isExternal = /^https?:\/\//i.test(url);
        const attrs = isExternal ? ` target="_blank" rel="noopener noreferrer"` : "";
        return `<a href="${url}" class="article-md-link"${attrs}>${label}</a>`;
      });
      s = s
        .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "<strong>$1</strong>")
        .replace(/~~(?=\S)([^~\n]*?\S)~~/g, "<del>$1</del>")
        .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, "$1<em>$2</em>")
        .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1<em>$2</em>");
      return s;
    })
    .join("");
}

/** Render full Markdown into sanitized HTML (raw HTML is escaped first, so this is XSS-safe). */
export function renderMarkdown(markdown: string): string {
  const escaped = escapeHtml(markdown || "").replace(/\r\n/g, "\n");
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
      const trimmed = lines[i].trim();
      if (!trimmed) { i++; continue; }

      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { out.push(`<hr class="article-hr" />`); i++; continue; }

      const hMatch = /^(#{1,4})[ \t]+(.+)$/.exec(trimmed);
      if (hMatch) {
        const level = hMatch[1].length;
        out.push(`<h${level} class="article-h${level}">${renderInlineMarkdown(hMatch[2])}</h${level}>`);
        i++;
        continue;
      }

      if (/^(?:&gt;|&#62;|>)[ \t]?/.test(trimmed)) {
        const qLines: string[] = [];
        while (i < lines.length && /^(?:&gt;|&#62;|>)[ \t]?/.test(lines[i].trim())) {
          qLines.push(renderInlineMarkdown(lines[i].trim().replace(/^(?:&gt;|&#62;|>)[ \t]?/, "")));
          i++;
        }
        out.push(`<blockquote class="article-quote">${qLines.join("<br />")}</blockquote>`);
        continue;
      }

      if (/^[-*+][ \t]+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*+][ \t]+/.test(lines[i].trim())) {
          items.push(`<li>${renderInlineMarkdown(lines[i].trim().replace(/^[-*+][ \t]+/, ""))}</li>`);
          i++;
        }
        out.push(`<ul class="article-ul">${items.join("")}</ul>`);
        continue;
      }

      if (/^\d+\.[ \t]+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.[ \t]+/.test(lines[i].trim())) {
          items.push(`<li>${renderInlineMarkdown(lines[i].trim().replace(/^\d+\.[ \t]+/, ""))}</li>`);
          i++;
        }
        out.push(`<ol class="article-ol">${items.join("")}</ol>`);
        continue;
      }

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
