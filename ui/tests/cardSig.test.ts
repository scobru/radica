import test from "node:test";
import assert from "node:assert/strict";
import { cardSig, cardSigMatches } from "../src/cardSig.ts";

test("cardSig: a card matches only when every part is the same, and costly parts run only when the cheap ones match", () => {
  let runs = 0;
  const costly = [() => (runs++, "comments")];
  const stored = cardSig(["post", "badge A", 3], costly);
  runs = 0;
  assert.equal(cardSigMatches(stored, ["post", "badge A", 3], costly), true);
  assert.equal(runs, 1);
  runs = 0;
  assert.equal(cardSigMatches(stored, ["post", "badge B", 3], costly), false); // a changed badge redraws the card
  assert.equal(runs, 0); // without computing the comments
  assert.equal(cardSigMatches(stored, ["post", "badge A", 3], [() => "edited comments"]), false);
  assert.equal(cardSigMatches(undefined, ["post"], []), false);
  assert.equal(cardSigMatches(stored, ["post", "badge A"], costly), false); // a different layout never matches
});
