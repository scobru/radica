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

## Reality check (2026-11-27)
Not implemented, but the spec rests on things that are gone:
- Public community chatrooms (`comm_...`) were retired from Chat on 2026-11-20: communities live only in Feed and Communities (`g r`), and founders link a native Private Group or Broadcast Channel in the description instead.
- River was removed on 2026-11-26; every group/channel is a native room (`nativeRooms.ts`).
- Already there: one linked Broadcast Channel = a read-only announcement channel (requirement 2, partly); link pills in the description (requirement 3, partly).
Open product decision before planning: several named native rooms per community (a list in the community record), or topic channels as forum sub-sections (flairs/tabs) inside `r/slug`.

## Status
⚪ **TODO** (2026-11-14)
