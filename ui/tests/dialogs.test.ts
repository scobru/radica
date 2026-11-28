import test from "node:test";
import assert from "node:assert/strict";

test("dialogs: importing the module touches no DOM", async () => {
  assert.equal(typeof (globalThis as { document?: unknown }).document, "undefined");
  const mod = await import("../src/dialogs.ts");
  assert.equal(typeof mod.confirmDialog, "function");
  assert.equal(typeof mod.promptDialog, "function");
  assert.equal(typeof mod.showToast, "function");
});

const { dialogKeyAction, createDialogQueue } = await import("../src/dialogs.ts");

test("dialogs: dialogKeyAction maps Escape/Esc to cancel everywhere", () => {
  for (const key of ["Escape", "Esc"]) {
    assert.equal(dialogKeyAction(key, { kind: "confirm", inInput: false, focused: "ok" }), "cancel");
    assert.equal(dialogKeyAction(key, { kind: "prompt", inInput: true, focused: null }), "cancel");
  }
});

test("dialogs: dialogKeyAction Enter semantics", () => {
  assert.equal(dialogKeyAction("Enter", { kind: "prompt", inInput: true, focused: null }), "ok");
  assert.equal(dialogKeyAction("Enter", { kind: "confirm", inInput: false, focused: "ok" }), "ok");
  // Enter on a focused Cancel must cancel (danger confirms focus Cancel first).
  assert.equal(dialogKeyAction("Enter", { kind: "confirm", inInput: false, focused: "cancel" }), "cancel");
  assert.equal(dialogKeyAction("Enter", { kind: "prompt", inInput: false, focused: "cancel" }), "cancel");
  assert.equal(dialogKeyAction("Enter", { kind: "confirm", inInput: false, focused: null }), null);
  // inInput only matters for prompts.
  assert.equal(dialogKeyAction("Enter", { kind: "confirm", inInput: true, focused: null }), null);
});

test("dialogs: dialogKeyAction ignores other keys", () => {
  for (const key of ["Tab", " ", "a", "Space", "enter", "escape"]) {
    assert.equal(dialogKeyAction(key, { kind: "prompt", inInput: true, focused: "ok" }), null, key);
  }
});

/** Fake renderer: each request stays open until the test resolves it. */
function fakeRenderer<Res>() {
  const opened: { req: string; resolve: (r: Res) => void; reject: (e: unknown) => void }[] = [];
  let active = 0;
  let maxActive = 0;
  const render = (req: string) =>
    new Promise<Res>((resolve, reject) => {
      active++;
      maxActive = Math.max(maxActive, active);
      const done = <T>(fn: (v: T) => void) => (v: T) => { active--; fn(v); };
      opened.push({ req, resolve: done(resolve), reject: done(reject) });
    });
  return { render, opened, max: () => maxActive };
}

const tick = () => new Promise((r) => setImmediate(r));

test("dialogs: createDialogQueue renders one at a time, FIFO, results routed to callers", async () => {
  const f = fakeRenderer<boolean | string | null>();
  const show = createDialogQueue(f.render);
  const a = show("a");
  const b = show("b");
  const c = show("c");
  await tick();
  assert.deepEqual(f.opened.map((o) => o.req), ["a"], "second request waits");
  f.opened[0].resolve(true);
  assert.equal(await a, true);
  await tick();
  assert.deepEqual(f.opened.map((o) => o.req), ["a", "b"]);
  f.opened[1].resolve(null);
  assert.equal(await b, null);
  await tick();
  f.opened[2].resolve("typed ");
  assert.equal(await c, "typed ", "value passes through untrimmed");
  assert.equal(f.max(), 1);
});

test("dialogs: createDialogQueue resolves false from a cancelled confirm", async () => {
  const f = fakeRenderer<boolean>();
  const show = createDialogQueue(f.render);
  const p = show("x");
  await tick();
  f.opened[0].resolve(false);
  assert.equal(await p, false);
});

test("dialogs: a rejecting render does not block the next request", async () => {
  const f = fakeRenderer<boolean>();
  const show = createDialogQueue(f.render);
  const a = show("a");
  const b = show("b");
  await tick();
  f.opened[0].reject(new Error("boom"));
  await assert.rejects(a, /boom/);
  await tick();
  assert.equal(f.opened.length, 2);
  f.opened[1].resolve(true);
  assert.equal(await b, true);
});

test("dialogs: a synchronously throwing render does not block the next request", async () => {
  let calls = 0;
  const show = createDialogQueue(async (req: string) => {
    calls++;
    if (req === "bad") throw new Error("render failed");
    return req.toUpperCase();
  });
  const bad = show("bad");
  const good = show("good");
  await assert.rejects(bad, /render failed/);
  assert.equal(await good, "GOOD");
  const throwsSync = createDialogQueue((req: string): Promise<string> => {
    if (req === "bad") throw new Error("sync");
    return Promise.resolve(req);
  });
  const s1 = throwsSync("bad");
  const s2 = throwsSync("ok");
  await assert.rejects(s1, /sync/);
  assert.equal(await s2, "ok");
  assert.equal(calls, 2);
});

test("dialogs: queue keeps working after it drains", async () => {
  const show = createDialogQueue(async (n: number) => n * 2);
  assert.equal(await show(1), 2);
  await tick();
  assert.equal(await show(2), 4);
});
