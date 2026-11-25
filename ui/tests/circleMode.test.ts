import test from "node:test";
import assert from "node:assert/strict";
import { explorePeerKeys } from "../src/circleMode.ts";

const k = (c: string) => c.repeat(64);

test("circle mode: Explore fetches only the people I follow, and never draws the stranger lane", () => {
  let laneDrawn = false;
  const lane = () => ((laneDrawn = true), [k("e")]);
  assert.deepEqual(explorePeerKeys([k("a"), k("b"), k("a")], [k("c"), k("d")], lane, true), [k("a"), k("b")]);
  assert.equal(laneDrawn, false);
});

test("circle mode off: following, then up to 40 preferred keys, then the lane, without repeats", () => {
  const prefer = Array.from({ length: 45 }, (_, i) => i.toString(16).padStart(64, "0"));
  const keys = explorePeerKeys([k("a")], [k("a"), ...prefer], () => [k("e"), k("a")], false);
  assert.equal(keys[0], k("a"));
  assert.equal(keys.length, 1 + 39 + 1); // prefer's first entry repeats a followed key; the 40 cap applies before dedupe
  assert.equal(keys.at(-1), k("e"));
});
