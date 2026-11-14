# TASK-007: Curated Boards & Collections (Pinterest / Are.na)

## Context & Goal
Allow users to curate, organize, and share thematic collections (*Boards*) of posts, Moments, articles, and links across the network, going beyond a flat local bookmark list.

## Requirements
1. **Board Creation & Curation**:
   - Create named Boards (title, description, public or private visibility) and add any post or Moment with 1 click.
   - Support adding personal notes/annotations to collected items.
2. **Profile Wall Integration**:
   - Display a **Boards** tab alongside `Posts` and `Reposts` on public User Walls (`#user=<pubkey>`).
   - Provide shareable board permalinks (`#board=...`) that render inline in posts and chat.
3. **Contract-Free Storage**:
   - Store private boards in durable user storage (`durable.ts`) and public boards via existing signed log/post conventions without altering `radica_contract.wasm`.
4. **Testing & Verification**:
   - Add unit tests for board serialization, item deduplication, and permalink parsing.
   - Update `ui/src/updates.ts`, `CHANGELOG.md`, `CONTEXT.md`, and `README.md` upon implementation.

## Status
🟢 **DONE** (2026-11-14)
- Implemented `ui/src/boards.ts` (`createBoard`, `addItemToBoard`, `removeItemFromBoard`, `serializeBoardPostCaption`, `parseBoardPostCaption`, `boardPermalink`, `parseBoardHash`, `filterVisibleBoards`) and `ui/tests/boards.test.ts`.
- Added `#board-picker-modal`, `📌 Board` post action, `#board=` deep-linking, and `📌 Boards` + `📺 Videos` (Channel) tabs in `#user-profile-modal`.
