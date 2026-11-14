# TASK-003: Mail Contacts Management (Add & Remove Contacts)

## Context & Request
User request: *"dai la posisbilta di aggiungere mam anche rimuovere contatti da mail"*
Enable users to not only import / auto-save contacts in Freenet Mail, but also browse all saved contacts and remove/delete unwanted contacts from their address book, both from a dedicated Contacts view and inline suggestions.

## Requirements
1. **Contacts View in Mail Sidebar**:
   - Add a `Contacts` button (`#mail-folder-contacts-btn`) with badge count (`#mail-contacts-badge`) in `.mail-folders-nav`.
   - Add a dedicated view pane `#mail-contacts-view` with header, "+ Add Contact" button (`#mail-contacts-add-btn`), and list container `#mail-contacts-list`.
2. **Contact Card Actions**:
   - Each contact item in `#mail-contacts-list` displays:
     - Avatar / initial icon
     - Contact name and handle
     - Truncated copyable address / token
     - ✉️ **Send**: opens compose form pre-filled with this contact
     - 📋 **Copy**: copies the contact's token/address to clipboard
     - 🗑️ **Delete**: removes the contact from local storage using `deleteMailContact(pubkey, address)`, updates the list and badge, and shows a feedback toast.
   - Clean empty state when no contacts are saved.
3. **Inline Suggestions Removal**:
   - In `mail-to-suggestions`, add a quick delete button next to saved contacts (`s.source === "contact"`) allowing 1-click removal directly while typing in the "To:" input.
4. **Header and Compose Integration**:
   - Clicking `👥 Contacts` in the compose header opens the Contacts view or shows the full contacts address book.
   - Clicking `➕ Add Contact` opens `#mail-contact-modal`.
5. **Testing & Verification**:
   - Unit tests in `ui/tests/mailClient.test.ts` and `ui/tests/templateNesting.test.ts`.
   - Synchronized updates in `ui/src/updates.ts`, `CHANGELOG.md`, `ISSUES.md`, and `graphify update .`.

## Status
🟢 **DONE** (2026-11-14)
- Added `#mail-folder-contacts-btn` & `#mail-contacts-badge` in `ui/index.html`.
- Added `#mail-contacts-view` with contact cards, search, send, copy, and delete controls.
- Added inline ✕ deletion button in compose recipient suggestions.
- Extended `MailFolder` union type to include `"contacts"` in `ui/src/mailClient.ts`.
- Added unit tests in `ui/tests/mailClient.test.ts` and `ui/tests/templateNesting.test.ts` (all 396 tests passing).
- Verified production build with zero errors (`npm run build`).
