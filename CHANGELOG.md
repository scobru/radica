5.7.2 / 2026-11-16
==================

  * **FIX** Mail to another node failed with "missing contracts" (`ui/src/mailClient.ts`, `ui/src/freenet.ts`, `ui/src/wasm/freenet_token_allocation_record.wasm`, `ui/tests/mailClient.test.ts`): the inbox contract checks each message's AFT token against the sender's `TokenAllocationRecord`, which the node that takes the update fetches from the network. Radica derived that contract's address (`deriveTokenRecordContractAddress`) but never published the contract, so a Radica sender's record did not exist anywhere (`VerificationError::MissingContracts`). `ensureTokenRecordPublished` now runs before the inbox update: it GETs the record by instance, PUTs it (frozen v1 code, `TokenDelegateParameters` params, the record holding this token) when missing, or sends the whole record as an update when held, as Freenet Mail's own UI does at identity creation. A refused publish is reported in the send result and the send is still attempted. The WASM is `freenet/mail`'s frozen `published-contract/wasm/v1/freenet_token_allocation_record`, byte for byte (LGPL-3.0-or-later, see `freenet/mail` `COPYING.LESSER`).
  * **NEW** Block a mail sender (`ui/src/mailClient.ts`, `ui/src/main.ts`, `ui/index.html`, `ui/src/durable.ts`, `ui/tests/mailClient.test.ts`): `Block sender` in the Radica Mail read view. `mailSenderKey` names a sender by the inbox contract id after the `@` (an alias is free text; the inbox is derived from the sender's key). `blockMailSender` stores it under the durable `radica_mail_blocked_<persona>` key and removes that sender's inbox messages; `syncFreenetMailInbox` skips blocked senders before storing, so there is no badge and no `mail` notification. Unblock in Contacts → Blocked senders: the inbox contract still holds the mail, so a sync brings it back. Local and never published. Local addresses without an inbox id (`welcome@freenet`, `radica@official`) cannot be blocked. The inbox contract already enforces AFT tokens and the sender signature; this is the reader-side filter the contract cannot offer.
  * **NEW** Secret Chat protection level in the header (`ui/src/secretRatchet.ts`, `ui/src/messengerChat.ts`, `ui/tests/secretRatchet.test.ts`): the subtitle under the contact's name reads **Post-quantum** once ML-KEM is mixed into the session (from the first reply), **Double Ratchet** before that, or **PFS Ephemeral** when no v2 session exists yet; hover for what it means. `drLevel()` reads it from the session messages go out on.

  * **NEW** Music bough on the Living Tree (`ui/src/treeGraph.ts`, `ui/tests/treeGraph.test.ts`): a post that shares a FreeTunes release or artist (`freetunesLink` / `freetunesArtistLink`) hangs on its own "Music" bough, the way articles hang on "Articles", instead of on Thoughts/Moments.
  * **FIX** Multi-photo posts in Moments (`ui/src/main.ts`, `ui/src/style.css`): the Moments grid shows a post's first photo, and clicking it opened just that one photo — the others could only be seen from the post itself. The lightbox now opens a multi-photo post as a carousel (prev/next buttons, swipe, ←/→ keys, a 1/N counter), at the photo clicked; it closes on Escape or a click outside the photos.

  * **SECURITY** Secret Chat moves to the Double Ratchet (`ui/src/secretRatchet.ts`, `ui/src/secretChatTransport.ts`, `ui/src/durable.ts`, `ui/tests/secretRatchet.test.ts`, `ui/tests/secretChatTransport.test.ts`):
    * v1 (`secret:v1:`) had no forward secrecy in practice: every message key was re-derived on each read from the identity key, the sender's ephemeral key (sent in clear in each message) and the peer's public key, and the session (ephemeral private key included) was saved to the node. Whoever got the identity key could open every Secret Chat message ever harvested from the public inbox logs.
    * v2 (`secret:v2:<header>:<iv>:<ciphertext>`) is the Signal Double Ratchet: X3DH-style start without prekeys (`DH(IK_a, IK_b) ‖ DH(base, IK_b)`), a DH ratchet step on every turn, HMAC chain keys, skipped keys for reordered messages (500 per message, 1000 kept), AES-GCM with both static keys and the header as associated data. A message key is deleted once used and a session changes only when a message opens.
    * Sessions are Olm-style, one per (me, peer, base key), up to 4 per peer: two people who start at the same time each get a session and both decrypt; replies go out on the one last used.
    * Since a key opens its message once, the plain text is kept on the device (`radica_secret_plain_<me>`, durable, never in the URL hash, newest within 64 KB) and burned with the message. A Secret Chat message sent from another device of mine is not readable here (it never was meant to be: Secret Chat is single-device).
    * Old `secret:v1:` messages still open. A peer on a build before this one cannot read `secret:v2:` messages until it updates.
    * Known limit: the first messages of a session, before the peer's first reply, can be opened by whoever later steals the recipient's identity key (no signed prekeys on Freenet yet). Every message after the first reply is protected.
  * **SECURITY** Secret Chat v2 is hybrid post-quantum (`ui/src/secretRatchet.ts`, `ui/tests/secretRatchet.test.ts`): each side sends its ML-KEM-768 key in the header (`e`) until the peer uses it, and from then on every new sending chain mixes a fresh ML-KEM shared secret into the root key (`HKDF(DH ‖ ss_kem)`), its ciphertext riding in that chain's headers (`k`). A message is then safe unless both X25519 and ML-KEM fall, which protects against "harvest now, decrypt later" on the public inbox logs. The ML-KEM key pair is derived from the identity key apart from Freenet Mail's, so the two protocols share nothing. The first chain of a session (before any reply) is X25519 only. Header cost: about 3 KB while a key is being sent, about 3 KB per message for the ciphertext (a log entry allows 64 KB).

  * **FIX** Poll results only updated on refresh (`ui/src/freepolls.ts`): ready `.fp-card`s are re-read every 8 s while the page is visible and counts, bars and response total updated in place (inputs untouched). Polling, not a contract subscription.
  * **FIX** Moderation pane (`ui/src/main.ts`): profile links (`href="#"`) in the Blocklists & Moderation modal now `preventDefault`, so opening a profile no longer reloads the app; `refreshAllGlobalModLogs` is capped at 4 s so Remove/Dismiss no longer wait forever on a loaded node.
  * **NEW** Comments on Greenhouse proposals (`ui/src/greenhouse.ts`, `ui/src/greenhousePage.ts`, `ui/src/style.css`, `ui/tests/greenhouse.test.ts`): `{type:"comment", seed, text}` entries in the signed `greenhouse` log (500 chars, 100 per seed, members who can vote), folded into `Seed.comments`; a `<details>` thread per card keeps its open state and draft across redraws. Moderation: on-device `analyzeTextContent` confirm before posting, `renderChatText` masks bad words per reader setting, `foldGreenhouse` drops comments of hidden/blocked authors and reported/AI-held targets (own comments always stay), per-comment **Report** (`freenet.reportPost`) and **Hide author**.
  * **FIX** Living Tree showed no article (`ui/src/treeGraph.ts`, `ui/tests/treeGraph.test.ts`): the bough counted an article but the placement step ignored `ARTICLE_BOUGH` and hung it on its category bough; both steps now share `categoryBoughOf`.
  * **NEW** 12 more comment reaction GIFs (`ui/src/gifPicker.ts`, `ui/public/gifs/`): `CURATED_GIFS` grows from 17 to 29 entries — 🔥, 💯, 🎉, 🤔, ✨, 🙏 under Reactions; 😂, 😍, 😡, 😭 under Emotions; 👀, 💀 under Memes. These are small, original animated-emoji GIFs (NotoColorEmoji glyphs animated with Pillow — scale/rotate/bounce, no copyrighted footage), not sourced from an external GIF API (none is reachable from inside Freenet's sandboxed iframe without further work).
  * **NEW** Articles tab on user profiles (`ui/index.html`, `ui/src/main.ts`): a profile's tab bar (`#uview-tabs`) gets a `📰 Articles` tab alongside Posts/Reposts/Moments/Videos/Boards, filtering to posts whose caption carries a `radica-article:` token and rendering each with `renderArticleFeedCardHtml` (the same preview card the main Feed uses), rather than leaving articles to show up only as a wall of raw post text under Posts — which it also now renders correctly for the same reason.
  * **FIX** Curated Boards lost on refresh (`ui/src/durable.ts`, `ui/tests/durable.test.ts`): `radica_boards_` was missing from `DURABLE_PREFIXES`, so a board created in one session never made it into the node's durable package — a plain browser refresh (the only thing `isDurable` keys survive in Freenet's sandboxed shell) wiped it, and "Add to Board" would then show "No boards yet" for a board the owner was sure they'd made. Same class of bug as the earlier `radica_mail_contacts_`/`radica_fmail_contacts_` prefix mismatch.
  * **NEW** Profile Connections tab on every screen width (`ui/src/style.css`): the mobile-only `🔗 Connections` tab (`.uview-tab-connections`, `uview-show-connections`) that swaps the Linfa/connected-apps aside in full-width is no longer gated behind `@media (max-width: 820px)` — on desktop it now toggles the same way instead of the aside being permanently docked beside the Wall.
  * **FIX** Feed cache lost on a real app restart in the Android & desktop apps (`apps/android/src/main/java/org/freenet/radica/MainActivity.java`, `apps/desktop/src/web.rs`, `ui/src/storage.ts`, `ui/tests/storage.test.ts`):
    * Radica runs in a sandboxed iframe the Freenet node's own web container serves (no `allow-same-origin`), so `window.localStorage` always throws there; `storage.ts`'s existing fallback (`window.name` + URL hash) only survives in-tab navigation, not the app being fully closed and reopened (a fresh `WebView`/`WebViewBuilder` means a fresh, empty `window.name`).
    * Both native wrappers now inject `window.__radicaNative` — reachable from the sandboxed iframe too (Android's `addJavascriptInterface`, reachable from every frame; desktop's `with_initialization_script_for_main_only(.., false)`) — backed by `SharedPreferences` on Android and a JSON file next to the webview's profile directory on desktop.
    * `SafeStorage` tries this bridge first when real `localStorage` is unavailable; unlike `window.name` (capped at 512 KB) or the URL hash (capped at 7.5 KB), it carries the whole store, so a cached feed of several MB now survives a real restart. A plain browser tab has no such wrapper to fix, so it keeps the existing `window.name`/hash behavior — that sandboxing is enforced by the node itself, outside this repo.
  * **NEW** Attester FreeTunes check (`attester/src/freetunes.js`, `attester/src/freetunes.test.js`, `attester/src/main.js`, `attester/README.md`): with `FT_CHECK=1` the bot looks up every track in the FreeTunes directory on MusicBrainz and files a `copyright` report (ante proof-of-work, own `ante.key` identity) in FreeTunes' `reports` contract for tracks that already exist. Report-only, no model.
  * **NEW** Folio in Apps Launcher (`ui/src/ecosystem.ts`, `README.md`): listed Folio's own deployed Freenet site (`pzYToSx8kK9xZmc1a5A4nvwy1npgcMMedA4xj7cLaqK`) in `ECOSYSTEM`, alongside its existing `folio/` coverage below.
  * **NEW** Customizable Main Rail Shortcuts (`ui/src/main.ts`, `ui/src/durable.ts`, `ui/src/style.css`, `ui/index.html`):
    * Settings → Main Rail Shortcuts lets you pick which 3 rail buttons (Chat/Mail/Activity by default) always show vs. which live behind More; moves the existing buttons rather than duplicating their icons/badges/shortcuts, so nothing else about them changes. Persisted per identity under `radica_dashboard_slots_` (durable key).
  * **NEW** @Mention Autocomplete in Chat (`ui/src/messengerChat.ts`, `ui/src/messengerLogic.ts`, `ui/src/messengerChat.css`, `ui/tests/messengerChat.test.ts`):
    * Typing `@` in the Messenger composer opens `#rm-mention-popup`, listing the current conversation's members (DM peer, private room roster, or community participants via `freenet.getCommunityParticipants`/`riverRoster`) and narrowing as you type, via the pure `detectMentionTrigger` / `filterMentionCandidates` helpers in `messengerLogic.ts`.
    * Pick with the mouse, Arrow keys + Enter/Tab, or Escape to dismiss; inserts a `@<pubkey>` mention that renders as `@Name` everywhere mentions are shown.
  * **NEW** Viso Persona Delegation (`DelegationProofV1`) & GitHub PoH Badge UI (`ui/src/viso.ts`, `ui/src/base58.ts`, `ui/src/whoiam.ts`, `ui/src/freenet.ts`, `ui/src/durable.ts`, `ui/src/supporterPanel.ts`, `ui/src/greenhousePage.ts`, `ui/src/icons.ts`, `ui/src/main.ts`, `ui/src/style.css`, `ui/index.html`, `ui/tests/viso.test.ts`):
    * Extracted pure Base58 encoding/decoding into `ui/src/base58.ts` (re-exported from `ui/src/whoiam.ts`) so `ui/src/viso.ts` remains pure and Node-testable.
    * Added dual-signed Viso `DelegationProofV1` verification (`verifyVisoDelegation`, `verifiedDelegations`, `verifiedPohBadges`, `parseStoredPoh`, `serializeStoredPoh`) supporting `"radica"` / `"*"` scopes and inherited PoH attestation across Freenet's public `"delegations"` log (`radica_delegation_` durable prefix).
    * Added Identity → Viso Persona Delegation controls (`#delegation-box`, `#delegation-proof-input`, `#delegation-link-btn`, `#delegation-remove-btn`) and delegated PoH resolution (`visoPohResolved`, `visoDelegationOf`) in `freenet.ts` and `supporterPanel.ts`.
    * Added a prominent GitHub PoH badge (`.badge-github-poh` with GitHub mark SVG) across feed posts, user profile modals (`#uview-name`), profile page (`#pp-poh-badge`), and sidebar (`#sidebar-poh-badge`).
  * **NEW** Viso Persona Level (`ante`) & Google PoH (`poh:google`) Badges (`ui/src/viso.ts`, `ui/src/freenet.ts`, `ui/src/icons.ts`, `ui/src/main.ts`, `ui/src/style.css`, `ui/src/supporterPanel.ts`, `ui/index.html`, `ui/tests/viso.test.ts`):
    * Added client-side BLAKE3/Ed25519 verification (`visoAnteBits`, `anteTierOf`) for Viso `ante` slots (`viso:persona-level:v1`), inherited via verified `DelegationProofV1` handoffs, rendering `⚡ Seeded · 16b+`, `⚡ Forged · 20b+`, and `⚡ Veteran · 24b+` tier chips on profiles, posts, and sidebar.
    * Extended Viso PoH support to `poh:google` alongside `poh:github` (`verifiedPohBadgesByAuthor`, `googlePohKeys`, `.badge-google-poh`, and Google SVG icon in `ui/src/icons.ts`), discovering both slots in `visoPohResolved` and `openUserProfile`.
  * **NEW** Apps Launcher Additions (`Moments`, `Communities`, `Atlas`, and `Hive` Author Attribution) (`ui/src/ecosystem.ts`, `ui/index.html`, `ui/tests/ecosystem.test.ts`):
    * Added **Moments** (`open-media-btn`) and **Communities** (`open-communities-btn`) to `RADICA_BUILTIN_APPS` so both built-in Instagram/Reddit-style experiences are directly launchable and pinnable from Apps.
    * Added **Atlas** (`ATLAS_SITE = 771DvtPMwt2PumPyrFvsz7fpvU1gogcmb5qtS1yYEEH9`) and creator attribution for **Hive** (`by @holdmylatte`) in `ECOSYSTEM` / `LAUNCHER_APPS` and updated the Guide & ecosystem documentation.
  * **NEW** Function-First Apps Launcher Labels (`ui/src/ecosystem.ts`, `ui/src/main.ts`, `ui/tests/ecosystem.test.ts`):
    * Added `EcosystemApp.launcherLabel`: the Apps grid now leads with what an app does (Chat, Mail, Music, Identity, Blog, Polls, Names, Organizer, Games, Bookmarks, File Transfer, Linktree, Classroom, Git, Web App), with the actual product name shown underneath — scoped to the launcher grid only, so `name` (search, the footer list, tests) is unchanged.
  * **NEW** Folio (`folio/`): a minimal, account-free Markdown article writer in the spirit of telegra.ph, living in this repo as its own Freenet site. Publishes straight to Radica's `media-contract` (no identity, no Viso persona) and hands back a `radica-article:<hash>` token — paste it into any Radica post's caption and `parseArticleCaption` (already in `ui/src/articles.ts`) renders it as a full Article card under that post's own real, signed identity. No Radica-side changes needed at all.

5.7.1 / 2026-11-15
==================

  * **NEW** Viso Anonymous Proof-of-Personhood (`poh:github`) Integration (`ui/src/viso.ts`, `ui/src/freenet.ts`, `ui/src/wot.ts`, `ui/src/supporterPanel.ts`, `ui/src/greenhousePage.ts`, `ui/src/durable.ts`, `ui/src/main.ts`, `ui/src/style.css`, `ui/index.html`, `ui/tests/viso.test.ts`, `ui/tests/wot.test.ts`):
    * Added WebCrypto `RSABSSA-SHA384-PSS-Randomized` (RFC 9474) signature verification (`verifyVisoPoh`, `visoPohOf`, `visoPohRawOf`, `verifiedPohs`, `pohMsg`) in `ui/src/viso.ts` to validate CBOR `PohAttestationV1` proofs bound to each persona's Ed25519 pubkey (`poh:<provider>` slots on Viso identity contracts) without revealing the underlying external GitHub account.
    * Added `pohProofs()`, `setPohProof()`, `visoPoh()`, `visoPohHex()`, and `verifiedPohAuthors()` in `ui/src/freenet.ts` backed by the public `"poh"` log and durable key prefix `radica_poh_`.
    * Integrated verified Viso Humans into `WebOfTrust` (`humans` Tier-2 set, `🛡️ Verified Human` badge), automatic newcomer PoW/rate-limit exemption (`amVouched` / `vouchedForAll`), Greenhouse voting (`sprout` weight = 1 per verified human), and the Identity → Support Radica panel (`#poh-verify-btn` / `#poh-remove-btn`).

  * **NEW** Freenet Ecosystem Apps Launcher (`ui/src/ecosystem.ts`, `ui/src/durable.ts`, `ui/src/shortcuts.ts`, `ui/src/main.ts`, `ui/src/style.css`, `ui/index.html`, `ui/tests/ecosystem.test.ts`, `ui/tests/shortcuts.test.ts`):
    * Added a dedicated **Apps** rail page (`#open-apps-btn`, `#apps-modal`, keyboard shortcut `g e`) reusing `LAUNCHER_APPS` (`RADICA_BUILTIN_APPS` including **Articles** + the canonical `ECOSYSTEM` catalog) alongside `hrefOf`, `normalizeSiteKey`, `customRecordToApp`, and `filterLauncherApps`.
    * Built-in integrated apps (`Articles`, plus `River` via `RIVER_SITE = "raAqMhMG7KUpXBU2SxgCQ3Vh4PYjttxdSWd9ftV7RLv"`, `Freenet Mail` via `FREENET_MAIL_CONTAINER_KEY`, `FreeTunes` via `FREETUNES_SITE`) expose an in-app **Open** button alongside **External App ↗** node contract links when an external Freenet web app key exists.
    * Replaced **Spore** with **Aula** (`AULA_SITE = "GbG8dmva2QsVJMqCnv9iTXwwdbVjKMfZcTRCF94oTUes"`, `https://github.com/scobru/aula`) and added **Hive** (`HIVE_SITE = "AqiX61ZEVgTVWudkbTqDv8w57vsQ24ZhjytEGVwzas7A"`, decentralized Git & code collaboration) in `ECOSYSTEM`, `Updates`, `README.md`, and `#guide-modal`.
    * Supports live search, filter tabs (`All`, `Pinned`, `On Node`, `Built-in`), 1-click pinning (`★`) to top, built-in view jumps (`Open`) vs. standalone node contract launch (`Launch ↗` / `Node ↗`), 1-click URL copy, and adding/removing custom Freenet site contract keys persisted in durable node storage (`radica_apps_pinned_`, `radica_apps_custom_`).

  * **NEW / FIX** 🌱 The Gardener Bot, Owner/Mod Ban Immunity & Greenhouse AI Workflows (`ui/src/types.ts`, `ui/src/logfold.ts`, `ui/src/freenet.ts`, `ui/src/messengerChat.ts`, `ui/src/greenhouse.ts`, `ui/src/greenhousePage.ts`, `ui/src/main.ts`, `ui/index.html`, `attester/src/moderator.js`, `attester/src/main.js`, `ui/tests/logfold.test.ts`, `ui/tests/greenhouse.test.ts`, `attester/src/moderator.test.js`):
    * **Moderator & Owner Ban Immunity**: Hardened `foldCommunities`, `banMemberFromCommunity`, Messenger community member drawer actions, global Moderation `ban` actions, and The Gardener bot (`freshPosts`, `freshChatMessages`, `decideChatAction`, `foldCommunitiesState`) so community founders/owners, community moderators, and global moderators/`RADICA_MAINTAINER` can never be banned or auto-flagged.
    * **Community Public Chat AI Moderation (`chatModPass`)**: Added moderator-only 1-click **🌱 Add Gardener / 🗑️ Delete Gardener** controls inside both the Community Moderation Panel (`#comm-gardener-btn`) and the Chat Community Info drawer (`[data-comm-gardener]`), allowed any community moderator (including in `system`-owned genesis communities like `c_radica`) to add or remove `AI_REPORTERS` bots, included `comm.moderators` in `getCommunityParticipants` so invited moderators appear immediately in the Community Info drawer with a `Mod` badge, and added optional `GARDENER_COMMUNITIES` env filtering in `attester/src/main.js`. When active in a community, The Gardener monitors public `community-chat/<id>` messages, posts an in-chat warning on a 1st spam/scam/threat/doxxing violation, and deletes the offending message + bans the sender on a 2nd violation.
    * **Greenhouse Agile AI Export & GitHub Sync (`formatSeedsForAi`, `greenhousePass`)**: Added **🤖 Copy for AI** on each Greenhouse proposal and **🤖 Copy all for AI** in `#greenhouse-modal` to copy Markdown prompts for coding agents, allowed `AI_REPORTERS` (`statusIssuers`) to update seed status badges in `foldGreenhouse`, and added `greenhousePass` to `attester/src/main.js` so The Gardener checks open Greenhouse proposals against GitHub commits (and optional GitHub Issues when `GITHUB_TOKEN` is set) and marks resolved proposals `✅ Done`.
    * **UI Cleanup**: Removed the duplicate `#mod-refresh-btn` button inside the Moderation pane since `#blocklists-refresh-btn` refreshes both tabs.

  * **NEW / FIX** Multi-Moderator Coordination & Attester Hold Persistence (`attester/src/main.js`, `attester/src/moderator.js`, `attester/src/moderator.test.js`, `ui/index.html`, `ui/src/logfold.ts`, `ui/src/freenet.ts`, `ui/src/main.ts`, `ui/tests/logfold.test.ts`):
    * **Recently Moderated Log (`foldHandledReports`)**: Added a **Recently moderated** section (`#mod-handled-section`) under **Blocklists & Moderation → Moderation** displaying recent `Removed` / `Dismissed` decisions across all global moderators (`RADICA_MAINTAINER` and `modsOf`), showing which moderator acted, relative time, original report context, `View post`, and `Undo` for the current moderator's own entries.
    * **Cross-Moderator Alerts & Duplicate Guard**: Opening a report notification checks `modDecisionFor(target)` after refreshing global moderator blocklists and warns `"Already removed/dismissed by @Moderator"` if handled; acting on a queued or feed item guards against duplicate actions and overrides with confirmation, and notifies fellow global moderators in Activity when a moderator removes, dismisses, or bans a reported post.
    * **Attester Hold Resolution Persistence (`applyHoldOutcomes`)**: Extracted pure `applyHoldOutcomes` in `attester/src/moderator.js` and persisted `moderated.json` immediately after resolving held post outcomes in `attester/src/main.js`, even when a pass finds 0 new posts, preventing repeated hold-resolution logs and `categoryStats` double-counting.

  * **NEW** Moderation & Blocklists Instant Refresh Controls (`ui/index.html`, `ui/src/main.ts`, `ui/src/updates.ts`):
    * Added dedicated **↻ Refresh** buttons to the **Blocklists & Moderation** modal header (`#blocklists-refresh-btn`) and directly within the Moderation queue panel (`#mod-refresh-btn`).
    * Clicking either button triggers an immediate on-demand network fetch of the public `reports` log (`freenet.refreshLog("reports", true)`) and trusted blocklists, refreshes badge counters, clears mod peer cache to resolve new author profiles, and provides live button loading state (`↻ Refreshing…`) and toast confirmations without requiring a page reload.

  * **NEW / FIX** Single Post View, Profile Bio Markdown, Mobile Camera & Tree Performance (`ui/index.html`, `ui/src/main.ts`, `ui/src/style.css`, `ui/src/mail.css`, `ui/src/icons.ts`, `ui/src/scrollAnchor.ts`, `ui/src/treeGraph.ts`, `ui/src/treePage.ts`, `ui/src/communitiesPage.ts`, `ui/src/freenet.ts`, `ui/tests/scrollAnchor.test.ts`, `ui/tests/templateNesting.test.ts`):
    * **Single Post View (`#single-post-modal`)**: Added a standalone modal view to open any single post directly from **Communities** (clicking a thread title or the new **Open** button) or from the main **Feed** (clicking a post's timestamp or **Open post** inside its `...` menu), complete with full comment threads, Freenet micro-app embeds, all three moderation layers, and a **View in feed** action.
    * **Markdown Profile Bio & Clean Header**: Added `#pp-bio` beneath `#pp-meta` on the Profile page and rendered `#sidebar-bio`, `#pp-bio`, and `#uview-bio` through `setProfileBio()` (`renderCaption` + `white-space: pre-wrap`) with clickable links, `@mentions`, `#hashtags`, and preserved newlines/spaces.
    * **Mail Header & Icon Polish**: Simplified the Mail header title from `Freenet Mail` to `Mail`, removed `.mail-pq-badge` so mobile headers do not clip, and replaced decorative button/chrome emojis across Activity, Notifications, Moments, Mail contacts, Communities flairs/actions, Profile actions, and Living Tree tooltips with crisp SVG icons (`renderIcon`).
    * **Moments Mobile Camera Capture**: Added a native `<input type="file" id="media-camera-input" accept="image/*" capture="environment">` capture flow and automatic fallback when `navigator.mediaDevices.getUserMedia` is unavailable or blocked by insecure/sandboxed gateway origins on mobile.
    * **Smooth Mobile Living Tree**: Replaced full SVG `innerHTML` rebuilds during pan/zoom with direct `viewBox` mutation (`applySvgViewBoxOnly`) plus GPU-composited `translate3d`/`scale` preview transforms for drag and 2-finger pinch-to-zoom, paused heavy SVG animations on touch/mobile devices, and throttled `Watch Grow` frames on mobile.
    * **Anchored Post Deep-Link Scrolling (`ui/src/scrollAnchor.ts`)**: `showMyPost()` now anchors the target post card via `anchorElementInViewport()` using `ResizeObserver`, `MutationObserver`, and capture-phase `load` listeners (cancelling immediately on user input) so async media/embeds loading above a linked post no longer shift it out of view.

  * **PERF / FIX** Mobile Chat Scrolling Smoothness (`ui/src/messengerChat.css`, `ui/src/style.css`, `ui/src/messengerChat.ts`, `ui/src/messengerLogic.ts`, `ui/src/main.ts`, `ui/tests/messengerChat.test.ts`):
    * Added `overscroll-behavior: contain`, `-webkit-overflow-scrolling: touch`, and `touch-action: pan-y` on `.rm-messages-scroller`, `.rm-conv-list`, `#chat-messages-list`, and `.rm-drawer` (plus `overscroll-behavior: none` on `body.chat-open` / `body.chat-fullscreen` on `<= 768px`) to prevent scroll chaining into the mobile browser viewport.
    * Added `will-change: scroll-position` and `contain: layout style` on `.rm-messages-scroller` and `.rm-msg-row`, and hid unexpanded `.rm-hover-bar` elements on `@media (hover: none)` touch devices.
    * Added directional gesture locking (`resolveMessageSwipeStep`) so swipe-to-mention does not apply `translateX` transforms during vertical/diagonal scrolling, and `resolveThreadScrollAction` so `renderThread` does not interrupt native momentum scrolling when rows are unchanged or the user is actively scrolling; also fixed the `closeReactPicker` scroll listener to attach to `#rm-messages-scroller`.
    * Coalesced `syncMobileViewport()` updates on `visualViewport` `resize`/`scroll` via `requestAnimationFrame` and skipped redundant `--rm-vvh` / `--rm-vvt` style writes when unchanged.

  * **NEW** Edit & Delete Published Articles from Articles UX (`ui/src/articles.ts`, `ui/src/articlesPage.ts`, `ui/src/main.ts`, `ui/src/freenet.ts`, `ui/src/style.css`, `ui/tests/articles.test.ts`):
    * Added **Edit** and **Delete** actions for the article's author directly in the **Articles & Newsletters** list cards and Reader view (`#articles-modal`).
    * Editing a published article uploads a revised `ArticlePayload` (preserving `publishedAt`, recording `editedAt`, and supporting cover replacement/removal via `coverRemoved`) and publishes a signed `post-edits` log entry pointing the post to the updated BLAKE3 hash.
    * `articlesPage.ts` now resolves `freenet.postEdit` captions and displays `Edited` badges in both the list and Reader; clicking the Edit button on an article card in the main Feed now opens the full Markdown Article editor instead of raw post text.
    * `freenet.deletePost` now also evicts `postId` from `peerCache` so deleted articles/posts do not reappear in Articles or Explore.

  * **NEW** Greenhouse Proposal Sharing & Permalinks (`ui/src/greenhouse.ts`, `ui/src/greenhousePage.ts`, `ui/src/main.ts`, `ui/src/caption.ts`, `ui/src/style.css`, `ui/tests/greenhouse.test.ts`, `ui/tests/caption.test.ts`):
    * Added dedicated "Share" action buttons to all Greenhouse proposal and bug report cards.
    * Generates shareable permalinks (`#greenhouse&seed=<author:id>`), copies them to the clipboard with instant visual confirmation (`✓ Copied!`) and toast notifications, and invokes the native mobile share sheet when available.
    * Added deep linking navigation support: opening a `#greenhouse&seed=...` or `#seed=...` link automatically opens the Greenhouse rail page, loads the proposal log, scrolls directly to the targeted seed card, and applies a smooth notification flash highlight.
    * Enhanced caption and chat linkification in `caption.ts` and `main.ts` so shared Greenhouse links automatically format as clean `↪ Greenhouse proposal` link pills.

5.7.0 / 2026-11-14
==================

  * **PERF / UI** Performance & Design Tokens (`ui/src/style.css`, `ui/src/main.ts`):
    * Added standardized spacing (`--space-*`), radius (`--radius-*`), focus-ring (`--focus-ring`), and motion (`--ease-out`, `--dur-fast`) tokens, unified `:focus-visible` outlines, subtle button `:active` press feedback, and `content-visibility: auto; contain-intrinsic-size: auto 320px` on `.gram-card`, `.article-feed-card`, `.music-release-card`, `.comm-thread-card`, and `.moment-tile`.
    * Added `scheduleRenderTimeline()` (`requestAnimationFrame` coalescing) in `main.ts` to batch burst background updates.
    * Code-split secondary rail views (`treePage.ts`, `musicPage.ts`, `articlesPage.ts`) via dynamic `import()` to reduce initial boot bundle size.
    * Added `loading="lazy" decoding="async"` to dynamically rendered feed, avatar, video poster, chat, and profile `<img>` tags.

  * **FIX** Music Tracklist Waveform Overflow on Mobile (`ui/src/style.css`):
    * Constrained `.music-waveform` (`min-width: 0; overflow: hidden`) and `.music-track-title`, and stacked `.music-track-info` cleanly on `<= 640px` so waveforms no longer overlap track durations or `+ Queue` buttons.

  * **UI** Frameless Rail Pages (`ui/src/style.css`):
    * Removed the outer `.modal-card` box (`background`, `border`, `border-radius`, `padding: 24px`) from `.rail-page .modal-card` so Activity, Moments, Communities, Articles, Music, Tree, Greenhouse, and Settings use the full column width without wasted box padding.

  * **UI** Compact Mail Header Icons (`ui/index.html`):
    * Made `#mail-new-btn` (Compose) and `#mail-tokens-btn` (Tokens & Keys) icon-only in the Radica Mail header and replaced the lock icon with a key icon.

  * **FIX** Radica Mail Contacts Persistence & Peer-to-Peer Inbox Addressing (`ui/src/durable.ts`, `ui/src/mailClient.ts`, `ui/src/main.ts`):
    * Added `radica_fmail_contacts_` and `radica_fmail_aft_assignments_` to `DURABLE_PREFIXES` in `durable.ts` (previously mismatched as `radica_mail_contacts_`), ensuring saved Mail contacts survive sandboxed refreshes, and flushed durable storage immediately when adding contacts.
    * Updated Radica Mail display, clipboard copy, and `myFullAddress` to use the 44-character `inboxAddress` instead of the 36-character v2 `address`, fixing `"Stored in local mailbox."` when emailing between two Radica IDs.

  * **NEW** Mobile Profile Connections Tab (`ui/index.html`, `ui/src/style.css`, `ui/src/main.ts`):
    * Added a `🔗 Connections` filter tab inside `#uview-tabs` (shown on `<= 820px` viewports) so Linfa Tree and connected Freenet apps appear on demand without stacking at the bottom of the profile posts list.

  * **NEW** Settings Theme Selector, Durable UI Preferences & Docker Auto-Update (`ui/index.html`, `ui/src/main.ts`, `ui/src/durable.ts`, `attester/start.sh`, `attester/Dockerfile.freenet`):
    * Added an Appearance (`#theme-select`, Light / Dark) selector directly inside the Settings modal (`#identity-modal`).
    * Added `radica_theme`, `radica_accent`, `radica_fullwidth`, and `radica_lang` to `DURABLE_PREFIXES` in `durable.ts` and re-applied restored preferences after `durable.ready` in `main.ts`.
    * Updated `attester/start.sh` and `attester/Dockerfile.freenet` to handle Freenet self-update exit code `42` automatically (`freenet update` + relaunch).

  * **NEW** Curated Boards (CRUD) & Profile Moments / Video Channel (`TASK-007`: `ui/src/boards.ts`, `ui/index.html`, `ui/src/main.ts`, `ui/src/style.css`, `ui/tests/boards.test.ts`):
    * Added `#board-picker-modal` and `📌 Board` post action so users can create public or private curated collections, attach personal notes, edit board metadata/visibility, remove individual items, delete boards, and share `#board=<id>&author=<pubkey>` permalinks (rendered as clean summary cards in Feed and Profile).
    * Added `🖼️ Moments`, `📺 Videos` (YouTube-style Channel grid), and `📌 Boards` tabs inside `#user-profile-modal` (`#uview-tabs`) with full local/AI/curator moderation filtering.

  * **NEW** Music · FreeTunes Stream & Persistent Global Audio Mini-Player (`TASK-008`: `ui/src/audioPlayer.ts`, `ui/src/musicPage.ts`, `ui/src/freetunes.ts`, `ui/index.html`, `ui/src/main.ts`, `ui/src/shortcuts.ts`, `ui/src/style.css`, `ui/tests/audioPlayer.test.ts`):
    * Added `#music-modal` (`#open-music-btn`, shortcut `g y`) displaying releases from FreeTunes' public directory (`freenet.freetunesDirectory()`) in a SoundCloud-style stream with cover art, deterministic waveform tracklists, search, `Following Artists` filter, `Share` to Feed, and `Hide Artist` moderation.
    * Added a persistent docked `#global-audio-player` bar (Play/Pause, Prev/Next, Seekbar, Volume, Queue count) that keeps playing uninterrupted across all Radica views while pausing any inline feed players.

  * **NEW** Vertical Short-Video Reels inside Moments (`TASK-006`: `ui/src/reels.ts`, `ui/src/reelsPlayer.ts`, `ui/index.html`, `ui/src/main.ts`, `ui/src/style.css`, `ui/tests/reels.test.ts`):
    * Added a `🎬 Reels` filter mode inside `#media-modal` (Moments) with a vertical video player, `↑`/`↓` keyboard and button navigation, mute toggle, likes, comments, `radica-video-blob:` support, and full local/AI/curator/manual moderation.

  * **NEW** Long-Form Articles & Decentralized Newsletters (`TASK-004`: `ui/src/articles.ts`, `ui/src/articlesPage.ts`, `ui/src/durable.ts`, `ui/index.html`, `ui/src/main.ts`, `ui/src/shortcuts.ts`, `ui/src/style.css`, `ui/tests/articles.test.ts`):
    * Added native long-form Markdown publishing and reading on Freenet without modifying `radica_contract.wasm`: full `ArticlePayload` JSON objects are stored via `media-contract` (`radica-article:<hash>`) and linked from signed `"thought"` posts.
    * Added `#articles-modal` rail page (`#open-articles-btn`, shortcut `g a`) with **All Articles**, **Following**, **My Articles**, and **Drafts** filters, live search, a distraction-free **Reader** view (supporting `#article=<postId>&author=<pubkey>` permalinks), and a **Markdown Composer** with cover image upload, Write/Preview tabs, and live reading-time calculation.
    * Registered `radica_article_drafts_` in `durable.ts` so article drafts survive browser reloads.
    * Integrated **Newsletter Dispatch via Radica Mail** (`mailClient.ts`), allowing authors to send published article summaries and permalinks directly to selected Radica Mail contacts.

  * **NEW** Freenet Mail Contacts Management & Address Book (`ui/index.html`, `ui/src/mail.css`, `ui/src/mailClient.ts`, `ui/src/main.ts`, `ui/tests/mailClient.test.ts`, `ui/tests/templateNesting.test.ts`):
    * Added a dedicated **Contacts** folder (`#mail-folder-contacts-btn`, `#mail-contacts-badge`) in the Radica Mail folders sidebar displaying the total count of saved contacts.
    * Implemented the **Address Book** view (`#mail-contacts-view`, `#mail-contacts-list`, `#mail-contacts-add-btn`) allowing users to view, search, and manage all saved contacts with names, handles, and monospace contact tokens/addresses.
    * Added complete contact card actions:
      * ✉️ **Send**: Opens the compose editor pre-filled with the recipient's address and handle.
      * 📋 **Copy**: Copies the 44-character contact token or inbox address directly to clipboard with visual confirmation.
      * 🗑️ **Delete / Remove**: Removes contacts from local storage (`deleteMailContact`) with immediate UI update, badge decrement, and feedback toast.
    * Integrated inline 1-click contact deletion (`.mail-suggestion-del-btn`) directly within the Compose recipient auto-complete dropdown (`mail-to-suggestions`).
    * Added full test coverage in `ui/tests/mailClient.test.ts` and `ui/tests/templateNesting.test.ts`.

  * **FIX** Native Freemail Interoperability: Direct Reply Routing via Inbox Contract Token (`ui/src/mailClient.ts`, `ui/tests/mailClient.test.ts`):
    * Resolved an issue where replying to a Radica email from the official Freenet Mail app failed because Radica set its unencrypted payload `from` field to a local persona alias (`"usernickname"`).
    * When sending to native Freenet Mail contracts, Radica now populates `from` with the sender's 44-character native inbox contract instance ID (`identity.inboxAddress`), allowing official Freenet Mail to auto-populate its recipient field on Reply and route replies directly back to Radica without requiring manual address replacement.
    * Updated `resolveFreemailSenderAddress` to handle bare 43..44 character contract IDs cleanly as `user@<inboxAddress>` rather than duplicating `<inboxAddress>@<inboxAddress>`.
  * **FIX & UI** Responsive Wall & Profile Modal for 13.3" Laptops & Compact Viewports (`ui/src/style.css`, `ui/tests/templateNesting.test.ts`):
    * Resolved layout overcrowding and clipping on 13.3" laptop screens (effective viewport ~1093×614 or 1280×720) where `.uview-modal-card` took 100% width against the left rail and the tall Linfa plant illustration clipped downstream cards (e.g. River broadcast channel).
    * Added fluid responsive sizing under `@media (max-width: 1200px)`: `.uview-modal-card` scales to `min(920px, calc(100vw - 80px))` with compact padding (`18px 20px`), layout gap drops to `16px`, and the right column drops to `260px`.
    * Compact Linfa sidebar presentation: `.uview-aside-col .linfa-pot` is scaled down to `110px–130px` (from `190px`) with compact typography and padding so cards below Linfa remain visible.
    * Added `@media (max-height: 800px)` breakpoint converting `.uview-aside-col` to `position: static` so users on shorter screens can scroll naturally to all cards without bottom cards getting stuck offscreen.

  * **FIX** Living Tree (`#tree-modal`) 'Watch Grow' Animation & Timeline Staggering (`ui/src/treeGraph.ts`, `ui/src/treePage.ts`):
    * Resolved an issue where clicking `▶ Watch Grow` caused the time scrubber to scan while the tree visual remained frozen in its initial state and abruptly popped in all branches at the final frame.
    * Removed ancient static genesis timestamps of seed communities (such as the default 2024 date) from activity timeline calculation (`minTs` / `maxTs`), ensuring timeline bounds match actual post/comment timestamps.
    * Added rank-staggered post revelation (`postAppearThresholdMap`) that blends chronological timestamp with rank fraction, so posts (including batch-imported or same-timestamp posts) sprout progressively in order across the growth sequence instead of clustering.
    * Added botanical growth scaling: the trunk rises and thickens (`trunkHeightScale`, `trunkGirthScale`), boughs extend outwards into the canopy, underground roots branch into the soil, and comment leaves unfurl along each post's branch as it matures.
    * Added snapshot caching and natural cubic ease-in-out interpolation in `startGrowthAnimation` to ensure smooth 60 FPS animation without redundant per-frame Web-of-Trust recalculations.
  * **NEW** Shareable User Wall Permalinks (`#user=<pubkey>` / `#wall=<pubkey>`) & Wall-First Two-Column Profiles (`ui/index.html`, `ui/src/style.css`, `ui/src/caption.ts`, `ui/src/main.ts`):
    * Redesigned `#user-profile-modal` into a wider two-column layout (`.uview-layout`) that renders a user's **Wall** (`Posts` / `Reposts` as full-width feed-style cards) upfront on the left and moves **Linfa**, channels, and connected Freenet app cards into a sticky `.uview-aside-col` sidebar on the right.
    * Added **Share Wall** (`#uview-share-wall-btn`), **Share my Wall** (`#pp-share-wall-btn`), and **View in Feed** (`#uview-open-wall-feed-btn`, `openAuthorWallInFeed`) buttons to copy direct `#user=<pubkey>` links or open any author's Wall straight in the main timeline.
    * Updated `caption.ts`, `openPostLink()`, and `checkUrlPostHash()` so `#user=<pubkey>` and `#wall=<pubkey>` links resolve on startup/hashchange and format cleanly as `↪ <Name>'s Wall`.
  * **FIX & UI** Consistent, Decluttered Left Navigation Rail & Settings Hub (`ui/index.html`, `ui/src/style.css`, `ui/src/main.ts`):
    * Fixed a CSS bug where desktop `.rail` height capping (`max-height` + `overflow-y: auto`) only applied on Chat/Mail views while every other tab let `.rail-btn` items expand beyond viewport height, pushing bottom buttons like **Settings** off-screen. All desktop tabs now share identical compact `52px` `.rail-btn` sizing (`flex-shrink: 0`) and viewport-bounded internal scrolling.
    * Decluttered the primary rail by keeping core social & navigation views (`Feed`, `Chat`, `Mail`, `Activity`, `Moments`, `Tree`, `Communities`, `Greenhouse`, `Settings`) visible upfront and grouping secondary/illustrative utilities (**Identity**, **Blocklists**, **Updates**, **Guide**) inside `#rail-utility-group` (toggled via the desktop/mobile `More` button) plus a new **Account, Safety & Guide** 2×2 quick-navigation hub inside `#settings-modal`.
  * **NEW** Dedicated Reddit-Style Communities (`r/slug`) Page (`#communities-modal`, `ui/src/communitiesPage.ts`): added a dedicated full-column Communities forum view accessible from the left rail (`Communities`, shortcut `g r`) and the feed's community banner (`Reddit View`), featuring left upvote/downvote score gutters (`computeNetScore`), `Hot` / `New` / `Top 24h` / `Top 7d` / `Top All` sorting, thread flair filters (`Discussion`, `Media`, `Event`, `Poll`), `Card` / `Compact` density modes, inline thread composer & collapsible comment threads, and a right-hand `About Community`, `Etiquette`, `Moderators`, and `Communities Directory` sidebar — keeping main feed community browsing completely intact.
  * **NEW** Living Tree (`#tree-modal`, `treeGraph.ts`, `treePage.ts`): added an interactive botanical network visualization & navigator accessible from the left rail (`Tree`), keyboard shortcut (`g f` / `g l`), the feed header roots counter, and the Milestones modal.
    * **Organism Evolution**: Computes a live network vitality score across discovered personas, communities, posts, and comments, evolving the tree from `Seed` → `Sprout` → `Sapling` → `Young Tree` → `Canopy Tree` → `Ancient Yggdrasil`.
    * **Botanical Social Mapping**: Personas grow underground as Web-of-Trust tiered roots (pulsing on 24h activity), communities (`r/slug`) and categories form upper boughs, posts branch out as buds/fruits (with blooms on high engagement), and comments sprout as clickable leaves along each post's branch.
    * **Visual Navigation & Time-Lapse**: Includes `Full Tree`, `Canopy`, and `Roots` lenses, `All Network` / `Following` scope filtering, community selector, live search highlighting, animated `▶ Watch Grow` timeline scrubber, pan & zoom canvas, animated sap filaments connecting roots to authored branches/leaves, and an Inspector side panel to open posts, profiles, and communities directly.

5.6.0 / 2026-11-14
==================

  * **NEW** Open Greenhouse Proposals & Voting via Sybil-Resistant Linfa:
    - **Zero-Cost Community Governance**: Users who grow their Linfa plant to at least **Sapling** (12+ points) can now plant proposals/bugs and vote in **🌱 Greenhouse** without needing a paid Base Supporter badge or Freenet GhostKey.
    - **Sybil-Resistant Weight (`linfaGreenhouseWeight` in `ui/src/linfa.ts`)**: Ignores Tier-0 strangers, enforces `MIN_TRUSTED_RECEIVED = 2` (requiring replies, likes, or reposts from the reader's web of trust), and caps unilateral `given` (`3×`) and `posting` (`2×`) relative to trusted feedback received — blocking unilateral farming and stranger Sybil rings.
    - **Balanced Governance Weighting (`foldGreenhouse` in `ui/src/greenhouse.ts`)**: Computes each participant's weight as `Math.max(tierWeight, linfaWeight)` (Sapling / Young tree `1`, Tree `2`, Elder tree `3`; alongside Sprout `1`, Root `2`, Oak / GhostKey `3`).
    - **UX & In-App Guide (`ui/index.html`, `ui/src/greenhousePage.ts`, `ui/src/main.ts`)**: Updated the Greenhouse gate with live Linfa progress (`stage`, `current / 12 Linfa`), weight legends, and the Guide's `Linfa and reposts`, `Supporter badge`, and `Greenhouse` sections.
  * **ARCHITECTURE & NEW** Dual Private Room Architecture (Native Default + River Interoperability):
    - **Native Radica Rooms & Channels by Default**: `createPrivateRoom()` now creates end-to-end encrypted native Radica rooms (`AES-256-GCM` symmetric room key wrapped with `X25519 ECIES` and signed via `formatPrivateRoomSignatureMessage`) on Radica's `log-contract` by default (`opts.river` false/omitted), isolating new rooms from external River WASM re-keys while preserving Viso delegation compatibility.
    - **Stop Automatic River Migration**: Removed `moveToRiver()` and the automatic background sweep in `getPrivateRooms()` that previously migrated native rooms into River contracts (`movedToRiver()` remains only to hide legacy pre-migrated descriptors).
    - **Opt-In River Interoperability**: Added the `#privroom-river-check` checkbox (`🌊 Interoperable River Room`) in `#create-private-room-modal`, gated `#privroom-public-check` to public River channels, matched linked discussion room backend on channel info drawers (`{ river: !!st.privateRoom.river }`), and avoided initializing `river-wasm` in `syncRiverRooms()` unless River rooms are present.
    - **Native Channel & Linked Discussion Invites**: Extended native room invite links and `parseRoomInviteParams` with `lr_key` (`linked_key_hex`) so joining a native broadcast channel also joins its linked discussion room in one step, and enforced creator/moderator sender filtering in `getPrivateRoomChatMessages` via `filterChannelMessages()`.
  * **FIX** Persistent multi-group chat pinning: resolved an issue where pinning multiple group chats or channels would only retain 1 pinned group on app restart. Removed legacy migration shortcuts that clobbered durable delegate state, ensured `getPrivateRooms()` waits for `restoreRoomsFromNode()` before returning rooms, awaited `durable.ready` during inbox build, and immediately flushed durable storage on pin toggles and `pagehide`/`visibilitychange` events.
  * **FIX** Mobile message swipe-to-tag conflict: swiping right on an incoming chat message row to mention/tag someone in the input field on mobile (Android) now cleanly populates `@Author` into the composer without triggering stage-level back navigation to the conversation list. Excluded message rows and composer areas from back swipe gestures and cancelled stage swipe state during active message swipes.
  * **UI** Unified sidebar rail and page/modal header iconography: aligned mismatched SVGs (`Updates`, `Greenhouse`, `Guide`, `Moments`, `Welcome`, `Milestones`), added missing header icons (`Messenger Chat`, `Profile`, `Create Community`), and wrapped dynamic titles (`#blocklists-modal-title`, `#create-comm-title`) in `<span>` elements so updating titles never strips the `<svg>` icon.
  * **UI** Redesigned the Moments (`#media-modal`) page with a structured header and live counter pill, a cleaner card-style quick-post composer, filter tabs (`All Moments`, `Photos`, `Videos`, `Following`), and spaced media cards displaying author avatars/names, caption snippets, multi-photo indicators, frosted like pills, comment counts, and an illustrated empty state.
  * **FIX** Moments media grid now shows videos again. They were filtered out by an accidental `!videoRef` check; they now render with their poster and a Play button, same as the main feed.
  * **FIX** Tapping Play on a video in the Moments grid opens it full-screen (lightbox) instead of playing it cropped inside the small tile.

5.5.0 / 2026-11-14
==================

  * **FIX** Lightbox caption now sits below the photo on desktop as well as mobile, aligned center underneath the image.

5.4.0 / 2026-11-12
==================

  * **FIX** Moments quick post bar: after publishing a moment from the Moments media grid the take/choose/caption bar no longer vanishes — it resets and stays open so you can post again without reopening the modal.
  * **FIX** Moments grid photos: removed the white border around thumbnails.
  * **FIX** Moments likes on mobile: the like button is now always visible on touch devices (it was hover-only, so invisible and untappable). The second tap also un-likes correctly — the handler re-reads the current post instead of a stale reference.
  * **NEW** Composer unification: the feed composer is now reused for Moments. Thoughts, Moments and Events all share one composer card with identical styling, so posting looks the same for every post type. The Moment tab only toggles the media and file inputs inside the shared card; no separate moments composer exists any more.
  * **MOVED** Media Explore to sidebar: the Media scope has been moved from the feed scope bar to the left rail (More menu, shortcut **g v**). It opens an Instagram-style thumbnail grid of all network images and videos. The feed scope bar is now shorter on mobile (no Media button). Category filters stay in the feed; in Media view they are hidden automatically since only media posts are shown.

5.3.0 / 2026-11-11
==================

  * **FIX** Mail send timeout & local save + signature confirmation: sending to a native Freenet Mail contract (43-44 char inbox address) no longer times out while fetching WASM code; failed network delivery now always saves the message locally to Sent. Added an explicit "Sign & Send" confirmation before dispatch so you know the message will be signed with your ML-DSA-65 key — matching native Freemail's UX.
  * **FIX & NEW** Native Freenet Mail Network Delivery & Token Interoperability:
    - **Live Network Dispatch**: Fixed an issue where emails sent from Radica to native Freenet Mail (v0.2.x) accounts remained only in local storage. Radica now performs real post-quantum cryptographic network dispatch via `freenet.updateAppContract` directly into the recipient's Inbox contract on the Freenet network, using ML-KEM-768 key encapsulation, HKDF-SHA256, XChaCha20-Poly1305 payload encryption, ML-DSA-65 signatures, and `UpdateInbox::AddMessages` deltas.
    - **Native Inbox Contract ID (44 chars)**: Deterministically derives and exposes the official 44-character Base58 `ContractInstanceId` (`deriveInboxContractAddress`), resolving the format rejection errors reported when attempting to send from native Freemail into Radica using 36-character addresses.
    - **Contact Card Tokens & BIP-39 Verification Words**: Formats and exposes the official Contact Card token (`<inboxAddress>\nverify: <words>`) and 6-word BIP-39 fingerprint matching native Freemail (`deriveFingerprintWords`), including the 3-word short key displayed in native Freemail's footer (`key: word1-word2-word3`).
    - **Tokens & Keys Modal**: Added a dedicated "Tokens & Keys" modal accessible from the Mail header and Identity & Key Management, offering 1-click copying for Native Inbox Address, Contact Card Token, Verification Words, Radica Address (v2), Recovery Key (`fmail-key-1:`), and Backup JSON download.
    - **Inbox Network Sync**: Added `syncFreenetMailInbox` wired to the Mail Refresh button to fetch and decrypt incoming messages from the user's native inbox contract on Freenet.
    - **Fixed UPDATE key construction**: Outgoing delivery was rejected by the node (`ContractKey.code must be the 32-byte contract code hash; got 0 bytes`) because the UPDATE's `ContractKey` carried only the recipient's instance id. It is now built with `new ContractKey(instance, code)`, pairing the instance id with the inbox contract's code hash (`INBOX_V1_CODE_HASH`), matching how a `GET` can resolve by instance alone but an `UPDATE` cannot.
    - **Fixed misleading send toast**: when real network dispatch threw (e.g. a node timeout), `sendMailMessage` still returned `success: true`, so the toast read `✓ Mail sent (Network dispatch note: Request timeout)` — a checkmark next to an error. The toast now shows a `⚠` warning and "network delivery failed" wording for actual dispatch errors, while still showing the `✓` for benign cases (stored locally, recipient inbox not found/offline).
    - **Fixed sending to native Freemail always timing out**: the GET of the recipient's inbox contract before sending asked only for its *state* (`fetchContract: false`), never its code. Reading state doesn't need the code, but the following `UPDATE` does (the node must run `update_state` against it), and a native Freemail inbox is a contract this node never held before, so it had no code cached to run — stdlib's own 30s `Request timeout` fired on the `UPDATE`. `getRaw`/`getByInstance` now take a `fetchCode` flag, and `sendMailMessage` passes it on the recipient lookup so the node fetches and caches the inbox contract's WASM before the delta is sent.
    - **Fixed that the fix above had no effect**: `sendMailMessage` calls `getContractFn.call(freenet, id, true)`, where `getContractFn` resolves to `FreenetClient.appContract` (`freenet` itself has no `getByInstance`, only its private `net` does), and `appContract(instance)` took no second parameter — so the `fetchCode` flag never reached `FreenetNetwork.getByInstance`. `appContract` now takes and forwards it too.
  * **FIX** Freenet Mail alias reverting to `user_…` on refresh: `renderIdentityModal()` derived and cached the Freenet Mail identity from `currentIdentity.pubkey`'s saved alias *before* `await durable.ready`, i.e. before the sandboxed page storage had restored it from the node — so it cached the `resolveMailAlias` fallback for the rest of the session even after the real alias loaded. It is now rendered after `durable.ready` resolves.
  * **NEW** AI Moderation Helper: Holds, Second Opinion & Per-Category Circuit Breaker (`attester/src/moderator.js`, `main.js`; `ui/src/logfold.ts`, `freenet.ts`, `main.ts`):
    - **Holds**: a report for `threat`, `illegal` or `doxxing` (and `scam` only at `confidence: "high"`) now also **holds** the post — hidden at once, no timeout, for everyone following Radica's moderation (`freenet.aiHeldTargets()`, `logfold.ts`'s `foldAiHolds`), while the author still sees their own post. `spam` is never held. The hold is a flag (`hold: true`) on the bot's own signed `reports` log entry, never a blocklist action: its key stays a non-moderator with no power beyond that one entry.
    - **Second opinion**: before holding (never before reporting), the bot re-asks the model about that post alone and only holds if it still names the same category (`confirmsHold`), so a post cannot talk the model into holding the ones batched next to it.
    - **Category circuit breaker**: each hold's eventual moderator outcome (a `report`/Remove = confirmed, a `dismiss`/Dismiss = false positive, read from the maintainer's and moderators' own blocklists, same as Radica's own queue) is folded into per-category stats; once at least 3 of a category's holds are decided and half or more were dismissed, the bot stops holding for that category — reports only — until the ratio changes (`categoryDisabled`, `recordHoldOutcome`, `holdOutcome`).
    - **Retraction**: a held post that gets edited is judged again (unchanged behavior); if it no longer deserves the flag, the bot retracts its report and hold together (`retractBody`, `{on: false}`).
    - **Moderation queue**: held items sort first and carry a `⏸ held by the AI helper` label; Dismiss lifts a hold, Remove replaces it with the moderator's own permanent one.
    - New settings: `MOD_DAILY_HOLDS` (default 5), `RADICA_MAINTAINER`/`RADICA_DEFAULT_MODS` overrides for whose blocklists decide outcomes.
  * **NEW** Guide: documented every contract and delegate Radica talks to on Freenet, in a new "Contracts Radica uses on Freenet" section, with the actual BLAKE3 code hash of each of Radica's own (social, media, log contracts; PoW, GhostKey and River bridge/room delegates — each hash tracks the bundled WASM, so it changes on rebuild) and the external Freenet apps it reads or writes (Viso, FreeNames, Fisherman's Horizon, FreeTunes, FreePolls, Asocial, Freetree, Delta, Orto, River, Freenet Mail).
  * **FIX** Deleted mail came back on refresh: `deleteMailMessage` removed a message from the local store but left no record of it, so the next `syncFreenetMailInbox` (the Mail Refresh button) re-imported it from the network inbox contract, which still holds every message ever sent to it. Deleted ids are now remembered (`radica_fmail_deleted_`, a durable key) and skipped on sync.
  * **FIX** Spore Radio's "Tune In on Spore" did nothing, or showed WebView2's blocked-content page, on the desktop app: the link used a plain same-window `<a href="spore:radio:...">`, which the desktop shell's `with_new_window_req_handler`/`window.open` hand-off never sees. It now opens via `target="_blank"` like other external links, and the desktop shell (`apps/desktop/src/web.rs`) specifically allows the `spore:radio:` scheme through to the OS alongside `http(s)`.
  * **FIX** Desktop chat/Mail page could scroll past the viewport: the icon rail (now 11 buttons: Settings, Mail, Spore, ...) is taller than one screen, and nothing bounded it, so on desktop it stretched the whole layout grid instead of just the chat/Mail pane scrolling internally. The rail now gets its own `max-height` and `overflow-y: auto` while chat or Mail is open on desktop, mirroring the rule already in place for phones.
  * **NEW** Spore Radio Integration & Live Presence Cards: Added interactive Spore Radio cards (`sporeRadio.ts`) in timeline posts and chat when sharing `spore:radio:<key>` links. Detects decentralized DJ broadcast heartbeats in real time: stations broadcasting within the last 60 seconds display a pulsating `🔴 LIVE NOW` badge with live station title, DJ handle and currently playing track. Stations offline show a clean `⚪ OFFLINE` indicator with no dead links. Built for 4-slot ring buffer live audio streams with zero network bloat.
  * **NEW** Repost Counter on Post Cards: Posts now display the live count of reposts received on their action bar (e.g. `🔁 3 Reposts`) alongside Likes, Dislikes, and Comments. The repost action button dynamically highlights in emerald green when the active user has reposted the post.
  * **NEW** Freenet Ecosystem & Affiliated dApps: Added Spore (sovereign P2P desktop music client by @scobru) to the ecosystem apps registry and Updates explorer. Introduced an 'Affiliated App' badge distinction for independent sovereign companion applications built on Freenet alongside direct timeline integrations.
  * **NEW** Freenet Mail Contact Token & Import Support: Radica Mail now accepts official Freenet Mail Contact Tokens (43-44 char Base58 keys exported from Freenet Mail's Share screen) directly in the recipient "To:" field (`alias@<token>` or bare `<token>`), as well as raw 64-hex keys and standard 36-char Base58 addresses. Added a dedicated "➕ Add Contact" modal and compose dropdown action allowing users to import external Freenet Mail contacts with custom nicknames and tokens. Sent messages automatically learn and register contacts in the address book for future autocomplete.
  * **FIX** Mail Notification Persistence & Welcome Mail Duplication: Resolved an issue where the welcome mail notification re-appeared unread on every page refresh. Registered `radica_fmail_store_`, `radica_mail_alias_`, `radica_mail_contacts_`, and `radica_mail_welcomed_` as durable keys in `durable.ts` and `storage.ts` so they persist to the Freenet node's delegate across sandboxed sessions. Assigned a deterministic ID (`welcome_radica_mail`) with a permanent welcome guard, awaited `durable.ready` before badge sync on boot, and updated Activity's "Mark all read" to synchronize mail read states.

  * **NEW** Organic Linfa Seasons & Inactivity Dormancy: Botanical vitality model reflecting user presence without punitive streaks. Active personas (activity <= 7 days) flourish in Spring with vibrant leaves, `.fresh` weekly growth and elder tree blooms. Inactivity between 8 and 30 days gracefully transitions the plant into warm Autumn hues (amber/bronze tones) with natural leaf shedding; past 30 days, the tree enters winter dormancy (bare sturdy wood branches and roots preserved, resting leaves on the soil mound). Earned Linfa total and structural tree growth are strictly permanent and never decay. Any activity (posting, commenting, liking) instantly awakens spring sap.
  * **FIX** Bio Textarea & Edit Profile Modal UX: Enlarged modal card width (540px), comfortable initial height (110px), unlocked vertical resize handle, auto-expanding text editor on open and user typing, and resolved top-line text clipping.
  * **NEW** Human-Readable Mail Identifiers & Address Book: Freenet Mail addresses are now human-friendly. Instead of defaulting to raw 44-character Base58 public keys, Radica derives the email alias directly from your profile name or FreeNames handle (`alias@<36-chars>`). Users can customize and save their Mail Handle anytime in Identity & Key Management. In Compose Mail, the "To:" recipient field now provides an interactive Address Book and autocomplete dropdown suggesting followed Radica peers, address book contacts, and self-testing. Incoming emails also feature a 1-click "+ Save to Contacts" button to quickly add senders to the local address book.
  * **FIX** Typography & Header Consistency: Unified typography across all pages and modals (Messages, Mail, Activity, Identity, Settings, Updates, Guide, Greenhouse, Blocklists, Shortcuts). Headings now consistently render in the warm Fraunces serif editorial display font (`var(--font-display)`) at a harmonized 1.35rem scale, resolving an issue where child text spans inside heading tags unintentionally fell back to sans-serif Inter.
  * **NEW** Mobile Mail Full-Screen & Navigation: Opening Freenet Mail on mobile now expands to 100% full screen (`position: fixed; inset: 0`), hiding the bottom navigation rail (matching Messages chat). The header features a clean top bar with an accessible ✕ close button to instantly return to the feed, responsive address badge, and smooth navigation gestures where the mobile/Android Back gesture steps from message detail back to the inbox list, then back to the timeline.
  * **NEW** Dedicated Settings & Preferences Page: Added a clean Settings view in the navigation rail (shortcut `g ,`) for frontend customization. Moves interface width, colour themes, translation language, offensive words masking, and notification audio chime controls out of the Identity modal into a dedicated preferences pane.
  * **NEW** Focused Identity & Key Management: The Identity view now strictly focuses on cryptographic persona details, Viso decentralized SSO, local key creation/import, Freenet Mail key derivation, and ZK supporter badges.
  * **NEW** Built-in Radica Mail Client: Dedicated Mail tab in the navigation rail (keyboard shortcut `g m`) featuring full split-pane Inbox, Sent, and Drafts management, real-time message search, unread badges, and responsive desktop/mobile viewports.
  * **NEW** Activity & Notifications Integration: Incoming and unread mails are hooked up to Radica's central activity notification stream. Features audio pop alerts, unread badges on both the rail and the Activity bell, browser title indicators, and actionable notification items (Open, Read, Delete) with automatic bidirectional read-state synchronization.
  * **NEW** In-App Reading & Replying: Read end-to-end post-quantum encrypted messages, compose new emails, reply with automatic `Re:` subject handling and threaded quote formatting, or save drafts locally.
  * **NEW** Freenet Mail Interoperability (Post-Quantum): Every persona automatically derives a deterministic Freenet Mail identity (ML-KEM-768 for message decapsulation and ML-DSA-65 for signing) from its master secret.
  * **NEW** Linfa: every profile grows a plant. Its Linfa is counted on the reader's node from the signed posts, comments and likes it holds, so nothing is stored and no score can be forged. Answering others counts more than posting, each act is weighed by the reader's Web-of-Trust (strangers are capped), and the plant grows from seed to elder tree with the last week's leaves drawn lighter. Each persona's plant takes its shape from their key.
  * **NEW** Reposts: a Repost button under each post shares it on your feed, with your own words if you add any. The shared post is drawn inside yours, its author is notified, and profiles have a Reposts tab. A repost is an ordinary post carrying the shared post's permalink, so the feed contract and its key are unchanged.
  * **FIX** Desktop app icon: radica.exe now carries Radica's icon, so Windows shows it in Explorer, on the window and in the taskbar instead of a blank one. The Linux window and the macOS app bundle have it too.
  * **NEW** Recovery Key & Backup Export: One-click export of `fmail-key-1:<base58>` recovery keys and `identity-backup-v2.json` files compatible with the official Dioxus Freenet Mail client (`contracts/facade`).
  * **NEW** Ecosystem Integration: Added Freenet Mail to companion apps footer and updates card with the official stable container contract (`122f6AR7PyF8d8mhczuNQM4xrLtBf5t8g2iB7PEVT7KC`).

5.2.0 / 2026-11-02
==================

  * **NEW** Secret Chats (Chat Segreta 🔐): 1-on-1 ultra-private chats with Ephemeral Per-Message Ratchet Key Derivation (Double Ratchet / Perfect Forward Secrecy). Even if long-term keys are compromised later, past messages cannot be decrypted. Secret chats are strictly single-device and never synced across other Viso devices.
  * **NEW** Disappearing Messages (Autodistruzione ⏱️): Configurable auto-destruct timer (Off, 10s, 30s, 1m, 5m, 1h, 24h). Messages display a real-time countdown badge and automatically disintegrate with animation and wipe from local storage once expired.
  * **NEW** Ephemeral Slot Ring Buffer: Bounded scratchpad storage on Freenet and local client, preventing unbounded log growth and overwriting old ciphertexts physically.
  * **NEW** Live P2P Read Receipts (✓✓): Double checkmarks turn emerald green (`✓✓`) in real time when read by the recipient.
  * **NEW** Live Typing Indicator: Displays peer typing status with animated pulsing dots in the header and composer.
  * **FIX** Mobile Chat Viewport: Hides bottom navigation rail and expands chat card to full 100dvh viewport height.

5.1.0 / 2026-11-02
==================

  * **NEW** Pinned Messages in Chat (📌): Pin critical announcements and messages to the top of any group, channel, or direct message with a quick-jump banner and pulse highlight.
  * **NEW** Shared Media Browser in Info Drawer: Dedicated tabbed browser for Photos/GIFs, Files, Audio memos, and Links with direct message jumping and instant on-device decryption.
  * **NEW** Message Editing (✏️): In-place editing for sent chat messages with E2EE re-encryption, optimistic UI updates, and an `· edited` indicator.

5.0.0 / 2026-11-01
==================

  * **NEW** Custom Group & Channel Avatars: Assign custom profile images to encrypted private rooms and broadcast channels directly upon creation or from the info drawer.
  * **NEW** Proof-of-Humanity & Progressive Trust: Anti-Sybil protection with on-device Proof-of-Work (PoW) and Web-of-Trust (WoT) reputation badges (🌿 Rooted, 🌱 Trusted, ✨ New).
  * **NEW** Differentiated Rate-Limiting: Trusted personas publish instantly; new personas solve a fast client-side PoW challenge with 15s rate-limiting.
  * **NEW** Following Feed WoT Inclusion: The Following timeline focuses on your trust network (direct follows and friend-of-friends).
  * **NEW** Community Trust Rules: Community founders can restrict thread creation to trusted members while keeping comments open to all.
  * **NEW** Telegram-style 1-to-many broadcast channels in Messenger and classic chat.
  * **NEW** Encrypted audio and document sharing with AES-256-GCM.
  * **NEW** One-click permalinks and decentralized post sharing.

4.2.0 / 2026-10-18
==================

  * **NEW** 100% Offline Deterministic SVG Avatars: eliminates external CDN failures (Dicebear) in sandboxed Freenet environments.
  * **NEW** Custom Avatar Upload: on-device canvas resizing and center-square cropping to 80x80 JPEG (~2 KB).
  * **NEW** Moments Photo Auto-Compression: downscales raw camera photos client-side to 360px JPEG (~2.5-3.8 KB).
  * **FIX** Hardened SafeStorage Persistence: strictly enforces 7,500-char budget to prevent Freenet parent shell's 8,192-char slice on `Ctrl+F5` hard reloads.
  * **NEW** Resilient feed trimming preserves recent posts and media across opaque-origin browser refreshes.

4.1.0 / 2026-10-18
==================

  * **NEW** End-to-End Encrypted Private Chatrooms: multi-user AES-256-GCM symmetric room keys with X25519 ECDH key distribution.
  * **NEW** Zero-Knowledge Private Room Invites: capability fragments (`#join_room=...`) for instant invite links.
  * **NEW** Private room and chat peer persistence across Freenet sandboxed iframe reloads.

4.0.0 / 2026-10-18
==================

  * **ARCHITECTURAL REWRITE**: complete migration to Freenet decentralized P2P social network.
  * Replaced legacy Express/MongoDB with Freenet WebAssembly state contracts (Rust `radica_contract.wasm`).
  * On-device AI image moderation via Desert Ant Labs (`@desert-ant-labs/moderator` running on LiteRT.js/WASM).
  * Automated PII redaction and text censorship for Credit Cards, IBANs, Tax IDs, and profanity.
  * Anti-flooding sliding-window rate limiting engine with 15-second cooldown timers.
  * Decentralized Communities (`r/slug`) with cryptographic moderator hierarchy.
  * Passwordless Ed25519 cryptographic personas and Viso / Whoiam single sign-on integration.

3.0.0 / 2019-06-27
==================

  * New features and some bug fixes
  * **NEW** One-One chat between users, Real-time notifications, User profile edit page.
  * More advance search and fast-communication using web-sockets.
  * Re-written for better code quality.
  * Both Instagram and Google OAuth working.
  * NEW Releases for MAC, Windows, Linux and Android devices.
  * Demo website changed to https://spruce.dancodes.online.
  * MongoDB host to be declared as env variable when not using on localhost. 
    `dbHost=host.com node ./bin/www`
  * A brand new developer API for officially accessing spruce from within.
  * Code of Conduct adopted.
  * Ownership transfered to the Dan-Divy Organisation [@dan-divy](https://github.com/dan-divy).
  * Sponsors and Backers are most welcome to support this growing project.  

2.0.2 / 2019-03-27
==================

  * Updated [README.md](README.md).
  * Added the basic api structure for likes and comments.
  * New AUTHORS file added.
  * View a post from its category.
  * **NEW** An electron.js file has been added for creating a desktop appilication. See ```release/spruce-linux-ia32``` for 32bit linux computers.

  Note: _Instagram OAuth2 is still disabled._

2.0.1 / 2019-03-22
==================

  * Disabled instagram oauth-2 api temporarily.
  * Added a README.md.
  * Users can tag a post as thought/events/moments.
  * Added a new search upload for uploading thoughts (text).

2.0.0 / 2019-03-20
==================

  * Add instgram oauth-2 api with the local authentication.
  * Added new upload and view feature.
