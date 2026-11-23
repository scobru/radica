import test from "node:test";
import assert from "node:assert/strict";
import { appPath, RADICA_APP_PATH } from "../src/whoiam.ts";

const at = (href: string) => {
  (globalThis as { location?: URL }).location = new URL(href);
  try {
    return appPath();
  } finally {
    delete (globalThis as { location?: URL }).location;
  }
};

test("appPath: off the node, Radica uses the published app's contracts", () => {
  assert.equal(appPath(), RADICA_APP_PATH); // Node: the terminal chat
  assert.equal(at("radica://localhost/index.html"), RADICA_APP_PATH); // Open without Freenet, macOS/Linux
  assert.equal(at("https://radica.localhost/index.html"), RADICA_APP_PATH); // Windows
  assert.equal(at("https://radica.local/index.html"), RADICA_APP_PATH); // Android
});

test("appPath: on the node, the path it is served at; a dev server keeps its own", () => {
  assert.equal(at("http://127.0.0.1:7509/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/index.html"), RADICA_APP_PATH);
  assert.equal(at("http://127.0.0.1:7509/v1/contract/web/OtherKey/"), "/v1/contract/web/OtherKey/");
  assert.equal(at("http://localhost:5173/"), "/");
});
