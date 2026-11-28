# TASK-012: Replace native confirm / alert / prompt with in-app dialogs

## Context & Goal
Radica calls the browser's `confirm()`, `alert()` and `prompt()` about 114 times (`ui/src/main.ts`, `messengerChat.ts`, `articlesPage.ts`, `greenhousePage.ts`, `supporterPanel.ts`). Native dialogs look foreign, cannot be styled for dark/light themes, block the page, and behave unreliably in the Android/desktop WebViews and in Freenet's sandboxed iframe (some sandboxes drop them silently). The maintainer asked to replace them where possible (2026-11-28).

## Requirements
1. **One shared in-app dialog module** (DOM-light, promise-based): `confirmDialog(message, { okLabel, danger })`, `promptDialog(message, { defaultValue, placeholder })`, and alerts become `showToast` (already exists) unless the text needs acknowledgement. Keyboard: Enter confirms, Escape cancels, focus trapped and returned; screen-reader labelled.
2. **Look**: on phones a bottom sheet or the TASK-011 page pattern where it fits; on desktop a small centred card. Dark and light themes. Destructive actions (delete, kick, wipe, block) use a danger style.
3. **Replace every call site**, keeping each call's meaning (what happens on cancel). Callers that are synchronous today must become async without changing behaviour (e.g. `okToPublish`, which gates publishing).
4. **No regressions in security prompts**: any confirm that guards publishing personal data, revealing keys or destructive actions must still block until answered.
5. **Testing & Verification**: unit tests for the dialog module's promise logic (resolve/reject, Escape, Enter); a test or grep check that no `confirm(` / `alert(` / `prompt(` remains in `ui/src`; Playwright screenshots (Pixel 7 dark+light, desktop) of a confirm, a danger confirm and a prompt; `npm test`, `npm run build`.
6. Update `ui/src/updates.ts`, `CHANGELOG.md`, `CONTEXT.md` (term: In-app dialog).

## Status
⚪ **TODO** (2026-11-28)
