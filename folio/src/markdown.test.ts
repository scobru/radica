import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "./markdown.ts";

test("renderMarkdown escapes raw HTML and renders headings, lists, and inline formatting", () => {
  const html = renderMarkdown("# Hi <script>\n\nSome **bold** and *italic*.\n\n- one\n- two");
  assert.match(html, /<h1 class="article-h1">Hi &lt;script&gt;<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<ul class="article-ul"><li>one<\/li><li>two<\/li><\/ul>/);
});

test("renderMarkdown of empty input is empty", () => {
  assert.equal(renderMarkdown(""), "");
});
