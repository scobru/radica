import test from "node:test";
import assert from "node:assert/strict";
import { draftTranslatedTo, noteDraftTranslate, translateKeeping, undoDraftTranslate } from "../src/composeTranslate.ts";

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

test("draftTranslatedTo: null before, the language while the translation is untouched, null once edited", () => {
  const box = { value: "ciao" };
  assert.equal(draftTranslatedTo(box), null);
  noteDraftTranslate(box, "ciao", "hello", "en");
  box.value = "hello";
  assert.equal(draftTranslatedTo(box), "en");
  box.value = "hello!";
  assert.equal(draftTranslatedTo(box), null);
});

test("undoDraftTranslate: restores the original, fires input, false the second time and after an edit", () => {
  const events: string[] = [];
  const box = { value: "hello", dispatchEvent: (e: Event) => (events.push(e.type), true) };
  assert.equal(undoDraftTranslate(box), false);
  noteDraftTranslate(box, "ciao", "hello", "en");
  assert.equal(undoDraftTranslate(box), true);
  assert.equal(box.value, "ciao");
  assert.deepEqual(events, ["input"]);
  assert.equal(draftTranslatedTo(box), null);
  assert.equal(undoDraftTranslate(box), false);
  const edited = { value: "hello" };
  noteDraftTranslate(edited, "ciao", "hello", "en");
  edited.value = "hello world";
  assert.equal(undoDraftTranslate(edited), false);
  assert.equal(edited.value, "hello world");
});
