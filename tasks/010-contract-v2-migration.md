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
- The contract verifies the v3 message first. If that fails, it falls back to the old message **only when the fields are canonical**: the same rules as `isCanonicalPost` in Rust, plus a profile `display_name` without `:` and a log entry `id` without `:`. A v1 record that fails both is refused.
- `migrateOwnFeed` (marker `radica_feed_v4_<pk>`) re-signs the user's own posts, profile, following list and deletions in v3 at sign-in, as v3 does today.
- Delegated signatures (`Cert`, Viso) follow the same rule: v3 message first, legacy message as the fallback.

### 2. Caps that bound size without letting spam evict real content
**Why caps are needed even with PoW.** Freenet refuses a contract state above its size limit (about 39 MB per the maintainer; check the exact value in freenet-core before fixing the constants). Without caps:
- **The feed gets bricked.** Once a feed or log is near the limit, every update that grows it is refused, so the owner can no longer post. Anyone can trigger this with comments or likes, because keys and ids are free.
- **Readers pay for it.** Every reader downloads and parses up to 39 MB per feed. The page keeps each feed in `localStorage` (`freenet_feed_<pk>`, usually a 5–10 MB quota), so the write fails and the feed stops being cached.
- **PoW alone does not stop it.** A 4 KB comment at 12 bits costs about 4k hashes. Filling 39 MB takes about 10k comments, or 40M hashes: a few minutes on one PC. PoW makes spam cost something; only a cap bounds the size.

Proposal (PoW approved by the maintainer, 2026-11-20):
- **Third-party records carry a proof of work.** `ui/src/pow.ts` already exists. The contract checks `leading_zero_bits(blake3(sig)) >= POW_BITS` for comments, likes and log entries written by anyone other than the owner (feed) or by anyone at all (log). `POW_BITS = 12`.
- **Byte budgets, not only counts.** The node limits bytes, so the caps are in bytes, with a margin under the node limit:
  - feed: `MAX_STATE_BYTES = 32 MB` in total, of which `MAX_THIRD_PARTY_BYTES = 8 MB` for comments and likes from others;
  - each post: `MAX_COMMENTS = 500`, `MAX_LIKES = 5_000`;
  - each log: `MAX_STATE_BYTES = 32 MB` and `MAX_ENTRIES = 20_000`.
- **The owner's own content is never evicted by third parties.** It counts toward `MAX_STATE_BYTES`; the owner hits their own limit (already partly bounded by `MAX_POSTS`, `MAX_MEDIA`) and the UI warns before publishing.
- **Deterministic eviction.** When a merge goes over a budget, keep the records with the most PoW bits, then the lowest `(ts, sig)`. Every peer computes the same set.
- **Legacy records** (v1, no PoW) count as 0 bits. They are carried forward and kept while under the cap, and are the first to go when a spam wave arrives.
- Logs written by the system (inbox, `blocklist/*`, `reports`) keep the same caps. The readers' fold already drops what it does not trust.

### 3. Hex and delta fixes
- `check`/`verify_by`: refuse an `author`, `liker` or key that is not `^[0-9a-f]{64}$`. Legacy uppercase records cannot be carried forward. They are very unlikely (every client writes lowercase hex), and acceptable.
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
3. On first read, each feed or log is carried forward by whoever opens it. Owners re-sign in v3 at their next sign-in.
4. Keep the `isCanonicalPost` client filter for one release, then remove it once v3 is the only signature format being written. The contract still checks legacy records.

### 5. Rollback
The old generation is never deleted: v1 states stay at their old keys. Rolling back means shipping the previous `CURRENT` hashes. Anything written only under v2 since the switch would then have to be carried back, which the code does not do today. So rollback is "lose writes since the switch". Decide before shipping whether that is acceptable or whether the UI should dual-write for one release.

## Testing & Verification
- Rust: v3 and legacy signatures accepted; a re-split legacy record refused; caps keep the same set regardless of merge order (property test); PoW below the threshold refused; uppercase refused; `following_cert` in the delta.
- UI: `crypto.test.ts` shared length-prefix vectors; `legacy.test.ts`; a carry-forward test pushing a real v1 state fixture into v2.
- `npm test`, `npm run build`, `cargo test` in `contract/` and `log-contract/`, `graphify update .`.
- Update `ui/src/updates.ts`, `CHANGELOG.md`, `CONTEXT.md` (new invariants: v3 messages, PoW, caps).

## Open questions
1. ~~PoW on third-party writes~~: yes, `POW_BITS = 12` (decided 2026-11-20).
2. The exact node state limit (about 39 MB): confirm it in freenet-core, then fix the byte budgets with a margin.
3. Rollback strategy: accept losing writes since the switch, or dual-write for one release.

## Status
⚪ **TODO** (2026-11-20)
