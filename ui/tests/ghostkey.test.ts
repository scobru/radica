import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadJsonWasm } from "../src/ghostkey.ts";
import { checkGhostkey } from "../src/ghostkey.ts";
import { asBytes, cborDecode, mapGet } from "../src/cbor.ts";
import { bytesToHex, hexToBytes } from "../src/crypto.ts";

const wasm = () => loadJsonWasm(readFileSync(new URL("../src/wasm/ghostkey.wasm", import.meta.url)), "GhostKey");

test("ghostkey.wasm: the request asks the default GhostKey to sign this persona's binding", async () => {
  const call = await wasm();
  const pk = "03".repeat(32);
  const { payload } = call({ op: "request", pubkey: pk });
  const message = asBytes(mapGet(mapGet(cborDecode(hexToBytes(payload)), "SignWithDefault"), "message"));
  assert.equal(bytesToHex(message), bytesToHex(new TextEncoder().encode("viso-ghostkey-v1:")) + pk);
});

test("ghostkey.wasm: a proof that is not a GhostKey certificate is refused", async () => {
  const call = await wasm();
  await assert.rejects(checkGhostkey("a0", "03".repeat(32), call), /GhostKey:/);
});
