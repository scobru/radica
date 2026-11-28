import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// TASK-012: native confirm/alert/prompt are replaced by in-app dialogs (src/dialogs.ts) and toasts.
// Method calls (`rl.prompt(`, `x.confirm(`) and longer names (`confirmDialog(`) are not native dialogs.
const NATIVE = /(?<![\w.$])(?:window\.|globalThis\.|self\.)?(confirm|alert|prompt)\s*\(/;
// Known false positives as "file:trimmed line" (none today).
const ALLOWED = new Set<string>();

const SRC = join(import.meta.dirname, "..", "src");
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );

test("noNativeDialogs: the pattern catches native calls and skips look-alikes", () => {
  for (const s of ["if (!confirm(x)) return;", "alert('x')", "const r = prompt(q, '')", "window.confirm(x)", "globalThis.alert (x)"])
    assert.match(s, NATIVE, s);
  for (const s of ["rl.prompt()", "await confirmDialog(x)", "promptDialog(x)", "showAlert(x)", "$confirm(x)", "deps.alert(x)"])
    assert.doesNotMatch(s, NATIVE, s);
});

test("noNativeDialogs: no native confirm/alert/prompt left in ui/src", () => {
  const hits: string[] = [];
  for (const file of files(SRC)) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      const code = line.replace(/(^|\s)\/\/.*$/, ""); // comments may mention them (not "https://")
      const rel = file.slice(SRC.length + 1);
      if (NATIVE.test(code) && !ALLOWED.has(`${rel}:${line.trim()}`)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, [], `native dialogs found:\n${hits.join("\n")}`);
});
