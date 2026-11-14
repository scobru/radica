# TASK-002: Fix Native Freemail Reply: Use Inbox Contract Token as Sender `from`

## Context & Bug Report
When sending an email from Radica to a native Freenet Mail (`freenet-email`) address:
1. The recipient receives the email in the official Freenet Mail app.
2. When clicking "Reply", the official Freenet Mail app populates the recipient "To:" field with the email's unencrypted `from` field.
3. In Radica, `encryptFreenetMailV1` was receiving `identity.alias` (e.g. `"scobru"` / `"usernickname"`).
4. Because `"usernickname"` is not a 44-character Base58 Freenet contract ID, official Freenet Mail fails to deliver the reply.
5. If the user in Freemail manually replaces `"usernickname"` with the token from Radica's "Tokens & Keys" (the 44-character native inbox contract ID `identity.inboxAddress`), the reply is delivered successfully to Radica.

## Requirements
1. In `ui/src/mailClient.ts`, when invoking `encryptFreenetMailV1` for network delivery to an inbox contract:
   - Provide `identity.inboxAddress` (the 44-character Base58 native inbox contract ID) as the sender identifier so native Freemail's "Reply" button automatically targets the correct contract ID.
2. In `ui/src/mailClient.ts` `resolveFreemailSenderAddress`:
   - If `rawFrom` equals `senderInbox` or is a bare 43..44 character contract ID, avoid formatting as `<inbox>@<inbox>`. Instead, resolve to the contact's name, known peer display name, or a clean `user@<inboxAddress>` / `<inboxAddress>`.
3. Add unit tests in `ui/tests/freenetMail.test.ts` and `ui/tests/mailClient.test.ts` covering outgoing sender token addressing and incoming reply resolution.
4. Keep documentation in `CHANGELOG.md`, `README.md`, `CONTEXT.md`, and `ui/src/updates.ts` synchronized.

## Status
🟢 **DONE** (2026-11-14)
- Updated `ui/src/mailClient.ts` to pass `identity.inboxAddress || identity.alias` into `encryptFreenetMailV1` when delivering to native Freenet Mail contracts.
- Updated `resolveFreemailSenderAddress` to handle bare 43..44 character contract IDs as `user@<inboxAddress>` without duplicate alias prefixes.
- Added comprehensive unit test in `ui/tests/mailClient.test.ts`.
- Documented in `CHANGELOG.md` and `ui/src/updates.ts`.
