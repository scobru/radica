// Living Tree physics, like a force graph: each post bud is pulled back to its spot on the tree by a spring,
// pushes nearby buds and the bough labels away, and settles. A dragged bud is pinned to the pointer.

export interface SimNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** where the tree layout puts it */
  ax: number;
  ay: number;
  r: number;
  pinned: boolean;
}

/** An obstacle, by centre and size (a bough label pill). */
export interface SimRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SPRING = 0.045;
const DAMPING = 0.8;
const GAP = 6;
const MAX_FORCE = 6;

/** One frame. `repulsion` 0 keeps every bud on its layout spot; higher spreads crowded buds further. Returns the
 *  kinetic energy left, so the caller stops once it is near 0. */
export function simStep(nodes: SimNode[], rects: SimRect[], repulsion: number): number {
  const fx = new Float64Array(nodes.length);
  const fy = new Float64Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    fx[i] += (a.ax - a.x) * SPRING;
    fy[i] += (a.ay - a.y) * SPRING;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const contact = a.r + b.r + GAP;
      if (d >= contact * 3) continue;
      const [ux, uy] = d > 0.01 ? [dx / d, dy / d] : [1, 0]; // same spot: split sideways
      // inverse-square push, plus a hard one while they overlap
      const f = Math.min(MAX_FORCE, repulsion * 0.5 * (contact / Math.max(d, 1)) ** 2 + (d < contact ? (contact - d) * 0.25 : 0));
      fx[i] -= ux * f;
      fy[i] -= uy * f;
      fx[j] += ux * f;
      fy[j] += uy * f;
    }
    for (const r of rects) {
      // nearest point of the label to the bud
      const px = Math.max(r.x - r.w / 2, Math.min(r.x + r.w / 2, a.x));
      const py = Math.max(r.y - r.h / 2, Math.min(r.y + r.h / 2, a.y));
      const dx = a.x - px;
      const dy = a.y - py;
      const d = Math.hypot(dx, dy);
      const want = a.r + GAP;
      if (d >= want) continue;
      const [ux, uy] = d > 0.01 ? [dx / d, dy / d] : [0, a.y < r.y ? -1 : 1]; // inside the pill: out the nearer side
      const f = Math.min(MAX_FORCE, (want - d) * 0.3);
      fx[i] += ux * f;
      fy[i] += uy * f;
    }
  }
  let energy = 0;
  nodes.forEach((n, i) => {
    if (n.pinned) {
      n.vx = n.vy = 0;
      return;
    }
    n.vx = (n.vx + fx[i]) * DAMPING;
    n.vy = (n.vy + fy[i]) * DAMPING;
    n.x = Math.max(-345, Math.min(345, n.x + n.vx)); // inside the canopy view
    n.y = Math.max(-355, Math.min(-20, n.y + n.vy)); // above the ground line
    energy += n.vx * n.vx + n.vy * n.vy;
  });
  return energy;
}
