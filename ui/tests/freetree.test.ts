import test from "node:test";
import assert from "node:assert/strict";
import {
  FREETREE_SITE,
  FREETREE_REPO,
  parseFreetreeInput,
  freetreeLink,
  freetreeDataName,
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


// Same encoding as Freetree's Export (`#data=` + url-encoded base64 of UTF-8 JSON).
function exportHash(tree: object): string {
  const json = JSON.stringify(tree);
  const b64 = btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
  return `data=${encodeURIComponent(b64)}`;
}

test("freetree: portable data= links keep the whole payload and show the tree name", () => {
  const hash = exportHash({ p: "viso:464b576d", n: "Scobru è qui", h: "@x", b: "", pages: { Links: "* [a](https://a.b)" } });
  const url = `http://127.0.0.1:7509/v1/contract/web/${FREETREE_SITE}/#${hash}`;

  assert.equal(parseFreetreeInput(url), hash);
  assert.equal(parseFreetreeInput(hash), hash);
  assert.equal(freetreeLink(`look ${url} !`)?.prefix, hash);
  assert.equal(freetreeDataName(hash), "Scobru è qui");
  assert.equal(freetreeDataName("scobru"), null);
  assert.equal(freetreeDataName("data=@@@"), null);

  // Not re-encoded: Freetree decodes the hash itself.
  assert.ok(freetreeHref("http://n", hash).endsWith(`/#${hash}`));

  const card = freetreeCard(url, "http://127.0.0.1:7509");
  assert.ok(card.includes("Scobru è qui on Freetree"));
  assert.ok(!card.includes(">data<") && !card.includes("@data"));
  assert.ok(!/delta/i.test(card));

  const profile = freetreeProfileCard("x", hash, "http://127.0.0.1:7509");
  assert.ok(profile.includes("Scobru è qui"));
  assert.ok(!/delta/i.test(profile));
});

test("freetree: a malicious data= name is escaped", () => {
  const hash = exportHash({ n: '<img src=x onerror=alert(1)>' });
  const card = freetreeCard(`freetree:${hash}`, "http://n");
  assert.ok(!card.includes("<img"));
});
