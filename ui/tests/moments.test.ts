import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The composer uses one card for every post type: the Moment tab only toggles the
// moment-fields panel, it does not switch to a separate composer. This guards that
// contract, since a divergent moments composer is exactly what we removed.

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

test("composer has a single card shared by thought, moment and event", () => {
  assert.equal((html.match(/class="composer-card"/g) ?? []).length, 1, "one composer card");
  // Only the main composer tabs (thought, moment, event) should share the card
  const mainTabs = (html.match(/data-type="(thought|moment|event)"/g) ?? []).length;
  assert.equal(mainTabs, 3, "three main composer tabs share the card");
});

test("moment fields live inside the shared composer card", () => {
  const card = html.slice(html.indexOf('class="composer-card"'), html.indexOf('class="composer-actions"'));
  assert.ok(card.includes('id="moment-fields"'), "moment fields are inside the shared card");
  assert.ok(card.includes('id="post-caption"'), "the caption textarea is inside the shared card");
});