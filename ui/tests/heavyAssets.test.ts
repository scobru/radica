import { test } from "node:test";
import assert from "node:assert/strict";
import { heavyUrlFor } from "../src/heavyAssets.ts";

test("heavy files load from the radica-assets container on the gateway only", () => {
  const app = "http://127.0.0.1:7509/v1/contract/web/APPKEY/?__sandbox=1";
  assert.equal(heavyUrlFor("./gifs/shrug.gif", "ASSETS", app), "http://127.0.0.1:7509/v1/contract/web/ASSETS/gifs/shrug.gif");
  assert.equal(heavyUrlFor("moderation/litert/", "ASSETS", app), "http://127.0.0.1:7509/v1/contract/web/ASSETS/moderation/litert/");
  assert.equal(heavyUrlFor("assets/ModeratorWeb-x.wasm", "ASSETS", app), "http://127.0.0.1:7509/v1/contract/web/ASSETS/assets/ModeratorWeb-x.wasm");
  assert.equal(heavyUrlFor("https://x.org/a.gif", "ASSETS", app), "https://x.org/a.gif");
  assert.equal(heavyUrlFor("./gifs/shrug.gif", "", app), "./gifs/shrug.gif"); // no assets key: shipped with the app
  assert.equal(heavyUrlFor("./gifs/shrug.gif", "ASSETS", "http://localhost:5173/"), "./gifs/shrug.gif"); // dev, Electron
});

test("River's and GhostKey's wasm ship with the app: only the filter's wasm is heavy (node limit of 32 MiB per file, 48 MiB per container)", async () => {
  const { isHeavy } = await import("../scripts/heavy.mjs");
  assert.equal(isHeavy("assets/ModeratorWeb-x.wasm"), true);
  for (const f of ["assets/river-BIoq41ea.wasm", "assets/river_room_contract-Dov_x.wasm", "assets/ghostkey-D-1.wasm", "assets/ghostkey-8d3x.js", "assets/contract-C.wasm", "assets/log--X.wasm", "assets/identity-T.wasm"]) assert.equal(isHeavy(f), false, f);
});
