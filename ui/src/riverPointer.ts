// Which River room contract rooms live under. River re-keys its room contract often (a room's key is
// BLAKE3(BLAKE3(room_contract.wasm) || CBOR{owner})), and publishes a signed pointer record at a fixed address naming
// the current code hash (freenet-core#5194, River's FREENET.md). We resolve it instead of trusting a built-in hash.
//
// river.wasm writes deltas for one River generation, BUNDLED_ROOM_CODE. When the pointer names a newer one, rooms stay
// readable but writes stop: a delta from an older river-core is what a newer contract re-keyed away from (riverctl
// does the same). Rebuilding river-wasm on River's new commit and updating BUNDLED_ROOM_CODE lifts it.
import { blake3 } from "@noble/hashes/blake3.js";
import { ContractKey } from "@freenetorg/freenet-stdlib";
import { hexToBytes, bytesToHex } from "./crypto.ts";
import type { RiverCall } from "./river.ts";
import { safeStorage } from "./storage.ts";

/** The room contract river.wasm is built against (River's pointer record version 11). */
export const BUNDLED_ROOM_CODE = "bc9b4066fccc37435556295871c567e455b48832eb0a72623d399b354471aef5";
/** The pointer contract's frozen code hash (8wnAPaSRY1oYZCz723fdwK6BgzL6q8ozP3buVovXnt6v). */
const POINTER_CODE = "760a3ca41c6309112f1ddbff032fde9b6429c8fb0ad6f5a2bcb7184508ee300b";
/** River's author key and the app id of its room-contract pointer (River's FREENET.md). */
const RIVER_AUTHOR = "7a597ab5353d99b22f1f9d366536584fa444233c7fa0b0adad6bcd55c973d683";
const APP_ID = "river.room-contract";
const ZERO = "0".repeat(64);
const FLOOR = "radica_river_pointer"; // highest record ever verified on this install

/** A contract instance id: `BLAKE3(code hash || params)`, as a node derives it. */
export const instanceOf = (codeHash: string, params: Uint8Array): Uint8Array => blake3(new Uint8Array([...hexToBytes(codeHash), ...params]));

/** The full key (the code hash kept: an update needs it, a get does not). */
export const keyOf = (codeHash: string, params: Uint8Array): ContractKey => new ContractKey(instanceOf(codeHash, params), hexToBytes(codeHash));

const pointerParams = () => new Uint8Array([...hexToBytes(RIVER_AUTHOR), ...new TextEncoder().encode(APP_ID)]);

/** The pointer's own fixed address. */
export const pointerId = (): Uint8Array => instanceOf(POINTER_CODE, pointerParams());
const pointerKey = (): ContractKey => keyOf(POINTER_CODE, pointerParams());

export type Floor = { version: number; codeHash: string };

/** What a verified record does to the floor: a lower version never wins; at an equal version the lower code hash
 *  does, as in the pointer contract's own merge, so every install converges on one answer. */
export function nextFloor(floor: Floor | null, rec: Floor | null): Floor | null {
  if (!rec) return floor;
  if (!floor || rec.version > floor.version) return rec;
  if (rec.version === floor.version && rec.codeHash < floor.codeHash) return rec;
  return floor;
}

export type Anchor = { codeHash: string; canWrite: boolean; withdrawn: boolean };

/** Never resolved here: the built-in generation is all we know, and the only case it may be used blind. */
export function anchorOf(floor: Floor | null): Anchor {
  const codeHash = floor?.codeHash ?? BUNDLED_ROOM_CODE;
  const withdrawn = codeHash === ZERO;
  return { codeHash, withdrawn, canWrite: !withdrawn && codeHash === BUNDLED_ROOM_CODE };
}

/** Resolve River's pointer: GET it, verify it in river.wasm, keep the highest record. An unreachable or bad record
 *  changes nothing: the last one resolved here stays (never back to the built-in hash once one has resolved). */
/** The anchor this install already holds, without the network: the last record verified here, else the built-in hash. */
export function knownAnchor(store: Pick<Storage, "getItem"> = safeStorage): Anchor {
  try {
    return anchorOf(JSON.parse(store.getItem(FLOOR) || "null"));
  } catch {
    return anchorOf(null);
  }
}

export async function resolveRoomContract(
  getRaw: (k: ContractKey) => Promise<Uint8Array | null>,
  call: RiverCall,
  store: Pick<Storage, "getItem" | "setItem"> = safeStorage // the sandboxed web container has no localStorage
): Promise<Anchor> {
  let floor: Floor | null = null;
  try {
    floor = JSON.parse(store.getItem(FLOOR) || "null");
  } catch {}
  try {
    const raw = await getRaw(pointerKey());
    if (raw) {
      const r = call({ op: "pointer", state: bytesToHex(raw) });
      floor = nextFloor(floor, { version: r.version, codeHash: r.code_hash });
      store.setItem(FLOOR, JSON.stringify(floor));
    }
  } catch (e) {
    console.warn("[River] Could not resolve the room-contract pointer", e);
  }
  return anchorOf(floor);
}

/** A room's contract key under the resolved code hash: River's params for the room owner. */
export function roomKey(anchor: Anchor, call: RiverCall, ownerVk: string): ContractKey {
  return keyOf(anchor.codeHash, hexToBytes(call({ op: "params", owner_vk: ownerVk }).params));
}
