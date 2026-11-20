# TASK-010: Contract v2 (feed + log) migration

## Context & Goal
The P1 audit items left open after the P0/P1 hardening (scobru/radica#374) are the ones only the contracts can enforce:

| Item | Where | Severity | Why the contract |
|---|---|---|---|
| No count caps on comments, likes, log entries | `contract`, `log-contract` | Medium (DoS) | Keys and entry ids are free: anyone can grow someone else's feed or a public log until the node refuses updates, and the owner can no longer write. |
| `:`-joined signed messages (delimiter injection) | `post_msg`, `profile_msg`, `entry_msg` | Low | Client mitigation is in place (`isCanonicalPost`). Still open: name↔bio split in profiles, `id`↔`ts`↔`body` split in log entries whose id holds `:`. |
| Hex case not enforced | both | Low | The UI already normalizes to lowercase; the contract should refuse uppercase so every peer agrees. |
| `compute_delta` drops `following_cert` | `contract` | Bug | Delegated (Viso) following lists do not sync by delta, only by full state. |

**Not in scope.** The identity delegate (`delegate/`): another delegate lands in the `sk/dev` slot, not in Radica's `sk/<app id>`, so it cannot read Radica's keys. Rejecting `MessageOrigin::Delegate` is still cleaner and can ride a later delegate rebuild, but it does not justify a migration. `media-contract` (content-addressed, unchanged).

Goal: one new generation of `contract.wasm` and `log.wasm` that fixes all four, with **no user action and no data loss**.

## Key fact: the migration machinery already exists
`ui/src/legacy.ts` + `network.ts` (`legacy()`, `fromLegacy()`): when a feed or log is empty under the current code hash, the reader looks it up under the hashes in `LEGACY` (newest first) and pushes what it finds to the current key. Any reader can do this for anyone's feed, because every record carries its own author signature. That push is rejected whole if the new contract refuses one record.

So the v2 contract must **accept every record v1 accepts today** (old signatures included). Otherwise, carry-forward fails and old content stays behind until its owner signs in.

## Design

### 1. Signatures: v3 messages, length-prefixed, v2 still accepted
- New records sign `radica/post/v3` (and `comment/v3`, `like/v3`, `profile/v4`, `following/v3`, `delete/v3`, `log/v2`). Each field is written as `<byte length>:<bytes>`, so the message has exactly one parse. One helper in Rust (`lp(fields: &[&str]) -> String`) and its twin in `ui/src/crypto.ts`, with a shared test vector.
- The contract verifies the v3 message first. If that fails, it falls back to the old message and accepts it **exactly as v1 does today**, with no extra check. A stricter rule would drop legitimate data on carry-forward: log ids are `type:<hash>` and contain `:`, and display names may too. Re-split legacy records stay filtered on the reader side (`isCanonicalPost`, kept permanently).
- New records must use v3. A record with a v3-era timestamp and only a legacy signature is refused (cutoff = the release timestamp).
- `migrateOwnFeed` (marker `radica_feed_v4_<pk>`) re-signs the user's own posts, profile, following list and deletions in v3 at sign-in, as v3 does today.
- Delegated signatures (`Cert`, Viso) follow the same rule: v3 message first, legacy message as the fallback.

### 2. Caps that bound size without letting spam evict real content
**Node limits** (freenet-core `3965e51`):
- `MAX_STATE_SIZE = 50 MiB` (`crates/core/src/wasm_runtime/state_store.rs`): a larger state is refused.
- Every contract call (`validate_state`, `update_state`, …) gets `max_execution_seconds = 5.0` (`wasm_runtime/runtime.rs`) and `DEFAULT_MAX_MEMORY_PAGES = 4096`, that is 256 MiB (`wasm_runtime/engine.rs`).
- The client WebSocket caps one message at 64 MiB.

The 5 s limit can bind before the 50 MiB one: `validate_state` re-verifies every signature in the state. A feed with tens of thousands of signed records can time out, and then every update is refused. The count caps below have to keep a full re-validation well under 5 s, so benchmark Ed25519 verification in the node's WASM before fixing the numbers.

**Why caps are needed even with PoW.** Without caps:
- **The feed gets bricked.** Once a feed or log is near the limit, every update that grows it is refused, so the owner can no longer post. Anyone can trigger this with comments or likes, because keys and ids are free.
- **Readers pay for it.** Every reader downloads and parses up to 50 MiB per feed. The page keeps each feed in `localStorage` (`freenet_feed_<pk>`, usually a 5–10 MB quota), so the write fails and the feed stops being cached.
- **PoW alone does not stop it.** A 4 KB comment at 12 bits costs about 4k hashes. Filling 50 MiB takes about 13k comments, or 50M hashes: a few minutes on one PC. PoW makes spam cost something; only a cap bounds the size.

Proposal (PoW approved by the maintainer, 2026-11-20):
- **Third-party records carry a proof of work.** `ui/src/pow.ts` already exists. The contract checks `leading_zero_bits(blake3(sig)) >= POW_BITS` for comments, likes and log entries written by anyone other than the owner (feed) or by anyone at all (log). `POW_BITS = 12`.
- **Byte budgets, not only counts.** The node limits bytes, so the caps are in bytes, with a margin under the node limit:
  - feed: `MAX_STATE_BYTES = 40 MiB` in total, of which `MAX_THIRD_PARTY_BYTES = 8 MiB` for comments and likes from others;
  - each post: `MAX_COMMENTS = 500`, `MAX_LIKES = 5_000`;
  - each log: `MAX_STATE_BYTES = 40 MiB` and `MAX_ENTRIES = 20_000`;
  - total signed records per state: a ceiling set from the 5 s benchmark.
- **The owner's own content is never evicted by third parties.** It counts toward `MAX_STATE_BYTES`; the owner hits their own limit (already partly bounded by `MAX_POSTS`, `MAX_MEDIA`) and the UI warns before publishing.
- **Deterministic eviction.** When a merge goes over a budget, keep the records with the most PoW bits, then the lowest `(ts, sig)`. Every peer computes the same set.
- **Legacy records** (v1-signed, no PoW) are **exempt from eviction**: nobody can sign new v1 records, so they cannot be used to spam, and every legacy record is carried. They still count toward the byte limits.
- Logs written by the system (inbox, `blocklist/*`, `reports`) keep the same caps. The readers' fold already drops what it does not trust.

### 3. Hex and delta fixes
- `check`/`verify_by`: refuse an `author`, `liker` or key that is not `^[0-9a-f]{64}$` on v3 records. Legacy records keep the v1 rule, so none is lost.
- `compute_delta`: add `d.following_cert = s.following_cert.clone();`, with a test that a delegated following list syncs by delta.

### What does NOT change
- **Radica's web address** (`Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw`). It comes from the `fdev website init radica` signing key, not from the files. `contract.wasm` and `log.wasm` ship inside the app bundle, so `npm run freenet:update` publishes them at the same address.
- **Viso delegations.** They are scoped to Radica's app path, which stays the same, so existing certs keep verifying.
- **The identity delegate** (`identity.wasm`), so the keys stored on the node stay where they are.
- **`media.wasm`**, so images stay at their content keys.

Only the feed and log keys change, and the carry-forward above moves them.

### 4. Rollout
1. Build `contract.wasm` and `log.wasm` v2. Move today's `CURRENT.feed` / `CURRENT.log` to the front of `LEGACY`, and set the new hashes in `CURRENT` (`legacy.test.ts` enforces this).
2. Ship the UI with v3 signing, `migrateOwnFeed` v4, PoW on comments, likes and log appends (with an "is working..." state on slow devices), and v2 contract keys.
3. Feeds and logs are carried forward on read and by the sweeps in section 5. Owners re-sign in v3 at their next sign-in.
4. Keep the `isCanonicalPost` client filter: legacy records stay in the state and may be re-split.

### 5. Carrying all data (no rollback)
This is a one-way security migration: no return to v1. The aim is that **no v1 data is lost**:
- **Every v1 record is accepted by v2** (section 1), and legacy records are exempt from eviction (section 2). A carried state is therefore never refused for its content. It is refused only if it is over the node limits, and those already bound v1.
- **Active sweep, not only on read.** Today a feed or log moves when someone opens it. Contracts nobody opens during the transition could drop off the network, because peers stop hosting state nobody requests. Three sweeps prevent that:
  1. at sign-in, the client carries its own feed, its own logs and the feeds it follows;
  2. the attester bot (always online) walks the authors it knows from `directory`, `communities` and the other public logs and carries every feed and log it finds under `LEGACY`;
  3. the retry shortcut in `fromLegacy` goes away: a probe that timed out is retried with backoff, instead of being marked done.
- **Owners re-sign** in v3 at sign-in (`migrateOwnFeed` v4), so their records also gain lowercase hex and PoW-free owner status.
- **Check before release:** run the sweep against a copy of today's network data (attester node) and count v1 records vs v2 records per contract; they must match.

## Testing & Verification
- Rust: v3 and legacy signatures accepted; a re-split legacy record refused; caps keep the same set regardless of merge order (property test); PoW below the threshold refused; uppercase refused; `following_cert` in the delta.
- UI: `crypto.test.ts` shared length-prefix vectors; `legacy.test.ts`; a carry-forward test pushing a real v1 state fixture into v2.
- `npm test`, `npm run build`, `cargo test` in `contract/` and `log-contract/`, `graphify update .`.
- Update `ui/src/updates.ts`, `CHANGELOG.md`, `CONTEXT.md` (new invariants: v3 messages, PoW, caps).

## Open questions
1. ~~PoW on third-party writes~~: yes, `POW_BITS = 12` (decided 2026-11-20).
2. ~~Node state limit~~: 50 MiB (`MAX_STATE_SIZE`), budgets at 40 MiB.
3. ~~Rollback~~: none; one-way migration that carries every v1 record (decided 2026-11-20).
4. The count ceiling per state: set from the Ed25519-in-WASM benchmark against the 5 s execution limit.

## Status
⚪ **TODO** (2026-11-20)
