// Radica contracts on the Freenet network:
// - feed (contract/): one per persona, parameters = the persona's 32-byte pubkey || app path;
// - log (log-contract/): named append-only logs of signed entries (inbox, communities, chats), params `radica/<name>|<app path>`.
// The node merges every update with the contract, so a whole state can be pushed: only what is new changes.
import {
  ContractContainer,
  ContractKey,
  ContractType,
  DeltaUpdate,
  FreenetWsApi,
  GetRequest,
  PutRequest,
  UpdateData,
  UpdateDataType,
  UpdateRequest,
  WasmContractV1,
} from "@freenetorg/freenet-stdlib";
import { ContractCodeT } from "@freenetorg/freenet-stdlib/common";
import { RelatedContractsT } from "@freenetorg/freenet-stdlib/client-request";
import { blake3 } from "@noble/hashes/blake3.js";
import feedWasmUrl from "./wasm/contract.wasm?url";
import logWasmUrl from "./wasm/log.wasm?url";
import mediaWasmUrl from "./wasm/media.wasm?url";
import { hexToBytes } from "./crypto.ts";
import { mediaHashOf } from "./media.ts";
import { appPath } from "./whoiam.ts";
import { VISO_IDENTITY_CODE_HASH, visoIdentityInstance } from "./viso.ts";
import { limiter } from "./limit.ts";
import { CURRENT, LEGACY } from "./legacy.ts";
import { compactLog, type LogEntry } from "./logfold.ts";
import { safeStorage } from "./storage.ts"; // the sandboxed web container has no localStorage
import { nextDelay, watchdog, STABLE_MS, WATCHDOG_TICK_MS } from "./reconnect.ts";
import { changeOf, type Change } from "./refresh.ts";

const PROBED = "radica_legacy_probed"; // contracts already looked up under earlier generations
const TIMEOUT_MS = 45000; // a get/put for a contract the node has not got goes looking on the network

const enc = new TextEncoder();
const dec = new TextDecoder();
const asBytes = (b: Uint8Array): number[] => b as unknown as number[];
const toU8 = (s: Uint8Array | number[]): Uint8Array => (s instanceof Uint8Array ? s : new Uint8Array(s));

/** The node's WebSocket: same host when served by the node (web container), else the default local node. */
function wsUrl(): URL {
  const loc = globalThis.location;
  const onNode = loc && (loc.port === "7509" || loc.pathname.includes("/v1/contract/"));
  const host = onNode ? loc.host : "127.0.0.1:7509";
  return new URL(`${loc?.protocol === "https:" ? "wss" : "ws"}://${host}/v1/contract/command`);
}

// Separate foreground (media, active chat, user actions) vs background (Explore feeds, comment logs) queues
// so 6 slow/missing peer feeds never starve user clicks or media downloads for 45s.
const fgGate = limiter(4);
const bgGate = limiter(4);

const withTimeout = <T>(p: Promise<T>): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Freenet request timeout")), TIMEOUT_MS))]);

/** A contract on the network: the feed of a persona (`feed:<pubkey>`), a named log (`log:<name>`), or a River room
 *  (`river:<owner key>`, raw CBOR state, see riverRooms.ts). */
export type ContractId = `feed:${string}` | `log:${string}` | `river:${string}` | `media:${string}`;

const codes = new Map<string, Promise<{ code: Uint8Array; hash: Uint8Array }>>();
function contractCode(url: string) {
  if (!codes.has(url))
    codes.set(url, fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Cannot load ${url}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => {
        const code = new Uint8Array(b);
        return { code, hash: blake3(code) };
      }));
  return codes.get(url)!;
}

/** Code and parameters: a feed is keyed by the owner's pubkey, a log by its name, an image by its hash. */
function partsOf(id: ContractId): { url: string; params: Uint8Array } {
  if (id.startsWith("media:")) return { url: mediaWasmUrl, params: hexToBytes(id.slice(6)) };
  const app = appPath(); // contracts accept Viso delegations made for this app only
  if (id.startsWith("feed:")) {
    const pk = hexToBytes(id.slice(5));
    const appBytes = enc.encode(app);
    const params = new Uint8Array(pk.length + appBytes.length);
    params.set(pk, 0);
    params.set(appBytes, pk.length);
    return { url: feedWasmUrl, params };
  }
  return { url: logWasmUrl, params: enc.encode(`radica/${id.slice(4)}|${app}`) };
}

const keyCache = new Map<ContractId, Promise<ContractKey>>();
export function contractKey(id: ContractId): Promise<ContractKey> {
  let p = keyCache.get(id);
  if (!p) {
    p = (async () => {
      const { url, params } = partsOf(id);
      const { hash } = await contractCode(url);
      const buf = new Uint8Array(hash.length + params.length);
      buf.set(hash, 0);
      buf.set(params, hash.length);
      return new ContractKey(blake3(buf), hash);
    })();
    if (keyCache.size >= 2048) keyCache.clear();
    keyCache.set(id, p);
  }
  return p;
}

const isInteractiveContract = (id: ContractId): boolean =>
  id.startsWith("media:") ||
  id.startsWith("river:") ||
  id.startsWith("log:inbox/") ||
  id.startsWith("log:room/") ||
  id.startsWith("log:community-chat/");

export class FreenetNetwork {
  private apiP?: Promise<FreenetWsApi>;
  private sock?: FreenetWsApi; // the socket `apiP` stands for
  private fails = 0; // reconnect attempts since the last connection that stayed up
  private lastMsg = 0; // when the node last sent us anything
  private probeAt = 0; // when the outstanding liveness probe was sent, 0 if none
  private dog?: ReturnType<typeof setInterval>;
  private ids = new Map<string, ContractId>(); // encoded contract key -> id
  private known = new Set<ContractId>(); // contracts that exist on the network

  /** When each contract was last fetched (and so subscribed to) on this connection; cleared when the socket drops. */
  private live = new Map<ContractId, number>();

  /** The contracts this node is subscribed to for us right now: it keeps a copy of each and passes its changes on. */
  liveIds(): ContractId[] {
    return [...this.live.keys()];
  }

  /** Ms since `id` was fetched on this connection, or null: the node pushes its changes to us meanwhile. */
  liveAge(id: ContractId): number | null {
    const t = this.live.get(id);
    return t === undefined ? null : Date.now() - t;
  }

  /** `onChange(id, change)` runs when a subscribed contract changes on the network; `change` is what the node sent
   *  (new state or delta), absent when we must fetch it again (after a reconnect). */
  constructor(private onChange: (id: ContractId, change?: Change) => void) {
    // a sleeping tab or a network change can leave the socket half-open: check it as soon as we are back
    globalThis.document?.addEventListener("visibilitychange", () => !document.hidden && this.tick(true));
    globalThis.addEventListener?.("online", () => this.tick(true));
  }

  private seen = () => {
    this.lastMsg = Date.now();
  };

  /** Forget a dead socket. Close it too: a half-open one never says so itself. */
  private drop(api: FreenetWsApi, resub: boolean): void {
    if (this.sock !== api) return; // an abandoned socket must not tear down the current connection
    this.sock = this.apiP = undefined;
    clearInterval(this.dog);
    this.probeAt = 0;
    this.live.clear(); // the node drops our subscriptions with the socket
    (api as unknown as { ws?: WebSocket }).ws?.close();
    if (resub) this.resubscribe();
  }

  /** Watch an open socket: when it has been silent, ask the node something it answers from its own copy; no answer means dead. */
  private tick(force = false): void {
    const api = this.sock;
    if (!api) return;
    const now = Date.now();
    switch (watchdog(now, this.lastMsg, this.probeAt, force)) {
      case "dead": return this.drop(api, true);
      case "answered": this.probeAt = 0; return;
      case "probe": {
        const id = [...this.live.keys()].find((i) => !i.startsWith("river:")); // nothing subscribed: silence proves nothing
        if (!id) return;
        this.probeAt = now;
        contractKey(id).then((k) => api.get(new GetRequest(k, false, false))).then(this.seen, this.seen); // an error reply is a reply too
      }
    }
  }

  connect(): Promise<FreenetWsApi> {
    let opened = false;
    let attempt: FreenetWsApi | undefined;
    return (this.apiP ??= withTimeout(
      new Promise<FreenetWsApi>((resolve, reject) => {
        const api: FreenetWsApi = (attempt = new FreenetWsApi(wsUrl(), {
          onContractPut: this.seen,
          onContractGet: this.seen,
          onContractUpdate: this.seen,
          onContractUpdateNotification: (n) => {
            this.seen();
            const id = this.ids.get(n.key.encode());
            if (id) this.onChange(id, changeOf(n.update as Parameters<typeof changeOf>[0]));
          },
          onContractNotFound: this.seen,
          onDelegateResponse() {},
          onErr: (e) => {
            this.seen();
            console.warn("[Freenet]", e?.cause ?? e);
          },
          onOpen: () => {
            opened = true;
            resolve(api);
            if (this.sock !== api) return;
            this.seen();
            this.dog = setInterval(() => this.tick(), WATCHDOG_TICK_MS);
            setTimeout(() => this.sock === api && (this.fails = 0), STABLE_MS); // only a connection that lasts resets the backoff
          },
          onClose: () => {
            reject(new Error("Freenet WebSocket closed"));
            this.drop(api, opened);
          },
        }, new URLSearchParams(globalThis.location?.search ?? "").get("authToken") ?? "")); // "" not undefined: the stdlib would read document.cookie, which throws in the sandboxed iframe
        this.sock = api;
      })
    ).catch((e) => {
      this.apiP = undefined;
      if (this.sock === attempt) this.sock = undefined;
      // timed out or refused: close the half-open socket, or it stays connected and delivers duplicate notifications
      (attempt as unknown as { ws?: WebSocket } | undefined)?.ws?.close();
      throw e;
    }));
  }

  /** Reconnect, then fetch again (and so subscribe again to) every contract we follow, prioritizing interactive ones first. */
  private resubscribe(): void {
    setTimeout(
      () =>
        this.connect().then(
          () => {
            const all = [...new Set(this.ids.values())].sort((a, b) => Number(isInteractiveContract(b)) - Number(isInteractiveContract(a)));
            all.forEach((id, i) => setTimeout(() => this.onChange(id), Math.floor(i / 8) * 50));
          },
          () => this.resubscribe()
        ),
      nextDelay(this.fails++)
    );
  }

  /** The state on the network (and subscribe to its changes), or null when nobody published it yet. */
  async get<T>(id: ContractId, urgent = false): Promise<T | null> {
    const text = await this.getText(id, urgent);
    return text === null ? null : (JSON.parse(text) as T);
  }

  /** Same as `get`, as the JSON text: a caller that only stores it or parses it in a worker keeps the page responsive. */
  async getText(id: ContractId, urgent = false): Promise<string | null> {
    const api = await this.connect();
    const key = await contractKey(id);
    this.ids.set(key.encode(), id);
    const gate = urgent || isInteractiveContract(id) ? fgGate : bgGate;
    try {
      const r = await gate(() => withTimeout(api.get(new GetRequest(key, false, true)))); // the timeout starts when the lookup is sent, not while it waits
      this.known.add(id);
      if (r.state.length) this.live.set(id, Date.now()); // nothing published yet: no subscription to rely on
      // a log someone else started under this generation (a contact writing to my new inbox) still gets my older
      // entries: the merge is a union, so carrying them in later loses nothing
      if (r.state.length && id.startsWith("log:")) void this.fromLegacy(id).catch(() => {});
      return r.state.length ? dec.decode(toU8(r.state)) : null;
    } catch (e) {
      if (/not found/i.test(String(e))) return this.fromLegacy(id).then((v) => (v === null ? null : JSON.stringify(v)));
      throw e;
    }
  }

  /** Raw state of any contract key (another app's, like River's), or null when it is not on the network. With `watch`,
   *  subscribe to it: its changes come back through `onChange(watch)`. */
  async getRaw(key: ContractKey, watch?: ContractId, urgent = true): Promise<Uint8Array | null> {
    const api = await this.connect();
    if (watch) this.ids.set(key.encode(), watch);
    const gate = urgent ? fgGate : bgGate;
    try {
      const r = await gate(() => withTimeout(api.get(new GetRequest(key, false, !!watch))));
      if (watch && r.state.length) this.live.set(watch, Date.now());
      return r.state.length ? toU8(r.state) : null;
    } catch (e) {
      if (/not found/i.test(String(e))) return null;
      throw e;
    }
  }

  /** A Viso persona's identity contract state (CBOR, see viso.ts), or null when the persona has published none. */
  visoIdentity(pkHex: string): Promise<Uint8Array | null> {
    return this.getRaw(new ContractKey(visoIdentityInstance(pkHex), hexToBytes(VISO_IDENTITY_CODE_HASH)));
  }

  /** Raw state of another app's contract known only by its instance id (FreeTunes releases and audio chunks). */
  getByInstance(instance: string): Promise<Uint8Array | null> {
    return this.getRaw(ContractKey.fromInstanceId(instance));
  }

  /** Publish a contract of another app with its first state (River rooms: the code is River's room contract). */
  async putRaw(key: ContractKey, code: Uint8Array, params: Uint8Array, state: Uint8Array): Promise<void> {
    const api = await this.connect();
    const contract = new WasmContractV1(new ContractCodeT(asBytes(code), asBytes(key.codePart() ?? new Uint8Array())), asBytes(params), key);
    await withTimeout(api.put(new PutRequest(new ContractContainer(ContractType.WasmContractV1, contract), asBytes(state), new RelatedContractsT(), true)));
  }

  /** Publish an image to its own contract (keyed by its hash, see media-contract/); returns the hash. */
  async putMedia(bytes: Uint8Array): Promise<string> {
    const hash = mediaHashOf(bytes);
    const { url, params } = partsOf(`media:${hash}`);
    await this.putRaw(await contractKey(`media:${hash}`), (await contractCode(url)).code, params, bytes);
    return hash;
  }

  /** The image `hash` names, or null when the network has none; bytes that do not hash to it are dropped. */
  async getMedia(hash: string): Promise<Uint8Array | null> {
    const bytes = await this.getRaw(await contractKey(`media:${hash}`), undefined, true);
    return bytes && mediaHashOf(bytes) === hash ? bytes : null;
  }

  /** Send a raw delta to a contract the node holds; the contract applies it or refuses it. */
  async updateRaw(key: ContractKey, delta: Uint8Array): Promise<void> {
    const api = await this.connect();
    await withTimeout(api.update(new UpdateRequest(key, new UpdateData(UpdateDataType.DeltaUpdate, new DeltaUpdate(asBytes(delta))))));
  }

  /** What a contract holds under the newest earlier generation that has it, without carrying it anywhere. */
  async legacy<T>(id: ContractId): Promise<T | null> {
    const kind = id.startsWith("feed:") ? "feed" : "log";
    const api = await this.connect();
    const { params } = partsOf(id);
    for (const hex of LEGACY[kind]) {
      const hash = hexToBytes(hex);
      const buf = new Uint8Array(hash.length + params.length);
      buf.set(hash, 0);
      buf.set(params, hash.length);
      const key = new ContractKey(blake3(buf), hash);
      const r = await bgGate(() => withTimeout(api.get(new GetRequest(key, false, false)))).catch(() => null);
      if (r?.state.length) return JSON.parse(dec.decode(toU8(r.state))) as T;
    }
    return null;
  }

  /** Nothing under the current code: look under earlier generations, once per contract, and carry what is found forward. */
  private async fromLegacy<T>(id: ContractId): Promise<T | null> {
    const kind = id.startsWith("feed:") ? "feed" : "log";
    const mark = `${PROBED}:${CURRENT[kind]}`; // a new generation probes everything again
    // shortcut: a legacy lookup that times out is not retried, retry per session if near-misses strand data
    const done: string[] = JSON.parse(safeStorage.getItem(mark) || "[]");
    if (done.includes(id)) return null;
    safeStorage.setItem(mark, JSON.stringify([...done, id])); // before probing: push below calls get again
    let state: T | null = await this.legacy<T>(id);
    if (state === null) return null;
    // a log moves without what no longer counts (superseded state, an inbox's conversations): it stays small
    const log = state as { entries?: Record<string, LogEntry> };
    if (kind === "log" && log.entries) state = { ...log, entries: compactLog(id.slice("log:".length), log.entries) } as T;
    try {
      await this.push(id, state); // the current contract checks every record: a state it no longer accepts stays behind
      return state;
    } catch (e) {
      console.warn("[Freenet] Could not carry", id, "forward from an earlier contract", e);
      return null;
    }
  }

  /** Send `value` (put the first time, then update); the contract merges it and rejects it whole if anything is forged. */
  async push(id: ContractId, value: unknown): Promise<void> {
    const api = await this.connect();
    const key = await contractKey(id);
    const bytes = asBytes(enc.encode(JSON.stringify(value)));
    if (!this.known.has(id) && (await this.get(id, true).catch(() => null)) === null) { // a lookup that times out: put anyway, the node merges it with any existing state
      const { url, params } = partsOf(id);
      const { code, hash } = await contractCode(url);
      const contract = new WasmContractV1(new ContractCodeT(asBytes(code), asBytes(hash)), asBytes(params), key);
      await withTimeout(api.put(new PutRequest(new ContractContainer(ContractType.WasmContractV1, contract), bytes, new RelatedContractsT(), true)));
      this.known.add(id);
      return;
    }
    await withTimeout(api.update(new UpdateRequest(key, new UpdateData(UpdateDataType.DeltaUpdate, new DeltaUpdate(bytes)))));
  }
}
