# TASK-005: Multi-Channel Community Spaces (Discord)

## Context & Goal
Extend `r/slug` Communities (`communitiesPage.ts` and `nativeRooms.ts`) from a single community chatroom (`comm_...`) into a multi-channel space where each community can organize conversations by topic, similar to Discord servers.

## Requirements
1. **Topic Channels per Community**:
   - Support multiple named channels inside a community (e.g., `#announcements`, `#general`, `#media`, `#support`) backed by Radica's native E2EE/log room architecture (`nativeRooms.ts`).
   - Allow Community Founders and Moderators to create, rename, and archive channels.
2. **Read-Only / Announcement Channels**:
   - Support announcement-only channels where only Founders and Moderators can post, while members can read and react.
3. **Unified Channel Switcher**:
   - Display the community's channel list in the Chat sidebar and link directly from the Community banner (`#communities-modal` / `#feed-view`).
4. **Testing & Verification**:
   - Add unit tests for channel descriptor derivation, permissions, and unread tracking.
   - Update `ui/src/updates.ts`, `CHANGELOG.md`, `CONTEXT.md`, and `README.md` upon implementation.

## Status
⚪ **TODO** (2026-11-14)
