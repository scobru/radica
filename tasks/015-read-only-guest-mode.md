# TASK-015: Read-only guest browse mode before creating a profile

## Context & Goal
Community feedback from IvvOr & Agent.69 (`r/radica`, 2026-11-28):
When opening Radica on a fresh Freenet node, visitors currently hit `#identity-modal` immediately with an empty feed behind it (`reloadPosts()`, `renderTimeline()`, and `freenet.getExploreTimeline()` all require `currentIdentity`). This makes a new node look empty and forces newcomers to create/back up a keypair before seeing whether there is any activity on the network. Meanwhile, letting casual visitors browse public content in read-only mode also helps Freenet itself by fetching and caching public contracts on their node without creating throwaway identities.

Goal: Start Radica (except standalone **Radica Messenger**, which is private E2EE chat only) in **Read-Only / Guest Mode** when no identity is configured, loading Explore, Communities, Moments, Articles, Music, Greenhouse, Living Tree, and public User Profiles immediately with full Layer 2 moderation active, while any write or private action cleanly opens `#identity-modal` to sign in or create a key.

## Requirements
1. **Immediate Read-Only Startup**: On fresh start without an identity (`!isMessengerApp`), do not block on `#identity-modal`; connect to the Freenet node, fetch public logs (`communities`, `directory`, `supporters`, `ghostkeys`, `poh`, `delegations`, `supporter-receipts`, `post-edits`, `reports`, maintainer `blocklist`), and render Explore immediately.
2. **Non-Blocking Banner & Guest UI**: Show a compact `#guest-banner` above the feed (*Read-only mode* + **Sign in / Create key** button), hide personal-only UI (post composer, Following / My Posts / Saved scope tabs, personal sidebar follow/edit controls), and allow dismissing `#identity-modal` via **Browse read-only** (`#id-browse-readonly-btn`) or `✕` while in guest mode. Standalone Radica Messenger (`isMessengerApp`) keeps requiring sign-in first.
3. **Write & Private Action Gates**: Clicking any write or private action (like, dislike, comment, repost, save, board, RSVP, follow, report, create community, Chat, Mail, Notifications, Blocklists, My Profile) calls `requireIdentity(action)` to show a toast and open `#identity-modal`. Local **Hide Author** remains usable.
4. **Full 3-Layer Moderation in Guest Mode**: Public feeds, communities, articles, music, profiles, and Greenhouse in read-only mode must still apply default curator blocklists (`DEFAULT_CURATOR`), AI holds, and local hidden authors (`me === ""`).
5. **Testing & Verification**: Unit tests (`ui/tests/guestMode.test.ts`), update Playwright `signIn` helpers + add guest mode e2e test in `ui/e2e/app.spec.ts`, run `npm test`, `npm run build`, Playwright e2e suites, and `graphify update .`.
6. **Docs**: Update `ui/src/updates.ts`, `ui/index.html` (`#guide-modal`), `CONTEXT.md`, and `CHANGELOG.md`.

## Status
🟢 DONE (2026-11-28)

## Reality check (2026-11-28)
Verified against current codebase (`ui/src/main.ts`, `ui/src/freenet.ts`, `ui/index.html`, `ui/src/articlesPage.ts`, `ui/src/musicPage.ts`, `ui/src/greenhousePage.ts`, `ui/e2e/*.spec.ts`):

1. **Startup blocks on `#identity-modal` (`ui/src/main.ts:14809-14814`)**:
   - `init()` returns early into `hideBoot(); openIdentityModal(); return;` whenever `!identity`, never calling `freenet.connect()`, `loadCommunities()`, `refreshTrustedBlocklists()`, `reloadPosts()`, `checkUrlPostHash()`, or `freenet.onSyncUpdate()`. `#feed-view` stays behind the modal with `"Loading decentralized timeline..."`.
   - Standalone **Radica Messenger** (`isMessengerApp`, `main.ts:174-198`, `15035-15041`) is private E2EE chat only and must continue requiring sign-in before entering chat.
2. **Feed & Explore require a non-null `UserIdentity`**:
   - `reloadPosts()` (`main.ts:2798`) returns early on `if (!currentIdentity) return;`, and its `"following"`, `"saved"`, and personal `"myposts"` (`!feedAuthor`) branches assume `currentIdentity.pubkey`. Viewing someone else's wall in feed (`feedAuthor !== null`) can use `freenet.getFeed(feedAuthor)` without `currentIdentity`.
   - `renderTimeline()` (`main.ts:3637, 3641`) returns early on `if (!currentIdentity) return;` and reads `currentIdentity.pubkey` directly.
   - `freenet.getExploreTimeline(identity, opts)` (`ui/src/freenet.ts:2413-2429`) requires a non-null `UserIdentity`, reading `identity.pubkey` for `getFeed`, `lane()` exclusion, and `mine`, and applying `this.circleOnly` unconditionally.
   - `freenet.connectSocial()` (`freenet.ts:614-618`) fetches `"communities"`, `"directory"`, `"supporters"`, `"ghostkeys"`, `"poh"`, `"delegations"`, `"supporter-receipts"`, `"post-edits"`, but **not** `"reports"` (which is currently only refreshed for `amGlobalMod()` at `main.ts:798, 14974`), so AI holds (`freenet.aiHeldTargets()`) would be empty on a fresh guest node unless `"reports"` is fetched too.
3. **Unjoined community filter hides public community posts (`ui/src/main.ts:3668`)**:
   - `renderTimeline()` checks `if (!activeCommunity && c && !isJoined(c) && p.author !== me) return false;`. For guests (`!currentIdentity`, `isJoined(c) === false`, `me === ""`), this hides all posts in `r/radica`, `r/tech`, and other public communities from Explore.
4. **Identity modal cannot be dismissed without an identity (`ui/src/main.ts:13147`)**:
   - `renderIdentityModal()` sets `identityCloseBtn.style.display = currentIdentity ? "" : "none";`, and `#identity-modal` (`ui/index.html:998-1233`) has no **Browse read-only** button.
5. **Audit of `currentIdentity` / `!currentIdentity` guards across views & cards**:
   - **`buildPostCardHtml` (`main.ts:3074-3391`)**: already takes `me: string` and safely handles `me === ""` (`isLiked`, `isDisliked`, `isReposted`, `isMyPost`, `isModOrOwner`, `saved`, `isCLiked`, `mod.globalMod` are all `false`). `eventDetailsHtml` (`main.ts:4181`) hides `.event-rsvp` when `!currentIdentity`.
   - **`bindPostCardListeners` (`main.ts:4578-4864`) & card actions**:
     - Read/local actions safe for guests: `.open-single-post-trigger`, `.open-single-post-btn`, `.btn-reveal-nsfw`, `.nsfw-overlay`, `.carousel-nav`, `.video-load`, `.clickable-hashtag`, `.community-link`, `.post-link`, `.fn-card-inner`, `.hide-user-btn` (`setUserHidden`, local), `.share-post-btn`, `.btn-reveal-wot`, `.board-item-chip`, `.board-copy-link-btn`, `.show-unproven-comments`, `.show-all-comments`, `.translate-btn`, `.load-more`, `.author-clickable`, `.repost-card`.
     - Write/private actions needing `requireIdentity(...)` instead of silent return or unguarded call:
       - `.talk-btn` (`main.ts:4669`, also `openChatWithPeer` / `openChatBtn` at `7598`) -> currently opens Chat without checking `currentIdentity`.
       - `.report-post-btn` (`main.ts:4684` -> `reportPostFromCard` -> `reportContentTarget` at `5184`) -> prompts and calls `submitContentReport` with `reporterPubkey: ""`, failing in `freenet.reportPost`.
       - `.repost-btn` (`main.ts:4688` -> `stageRepost` at `4418`) -> stages repost without checking `currentIdentity`.
       - `.save-post-btn` (`main.ts:4729`) -> silent `if (post && currentIdentity)`.
       - `.save-to-board-btn` (`main.ts:7500` -> `openBoardPickerModal` at `7406`) -> shows toast without opening `#identity-modal`.
       - `.like-btn` -> `toggleLikeFromCard` (`main.ts:5101`) silent `if (!identity) return;`.
       - `.dislike-btn` -> `toggleDislikeFromCard` (`main.ts:5142`) silent `if (!identity) return;`.
       - `.comment-like-btn` -> `toggleCommentLikeFromButton` (`main.ts:4877`) silent `if (!identity) return;`.
       - `.comment-form` submit -> `submitCommentFromCard` (`main.ts:5261`) silent `if (... || !identity) return;`, plus `.comment-btn-file` (`4761`), `.comment-btn-gif` (`4764`), `.comment-file-input` (`4791`), `paste` (`4802`), `drop` (`4846`).
   - **`openSinglePostModal` / `renderSinglePostContent` (`main.ts:3407-3512`)**:
     - `renderSinglePostContent` (`main.ts:3408`) returns early on `if (!singlePostBody || !currentIdentity) return;` and reads `currentIdentity.pubkey` at `3409`. Needs `currentIdentity?.pubkey ?? ""`.
   - **`openUserProfile` (`main.ts:6825-7190`)**:
     - Line `6888`: `const iBlock = () => freenet.blockedBy(currentIdentity!.pubkey).has(pubkey);` **throws** when `currentIdentity` is `null` -> must become `currentIdentity ? freenet.blockedBy(currentIdentity.pubkey).has(pubkey) : false`.
     - Line `6971`: `uviewFollowBtn.onclick` returns silently on `if (!currentIdentity) return;` -> needs `requireIdentity("follow people")`.
     - Line `6985`: `uviewTalkBtn.onclick` calls `openChatWithPeer(pubkey)` unguarded -> needs `requireIdentity("send a direct message")`.
     - Line `6894` (`toggleBlockAuthor` at `2223` / `8781`): returns `false` silently on `if (!currentIdentity) return false;` -> needs `requireIdentity("block users")`.
     - Line `6996` (`showLinfa` at `4333-4343`): returns early on `if (!box || !currentIdentity) return;` and checks `pubkey === currentIdentity.pubkey` -> must use nullable `currentIdentity?.pubkey ?? ""` and `freenet.getExploreTimeline(currentIdentity)` so guests see profile Linfa plants.
     - Line `7032-7033` (`loadComments`): skips `freenet.getExploreTimeline` when `!currentIdentity` -> can call `freenet.getExploreTimeline(currentIdentity)` so the `💬 Comments` profile tab loads for guests too.
     - `uviewHideBtn` (`6904`) and `uviewTrustBtn` (`6898`) work locally without an identity.
   - **`openTreePage` / `loadTreePage` (`main.ts:7777-7826`)**:
     - `getMyPubkey` (`7790`) and `getMyName` (`7791`) already handle `null`, but `refreshNetwork` (`7795`) and `onOpenMilestones` (`7816`) return early on `if (!currentIdentity) return;`. Both should pass `currentIdentity` (nullable) to `freenet.getExploreTimeline(currentIdentity, ...)`.
   - **`openCommunitiesPage` & Communities UI (`main.ts:11237, 11348, 11571, 11594-11950, 12353-12708`)**:
     - `renderCommunitiesPage` (`11609`) already uses `currentIdentity?.pubkey ?? ""`.
     - Write actions needing `requireIdentity(...)`: `commJoinBtn` (`11238`), `[data-rhero-action="join"]` (`12392`), `[data-rside-join]` (`12681`), `createCommunityFromPage` (`11571`) / `openCreateCommunityDialog` (`11348`, when `!edit`), `redditPublishBtn` (`12461`), `[data-raction="repost"]` (`12620`), `[data-raction="save"]` (`12623`), plus upvote/downvote/comment/comment-like via the shared card helpers.
   - **`articlesPage` (`ui/src/articlesPage.ts`, `main.ts:12059-12162`)**:
     - `renderList` and `openReader` already use `deps.getIdentity()?.pubkey || ""`.
     - `articlesPage.ts:414` hides Report & Hide Author behind `target.author !== me && me` -> should drop `&& me` so Layer 3 **Hide Author** and **Report** remain visible to guests (with Report triggering `requireIdentity` via `reportContentTarget`).
     - `main.ts:12120` (`toggleLike`) shows toast instead of `requireIdentity("like articles")`; `openComposer` (`articlesPage.ts:562`) shows toast instead of `requireIdentity` (hide `#articles-new-btn` in `body.guest-mode` + gate via optional `requireIdentity`).
   - **`musicPage` (`ui/src/musicPage.ts`, `main.ts:12175-12214`)**:
     - `renderReleases` uses `deps.getMyPubkey()` (`""` for guests).
     - `main.ts:12186` (`toggleFollow`) only shows toast -> needs `requireIdentity("follow artists")`; `main.ts:12197` (`shareReleaseToFeed`) writes to `postCaption` without checking `currentIdentity` -> needs `requireIdentity("share releases to the feed")`.
   - **`greenhousePage` (`ui/src/greenhousePage.ts`, `main.ts:14600-14627`)**:
     - `renderGreenhouse` (`289`) uses `whoAmI() ?? ""` (`canVote = false` for guests, read-only view already works).
     - `main.ts:14610` (`linfaForAuthors`) returns empty weights `if (!currentIdentity) return { weights: new Map() };`, which zeroes out Linfa-based author votes when guests read Greenhouse -> should still run `freenet.getExploreTimeline(currentIdentity)` and compute `weights` while skipping `myLinfa`/`myStage` when `!currentIdentity`.
     - `greenhousePage.ts:588, 604` open `promptDialog` before calling `reportComment`, and `main.ts:14607` calls `freenet.reportPost` unguarded -> `greenhousePage` / `main.ts` should gate reporting with `requireIdentity("report content")` before opening the reason prompt.
   - **Other private/write entry points**:
     - `openChatBtn` (`main.ts:7598`), `openMailModal` (`main.ts:13910`), `openNotifsBtn` (`main.ts:10338`), `blocklists-open-btn` (`main.ts:2036`), `head-profile-btn` (`12779`), `edit-profile-btn` (`6058`), `scopeFollowingBtn` (`12812`), `switchToMyPostsScope` (`12818`, when `!feedAuthor`), `scopeSavedBtn` (`12830`), `toggleLikeInGrid` (`4092`), `reelsPlayer.toggleLike` (`12275`), `checkUrlInviteHash` (`14723`).
6. **UI & sidebar IDs in `ui/index.html` for `body.guest-mode`**:
   - Feed header/scopes/composer (`ui/index.html:149-263`): hide `#head-profile-btn`, `#scope-following-btn`, `#scope-myposts-btn`, `#scope-saved-btn`, and `#feed-view > .composer-card:not(#events-upcoming)` (note: `#events-upcoming` at line `361` also carries `.composer-card` and must stay visible).
   - Right sidebar (`ui/index.html:2445-2471`): hide `.sidebar .profile-preview` and `.sidebar .roots-card`; keep the Communities card (`#find-comm-input`, `#comm-sort-select`, `#communities-list`) and `#sidebar-ecosystem-footer` visible.
   - Secondary composers/new-buttons: hide `#media-quick-post` (`ui/index.html:2042`), `#reddit-create-box` (`ui/index.html:2175`), `#articles-new-btn`. Keep rail buttons `#open-chat-btn`, `#open-mail-btn`, `#open-notifs-btn`, `#blocklists-open-btn` visible so clicking them (or pressing `g c`, `g m`, `g n`, `g b`) triggers `requireIdentity(...)`.
7. **Playwright E2E suites (`ui/e2e/{app,mobile,chat-modals,moderation,names}.spec.ts`)**:
   - All 5 `signIn(page)` helpers (`app.spec.ts:8`, `mobile.spec.ts:5`, `chat-modals.spec.ts:3`, `moderation.spec.ts:5`, `names.spec.ts:3`) plus `app.spec.ts:166` call `await page.goto("/"); await page.getByRole("button", { name: "Create New Keypair" }).click();`, assuming `#identity-modal` is open on `/`. With guest mode on `/`, they must first click `#guest-signin-btn` ("Sign in / Create key") to open `#identity-modal`.

## Plan

### Architecture & Module Reuse
- Extract pure guest-mode decision logic into DOM-free `ui/src/guestMode.ts` (parallel to `circleMode.ts`), keeping `ui/src/main.ts` focused on wiring and UI state.
- Extend `FreenetClient.getExploreTimeline` (`ui/src/freenet.ts`) and `connectSocial()` directly instead of adding duplicate timeline or sync paths; reuse `circleMode.ts`'s `explorePeerKeys`, `moderationPolicy.ts`'s `buildModerationPolicy({ me: "", ... })`, and existing `#identity-modal` sign-in / `restart()` flows.
- No contract or wire-format changes; no `legacy.ts` changes needed.

### `[core]` (`ui/src/guestMode.ts`, `ui/src/freenet.ts`)
1. **`ui/src/guestMode.ts`** (pure, DOM-free):
   - `FeedScope = "explore" | "following" | "myposts" | "saved" | "media"`
   - `shouldStartInGuestMode(hasIdentity: boolean, isMessengerApp: boolean): boolean` -> `!hasIdentity && !isMessengerApp`.
   - `resolveFeedScope(scope: FeedScope, signedIn: boolean, hasFeedAuthor?: boolean): FeedScope` -> when `signedIn`, returns `scope`; when `!signedIn`, allows `"explore"`, `"media"`, and `"myposts"` only if `hasFeedAuthor`, otherwise falls back to `"explore"`.
   - `guestPreferKeys(maintainer: string, supporters: readonly string[], ghostkeys: readonly string[]): string[]` -> ordered, deduplicated non-empty key list starting with `maintainer` followed by `supporters` and `ghostkeys` so a fresh guest node fetches active public feeds even with no `following` list.
   - `shouldHideUnjoinedCommunityPost(signedIn: boolean, hasActiveCommunity: boolean, hasCommunity: boolean, joined: boolean, isAuthor: boolean): boolean` -> `signedIn && !hasActiveCommunity && hasCommunity && !joined && !isAuthor`, so signed-out guests still see public community posts (`r/radica`, `r/tech`, etc.) in Explore.
2. **`ui/src/freenet.ts`**:
   - Update `getExploreTimeline(identity: UserIdentity | null | undefined, opts: { prefer?: string[]; skip?: (pubkey: string) => boolean } = {}): Promise<Post[]>` so `null`/`undefined` identity skips `getFeed(me)`, avoids excluding `""`, keeps `circleOnly = false` (never hides public posts when signed out), and still merges `peerCache`, `prefer`, and weighted `directory` lane peers.
   - Add `"reports"` to `connectSocial()` (`freenet.ts:616`) so AI safety holds (`freenet.aiHeldTargets()`) are fetched on connect for guests and signed-in users alike.

### `[ui]` (`ui/index.html`, `ui/src/style.css`, `ui/src/main.ts`, `ui/src/articlesPage.ts`, `ui/src/greenhousePage.ts`, `ui/src/updates.ts`)
1. **`ui-1` (Guest UI, boot path, gates & page wiring)**:
   - **`ui/index.html`**:
     - Add `#guest-banner` inside `#feed-view` right above `.feed-scope-nav` (with a concise *Read-only mode* message and `#guest-signin-btn` **Sign in / Create key** button, `hidden` by default or shown via `body.guest-mode`).
     - Add `#id-browse-readonly-btn` (**Browse read-only**) inside `#identity-modal` header/actions (visible when `!currentIdentity && !isMessengerMode()`).
   - **`ui/src/style.css`**:
     - Style `#guest-banner` (only visible in `body.guest-mode`).
     - Add `body.guest-mode` rules to hide `#head-profile-btn`, `#scope-following-btn`, `#scope-myposts-btn`, `#scope-saved-btn`, `#feed-view > .composer-card:not(#events-upcoming)`, `.sidebar .profile-preview`, `.sidebar .roots-card`, `#media-quick-post`, `#reddit-create-box`, `#articles-new-btn`, and `.gh-comment-form`.
   - **`ui/src/main.ts`**:
     - Add `requireIdentity(action?: string): boolean` helper: returns `true` if `currentIdentity` exists; otherwise shows a clear toast (`action ? \`Sign in or create a key to ${action}.\` : "Sign in or create a key first."`) and calls `openIdentityModal()`, returning `false`.
     - Update `renderIdentityModal()` (`13147`) to show `#identity-close-btn` and `#id-browse-readonly-btn` when `!currentIdentity && !isMessengerMode()` (and hide `#id-browse-readonly-btn` otherwise), and wire `#id-browse-readonly-btn` + `#guest-signin-btn`.
     - Update `init()` (`14809-14814`): use `shouldStartInGuestMode(Boolean(identity), isMessengerApp)`. When `true`, add `body.guest-mode`, render ecosystem footer, load & render `allCommunities`, register a guest-safe `freenet.onSyncUpdate` pass (refreshing `allCommunities`, `renderCommunities()`, and `reloadPosts({ background: true })`), call `freenet.connect()`, refresh `"communities"`, `"directory"`, `"reports"`, `refreshTrustedBlocklists()`, and `refreshSupporters()`, run `checkUrlPostHash(postLink)`, call `reloadPosts()`, wait briefly up to 3.5 s for first network posts if empty, and call `hideBoot()`. When signed in, remove `body.guest-mode`.
     - Update `reloadPosts()` & `renderTimeline()`: remove `if (!currentIdentity) return;` guards; resolve scope with `resolveFeedScope(...)`; use `guestPreferKeys(RADICA_MAINTAINER, supporterKeys, ghostkeyKeys)` in `prefer` when `!currentIdentity`; use `shouldHideUnjoinedCommunityPost(...)` in `renderTimeline()`.
     - Update read-only guest paths: `renderSinglePostContent` (`3408`), `openUserProfile` (`6888` `iBlock`, `6996` `showLinfa`, `7032` `loadComments`), `loadTreePage` (`7795`, `7816`), `linfaForAuthors` (`14610`), `checkUrlInviteHash` (`14724`, call `requireIdentity` if invite hash is opened as guest).
     - Gate all write/private actions with `requireIdentity(...)`: `openChatBtn`, `openChatWithPeer` / `.talk-btn` / `uviewTalkBtn`, `openMailModal`, `openNotifsBtn`, `blocklists-open-btn`, `head-profile-btn`, `edit-profile-btn`, `scopeFollowingBtn`, `switchToMyPostsScope` (when `!feedAuthor`), `scopeSavedBtn`, `toggleLikeFromCard`, `toggleDislikeFromCard`, `toggleCommentLikeFromButton`, `submitCommentFromCard` (+ `.comment-btn-file`/`.comment-btn-gif`/file/paste/drop), `stageRepost`, `openBoardPickerModal`, `.save-post-btn`, `reportContentTarget`, `toggleBlockAuthor`, `uviewFollowBtn`, `commJoinBtn`, `[data-rhero-action="join"]`, `[data-rside-join]`, `createCommunityFromPage` / `openCreateCommunityDialog` (when `!edit`), `redditPublishBtn`, `[data-raction="repost"]`, `[data-raction="save"]`, `toggleLikeInGrid`, `reelsPlayer.toggleLike`, `articlesPage` `toggleLike` & `openComposer` gate, `musicPage` `toggleFollow` & `shareReleaseToFeed`, `greenhousePage` `report`.
   - **`ui/src/articlesPage.ts` & `ui/src/greenhousePage.ts`**:
     - `articlesPage.ts:414`: show `🚩 Report` and `🚫 Hide Author` whenever `target.author !== me` (even when `me === ""` for guests), and call optional `deps.requireIdentity?.("write an article")` in `openComposer`.
     - `greenhousePage.ts:588, 604`: check `whoAmI()` or optional `canReport` / let `deps.report` gate before opening `promptDialog` so guests are taken straight to `#identity-modal` when clicking Report.
2. **`ui-2` (Updates & Guide docs per `AGENTS.md`)**:
   - `ui/src/updates.ts`: prepend `2026-11-28` user-facing entry explaining read-only guest browsing on first open and one-click sign-in when ready to post/chat.
   - `ui/index.html` (`#guide-modal`): add a concise read-only browsing note under `🔑 Your identity`.

### Content Moderation (all 3 layers, `AGENTS.md`)
- **Layer 1 (`ui/src/moderation.ts`)**: Guests cannot upload/publish content; `maskProfanity(...)` continues to apply on display across feed, communities, articles, music, events, and Greenhouse respecting `radica_mask_bad_words` (default on).
- **Layer 2 (`ui/src/moderationPolicy.ts`)**: `buildModerationSets("")` / `buildModerationPolicy({ me: "", ... })` remains active for guests using `DEFAULT_CURATOR` (`RADICA_MAINTAINER`) + one-level global moderators' `blocklist/<c>`, `reports` AI holds (`freenet.aiHeldTargets()`), hidden communities, and local `radica_hidden_users`; guest startup fetches `"reports"` (via `connectSocial()` + guest boot) and `refreshTrustedBlocklists()`.
- **Layer 3 (Manual)**: **Report** (`reportContentTarget` / `freenet.reportPost`) calls `requireIdentity("report content")` (signed action); **Hide Author** (`setUserHidden` / `hideAuthorWithToast`) stays usable locally for guests in feed cards, Single Post View, User Profiles, Articles, Music, and Greenhouse.

### New `CONTEXT.md` Domain Terms
- **Read-only guest mode** (`ui/src/guestMode.ts`, `body.guest-mode`, `#guest-banner`) — default startup state when no identity is present outside standalone Radica Messenger (`!isMessengerApp`), connecting to Freenet, loading public feeds/communities/logs with Layer 2 moderation, and gating write/private actions behind `requireIdentity`.

### `[test]`
- **`test-1`**: `ui/tests/guestMode.test.ts` testing `shouldStartInGuestMode`, `resolveFeedScope`, `guestPreferKeys`, `shouldHideUnjoinedCommunityPost`, and Layer 2 `buildModerationPolicy({ me: "", ... })` (curator blocklists, AI holds, local `radica_hidden_users`, hidden communities).
- **`test-2`**: Update `signIn` in `ui/e2e/{app,mobile,chat-modals,moderation,names}.spec.ts` and `ui/e2e/app.spec.ts:166` to click `#guest-signin-btn` first, add guest-mode e2e tests in `ui/e2e/app.spec.ts` (boots without `#identity-modal`, shows `#guest-banner`, hides composer & personal tabs, shows public posts including `r/radica`, gates write/private action to `#identity-modal`, allows dismissing `#identity-modal` via `#id-browse-readonly-btn`, and keeps local Hide Author working), and run Playwright suites.
- **`test-3`**: Run `npm test`, `npm run build`, `graphify update .`, audit `AGENTS.md` checklist (`CHANGELOG.md`, `README.md` Key Features/UX note, `updates.ts`, `#guide-modal`, `CONTEXT.md`), and close `tasks/015-read-only-guest-mode.md` & `ISSUES.md`.

## Tasks
- [x] [core] core-1: Add pure guest-mode helpers in `ui/src/guestMode.ts` and update `FreenetClient.getExploreTimeline` (nullable identity, `circleOnly` off for guests) + `connectSocial` (`reports` log) in `ui/src/freenet.ts`
- [x] [ui] ui-1: Wire guest boot, `#guest-banner`, `#id-browse-readonly-btn`, `body.guest-mode` CSS, `requireIdentity(...)` gates, guest-safe `reloadPosts`/`renderTimeline`/`openSinglePostModal`/`openUserProfile`/`loadTreePage`/`openCommunitiesPage`/`articlesPage`/`musicPage`/`greenhousePage` across `ui/index.html`, `ui/src/style.css`, `ui/src/main.ts`, `ui/src/articlesPage.ts`, and `ui/src/greenhousePage.ts` (after: core-1)
- [x] [ui] ui-2: Prepend `2026-11-28` read-only guest mode entry in `ui/src/updates.ts` and update `#guide-modal` `🔑 Your identity` section in `ui/index.html` (after: ui-1)
- [x] [test] test-1: Add unit tests in `ui/tests/guestMode.test.ts` covering `guestMode.ts` helpers and Layer 2 `buildModerationPolicy({ me: "", ... })` filtering (after: core-1)
- [x] [test] test-2: Update `signIn` helpers in `ui/e2e/{app,mobile,chat-modals,moderation,names}.spec.ts` (and `app.spec.ts:166`), add guest-mode e2e coverage in `ui/e2e/app.spec.ts`, and run Playwright suites (after: ui-1)
- [x] [test] test-3: Run `npm test`, `npm run build`, `graphify update .`, update `CHANGELOG.md` and `README.md`, audit `AGENTS.md` rules, and close `tasks/015-read-only-guest-mode.md` & `ISSUES.md` (after: ui-2, test-1, test-2)
# TASK-015: Read-only guest browse mode before creating a profile

## Context & Goal
Community feedback from IvvOr & Agent.69 (`r/radica`, 2026-11-28):
When opening Radica on a fresh Freenet node, visitors currently hit `#identity-modal` immediately with an empty feed behind it (`reloadPosts()`, `renderTimeline()`, and `freenet.getExploreTimeline()` all require `currentIdentity`). This makes a new node look empty and forces newcomers to create/back up a keypair before seeing whether there is any activity on the network. Meanwhile, letting casual visitors browse public content in read-only mode also helps Freenet itself by fetching and caching public contracts on their node without creating throwaway identities.

Goal: Start Radica (except standalone **Radica Messenger**, which is private E2EE chat only) in **Read-Only / Guest Mode** when no identity is configured, loading Explore, Communities, Moments, Articles, Music, Greenhouse, Living Tree, and public User Profiles immediately with full Layer 2 moderation active, while any write or private action cleanly opens `#identity-modal` to sign in or create a key.

## Requirements
1. **Immediate Read-Only Startup**: On fresh start without an identity (`!isMessengerApp`), do not block on `#identity-modal`; connect to the Freenet node, fetch public logs (`communities`, `directory`, `supporters`, `ghostkeys`, `poh`, `delegations`, `supporter-receipts`, `post-edits`, `reports`, maintainer `blocklist`), and render Explore immediately.
2. **Non-Blocking Banner & Guest UI**: Show a compact `#guest-banner` above the feed (*Read-only mode* + **Sign in / Create key** button), hide personal-only UI (post composer, Following / My Posts / Saved scope tabs, personal sidebar follow/edit controls), and allow dismissing `#identity-modal` via **Browse read-only** (`#id-browse-readonly-btn`) or `✕` while in guest mode. Standalone Radica Messenger (`isMessengerApp`) keeps requiring sign-in first.
3. **Write & Private Action Gates**: Clicking any write or private action (like, dislike, comment, repost, save, board, RSVP, follow, report, create community, Chat, Mail, Notifications, Blocklists, My Profile) calls `requireIdentity(action)` to show a toast and open `#identity-modal`. Local **Hide Author** remains usable.
4. **Full 3-Layer Moderation in Guest Mode**: Public feeds, communities, articles, music, profiles, and Greenhouse in read-only mode must still apply default curator blocklists (`DEFAULT_CURATOR`), AI holds, and local hidden authors (`me === ""`).
5. **Testing & Verification**: Unit tests (`ui/tests/guestMode.test.ts`), update Playwright `signIn` helpers + add guest mode e2e test in `ui/e2e/app.spec.ts`, run `npm test`, `npm run build`, Playwright e2e suites, and `graphify update .`.
6. **Docs**: Update `ui/src/updates.ts`, `ui/index.html` (`#guide-modal`), `CONTEXT.md`, and `CHANGELOG.md`.

## Status
⚪ TODO

