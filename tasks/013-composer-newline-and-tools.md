# TASK-013: Messenger composer — newline on phones, lighter input

## Reality check (2026-11-28)
- **Bug reproduced.** Playwright, Pixel 7 device (touch, `pointer: coarse`), offline identity, a DM opened: type "line one" in `#rm-composer-input`, press Enter: the box empties and the send path runs (toast "Could not send message…" because the test peer key is fake); no newline. Cause: `messengerChat.ts` ~3888 `keydown`: `if (e.key !== "Enter" || e.shiftKey || e.isComposing) return; e.preventDefault(); composerFormEl.requestSubmit();` has no touch branch. Desktop Chrome: same, which is wanted there.
- **Auto-grow already exists**: `fitInput()` (~1085) grows the textarea to 132 px then scrolls (measured 132 px with 8 lines). Nothing to add.
- **The 🌐 + chevron** is not a mode: it is `draftTranslateHtml("rm-composer-input")` from `composeTranslate.ts`, a native `<select class="draft-translate">` (options: 🌐, "→ <language>" for each `availableLangs()`, "↩ Undo"). Picking a language translates the draft **once, in place** (`translateKeeping`, on device) through one document-level `change` listener (`initDraftTranslate`, set up in `main.ts`). The only state is a `WeakMap` box -> `{ original, translated }` used by Undo. No target language is stored; there is no on/off. Same select is used by the post caption (`main.ts` 1262) and comment boxes (`main.ts` 3378): those stay as they are.
- **The "emoji button"** is `#rm-btn-quick-emoji` (`.rm-emoji-btn`): empty, marked `hidden`, inserts 🌱 on click. `#chat-modal .rm-emoji-btn { display: grid }` overrides `[hidden]`, so it still takes **30 px** of the pill as an invisible, clickable gap (measured: display grid, width 30). Used only by the composer; reactions (`CHAT_REACTIONS`) are separate. Delete it.
- **Width on Pixel 7 (412 px)**: textarea 162 px wide, placeholder scrollWidth 297 px; select 42 px + emoji gap 30 px + gaps.
- **Classic chat** (`main.ts` ~847 `#chat-message-input`) and comment boxes (`main.ts` 4829, 12645) have their own copies of the same Enter rule: separate code paths, out of scope (see open question 2).
- **Hosts for translation**: the `+` attach menu (`#rm-attach-menu`, `.rm-attach-item` rows, closes on outside click; its click handler only acts on `[data-attach]`) is the natural place: it is the composer's own tool menu. The header ⋮ menu is about the conversation, not the draft.


Maintainer report (2026-11-28, phone screenshots of a group chat):
1. **Bug**: in the Messenger composer, Enter on the phone keyboard sends the message, so there is no way to start a new line. WhatsApp/Telegram on phones: Enter inserts a newline, the send button sends.
2. **Clutter**: the input pill holds a translate control (🌐 + chevron) and a Radica emoji button; together they eat the input width (placeholder cut to "Message Fre…", the globe even overlaps the text). Maintainer: remove the emoji button (the phone keyboard has emoji); move translation out of the input box with another strategy.

## Requirements
1. **Enter behaviour**: on touch/phone (coarse pointer or soft keyboard), Enter inserts a newline and only the send button sends. On desktop keep Enter = send, Shift+Enter = newline. The textarea grows with its content up to a max height, then scrolls.
2. **Remove the Radica emoji button from the composer** (keep any emoji used elsewhere, e.g. reactions, unless the plan shows it is only the composer's).
3. **Translation out of the input**: keep the feature (outgoing message translation, if that is what the 🌐 does — the architect checks), but reach it from elsewhere, e.g. the composer's `+` attach menu, the chat ⋮ menu, or a long-press on the send button; its current state (target language on/off) must still be visible somewhere when active (e.g. a small chip above the input only while active). Architect proposes, maintainer may override.
4. The input pill gets the freed width; placeholder no longer cut on a 412 px phone.
5. **Testing & Verification**: reproduce the bug first (Playwright, Pixel 7, touch emulation: Enter sends today); after the fix Enter adds a newline on phones and sends on desktop; screenshots Pixel 7 dark+light and desktop; `npm test`, `npm run build`.
6. `ui/src/updates.ts`, `CHANGELOG.md`; `#guide-modal` if the way to reach translation changes.

## Status
🟡 **IN_PROGRESS** (2026-11-28): planned by the architect, tasks below.

## Plan
Reuse: `fitInput()` (auto-grow, unchanged), `isTouchMobileDevice()`-style `(pointer: coarse)` check, `composeTranslate.ts` (document-level listener and Undo map), the `+` attach menu rows.

1. **Enter rule** — pure helper in `ui/src/messengerLogic.ts`:
   `export function enterSends(e: { key: string; shiftKey: boolean; isComposing: boolean }, coarsePointer: boolean): boolean` — true only for Enter, no Shift, not composing, and not `coarsePointer`.
   `messengerChat.ts` keydown calls it with `matchMedia("(pointer: coarse)").matches` (read per keypress: a tablet that docks a keyboard changes primary pointer). Not true -> default action (newline; `fitInput` grows). `(pointer: coarse)` is the primary pointer, so touch laptops with a mouse/trackpad keep Enter = send. Textarea gets `enterkeyhint="enter"` so phone keyboards show a return key, not "send". Send button title "Send message (Enter)" stays (desktop); placeholder at ~3184 drops "(Shift+Enter: new line)" (wrong on phones, and it is the text that gets cut).
2. **Emoji button** — delete `#rm-btn-quick-emoji` markup, its click handler (~3894) and `.rm-emoji-btn` CSS.
3. **Translation** — remove `${draftTranslateHtml("rm-composer-input")}` from the pill; add one row to `#rm-attach-menu`: `<label class="rm-attach-item">🌐-icon <span>Translate what I wrote</span> ${draftTranslateHtml("rm-composer-input")}</label>`. The existing document `change` listener does the work, no new translate code. The select sits on the row (styled as the row's right side, or stretched transparently over it so a tap anywhere opens the native language list). Menu closes on the select's `change`. Empty box: the row is disabled (same pattern as room-link/voice rows toggled when the menu opens).
   **Visible state**: since translation is one-shot, "active" = the box currently holds a translation that Undo can reverse. `composeTranslate.ts` gains:
   - store `to` in the WeakMap entry: `{ original, translated, to }`;
   - `export function draftTranslatedTo(box): string | null` — `to` when `box.value === translated`, else null;
   - `export function undoDraftTranslate(box): boolean` — the existing Undo branch moved into a function (the select's "undo" option calls it, behaviour unchanged).
   Messenger shows a small chip above the input row, only while `draftTranslatedTo(composerInputEl)` is non-null: "Translated to Italian · Undo" (Undo calls `undoDraftTranslate`). Re-checked on the composer's `input` event (the listener already dispatches `input` after translating/undoing) and after send/clear/conversation switch.
4. **Width** — with the select and the 30 px gap gone, the pill holds only the textarea; check placeholder on 412 px.

No data, contract, signed message or wire change; nothing to keep readable (`legacy.ts` untouched).

**Moderation (3 layers)**: no new user-generated content or display surface. The translated draft is sent through the same `sendCurrentPayload` path, so layer 1 (`analyzeTextContent` / masking where the send path already applies it), layer 2 (hidden authors, curator reports, AI holds on render) and layer 3 (Report / Hide Author on bubbles) are unchanged. The chip shows only my own draft's language name.

**CONTEXT.md**: **Enter rule** and **Draft translation** added under Chat (by the architect).

## Tasks
- [x] [core] core-1: `ui/src/messengerLogic.ts`: add `enterSends(e, coarsePointer)` as in Plan 1 (JSDoc: why coarse pointer, Shift+Enter and IME composition).
- [x] [core] core-2: `ui/src/composeTranslate.ts`: store `to` in the `before` WeakMap; export `draftTranslatedTo(box)` and `undoDraftTranslate(box)`; the select's "undo" path calls `undoDraftTranslate` (toast "Nothing to undo." when it returns false, as today). No change to `draftTranslateHtml` output or the post/comment boxes.
- [ ] [ui] ui-1 (after: core-1): `ui/src/messengerChat.ts`: composer keydown uses `enterSends(e, matchMedia("(pointer: coarse)").matches)`; `enterkeyhint="enter"` on `#rm-composer-input`; placeholder at ~3184 without "(Shift+Enter: new line)". Keep the mention-popup Enter handler (~1189) first, unchanged.
  > fail: Requirement 4 (placeholder no longer cut at 412 px) unmet: the placeholder a DM actually shows is set per conversation (`messengerChat.ts` 1749/1761/1828, e.g. `Encrypted message to ${name}…`), not the "Type a message…" at ~3196, which is overwritten on load. Pixel 7 e2e: `"Encrypted message to @EVDXBK...noU2QN…" fits — Expected: <= 242, Received: 311.1` (and narrower while video/mic show; see scratchpad pixel7-light-empty.png, cut at "@CZ8YUV..."). Shorten those placeholders (e.g. "Message" / "Secret message…"; the name is already in the header). Proof: `ui/e2e/mobile.spec.ts` "on a phone, Enter in the Messenger box starts a new line…".
- [x] [ui] ui-2: `ui/src/messengerChat.ts` + `ui/src/messengerChat.css`: delete `#rm-btn-quick-emoji`, its click handler and `.rm-emoji-btn` rules.
- [x] [ui] ui-3 (after: core-2): `ui/src/messengerChat.ts`, `ui/src/messengerChat.css`, `ui/src/style.css`: move the 🌐 select out of `.rm-input-pill` into a "Translate what I wrote" row of `#rm-attach-menu` (disabled when the box is empty, menu closes on `change`); remove the `.rm-input-pill .draft-translate` rules from `style.css` (keep `.comment-actions` ones); add the "Translated to <LANGS[to]> · Undo" chip above `.rm-composer-row` (hidden unless `draftTranslatedTo(composerInputEl)`), refreshed on `input`, send, clear and conversation switch. Light + dark theme.
- [x] [ui] ui-4 (after: ui-1, ui-3): `ui/src/updates.ts` entry (2026-11-28: Enter adds a new line on phones, send with the arrow; translate your draft from **+ > Translate what I wrote**; lighter input). `ui/index.html` `#guide-modal` 🌐 Translation `<details>`: in Messenger the draft translator is in the **+** menu (still the 🌐 next to post and comment boxes); one line in the chat section on Enter on phones vs computers.
- [x] [test] test-1 (after: core-1, core-2): `ui/tests/messengerChat.test.ts`: `enterSends` table (Enter/fine -> true; Enter/coarse -> false; Shift+Enter -> false both; isComposing -> false; other keys -> false). `ui/tests/composeTranslate.test.ts`: `draftTranslatedTo` null before, `to` after a translation (stub box object + injected translator, or test the map helpers directly), null after the box is edited; `undoDraftTranslate` restores the original and returns false the second time.
- [x] [test] test-2 (after: ui-1, ui-2, ui-3): `ui/e2e/mobile.spec.ts`: on Pixel 7, Enter in `#rm-composer-input` leaves "line one\n" in the box (no send), `#rm-btn-quick-emoji` absent, no `select.draft-translate` inside `.rm-input-pill`, placeholder not overflowing (`scrollWidth <= clientWidth` for the default placeholder at 412 px). Desktop `e2e/app.spec.ts` Enter-to-send tests (344, 399, 413) still pass. Screenshots Pixel 7 light + dark and desktop, + menu open and chip shown.
  > 2026-11-28 tester: case added to `ui/e2e/mobile.spec.ts` (checks the placeholder the open DM shows, by text width vs textarea content box). Enter -> "line one\n", nothing sent, no emoji button, no select in the pill: pass. Placeholder: fails, see ui-1. Desktop project 42/42 pass (incl. Enter-to-send). UI agent screenshots reviewed: menu, chip, multiline fine.
- [ ] [test] test-3 (after: all): `npm test`, `npm run build`, `graphify update .`, `CHANGELOG.md` entry, check `updates.ts` / guide, close the spec and the `ISSUES.md` row.

## Open questions (2026-11-28: maintainer accepted all defaults)
1. Translation entry point: default **+ attach menu row** with a "Translated to X · Undo" chip while undoable. Alternatives: header ⋮ menu, long-press on send.
2. Classic chat (`#chat-message-input`) and post comment boxes have the same Enter = send on phones in separate copies of the handler. Default: **out of scope** here; a follow-up could reuse `enterSends` (one line each in `main.ts`).
3. No Ctrl/Cmd+Enter shortcut for phones with a hardware keyboard (iPad + keyboard gets newline, sends with the button). Default: skip unless asked.
