// Node-side identity delegate: keeps the Viso app key where the sandboxed page cannot lose it (no storage, URL hash
// dropped by the Viso redirect). Same delegate as freetunes. Optional: callers fall back to the page's own storage.
import { FreenetWsApi, DelegateRequest, type DelegateResponse } from "@freenetorg/freenet-stdlib";
import { ApplicationMessageT } from "@freenetorg/freenet-stdlib/common";
import {
  ApplicationMessagesT, ClientRequestT, ClientRequestType, DelegateCodeT, DelegateContainerT, DelegateKeyT,
  DelegateRequestType, DelegateType, InboundDelegateMsgT, InboundDelegateMsgType, RegisterDelegateT, WasmDelegateV1T,
} from "@freenetorg/freenet-stdlib/client-request";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import identityWasm from "./wasm/identity.wasm?url";

const TIMEOUT_MS = 8000;
const asBytes = (b: Uint8Array): number[] => b as unknown as number[];
const ZERO_32 = asBytes(new Uint8Array(32));
const ZERO_24 = asBytes(new Uint8Array(24));
const enc = new TextEncoder();
const dec = new TextDecoder();

let waiters: { resolve(r: DelegateResponse): void; reject(e: Error): void }[] = [];
let apiP: Promise<FreenetWsApi> | undefined;
let chain: Promise<unknown> = Promise.resolve();
let key: Promise<DelegateKeyT> | undefined;
const others = new Map<string, Promise<DelegateKeyT>>(); // other delegates by wasm url (ante)

function wsEndpoint(): { url: URL; token: string } {
  const loc = globalThis.location; // undefined in Node (the terminal chat): the default local node, as network.ts
  const onNode = !!loc && (loc.port === "7509" || loc.pathname.includes("/v1/contract/"));
  const url = new URL(`${loc?.protocol === "https:" ? "wss" : "ws"}://${onNode ? loc.host : "127.0.0.1:7509"}/v1/contract/command`);
  return { url, token: new URLSearchParams(loc?.search ?? "").get("authToken") ?? "" };
}

function api(): Promise<FreenetWsApi> {
  if (globalThis.location?.port === "5199") return Promise.reject(new Error("offline"));
  return (apiP ??= new Promise((resolve, reject) => {
    const { url, token } = wsEndpoint();
    const closed = () => {
      apiP = key = undefined;
      others.clear();
      waiters.splice(0).forEach((w) => w.reject(new Error("socket closed")));
      reject(new Error("socket closed"));
    };
    const a: FreenetWsApi = new FreenetWsApi(url, {
      onContractPut() {}, onContractGet() {}, onContractUpdate() {}, onContractUpdateNotification() {}, onContractNotFound() {},
      onDelegateResponse: (r) => waiters.shift()?.resolve(r), // replies carry no id: one request at a time
      onErr: (e) => console.warn("[Freenet delegate]", e?.cause ?? e),
      onOpen: () => resolve(a),
      onClose: closed,
    }, token);
    // no node: a browser follows the error with a close, Node's WebSocket (the terminal chat) does not
    let opened = false;
    const ws = (a as unknown as { ws?: WebSocket }).ws;
    ws?.addEventListener("open", () => (opened = true));
    ws?.addEventListener("error", () => opened || closed());
  }));
}

function send(req: DelegateRequest, timeoutMs = TIMEOUT_MS): Promise<DelegateResponse> {
  const run = async () => {
    const reply = new Promise<DelegateResponse>((resolve, reject) => {
      const w = { resolve, reject };
      waiters.push(w);
      setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) { waiters.splice(i, 1); reject(new Error("delegate timeout")); }
      }, timeoutMs);
    });
    (await api() as unknown as { sendRequest(r: ClientRequestT): void }).sendRequest(new ClientRequestT(ClientRequestType.DelegateRequest, req));
    return reply;
  };
  const p = chain.then(run);
  chain = p.catch(() => {});
  return p;
}

async function register(url: string, expectHash?: string): Promise<DelegateKeyT> {
  const code = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const hash = blake3(code);
  if (expectHash && bytesToHex(hash) !== expectHash) throw new Error("unexpected delegate code");
  const k = new DelegateKeyT(asBytes(blake3(hash)), asBytes(hash));
  const wasm = new WasmDelegateV1T([], new DelegateCodeT(asBytes(code), asBytes(hash)), k);
  await send(new DelegateRequest(DelegateRequestType.RegisterDelegate,
    new RegisterDelegateT(new DelegateContainerT(DelegateType.WasmDelegateV1, wasm), ZERO_32, ZERO_24))); // node ignores cipher and nonce
  return k;
}

function extractPayload(r: DelegateResponse): Uint8Array {
  // duck-typed: bundlers can duplicate the SDK classes, which breaks instanceof
  const m = r.values.map((v) => v.inbound).find((x) => Array.isArray((x as ApplicationMessageT | null)?.payload) || (x as ApplicationMessageT | null)?.payload instanceof Uint8Array) as ApplicationMessageT | undefined;
  if (!m) throw new Error("empty delegate reply");
  return m.payload instanceof Uint8Array ? m.payload : new Uint8Array(m.payload);
}

async function message(k: DelegateKeyT, payload: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
  const msg = new InboundDelegateMsgT(InboundDelegateMsgType.common_ApplicationMessage, new ApplicationMessageT(asBytes(payload), [], false));
  const r = await send(new DelegateRequest(DelegateRequestType.ApplicationMessages, new ApplicationMessagesT(k, [], [msg])), timeoutMs);
  return extractPayload(r);
}

/** One message to another app's delegate (registered on first use, refused unless its code hashes to `expectHash`). */
export async function delegateMessage(url: string, expectHash: string, payload: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
  let k = others.get(url);
  if (!k) others.set(url, (k = register(url, expectHash)));
  return message(await k.catch((e) => { others.delete(url); throw e; }), payload, timeoutMs);
}

/** One message to the node's ghostkeys delegate (Freenet's GhostKey vault), whose key the vault webapp publishes.
 *  Uses a dedicated socket so a 120s interactive approval prompt never blocks background durable saves on `chain`. */
export async function ghostkeyDelegateMessage(vault: string, payload: Uint8Array, timeoutMs = 120_000): Promise<Uint8Array> {
  const r = await fetch(`/v1/contract/web/${vault}/delegate-key.json`, { credentials: "omit" }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  if (!Array.isArray(j?.delegate_key_bytes) || !Array.isArray(j?.code_hash_bytes)) throw new Error("GhostKey is not available on this node");
  const k = new DelegateKeyT(j.delegate_key_bytes, j.code_hash_bytes);
  const msg = new InboundDelegateMsgT(InboundDelegateMsgType.common_ApplicationMessage, new ApplicationMessageT(asBytes(payload), [], false));
  const req = new ClientRequestT(ClientRequestType.DelegateRequest, new DelegateRequest(DelegateRequestType.ApplicationMessages, new ApplicationMessagesT(k, [], [msg])));
  const { url, token } = wsEndpoint();
  return new Promise<Uint8Array>((resolve, reject) => {
    let sock: FreenetWsApi | undefined;
    const done = (fn: () => void) => {
      clearTimeout(timer);
      (sock as unknown as { ws?: WebSocket } | undefined)?.ws?.close();
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error("delegate timeout"))), timeoutMs);
    sock = new FreenetWsApi(url, {
      onContractPut() {}, onContractGet() {}, onContractUpdate() {}, onContractUpdateNotification() {}, onContractNotFound() {},
      onDelegateResponse: (res) => done(() => { try { resolve(extractPayload(res)); } catch (e) { reject(e); } }),
      onErr: (e) => console.warn("[Freenet ghostkey delegate]", e?.cause ?? e),
      onOpen: () => (sock as unknown as { sendRequest(r: ClientRequestT): void }).sendRequest(req),
      onClose: () => done(() => reject(new Error("socket closed"))),
    }, token);
  });
}

async function call(payload: object): Promise<Record<string, string>> {
  const k = await (key ??= register(identityWasm)).catch((e) => {
    key = undefined; // try again next time instead of keeping the failure
    throw e;
  });
  const out = JSON.parse(dec.decode(await message(k, enc.encode(JSON.stringify(payload)))));
  if (out.err) throw new Error(out.err);
  return out;
}

/** The app key (hex secret) kept by the node: `candidate` is stored only if the node has none yet. Null when no delegate answers. */
export async function nodeAppKey(candidate: string): Promise<string | null> {
  try {
    await call({ op: "init", sk: candidate });
    return (await call({ op: "export" })).sk;
  } catch (e) {
    console.warn("identity delegate unavailable, using page storage:", e);
    return null;
  }
}

/** Make `sk` the app key the node keeps (Viso's shared key replacing this device's own). False when no delegate answers. */
export async function nodeReplaceAppKey(sk: string): Promise<boolean> {
  try {
    await call({ op: "replace", sk });
    return true;
  } catch (e) {
    console.warn("identity delegate unavailable, the app key stays in page storage:", e);
    return false;
  }
}

// the delegate takes only [A-Za-z0-9:-] keys; room ids carry '_' (never '-'), so this mapping cannot collide
const kvKey = (key: string) => key.replace(/_/g, "-");

/** A small private value kept by the node for this app (the delegate's key/value store); null when it is missing or no delegate answers. */
export async function nodeGet(key: string): Promise<string | null> {
  try {
    return ((await call({ op: "get", key: kvKey(key) })).value as string | null) ?? null;
  } catch (e) {
    console.warn("identity delegate unavailable:", e);
    return null;
  }
}

export async function nodePut(key: string, value: string): Promise<void> {
  try {
    await call({ op: "put", key: kvKey(key), value });
  } catch (e) {
    console.warn("identity delegate unavailable:", e);
  }
}
