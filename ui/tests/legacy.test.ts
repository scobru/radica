import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blake3 } from "@noble/hashes/blake3.js";
import { CURRENT, LEGACY, canHaveLegacy } from "../src/legacy.ts";

const hashOf = (file: string) => Buffer.from(blake3(readFileSync(new URL(file, import.meta.url)))).toString("hex");

test("legacy: CURRENT names the committed contract builds (move the old hash to LEGACY when a wasm changes)", () => {
  assert.equal(hashOf("../src/wasm/contract.wasm"), CURRENT.feed);
  assert.equal(hashOf("../src/wasm/log.wasm"), CURRENT.log);
  assert.equal(hashOf("../src/wasm/media.wasm"), CURRENT.media);
});

test("legacy: no generation is listed twice or as both current and legacy", () => {
  for (const k of ["feed", "log", "media"] as const) {
    const all = [CURRENT[k], ...LEGACY[k]];
    assert.equal(new Set(all).size, all.length, k);
    for (const h of all) assert.match(h, /^[0-9a-f]{64}$/, k);
  }
});

test("legacy: logs that existed before log v2 are still looked up under earlier generations", () => {
  for (const id of ["log:dm/a:b", "log:devices/a", "log:poh", "log:delegations", "log:orto/a", "log:asocial/a", "log:freetunes/a", "log:freetree/a", "log:fh/a", "log:inbox/a", "feed:a"])
    assert.equal(canHaveLegacy(id), true, id);
  assert.equal(canHaveLegacy("log:handles"), false);
});
