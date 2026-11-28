# TASK-013: Messenger composer — newline on phones, lighter input

## Context & Goal
Maintainer report (2026-11-28, phone screenshots of a group chat):
1. **Bug**: in the Messenger composer, Enter on the phone keyboard sends the message, so there is no way to start a new line. WhatsApp/Telegram on phones: Enter inserts a newline, the send button sends.
2. **Clutter**: the input pill holds a translate control (🌐 + chevron) and a Radica emoji button; together they eat the input width (placeholder cut to "Message Fre…", the globe even overlaps the text). Maintainer: remove the emoji button (the phone keyboard has emoji); move translation out of the input box with another strategy.

## Requirements
1. **Enter behaviour**: on touch/phone (coarse pointer or soft keyboard), Enter inserts a newline and only the send button sends. On desktop keep Enter = send, Shift+Enter = newline. The textarea grows with its content up to a max height, then scrolls.
2. **Remove the Radica emoji button from the composer** (keep any emoji used elsewhere, e.g. reactions, unless the plan shows it is only the composer's).
3. **Translation out of the input**: keep the feature (outgoing message translation, if that is what the 🌐 does — the architect checks), but reach it from elsewhere, e.g. the composer's `+` attach menu, the chat ⋮ menu, or a long-press on the send button; its current state (target language on/off) must still be visible somewhere when active (e.g. a small chip above the input only while active). Architect proposes, maintainer may override.
4. The input pill gets the freed width; placeholder no longer cut on a 412 px phone.
5. **Testing & Verification**: reproduce the bug first (Playwright, Pixel 7, touch emulation: Enter sends today); after the fix Enter adds a newline on phones and sends on desktop; screenshots Pixel 7 dark+light and desktop; `npm test`, `npm run build`.
6. `ui/src/updates.ts`, `CHANGELOG.md`; `#guide-modal` if the way to reach translation changes.

## Status
⚪ **TODO** (2026-11-28)
