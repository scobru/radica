// Radica attester bot: reads supporter claims (ZK proofs) from a Freenet log, checks them on-chain, and publishes a
// signed supporter receipt for each valid one. Its key must be listed in ui/src/supporter.ts RECEIPT_ISSUERS.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3.js";
import { createPublicClient, fallback, http, parseAbi } from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  ContractContainer, ContractKey, ContractType, DeltaUpdate, FreenetWsApi, GetRequest, PutRequest, UpdateData,
  UpdateDataType, UpdateRequest, WasmContractV1,
} from "@freenetorg/freenet-stdlib";
import { ContractCodeT } from "@freenetorg/freenet-stdlib/common";
import { RelatedContractsT } from "@freenetorg/freenet-stdlib/client-request";
import { CHAIN_ID, RPC_URLS, SUPPORT, SEMAPHORE, GROUPS } from "../../donate-app/src/config.js";
import { CLAIMS_LOG, RECEIPTS_LOG, judgeClaim, issueReceipt, signEntry, bytesToHex, hexToBytes } from "./core.js";
import {
  REPORTS_LOG, BATCH, recentAuthors, postEdits, freshPosts, buildMessages, parseVerdicts, confirmsHold, reportBody,
  retractBody, budget, shouldHold, categoryDisabled, recordHoldOutcome, holdOutcome, modsOf, CATEGORIES,
} from "./moderator.js";

const env = process.env;
const NODE_WS = env.FREENET_WS || "ws://127.0.0.1:7509/v1/contract/command";
const APP = env.RADICA_APP || "/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/";
const DATA = env.DATA_DIR || "./data";
const LOG_WASM = env.LOG_WASM || new URL("../../ui/src/wasm/log.wasm", import.meta.url).pathname;
const POLL_MS = Number(env.POLL_MS || 60_000);
// AI moderation helper (see moderator.js): off unless OPENROUTER_API_KEY is set
const FEED_WASM = env.FEED_WASM || new URL("../../ui/src/wasm/contract.wasm", import.meta.url).pathname;
const MOD_KEY = env.OPENROUTER_API_KEY || "";
const MOD_MODEL = env.MOD_MODEL || "openrouter/free";
const MOD_POLL_MS = Number(env.MOD_POLL_MS || 15 * 60_000);
const MOD_LIMITS = {
  requests: Number(env.MOD_DAILY_REQUESTS || 40),
  reports: Number(env.MOD_DAILY_REPORTS || 20),
  holds: Number(env.MOD_DAILY_HOLDS || 5),
};
// Whose blocklists decide a hold's outcome (same set Radica's own moderation queue reads; see ui/src/types.ts).
const MOD_MAINTAINER = env.RADICA_MAINTAINER || "464b576da4cc5bcf31febd41a863ac251d04024c19f1786b24ca6620a0cce53b";
const MOD_DEFAULT_MODS = env.RADICA_DEFAULT_MODS ? env.RADICA_DEFAULT_MODS.split(",") : ["3ac3e7f1f7535888597dbd8b25e362fa153eb10bfedd1e2df1b50299d7f2bf98"];
const TIMEOUT_MS = 45_000;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Freenet request timeout")), TIMEOUT_MS))]);

async function loadKey(name = "attester.key") {
  await mkdir(DATA, { recursive: true });
  const file = join(DATA, name);
  if (!existsSync(file)) await writeFile(file, bytesToHex(ed.utils.randomPrivateKey()), { mode: 0o600 });
  return hexToBytes((await readFile(file, "utf8")).trim());
}

const stateFile = join(DATA, "attested.json");
async function loadState() {
  if (!existsSync(stateFile)) return { done: new Set(), seen: new Map() };
  const s = JSON.parse(await readFile(stateFile, "utf8"));
  return { done: new Set(s.done), seen: new Map(Object.entries(s.seen)) };
}
const saveState = (st) => writeFile(stateFile, JSON.stringify({ done: [...st.done], seen: Object.fromEntries(st.seen) }));

const code = new Uint8Array(await readFile(LOG_WASM));
const codeHash = blake3(code);
const paramsOf = (name) => new TextEncoder().encode(`radica/${name}|${APP}`);
const keyOf = (name) => new ContractKey(blake3(new Uint8Array([...codeHash, ...paramsOf(name)])), codeHash);

function connect() {
  return withTimeout(new Promise((resolve, reject) => {
    const api = new FreenetWsApi(new URL(NODE_WS), {
      onContractPut() {}, onContractGet() {}, onContractUpdate() {}, onContractUpdateNotification() {},
      onContractNotFound() {}, onDelegateResponse() {},
      onErr: (e) => log("[freenet]", e?.cause ?? e),
      onOpen: () => resolve(api),
      onClose: () => reject(new Error("Freenet WebSocket closed")),
    }, "");
  }));
}

// a persona's feed (contract/): parameters = its 32-byte key || app path, as in ui/src/network.ts
const feedHash = MOD_KEY ? blake3(new Uint8Array(await readFile(FEED_WASM))) : null;
async function getFeed(api, author) {
  const params = new Uint8Array([...hexToBytes(author), ...new TextEncoder().encode(APP)]);
  try {
    const r = await withTimeout(api.get(new GetRequest(new ContractKey(blake3(new Uint8Array([...feedHash, ...params])), feedHash), false, false)));
    return new TextDecoder().decode(Uint8Array.from(r.state));
  } catch {
    return ""; // no feed yet, or not reachable now: looked at again next pass
  }
}

async function getEntries(api, name) {
  try {
    const r = await withTimeout(api.get(new GetRequest(keyOf(name), false, false)));
    return r.state.length ? JSON.parse(new TextDecoder().decode(Uint8Array.from(r.state))).entries ?? {} : {};
  } catch (e) {
    // a log nobody has written to yet is not on the network: the node may time out instead of saying "not found"
    if (/not found|timeout/i.test(String(e?.message ?? e))) return null;
    throw e;
  }
}

async function append(api, name, entry) {
  const bytes = Array.from(new TextEncoder().encode(JSON.stringify({ entries: { [`${entry.author}:${entry.id}`]: entry } })));
  if ((await getEntries(api, name)) === null) {
    const contract = new WasmContractV1(new ContractCodeT(Array.from(code), Array.from(codeHash)), Array.from(paramsOf(name)), keyOf(name));
    await withTimeout(api.put(new PutRequest(new ContractContainer(ContractType.WasmContractV1, contract), bytes, new RelatedContractsT(), true)));
  } else {
    await withTimeout(api.update(new UpdateRequest(keyOf(name), new UpdateData(UpdateDataType.DeltaUpdate, new DeltaUpdate(bytes)))));
  }
}

const chain = CHAIN_ID === base.id ? base : baseSepolia;
const rpcs = env.RPC_URLS ? env.RPC_URLS.split(",") : RPC_URLS;
const pub = createPublicClient({ chain, transport: fallback(rpcs.map((u) => http(u))) });
const semaphoreAbi = parseAbi([
  "struct SemaphoreProof { uint256 merkleTreeDepth; uint256 merkleTreeRoot; uint256 nullifier; uint256 message; uint256 scope; uint256[8] points; }",
  "function verifyProof(uint256 groupId, SemaphoreProof proof) view returns (bool)",
]);
const verifyOnChain = (groupId, p) =>
  pub.readContract({
    address: SEMAPHORE, abi: semaphoreAbi, functionName: "verifyProof",
    args: [groupId, { merkleTreeDepth: BigInt(p.merkleTreeDepth), merkleTreeRoot: BigInt(p.merkleTreeRoot), nullifier: BigInt(p.nullifier), message: BigInt(p.message), scope: BigInt(p.scope), points: p.points.map(BigInt) }],
  });

async function pass(api, sk, st) {
  const claims = (await getEntries(api, CLAIMS_LOG)) ?? {};
  for (const [k, entry] of Object.entries(claims)) {
    if (st.done.has(k)) continue;
    let v;
    try {
      v = await judgeClaim(entry, { chainId: CHAIN_ID, contract: SUPPORT, groups: GROUPS, seen: st.seen, verifyOnChain });
    } catch (e) {
      log("skip for now (chain unreachable):", k, e.shortMessage || e.message); // not marked done: retried next pass
      continue;
    }
    if (v.ok && st.seen.get(v.nullifier) === v.donor) log("already attested", v.tier, v.donor); // a repeated claim: one receipt is enough
    else if (v.ok) {
      const token = await issueReceipt(sk, v.donor, v.tier);
      await append(api, RECEIPTS_LOG, await signEntry(sk, RECEIPTS_LOG, APP, { type: "receipt", donor: v.donor, token }));
      st.seen.set(v.nullifier, v.donor);
      log("attested", v.tier, v.donor);
    } else {
      log("rejected", k, v.reason);
      // answered in the receipts log so the claimant's app can say why (it trusts only issuer-signed entries)
      if (v.reason !== "not a claim")
        await append(api, RECEIPTS_LOG, await signEntry(sk, RECEIPTS_LOG, APP, { type: "rejected", claimant: entry.author, reason: v.reason }));
    }
    st.done.add(k);
    await saveState(st);
  }
}

const modFile = join(DATA, "moderated.json");
const loadMod = async () =>
  existsSync(modFile)
    ? JSON.parse(await readFile(modFile, "utf8"))
    : { judged: [], used: null, heldTargets: {}, categoryStats: {} };

async function askModel(posts) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${MOD_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MOD_MODEL, temperature: 0, messages: buildMessages(posts) }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`OpenRouter HTTP ${r.status}`);
  return (await r.json()).choices?.[0]?.message?.content ?? "";
}

/** Checks the maintainer's and every mod's own blocklist log once for what they decided about each held target,
 *  folding any decision found into `categoryStats` and returning the targets to stop tracking (they are decided). */
async function resolveHeldOutcomes(api, heldTargets, categoryStats) {
  if (!Object.keys(heldTargets).length) return { categoryStats, resolved: [] };
  const maintainerLog = Object.values((await getEntries(api, `blocklist/${MOD_MAINTAINER}`)) ?? {});
  const mods = modsOf(maintainerLog, MOD_DEFAULT_MODS);
  const entries = [...maintainerLog];
  for (const m of mods) entries.push(...Object.values((await getEntries(api, `blocklist/${m}`)) ?? {}));
  const resolved = [];
  for (const [target, category] of Object.entries(heldTargets)) {
    const outcome = holdOutcome(entries, target);
    if (!outcome) continue;
    categoryStats = recordHoldOutcome(categoryStats, category, outcome);
    resolved.push(target);
  }
  return { categoryStats, resolved };
}

/** Read the recent public posts, ask the model about the ones not judged yet, report (and sometimes hold) the
 *  flagged ones. Before any of that: fold in what moderators decided about posts the bot is already holding, since
 *  that decides whether each category keeps holding (see moderator.js's categoryDisabled) and retracts the hold
 *  from the bot's own tracking once a human has acted on it (the "reports" log entry itself is theirs to keep). */
async function modPass(api, modSk) {
  const mod = await loadMod();
  const judged = new Set(mod.judged);
  const heldTargets = { ...(mod.heldTargets ?? {}) };
  let categoryStats = mod.categoryStats ?? {};

  const resolution = await resolveHeldOutcomes(api, heldTargets, categoryStats);
  categoryStats = resolution.categoryStats;
  for (const target of resolution.resolved) delete heldTargets[target];
  const disabled = new Set(CATEGORIES.filter((c) => categoryDisabled(categoryStats, c)));
  if (resolution.resolved.length) log(`[mod] ${resolution.resolved.length} held post(s) decided by a moderator` + (disabled.size ? `; holding is off for: ${[...disabled].join(", ")}` : ""));

  const posts = [];
  const authors = recentAuthors(await getEntries(api, "directory"));
  const edits = postEdits(await getEntries(api, "post-edits"));
  for (let i = 0; i < authors.length; i += 4) // four feeds at a time: a missing one takes the whole timeout
    for (const [k, raw] of (await Promise.all(authors.slice(i, i + 4).map((a) => getFeed(api, a)))).entries()) posts.push(...freshPosts(raw, authors[i + k], judged, Date.now(), edits));
  let { used, requestsLeft, reportsLeft, holdsLeft } = budget(mod.used, MOD_LIMITS);
  let flagged = 0, held = 0, retracted = 0;
  for (let i = 0; i < posts.length && requestsLeft > 0; i += BATCH, requestsLeft--) {
    const batch = posts.slice(i, i + BATCH);
    used.requests++;
    let verdicts = null;
    try {
      verdicts = parseVerdicts(await askModel(batch), batch.length);
    } catch (e) {
      log("[mod] model unreachable:", e.message || e);
    }
    if (verdicts) {
      const flaggedKeys = new Set(verdicts.map((v) => batch[v.i].key));
      for (const v of verdicts) {
        if (reportsLeft <= 0) break;
        const post = batch[v.i];
        let hold = shouldHold(v.category, v.confidence, disabled);
        if (hold && holdsLeft > 0) {
          used.requests++; // the second opinion is its own model call, within the same daily request budget
          let second = null;
          try {
            second = parseVerdicts(await askModel([post]), 1);
          } catch (e) {
            log("[mod] second opinion unreachable:", e.message || e);
          }
          hold = confirmsHold(second, v.category);
        } else {
          hold = false; // cap reached or the category does not hold: report only
        }
        await append(api, REPORTS_LOG, await signEntry(modSk, REPORTS_LOG, APP, reportBody(post, v, hold)));
        log(`[mod] ${hold ? "held" : "reported"}`, post.key, v.category, v.reason);
        used.reports++, reportsLeft--, flagged++;
        if (hold) {
          heldTargets[post.key] = v.category;
          used.holds++, holdsLeft--, held++;
        } else {
          delete heldTargets[post.key]; // a milder re-judgment of a post held before lifts the hold too
        }
      }
      // an edited post that no longer deserves its old hold/report retracts it; one this pass never reached stays as is
      for (const p of batch) {
        judged.add(p.mark);
        if (p.edited && heldTargets[p.key] !== undefined && !flaggedKeys.has(p.key)) {
          await append(api, REPORTS_LOG, await signEntry(modSk, REPORTS_LOG, APP, retractBody(p.key)));
          delete heldTargets[p.key];
          retracted++;
        }
      }
    }
    // shortcut: every judged post is kept forever (a few bytes each), prune by age if the file ever gets big
    await writeFile(modFile, JSON.stringify({ judged: [...judged], used, heldTargets, categoryStats }));
  }
  log(`[mod] ${authors.length} feeds, ${posts.length} new posts, ${flagged} reported (${held} held, ${retracted} retracted), ${used.requests}/${MOD_LIMITS.requests} requests, ${used.holds}/${MOD_LIMITS.holds} holds today`);
}

const sk = await loadKey();
log("attester key (add to RECEIPT_ISSUERS):", bytesToHex(await ed.getPublicKeyAsync(sk)));
const st = await loadState();
const modSk = MOD_KEY ? await loadKey("moderator.key") : null;
if (modSk) log("AI moderation helper on, model", MOD_MODEL, "- reports as", bytesToHex(await ed.getPublicKeyAsync(modSk)));
let modNext = 0;
for (;;) {
  try {
    const api = await connect();
    log("connected to", NODE_WS);
    for (;;) {
      await pass(api, sk, st);
      if (modSk && Date.now() >= modNext) {
        modNext = Date.now() + MOD_POLL_MS;
        await modPass(api, modSk).catch((e) => log("[mod] pass failed:", e.message || e)); // never in the way of receipts
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } catch (e) {
    log("error, retrying in 30s:", e.message || e);
    await new Promise((r) => setTimeout(r, 30_000));
  }
}
