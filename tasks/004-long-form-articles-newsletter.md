# TASK-004: Long-Form Articles & Decentralized Newsletters (Substack / Medium)

## Context & Goal
Expand Radica's Social Hub beyond short-form Feed posts (*Thoughts*) and forum threads (*Communities*) by adding a dedicated long-form publishing and reading experience on Freenet, with optional newsletter distribution via **Radica Mail**.

## Requirements
1. **Rich Markdown Article Composer & Reader**:
   - Support structured long-form articles (title, subtitle/summary, cover image, Markdown body, estimated reading time, tags).
   - Provide a clean, distraction-free reader view accessible from the Feed, User Walls, and a dedicated Articles/Reads filter or tab.
   - Store large article payloads via `freenet-blob` or compact signed caption/link conventions without breaking the existing `radica_contract.wasm` key.
2. **Drafts & Local Persistence**:
   - Save article drafts locally using `SafeStorage` / durable keys (`durable.ts`) so work survives browser reloads.
3. **Newsletter Distribution via Radica Mail**:
   - Allow authors to optionally dispatch published articles (or summaries + permalinks) to subscribed contacts/followers via **Radica Mail** (`mailClient.ts`).
4. **Testing & Verification**:
   - Add pure unit tests for article parsing, reading-time calculation, and serialization in `ui/tests/`.
   - Update `ui/src/updates.ts`, `CHANGELOG.md`, `CONTEXT.md`, and `README.md` upon implementation.

## Status
🟢 **DONE** (2026-11-14)
