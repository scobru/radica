# TASK-011: Messenger UX on phones, WhatsApp-inspired

## Context & Goal
The maintainer compared Radica Messenger on a phone with WhatsApp (screenshots of a chat thread and of "Select contact", 2026-11-28) and wants the same clarity: spacing, type sizes, pages instead of modals. Already done without the agent cycle (PRs #439–#444): roomier inbox rows, 16 px bubble text, Info as a page, New Conversation as a page with round-icon action rows. Not copying WhatsApp's look or branding: only layout patterns common to chat apps.

## Reality check (2026-11-28)
- **R1 contact list: mostly exists.** `renderContactPickerList()` (`messengerChat.ts` ~2800) already renders `#rm-contact-picker-list` on open (`openNewChatModal`) and on every `input` of `#rm-new-chat-input`: following + chat peers + discovered peers (+ blocked ones only while searching), avatar, name, `@handle · persona` line, Following/Blocked pills, DM / Secret / Unblock buttons, row tap opens the DM. It is placed *below* the bottom input and hint, has inline styles, no section title, and its empty state is a sentence (the `:empty { display:none }` rule only applies before the first render). Missing: "Contacts on Radica" heading, list moved right under the actions, inbox-row look, a status line (there is no "status" field: profiles carry `bio`; see Open questions).
- **R2 search in header: missing.** Header is `h3` + Back only; the field is the separate `#rm-new-chat-input` block with Open DM / Secret buttons at the bottom.
- **R3 bubbles: partly exists.** Rows already carry `grouped-prev` / `grouped-next` (same sender, same day, < 5 min) and radii make a "spine" on the *last* bubble of a run (Signal style, avatar on the last one). No tail element. Time, edited, LAN, TTL and ticks are already inside the bubble, bottom-right (`.rm-meta-float`, float right). Only spacing changes there.
- **R4 unread separator: missing.** No marker in the thread. Obstacle: `main.ts` calls `conversation.markRead(roomId)` when a thread opens (`openPeer` ~9378, room ~9136) and on every sidebar render (~8548), *before* Messenger renders the thread, so the read mark is already "now" at render time. The mark from before the open must be kept by Conversation state.
- Nothing rests on removed features. No product change of course: the open questions below have defaults the builders can follow.

## Requirements
1. **New Conversation page lists contacts**: under the actions, a "Contacts on Radica" section with avatar, name and status line (like the inbox rows), tapping one opens the DM. Reuse the existing contact picker list (`#rm-contact-picker-list`) and its filter.
2. **Search in the page header**: a search icon in the New Conversation header turns the title into a search field that filters that contact list (and accepts @handle / key / contact card as today), instead of the separate field at the bottom.
3. **Bubbles**: a small tail on the first bubble of each run, sender's and mine; time and ticks inside the bubble, bottom-right, as today but with WhatsApp-like spacing.
4. **Unread separator**: when a thread opens with unread messages, a centred "N unread messages" pill above the first unread one.
5. Phones only (`max-width: 768px`) unless the plan argues otherwise; desktop keeps its layout. Dark and light themes.
6. **Testing & Verification**: unit tests for any new pure logic (e.g. unread separator position, contact filter); Playwright screenshots at Pixel 7 width, both themes; `npm test`, `npm run build`.
7. Update `ui/src/updates.ts`, `CHANGELOG.md`, `#guide-modal` if a capability changes.

## Status
🟡 **IN_PROGRESS** (2026-11-28)

## Plan
Phones only (`@media (max-width: 768px)`) for layout and bubble shape; the separator and the contact list order/heading apply on desktop too (they are content, not layout, and a second code path costs more than it saves).

**Reuse**: `renderContactPickerList()` + its click handler and `startDmFromInput()` (keep, do not fork); `groupedPrev`/`groupedNext` flags for tails; `.rm-date-sep` styling for the separator pill; `.rm-conv-item` look for contact rows; `conversationState.ts` read marks; `messengerLogic.ts` for pure helpers (already has `filterMentionCandidates`).

**Files**
- [core] `ui/src/messengerLogic.ts`: 
  - `filterContactPeers(peers: string[], q: string, info: (pk) => { name: string; handle?: string; persona: string; blocked: boolean }): string[]` — the filter now inline in `renderContactPickerList` (empty query hides blocked; `@` stripped for handle match; name / key / persona / handle substring, case-insensitive). Same behaviour, moved.
  - `unreadSeparatorAt(msgs: { sender: string; timestamp: number; system_event?: string }[], me: string, since: number | undefined): { index: number; count: number } | null` — first message from someone else with `timestamp > since` (same rule as `freenet.unreadCount`: other sender, `> since`; join events skipped), count of such messages; `null` when `since` is undefined or none.
- [core] `ui/src/conversationState.ts`: `markRead` remembers, in memory, the mark it replaced when there *was* something unread (`unreadFrom.set(roomId, previousMark)`); new `unreadSince(roomId): number | undefined` returns it. Previous mark = `readMarks()[roomId]`, or `0` for a never-read DM/Secret Chat (same rule as `unread`). In-memory only: no storage, no wire change, nothing for `legacy.ts`.
- [ui] `ui/src/messengerChat.ts` (markup + wiring):
  - New Conversation markup: header gets a search button (`#rm-new-chat-search-btn`, `renderIcon("search")`); tapping it hides `h3` and shows the input inside the header (move `#rm-new-chat-input` there; keep its id so all wiring keeps working). Back while searching clears and closes search first. Open DM / Secret buttons stay, shown under the header only when the query is a key / handle / contact card that is not in the list (default of Open question 1).
  - `#rm-contact-picker-list` moves right after `.rm-new-chat-actions`, preceded by `<h4 class="rm-contacts-title">Contacts on Radica</h4>`; rows lose inline styles for classes (`rm-contact-pick-row`, `rm-contact-pick-avatar`, `rm-contact-pick-name`, `rm-contact-pick-sub`); call `filterContactPeers`.
  - Thread render: on `openId` change, freeze `sepSince = deps.conversation.unreadSince(openId)` for that open (new messages arriving while the thread is open do not move it); call `unreadSeparatorAt` on the visible slice and push `{ key: "unread-sep:<roomId>", html: '<div class="rm-unread-sep" role="separator">N unread messages</div>' }` before that row (after its date separator). Scroll the separator into view instead of the bottom on that first render (`resolveThreadScrollAction` stays as is otherwise). Separator clears on next open.
  - Bubble: add `run-first` class to the row when `!groupedPrev` (tail goes on the first bubble).
- [ui] `ui/src/messengerChat.css` (end of file, phone block): tail via `.rm-msg-row.run-first .rm-bubble::before` (small CSS triangle / clip-path, colour = bubble background, border colour for `theirs` in light theme); radii flipped so the sharp corner is top-left (theirs) / top-right (mine) on `run-first`; `.rm-meta-float` spacing (margin-left 12px, margin-bottom -3px, 0.7rem); header search field; contacts title and inbox-like rows (44 px avatar, 1.02rem name, muted sub line, no card background); `.rm-unread-sep` pill centred, both themes via existing `--rm-*` vars. Note: `.rm-messenger-card *::before` (line ~145) resets pseudo-elements: check the tail is not killed by it.
- [ui] `ui/src/updates.ts`: one entry. `ui/index.html` `#guide-modal` Messenger section: one line on header search and the unread marker. 
- `CHANGELOG.md`, `README.md` (no new capability, likely no README change): tester.

**Data / signed messages**: none. No contract, wire or storage change.

**Moderation (3 layers)**: this task creates no new user content; it re-lays out existing names, avatars and messages.
1. Local: thread bubbles keep the existing `maskProfanity` / NSFW path untouched; the separator text is ours. Contact rows show names/avatars as today.
2. WoT/AI: `filterContactPeers` must keep today's rule: blocked / hidden authors (`deps.isPeerBlocked` = `isHiddenAuthor`) out of the default list, shown only on an explicit search with the Blocked pill. Unread count comes from rendered (already filtered) messages, so held/hidden messages never count toward "N unread".
3. Manual: thread Report / Hide Author stay on bubbles; contact rows keep Unblock. No new surface needs Report.

**CONTEXT.md**: add **Unread separator** (see below).

## Open questions
1. Does header search replace the bottom input entirely? Default taken: yes, one field in the header; Open DM / Secret appear only when the text is a valid key / @handle / contact card not already listed. Confirm, or keep the bottom block too.
2. "Status line": Radica has no status field. Default: `@handle · persona` as today, or the profile `bio` first line if the maintainer prefers (needs a `getAuthorBio` dep from `main.ts`, one more file). Which?
3. Nearby, hint text and My QR box: keep them under the actions (default), or move under the list?
4. Desktop: separator and list order on desktop too (default yes), bubble tails phones only (default yes)?

## Tasks
- [ ] [core] core-1: `filterContactPeers` and `unreadSeparatorAt` in `ui/src/messengerLogic.ts`, exported, DOM-free, as specified in Plan.
- [ ] [core] core-2: `conversationState.ts` `markRead` keeps the replaced mark in memory when unread > 0; add `unreadSince(roomId)` to the returned object and its type.
- [ ] [ui] ui-1: New Conversation markup in `messengerChat.ts`: header search button + input in header, list under actions with "Contacts on Radica" title, class-based rows, Open DM / Secret shown only for an unlisted key; wire to `filterContactPeers` (after: core-1).
- [ ] [ui] ui-2: thread render in `messengerChat.ts`: freeze `unreadSince` per open, insert `.rm-unread-sep` via `unreadSeparatorAt`, scroll to it on first render, add `run-first` row class (after: core-1, core-2).
- [ ] [ui] ui-3: `messengerChat.css` phone block: header search, contact rows, bubble tails, meta spacing, unread pill; dark + light (after: ui-1, ui-2 class names).
- [ ] [ui] ui-4: `updates.ts` entry and `#guide-modal` Messenger line.
- [ ] [test] test-1: `ui/tests/messengerChat.test.ts` (already imports messengerLogic): `filterContactPeers` (empty query hides blocked, `@handle`, key, persona, case) and `unreadSeparatorAt` (none unread, all unread, mine skipped, join events skipped, `since` undefined) (after: core-1).
- [ ] [test] test-2: `ui/tests/conversationState.test.ts`: `unreadSince` set only when there was unread, survives a second `markRead` with nothing new, `0` for never-read DM, undefined for never-read room (after: core-2).
- [ ] [test] test-3: Playwright screenshots at Pixel 7 (412 px) in dark and light: New Conversation (list, search open), thread with tails and unread pill; desktop screenshot unchanged layout. `npm test`, `npm run build`, `graphify update .`, CHANGELOG entry, AGENTS.md checklist, close spec (after: ui-1..ui-4).
