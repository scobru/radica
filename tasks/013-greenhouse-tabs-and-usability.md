# TASK-013: Greenhouse — Clear Done vs Planned Separation & Usability

## Reality check (2026-11-28)
- **Sorting & lifecycle mixing (`ui/src/greenhouse.ts:113-118`, `ui/src/style.css:6566`)**: `foldGreenhouse` sorts all seeds into one flat array solely by `closes > now` (open seeds first by net score `up - down` then `ts`; closed seeds second by `closes` descending). Open proposals already marked `done` stay mixed at the top of the list, while `planned` and `considering` roadmap items whose voting window closed (`closes <= now`) sink into `.gh-seed.closed` (`opacity: 0.75`).
- **AI export (`ui/src/greenhouse.ts:151-157`)**: `formatSeedsForAi(..., onlyOpen)` filters with `s.status !== "done" && s.status !== "not-now" && s.closes > now`, dropping active `planned` / `considering` items once their voting window closes.
- **Layout & controls (`ui/index.html:1962-1992`, `ui/src/greenhousePage.ts:85-150`)**: `#greenhouse-modal` caps `.modal-card` at `600px`, displays the intro, `.testnet-note`, and `#greenhouse-weights` expanded above the fold, keeps `#greenhouse-form` expanded (`display: flex`) whenever eligible, renders non-maintainer status as an uncolored `.identity-badge` in `.gh-seed-meta`, and provides no tabs, kind filters, search input, or sort selector. `templateNesting.test.ts:125` asserts `<h3>` appears within 600 chars of `id="greenhouse-modal"`.
- **Moderation gaps (`ui/src/greenhouse.ts:71,82-101`, `ui/src/greenhousePage.ts:78-116,252-308`)**:
  - Layer 1: comment submit calls `analyzeTextContent` and `renderChatText` applies `maskProfanity` to `s.text` / `c.text`, but seed submit has no `analyzeTextContent` guard and `s.title` renders via raw `escapeHtml(s.title)` without `maskProfanity`.
  - Layer 2: `foldGreenhouse` applies `hideComment` only to comments (line 100), not to seeds (lines 82-90).
  - Layer 3: `commentHtml` exposes **Report** and **Hide author** buttons, while `seedHtml` has neither (`freenet.reportPost(author, postId, ...)` builds `target = "${author}:${postId}"`, so seed reports must pass `seedId.slice(author.length + 1)`).

## Context & Goal
The Radica Greenhouse (`#greenhouse-modal`, `ui/src/greenhouse.ts`, `ui/src/greenhousePage.ts`) currently renders all proposals in a single flat list sorted only by whether their voting window is still open or closed. As a result, open proposals already marked `✅ Done` stay mixed at the top of the list, while `🗓️ Planned` / `🔍 Considering` roadmap items whose voting window closed sink into the dimmed `.closed` section. The composer form is always expanded, voting/status explanations add vertical noise, status badges are buried in metadata, and there are no tabs, filters, search, or sorting controls. Additionally, Layer 1/2/3 content moderation currently covers comments, but seeds themselves lack Layer 2 hiding and Layer 1/3 controls.

The goal is to separate **Voting**, **Planned / Considering**, **Done**, and **Archive** clearly into accessible tabs, make the Greenhouse far easier to scan, filter, search, and manage on desktop and mobile, and complete all 3 moderation layers for seeds without changing the `greenhouse` log wire format.

## Requirements
1. **Clean Separation by Bucket**: Classify seeds into `voting`, `planned` (`planned` + `considering`, regardless of voting window), `done` (`done`, regardless of voting window), and `archive` (`not-now` or expired untriaged seeds). Keep `planned` above `considering` with clear visual sub-headings when both exist.
2. **Accessible Tabbed Interface & Toolbar**: Replace the flat list with an accessible `role="tablist"` (`Voting`, `Planned`, `Done`, `Archive`) with item counts, keyboard navigation (`ArrowLeft`/`ArrowRight`/`Home`/`End`), `hidden="until-found"` + `beforematch` panel switching, kind filter (`All`, `Features`, `Bugs`), live search, and sort selector (`Default`, `Top voted`, `Newest`, `Most discussed`, `Ending soon`).
3. **Usability & Visual Clarity**: Collapse verbose voting weights and testnet notes into a `<details>` disclosure, move the composer behind a `+ Plant a seed` toggle button, widen the modal slightly on desktop, add semantic status border/pill accents, keep `Done` cards crisp (never dimmed), and show feedback toasts when planting or changing status.
4. **Full 3-Layer Moderation on Seeds & Comments**:
   - Layer 1: `analyzeTextContent` guard on planting a seed; `maskProfanity` on seed titles when `maskBadWords` is enabled.
   - Layer 2: `foldGreenhouse` drops hidden/reported/AI-held seeds for readers while keeping authors' own seeds visible.
   - Layer 3: **Report** and **Hide author** buttons on seed cards (in addition to comments) for non-self authors.
5. **Docs & Verification**: Unit tests in `ui/tests/greenhouse.test.ts`, `npm test`, `npm run build`, `graphify update .`, plus updates to `ui/src/updates.ts`, `ui/index.html` (`#guide-modal`), `CONTEXT.md`, and `CHANGELOG.md`.

## Status
🟢 DONE (2026-11-28)

## Plan

### Data shape, wire format & compatibility
- **No wire-format or contract changes**: signed `greenhouse` log entries (`seed`, `vote`, `comment`, `status`), `log-contract`, and storage keys stay identical; `legacy.ts` and `attester/` (`openGreenhouseSeeds`) are untouched and existing logs remain readable.

### `[core]` Pure Greenhouse logic (`ui/src/greenhouse.ts`)
- **`foldGreenhouse`**: add optional 8th parameter `hideSeed: (author: string, target: string) => boolean = hideComment` (preserving 7-arg callers). In the seed-collection loop, skip seeds where `e.author !== me && hideSeed(e.author, id)` (after title validation, before `seeds.set(id, ...)`), so hidden/reported/AI-held seeds are dropped for readers while authors still see their own seeds.
- **Types & constants**:
  - `export type SeedBucket = "voting" | "planned" | "done" | "archive";`
  - `export const SEED_BUCKETS: readonly SeedBucket[] = ["voting", "planned", "done", "archive"];`
  - `export type SeedSort = "votes" | "newest" | "discussed" | "closing";`
  - `export interface SeedFilterOptions { kind?: SeedKind | "all"; query?: string; sort?: SeedSort; now?: number; }`
- **Pure helpers**:
  - `classifySeed(seed: Seed, now = Date.now()): SeedBucket` — `"done"` → `"done"`; `"not-now"` → `"archive"`; `"planned" | "considering"` → `"planned"`; untriaged → `seed.closes > now ? "voting" : "archive"`.
  - `sortSeeds(seeds: Seed[], sort: SeedSort, bucket: SeedBucket, now = Date.now()): Seed[]` — non-mutating sort:
    - `"newest"`: `b.ts - a.ts`, tie-break net score (`up - down`) desc.
    - `"discussed"`: `b.comments.length - a.comments.length`, tie-break net score desc, then `b.ts - a.ts`.
    - `"closing"`: open (`closes > now`) before closed; open by `a.closes - b.closes` (soonest first), closed by `b.closes - a.closes`, tie-break net score desc then `b.ts - a.ts`.
    - `"votes"` (default): `"planned"` places `planned` before `considering` then net score desc then `b.ts - a.ts`; `"archive"` sorts by `b.closes - a.closes || b.ts - a.ts`; `"voting"` and `"done"` sort by net score desc then `b.ts - a.ts`.
  - `filterAndGroupSeeds(seeds: Seed[], opts?: SeedFilterOptions): Record<SeedBucket, Seed[]>` — filters by `opts.kind` (`"feature"` / `"bug"`) and case-insensitive trimmed `opts.query` against `title` + `text`, buckets via `classifySeed`, and sorts each bucket via `sortSeeds`.
  - `pickDefaultBucket(grouped: Record<SeedBucket, Seed[]>): SeedBucket` — picks first non-empty bucket in order `voting` → `planned` → `done` → `archive`, defaulting to `"voting"`.
- **`formatSeedsForAi(..., onlyOpen = false)`**: when `onlyOpen` is true, include seeds whose `classifySeed(s, now)` is `"voting"` or `"planned"` (excluding `"done"`, `"not-now"`, and expired untriaged seeds).

### `[ui]` Tabs, toolbar, styling, moderation & docs (`ui/index.html`, `ui/src/style.css`, `ui/src/greenhousePage.ts`, `ui/src/main.ts`, `ui/src/updates.ts`)
- **`ui/index.html`**:
  - Keep `<h3>` within 600 chars of `id="greenhouse-modal"` (`templateNesting.test.ts`). Widen `.modal-card` via `.gh-modal-card`.
  - Add `#greenhouse-plant-btn` (`+ Plant a seed`, shown when eligible) in the header actions beside `#greenhouse-export-ai-btn` and `#greenhouse-close-btn`.
  - Collapse `#greenhouse-weights` and `.testnet-note` inside `<details class="gh-info-disclosure">` below the short intro paragraph.
  - Mark `#greenhouse-form` with `.gh-composer-card` (hidden until `#greenhouse-plant-btn` toggles it open; includes Cancel or collapses after plant).
  - Add `.gh-toolbar` with kind chips (`[data-gh-kind="all"|"feature"|"bug"]`), `#greenhouse-search` (`type="search"`), and `#greenhouse-sort` (`votes`, `newest`, `discussed`, `closing`).
  - Add accessible `role="tablist"` (`.gh-tablist`) with 4 tabs (`Voting`, `Planned`, `Done`, `Archive`, `data-gh-tab`, `aria-selected`, `aria-controls`, `.gh-tab-count`) and `#greenhouse-list` holding 4 `<section role="tabpanel" id="gh-panel-<bucket>" aria-labelledby="gh-tab-<bucket>" hidden="until-found">` panels, each wrapping an inner `<div class="gh-panel-body"></div>` (critical: **no** padding, border, margin, background, or parent `gap` on `[role="tabpanel"]` itself so `hidden="until-found"` collapses cleanly).
  - Update `#guide-modal` `<details><summary>🌱 Greenhouse</summary>` with the 4 tabs, filters/search/sort, and seed Report / Hide author controls.
- **`ui/src/style.css`**:
  - Add semantic tokens `--gh-planned`, `--gh-considering`, `--gh-done`, `--gh-archive` in `:root` and `[data-theme="dark"]`.
  - Style `.gh-modal-card`, `.gh-info-disclosure`, `.gh-composer-card`, `.gh-toolbar`, `.gh-kind-chips`, `.gh-tablist`, `.gh-tab`, `.gh-tab-count`, `.gh-panel-body` (`display: flex; flex-direction: column; gap: 10px`), `.gh-subhead`, semantic status pills & card accents, crisp `.gh-seed.gh-seed-done` (never dimmed with `.closed` opacity), `.gh-empty` with `.gh-jump-tab` links, seed moderation actions, and mobile breakpoints (`<= 640px`). Keep `[role="tabpanel"]` free of padding/border/margin/background and `#greenhouse-list` free of `gap`.
- **`ui/src/greenhousePage.ts` & `ui/src/main.ts`**:
  - Manage `activeBucket`, `kindFilter`, `searchQuery`, `sortOrder`, `composerOpen`, and initial default bucket selection (`pickDefaultBucket` on first non-empty load when no permalink target is active).
  - Implement `selectBucket(bucket, focusTab?)` updating `aria-selected`, `tabindex`, `hidden` vs `hidden="until-found"`, keyboard navigation (`ArrowLeft`, `ArrowRight`, `Home`, `End`) on `.gh-tablist`, and `beforematch` on `[role="tabpanel"]` to switch tabs when browser find-in-page matches inside a hidden panel.
  - Render `Planned` with `🗓️ Planned` and `🔍 Considering` `.gh-subhead` dividers when both statuses exist; keep `Done` crisp; show helpful empty-filter messages with clickable `.gh-jump-tab` buttons pointing to non-empty buckets; update `focusGreenhouseSeed` to switch to `classifySeed(seed)` before scrolling/flashing.
  - Preserve open comment threads and drafts (`restoreThreads`) across redraws and show `showToast` feedback on planting a seed and maintainer status changes.
  - **Moderation (all 3 layers)**:
    - Layer 1: `greenhousePage.ts` runs `analyzeTextContent(\`${title}\n${text}\`)` + `confirmDialog` before planting a seed, and applies `maskProfanity(s.title)` when `deps.shouldMaskBadWords?.()` is true (`s.text` and `c.text` already pass through `renderChatText` which respects `maskBadWords`; `main.ts` passes `shouldMaskBadWords: () => safeStorage.getItem(MASK_BAD_WORDS_KEY) !== "0"` in `initGreenhouse`).
    - Layer 2: `foldGreenhouse` drops hidden/reported/AI-held seeds via `(author, target) => isHidden(author) || isReported(target)` while keeping `me`'s own seeds.
    - Layer 3: `seedHtml` renders **Report** (`data-gh-report-seed="${escapeHtml(s.id)}" data-gh-author="${escapeHtml(s.author)}"`) and **Hide author** (`data-gh-hide="${escapeHtml(s.author)}"`) buttons for `s.author !== me`; clicking **Report** prompts via `promptDialog` and dispatches `report(author, s.id.slice(author.length + 1), reason)` (`freenet.reportPost`).
- **`ui/src/updates.ts`**: add top `UPDATES` entry dated `"2026-11-28"`.

### `[test]` Tests, verification & docs (`ui/tests/greenhouse.test.ts`, `CHANGELOG.md`)
- Expand `ui/tests/greenhouse.test.ts` for `classifySeed`, `sortSeeds`, `filterAndGroupSeeds`, `pickDefaultBucket`, `formatSeedsForAi`, and `foldGreenhouse` Layer 2 seed moderation (`hideSeed`).
- Run `npm test`, `npm run build`, `graphify update .`, verify all `AGENTS.md` rules (`updates.ts`, `#guide-modal`, `CHANGELOG.md`, `CONTEXT.md`, 3-layer moderation), and mark spec + `ISSUES.md` `🟢 DONE`.

### CONTEXT.md
- Added **Greenhouse buckets** under `## Greenhouse`.

## Tasks
- [x] [core] core-1: Extend `ui/src/greenhouse.ts` with `SeedBucket`, `SEED_BUCKETS`, `SeedSort`, `SeedFilterOptions`, `classifySeed`, `sortSeeds`, `filterAndGroupSeeds`, `pickDefaultBucket`, `foldGreenhouse` 8th arg `hideSeed`, and `formatSeedsForAi` `onlyOpen` bucket check (`voting` + `planned`).
- [x] [ui] ui-1: Implement Greenhouse tabs (`role="tablist"`, `hidden="until-found"` + `beforematch`, `.gh-panel-body`), toolbar (kind chips, search, sort), collapsible rules/composer, semantic status accents, crisp `Done` cards, `focusGreenhouseSeed` bucket switch, toasts, Layer 1/3 seed moderation, `#guide-modal`, and `ui/src/updates.ts` across `ui/index.html`, `ui/src/style.css`, `ui/src/greenhousePage.ts`, `ui/src/main.ts`, and `ui/src/updates.ts`. (after: core-1)
- [x] [test] test-1: Add unit tests in `ui/tests/greenhouse.test.ts`, run `npm test`, `npm run build`, and `graphify update .`, verify `AGENTS.md` compliance, update `CHANGELOG.md`, and close `tasks/013-greenhouse-tabs-and-usability.md` and `ISSUES.md`. (after: ui-1)
