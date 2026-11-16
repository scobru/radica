# Radica — Agent Rules

## MUST: updates tab + docs, same session
Any new feature, integration, protocol, or significant improvement:
1. `ui/src/updates.ts`: new entry at top of `UPDATES`, current ISO date (`YYYY-MM-DD`). User-facing: what it does, how to reach it, why it matters.
2. `ui/index.html` (`#guide-modal`): new user-facing capability → add/update concise `<details>` section.
3. `CHANGELOG.md`: entry under current release heading (or bump to new version block).
4. `README.md`: new capability, companion app integration (e.g. Freenet Mail, FreeTunes, River), or crypto protocol → Key Features or Ecosystem section.
5. `CONTEXT.md`: new domain terms, invariants, architectural decisions.

## MUST: content moderation, all 3 layers
Any feature that creates, publishes, or displays user-generated content (posts, articles, boards, events, media, comments, audio/video):
1. Local on-device (`ui/src/moderation.ts`): `analyzeImageFile(...)` on uploaded images/covers, propagate `isNsfw` / `nsfwScore`; `analyzeTextContent(...)` / `maskProfanity(...)` on text when appropriate, respecting reader's `maskBadWords`.
2. AI helper + trusted curator / WoT filtering: drop hidden/blocked authors (`isHiddenAuthor`), curator-reported/removed posts (`freenet.reportedBy`), reported media (`freenet.reportedMediaBy`), AI helper holds (`freenet.aiHeldTargets()`) — authors still see their own posts.
3. Manual: expose **Report** (`freenet.reportPost`) and **Hide Author** in the feature's reader/detail/card UI.

## Testing & verification
1. New module/utility → unit tests in `ui/tests/<feature>.test.ts`. Run `npm test` (or `node --experimental-strip-types --test tests/<feature>.test.ts`).
2. Always: `npm run build` — TypeScript + Vite production bundle, zero errors.
3. After modifying code files: `graphify update .` from repo root to keep `graphify-out/` current (AST-only, no LLM cost).
