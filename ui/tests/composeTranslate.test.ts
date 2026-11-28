import test from "node:test";
import assert from "node:assert/strict";
import { draftTranslatedTo, noteDraftTranslate, translateKeeping, undoDraftTranslate, type Box } from "../src/composeTranslate.ts";

const upper = async (t: string) => t.toUpperCase();

test("only the words are translated: links, mentions, tags, code, attachments and line breaks stay as written", async () => {
  const text = "ciao @Marco guarda https://example.org/a #freenet\n`codice` e [radica-cm1:img:x] fine. [qui](https://x.org)";
  assert.equal(
    await translateKeeping(text, "it", "en", upper),
    "CIAO @Marco GUARDA https://example.org/a #freenet\n`codice` E [radica-cm1:img:x] FINE. [qui](https://x.org)"
  );
});

test("pieces with no letters are not sent to the translator", async () => {
  let calls = 0;
  const count = async (t: string) => (calls++, t);
  await translateKeeping("@a @b 123 !!", "it", "en", count);
  assert.equal(calls, 0);
});

test("draftTranslatedTo and undoDraftTranslate track unedited translations, restore original, and invalidate on edit", () => {
  const events: string[] = [];
  const box: Box = {
    value: "ciao mondo",
    dispatchEvent(e: Event) {
      events.push(`${e.type}:${e.bubbles}`);
      return true;
    },
  };

  assert.equal(draftTranslatedTo(box), null);

  noteDraftTranslate(box, "ciao mondo", "hello world", "en");
  box.value = "hello world";
  assert.equal(draftTranslatedTo(box), "en");

  // Manual edit invalidates undo and does not overwrite edited text
  box.value = "hello world!";
  assert.equal(draftTranslatedTo(box), null);
  assert.equal(undoDraftTranslate(box), false);
  assert.equal(box.value, "hello world!");
  assert.deepEqual(events, []);

  // Re-record / match translated text and undo
  noteDraftTranslate(box, "ciao mondo", "hello world", "en");
  box.value = "hello world";
  assert.equal(draftTranslatedTo(box), "en");
  assert.equal(undoDraftTranslate(box), true);
  assert.equal(box.value, "ciao mondo");
  assert.deepEqual(events, ["input:true"]);
  assert.equal(draftTranslatedTo(box), null);

  // Second undo call returns false without dispatching again
  assert.equal(undoDraftTranslate(box), false);
  assert.equal(box.value, "ciao mondo");
  assert.deepEqual(events, ["input:true"]);
});
