5.3.0 / 2026-11-11
==================

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
