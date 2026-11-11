// The chat views are big HTML strings. A tag closed in the wrong place, or a <button> inside a <button>, is not an
// error for the browser: it repairs the tree by moving whole panels out of the layout (it happened, see #166).
// This test does the check the browser does not report.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** What a browser would have to repair in `html`: misnested or unclosed tags, and buttons inside buttons. */
function nestingProblems(html: string): string[] {
  const problems: string[] = [];
  const stack: string[] = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  for (const [tag, close, rawName] of body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g)) {
    const name = rawName.toLowerCase();
    if (VOID.has(name) || tag.endsWith("/>")) continue;
    if (!close) {
      if (name === "button" && stack.includes("button")) problems.push(`<button> inside <button>: ${tag.slice(0, 80)}`);
      stack.push(name);
    } else if (stack[stack.length - 1] === name) stack.pop();
    else problems.push(`</${name}> closes <${stack[stack.length - 1] ?? "nothing"}> (open: ${stack.slice(-4).join(" > ")})`);
  }
  if (stack.length) problems.push(`left open: ${stack.join(" > ")}`);
  return problems;
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("templates: the Messenger shell nests its tags correctly", () => {
  const shell = read("../src/messengerChat.ts").match(/rootEl\.innerHTML = `([\s\S]*?)`;/)?.[1];
  assert.ok(shell, "Messenger shell template not found");
  assert.deepEqual(nestingProblems(shell.replace(/\$\{[^}]*\}/g, "")), []);
});

test("templates: index.html nests its tags correctly", () => {
  assert.deepEqual(nestingProblems(read("../index.html")), []);
});

test("templates: the check catches a button inside a button and a misplaced close", () => {
  assert.equal(nestingProblems("<div><button><button>x</button></button></div>").length, 1);
  assert.equal(nestingProblems("<main><div></main></div>").length > 0, true);
  assert.deepEqual(nestingProblems('<div><img src="a"><svg><path d="M0"/></svg><br></div>'), []);
});

test("layout: an open post-more menu lifts content-visibility paint containment on .gram-card", () => {
  const css = read("../src/style.css");
  assert.match(css, /\.gram-card:has\(\.post-more\[open\]\)\s*\{[^}]*content-visibility:\s*visible;[^}]*z-index:/);
});

test("layout: mobile comment form lets input shrink so Send button never clips off-screen", () => {
  const css = read("../src/style.css");
  assert.match(css, /\.comment-input-wrap\s*\{[^}]*min-width:\s*0;/);
  assert.match(css, /\.comment-input-wrap\s+\.comment-input\s*\{[^}]*min-width:\s*0;/);
  assert.match(css, /\.comment-submit-btn\s*\{[^}]*flex-shrink:\s*0;/);
});

test("layout: mobile & fullscreen chat tracks visualViewport so keyboard never covers input while keeping HTML5 fullscreen intact", () => {
  const chatCss = read("../src/messengerChat.css");
  assert.match(chatCss, /#chat-modal\.fullscreen\s*\{[^}]*min\(var\(--rm-vvh,\s*100dvh\),\s*100dvh\)/);
  assert.match(chatCss, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?#chat-modal\s*\{[^}]*min\(var\(--rm-vvh,\s*100dvh\),\s*100dvh\)/);
  const mainTs = read("../src/main.ts");
  assert.match(mainTs, /syncMobileViewport/);
  assert.doesNotMatch(mainTs, /exitFullscreen\(\)[\s\S]*?exitingFullscreenForInput/);
  const storageTs = read("../src/storage.ts");
  assert.equal(storageTs.includes("replaceState(null,"), false, "safeStorage must preserve history.state for mobile Back navigation");
});

test("layout: community banner actions wrap and never clip off-screen on mobile", () => {
  const css = read("../src/style.css");
  assert.match(css, /\.comm-banner-actions\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.match(css, /\.community-header-banner\s*\{[^}]*overflow:\s*hidden;/);
});

test("layout: full width mode expands container and preserves messenger chat responsiveness", () => {
  const css = read("../src/style.css");
  assert.match(css, /html\[data-fullwidth="true"\]\s+\.container\s*\{[^}]*max-width:\s*100%/);
  const chatCss = read("../src/messengerChat.css");
  assert.match(chatCss, /html\[data-fullwidth="true"\]\s+#chat-modal\s+\.rm-messages-track/);
  const mainTs = read("../src/main.ts");
  assert.match(mainTs, /radica_fullwidth/);
  assert.match(mainTs, /applyFullWidth/);
});

test("layout: mobile mail is full screen and hides bottom rail like chat", () => {
  const mailCss = read("../src/mail.css");
  assert.match(mailCss, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?#mail-modal\s*\{[^}]*position:\s*fixed/);
  assert.match(mailCss, /#mail-modal\s*\{[^}]*min\(var\(--rm-vvh,\s*100dvh\),\s*100dvh\)/);
  const styleCss = read("../src/style.css");
  assert.match(styleCss, /body\.mail-open\s+\.rail\s*\{[^}]*display:\s*none\s*!important/);
  const mainTs = read("../src/main.ts");
  assert.match(mainTs, /document\.body\.classList\.toggle\("mail-open",\s*mailOpen\)/);
});
