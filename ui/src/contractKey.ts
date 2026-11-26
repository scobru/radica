// Contract addresses as a Freenet node derives them, and the floor of a signed pointer record (a Freenet app that
// re-keys its contracts publishes a record naming the current code hash, e.g. Delta's FREENET.md).
import { blake3 } from "@noble/hashes/blake3.js";
import { ContractKey } from "@freenetorg/freenet-stdlib";
import { hexToBytes } from "./crypto.ts";

/** A contract instance id: `BLAKE3(code hash || params)`, as a node derives it. */
export const instanceOf = (codeHash: string, params: Uint8Array): Uint8Array => blake3(new Uint8Array([...hexToBytes(codeHash), ...params]));

/** The full key (the code hash kept: an update needs it, a get does not). */
export const keyOf = (codeHash: string, params: Uint8Array): ContractKey => new ContractKey(instanceOf(codeHash, params), hexToBytes(codeHash));

export type Floor = { version: number; codeHash: string };

/** What a verified record does to the floor: a lower version never wins; at an equal version the lower code hash
 *  does, as in the pointer contract's own merge, so every install converges on one answer. */
export function nextFloor(floor: Floor | null, rec: Floor | null): Floor | null {
  if (!rec) return floor;
  if (!floor || rec.version > floor.version) return rec;
  if (rec.version === floor.version && rec.codeHash < floor.codeHash) return rec;
  return floor;
}
