import test from "node:test";
import assert from "node:assert/strict";
import {
  FREETREE_SITE,
  FREETREE_REPO,
  parseFreetreeInput,
  freetreeLink,
  freetreeHref,
  freetreeCard,
  freetreeProfileCard,
} from "../src/freetree.ts";

test("freetree: parseFreetreeInput parses handle, hash, and web link", () => {
  assert.equal(parseFreetreeInput("scobru"), "scobru");
  assert.equal(parseFreetreeInput("#scobru"), "scobru");
  assert.equal(parseFreetreeInput("freetree:scobru"), "scobru");
  assert.equal(parseFreetreeInput(`http://127.0.0.1:7509/v1/contract/web/${FREETREE_SITE}/#scobru`), "scobru");
  assert.equal(parseFreetreeInput(""), null);
});

test("freetree: freetreeLink detects Freetree links in caption", () => {
  const ref1 = freetreeLink(`See my links at http://127.0.0.1:7509/v1/contract/web/${FREETREE_SITE}/#scobru`);
  assert.ok(ref1);
  assert.equal(ref1.prefix, "scobru");
  assert.equal(ref1.isSite, true);

  const ref2 = freetreeLink("My profile: freetree:7jEk1CQj7R");
  assert.ok(ref2);
  assert.equal(ref2.prefix, "7jEk1CQj7R");

  const ref3 = freetreeLink("Check out #freetree/ivvor");
  assert.ok(ref3);
  assert.equal(ref3.prefix, "ivvor");

  assert.equal(freetreeLink("Just a normal post"), null);
});

test("freetree: freetreeCard renders rich link card", () => {
  const cardHtml = freetreeCard("Check freetree:scobru", "http://127.0.0.1:7509");
  assert.ok(cardHtml.includes("Freetree Hub"));
  assert.ok(cardHtml.includes("@scobru on Freetree"));
  assert.ok(cardHtml.includes(FREETREE_SITE));
  assert.ok(cardHtml.includes("Open on Freetree"));
});

test("freetree: freetreeProfileCard renders user profile card", () => {
  const profileHtml = freetreeProfileCard("Scobru", "scobru", "http://127.0.0.1:7509");
  assert.ok(profileHtml.includes("Hub on Freetree"));
  assert.ok(profileHtml.includes("scobru"));
  assert.ok(profileHtml.includes(FREETREE_SITE));
});

