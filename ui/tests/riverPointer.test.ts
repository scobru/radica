import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRiver } from "../src/river.ts";
import { toBase58 } from "../src/whoiam.ts";
import { hexToBytes } from "../src/crypto.ts";
import { BUNDLED_ROOM_CODE, anchorOf, instanceOf, nextFloor, pointerId, resolveRoomContract } from "../src/riverPointer.ts";

// River's published record at the commit river-wasm pins (pointer-records.toml): version 11, BUNDLED_ROOM_CODE.
const RECORD = "0000000bbc9b4066fccc37435556295871c567e455b48832eb0a72623d399b354471aef5834276c839356487e0e62260483bb4684b71ad21a82233c90f0ccd9c607eeab240d385dfa94ce0f8008d65f22e676874d2c547fe01f6d91aacdb3c437cb78700";

test("river pointer: derivations match the published addresses and test vectors", () => {
  assert.equal(toBase58(pointerId()), "Ai4VLoC2jGdhpcB2UU8VPo3efUoxjm1Ju9VKXqRC63Az"); // River's FREENET.md
  // freenet-migrate TEST-VECTORS.md: code hash 0xAA.., params "example-consumer-params"
  assert.equal(toBase58(instanceOf("aa".repeat(32), new TextEncoder().encode("example-consumer-params"))), "k2Nt3AT6K7L9obj1GwogHN2dpzY1MVaz9AAhXbLBkAS");
});

test("river pointer: the floor never goes back, and equal versions converge on the lower hash", () => {
  const f = { version: 7, codeHash: "bb".repeat(32) };
  assert.deepEqual(nextFloor(null, f), f);
  assert.deepEqual(nextFloor(f, null), f); // unreachable: keep what we had
  assert.deepEqual(nextFloor(f, { version: 6, codeHash: "aa".repeat(32) }), f); // replayed old record
  assert.deepEqual(nextFloor(f, { version: 7, codeHash: "aa".repeat(32) }), { version: 7, codeHash: "aa".repeat(32) });
  assert.deepEqual(nextFloor(f, { version: 7, codeHash: "cc".repeat(32) }), f);
  assert.deepEqual(nextFloor(f, { version: 8, codeHash: "cc".repeat(32) }), { version: 8, codeHash: "cc".repeat(32) });
});

test("river pointer: writes only under the generation river.wasm was built for", () => {
  assert.deepEqual(anchorOf(null), { codeHash: BUNDLED_ROOM_CODE, canWrite: true, withdrawn: false });
  assert.equal(anchorOf({ version: 8, codeHash: "cc".repeat(32) }).canWrite, false); // River is ahead: read only
  assert.deepEqual(anchorOf({ version: 9, codeHash: "0".repeat(64) }), { codeHash: "0".repeat(64), canWrite: false, withdrawn: true });
});

test("river pointer: resolving River's real record through river.wasm", async () => {
  const store = new Map<string, string>();
  const kv = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const call = await loadRiver(readFileSync(new URL("../src/wasm/river.wasm", import.meta.url)));

  assert.deepEqual(await resolveRoomContract(async () => hexToBytes(RECORD), call, kv), { codeHash: BUNDLED_ROOM_CODE, canWrite: true, withdrawn: false });
  // a forged record (version bumped, old signature) is ignored and the floor stays
  const forged = "0000000c" + RECORD.slice(8);
  assert.equal((await resolveRoomContract(async () => hexToBytes(forged), call, kv)).codeHash, BUNDLED_ROOM_CODE);
  assert.equal(JSON.parse(store.get("radica_river_pointer")!).version, 11);
  // pointer unreachable after it resolved once: the resolved hash stays
  assert.equal((await resolveRoomContract(async () => null, call, kv)).codeHash, BUNDLED_ROOM_CODE);
});
