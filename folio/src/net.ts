// Publishes raw bytes to Radica's media-contract (scobru/radica media-contract/): one immutable blob per
// content hash, no identity or signature required to write — anyone can PUT bytes whose own BLAKE3 hash is
// the address. Same media.wasm Radica itself publishes with (copied in, content-addressed so it never changes).
import { blake3 } from "@noble/hashes/blake3.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import {
  ContractContainer, ContractKey, ContractType, FreenetWsApi, GetRequest, PutRequest, WasmContractV1, type ResponseHandler,
} from "@freenetorg/freenet-stdlib";
import { ContractCodeT } from "@freenetorg/freenet-stdlib/common";
import { RelatedContractsT } from "@freenetorg/freenet-stdlib/client-request";
import mediaWasmUrl from "./media.wasm?url";

/** Origin of the node: the page's own in production, VITE_NODE (or the default port) under `npm run dev`. */
const nodeBase = import.meta.env.DEV
  ? `http://${import.meta.env.VITE_NODE ?? "127.0.0.1:7509"}`
  : `${location.protocol}//${location.host}`;

let apiP: Promise<FreenetWsApi> | undefined;
function api(): Promise<FreenetWsApi> {
  return (apiP ??= new Promise((resolve, reject) => {
    const h: ResponseHandler = {
      onContractPut() {}, onContractGet() {}, onContractUpdate() {}, onContractUpdateNotification() {}, onContractNotFound() {},
      onDelegateResponse() {},
      onErr: (e) => console.error(e.cause),
      onOpen: () => resolve(a),
      onClose: () => { apiP = undefined; reject(new Error("socket closed")); },
    };
    // the shell only proxies sockets to its own origin, scheme included
    const a = new FreenetWsApi(new URL(`${nodeBase.replace(/^http/, "ws")}/v1/contract/command`), h, "");
  }));
}

let codeP: Promise<{ code: Uint8Array; codeHash: Uint8Array }> | undefined;
function mediaCode() {
  return (codeP ??= fetch(mediaWasmUrl)
    .then((r) => r.arrayBuffer())
    .then((b) => {
      const code = new Uint8Array(b);
      return { code, codeHash: blake3(code) };
    }));
}

const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Publish `bytes` to the media-contract instance they hash to, and return that hash as hex. */
export async function publishArticleBytes(bytes: Uint8Array): Promise<string> {
  const { code, codeHash } = await mediaCode();
  const params = blake3(bytes); // media-contract: valid only when params == blake3(state)
  const key = new ContractKey(blake3(new Uint8Array([...codeHash, ...params])), codeHash);
  const a = await api();
  await a.put(new PutRequest(
    new ContractContainer(ContractType.WasmContractV1, new WasmContractV1(new ContractCodeT(Array.from(code), Array.from(codeHash)), Array.from(params), key)),
    Array.from(bytes),
    new RelatedContractsT(),
  ));
  return hexOf(params);
}

/** Fetch the bytes at media-contract `hash`, or null if the network has none (or they don't match). */
export async function fetchArticleBytes(hash: string): Promise<Uint8Array | null> {
  const { code, codeHash } = await mediaCode();
  const params = hexToBytes(hash);
  const key = new ContractKey(blake3(new Uint8Array([...codeHash, ...params])), codeHash);
  const a = await api();
  const r = await a.get(new GetRequest(key, true, false));
  const bytes = r.state instanceof Uint8Array ? r.state : new Uint8Array(r.state);
  if (!bytes.length) return null;
  return hexOf(blake3(bytes)) === hash ? bytes : null;
}
