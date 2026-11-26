import test from "node:test";
import assert from "node:assert/strict";
import { toBase58 } from "../src/whoiam.ts";
import { instanceOf, nextFloor } from "../src/contractKey.ts";

test("contract key: instance id matches the freenet-migrate test vector", () => {
  // freenet-migrate TEST-VECTORS.md: code hash 0xAA.., params "example-consumer-params"
  assert.equal(toBase58(instanceOf("aa".repeat(32), new TextEncoder().encode("example-consumer-params"))), "k2Nt3AT6K7L9obj1GwogHN2dpzY1MVaz9AAhXbLBkAS");
});

test("pointer floor: never goes back, and equal versions converge on the lower hash", () => {
  const f = { version: 7, codeHash: "bb".repeat(32) };
  assert.deepEqual(nextFloor(null, f), f);
  assert.deepEqual(nextFloor(f, null), f); // unreachable: keep what we had
  assert.deepEqual(nextFloor(f, { version: 6, codeHash: "aa".repeat(32) }), f); // replayed old record
  assert.deepEqual(nextFloor(f, { version: 7, codeHash: "aa".repeat(32) }), { version: 7, codeHash: "aa".repeat(32) });
  assert.deepEqual(nextFloor(f, { version: 7, codeHash: "cc".repeat(32) }), f);
  assert.deepEqual(nextFloor(f, { version: 8, codeHash: "cc".repeat(32) }), { version: 8, codeHash: "cc".repeat(32) });
});
