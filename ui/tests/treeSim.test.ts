import test from "node:test";
import assert from "node:assert/strict";
import { simStep, type SimNode } from "../src/treeSim.ts";

const node = (x: number, y: number, r = 8): SimNode => ({ x, y, vx: 0, vy: 0, ax: x, ay: y, r, pinned: false });
const settle = (nodes: SimNode[], rects = [] as Parameters<typeof simStep>[1], rep = 1) => {
  for (let k = 0; k < 2000; k++) if (simStep(nodes, rects, rep) < 1e-6) return k;
  return 2000;
};

test("treeSim: overlapping buds push apart and settle; repulsion 0 keeps them on their spot", () => {
  const a = node(0, -100), b = node(2, -100);
  assert.ok(settle([a, b]) < 2000, "settles");
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r, "no overlap");
  const c = node(0, -100), d = node(40, -100);
  settle([c, d], [], 0);
  assert.ok(Math.abs(c.x) < 0.01 && Math.abs(d.x - 40) < 0.01, "far apart buds stay put without repulsion");
});

test("treeSim: a pinned bud pushes its neighbour, which springs back once released", () => {
  const a = node(0, -100), b = node(30, -100);
  settle([a, b]);
  const rest = b.x;
  a.pinned = true;
  a.x = 26;
  settle([a, b]);
  assert.equal(a.x, 26, "pinned bud does not move");
  assert.ok(b.x > rest + 5, "neighbour pushed away");
  a.pinned = false;
  settle([a, b]);
  assert.ok(Math.abs(b.x - rest) < 0.5, "neighbour back");
});

test("treeSim: buds keep off bough labels", () => {
  const a = node(0, -100);
  settle([a], [{ x: 0, y: -100, w: 84, h: 20 }]);
  assert.ok(a.y <= -100 - 10 - a.r + 1 || a.y >= -100 + 10 + a.r - 1, `bud at y=${a.y} sits on the label`);
});
