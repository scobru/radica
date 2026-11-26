// FreePolls polls in posts: shown with their results, voted on in place, and created from the composer.
// FreePolls (github.com/scobru/freepolls) keeps a poll as JSON in one contract: the owner's signed schema and every
// signed response; the contract checks both, so here the state is only parsed (defensively: it comes from the network).
// The contract binds a poll to the app path in its parameters and checks the owner's Viso delegation for that path, so
// Radica publishes polls under its own path with the delegation it already has; FreePolls opens them from the link.
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3.js";
import type { ContractKey } from "@freenetorg/freenet-stdlib";
import { bytesToHex, hexToBytes } from "./crypto.ts";
import { appPath, getAppKeySecret, getStoredSession } from "./whoiam.ts";
import { keyOf } from "./contractKey.ts";
import { ANTE_CODE_HASH, VOTE_BITS, challengeBytes, checkProof, grind, votePurpose } from "./ante.ts";
import { asBytes, cborDecode, cborEncode, enumVariant, mapGet, type CborValue } from "./cbor.ts";
import { escapeHtml as esc } from "./html.ts";

/** FreePolls' web app: polls created here open there too. */
export const FREEPOLLS_SITE = "9x8dZTsykTPC8n8LxDgwdvAocnqGaw8VVWutdjFggE2a";
export const pollHref = (origin: string, id: string, params: string) => `${origin}/v1/contract/web/${FREEPOLLS_SITE}/#/f/${id}.${params}`;

const ID = "[1-9A-HJ-NP-Za-km-z]{20,60}";
// a poll route, "#/f/<poll id>.<parameters, hex>", anywhere in a caption (an invite link "/i/<secret>" is not read)
const LINK_RE = new RegExp(`#\\/f\\/(${ID})\\.([0-9a-f]{96,})`);

export interface FpQuestion { id: string; text: string; kind: string; options: string[]; counts: number[]; answered: number }
export interface FpPoll { title: string; invite: boolean; responses: number; questions: FpQuestion[]; byKey: Record<string, { answers: Record<string, unknown>; ante: string }> }

/** The poll of the first FreePolls link in a caption: its id and parameters (hex). */
export function freepollsLink(caption: string): { id: string; params: string } | null {
  const m = LINK_RE.exec(caption);
  return m ? { id: m[1], params: m[2] } : null;
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/** A poll contract's state as a tally: per option, how many answered it (`avail`: how many said yes). */
export function parsePoll(state: Uint8Array): FpPoll | null {
  try {
    const st = JSON.parse(new TextDecoder().decode(state));
    const schema = JSON.parse(st.schema_json);
    if (!Array.isArray(schema.questions)) return null;
    const byKey: FpPoll["byKey"] = {};
    for (const [k, r] of Object.entries(st.responses ?? {}) as [string, { answers_json?: unknown; ante?: unknown }][]) {
      try {
        const a = JSON.parse(String(r?.answers_json));
        if (a && typeof a === "object") byKey[k] = { answers: a, ante: str(r.ante, 4096) };
      } catch {}
    }
    const answers = Object.values(byKey).map((r) => r.answers);
    const questions = schema.questions.slice(0, 50).map((q: { id?: unknown; kind?: unknown; text?: unknown; options?: unknown }) => {
      const options = Array.isArray(q.options) ? q.options.slice(0, 50).map((o) => str(o)) : [];
      const counts = options.map(() => 0);
      let answered = 0;
      for (const a of answers) {
        const v = a[str(q.id)] as unknown;
        if (v === undefined) continue;
        answered++;
        if (q.kind === "single" && typeof v === "number" && v in counts) counts[v]++;
        if (q.kind === "multi" && Array.isArray(v)) new Set(v).forEach((i) => typeof i === "number" && i in counts && counts[i]++);
        if (q.kind === "avail" && Array.isArray(v)) v.forEach((x, i) => x === 1 && i in counts && counts[i]++);
      }
      return { id: str(q.id), text: str(q.text, 500), kind: str(q.kind), options, counts, answered };
    });
    return { title: str(schema.title), invite: Array.isArray(schema.allowed), responses: answers.length, questions, byKey };
  } catch {
    return null;
  }
}

/** The placeholder in a post: the same html every draw (the feed reuses unchanged cards), filled in by `fillFreepolls`. */
export const freepollsCard = (caption: string): string => {
  const l = freepollsLink(caption);
  return l ? `<div class="fp-card" data-poll="${l.id}" data-params="${l.params}"><span class="fp-note">▤ FreePolls</span></div>` : "";
};

export interface PollNet {
  get(instance: string): Promise<Uint8Array | null>;
  put(key: ContractKey, code: Uint8Array, params: Uint8Array, state: Uint8Array): Promise<void>;
  update(key: ContractKey, delta: Uint8Array): Promise<void>;
}
// shortcut: results as of the first read this session (and after one's own vote), upgrade to a subscription if people ask for live counts
const polls = new Map<string, Promise<FpPoll | null>>();
const enc = (t: string) => new TextEncoder().encode(t);

/** Inline voting: open polls whose questions are all single or multiple choice. The rest are answered in FreePolls. */
export const votable = (p: FpPoll) => !p.invite && p.questions.length > 0 && p.questions.every((q) => q.kind === "single" || q.kind === "multi");

const rows = (q: FpQuestion, qi: number, input: boolean, mine: unknown) => {
  const max = Math.max(1, q.kind === "avail" ? Math.max(...q.counts) : q.answered);
  const best = q.kind === "avail" && q.counts.some((c) => c > 0) ? q.counts.indexOf(Math.max(...q.counts)) : -1;
  const picked = (i: number) => (Array.isArray(mine) ? mine.includes(i) : mine === i);
  return q.options
    .map((o, i) => {
      const box = input ? `<input type="${q.kind === "multi" ? "checkbox" : "radio"}" name="fpq${qi}" value="${i}"${picked(i) ? " checked" : ""} />` : "";
      return `<li${i === best ? ' class="fp-best"' : ""}><span class="fp-bar" style="width:${Math.round((q.counts[i] / max) * 100)}%"></span><label>${box}<span>${esc(o)}</span></label><b>${q.counts[i]}</b></li>`;
    })
    .join("");
};

type Voter = { pk: string; sign(msg: string): Promise<string> };
// FreePolls' identity delegate (ui/src/identity.wasm there, the same build FH uses): it holds the node's respondent key
const FP_IDENTITY_CODE = "2d6e05fdc311caee01262e8b9cf9a29791f766581be8dc0196a95ab5c61cf5cb";
async function fpIdentity(payload: object): Promise<Record<string, string>> {
  const [{ delegateMessage }, { default: url }] = await Promise.all([import("./delegate.ts"), import("./wasm/freepolls-identity.wasm?url")]);
  const out = JSON.parse(new TextDecoder().decode(await delegateMessage(url, FP_IDENTITY_CODE, enc(JSON.stringify(payload)))));
  if (out.err) throw new Error(out.err);
  return out;
}

let nodeVoter: Promise<Voter | null> | undefined;
/** Who answers polls: the respondent key FreePolls keeps on this node, so a vote cast here is the same vote in
 *  FreePolls (and not linked to the persona). Without that delegate, a key derived per poll from the app key. */
async function voter(instance: string): Promise<Voter> {
  const d = await (nodeVoter ??= fpIdentity({ op: "init", sk: bytesToHex(ed.utils.randomPrivateKey()) }) // the delegate keeps a key it already has
    .then(({ pk }) => ({ pk, sign: async (msg: string) => (await fpIdentity({ op: "sign", msg })).sig }))
    .catch((e) => {
      console.warn("[FreePolls] identity delegate unavailable, voting with a key of this app:", e);
      nodeVoter = undefined;
      return null;
    }));
  if (d) return d;
  const sk = blake3(enc(`radica/freepolls-voter/v1:${instance}`), { key: await getAppKeySecret() });
  return { pk: bytesToHex(await ed.getPublicKeyAsync(sk)), sign: async (msg) => bytesToHex(await ed.signAsync(enc(msg), sk)) };
}

const CONSENT_MS = 75_000; // the node keeps the consent prompt open for 60 s
async function anteCall(req: CborValue, timeoutMs?: number) {
  const [{ delegateMessage }, { default: url }] = await Promise.all([import("./delegate.ts"), import("./wasm/ante-delegate.wasm?url")]);
  const out = enumVariant(cborDecode(await delegateMessage(url, ANTE_CODE_HASH, cborEncode(req), timeoutMs)));
  if (out.variant === "Error") throw new Error(`ante: ${String(mapGet(out.fields!, "message"))}`);
  return out;
}

/** The ante proof (hex) for answering poll `params` as `pk`: the node asks for consent, the page grinds, the node signs.
 *  Same steps as FreePolls' `voteProof` (ui/src/lib.ts there). */
async function voteProof(params: string, pk: string, step: (msg: string) => void): Promise<string> {
  const purpose = votePurpose(params, pk);
  step("Opening your ante identity…");
  const vk = asBytes(mapGet((await anteCall("GetIdentity")).fields!, "verifying_key"));
  step("Your Freenet node asks you to allow a few seconds of anti-spam work: approve it there…");
  const grant = await anteCall({ RequestGrind: { purpose, min_bits: VOTE_BITS } }, CONSENT_MS);
  if (grant.variant === "Denied") throw new Error("You declined the anti-spam work, so the vote was not sent.");
  const challenge = asBytes(mapGet(grant.fields!, "bytes"));
  if (bytesToHex(challenge) !== bytesToHex(challengeBytes(purpose, vk))) throw new Error("ante returned an unexpected challenge");
  const nonce = await grind(challenge, VOTE_BITS, (n) => step(`Working… ${n.toLocaleString()} tries`));
  step("Signing…");
  const signed = await anteCall({ Commit: { purpose, nonce, min_bits: VOTE_BITS, ts: Date.now() } }, CONSENT_MS);
  if (signed.variant === "Denied") throw new Error("You declined the anti-spam work, so the vote was not sent.");
  const proof = asBytes(mapGet(signed.fields!, "proof"));
  await checkProof(proof, purpose); // a bad proof here would only come back from the node as "Request timeout"
  return bytesToHex(proof);
}

const code = async () => new Uint8Array(await (await fetch((await import("./wasm/freepolls.wasm?url")).default)).arrayBuffer());
let codeHash: Promise<string> | undefined;
const pollKey = async (params: string) => keyOf(await (codeHash ??= code().then((c) => bytesToHex(blake3(c)))), hexToBytes(params));

async function vote(card: HTMLElement, poll: FpPoll, net: PollNet, step: (msg: string) => void) {
  const { id, params } = card.dataset as { id: string; params: string };
  const answers: Record<string, number | number[]> = {};
  poll.questions.forEach((q, qi) => {
    const on = Array.from(card.querySelectorAll<HTMLInputElement>(`input[name="fpq${qi}"]:checked`), (x) => Number(x.value));
    if (on.length) answers[q.id] = q.kind === "multi" ? on : on[0];
  });
  if (poll.questions.some((q) => !(q.id in answers))) throw new Error("Answer every question first.");
  const me = await voter(id);
  const key = await pollKey(params);
  // a poll published by other contract code takes no ante proof (FreePolls' needsAnte)
  const ante = key.encode() !== id ? "" : poll.byKey[me.pk]?.ante || (await voteProof(params, me.pk, step));
  const ts = Date.now(), answers_json = JSON.stringify(answers);
  const sig = await me.sign(`fpr1|${params}|${me.pk}|${ts}|${answers_json}`);
  step("Sending…");
  await net.update(key, enc(JSON.stringify({ schema: null, responses: { [me.pk]: { ts, answers_json, sig, ...(ante && { ante }) } } })));
}

// shortcut: polling every LIVE_MS instead of a contract subscription, upgrade when the node client exposes one
const LIVE_MS = 8000;
let liveNet: PollNet | undefined;
let liveTimer: ReturnType<typeof setInterval> | undefined;

/** Update counts and bars of the ready cards in place (inputs and half-made choices stay untouched). */
async function refreshLive(): Promise<void> {
  if (!liveNet || document.hidden) return;
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.fp-card[data-state="ready"]')).slice(0, 20);
  const ids = [...new Set(cards.map((c) => c.dataset.poll!))];
  for (const id of ids) {
    const poll = await liveNet.get(id).then((s) => (s ? parsePoll(s) : null)).catch(() => null);
    if (!poll) continue;
    polls.set(id, Promise.resolve(poll));
    for (const card of cards.filter((c) => c.dataset.poll === id && c.isConnected)) {
      const qEls = card.querySelectorAll<HTMLElement>(".fp-q");
      if (qEls.length !== poll.questions.length) continue;
      const head = card.querySelector(".fp-head small");
      if (head) head.textContent = head.textContent!.replace(/^\d+ responses?/, `${poll.responses} ${poll.responses === 1 ? "response" : "responses"}`);
      poll.questions.forEach((q, qi) => {
        const max = Math.max(1, q.kind === "avail" ? Math.max(...q.counts) : q.answered);
        qEls[qi].querySelectorAll<HTMLElement>("li").forEach((li, i) => {
          if (q.counts[i] === undefined) return;
          li.querySelector("b")!.textContent = String(q.counts[i]);
          (li.querySelector(".fp-bar") as HTMLElement).style.width = `${Math.round((q.counts[i] / max) * 100)}%`;
        });
      });
    }
  }
}

/** Fill the FreePolls placeholders under `root` that are not filled yet: title, questions, results and, where it can
 *  be done here, the ballot. */
export function fillFreepolls(root: ParentNode, net: PollNet): void {
  liveNet = net;
  liveTimer ??= setInterval(() => void refreshLive(), LIVE_MS);
  root.querySelectorAll<HTMLElement>(".fp-card:not([data-state])").forEach((card) => {
    card.dataset.state = "loading";
    const id = card.dataset.poll!;
    card.dataset.id = id;
    let p = polls.get(id);
    if (!p) polls.set(id, (p = net.get(id).then((s) => (s ? parsePoll(s) : null)).catch(() => null)));
    void p.then(async (poll) => {
      if (!poll) return void ((card.dataset.state = "missing"), (card.innerHTML = `<span class="fp-note">▤ FreePolls: poll not found on the network</span>`));
      card.dataset.state = "ready";
      const ballot = votable(poll);
      const mine = ballot ? poll.byKey[(await voter(id).catch(() => null))?.pk ?? ""]?.answers : undefined;
      const qs = poll.questions
        .map((q, qi) => `<div class="fp-q"><b>${esc(q.text)}</b>${q.kind === "text" ? `<small>${q.answered} written answers</small>` : `<ul>${rows(q, qi, ballot, mine?.[q.id])}</ul>`}</div>`)
        .join("");
      const how = ballot ? "" : " · vote with the link above";
      card.innerHTML =
        `<div class="fp-head"><b>▤ ${esc(poll.title || "Poll")}</b><small>${poll.responses} ${poll.responses === 1 ? "response" : "responses"}${poll.invite ? " · invite only" : ""}${how}</small></div>${qs}` +
        (ballot ? `<div class="fp-actions"><button type="button" class="btn-primary btn-sm fp-vote">${mine ? "Change vote" : "Vote"}</button><small class="fp-status"></small></div>` : "");
      const btn = card.querySelector<HTMLButtonElement>(".fp-vote");
      if (!btn) return;
      const status = card.querySelector(".fp-status")!;
      btn.onclick = () => {
        btn.disabled = true;
        void vote(card, poll, net, (m) => (status.textContent = m)).then(
          () => {
            polls.delete(id); // read the poll again: it now holds this vote
            card.removeAttribute("data-state");
            fillFreepolls(card.parentElement ?? card, net);
          },
          (e) => {
            btn.disabled = false;
            status.textContent = e instanceof Error ? e.message : String(e);
          },
        );
      };
    });
  });
}

export interface NewPoll { question: string; options: string[]; multi: boolean }

/** The schema of a one-question poll, as FreePolls writes it. */
export const pollSchema = (p: NewPoll) => ({ title: p.question, questions: [{ id: "q1", kind: p.multi ? "multi" : "single", text: p.question, options: p.options, required: true }] });

/** Publish a poll owned by the signed-in persona; returns its FreePolls link. Parameters = persona || salt || Radica's
 *  app path, and the schema is signed by the app key the session's Viso delegation names. */
export async function createPoll(p: NewPoll, net: PollNet, origin: string): Promise<string> {
  const s = getStoredSession(), sk = await getAppKeySecret();
  if (!s?.cert || s.cert.challenge.split(".")[1] !== bytesToHex(await ed.getPublicKeyAsync(sk)))
    throw new Error("Your sign-in does not delegate this device's app key: sign out and sign in again to create polls.");
  const params = s.persona + bytesToHex(crypto.getRandomValues(new Uint8Array(16))) + bytesToHex(enc(appPath()));
  const schema_json = JSON.stringify(pollSchema(p));
  const schema_sig = bytesToHex(await ed.signAsync(enc(`fps1|${params}|${schema_json}`), sk));
  const key = await pollKey(params);
  await net.put(key, await code(), hexToBytes(params), enc(JSON.stringify({ schema_json, schema_sig, schema_cert: s.cert, responses: {} })));
  return pollHref(origin, key.encode(), params);
}
