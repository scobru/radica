import test from "node:test";
import assert from "node:assert/strict";
import { lifeOf, plantSvg } from "../src/plant.ts";
import { STAGES } from "../src/linfa.ts";

const A = "ab".repeat(32);
const B = "7f".repeat(32);
const count = (svg: string, cls: string) => svg.match(new RegExp(`class="${cls}[ "]`, "g"))?.length ?? 0;

test("a plant's life rises with its Linfa, from seed to full grown", () => {
  assert.equal(lifeOf(0), 0);
  assert.equal(lifeOf(-5), 0);
  let last = -1;
  for (let t = 0; t <= 800; t += 0.5) {
    const l = lifeOf(t);
    assert.ok(l >= last && l <= 1, `life at ${t}`);
    last = l;
  }
  assert.equal(lifeOf(5000), 1);
  for (let i = 1; i < STAGES.length; i++) assert.ok(lifeOf(STAGES[i].at) > lifeOf(STAGES[i].at - 0.5)); // each age shows
});

test("the same persona always has the same plant, and another persona another", () => {
  assert.equal(plantSvg(A, 120, 10), plantSvg(A, 120, 10));
  assert.notEqual(plantSvg(A, 120), plantSvg(B, 120));
});

test("no Linfa is a seed in the soil: no stem, no leaf, no root", () => {
  const svg = plantSvg(A, 0);
  assert.match(svg, /linfa-seed/);
  assert.deepEqual([count(svg, "linfa-branch"), count(svg, "linfa-leaf"), count(svg, "linfa-root")], [0, 0, 0]);
  assert.doesNotMatch(plantSvg(A, 1), /linfa-seed/);
});

test("it grows: the first point is a sprout with leaves, a tree has a crown, an elder tree flowers", () => {
  const sprout = plantSvg(A, 1);
  assert.equal(count(sprout, "linfa-branch"), 1);
  assert.ok(count(sprout, "linfa-leaf") >= 2);
  const wood = [1, 12, 40, 120, 300].map((t) => count(plantSvg(A, t), "linfa-branch"));
  assert.deepEqual(wood, [...wood].sort((x, y) => x - y));
  assert.ok(count(plantSvg(A, 300), "linfa-leaf") > 4 * count(plantSvg(A, 40), "linfa-leaf"));
  assert.equal(count(plantSvg(A, 250), "linfa-bloom"), 0);
  assert.ok(count(plantSvg(A, 700), "linfa-bloom") > 0);
});

test("only what grew this week is drawn fresh", () => {
  assert.doesNotMatch(plantSvg(A, 120, 0), / fresh"/);
  const svg = plantSvg(A, 120, 30);
  const fresh = svg.match(/linfa-leaf t\d fresh"/g)?.length ?? 0;
  assert.ok(fresh > 0 && fresh < count(svg, "linfa-leaf"));
});

test("every number in the picture is a number, at every Linfa", () => {
  for (const seed of [A, B, "", "x"])
    for (const t of [0, 0.3, 1, 5, 12, 39.9, 40, 119, 300, 699, 700, 1e6]) {
      const svg = plantSvg(seed, t, t / 3);
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/, `${seed.slice(0, 4)} at ${t}`);
      const [, , w, h] = /viewBox="([^"]+)"/.exec(svg)![1].split(" ").map(Number);
      assert.ok(w >= 54 && w === h && w < 400, `frame ${w} at ${t}`);
    }
});
