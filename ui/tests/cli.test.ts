import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseContactCard } from "../src/contactCard.ts";

const ui = join(import.meta.dirname, "..");
const bin = join(ui, "dist-cli/radica-chat.mjs");

/** Run the terminal chat with these lines on stdin; its output, escape codes removed. */
function chat(home: string, lines: string[]): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [bin], { env: { ...process.env, RADICA_HOME: home } });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    let i = 0;
    const next = () => (i < lines.length ? (p.stdin.write(lines[i++] + "\n"), setTimeout(next, 2500)) : p.stdin.end());
    setTimeout(next, 1500);
    p.on("exit", () => resolve(out.replace(/\x1b\[[0-9;]*[A-Za-z]|\r/g, "")));
  });
}

test("cli: creates an identity, keeps it across runs, prints a valid contact card", { timeout: 120_000 }, async () => {
  execFileSync(process.execPath, [join(ui, "cli/build.mjs")]);
  const home = mkdtempSync(join(tmpdir(), "radica-cli-"));
  try {
    const first = await chat(home, ["/new", "/quit"]);
    const key = /Signed in as .* \(([0-9a-f]{12})…\)/.exec(first)?.[1];
    assert.ok(key, first);
    const second = await chat(home, ["/me", "/quit"]);
    assert.match(second, new RegExp(`Signed in as .* \\(${key}…\\)`));
    const card = parseContactCard(/radica:c1:\S+/.exec(second)?.[0] ?? "");
    assert.ok(card?.pubkey.startsWith(key!), second);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
