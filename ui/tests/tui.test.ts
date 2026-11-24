import test from "node:test";
import assert from "node:assert/strict";
import { cut, width, wrap } from "../cli/tui.ts";

test("tui: emoji and CJK take two columns, combining marks none", () => {
  assert.equal(width("abc"), 3);
  assert.equal(width("🔒"), 2);
  assert.equal(width("日本"), 4);
  assert.equal(width("❤"), 1); // a text symbol: narrow
  assert.equal(width("❤\ufe0f"), 2); // with the emoji selector: wide
  assert.equal(width("✅"), 2); // emoji by default: wide
  assert.equal(width("é"), 1); // e + combining acute
  assert.equal(width("👍🏽"), 2); // skin tone modifier joins
});

test("tui: cut and wrap never exceed the pane, whatever the characters", () => {
  for (const s of ["Mario 🔒🔒🔒 secret", "日本語のメッセージです", "plain text that is long", "a".repeat(70)]) {
    assert.equal(width(cut(s, 10)), 10, s);
    for (const line of wrap(s, 9)) assert.ok(width(line) <= 9, `${s} -> ${line}`);
  }
  assert.deepEqual(wrap("ciao come va", 20), ["ciao come va"]);
});
