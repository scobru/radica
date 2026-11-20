# Radica attester

Bot that turns donations into supporter badges with no human in the loop:

1. A supporter makes a ZK proof on the donate page and pastes the `RADICA-ZK-V1:` token in Radica, which publishes it
   in the Freenet log `supporter-claims`.
2. The attester reads new claims, checks each one:
   - the proof is for the same Radica key that published the claim;
   - the scope, chain, contract and tier group are Radica's;
   - the donation (nullifier) was not already attested for another key;
   - `Semaphore.verifyProof` accepts it on-chain.
3. For a valid claim it signs a supporter receipt and publishes it in the log `supporter-receipts`; Radica picks it up
   and activates the badge.

The attester never learns which wallet donated, and every claim stays public, so anyone can re-check its work.

## Run

From the repository root, on a machine with Docker:

```bash
docker compose -f attester/docker-compose.yml up -d --build
```

```bash
docker compose -f attester/docker-compose.yml logs -f attester
```

The first start prints `attester key (add to RECEIPT_ISSUERS): <pubkey>`. Add that key to `RECEIPT_ISSUERS` in
`ui/src/supporter.ts` and publish Radica: until then, Radica ignores its receipts.

The key is in the `attester-data` volume (`/data/attester.key`). Back it up. If it leaks, remove it from
`RECEIPT_ISSUERS`: the thief can only mint badges, never touch funds.

### CapRover

One app runs both the node and the bot (`attester/Dockerfile.caprover`, via `captain-definition` at the repo root).

1. CapRover → Apps → create `radica-attester`, tick **Has Persistent Data**.
2. App Configs → Persistent Directories: `/data` (the bot's key and state) and `/root/.local/share/freenet` (node data).
3. Deployment: deploy this repository (Method 3, GitHub repo + branch `master`), or from your PC: `caprover deploy`.
4. Logs (App → Deployment → View app logs) print the attester key.

No port needs to be exposed. Freenet comes from its official installer (prebuilt binary), so the build is quick.

Settings (environment): `FREENET_WS`, `RADICA_APP` (Radica's app path), `RPC_URLS` (comma separated), `POLL_MS`,
`DATA_DIR`. Chain addresses come from `donate-app/src/config.js`.

## AI moderation helper

Optional, off by default. With `OPENROUTER_API_KEY` set, the same process also reads the public posts written in the last week, and edited ones again after each edit,
(the feeds of whoever is in the public directory), asks a model which ones are spam, a scam, a threat, illegal content
or doxxing, and adds a report for those to the public `reports` log: the queue the moderators see in Blocklists. Its
reports start with `[AI]`.

Its key (`/data/moderator.key`, printed at start as `reports as <pubkey>`) is separate from the attester's, is no
moderator and sits on nobody's blocklist. Do not name this key a moderator. It never reads chats or private rooms.

For `threat`, `illegal` and `doxxing` (and `scam` only when the model says `confidence: high`), its report also
**holds** the post: hidden at once, no timeout, for everyone following Radica's moderation (same reach as a
moderator's own Remove), while the author still sees their own post and the queue shows it first, marked
"⏸ held by the AI helper". Before holding (never before reporting) it asks the model a second time about that one
post alone, so a post cannot talk it into holding the ones around it. A moderator's **Dismiss** lifts the hold at
once; **Remove** replaces it with their own, permanent one. If the author edits a held post and it no longer
deserves the report, the bot retracts it on its own next pass.

If a category's holds keep getting Dismissed rather than Removed — half or more of at least 3 decided — the bot
stops holding for that category (back to report-only) until a human changes that; it never affects the other
categories, and a category with no decided holds yet is never judged.

Settings (environment):

- `OPENROUTER_API_KEY`: the key. On CapRover: App Configs → Environmental Variables. Never commit it.
- `MOD_MODEL` (default `openrouter/free`), `MOD_POLL_MS` (default 15 minutes).
- `MOD_DAILY_REQUESTS` (default 40; ten posts go in one request, plus one more for each post it double-checks before
  holding), `MOD_DAILY_REPORTS` (default 20) and `MOD_DAILY_HOLDS` (default 5): a ceiling per day, so a flood of
  posts or a post written to fool the model cannot use up the quota, fill the queue, or hide too much at once.
- `RADICA_MAINTAINER`, `RADICA_DEFAULT_MODS` (comma separated): whose blocklists decide a hold's outcome (and who remain immune alongside community owners/moderators). Defaults to Radica's own (`ui/src/types.ts`).
- `GITHUB_REPO` (default `scobru/radica`), `GH_POLL_MS` (default 30 minutes), `GITHUB_TOKEN` (optional): enables **🌱 The Gardener** to watch public GitHub commits (and mirror/close labeled `greenhouse` Issues when `GITHUB_TOKEN` is set) and automatically set resolved Greenhouse proposals to `done`.
- `GARDENER_COMMUNITIES` (optional, comma-separated community IDs e.g. `c_radica,c_tech`): when set, restricts chat moderation strictly to those communities (when omitted, The Gardener patrols every public community where it has been added as moderator).
- **Community chat gardening (opt-in)**: promote or remove The Gardener via `Community Moderation Panel` or the chat Community Info drawer (moderator/owner only: `Add Gardener` / `Delete Gardener`) so it monitors `community-chat/<id>`, posts a warning on a 1st offense, and bans + removes the message on a 2nd offense (private E2EE rooms are never read).

The text of public posts goes to OpenRouter and to the model it picks (see TERMS.md, section 6).

## FreeTunes check

Optional, off by default. With `FT_CHECK=1` the same process reads the FreeTunes public directory, opens each listed release
and looks every track up on [MusicBrainz](https://musicbrainz.org) (artist + title, exact match after ignoring case, accents
and brackets). A track that exists there gets a `copyright` report in FreeTunes' `reports` contract, the queue its
moderator sees at `#/admin`; the note starts with `[AI]` and names the MusicBrainz recording. It only reports: nothing is
hidden, and an artist posting their own song that is already on MusicBrainz is for the moderator to dismiss.

The bot signs its reports with its own ante identity (`/data/ante.key`, printed at start) and grinds the 18-bit proof of
work FreeTunes asks for (about a second per report). It never uses a model: no `OPENROUTER_API_KEY` is needed.

Settings (environment): `FT_CHECK` (on when set), `FT_POLL_MS` (default 30 minutes), `FT_DAILY_LOOKUPS` (default 300),
`FT_DAILY_REPORTS` (default 20), `MB_USER_AGENT` (default `radica-attester/1`; MusicBrainz asks for a contact in it),
`FT_DIRECTORY` and `FT_REPORTS` (the contracts' instance ids; defaults match FreeTunes' published contracts).

Needs the FreeTunes reports contract to exist already (the first FreeTunes visitor creates it). Each track's artist and
title go to MusicBrainz (see TERMS.md, section 6).

## Contract sweep

After a new `contract.wasm` or `log.wasm`, readers carry a feed or log forward when they open it (`ui/src/legacy.ts`).
The attester moves the rest, in the background: the shared logs (`directory`, `communities`, `supporter-receipts`, …),
and for each person in `directory` their feed and their own logs (`inbox/<key>`, `blocklist/<key>`, …). Each pass it
checks `SWEEP_PER_PASS` of each kind; one found only under an earlier build listed in `LEGACY` is PUT under the
current one (`src/sweep.js`). Progress is kept per build pair in `data/swept-<feed>-<log>.json`; a lookup that fails is
retried on later passes, up to 3 times. Chats and rooms are carried by their members.

Settings (environment): `SWEEP` (`0` turns it off), `SWEEP_PER_PASS` (default 5), `LEGACY_TS` (default
`../ui/src/legacy.ts`, copied into the image).

## Test

```bash
npm install && npm test
```

Needs `ui` and `donate-app` dependencies installed: the tests check receipts and log signatures against Radica's own code.
