// The plant a persona's Linfa grows (linfa.ts), drawn as an SVG.
//
// Each persona has one plant: its whole shape (every branch, leaf and root it will ever have) comes from the persona's
// key, and each part has a moment of its life at which it appears. The Linfa only says how far along that life the
// plant is, so a plant never reshuffles: it puts out the next leaf of the same tree. What appeared in the last week
// is drawn as fresh growth.
import { STAGES, stageOf, type Linfa } from "./linfa.ts";

/** How far along its life a plant is (0 a seed, 1 full grown) for each age's threshold, and past the last age. */
const LIFE = [0, 0.08, 0.3, 0.5, 0.7, 0.88];
const FULL_GROWN = 700; // the Linfa at which the last leaf is out

/** The plant's life (0 to 1) at a Linfa: even steps inside each age, so the first points show the most. */
export function lifeOf(total: number): number {
  const t = Math.max(0, total);
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (t < STAGES[i].at) continue;
    const [to, life] = i + 1 < STAGES.length ? [STAGES[i + 1].at, LIFE[i + 1]] : [FULL_GROWN, 1];
    return Math.min(1, LIFE[i] + ((t - STAGES[i].at) / (to - STAGES[i].at)) * (life - LIFE[i]));
  }
  return 0;
}

/** A repeatable random sequence from a persona's key (mulberry32 over a hash of the key). */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Branch { x: number; y: number; angle: number; bend: number; length: number; width: number; level: number; born: number }
interface Leaf { branch: Branch; at: number; side: number; tilt: number; size: number; tone: number; born: number; gone: number }
interface Bloom { branch: Branch; born: number }

const [CX, GROUND] = [130, 200];
const LEVELS = 5; // the trunk and four forks
const LEVEL_BORN = [0, 0.2, 0.38, 0.56, 0.74]; // when each level starts to grow
const SPAN = 0.16; // how much of the plant's life a branch takes to reach its length
const BLOOM = 0.885; // an elder tree flowers
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const f = (v: number) => (Math.round(v * 10) / 10).toString();

/** The whole plant of a persona, as it will be when full grown. */
function grow(seed: string): { branches: Branch[]; leaves: Leaf[]; blooms: Bloom[]; roots: Branch[] } {
  const r = rng(seed);
  const between = (a: number, b: number) => a + r() * (b - a);
  const branches: Branch[] = [];
  const leaves: Leaf[] = [];
  const blooms: Bloom[] = [];

  // a leaf sits at a share of its branch's length, so it rides outward as the branch grows
  const leafOn = (b: Branch, at: number, side: number, size: [number, number], born: number, gone = Infinity) =>
    leaves.push({ branch: b, at, side, tilt: between(0.72, 1.08), size: between(...size), tone: Math.floor(r() * 3), born: born + r() * 0.012, gone });

  const fork = (x: number, y: number, angle: number, length: number, width: number, level: number, born: number) => {
    const b: Branch = { x, y, angle, bend: between(0.04, 0.11) * (r() < 0.5 ? -1 : 1), length, width, level, born };
    branches.push(b);
    if (level === 0) {
      // the seedling: a bud at the tip, then two pairs of leaves on the stem; they fall once there is a crown
      const fall = () => LEVEL_BORN[3] + between(0, 0.1);
      leafOn(b, 1, 0, [11, 13], 0.03, LEVEL_BORN[1] + 0.03);
      for (const side of [-1, 1]) leafOn(b, 0.56, side, [15, 18], 0.045, fall());
      for (const side of [-1, 1]) leafOn(b, 0.86, side, [13, 16], 0.115, fall());
    } else if (level === 1) {
      const fall = () => LEVEL_BORN[4] + between(0, 0.1);
      for (const side of [-1, 1]) leafOn(b, 0.6, side, [12, 15], born + SPAN * 0.3, fall());
      leafOn(b, 1, 0, [12, 15], born + SPAN * 0.1, LEVEL_BORN[2] + 0.1);
    } else {
      // the crown: leaves along each twig, and a fan of them at its tip
      const n = level === LEVELS - 1 ? 5 : level === LEVELS - 2 ? 4 : 3;
      for (let i = 0; i < n; i++) leafOn(b, 0.3 + (0.7 * (i + 0.5)) / n, i % 2 ? 1 : -1, [10.5, 14.5], born + SPAN * (0.15 + (0.6 * i) / n));
      for (const side of level === LEVELS - 1 ? [-0.55, 0, 0.55] : [0]) leafOn(b, 1, side, [10.5, 14.5], born + SPAN * 0.08);
    }
    if (level === LEVELS - 1) {
      if (r() < 0.45) blooms.push({ branch: b, born: between(BLOOM, 0.99) });
      return;
    }
    const [ex, ey] = end(b, 1);
    // three-way forks keep a leader going up the middle, so the crown is round and not a fan
    const twigs = r() < (level === 0 ? 0.65 : 0.4) ? 3 : 2;
    const spread = between(0.42, 0.62);
    for (let i = 0; i < twigs; i++) {
      const turn = twigs === 2 ? (i ? 1 : -1) * spread * between(0.8, 1.15) : (i - 1) * spread * between(1.05, 1.4) + between(-0.08, 0.08);
      // every fork leans back toward the light, so the crown rises instead of sprawling
      const a = angle + turn + (Math.PI / 2 - (angle + turn)) * 0.22;
      // a twig starts when the branch under it is (nearly) grown
      fork(ex, ey, a, length * between(0.7, 0.8) * (twigs === 3 && i === 1 ? 1.08 : 1), width * 0.66, level + 1, Math.max(LEVEL_BORN[level + 1] + r() * 0.07, born + SPAN * 0.9));
    }
  };
  fork(CX, GROUND, Math.PI / 2 + between(-0.07, 0.07), 56, 10, 0, 0);

  // roots mirror the crown under the soil: Radica means root
  const roots: Branch[] = [];
  for (let i = 0; i < 7; i++) {
    const side = i % 2 ? 1 : -1;
    const angle = -Math.PI / 2 + side * between(0.25, 1.15);
    const root: Branch = { x: CX + side * between(0, 3), y: GROUND + 1, angle, bend: between(0.06, 0.14) * side, length: between(20, 36), width: between(2.2, 3.4), level: 0, born: i * 0.11 };
    roots.push(root);
    const [ex, ey] = end(root, 0.6);
    roots.push({ x: ex, y: ey, angle: angle - side * between(0.3, 0.7), bend: between(0.06, 0.12) * -side, length: root.length * between(0.45, 0.7), width: root.width * 0.55, level: 1, born: root.born + 0.12 });
  }
  return { branches, leaves, blooms, roots };
}

/** Where a branch is at `t` (0 its foot, 1 its tip), given how much of its length `scale` it has grown. */
function end(b: Branch, t: number, scale = 1): [number, number] {
  const len = b.length * scale;
  const [dx, dy] = [Math.cos(b.angle), -Math.sin(b.angle)];
  // the bend pushes the middle of the branch sideways: the same curve as the quadratic path drawn through it
  const side = b.bend * len * 4 * t * (1 - t);
  return [b.x + dx * len * t - dy * side, b.y + dy * len * t + dx * side];
}

/** A quadratic path from a branch's foot to its tip, through its bent middle. */
function curve(b: Branch, scale: number): { d: string; tip: [number, number] } {
  const [mx, my] = end(b, 0.5, scale);
  const tip = end(b, 1, scale);
  return { d: `M${f(b.x)} ${f(b.y)}Q${f(2 * mx - (b.x + tip[0]) / 2)} ${f(2 * my - (b.y + tip[1]) / 2)} ${f(tip[0])} ${f(tip[1])}`, tip };
}

/** A leaf pointing along +x from its stalk at the origin. */
const leafPath = (s: number): string =>
  `M0 0C${f(s * 0.2)} ${f(-s * 0.5)} ${f(s * 0.74)} ${f(-s * 0.42)} ${f(s)} 0C${f(s * 0.74)} ${f(s * 0.42)} ${f(s * 0.2)} ${f(s * 0.5)} 0 0Z`;

/**
 * The plant of `seed` (a persona's key) at a Linfa of `total`, `week` of which grew in the last seven days.
 * Colours and motion are the page's (style.css, `.linfa-plant`).
 */
export function plantSvg(seed: string, total: number, week = 0): string {
  const life = lifeOf(total);
  const before = week > 0 ? lifeOf(total - week) : Infinity; // what was there a week ago: the rest is fresh
  const plant = grow(seed);
  // a young plant is small and thin: the size of every branch follows the plant's life
  const reach = 0.36 + 0.64 * life;
  const girth = 0.15 + 0.85 * Math.pow(life, 1.2);
  // how far the drawing reaches, to frame it
  let [left, right, top, bottom] = [CX - 9, CX + 9, GROUND - 4, GROUND + 9];
  const reaches = (x: number, y: number, pad = 0) => {
    [left, right, top, bottom] = [Math.min(left, x - pad), Math.max(right, x + pad), Math.min(top, y - pad), Math.max(bottom, y + pad)];
  };

  // each branch starts where the tip of the one under it is now (branches come in the order they forked)
  const shown = new Map<Branch, { here: Branch; grown: number }>();
  const wood: string[] = [];
  const stack: Branch[] = [];
  for (const b of plant.branches) {
    while (stack.length > b.level) stack.pop();
    const under = shown.get(stack[stack.length - 1]);
    stack.push(b);
    const grown = clamp((life - b.born) / SPAN);
    if (grown <= 0 || (b.level > 0 && !under)) continue;
    const [x, y] = under ? end(under.here, 1, under.grown * reach) : [CX, GROUND];
    const here = { ...b, x, y };
    shown.set(b, { here, grown });
    const { d, tip } = curve(here, grown * reach);
    reaches(...tip, 2);
    wood.push(`<path class="linfa-branch" pathLength="1" style="--d:${b.level}" stroke-width="${f(Math.max(0.9, b.width * girth))}" d="${d}"/>`);
  }

  const leaves: string[] = [];
  let order = 0;
  for (const l of plant.leaves) {
    const s = shown.get(l.branch);
    if (!s || life < l.born || life >= l.gone) continue;
    const [x, y] = end(s.here, l.at, s.grown * reach);
    const angle = l.branch.angle + l.side * l.tilt;
    const size = l.size * (0.75 + 0.25 * life) * (0.4 + 0.6 * clamp((life - l.born) / 0.035)); // a new leaf is small, then opens
    reaches(x + Math.cos(angle) * size, y - Math.sin(angle) * size, size * 0.4);
    leaves.push(`<g transform="translate(${f(x)} ${f(y)}) rotate(${f((-angle * 180) / Math.PI)})"><path class="linfa-leaf t${l.tone}${l.born >= before ? " fresh" : ""}" style="--d:${f(l.branch.level + 1 + (order++ % 5) * 0.12)}" d="${leafPath(size)}"/></g>`);
  }

  const blooms = plant.blooms
    .filter((b) => life >= b.born && shown.has(b.branch))
    .map((b) => {
      const s = shown.get(b.branch)!;
      const [x, y] = end(s.here, 0.9, s.grown * reach);
      return `<g class="linfa-bloom" transform="translate(${f(x)} ${f(y)})">${[0, 72, 144, 216, 288].map((a) => `<ellipse class="petal" rx="2" ry="3.3" cy="-2.9" transform="rotate(${a})"/>`).join("")}<circle class="heart" r="1.5"/></g>`;
    });

  const roots: string[] = [];
  const rootReach = 0.45 + 0.55 * life;
  let main: { here: Branch; grown: number } | null = null;
  for (const b of total > 0 ? plant.roots : []) {
    const grown = clamp((0.25 + 0.75 * life - b.born) / 0.3);
    if (b.level === 0) main = grown > 0 ? { here: b, grown } : null;
    if (grown <= 0 || !main || (b.level === 1 && main.grown < 0.6)) continue;
    const [x, y] = b.level === 0 ? [b.x, b.y] : end(main.here, 0.6, main.grown * rootReach);
    const { d, tip } = curve({ ...b, x, y }, grown * rootReach);
    reaches(...tip, 2);
    roots.push(`<path class="linfa-root" pathLength="1" style="--d:${b.level}" stroke-width="${f(Math.max(0.7, b.width * (0.4 + 0.6 * life)))}" d="${d}"/>`);
  }

  // a seed lies in the soil until the first Linfa wakes it
  const seedHtml = total < STAGES[1].at ? `<g class="linfa-seed" transform="translate(${CX} ${GROUND + 4}) rotate(-24)"><ellipse rx="7.5" ry="4.6"/><path d="M-5 0.6Q0 -2.4 5 0.2"/></g>` : "";

  // the picture closes in on a young plant and steps back for a tree, standing on the bottom edge
  const side = Math.max(44, 2 * Math.max(CX - left, right - CX), bottom - top) + 10;
  const mound = Math.min(side * 0.42, 14 + 60 * life);
  return (
    `<svg class="linfa-plant" viewBox="${f(CX - side / 2)} ${f(bottom + 5 - side)} ${f(side)} ${f(side)}" role="img" aria-label="A plant">` +
    `<g class="linfa-roots">${roots.join("")}</g>` +
    `<path class="linfa-soil" d="M${f(CX - mound)} ${GROUND + 1}Q${CX} ${f(GROUND - side * 0.035)} ${f(CX + mound)} ${GROUND + 1}Q${CX} ${f(GROUND + side * 0.05)} ${f(CX - mound)} ${GROUND + 1}Z"/>` +
    seedHtml +
    `<g class="linfa-crown">${wood.join("")}${leaves.join("")}${blooms.join("")}</g>` +
    `</svg>`
  );
}

const HOW =
  "Linfa is the sap of a plant. Your node counts it from the posts, comments and likes it holds: nothing is stored, so nobody can write themselves a number. " +
  "Answering someone's post counts most (3), then being reposted (3), being answered (2), a like received (1), a like given (½). " +
  "Posting only grows the first leaves: one for each day posted, thirty at most. " +
  "And it flows through roots: the people you follow count whole, their friends half, strangers a quarter and only a little in all. So two readers can see two different plants.";

/** The Linfa of a persona on their profile: the plant, its age, the way to the next one and where the Linfa came from. */
export function linfaPanel(who: string, l: Linfa, mine: boolean): string {
  const s = stageOf(l.total);
  const n = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en");
  const seed = l.total < STAGES[1].at;
  const next = seed
    ? mine ? "Answer someone's post, or plant your first, and it wakes." : "Still a seed, as far as this node has seen."
    : s.next ? `${n(Math.max(0.1, s.next.at - l.total))} more to ${s.next.name.toLowerCase()}` : "Full grown, and still growing.";
  const part = (label: string, v: number) => `<li><span>${label}</span><b>${n(v)}</b></li>`;
  return (
    `<div class="linfa-panel">` +
    `<div class="linfa-pot">${plantSvg(who, l.total, l.week)}</div>` +
    `<div class="linfa-info">` +
    `<div class="linfa-stage">${s.name}</div>` +
    `<div class="linfa-count"><b>${n(l.total)}</b> Linfa${l.week > 0 ? ` <span class="linfa-week">+${n(l.week)} this week</span>` : ""}</div>` +
    `<div class="linfa-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.progress * 100)}" aria-label="Way to the next age"><span style="width: ${Math.round(s.progress * 100)}%"></span></div>` +
    `<div class="linfa-next">${next}</div>` +
    (seed ? "" : `<ul class="linfa-parts">${part("Answering others", l.given)}${part("Answers, likes and reposts received", l.received)}${part("Posting", l.posting)}</ul>`) +
    `<details class="linfa-how"><summary>How Linfa grows</summary><p>${HOW}</p></details>` +
    `</div></div>`
  );
}
