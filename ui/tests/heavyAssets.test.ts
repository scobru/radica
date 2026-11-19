import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { heavyUrlFor } from "../src/heavyAssets.ts";
import { filterWasmResponse } from "../src/filterWasm.ts";

const KEYS = { assets: "ASSETS", filter: "FILTER", litert: "LITERT" };
const APP = "http://127.0.0.1:7509/v1/contract/web/APPKEY/?__sandbox=1";
const GW = "http://127.0.0.1:7509/v1/contract/web/";

test("each heavy file loads from its own container on the gateway only", () => {
  assert.equal(heavyUrlFor("./gifs/shrug.gif", KEYS, APP), `${GW}ASSETS/gifs/shrug.gif`);
  assert.equal(heavyUrlFor("translate/", KEYS, APP), `${GW}ASSETS/translate/`);
  assert.equal(heavyUrlFor("moderation/litert/", KEYS, APP), `${GW}LITERT/moderation/litert/`);
  assert.equal(heavyUrlFor("moderation/model/", KEYS, APP), `${GW}FILTER/moderation/model/`);
  assert.equal(heavyUrlFor("moderation/filter/ModeratorWeb.gz.bin", KEYS, APP), `${GW}FILTER/moderation/filter/ModeratorWeb.gz.bin`);
  assert.equal(heavyUrlFor("https://x.org/a.gif", KEYS, APP), "https://x.org/a.gif");
  assert.equal(heavyUrlFor("assets/river-x.wasm", KEYS, APP), "assets/river-x.wasm"); // the app's own file
  assert.equal(heavyUrlFor("./gifs/shrug.gif", {}, APP), "./gifs/shrug.gif"); // no keys: shipped with the app
  assert.equal(heavyUrlFor("moderation/litert/", { assets: "ASSETS" }, APP), "moderation/litert/"); // that container has no key
  assert.equal(heavyUrlFor("./gifs/shrug.gif", KEYS, "http://localhost:5173/"), "./gifs/shrug.gif"); // dev, Electron
});

test("only what the app can live without leaves it: River's and GhostKey's wasm stay", async () => {
  const { containerOf, isHeavy } = await import("../scripts/heavy.mjs");
  assert.equal(containerOf("moderation/filter/ModeratorWeb.gz.bin"), "filter");
  assert.equal(containerOf("moderation/model/moderator.tflite"), "filter");
  assert.equal(containerOf("moderation/litert/litert_wasm_internal.wasm"), "litert");
  assert.equal(containerOf("gifs/shrug.gif"), "assets");
  assert.equal(containerOf("translate/bergamot-translator-worker.wasm"), "assets");
  for (const f of ["assets/river-BIoq41ea.wasm", "assets/river_room_contract-Dov_x.wasm", "assets/ghostkey-D-1.wasm", "assets/ghostkey-8d3x.js", "assets/contract-C.wasm", "assets/log--X.wasm", "assets/identity-T.wasm", "index.html"]) assert.equal(isHeavy(f), false, f);
});

test("the filter's wasm is unpacked into the Response the package expects, whoever decoded it", async () => {
  const wasm = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
  const fake = (body: BodyInit, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;
  for (const served of [gzipSync(wasm), wasm]) {
    // gzipped as published, or already decoded by a server that sent Content-Encoding
    const res = await filterWasmResponse("x", fake(served));
    assert.equal(res.headers.get("Content-Type"), "application/wasm");
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), wasm);
  }
  // a node that cannot open the container answers with text: the filter is reported unavailable, naming that
  await assert.rejects(filterWasmResponse("x", fake("failed unpacking contract")), /not a wasm file \(failed unpacking contract\)/);
  await assert.rejects(filterWasmResponse("x", fake("no", 500)), /HTTP 500/);
});
