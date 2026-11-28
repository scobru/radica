# TASK-011: Messenger UX on phones, WhatsApp-inspired

## Context & Goal
The maintainer compared Radica Messenger on a phone with WhatsApp (screenshots of a chat thread and of "Select contact", 2026-11-28) and wants the same clarity: spacing, type sizes, pages instead of modals. Already done without the agent cycle (PRs #439–#444): roomier inbox rows, 16 px bubble text, Info as a page, New Conversation as a page with round-icon action rows. Not copying WhatsApp's look or branding: only layout patterns common to chat apps.

## Reality check (2026-11-28)
- **R1 contact list: mostly exists.** `renderContactPickerList()` (`messengerChat.ts` ~2800) already renders `#rm-contact-picker-list` on open (`openNewChatModal`) and on every `input` of `#rm-new-chat-input`: following + chat peers + discovered peers (+ blocked ones only while searching), avatar, name, `@handle · persona` line, Following/Blocked pills, DM / Secret / Unblock buttons, row tap opens the DM. It is placed *below* the bottom input and hint, has inline styles, no section title, and its empty state is a sentence (the `:empty { display:none }` rule only applies before the first render). Missing: "Contacts on Radica" heading, list moved right under the actions, inbox-row look, a status line (there is no "status" field: profiles carry `bio`; see Open questions).
- **R2 search in header: missing.** Header is `h3` + Back only; the field is the separate `#rm-new-chat-input` block with Open DM / Secret buttons at the bottom.
- **R3 bubbles: partly exists.** Rows already carry `grouped-prev` / `grouped-next` (same sender, same day, < 5 min) and radii make a "spine" on the *last* bubble of a run (Signal style, avatar on the last one). No tail element. Time, edited, LAN, TTL and ticks are already inside the bubble, bottom-right (`.rm-meta-float`, float right). Only spacing changes there.
- **R4 unread separator: missing.** No marker in the thread. Obstacle: `main.ts` calls `conversation.markRead(roomId)` when a thread opens (`openPeer` ~9378, room ~9136) and on every sidebar render (~8548), *before* Messenger renders the thread, so the read mark is already "now" at render time. The mark from before the open must be kept by Conversation state.
- **R8 modals reachable from Messenger on phones** (inventory):
  | View | Where | Today on phones |
  |---|---|---|
  | Info / Group info (members, kick, leave, room avatar, verify) | `#rm-info-drawer`, `messengerChat.ts` | already a page (PRs #439–#444) |
  | New Conversation | `#rm-new-chat-modal` (`.rm-modal-backdrop`), `messengerChat.ts` | already a page (end of `messengerChat.css`) |
  | Safety number | `#rm-safety-modal` (`.rm-modal-backdrop`), `messengerChat.ts` | centred modal |
  | New poll | `#rm-poll-modal` (`.rm-modal-backdrop`), `messengerChat.ts` | centred modal |
  | New E2EE Group **and** New Broadcast Channel (one modal, two titles) | `#create-private-room-modal` (`.modal-overlay`), `index.html` ~2535; opened by `main.ts` ~10038/10084 via `onOpenCreateRoomModal` / `onOpenCreateChannelModal` | centred modal |
  | Join with invite code | `#join-privroom-modal`, `index.html` ~2674; `main.ts` ~10226 | centred modal |
  | Invite members | `#invite-privroom-modal`, `index.html` ~2616; `main.ts` ~10162 | centred modal |
  | Edit profile (inbox menu) | `#profile-modal`, `index.html` ~2460; `main.ts` ~6076 | centred modal |
  | Identity & keys, Settings, Blocked contacts, user profile | `#identity-modal`, `#settings-modal`, `#blocklists-modal`, `#user-profile-modal` (`.rail-page`) | already pages |
  | TTL timer | `#rm-btn-ttl-selector` cycles presets in place | no dialog |
  | Compose / inbox / header menus | `.rm-menu` popovers | menus, not modals: stay |
  The four `index.html` modals are shared with Classic chat and live outside `#chat-modal`, so their page CSS cannot be scoped under `#chat-modal`. `messengerChat.css` is imported globally (`main.ts:71`), so an unscoped class there works for them. They open/close by `style.display` and their own ✕ buttons: no `main.ts` change is needed for the page look.
  - **Native dialogs** on these flows: `messengerChat.ts` `confirm()` clear chat (~3007), wipe notes (~3683), kick member (~3754), remove Gardener (~3778), unblock-to-chat (~4400, ~4499); `prompt()` River migration name (~3369, River retired: likely dead path); `main.ts` `alert()` in create/join/invite (~10041–10313: validation, success, errors).
- Nothing rests on removed features. No product change of course: the open questions below have defaults the builders can follow.

## Requirements
1. **New Conversation page lists contacts**: under the actions, a "Contacts on Radica" section with avatar, name and status line (like the inbox rows), tapping one opens the DM. Reuse the existing contact picker list (`#rm-contact-picker-list`) and its filter.
2. **Search in the page header**: a search icon in the New Conversation header turns the title into a search field that filters that contact list (and accepts @handle / key / contact card as today), instead of the separate field at the bottom.
3. **Bubbles**: a small tail on the first bubble of each run, sender's and mine; time and ticks inside the bubble, bottom-right, as today but with WhatsApp-like spacing.
4. **Unread separator**: when a thread opens with unread messages, a centred "N unread messages" pill above the first unread one.
5. Phones only (`max-width: 768px`) unless the plan argues otherwise; desktop keeps its layout. Dark and light themes.
6. **Testing & Verification**: unit tests for any new pure logic (e.g. unread separator position, contact filter); Playwright screenshots at Pixel 7 width, both themes; `npm test`, `npm run build`.
7. Update `ui/src/updates.ts`, `CHANGELOG.md`, `#guide-modal` if a capability changes.
8. (Maintainer, 2026-11-28) "Consolidate the other views like New Conversation: New Group must be consistent too; wherever we use modals, use pages."

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
- [ui] `ui/src/updates.ts`: one entry. `ui/index.html` (one task only, ui-7): page classes on the four shared modals and the `#guide-modal` Messenger line on header search and the unread marker. 
- `CHANGELOG.md`, `README.md` (no new capability, likely no README change): tester.

**Shared phone page pattern (R8)**. One unscoped class pair in `messengerChat.css`, phones only; desktop keeps modals:
- `.rm-page` on the overlay (`.rm-modal-backdrop` or `.modal-overlay`): full screen, no backdrop/blur/padding, inner card (`.rm-modal` / `.modal-card`) stretched to 100% height, no radius/border/shadow, `background: var(--rm-bg-inbox, var(--bg))`, scrolls, 16 px gutters on children.
- `.rm-page-head` on the header row: 60 px, Back chevron on the left (row-reverse, as New Conversation does), title 1.2rem, bottom border. Close buttons carry both icons: `<span class="rm-wide-only">✕</span>` + chevron `rm-narrow-back`; move the `.rm-narrow-back` / `.rm-wide-only` rules out of the `#chat-modal` scope so they work in `index.html` modals too. Back = the existing close button, so no new wiring.
- `.rm-page-rows` on an action list: full-width rows, round 44 px accent icons (today's `.rm-new-chat-actions` phone rules, generalised).
- New Conversation's phone rules at the end of `messengerChat.css` are rewritten onto these classes (deletion, not duplication). Theming via existing vars, so dark and light both work; `index.html` modals use `--bg` / `--border` fallbacks.
- Applies to the shared `index.html` modals in Classic chat too (default taken, see Open question 5).

**Data / signed messages**: none. No contract, wire or storage change.

**Moderation (3 layers)**: this task creates no new user content; it re-lays out existing names, avatars and messages.
1. Local: thread bubbles keep the existing `maskProfanity` / NSFW path untouched; the separator text is ours. Contact rows show names/avatars as today.
2. WoT/AI: `filterContactPeers` must keep today's rule: blocked / hidden authors (`deps.isPeerBlocked` = `isHiddenAuthor`) out of the default list, shown only on an explicit search with the Blocked pill. Unread count comes from rendered (already filtered) messages, so held/hidden messages never count toward "N unread".
3. Manual: thread Report / Hide Author stay on bubbles; contact rows keep Unblock. No new surface needs Report.

**CONTEXT.md**: add **Unread separator** (see below).

## Open questions
None answered by the maintainer: each is **default taken, maintainer may override**.
1. Does header search replace the bottom input entirely? Default taken: yes, one field in the header; Open DM / Secret appear only when the text is a valid key / @handle / contact card not already listed. Confirm, or keep the bottom block too. *(default taken, maintainer may override)*
2. "Status line": Radica has no status field. Default: `@handle · persona` as today, or the profile `bio` first line if the maintainer prefers (needs a `getAuthorBio` dep from `main.ts`, one more file). Which? *(default taken, maintainer may override)*
3. Nearby, hint text and My QR box: keep them under the actions (default), or move under the list? *(default taken, maintainer may override)*
4. Desktop: separator and list order on desktop too (default yes), bubble tails phones only (default yes)? *(default taken, maintainer may override)*
5. Page pattern on phones also for the shared `index.html` modals when opened from Classic chat (default yes: one look, no per-layout CSS), and for other app modals not reachable from Messenger (`#create-comm-modal`, `#share-post-modal`, mail modals...)? Default: Messenger-reachable ones only in this task; the rest a follow-up. *(default taken, maintainer may override)*
6. Native `confirm()` / `prompt()` / `alert()` (listed in Reality check): replace with in-app sheets / toasts? Proposed: `alert()` validation and success in create/join/invite → `showToast` (cheap, needs `main.ts`); destructive `confirm()` (wipe notes, kick, clear) → a shared bottom-sheet confirm; River `prompt()` → delete if the path is dead. Default: **not in this task**, follow-up spec. *(default taken, maintainer may override)*

## Tasks
- [x] [core] core-1: `filterContactPeers` and `unreadSeparatorAt` in `ui/src/messengerLogic.ts`, exported, DOM-free, as specified in Plan.
- [x] [core] core-2: `conversationState.ts` `markRead` keeps the replaced mark in memory when unread > 0; add `unreadSince(roomId)` to the returned object and its type.
- [ ] [ui] ui-1: New Conversation markup in `messengerChat.ts`: header search button + input in header, list under actions with "Contacts on Radica" title, class-based rows, Open DM / Secret shown only for an unlisted key; wire to `filterContactPeers` (after: core-1).
- [ ] [ui] ui-2: thread render in `messengerChat.ts`: freeze `unreadSince` per open, insert `.rm-unread-sep` via `unreadSeparatorAt`, scroll to it on first render, add `run-first` row class (after: core-1, core-2).
- [ ] [ui] ui-3: `messengerChat.css` phone block: header search, contact rows, bubble tails, meta spacing, unread pill; dark + light (after: ui-1, ui-2 class names).
- [ ] [ui] ui-4: `updates.ts` entry (covers R1–R4 and R8). Only `updates.ts`.
- [x] [ui] ui-5: shared phone page pattern in `messengerChat.css`: `.rm-page`, `.rm-page-head`, `.rm-page-rows`, unscoped `.rm-narrow-back` / `.rm-wide-only`; rewrite New Conversation phone rules onto them (after: ui-3, same file, run in sequence).
  > note (ui-5): until ui-6 lands, New Conversation stays a page via aliases in the same rules (`#rm-new-chat-modal`, `#chat-modal .rm-new-chat-head`, `#chat-modal .rm-new-chat-actions` inside the `:is(...)` selectors at the end of `messengerChat.css`). ui-6: add `rm-page` / `rm-page-head` / `rm-page-rows`, then delete those aliases. Gutters are 16 px padding on the card; head and rows bleed to the edges with `margin-inline: -16px`.
- [ ] [ui] ui-6: `messengerChat.ts` markup: add `rm-page` / `rm-page-head` (Back chevron) to `#rm-new-chat-modal`, `#rm-safety-modal`, `#rm-poll-modal`; `rm-page-rows` on `.rm-new-chat-actions` (after: ui-1, ui-2, same file, run in sequence; ui-5 for class names).
- [x] [ui] ui-7: **sole owner of `ui/index.html`** in this task: `rm-page` / `rm-page-head` / Back chevron on `#create-private-room-modal` (New Group and New Channel), `#join-privroom-modal`, `#invite-privroom-modal`, `#profile-modal`; drop the inline `max-width` only where it fights the page (phones via CSS `!important` is fine instead); plus the `#guide-modal` Messenger line (moved here from ui-4). No `main.ts` change (after: ui-5).
  > note (ui-7): `#profile-modal` had no header close button. Its Back is a `<label for="modal-cancel-btn" class="rm-narrow-back">` that passes the tap to the existing Cancel button, so no `main.ts` change was needed. It is `aria-hidden`, so keyboard and screen-reader users use Cancel. Follow-up if wanted: a real header button wired in `main.ts`. The inline `max-width` was kept: it is overridden on phones by `max-width: none !important`.
- [x] [test] test-1: `ui/tests/messengerChat.test.ts` (already imports messengerLogic): `filterContactPeers` (empty query hides blocked, `@handle`, key, persona, case) and `unreadSeparatorAt` (none unread, all unread, mine skipped, join events skipped, `since` undefined) (after: core-1).
- [x] [test] test-2: `ui/tests/conversationState.test.ts`: `unreadSince` set only when there was unread, survives a second `markRead` with nothing new, `0` for never-read DM, undefined for never-read room (after: core-2).
- [ ] [test] test-4: Playwright at Pixel 7 (412 px), dark and light, one screenshot per page: New Conversation, Safety number, New poll, New E2EE Group, New Broadcast Channel, Join with invite code, Invite members, Edit profile; check each is full screen, Back chevron left, title, 16 px gutters, Back closes it; plus one desktop screenshot each still a centred modal (after: ui-5, ui-6, ui-7).
- [ ] [test] test-3: Playwright screenshots at Pixel 7 (412 px) in dark and light: New Conversation (list, search open), thread with tails and unread pill; desktop screenshot unchanged layout. `npm test`, `npm run build`, `graphify update .`, CHANGELOG entry, AGENTS.md checklist, close spec (after: ui-1..ui-7, test-4).
