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
  retractBody, budget, shouldHold, categoryDisabled, applyHoldOutcomes, modsOf, CATEGORIES,
  foldCommunitiesState, freshChatMessages, decideChatAction, openGreenhouseSeeds, buildGithubSyncMessages, parseGithubMatches,
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
const GITHUB_REPO = env.GITHUB_REPO ?? "scobru/radica";
const GITHUB_TOKEN = env.GITHUB_TOKEN || "";
const GH_POLL_MS = Number(env.GH_POLL_MS || 30 * 60_000);
const GARDENER_COMMUNITIES = env.GARDENER_COMMUNITIES ? new Set(env.GARDENER_COMMUNITIES.split(",").map((s) => s.trim()).filter(Boolean)) : null;
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
const loadMod = async () => {
  const base = existsSync(modFile) ? JSON.parse(await readFile(modFile, "utf8")) : {};
  return { judged: [], used: null, heldTargets: {}, categoryStats: {}, seenChat: [], chatStrikes: {}, lastGhSha: "", ...base };
};
const saveMod = (state) => writeFile(modFile, JSON.stringify(state));

async function askRaw(messages) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${MOD_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MOD_MODEL, temperature: 0, messages }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`OpenRouter HTTP ${r.status}`);
  return (await r.json()).choices?.[0]?.message?.content ?? "";
}
const askModel = (posts) => askRaw(buildMessages(posts));

async function globalProtectedSet(api, extraKeys = []) {
  const maintainerLog = Object.values((await getEntries(api, `blocklist/${MOD_MAINTAINER}`)) ?? {});
  return new Set([MOD_MAINTAINER, ...modsOf(maintainerLog, MOD_DEFAULT_MODS), ...extraKeys.filter(Boolean)]);
}

async function signCommunityChat(modSk, communityId, text) {
  const sender = bytesToHex(await ed.getPublicKeyAsync(modSk));
  const room_id = `comm_${communityId}`;
  const timestamp = Date.now();
  const id = `msg_${timestamp}_${bytesToHex(crypto.getRandomValues(new Uint8Array(3)))}`;
  const msg = `${id}:${room_id}:${sender}:community:${text}:${timestamp}`;
  const sig = bytesToHex(await ed.signAsync(new TextEncoder().encode(msg), modSk));
  return { id, room_id, sender, community_id: communityId, text, timestamp, sig };
}

/** Patrol public community chats where The Gardener is an active moderator: warn 1st offense, ban + delete on 2nd. */
async function chatModPass(api, modSk, modPk, mod, globalProtected, b) {
  const comms = foldCommunitiesState(await getEntries(api, "communities"), MOD_MAINTAINER, [modPk]).filter((c) => c.moderators.has(modPk) && (!GARDENER_COMMUNITIES || GARDENER_COMMUNITIES.has(c.id)));
  if (!comms.length) return;
  const seenChat = new Set(mod.seenChat ?? []);
  let strikes = { ...(mod.chatStrikes ?? {}) };
  let dirty = false;
  for (const comm of comms) {
    if (b.requestsLeft <= 0) break;
    const chatProtected = new Set([...globalProtected, comm.creator, ...comm.moderators]);
    const msgs = freshChatMessages(await getEntries(api, `community-chat/${comm.id}`), comm, seenChat, chatProtected);
    for (let i = 0; i < msgs.length && b.requestsLeft > 0; i += BATCH, b.requestsLeft--) {
      const batch = msgs.slice(i, i + BATCH);
      b.used.requests++;
      let verdicts = null;
      try { verdicts = parseVerdicts(await askModel(batch), batch.length); } catch (e) { log("[gardener:chat] model unreachable:", e.message || e); }
      if (!verdicts) continue;
      for (const v of verdicts) {
        const msg = batch[v.i];
        const decision = decideChatAction(strikes, comm.id, msg.sender, chatProtected);
        strikes = decision.nextStrikes;
        const short = msg.sender.slice(0, 8);
        if (decision.action === "warn") {
          const warnTxt = `⚠️ @${short}: The Gardener flagged ${v.category} (${v.reason}). Please keep r/${comm.slug} clean — next violation leads to a ban.`;
          const chatMsg = await signCommunityChat(modSk, comm.id, warnTxt);
          await append(api, `community-chat/${comm.id}`, await signEntry(modSk, `community-chat/${comm.id}`, APP, { type: "chat", message: chatMsg }));
          log("[gardener:chat] warned", short, "in", comm.slug, v.category);
        } else if (decision.action === "ban") {
          await append(api, `community-chat/${comm.id}`, await signEntry(modSk, `community-chat/${comm.id}`, APP, { type: "chat_delete", roomId: `comm_${comm.id}`, messageId: msg.msgId }));
          await append(api, "communities", await signEntry(modSk, "communities", APP, { type: "community_ban", community_id: comm.id, target: msg.sender }));
          const banTxt = `🌱 The Gardener banned @${short} from r/${comm.slug} after a prior warning (${v.category}).`;
          const chatMsg = await signCommunityChat(modSk, comm.id, banTxt);
          await append(api, `community-chat/${comm.id}`, await signEntry(modSk, `community-chat/${comm.id}`, APP, { type: "chat", message: chatMsg }));
          log("[gardener:chat] banned", short, "from", comm.slug, v.category);
        }
      }
      for (const m of batch) seenChat.add(m.key);
      dirty = true;
    }
  }
  if (dirty) {
    mod.seenChat = [...seenChat].slice(-2000);
    mod.chatStrikes = strikes;
  }
}

async function ghFetch(path, init = {}) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "radica-gardener", ...(GITHUB_TOKEN ? { authorization: `Bearer ${GITHUB_TOKEN}` } : {}), ...init.headers };
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
  return r.json();
}

/** Watch Greenhouse proposals against GitHub commits (and optionally mirror/close GitHub Issues when GITHUB_TOKEN is set). */
async function greenhousePass(api, modSk, modPk, mod, b) {
  if (!GITHUB_REPO) return;
  const openSeeds = openGreenhouseSeeds(await getEntries(api, "greenhouse"), MOD_MAINTAINER, [modPk]);
  if (!openSeeds.length) return;
  const markDone = async (id, why) => {
    await append(api, "greenhouse", await signEntry(modSk, "greenhouse", APP, { type: "status", seed: id, status: "done" }));
    log("[gardener:gh] marked done:", id, why);
  };
  if (GITHUB_TOKEN) {
    try {
      const issues = await ghFetch("/issues?labels=greenhouse&state=all&per_page=100");
      for (const iss of issues) {
        if (iss.state !== "closed") continue;
        const m = /Seed ID:\s*`?([^\s`]+)`?/.exec(iss.body ?? "");
        if (m && openSeeds.some((s) => s.id === m[1])) await markDone(m[1], `issue #${iss.number} closed`);
      }
      const existingIds = new Set(issues.map((i) => /Seed ID:\s*`?([^\s`]+)`?/.exec(i.body ?? "")?.[1]).filter(Boolean));
      for (const s of openSeeds.filter((x) => !existingIds.has(x.id)).slice(0, 5)) {
        const body = `Seed ID: \`${s.id}\`\nKind: ${s.kind}\nPermalink: #greenhouse&seed=${encodeURIComponent(s.id)}\n\n${s.text || "_No extra description._"}`;
        await ghFetch("/issues", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: `[Greenhouse] ${s.title}`, body, labels: ["greenhouse"] }) });
        log("[gardener:gh] opened issue for", s.id);
      }
    } catch (e) { log("[gardener:gh] issues sync skipped:", e.message || e); }
  }
  if (b.requestsLeft <= 0) return;
  try {
    const rawCommits = await ghFetch("/commits?per_page=25");
    const headSha = rawCommits?.[0]?.sha ?? "";
    if (!headSha || headSha === mod.lastGhSha) return;
    const commits = rawCommits.map((c) => ({ sha: c.sha, message: c.commit?.message ?? "" }));
    b.used.requests++; b.requestsLeft--;
    const matches = parseGithubMatches(await askRaw(buildGithubSyncMessages(openSeeds.slice(0, 20), commits)), new Set(openSeeds.map((s) => s.id)));
    for (const m of matches) await markDone(m.id, `${m.sha}: ${m.reason}`);
    mod.lastGhSha = headSha;
  } catch (e) { log("[gardener:gh] commit check skipped:", e.message || e); }
}

/** Checks the maintainer's and every mod's own blocklist log once for what they decided about each held target,
 *  folding any decision found into `categoryStats` and returning the targets to stop tracking (they are decided). */
async function resolveHeldOutcomes(api, heldTargets, categoryStats) {
  if (!Object.keys(heldTargets).length) return { heldTargets, categoryStats, resolved: [] };
  const maintainerLog = Object.values((await getEntries(api, `blocklist/${MOD_MAINTAINER}`)) ?? {});
  const mods = modsOf(maintainerLog, MOD_DEFAULT_MODS);
  const entries = [...maintainerLog];
  for (const m of mods) entries.push(...Object.values((await getEntries(api, `blocklist/${m}`)) ?? {}));
  return applyHoldOutcomes(heldTargets, categoryStats, entries);
}

/** Read the recent public posts, ask the model about the ones not judged yet, report (and sometimes hold) the
 *  flagged ones. Before any of that: fold in what moderators decided about posts the bot is already holding, since
 *  that decides whether each category keeps holding (see moderator.js's categoryDisabled) and retracts the hold
 *  from the bot's own tracking once a human has acted on it (the "reports" log entry itself is theirs to keep). */
async function modPass(api, modSk, modPk, extraProtected = [], runGithubSync = false) {
  const mod = await loadMod();
  const judged = new Set(mod.judged);
  const protectedSet = await globalProtectedSet(api, [modPk, ...extraProtected]);
  const resolution = await resolveHeldOutcomes(api, mod.heldTargets ?? {}, mod.categoryStats ?? {});
  const heldTargets = resolution.heldTargets;
  const categoryStats = resolution.categoryStats;
  const disabled = new Set(CATEGORIES.filter((c) => categoryDisabled(categoryStats, c)));
  if (resolution.resolved.length) {
    log(`[mod] ${resolution.resolved.length} held post(s) decided by a moderator` + (disabled.size ? `; holding is off for: ${[...disabled].join(", ")}` : ""));
    // persist resolved holds immediately so a 0-post pass never leaves them to be double-counted after restart
    await saveMod({ ...mod, judged: [...judged], heldTargets, categoryStats });
  }

  const posts = [];
  const authors = recentAuthors(await getEntries(api, "directory"));
  const edits = postEdits(await getEntries(api, "post-edits"));
  for (let i = 0; i < authors.length; i += 4) // four feeds at a time: a missing one takes the whole timeout
    for (const [k, raw] of (await Promise.all(authors.slice(i, i + 4).map((a) => getFeed(api, a)))).entries()) posts.push(...freshPosts(raw, authors[i + k], judged, Date.now(), edits, protectedSet));
  const b = budget(mod.used, MOD_LIMITS);
  let { used, requestsLeft, reportsLeft, holdsLeft } = b;
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
    await saveMod({ ...mod, judged: [...judged], used, heldTargets, categoryStats });
  }
  const rem = { used, requestsLeft, reportsLeft, holdsLeft };
  await chatModPass(api, modSk, modPk, mod, protectedSet, rem).catch((e) => log("[gardener:chat] failed:", e.message || e));
  if (runGithubSync) await greenhousePass(api, modSk, modPk, mod, rem).catch((e) => log("[gardener:gh] failed:", e.message || e));
  await saveMod({ ...mod, judged: [...judged], used: rem.used, heldTargets, categoryStats });
  log(`[mod] ${authors.length} feeds, ${posts.length} new posts, ${flagged} reported (${held} held, ${retracted} retracted), ${rem.used.requests}/${MOD_LIMITS.requests} requests, ${rem.used.holds}/${MOD_LIMITS.holds} holds today`);
}

const sk = await loadKey();
const attesterPk = bytesToHex(await ed.getPublicKeyAsync(sk));
log("attester key (add to RECEIPT_ISSUERS):", attesterPk);
const st = await loadState();
const modSk = MOD_KEY ? await loadKey("moderator.key") : null;
const modPk = modSk ? bytesToHex(await ed.getPublicKeyAsync(modSk)) : "";
if (modSk) log("The Gardener (AI helper) on, model", MOD_MODEL, "- reports/mods as", modPk);
let modNext = 0, ghNext = 0;
for (;;) {
  try {
    const api = await connect();
    log("connected to", NODE_WS);
    for (;;) {
      await pass(api, sk, st);
      if (modSk && Date.now() >= modNext) {
        modNext = Date.now() + MOD_POLL_MS;
        const doGh = Date.now() >= ghNext;
        if (doGh) ghNext = Date.now() + GH_POLL_MS;
        await modPass(api, modSk, modPk, [attesterPk], doGh).catch((e) => log("[mod] pass failed:", e.message || e)); // never in the way of receipts
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } catch (e) {
    log("error, retrying in 30s:", e.message || e);
    await new Promise((r) => setTimeout(r, 30_000));
  }
}
