# Radica Issues & Task Tracker

This file tracks active, planned, and completed tasks for Radica development.
Each non-trivial task or bug has a dedicated specification file in the `tasks/` directory.

---

## 📋 Task Index

| ID | Title | Status | Priority | File |
|---|---|---|---|---|
| `TASK-001` | Responsive 13.3" Laptop Layout for Wall & Profile Modal | 🟢 DONE | High | [`tasks/001-laptop-responsive-profile-wall.md`](file:///d:/radica/tasks/001-laptop-responsive-profile-wall.md) |
| `TASK-002` | Fix Native Freemail Reply: Use Inbox Contract Token as Sender `from` | 🟢 DONE | High | [`tasks/002-freenet-mail-native-reply-token.md`](file:///d:/radica/tasks/002-freenet-mail-native-reply-token.md) |
| `TASK-003` | Mail Contacts Management: Add & Remove Contacts from Address Book | 🟢 DONE | High | [`tasks/003-mail-contacts-management.md`](file:///d:/radica/tasks/003-mail-contacts-management.md) |
| `TASK-004` | Long-Form Articles & Decentralized Newsletters (Substack / Medium) | 🟢 DONE | High | [`tasks/004-long-form-articles-newsletter.md`](file:///d:/radica/tasks/004-long-form-articles-newsletter.md) |
| `TASK-005` | Multi-Channel Community Spaces (Discord) | ⚪ TODO | High | [`tasks/005-multi-channel-communities.md`](file:///d:/radica/tasks/005-multi-channel-communities.md) |
| `TASK-006` | Short-Form Vertical Video & Video Channels (TikTok / YouTube) | 🟢 DONE | Medium | [`tasks/006-video-reels-and-channels.md`](file:///d:/radica/tasks/006-video-reels-and-channels.md) |
| `TASK-007` | Curated Boards & Collections (Pinterest / Are.na) | 🟢 DONE | Medium | [`tasks/007-curated-boards-collections.md`](file:///d:/radica/tasks/007-curated-boards-collections.md) |
| `TASK-008` | Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes) | 🟢 DONE | Low | [`tasks/008-social-audio-and-freetunes.md`](file:///d:/radica/tasks/008-social-audio-and-freetunes.md) |
| `TASK-009` | Dedicated Events Calendar & RSVP System (Luma / Meetup) | ⚪ TODO | Low | [`tasks/009-events-rsvp-calendar.md`](file:///d:/radica/tasks/009-events-rsvp-calendar.md) |

---

## 🌐 Social Hub Coverage & Expansion Roadmap

Radica's core vision is to serve as a **single decentralized Hub on Freenet** that brings familiar web social UX together without central servers.

### Already Covered
- **Twitter / X → Feed (`#feed-view`)**: Short-form *Thoughts*, Reposts, `#hashtags`, Polls, Events, and live search.
- **Instagram → Moments (`#media-modal`)**: Visual card gallery for photos and short videos with client-side compression and unified composer.
- **Reddit → Communities (`#communities-modal`, `r/slug`)**: Forum threads with upvote/downvote net scoring, `Hot`/`New`/`Top` ranking, flairs, and community moderation.
- **Telegram / Signal → P2P Chat**: DMs, E2EE Private Rooms & Broadcast Channels, Community Chats, and Secret Chats (TTL / burn).
- **Email → Radica Mail**: Post-quantum encrypted email client (`ML-KEM-768` + `ML-DSA-65`) interoperable with native Freenet Mail.

### Planned (`TODO`)
1. **Substack / Medium (`TASK-004`)**: Long-form Markdown articles, drafts, and optional newsletter delivery via Radica Mail.
2. **Discord (`TASK-005`)**: Multiple topic channels (`#announcements`, `#general`, etc.) and role-gated broadcast channels inside `r/slug` communities.
3. **TikTok / YouTube (`TASK-006`)**: Vertical short-video player in Moments plus `freenet-blob`-backed long-form video channels and playlists.
4. **Pinterest / Are.na (`TASK-007`)**: Public and private curated *Boards* displayed on User Walls with shareable `#board=...` permalinks.
5. **Spotify / FreeTunes (`TASK-008`)**: Persistent global audio mini-player, podcasts/audio posts, and FreeTunes companion integration.
6. **Luma / Meetup (`TASK-009`)**: Structured event scheduling, signed RSVPs (`Going` / `Interested`), calendar view, and activity reminders.

---

## 🎯 Task Status Legend
- ⚪ `TODO`: Backlog / planned
- 🟡 `IN_PROGRESS`: Currently being worked on or verified
- 🟢 `DONE`: Implemented, tested, and documented in `CHANGELOG.md` & `updates.ts`
