# TASK-012: Replace native confirm / alert / prompt with in-app dialogs

## Context & Goal
Radica calls the browser's `confirm()`, `alert()` and `prompt()` about 114 times (`ui/src/main.ts`, `messengerChat.ts`, `articlesPage.ts`, `greenhousePage.ts`, `supporterPanel.ts`). Native dialogs look foreign, cannot be styled for dark/light themes, block the page, and behave unreliably in the Android/desktop WebViews and in Freenet's sandboxed iframe (some sandboxes drop them silently). The maintainer asked to replace them where possible (2026-11-28).

## Reality check (2026-11-28)
- Nothing shipped yet: no `confirmDialog`/`promptDialog` in `ui/src`, no entry in `updates.ts`.
- 114 native calls confirmed: **43 `confirm`** (main 30, messengerChat 6, supporterPanel 4, articlesPage 2, greenhousePage 1), **54 `alert`** (main 46, greenhousePage 4, messengerChat 3, supporterPanel 1), **17 `prompt`** (main 14, greenhousePage 2, messengerChat 1).
- Kinds:
  - Destructive / security confirm (danger): deletes (post, comment, message, board, article, notes wipe, clear chat, feed trim), kick, ban, block, revoke device key, sign out (local key deleted), leave room, remove mod, remove badges, hide community for all, global remove.
  - Plain confirm: unblock-and-chat (messengerChat 4450, 4551), make moderator, publish-anyway checks (`okToPublish`, articles 802, greenhouse 278), duplicate moderation override, open releases page (13368).
  - Info/error alerts: all become `showToast` (`error` for failures, `warning` for validation, `info` for success).
  - Text prompts (user types, `null` = cancel): report reason (main 5205, greenhouse 296), hide-community reason (main 2464, 12427), new community name (11596), River archive migration name (messengerChat 3415, still live: `migrateRiverRoom` migrates archives).
  - Copy fallbacks `prompt("Copy …:", value)` (11 sites: main 13416..14532, greenhouse 195): show a value after the clipboard failed, includes the Freenet Mail recovery key.
- Sync functions whose callers need a boolean: `okToPublish` (main 4259; callers 1659, 4295, 4993, 5279, 5897, 9460, 11479, 12497 are all already inside async functions/listeners) and `guardDuplicateModeration` (main 2239; callers 2110 and 5034, both async). `toggleBlockAuthor` and `handleSignOut` are already async. No call does `preventDefault()` after its confirm, so awaiting is safe.
- Reuse: `showToast` (main.ts 282, local function; other pages get it via `deps.showToast` / `showToastNotice`, `supporterPanel` has none). No modal/focus-trap helper exists (`isOpen` at main 7697 only checks display). `.rm-page` (messengerChat.css 4339, ≤768px) is a full-screen page: too heavy for a one-line question, so phones get a bottom sheet. Theme vars in `style.css` (`--card-bg`, `--danger`, `[data-theme="dark"]`).
- CLI: `ui/cli/*.ts` only use readline `rl.prompt()`, no DOM dialogs, and import no page module. Keep `dialogs.ts` out of every module the CLI imports (`freenet.ts`, `moderation.ts`, `moderationPolicy.ts`, ...).
- e2e: all 5 specs in `ui/e2e/` rely on `page.on("dialog", d => d.accept())`; flows that hit a confirm will hang until they click the in-app OK.

## Requirements
1. **One shared in-app dialog module** (DOM-light, promise-based): `confirmDialog(message, { okLabel, danger })`, `promptDialog(message, { defaultValue, placeholder })`, and alerts become `showToast` (already exists) unless the text needs acknowledgement. Keyboard: Enter confirms, Escape cancels, focus trapped and returned; screen-reader labelled.
2. **Look**: on phones a bottom sheet or the TASK-011 page pattern where it fits; on desktop a small centred card. Dark and light themes. Destructive actions (delete, kick, wipe, block) use a danger style.
3. **Replace every call site**, keeping each call's meaning (what happens on cancel). Callers that are synchronous today must become async without changing behaviour (e.g. `okToPublish`, which gates publishing).
4. **No regressions in security prompts**: any confirm that guards publishing personal data, revealing keys or destructive actions must still block until answered.
5. **Testing & Verification**: unit tests for the dialog module's promise logic (resolve/reject, Escape, Enter); a test or grep check that no `confirm(` / `alert(` / `prompt(` remains in `ui/src`; Playwright screenshots (Pixel 7 dark+light, desktop) of a confirm, a danger confirm and a prompt; `npm test`, `npm run build`.
6. Update `ui/src/updates.ts`, `CHANGELOG.md`, `CONTEXT.md` (term: In-app dialog).

## Status
🟡 **IN_PROGRESS** (2026-11-28): planned by radica-architect.

## Plan

### Module `ui/src/dialogs.ts` (new, [core])
- No DOM access at import time (Node tests import it). Exports:
  - `confirmDialog(message, { okLabel?, cancelLabel?, danger? }): Promise<boolean>` (cancel, Escape, backdrop = `false`).
  - `promptDialog(message, { defaultValue?, placeholder?, okLabel?, readOnly? }): Promise<string | null>` (cancel = `null`, value returned untrimmed like native `prompt`). `readOnly: true` = copy fallback: value preselected, one "Close" button, resolves `null`.
  - `showToast(message, type, duration)` moved verbatim from main.ts (same `#toast-container` / `.toast` markup and CSS) so every page can import it.
  - Pure, testable: `dialogKeyAction(key, { kind, inInput, focused })` -> `"ok" | "cancel" | null` (Enter in the prompt input = ok, Enter on a button = that button, Escape = cancel); a FIFO queue so only one dialog is open and a second request waits (`createDialogQueue(render)`; `render` is injected, the DOM renderer is the default).
- DOM renderer: `<div class="app-dialog-backdrop"><div class="app-dialog" role="alertdialog" aria-modal="true" aria-labelledby aria-describedby>`, message as `textContent` with `white-space: pre-line` (keeps the `\n\n` in current texts, no HTML injection), buttons `[data-dialog-ok]` / `[data-dialog-cancel]`, `.danger` on OK when `danger`. Focus trapped (Tab cycles), returned to the previously focused element on close. Initial focus: prompt input, else OK; Cancel when `danger` (see Open questions).
- Blocking: the backdrop covers the whole viewport above every modal (z-index above `#chat-modal` and modals, below `#toast-container` 999999), so the page cannot be clicked or typed into until answered: security confirms still block, only asynchronously.

### CSS `ui/src/dialogs.css` (new, [ui])
Desktop: centred card (max-width ~420px). `@media (max-width: 768px)`: bottom sheet, full width, safe-area padding, full-width buttons. Uses `--card-bg`, `--text`, `--border`, `--primary`, `--danger` so dark/light/accents follow. Imported from main.ts (not from dialogs.ts: Node cannot import CSS).

### Call-site rules (all [ui] tasks)
- `if (!confirm(x)) return;` -> `if (!(await confirmDialog(x, { danger }))) return;` making the enclosing handler `async` if needed. `danger: true` for delete, kick, ban, block, wipe, clear, revoke, sign out, leave, remove, hide-for-all.
- `okToPublish` -> `async`, returns `Promise<boolean>`; each of its 8 callers becomes `if (!(await okToPublish(...)))`. `guardDuplicateModeration` -> `async`; callers 2110 and 5034 await it.
- `prompt` with typed text -> `promptDialog`, same cancel meaning (`null` returns; 2464 keeps `?? ""`: cancel still hides with no reason).
- Copy fallback prompts -> `promptDialog(label, { defaultValue: value, readOnly: true })`.
- `alert` -> `showToast` (`error` / `warning` / `info`, longer `duration` for long texts such as the room-create timeout at main 10162).
- `openExternalUrl` after the releases confirm (13368) runs in the OK click, so the user gesture is kept.

### Data / wire format / moderation
No data, contract or signed-message change; `legacy.ts` untouched. Moderation: no new user content. The publish-anyway checks (`okToPublish`, articles 802, greenhouse 278: Layer 1) and Report prompts (Layer 3) keep exactly their meaning; nothing is published until the dialog resolves `true`.

### CONTEXT.md
New term: **In-app dialog** (added under Decisions).

## Open questions (2026-11-28: maintainer accepted all defaults)
1. Danger confirms focus **Cancel** first, so a stray Enter does not delete (native focuses OK). Default: Cancel.
2. Backdrop tap cancels (resolves false/null). Default: yes, for all kinds.
3. Every `alert` becomes a toast; no acknowledged alert dialog. Default: yes (failure toasts 6 s).
4. Copy fallbacks (recovery key, inbox address, tokens): read-only dialog with the value selected and a Close button. Default: yes.
5. Phones get a bottom sheet, not the full-screen `.rm-page`. Default: bottom sheet.
6. `#guide-modal`: no new section (no new capability, same actions). Default: none.

## Tasks
- [ ] [core] core-1: `ui/src/dialogs.ts`: `confirmDialog`, `promptDialog` (incl. `readOnly`), moved `showToast`, pure `dialogKeyAction` + `createDialogQueue`, DOM renderer with focus trap/return, aria labels, no DOM at import.
- [ ] [ui] ui-1: `ui/src/dialogs.css` (card desktop, bottom sheet ≤768px, dark/light, `.danger`) and `ui/src/updates.ts` entry. after: core-1 (class names).
- [ ] [ui] ui-2: `ui/src/main.ts`, all 90 sites: import `confirmDialog`/`promptDialog`/`showToast` from `dialogs.ts` and delete the local `showToast`, `import "./dialogs.css"`, make `okToPublish` and `guardDuplicateModeration` async and await them at all callers. after: core-1.
- [ ] [ui] ui-3: `ui/src/messengerChat.ts`, 10 sites (6 confirm, 3 alert -> `deps.showToast`, River migration prompt). after: core-1.
- [ ] [ui] ui-4: `ui/src/articlesPage.ts` (2), `ui/src/greenhousePage.ts` (7), `ui/src/supporterPanel.ts` (5, toast imported from `dialogs.ts`). after: core-1.
- [ ] [test] test-1: `ui/tests/dialogs.test.ts`: queue (one at a time, FIFO, resolve true/false/null), `dialogKeyAction` (Enter, Escape, Enter on Cancel, Enter in prompt), import has no DOM side effect. after: core-1.
- [ ] [test] test-2: `ui/tests/noNativeDialogs.test.ts`: no `(?<![\w.$])(window\.)?(confirm|alert|prompt)\(` left in `ui/src/**/*.ts`; `cli.test.ts` still passes. after: ui-2, ui-3, ui-4.
- [ ] [test] test-3: `ui/e2e/`: replace reliance on `page.on("dialog")` with clicking `[data-dialog-ok]` where flows confirm; new `e2e/dialogs.spec.ts` screenshots (Pixel 7 dark + light, desktop) of a confirm, a danger confirm and a prompt (via dynamic import of `/src/dialogs.ts` in the dev page). after: ui-1, ui-2.
- [ ] [test] test-4: `npm test`, `npm run build`, `graphify update .`, `CHANGELOG.md` entry, check `CONTEXT.md` term, set spec and `ISSUES.md` to DONE. after: all.
