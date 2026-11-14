# Radica — domain language

Terms the code and its reviews use. Keep them exact.

## Chat

- **Conversation** — one chat as the user sees it, named by its room id: a direct message (`<pk>:<pk>`, the two public keys sorted), a Secret Chat (`secret_…`), a private room or channel (`priv_…`, `privroom_…`, River), or a community chat (`comm_…`).
- **Conversation state** — the module that answers, for a conversation, everything that is not the message text: when each message burns, how far each side has read, who is typing, the TTL in force. Both chat views (Messenger and Classic) read it; neither keeps its own copy.
- **Read mark** — how far *I* have read a conversation (a timestamp): the later of this device's mark and the one my other devices left in my inbox log. Unread = messages from others after it. A conversation never read counts from its start if it is a direct message or Secret Chat (someone wrote to me), and counts nothing if it is a room or community (its history is not news; joining one gives it a read mark of "now"). Kept by Conversation state.
- **Peer read mark** — how far *the other person* in a direct message or Secret Chat has read. Drives the ✓✓ "read" checks.
- **Secret Chat** — a one-to-one conversation encrypted with per-message ratchet keys, stored only on this device.
- **Secret Chat transport** — the module (`secretChatTransport.ts`) that stores, sends, reads and burns Secret Chat messages. It needs only page storage, the blocklist, a room's stored messages and "deliver to these inboxes"; the crypto stays in `secretChat.ts`.
- **TTL** — the disappearing-message timer of a Secret Chat, chosen from fixed presets (Off, 10s … 24h).
- **Burn** — destroying a message whose TTL has run out: removed from local storage and announced to the peer. A message burns when its time comes, whether or not its conversation is open.

## Device storage

- **Page storage** — `safeStorage`: the page's own key/value store. In Freenet's sandboxed shell it lives in memory, plus the URL hash, and a browser refresh keeps only the hash.
- **Durable key** — a page-storage key that must outlive a browser refresh. Declared once by prefix in `durable.ts` (`DURABLE_PREFIXES`); every write is copied to the node's delegate in one package per persona (`durable:<persona>`), and at sign-in the package fills in what the page lost.
- **Identity keys** — the local seed, the Viso session and the read keys. Needed before we know who is signing in, so they are kept on the node by their own code, outside the durable package.

## Supporters

- **Donation** — USDC sent to `RadicaSupport` on Base (`donation-contract/`). The contract forwards it to the treasury and adds the donor's Semaphore identity commitment to the group of its tier.
- **Tier** — Sprout ($1+), Root ($50+), Oak ($250+); one Semaphore group each.
- **Proof** (`RADICA-ZK-V1:` token) — a Semaphore proof that "an identity in this tier's group" vouches for one Radica public key (the proof's message), with the fixed scope `radica-supporter-v1`. Made on the donate page (`donate-app/`), outside Freenet.
- **Claim** — a proof published by its Radica key in the Freenet log `supporter-claims`.
- **Attester** — the bot (`attester/`) that checks claims on-chain and answers in the log `supporter-receipts`. Its key is one of the receipt issuers.
- **Receipt** (`RADICA-RECEIPT-V1:` token) — the tier of one Radica key, signed by a key in `RECEIPT_ISSUERS`. No transaction hash; issue time rounded to the day.
- **Supporters wall** — the public, opt-in list in the log `supporters`; each entry is a receipt published by the key it names.

## Feed

- **Repost** — an ordinary post whose caption carries the permalink of another post (`#post=<id>&author=<key>`), after the reposter's own words if any. The caption is signed, so the feed contract has no repost field. The reader's app draws the shared post inside the reposter's card (`repost.ts`).
- **Plain repost** — a repost with no words of its own. Reposting one shares the post it shares, not the repost.

## Linfa

- **Linfa** — how alive a persona's place in Radica is, as one reader's node counts it from the signed posts, comments and likes it holds (`linfa.ts`). Never stored, never signed: it is a count, so it cannot be forged, and two readers can get two values.
- **Act** — one thing that feeds a Linfa: a comment given or received, a like given or received, a repost received, a day posted. One answer counts per person and post.
- **Trust weight** — what an act is worth by the reader's Web-of-Trust tier of the other side: followed 1, friend of a friend ½, stranger ¼.
- **Stranger cap** — all that strangers give a persona, together, is worth at most 20.
- **Age** — the plant's stage for a Linfa: Seed, Seedling, Sapling, Young tree, Tree, Elder tree. Not the supporter Tiers (Sprout, Root, Oak): those are bought, these are grown.
- **Plant** — the SVG drawn for a Linfa (`plant.ts`). Its whole shape comes from the persona's key; the Linfa only says how far along its life it is, so it never reshuffles.
- **Fresh growth** — the leaves that appeared in the last seven days, drawn lighter.

## Mail

- **Radica Mail** — the built-in email client in Radica (`mailClient.ts`), offering split-pane inbox/sent/drafts management, live search, threading, and activity notifications.
- **Freenet Mail Identity** — deterministic derivation of post-quantum ML-KEM-768 and ML-DSA-65 keys from the user's secret persona key, matching the official `freenet/mail` standard (`fmail-key-1:...`).
- **Native Inbox Contract ID (v1)** — 44-character Base58 `ContractInstanceId` (`blake3(INBOX_CODE_HASH || params)`), which is what native Freemail v0.2.x expects in the "To:" field and Contacts import.
- **Freenet Mail Contact Token** — an exportable Contact Card string `<inboxAddress>\nverify: <word1-...-word6>` or 43-44 char Base58 contract instance ID. Radica Mail accepts tokens directly in the recipient field (bare or `alias@<token>`), parses them in contact imports, strips `verify:` clauses gracefully, and registers them in the local address book.
- **BIP-39 Fingerprint Words** — 6 English words extracted from `blake3(dsaVk || kemEk)` matching native Freemail's `fingerprint_words(&vk, &ek)`. The first 3 words form the short key displayed in native Freemail's footer (`key: word1-word2-word3`).
- **Mail Notifications** — integration with `NotificationItem` (type: `"mail"`) where unread emails trigger sound chimes, activity bell badges, and direct navigation into message view with bidirectional read status sync.

## Moderation

- **Hold** — a post the AI moderation helper (`attester/src/moderator.js`) hides at once, no timeout, for everyone following Radica's moderation, by flagging its own public report `{type: "report", target, hold: true}` on the `reports` log. Unlike an ordinary report, which only queues the post for a human, a hold acts immediately; the author still sees their own post (`freenet.aiHeldTargets()`, `ui/src/logfold.ts`'s `foldAiHolds`). Only for `threat`, `illegal`, `doxxing`, and `scam` when the model says `confidence: "high"`; `spam` is never held.
- **Second opinion** — before holding (never before reporting), the bot re-asks the model about that one post alone, so a post cannot talk it into holding the ones around it in the same batch (`moderator.js`'s `confirmsHold`).
- **Category circuit breaker** — once at least 3 of a category's past holds are decided and half or more were Dismissed (a false positive) rather than Removed (confirmed), the bot stops holding for that category, back to report-only, until a human's decisions change the ratio (`categoryDisabled`, `recordHoldOutcome`). Tracked per category in the bot's own state (`attester` data dir, `moderated.json`), from reading the maintainer's and moderators' own blocklists for a `report` (Remove) or `dismiss` (Dismiss) entry on each held target (`holdOutcome`).
- **Retraction** — if a held post is edited and the new text no longer deserves it, the bot publishes `{type: "report", target, on: false}` on its own next pass, lifting the hold and the report together.

## Decisions

- Freenet Mail v1/v2 Dual-Format Interoperability (2026-11): Native Freenet Mail (v0.2.x) runs on the v1 contract system and rejects 36-char compact addresses (`invalid inbox address`). Radica computes and displays both formats: the 44-char `ContractInstanceId` for native Freemail compatibility, and the 36-char address for Radica P2P.
- Live Network Mail Delivery (2026-11): Outgoing emails to 43..44 character inbox contracts fetch the recipient's contract state, encrypt the DecryptedMessage JSON via ML-KEM-768/HKDF-SHA256/XChaCha20-Poly1305, sign via ML-DSA-65, and dispatch directly to the Freenet node via `freenet.updateAppContract(key, delta)` with `UpdateInbox::AddMessages`.
- Unified Sidebar & Modal Header Iconography (2026-11): All navigation rail buttons use uniform `icon-md` SVGs that match their corresponding page/modal header SVG 1:1. Headers with dynamic text (`#blocklists-modal-title`, `#create-comm-title`) nest their label in a child `<span>` so DOM updates write to the span without wiping out the sibling `<svg>`.
- Moments Card Gallery (`#media-modal`) Architecture (2026-11): Media Explore uses a spaced card grid (`#media-grid-container.media-grid`) with client-side filter state (`all`, `photos`, `videos`, `following`), author attribution rows, caption previews rendered with `plainMentions`, and comment counts (`Object.keys(post.comments ?? {}).length`) while reusing existing post/contract storage.
- Settings separated from Identity (2026-11): UI preferences (layout width, themes, translation language, offensive words mask, audio sounds) live in their own Settings page, keeping Identity purely about cryptographic keys, Viso SSO and supporter proofs.
- Reposts live in the caption, not in a contract field (2026-11): a new `contract.wasm` moves every feed to a new key, and a field outside the signed message could be altered by any peer.
- Linfa is counted by each reader, not stored (2026-11): a stored counter is whatever its owner signs. There is no leaderboard: it would need every feed, and on a small network it discourages more than it rewards.
- Both chat views stay (Messenger and Classic, 2026-11): shared chat behaviour lives in Conversation state, not in either view.
- Supporter badges come only from the ZK flow (2026-11): the manual flow (direct ETH/BTC addresses, receipts signed by hand) is gone, so issuing does not depend on the maintainer. BTC donations are no longer offered; receipts issued before keep verifying.
- Durable keys travel in one package per persona, not one node entry per key (2026-11): the delegate cannot list its keys, and one read at sign-in is enough. On restore the page wins when it already holds a key; the node only fills in what is missing. Durable keys flush immediately on pin toggles and pagehide/visibilitychange, and private room getters await node restoration so multi-group pins persist reliably.
- Mobile stage navigation excludes message rows and composer areas (2026-11): swiping right on message bubbles to mention or tag a user never triggers back navigation to the conversation inbox.
- AI moderation holds are a flag on the bot's own report, not a blocklist action (2026-11): the bot's key stays a non-moderator with no power beyond its own signed entry, so a hold can only ever be as strong as one report, and a human's Dismiss/Remove on the same queue item resolves it exactly like any other report.
- Native Contracts Default & Dual Private Room Architecture (2026-11): Radica uses its own MIT-licensed native contracts (`contract`, `log-contract`, `media-contract`, `delegate`) for all core social/media/identity features as well as Private Rooms and Broadcast Channels by default (`AES-256-GCM` + `X25519 ECIES`, zero-knowledge `#join_room=...&lr_key=...` invites, Viso delegation, zero dependency on external River WASM re-keys). Automatic `moveToRiver` background migration is removed, while `river-wasm` remains intact as an opt-in / external interoperability bridge (`#privroom-river-check` and external River invite codes).
