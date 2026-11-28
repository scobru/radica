# TASK-011: Messenger UX on phones, WhatsApp-inspired

## Context & Goal
The maintainer compared Radica Messenger on a phone with WhatsApp (screenshots of a chat thread and of "Select contact", 2026-11-28) and wants the same clarity: spacing, type sizes, pages instead of modals. Already done without the agent cycle (PRs #439–#444): roomier inbox rows, 16 px bubble text, Info as a page, New Conversation as a page with round-icon action rows. Not copying WhatsApp's look or branding: only layout patterns common to chat apps.

## Requirements
1. **New Conversation page lists contacts**: under the actions, a "Contacts on Radica" section with avatar, name and status line (like the inbox rows), tapping one opens the DM. Reuse the existing contact picker list (`#rm-contact-picker-list`) and its filter.
2. **Search in the page header**: a search icon in the New Conversation header turns the title into a search field that filters that contact list (and accepts @handle / key / contact card as today), instead of the separate field at the bottom.
3. **Bubbles**: a small tail on the first bubble of each run, sender's and mine; time and ticks inside the bubble, bottom-right, as today but with WhatsApp-like spacing.
4. **Unread separator**: when a thread opens with unread messages, a centred "N unread messages" pill above the first unread one.
5. Phones only (`max-width: 768px`) unless the plan argues otherwise; desktop keeps its layout. Dark and light themes.
6. **Testing & Verification**: unit tests for any new pure logic (e.g. unread separator position, contact filter); Playwright screenshots at Pixel 7 width, both themes; `npm test`, `npm run build`.
7. Update `ui/src/updates.ts`, `CHANGELOG.md`, `#guide-modal` if a capability changes.

## Status
⚪ **TODO** (2026-11-28)
