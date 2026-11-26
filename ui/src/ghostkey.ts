// Freenet GhostKey: ghostkey.wasm (ghostkey-wasm/, built from ghostkey_lib) asks the node's ghostkeys delegate to vouch
// for a persona and checks the proof it gives (certificate chain to the Freenet master key). Proofs are Viso's format,
// so one made in Viso holds here. See ghostkey-wasm/src/lib.rs for the calls.
import { bytesToHex, hexToBytes } from "./crypto.ts";

type Exports = {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  call(ptr: number, len: number): bigint;
};

export type JsonCall = (req: Record<string, unknown>) => Record<string, any>;

/** A WASM module with one JSON call in and one JSON answer out (ghostkey-wasm): its errors throw as `name: …`. */
export async function loadJsonWasm(bytes: BufferSource, name: string): Promise<JsonCall> {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const x = instance.exports as unknown as Exports;
  return (req) => {
    const input = new TextEncoder().encode(JSON.stringify(req));
    const ptr = x.alloc(input.length);
    new Uint8Array(x.memory.buffer, ptr, input.length).set(input);
    const r = x.call(ptr, input.length);
    x.dealloc(ptr, input.length);
    const [outPtr, outLen] = [Number(r >> 32n), Number(r & 0xffffffffn)];
    const out = JSON.parse(new TextDecoder().decode(new Uint8Array(x.memory.buffer, outPtr, outLen)));
    x.dealloc(outPtr, outLen);
    if (out.error) throw new Error(`${name}: ${out.error}`);
    return out;
  };
}

/** The ghostkeys vault webapp: it publishes delegate-key.json, the ghostkeys delegate's key on this node. */
export const GHOSTKEYS_VAULT = "DLog47hEsrtuGT4N5XCeMBG45m4n1aWM89tBZXue2E1N";

let p: Promise<JsonCall> | undefined;
/** The browser's instance, loaded on first use (about 600 KB). */
export function ghostkey(): Promise<JsonCall> {
  return (p ??= import("./wasm/ghostkey.wasm?url")
    .then(({ default: url }) => fetch(url))
    .then((r) => r.arrayBuffer())
    .then((b) => loadJsonWasm(b, "GhostKey")));
}

/** A checked proof: the GhostKey's fingerprint and what its notary certified (e.g. "donation_amount:20"). */
export async function checkGhostkey(bundleHex: string, pubkey: string, call?: JsonCall): Promise<{ fingerprint: string; info: string }> {
  const r = (call ?? (await ghostkey()))({ op: "verify", bundle: bundleHex, pubkey });
  return { fingerprint: String(r.fingerprint), info: String(r.info) };
}

/** What the ghostkeys delegate said instead of signing, for the person. */
const REFUSALS: Record<string, string> = {
  NoIdentityAvailable: "No GhostKey on this node yet. Get one at freenet.org/ghostkey, then try again.",
  AccessDenied: "You did not allow Radica to use your GhostKey.",
  PermissionDenied: "You did not allow Radica to use your GhostKey.",
};

/** Ask the node's ghostkeys delegate to vouch for `pubkey` (it may prompt the user), and check the proof it gives:
 *  the proof bundle, hex. */
export async function requestGhostkeyProof(pubkey: string): Promise<string> {
  const call = await ghostkey();
  const { ghostkeyDelegateMessage } = await import("./delegate.ts");
  const reply = await ghostkeyDelegateMessage(GHOSTKEYS_VAULT, hexToBytes(call({ op: "request", pubkey }).payload));
  const r = call({ op: "reply", payload: bytesToHex(reply) });
  if (!r.bundle) {
    const kind = /^\w+/.exec(String(r.status))?.[0] ?? "";
    throw new Error(REFUSALS[kind] ?? `GhostKey did not sign (${kind || "no answer"}).`);
  }
  await checkGhostkey(r.bundle, pubkey, call);
  return r.bundle;
}

/** The checked proofs of many people at once (the ghostkeys log), each checked once per page.
 *  Deduplicated by GhostKey fingerprint so one GhostKey vouches for at most one author. */
const checked = new Map<string, Promise<string | null>>();
export async function verifiedGhostkeys(entries: { author: string; bundle: string | null }[]): Promise<string[]> {
  if (!entries.some((e) => e.bundle)) return [];
  const call = await ghostkey();
  const fps = await Promise.all(
    entries.map(({ author, bundle }) => {
      if (!bundle) return Promise.resolve<string | null>(null);
      const k = `${author}|${bundle}`;
      if (!checked.has(k)) checked.set(k, checkGhostkey(bundle, author, call).then((r) => r.fingerprint || null, () => null));
      return checked.get(k)!;
    })
  );
  const byFingerprint = new Map<string, string>();
  entries.forEach((e, i) => {
    const fp = fps[i];
    if (fp) byFingerprint.set(fp, e.author);
  });
  return [...byFingerprint.values()];
}
