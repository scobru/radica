# TASK-016: Fix jumping web sidebar, Reels lower bar loss, and Android resume stutter

## Context & Goal
Three planned Greenhouse bug/feature reports from community members:
1. **Jumping sidebar on web** (`holdmylatte`, Seed ID `e675ad113c88c35c9b79bcb8252564f3512b6f25ad6625baea483268331248cd:mx08twuz2dsj81`, Permalink `#greenhouse&seed=e675ad113c88c35c9b79bcb8252564f3512b6f25ad6625baea483268331248cd%3Amx08twuz2dsj81`):
   - Switching between tabs (`Chat`, `Mail`, the Radica logo / `Feed`, etc.) makes the desktop sidebar (`.rail`) jump vertically and/or horizontally.
2. **Reels lower bar disappears on Back** (`Agent.69`, Seed ID `f8c2edad2b143b43b6207eefe3922f0bf53832adc61b01784ebb3041424193ef:mwrzai30x9l4kt`, Permalink `#greenhouse&seed=f8c2edad2b143b43b6207eefe3922f0bf53832adc61b01784ebb3041424193ef%3Amwrzai30x9l4kt`):
   - Opening the `🎬 Reels` section inside Moments and navigating back leaves the lower navigation bar (`.rail`) permanently missing until restarting the app.
3. **Android resume stutter & unresponsive 3-dots box** (`Agent.69`, Seed ID `f8c2edad2b143b43b6207eefe3922f0bf53832adc61b01784ebb3041424193ef:mwrydyok17povy`, Permalink `#greenhouse&seed=f8c2edad2b143b43b6207eefe3922f0bf53832adc61b01784ebb3041424193ef%3Amwrydyok17povy`):
   - Switching to another app and returning to the Android APK causes main-thread stutter and makes the 3-dots menu (`⋯`) and controls inside that box unresponsive for several seconds.

## Requirements
1. **Steady Desktop Sidebar (`.rail`)**: Switching between Feed (Radica logo), Chat, Mail, and any other rail page on desktop (`min-width: 769px`) keeps `.rail` at the exact same horizontal and vertical coordinates (no scrollbar-width jump, no `margin-top` mismatch).
2. **Reels Back Restores Lower Bar**: Navigating back out of Reels (via Back button/gesture, `← Moments`, closing `#media-modal`, opening an author profile, or `closeRailPages()`) always removes `body.reels-fullscreen-mobile` and resets cleanly so the mobile bottom `.rail` is visible again without restarting.
3. **Smooth Resume & Responsive 3-Dots Menu**:
   - Eliminate unnecessary multi-MB storage serialization on `visibilitychange` when nothing changed (`dirty` tracking + O(N) over-budget pruning in `storage.ts`) and replace blocking `SharedPreferences` XML blob I/O in Android `NativeStorage` (`MainActivity.java`) with an atomic background-written UTF-8 file (`radica_storage.json` with one-time migration from `SharedPreferences`).
   - Debounce network `tick(true)` slightly on `visibilitychange` (`250ms`) and pace `resubscribe()` cleanly (`resubscribeDelayMs`).
   - Reset `isFeedTouching` on `visibilitychange` / `blur`, and defer background `scheduleRenderTimeline()` redraws while a 3-dots menu (`details.post-more[open]` or `.rail.more-open`) is open, flushing when closed.
4. **Testing & Verification**: Unit tests (`ui/tests/storage.test.ts`, `ui/tests/reconnect.test.ts` / `network.test.ts`), Playwright desktop sidebar stability test (`ui/e2e/app.spec.ts`) and mobile Reels Back lower-bar test (`ui/e2e/mobile.spec.ts`), `npm test`, `npm run build`, `graphify update .`.
5. **Docs**: Prepend `2026-11-28` entry in `ui/src/updates.ts`, update `CHANGELOG.md` and `CONTEXT.md` (if needed).

## Status
🟢 DONE (2026-11-28)

## Reality check (2026-11-28)

All three bugs reproduce directly in the current codebase:

1. **Jumping sidebar on web (`.rail`)**:
   - **Horizontal jump**: `ui/src/style.css:166-169` (`html, body`) sets `max-width: 100%; overflow-x: clip;` with no `scrollbar-gutter: stable` on `html`. Switching between scrolling pages (`Feed`, `Communities`, `Greenhouse`) and viewport-fitted pages (`Chat`, `Mail`) toggles the document vertical scrollbar and shifts the centered `.container` (`max-width: 1280px; margin: 24px auto;`) and its `.rail` column horizontally by half the scrollbar width.
   - **Vertical jump**: `.container` sets `margin-top: 28px` (`ui/src/style.css:4283-4285`), which `body.chat-open .container, body.chat-fullscreen .container, body.mail-open .container` zero out (`ui/src/style.css:1533-1538`). `body.chat-open #chat-modal` restores `margin-top: 28px` on `#chat-modal` inside `@media (min-width: 769px)` (`ui/src/style.css:1541-1545`), **not** on `.rail`. `body.mail-open` sets `margin-top: 28px` on neither `.rail` nor `#mail-modal`, and `.mail-modal-card` uses `height: calc(calc(100dvh / var(--ui-zoom, 1)) - 60px)` (`ui/src/mail.css:15`) instead of `.chat-modal-card`'s `- 56px` (`ui/src/style.css:1616`). While `.rail` has `position: sticky; top: 20px` (`ui/src/style.css:4258-4259`), its initial un-scrolled position sits inside `.container`'s top edge (`28px` on Feed/rail pages vs `0px` on Chat/Mail), so opening Chat or Mail pulls `.rail` upward by `28px` immediately on desktop.

2. **Reels lower bar disappears on Back**:
   - `reelsPlayer.show()` (`ui/src/reelsPlayer.ts:242-247`) adds `document.body.classList.add("reels-fullscreen-mobile")`, which hides `.rail` on mobile (`@media (max-width: 768px) { body.reels-fullscreen-mobile .rail { display: none !important; } }` in `ui/src/style.css:10281-10284`).
   - `stepBackInRadica()` (`ui/src/main.ts:8373-8399`) checks overlays, `#chat-modal`, and `#mail-modal` (`in-detail`), then falls through to `if (railPages.some(([el]) => isOpen(el))) { closeRailPages(); return true; }`. `closeRailPages()` (`ui/src/main.ts:7724-7726`) hides `#media-modal` directly (`el.style.display = "none"`) without calling `reelsPlayer.hide()`, leaving `body.reels-fullscreen-mobile` stuck on `document.body` permanently so the mobile bottom `.rail` stays hidden until app restart.
   - Additionally, `reelsPlayer.openUserWall` (`ui/src/main.ts:12347`) calls `openUserProfile(pk)` without hiding Reels/`#media-modal`, and the `railPages` `MutationObserver` (`ui/src/main.ts:7899-7929`) does not clean up `reelsPlayer.hide()` or reset `currentMomentsFilter` / `.moments-filter-btn` from `"reels"` to `"all"` when `#media-modal` closes.

3. **Android resume stutter & unresponsive 3-dots box**:
   - `SafeStorage` (`ui/src/storage.ts:118`) binds `visibilitychange` to call `this.flush()` unconditionally whenever `document.hidden` is true, executing `syncPersistence()` + `syncNativeBridge()` (`ui/src/storage.ts:374-400`) even when no key changed. When stored data exceeds `NATIVE_BLOB_BUDGET` (6 MB), `syncNativeBridge()` runs `JSON.stringify(allObj)` inside a `for` loop for every pruned `freenet_feed_*` key ($O(N^2)$ serialization over megabytes).
   - `MainActivity.NativeStorage` (`apps/android/src/main/java/org/freenet/radica/MainActivity.java:742-753`) reads and writes that multi-MB JSON blob via `getSharedPreferences("radica_storage", MODE_PRIVATE).edit().putString("blob", json).apply()`, forcing Android `QueuedWork.waitToFinish()` XML serialization on the main thread during `onPause`/resume.
   - `FreenetNetwork` (`ui/src/network.ts:150`) invokes `this.tick(true)` synchronously on `visibilitychange` resume, and `resubscribe()` (`ui/src/network.ts:234-246`) fans out `this.onChange(id)` in bursts of 8 every `50ms` (`Math.floor(i / 8) * 50`), triggering immediate feed/timeline reloads while the user is interacting.
   - In `ui/src/main.ts:2988-3049`, `isFeedTouching` is never cleared on `visibilitychange` or `blur` (a mid-gesture app switch leaves it stuck `true` or racing), and `scheduleRenderTimeline()` only defers when `isFeedTouching || isFeedScrolling` (`shouldDeferBackgroundRender`), **not** while a 3-dots menu (`details.post-more[open]`) or `.rail.more-open` is open—so background sync redraws on resume stall the thread and disrupt interactions inside the open 3-dots menu.

## Plan

### Files & Changes (strictly disjoint `[core]` and `[ui]` ownership)

1. **`[core]` — `core-1` (`ui/src/storage.ts`, `ui/src/network.ts`)**:
   - `ui/src/storage.ts`:
     - Track `private dirty = false` on `SafeStorage`: set `this.dirty = true` in `setItem`, `removeItem`, and `clear` when storage actually mutates; reset `this.dirty = false` after `syncPersistence()` runs (and skip `syncPersistence()` in `flush()` when `!this.dirty`). Note: keep `syncNativeBridge()` directly callable for tests and explicit syncs.
     - Optimize `syncNativeBridge()` over-budget pruning: build `allObj` once and estimate removed UTF-16 JSON entry lengths in $O(N)$ (`k.length + v.length + 6`) while deleting largest `freenet_feed_*` entries first until estimated length $\le$ `NATIVE_BLOB_BUDGET`, then call `JSON.stringify(allObj)` once (with a short fallback pass only if escaping pushed `json.length > NATIVE_BLOB_BUDGET`), avoiding the $O(N^2)$ `JSON.stringify` loop.
   - `ui/src/network.ts`:
     - Debounce `this.tick(true)` by `250ms` on `visibilitychange` when `!document.hidden`, cancelling the pending timer if `document.hidden` becomes `true` again before it fires.
     - Export pure `resubscribeDelayMs(index: number, interactiveCount: number): number` and use it in `resubscribe()` for gentler pacing (e.g., foreground interactive contracts staggered lightly first, followed by background contracts in smaller batches with wider intervals so resume/reconnect does not saturate the JS main thread).

2. **`[core]` — `core-2` (`apps/android/src/main/java/org/freenet/radica/MainActivity.java`)**:
   - Update `NativeStorage` (`getAll` / `setAll`) to persist the JSON blob in an atomic UTF-8 file (`radica_storage.json` via `radica_storage.json.tmp` + `renameTo`) inside `getFilesDir()`, backed by a `volatile String cachedBlob` and a single-thread `ExecutorService` writer so `setAll` updates `cachedBlob` immediately without blocking the WebView/main thread on `SharedPreferences` / `QueuedWork`.
   - On first read (`getAll`) when `radica_storage.json` does not exist yet, perform a one-time fallback migration from `getSharedPreferences("radica_storage", MODE_PRIVATE).getString("blob", null)`, seed `cachedBlob`, write `radica_storage.json` asynchronously, and clear the legacy preference entry so old Android installs keep all identity/settings/feed data seamlessly.

3. **`[ui]` — `ui-1` (`ui/src/style.css`, `ui/src/mail.css`, `ui/src/main.ts`)**:
   - **Desktop sidebar stability (`ui/src/style.css`, `ui/src/mail.css`)**:
     - Under `@media (min-width: 769px)`, set `html { scrollbar-gutter: stable; }` so scrollbar presence never shifts `.container` / `.rail` horizontally.
     - Give `body.chat-open .rail, body.mail-open .rail` and `body.mail-open #mail-modal` the same `margin-top: 28px` that `.container` and `body.chat-open #chat-modal` use on desktop, keeping `.rail` at identical `x`/`y` coordinates across Feed, Chat, Mail, and all rail pages.
     - Align `.mail-modal-card` height in `ui/src/mail.css` to `calc(calc(100dvh / var(--ui-zoom, 1)) - 56px)` (matching `.chat-modal-card`).
   - **Reels Back & cleanup (`ui/src/main.ts`)**:
     - In `stepBackInRadica()`, if `isOpen(mediaModal)` and `currentMomentsFilter === "reels"`, exit Reels (`reelsPlayer.hide()` + reset `currentMomentsFilter = "all"`, `.moments-filter-btn` active state, and `renderMediaGrid()`) before returning `true` (so Back from Reels returns to Moments with `.rail` restored, and a second Back closes Moments).
     - In the `railPages` `MutationObserver` for `mediaModal` (or whenever `!isOpen(mediaModal)`), ensure `reelsPlayer.hide()` is called and `currentMomentsFilter` / `.moments-filter-btn` resets from `"reels"` to `"all"`, guaranteeing `body.reels-fullscreen-mobile` is always cleared even when closing via `closeRailPages()` or switching pages.
     - In `reelsPlayer.openUserWall`, call `reelsPlayer.hide()` and `mediaModal.style.display = "none"` before `void openUserProfile(pk)`.
   - **Resume responsiveness & 3-dots menu protection (`ui/src/main.ts`)**:
     - Reset `isFeedTouching = false` on `visibilitychange` (when `document.hidden` or resuming) and `window` `blur`, flushing any deferred render only when safe.
     - Add helper `hasOpenInteractiveMenu()` checking `Boolean(document.querySelector("details.post-more[open], .rail.more-open"))`. Defer `scheduleRenderTimeline()` (setting `deferredTimelineRender = true`) while `hasOpenInteractiveMenu()` is true, and call `flushDeferredTimelineRender()` when a `details.post-more` toggles closed (via the `toggle` listener on `document` / `postsContainer` / `singlePostBody`) and when `setRailMore(false)` closes `.rail.more-open`.

4. **`[ui]` — `ui-2` (`ui/src/updates.ts`)**:
   - Prepend a `2026-11-28` entry in `UPDATES` summarizing the steady desktop sidebar across Feed/Chat/Mail, Reels Back restoring the bottom bar on phones, and smoother Android resume with responsive 3-dots menus.

5. **Moderation (all 3 layers)**:
   - No new user-generated content surfaces or wire formats are introduced; all existing Layer 1 (`analyzeImageFile`, `analyzeTextContent`, `maskProfanity`), Layer 2 (`buildModerationPolicy`, hidden/reported/AI-held filtering), and Layer 3 (Report / Hide Author in Feed, Single Post View, Moments, and Reels) remain intact.

6. **Domain language (`CONTEXT.md`)**:
   - Update `## Device storage` (`Native storage bridge`) to document file-backed `radica_storage.json` on Android with single-thread background writes, `volatile` cache, and one-time `SharedPreferences` migration.

7. **`[test]` — `test-1`, `test-2`, `test-3`**:
   - `test-1`: Extend `ui/tests/storage.test.ts` (dirty-flag skip on unchanged `flush()`, mutation marks dirty and flushes, $O(N)$ over-budget pruning preserves newest/non-feed keys under `NATIVE_BLOB_BUDGET`) and `ui/tests/reconnect.test.ts` (unit tests for `resubscribeDelayMs` pacing).
   - `test-2`: Add desktop sidebar coordinate stability test in `ui/e2e/app.spec.ts` (`.rail` `getBoundingClientRect()` `x`/`y` unchanged across Feed → Chat → Mail → Feed) and mobile Reels Back lower-bar restoration test in `ui/e2e/mobile.spec.ts` (open Moments → Reels → verify `reels-fullscreen-mobile` / `.rail` hidden → Back → verify `reels-fullscreen-mobile` removed and `.rail` visible).
   - `test-3`: Run `npm test`, `npm run build`, `graphify update .`, verify `AGENTS.md` checklist (`updates.ts`, `CHANGELOG.md`, `CONTEXT.md`), update `CHANGELOG.md`, and mark `TASK-016` `🟢 DONE` in spec + `ISSUES.md`.

## Tasks

- [x] [core] core-1: Add `dirty` tracking and O(N) native-blob pruning in `ui/src/storage.ts`, plus 250ms `visibilitychange` debounce and `resubscribeDelayMs` pacing in `ui/src/network.ts` (`resubscribeDelayMs` moved to `ui/src/reconnect.ts` and re-exported from `ui/src/network.ts`)
- [x] [core] core-2: Replace blocking `SharedPreferences` blob I/O in `apps/android/src/main/java/org/freenet/radica/MainActivity.java` `NativeStorage` with atomic UTF-8 file `radica_storage.json`, background single-thread executor, `volatile` cache, and one-time legacy migration
- [x] [ui] ui-1: Fix desktop `.rail` horizontal/vertical jump in `ui/src/style.css` & `ui/src/mail.css`, fix Reels Back & `openUserWall` cleanup in `ui/src/main.ts`, and reset `isFeedTouching` + defer `scheduleRenderTimeline()` while `details.post-more[open]` or `.rail.more-open` is open (after: core-1)
- [x] [ui] ui-2: Prepend `2026-11-28` entry in `ui/src/updates.ts` covering all 3 fixes (after: ui-1)
- [x] [test] test-1: Add unit tests in `ui/tests/storage.test.ts` (`dirty` flag, $O(N)$ pruning) and `ui/tests/reconnect.test.ts` (`resubscribeDelayMs`) (after: core-1)
- [x] [test] test-2: Add Playwright desktop `.rail` geometry test in `ui/e2e/app.spec.ts` and mobile Reels Back lower-bar test in `ui/e2e/mobile.spec.ts` (after: ui-1)
- [x] [test] test-3: Run `npm test`, `npm run build`, `graphify update .`, update `CHANGELOG.md`, and mark `TASK-016` `🟢 DONE` in `tasks/016-greenhouse-bugfixes-sidebar-reels-stutter.md` & `ISSUES.md` (after: core-2, ui-2, test-1, test-2)
