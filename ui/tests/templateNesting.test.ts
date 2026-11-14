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

test("typography: headings consistently render in Fraunces display font across all child elements", () => {
  const styleCss = read("../src/style.css");
  assert.match(styleCss, /--font-serif:\s*var\(--font-display\);/);
  assert.match(styleCss, /h1\s*\*,[\s\S]*?h2\s*\*,[\s\S]*?h3\s*\*[\s\S]*?font-family:\s*inherit/);
  assert.match(styleCss, /\.mail-title[\s\S]*?font-family:\s*var\(--font-display\)/);
  const mailCss = read("../src/mail.css");
  assert.match(mailCss, /\.mail-title\s*\{[\s\S]*?font-family:\s*var\(--font-display\)/);
});

function extractSvgInner(html: string, markerRegex: RegExp): string {
  const match = html.match(markerRegex);
  assert.ok(match, `Missing expected section matching ${markerRegex}`);
  const tail = html.slice(match.index!);
  const svgMatch = tail.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/);
  assert.ok(svgMatch, `Missing <svg> after ${markerRegex}`);
  return svgMatch[1].replace(/\s+/g, " ").trim();
}

test("ui consistency: sidebar rail icons match page and modal headers", () => {
  const indexHtml = read("../index.html");
  const messengerTs = read("../src/messengerChat.ts");
  const mainTs = read("../src/main.ts");

  const pairs: Array<[string, RegExp, string, RegExp]> = [
    ["notifs", /id="open-notifs-btn"/, "notifs-modal", /id="notifs-modal"[\s\S]{0,600}?<(?:h2|h3)\b/],
    ["identity", /id="open-identity-btn"/, "identity-modal", /id="identity-modal"[\s\S]{0,600}?<(?:h2|h3)\b/],
    ["media", /id="open-media-btn"/, "media-modal", /id="media-modal"[\s\S]{0,600}?<(?:h2|h3)\b/],
    ["updates", /id="updates-open-btn"/, "updates-modal", /id="updates-modal"[\s\S]{0,600}?<(?:h2|h3)\b/],
    ["greenhouse", /id="greenhouse-open-btn"/, "greenhouse-modal", /id="greenhouse-modal"[\s\S]{0,600}?<(?:h2|h3)\b/],
    ["blocklists", /id="blocklists-open-btn"/, "blocklists-modal", /id="blocklists-modal"[\s\S]{0,600}?<(?:h2|h3)\b/],
    ["guide", /id="guide-open-btn"/, "guide-modal", /id="guide-modal"[\s\S]{0,600}?<(?:h2|h3)\b/],
    ["settings", /id="settings-open-btn"/, "settings-modal", /id="settings-modal"[\s\S]{0,600}?<(?:h2|h3)\b/],
    ["mail", /id="open-mail-btn"/, "mail-modal", /id="mail-modal"[\s\S]{0,600}?class="mail-title"/],
  ];

  for (const [name, railRe, modalLabel, headerRe] of pairs) {
    const railSvg = extractSvgInner(indexHtml, railRe);
    const headerSvg = extractSvgInner(indexHtml, headerRe);
    assert.equal(headerSvg, railSvg, `Rail icon for '${name}' does not match '${modalLabel}' header icon`);
  }

  // Messenger chat header matches rail chat icon
  const chatRailSvg = extractSvgInner(indexHtml, /id="open-chat-btn"/);
  const chatHeaderSvg = extractSvgInner(messengerTs, /class="rm-inbox-title"/);
  assert.equal(chatHeaderSvg, chatRailSvg, "Messenger chat header icon does not match rail chat button icon");

  // Modals without rail counterparts still include header SVG icons
  for (const modalId of ["profile-modal", "milestones-modal", "create-comm-modal", "welcome-modal"]) {
    const re = new RegExp(`id="${modalId}"[\\s\\S]{0,600}?<(?:h2|h3)\\b`);
    const svg = extractSvgInner(indexHtml, re);
    assert.ok(svg.length > 0, `${modalId} header is missing an SVG icon`);
  }

  // Dynamic title updates preserve header <svg> via inner <span>
  assert.match(indexHtml, /id="blocklists-modal-title"[^>]*>[\s\S]*?<svg[\s\S]*?<span[^>]*id="blocklists-modal-title-text"/);
  assert.match(indexHtml, /id="create-comm-title"[^>]*>[\s\S]*?<svg[\s\S]*?<span[^>]*id="create-comm-title-text"/);
  assert.match(mainTs, /blocklistsModalTitle\.querySelector\("span"\)/);
  assert.match(mainTs, /createCommTitle\.querySelector\("span"\)/);
});

test("moments: header, composer, filter toolbar, and card grid styling", () => {
  const indexHtml = read("../index.html");
  const styleCss = read("../src/style.css");
  const mainTs = read("../src/main.ts");

  assert.match(indexHtml, /id="media-modal"[\s\S]*?class="moments-header"/);
  assert.match(indexHtml, /id="moments-count-pill"/);
  assert.match(indexHtml, /id="media-quick-post"[^>]*class="moments-composer"/);
  assert.match(indexHtml, /id="moments-toolbar"[\s\S]*?data-mfilter="all"[\s\S]*?data-mfilter="photos"[\s\S]*?data-mfilter="videos"[\s\S]*?data-mfilter="following"/);

  for (const selector of [
    /\.moments-header\s*\{/,
    /\.moments-composer\s*\{/,
    /\.moments-toolbar\s*\{/,
    /#media-grid-container\.media-grid\s*\{/,
    /\.media-multi-badge\s*\{/,
    /\.media-author-row\s*\{/,
    /\.media-caption-snippet\s*\{/,
    /\.media-footer-bar\s*\{/,
    /\.media-empty\s*\{/,
  ]) {
    assert.match(styleCss, selector, `Expected ${selector} in style.css`);
  }

  assert.match(mainTs, /currentMomentsFilter/);
  assert.match(mainTs, /media-author-row/);
  assert.match(mainTs, /media-caption-snippet/);
  assert.match(mainTs, /media-multi-badge/);
  assert.match(mainTs, /media-empty/);
});
