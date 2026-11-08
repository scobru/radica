import test from "node:test";
import assert from "node:assert/strict";
import {
  FREEHOLE_SITE,
  FREEHOLE_REPO,
  WORMHOLE_SITE,
  WORMHOLE_REPO,
  freeholeLink,
  freeholeHref,
  freeholeCard,
  wormholeLink,
  wormholeCard,
} from "../src/wormhole.ts";

test("freehole: detects prefixed mnemonic transfer codes", () => {
  const ref1 = freeholeLink("Download file via fh:82-gentle-bird now");
  assert.ok(ref1);
  assert.equal(ref1.code, "82-gentle-bird");

  const ref2 = freeholeLink("Sync code: freehole:14-calm-wave");
  assert.ok(ref2);
  assert.equal(ref2.code, "14-calm-wave");

  const ref3 = freeholeLink("run `fh receive 92-brave-wave`");
  assert.ok(ref3);
  assert.equal(ref3.code, "92-brave-wave");

  const ref4 = freeholeLink("#fh/42-brave-fire");
  assert.ok(ref4);
  assert.equal(ref4.code, "42-brave-fire");

  const ref5 = wormholeLink("Sync code: wh:10-cool-stone");
  assert.ok(ref5);
  assert.equal(ref5.code, "10-cool-stone");
});

test("freehole: detects web contract URLs", () => {
  const url = `http://127.0.0.1:7509/v1/contract/web/${FREEHOLE_SITE}/#transfer`;
  const ref = freeholeLink(`Check this transfer: ${url}`);
  assert.ok(ref);
  assert.equal(ref.isSite, true);
  assert.ok(ref.rawUrl?.includes(FREEHOLE_SITE));
  assert.equal(FREEHOLE_SITE, WORMHOLE_SITE);
  assert.equal(FREEHOLE_REPO, "https://github.com/scobru/freehole");
});

test("freehole: generates valid card HTML with copy button and CLI instructions", () => {
  const cardHtml = freeholeCard("Sharing via fh:82-gentle-bird", "http://127.0.0.1:7509");
  assert.ok(cardHtml.includes("FreeHole P2P"));
  assert.ok(cardHtml.includes("82-gentle-bird"));
  assert.ok(cardHtml.includes("fh receive 82-gentle-bird --freenet"));
  assert.ok(cardHtml.includes(FREEHOLE_SITE));
  assert.ok(cardHtml.includes("data-copy-code=\"82-gentle-bird\""));
  assert.ok(cardHtml.includes("Receive on FreeHole"));
});

test("freehole: renders generic card when pointing to site without code", () => {
  const cardHtml = freeholeCard(`Open http://127.0.0.1:7509/v1/contract/web/${FREEHOLE_SITE}/`);
  assert.ok(cardHtml.includes("Decentralized P2P File Transfer"));
  assert.ok(cardHtml.includes("Open FreeHole"));
});

test("freehole: returns empty string when no freehole link is present", () => {
  assert.equal(freeholeCard("Regular social post without files"), "");
  assert.equal(freeholeLink("Regular social post without files"), null);
  assert.equal(wormholeCard("Regular social post without files"), "");
});
