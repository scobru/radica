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
- **Mail Notifications** — integration with `NotificationItem` (type: `"mail"`) where unread emails trigger sound chimes, activity bell badges, and direct navigation into message view with bidirectional read status sync.

## Decisions

- Reposts live in the caption, not in a contract field (2026-11): a new `contract.wasm` moves every feed to a new key, and a field outside the signed message could be altered by any peer.
- Linfa is counted by each reader, not stored (2026-11): a stored counter is whatever its owner signs. There is no leaderboard: it would need every feed, and on a small network it discourages more than it rewards.
- Both chat views stay (Messenger and Classic, 2026-11): shared chat behaviour lives in Conversation state, not in either view.
- Supporter badges come only from the ZK flow (2026-11): the manual flow (direct ETH/BTC addresses, receipts signed by hand) is gone, so issuing does not depend on the maintainer. BTC donations are no longer offered; receipts issued before keep verifying.
- Durable keys travel in one package per persona, not one node entry per key (2026-11): the delegate cannot list its keys, and one read at sign-in is enough. On restore the page wins when it already holds a key; the node only fills in what is missing.
