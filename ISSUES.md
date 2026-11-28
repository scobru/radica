# Radica Issues & Task Tracker

This file tracks active, planned, and completed tasks for Radica development.
Each non-trivial task or bug has a dedicated specification file in the `tasks/` directory.

---

## 📋 Task Index

| ID | Title | Status | Priority | File |
|---|---|---|---|---|
| `TASK-001` | Responsive 13.3" Laptop Layout for Wall & Profile Modal | 🟢 DONE | High | [`tasks/001-laptop-responsive-profile-wall.md`](tasks/001-laptop-responsive-profile-wall.md) |
| `TASK-002` | Fix Native Freemail Reply: Use Inbox Contract Token as Sender `from` | 🟢 DONE | High | [`tasks/002-freenet-mail-native-reply-token.md`](tasks/002-freenet-mail-native-reply-token.md) |
| `TASK-003` | Mail Contacts Management: Add & Remove Contacts from Address Book | 🟢 DONE | High | [`tasks/003-mail-contacts-management.md`](tasks/003-mail-contacts-management.md) |
| `TASK-004` | Long-Form Articles & Decentralized Newsletters (Substack / Medium) | 🟢 DONE | High | [`tasks/004-long-form-articles-newsletter.md`](tasks/004-long-form-articles-newsletter.md) |
| `TASK-006` | Short-Form Vertical Video & Video Channels (TikTok / YouTube) | 🟢 DONE | Medium | [`tasks/006-video-reels-and-channels.md`](tasks/006-video-reels-and-channels.md) |
| `TASK-007` | Curated Boards & Collections (Pinterest / Are.na) | 🟢 DONE | Medium | [`tasks/007-curated-boards-collections.md`](tasks/007-curated-boards-collections.md) |
| `TASK-008` | Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes) | 🟢 DONE | Low | [`tasks/008-social-audio-and-freetunes.md`](tasks/008-social-audio-and-freetunes.md) |
| `TASK-009` | Dedicated Events Calendar & RSVP System (Luma / Meetup) | 🟢 DONE | Low | [`tasks/009-events-rsvp-calendar.md`](tasks/009-events-rsvp-calendar.md) |
| `TASK-010` | Contract v2 (feed + log) migration | 🟡 IN_PROGRESS (done in code, pre-publish checks open) | High | [`tasks/010-contract-v2-migration.md`](tasks/010-contract-v2-migration.md) |
| `TASK-011` | Messenger UX on phones, WhatsApp-inspired | 🟢 DONE | Medium | [`tasks/011-messenger-whatsapp-ux.md`](tasks/011-messenger-whatsapp-ux.md) |
| `TASK-012` | Replace native confirm / alert / prompt with in-app dialogs | ⚪ TODO | Medium | [`tasks/012-in-app-dialogs.md`](tasks/012-in-app-dialogs.md) |

---

## 🌐 Social Hub Coverage & Expansion Roadmap

Radica's core vision is to serve as a **single decentralized Hub on Freenet** that brings familiar web social UX together without central servers.

### Already Covered
- **Twitter / X → Feed (`#feed-view`)**: Short-form *Thoughts*, Reposts, `#hashtags`, Polls, Events, and live search.
- **Instagram → Moments (`#media-modal`)**: Visual card gallery for photos and short videos with client-side compression and unified composer.
- **Reddit → Communities (`#communities-modal`, `r/slug`)**: Forum threads with upvote/downvote net scoring, `Hot`/`New`/`Top` ranking, flairs, and community moderation.
- **Telegram / Signal → P2P Chat**: DMs, E2EE Private Rooms & Broadcast Channels, Community Chats, and Secret Chats (TTL / burn).
- **Luma / Meetup → Events (`TASK-009`)**: Start/end with timezone, capacity and cover, signed RSVPs (`Going` / `Interested` / `Not going`), Upcoming list / month calendar, and reminders in notifications.
- **Email → Radica Mail**: Post-quantum encrypted email client (`ML-KEM-768` + `ML-DSA-65`) interoperable with native Freenet Mail.

### Planned (`TODO`)
1. **Substack / Medium (`TASK-004`)**: Long-form Markdown articles, drafts, and optional newsletter delivery via Radica Mail.
3. **TikTok / YouTube (`TASK-006`)**: Vertical short-video player in Moments plus `freenet-blob`-backed long-form video channels and playlists.
4. **Pinterest / Are.na (`TASK-007`)**: Public and private curated *Boards* displayed on User Walls with shareable `#board=...` permalinks.
5. **Spotify / FreeTunes (`TASK-008`)**: Persistent global audio mini-player, podcasts/audio posts, and FreeTunes companion integration.

---

## 🎯 Task Status Legend
- ⚪ `TODO`: Backlog / planned
- 🟡 `IN_PROGRESS`: Currently being worked on or verified
- 🟢 `DONE`: Implemented, tested, and documented in `CHANGELOG.md` & `updates.ts`
