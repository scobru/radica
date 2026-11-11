5.3.0 / 2026-11-11
==================

  * **FIX & NEW** Native Freenet Mail Network Delivery & Token Interoperability:
    - **Live Network Dispatch**: Fixed an issue where emails sent from Radica to native Freenet Mail (v0.2.x) accounts remained only in local storage. Radica now performs real post-quantum cryptographic network dispatch via `freenet.updateAppContract` directly into the recipient's Inbox contract on the Freenet network, using ML-KEM-768 key encapsulation, HKDF-SHA256, XChaCha20-Poly1305 payload encryption, ML-DSA-65 signatures, and `UpdateInbox::AddMessages` deltas.
    - **Native Inbox Contract ID (44 chars)**: Deterministically derives and exposes the official 44-character Base58 `ContractInstanceId` (`deriveInboxContractAddress`), resolving the format rejection errors reported when attempting to send from native Freemail into Radica using 36-character addresses.
    - **Contact Card Tokens & BIP-39 Verification Words**: Formats and exposes the official Contact Card token (`<inboxAddress>\nverify: <words>`) and 6-word BIP-39 fingerprint matching native Freemail (`deriveFingerprintWords`), including the 3-word short key displayed in native Freemail's footer (`key: word1-word2-word3`).
    - **Tokens & Keys Modal**: Added a dedicated "Tokens & Keys" modal accessible from the Mail header and Identity & Key Management, offering 1-click copying for Native Inbox Address, Contact Card Token, Verification Words, Radica Address (v2), Recovery Key (`fmail-key-1:`), and Backup JSON download.
    - **Inbox Network Sync**: Added `syncFreenetMailInbox` wired to the Mail Refresh button to fetch and decrypt incoming messages from the user's native inbox contract on Freenet.
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
