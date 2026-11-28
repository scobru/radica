# TASK-014: Messenger composer — newline on phones, lighter input

## Reality check (2026-11-28)
- **Enter bug confirmed** (`ui/src/messengerChat.ts:3888-3892`): `#rm-composer-input` `keydown` calls `composerFormEl.requestSubmit()` whenever `e.key === "Enter" && !e.shiftKey && !e.isComposing`, with no `(pointer: coarse)` check and no Safari `e.keyCode === 229` IME fallback. The `@mention` popup `keydown` listener at `ui/src/messengerChat.ts:1177-1195` runs earlier and calls `e.stopImmediatePropagation()` on `Enter` / `Tab`, so it already intercepts mention selection cleanly.
- **Auto-grow already implemented** (`ui/src/messengerChat.ts:1086-1098`, `ui/src/messengerChat.css:1780-1793`): `fitInput()` resizes `#rm-composer-input` with content up to `132px`, then switches `overflowY` to `"auto"`.
- **Invisible emoji button gap confirmed** (`ui/src/messengerChat.ts:639`, `ui/src/messengerChat.css:1812-1830`): `#rm-btn-quick-emoji` (`.rm-emoji-btn`) carries `hidden`, yet `#chat-modal .rm-emoji-btn { display: grid }` overrides the browser `[hidden]` rule, leaving a 30 px clickable `🌱` gap inside `.rm-input-pill` (click handler at `ui/src/messengerChat.ts:3894-3899`).
- **Draft translate clutter confirmed** (`ui/src/messengerChat.ts:638`, `ui/src/style.css:6949-6977`): `draftTranslateHtml("rm-composer-input")` (`ui/src/composeTranslate.ts:31-34`) sits inside `.rm-input-pill`, eating ~42 px+ and truncating placeholders (such as `Type a message… (Shift+Enter: new line)` at `ui/src/messengerChat.ts:3184`) on narrow phones. Post (`#post-caption`) and comment (`.comment-actions .draft-translate`) boxes keep their own `.draft-translate` selects unchanged.
- **Scope confirmed**: Classic chat (`#chat-message-input`) and post comment boxes are out of scope per accepted defaults; `Ctrl/Cmd+Enter` on tablets is skipped per accepted defaults.

## Context & Goal
Maintainer report (2026-11-28, phone screenshots of a group chat):
1. **Bug**: In the Messenger composer, pressing Enter on the phone keyboard sends the message instead of inserting a new line, leaving no way to write multi-line messages on phones. On phones (like WhatsApp/Telegram), Enter should insert a newline and only the send button should send; on desktop, Enter should keep sending and Shift+Enter should insert a newline.
2. **Clutter**: The input pill currently holds a translate control (`🌐` + chevron) and an invisible Radica emoji button (`#rm-btn-quick-emoji` / `.rm-emoji-btn`), eating input width so the placeholder gets cut off (`Message Fre…`) on a 412 px phone. The phone keyboard already provides emoji, so the Radica emoji button should be removed and draft translation moved out of the input pill into the `+` attach menu with a small indicator chip above the input while active.

*(Note: Originally started on `origin/ccr-3f734274-za5q8n` as `TASK-013`, renumbered to `TASK-014` on `master` because `TASK-013` was already assigned to Greenhouse.)*

## Requirements
1. **Enter behaviour**: On touch/phone (`(pointer: coarse)`), Enter inserts a newline and only the send button sends (`enterkeyhint="enter"`). On desktop keep Enter = send, Shift+Enter = newline. The textarea auto-grows with content up to a max height, then scrolls. Protect against premature IME confirmation (including Safari `keyCode === 229`).
2. **Remove the Radica emoji button from the composer**: Delete `#rm-btn-quick-emoji`, its click handler, and `.rm-emoji-btn` CSS (keep message reactions intact).
3. **Translation out of the input**: Keep one-shot on-device draft translation (`composeTranslate.ts`), move it from `.rm-input-pill` into a `"Translate what I wrote"` row in the `+` attach menu (disabled when draft is empty, closes menu on selection), and show a compact `"Translated to <Language> · Undo"` chip above `.rm-composer-row` only while the box holds an untouched translation.
4. **Width**: Freed width goes to `#rm-composer-input`; placeholder fits without truncation on a 412 px phone.
5. **Testing & Verification**: Unit tests for `enterSends` and draft translation state (`draftTranslatedTo` / `undoDraftTranslate`), mobile Playwright test verifying Enter inserts a newline and composer cleanup on Pixel 7, `npm test`, `npm run build`, `graphify update .`.
6. **Docs**: Update `ui/src/updates.ts`, `ui/index.html` (`#guide-modal`), `CONTEXT.md`, and `CHANGELOG.md`.

## Open questions (2026-11-28: maintainer accepted all defaults)
1. **Where should translation go?** Default: **+ attach menu row** (`Translate what I wrote`) with a `"Translated to <Language> · Undo"` chip above the box while undoable. (Accepted.)
2. **Classic chat (`#chat-message-input`) and post comment boxes**: Separate code paths with the same Enter rule. Default: **out of scope** here; follow-up task can reuse `enterSends`. (Accepted.)
3. **Ctrl/Cmd+Enter on tablets with a hardware keyboard**: Default: **skip** unless requested. (Accepted.)

## Status
🟢 DONE (2026-11-28)

## Plan

### `[core]` (`ui/src/messengerLogic.ts`, `ui/src/composeTranslate.ts`)
- `ui/src/messengerLogic.ts`: export `enterSends(e: { key: string; shiftKey: boolean; isComposing: boolean; keyCode?: number }, coarsePointer: boolean): boolean` returning `e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && !coarsePointer`.
- `ui/src/composeTranslate.ts`: extend the `before` `WeakMap` entries to `{ original: string; translated: string; to: string }`; export:
  - `noteDraftTranslate(box: HTMLElement, original: string, translated: string, to: string): void`
  - `draftTranslatedTo(box: HTMLTextAreaElement | HTMLInputElement): string | null` (returns `b.to` only while `box.value === b.translated`, else `null`)
  - `undoDraftTranslate(box: HTMLTextAreaElement | HTMLInputElement): boolean` (restores `b.original` and dispatches bubbling `input` event when `box.value === b.translated`, returning `true`; otherwise `false`)
  - Update `initDraftTranslate` to use `undoDraftTranslate` and `noteDraftTranslate` without changing `draftTranslateHtml` (post/comment boxes stay untouched; no wire/contract/legacy changes needed).

### `[ui]` (`ui/src/messengerChat.ts`, `ui/src/messengerChat.css`, `ui/src/style.css`, `ui/src/updates.ts`, `ui/index.html`)
- **`ui-1`** (`ui/src/messengerChat.ts`):
  - Replace inline `keydown` guard at `#rm-composer-input` with `if (!enterSends(e, window.matchMedia("(pointer: coarse)").matches)) return;` (leaving the earlier `@mention` popup `Enter`/`Tab` handler untouched).
  - Add `enterkeyhint="enter"` and `aria-label="Message"` on `#rm-composer-input`.
  - Simplify the `selectConv` placeholder (`~3184`) from `"Type a message… (Shift+Enter: new line)"` to `"Type a message…"`.
- **`ui-2`** (`ui/src/messengerChat.ts`, `ui/src/messengerChat.css`):
  - Remove `#rm-btn-quick-emoji` from `.rm-input-pill`, remove its click handler, and delete `#chat-modal .rm-emoji-btn` / `:hover` rules from `ui/src/messengerChat.css` (leaving message reactions intact).
- **`ui-3`** (`ui/src/messengerChat.ts`, `ui/src/messengerChat.css`, `ui/src/style.css`):
  - Move `draftTranslateHtml("rm-composer-input")` out of `.rm-input-pill` into a `"Translate what I wrote"` row (`#rm-attach-translate`) inside `#rm-attach-menu` (`position: relative` wrapper with transparent `select.draft-translate` overlay so tapping anywhere on the row opens the native `<select>` picker; disable/dim the row when `#rm-composer-input` draft is empty; close `#rm-attach-menu` on `change`).
  - Remove `.rm-input-pill .draft-translate` selectors from `ui/src/style.css` (keeping `.draft-translate` and `.comment-actions .draft-translate` intact).
  - Add `#rm-translate-chip` (`"Translated to <LANGS[to]> · Undo"`, `hidden` by default, with `#chat-modal .rm-translate-chip[hidden] { display: none; }` enforced) above `.rm-composer-row`, clicking Undo calls `undoDraftTranslate(composerInputEl)`, and `syncTranslateChip()` keeps it synced on `input`, send, clear/cancel (`cancelEditing` / `#rm-edit-banner-cancel`), and conversation switch (`updateHeader` / `syncComposerButtons`).
- **`ui-4`** (`ui/src/updates.ts`, `ui/index.html`):
  - `ui/src/updates.ts`: prepend a `2026-11-28` entry describing phone Enter = newline, cleaner input pill, and `+` → **Translate what I wrote** with the undo chip.
  - `ui/index.html` (`#guide-modal`): update `🌐 Translation` (mentioning Messenger's `+` → **Translate what I wrote** and the `Translated to … · Undo` chip alongside post/comment 🌐 menus) and note the phone vs. desktop Enter behavior in chat.

### Moderation (all 3 layers, `AGENTS.md`)
- No new user-generated content type, storage format, or display surface is introduced. Translated drafts still enter `#rm-composer-input` and pass through `sendCurrentPayload` / `deps.onSendMessage` and all existing Layer 1 (Desert Ant media/text checks), Layer 2 (hidden/blocked/curator/AI hold filtering), and Layer 3 (Report / Hide Author controls) intact.

### Domain language (`CONTEXT.md`)
- Add **Enter rule** and **Draft translation** under `## Chat` in `CONTEXT.md`.

### `[test]` (`ui/tests/messengerChat.test.ts`, `ui/tests/composeTranslate.test.ts`, `ui/e2e/mobile.spec.ts`)
- **`test-1`**: unit tests for `enterSends` (`Shift+Enter`, `isComposing`, `keyCode === 229`, `coarsePointer`, desktop `Enter`, non-Enter keys) in `ui/tests/messengerChat.test.ts`, and `noteDraftTranslate` / `draftTranslatedTo` / `undoDraftTranslate` (including editing after translation invalidating undo/chip and dispatching `input`) in `ui/tests/composeTranslate.test.ts`.
- **`test-2`**: add a Pixel 7 mobile Playwright test in `ui/e2e/mobile.spec.ts` verifying `Enter` inserts a newline without sending, `#rm-btn-quick-emoji` and `.rm-input-pill select.draft-translate` are absent, `#rm-attach-translate` exists in `#rm-attach-menu`, and `#rm-composer-input` placeholder fits without horizontal overflow; run Playwright mobile e2e if available.
- **`test-3`**: run `npm test`, `npm run build`, and `graphify update .`, verify `AGENTS.md` checklist (`updates.ts`, `#guide-modal`, `CHANGELOG.md`, `CONTEXT.md`), and close `tasks/014-composer-newline-and-tools.md` + `ISSUES.md`.

## Tasks
- [x] [core] core-1: ui/src/messengerLogic.ts: add enterSends(e, coarsePointer) with Shift+Enter, isComposing, keyCode 229, and coarsePointer guards.
- [x] [core] core-2: ui/src/composeTranslate.ts: store to in before WeakMap; export noteDraftTranslate, draftTranslatedTo, and undoDraftTranslate; use them in initDraftTranslate without changing draftTranslateHtml.
- [x] [ui] ui-1: ui/src/messengerChat.ts: wire enterSends(e, window.matchMedia("(pointer: coarse)").matches) in composer keydown, add enterkeyhint="enter" and aria-label="Message" on #rm-composer-input, drop "(Shift+Enter: new line)" from placeholder, and shorten Secret DM / DM / Channel & Group placeholders in renderHeader(). (after: core-1)
- [x] [ui] ui-2: ui/src/messengerChat.ts and ui/src/messengerChat.css: remove #rm-btn-quick-emoji, its click handler, and .rm-emoji-btn rules.
- [x] [ui] ui-3: ui/src/messengerChat.ts, ui/src/messengerChat.css, and ui/src/style.css: move draftTranslateHtml("rm-composer-input") into #rm-attach-menu (#rm-attach-translate), remove .rm-input-pill .draft-translate CSS, and add #rm-translate-chip ("Translated to <LANGS[to]> · Undo") above .rm-composer-row synced via syncTranslateChip(). (after: core-2)
- [x] [ui] ui-4: ui/src/updates.ts (2026-11-28 entry) and ui/index.html (#guide-modal 🌐 Translation and chat Enter behavior). (after: ui-1, ui-3)
- [x] [test] test-1: ui/tests/messengerChat.test.ts and ui/tests/composeTranslate.test.ts: unit tests for enterSends (incl. coarsePointer, Shift+Enter, isComposing, keyCode 229) and draftTranslatedTo / undoDraftTranslate. (after: core-1, core-2)
- [x] [test] test-2: ui/e2e/mobile.spec.ts: add Pixel 7 test verifying Enter adds a newline without sending, #rm-btn-quick-emoji and .rm-input-pill select.draft-translate are absent, #rm-attach-translate exists, and placeholder fits without overflow; run Playwright e2e if available. (after: ui-1, ui-2, ui-3)
- [x] [test] test-3: run npm test, npm run build, and graphify update ., verify AGENTS.md rules, add CHANGELOG.md entry, and close tasks/014-composer-newline-and-tools.md and ISSUES.md. (after: all)
