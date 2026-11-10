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

Optional, off by default. With `OPENROUTER_API_KEY` set, the same process also reads the public posts of the last week
(the feeds of whoever is in the public directory), asks a model which ones are spam, a scam, a threat, illegal content
or doxxing, and adds a report for those to the public `reports` log: the queue the moderators see in Blocklists. Its
reports start with `[AI]`.

It only reports. Its key (`/data/moderator.key`, printed at start as `reports as <pubkey>`) is separate from the
attester's, is no moderator and sits on nobody's blocklist, so nothing is hidden until a person removes the post. Keep
it that way: do not name this key a moderator. It never reads chats or private rooms.

Settings (environment):

- `OPENROUTER_API_KEY`: the key. On CapRover: App Configs → Environmental Variables. Never commit it.
- `MOD_MODEL` (default `openrouter/free`), `MOD_POLL_MS` (default 15 minutes).
- `MOD_DAILY_REQUESTS` (default 40; ten posts go in one request) and `MOD_DAILY_REPORTS` (default 20): a ceiling per
  day, so a flood of posts or a post written to fool the model cannot use up the quota or fill the queue.

The text of public posts goes to OpenRouter and to the model it picks (see TERMS.md, section 6).

## Test

```bash
npm install && npm test
```

Needs `ui` and `donate-app` dependencies installed: the tests check receipts and log signatures against Radica's own code.
