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

**The 5 s limit binds first.** `validate_state` re-verifies every signature in the state. `update_state` verifies only the incoming delta, but a first PUT (including every carry-forward from `LEGACY`) goes through `validate_state`.

Benchmark (2026-11-20, `contract/bench/`): today's `contract` built `opt-level = "z"` for `wasm32-unknown-unknown`, with `validate` (parse + full re-validation) run in Node 22 (V8) on a 4-core container. Feeds of 200-byte posts and comments, likes and comments by distinct keys:

| Signed records | State | Full validation | Per record |
|---|---|---|---|
| 2,100 | 0.8 MiB | 0.42 s | 202 µs |
| 10,100 | 3.7 MiB | 1.97 s | 195 µs |
| 20,200 | 7.4 MiB | 3.90 s | 193 µs |
| 40,100 | 14.6 MiB | 7.78 s | 194 µs |

About **195 µs per signed record**, almost all of it Ed25519 `verify_strict`. The 5 s limit is reached at about 25k records, or about 9 MiB of ordinary text, long before 50 MiB. The node runs wasmtime with fuel metering on CPUs that may be slower than this one, so the real ceiling is lower. **This is already true for v1**: a feed with more than about 25k records cannot be PUT, and so cannot be carried forward either.

**Why caps are needed even with PoW.** Without caps:
- **The feed gets bricked.** Once a feed or log is near the limit, every update that grows it is refused, so the owner can no longer post. Anyone can trigger this with comments or likes, because keys and ids are free.
- **Readers pay for it.** Every reader downloads and parses up to 50 MiB per feed. The page keeps each feed in `localStorage` (`freenet_feed_<pk>`, usually a 5–10 MB quota), so the write fails and the feed stops being cached.
- **PoW alone does not stop it.** A 4 KB comment at 12 bits costs about 4k hashes. Filling 50 MiB takes about 13k comments, or 50M hashes: a few minutes on one PC. PoW makes spam cost something; only a cap bounds the size.

Proposal (PoW approved by the maintainer, 2026-11-20):
- **Third-party records carry a proof of work.** `ui/src/pow.ts` already exists. The contract checks `leading_zero_bits(blake3(v3 message)) >= POW_BITS`, where the message includes a `nonce` the client grinds by hashing alone and then signs once (an Ed25519 signature is deterministic, so grinding the signature would mean re-signing each try) for comments, likes and log entries written by anyone other than the owner (feed) or by anyone at all (log). `POW_BITS = 12`.
- **Count caps, evicting only records by others** (`contract/src/lib.rs`):
  - `MAX_POSTS = 4_000` (was 10,000); the owner's own records are never evicted;
  - each post: `MAX_COMMENTS_PER_POST = 500`, `MAX_LIKES_PER_POST = 2_000`;
  - each feed: `MAX_OTHERS_COMMENTS = 2_500` (at most ~11 MB with 4 KB comments), `MAX_OTHERS_LIKES = 3_500`;
  - about 10,000 signed records at most, about 2 s measured: a 2.5× margin for slower nodes and fuel metering;
  - `MAX_STATE_BYTES = 38 MiB`: a merge that would exceed it is refused, never evicted.
  - **Why counts and not bytes:** eviction keeps the top N of a strict total order, so `merge` stays independent of order (`cap(cap(A ∪ B) ∪ C) = cap(A ∪ B ∪ C)`). A byte budget breaks that, because records of different sizes displace each other unevenly. Hence only a hard refusal on bytes.
- **Deterministic eviction.** Keep order: v3 before legacy, then more PoW bits, then older `ts`, then signature, post id and key.
- **Legacy records rank last.** *Correction:* anyone can still sign a legacy-format record with their own key, for free, so legacy records cannot be privileged. Under the caps, every carried record is kept. In a spam wave, v3 records with PoW push them out first. Free legacy spam can push out real legacy comments (ordered by a self-declared `ts`). That loss is bounded by the caps and is visible as spam, which the UI moderation hides. If it turns out to matter: when an owner re-signs a post in v3, the post would list the legacy comments to keep. Not done now.
- **Optional speed-up:** Ed25519 batch verification (`ed25519-dalek` `batch` feature) is about 2× faster on large states. It needs its own benchmark, and a fallback to single verification to find which record is bad.
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
4. ~~Count ceiling~~: `MAX_RECORDS = 10_000` per state, from the benchmark above. Before release, measure today's largest real feeds and logs (attester node): a legacy state over 10,000 records cannot be both carried and kept under 5 s, and would need splitting (for example, moving older log entries to an archive log).

## Status
🟡 **IN PROGRESS** (2026-11-20): feed contract v3 written and tested (`contract/src/lib.rs`), not shipped. Next: UI v3 signing + PoW + `contract.wasm` swap (ship together), then `log-contract`.
