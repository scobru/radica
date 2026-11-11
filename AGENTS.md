# Radica — Agent Guidelines & Repository Rules

This document outlines mandatory instructions and rules for AI coding assistants working in the Radica repository.

## 🚨 Mandatory Rule: Features, Updates Tab & Documentation

Whenever a new feature, integration, protocol, or significant improvement is introduced to the codebase, **the agent MUST ALWAYS keep the updates tab and documentation synchronized in the same session**:

### 1. In-App Updates Tab (`ui/src/updates.ts`)
* **Always add an entry to `UPDATES`**: Add a new entry with the current ISO date (`YYYY-MM-DD`) at the very top of the `UPDATES` array in `ui/src/updates.ts`.
* **Description**: Write a clear, user-facing summary of what the feature does, how users access it, and why it matters.

### 2. Repository Documentation
* **`CHANGELOG.md`**: Add the new version / feature entry under the current release heading (or bump to a new version block).
* **`README.md`**: When adding a new capability, companion app integration (e.g., Freenet Mail, FreeTunes, River), or cryptographic protocol, document it under the Key Features or Ecosystem sections.
* **`CONTEXT.md`**: Record any new domain language terms, invariants, or architectural decisions.

---

## 🧪 Testing & Verification Requirements

1. **Unit Tests**:
   * Any new module or utility must have corresponding unit tests in `ui/tests/<feature>.test.ts`.
   * Run the test suite: `npm test` (or `node --experimental-strip-types --test tests/<feature>.test.ts`).
2. **Build Verification**:
   * Always verify that TypeScript and Vite production bundle compile with zero errors: `npm run build`.
3. **Graphify Knowledge Graph**:
   * After modifying code files in any session, run `graphify update .` from the repository root to keep `graphify-out/` current (AST-only, no LLM cost).
