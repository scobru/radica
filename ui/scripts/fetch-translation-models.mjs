// Builds (and with --publish, publishes) the radica-lang-<code> web container for one language: the Bergamot models
// <code>→en and en→<code> from Mozilla's bucket, checked against their SHA-256, plus a registry.json (src/translate.ts).
//   node ui/scripts/fetch-translation-models.mjs it [--publish]
// Then put the printed contract key in ui/freenet-assets.json under "langs".
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "https://storage.googleapis.com/bergamot-models-sandbox/0.3.3";
const lang = process.argv[2];
if (!/^[a-z]{2}$/.test(lang ?? "") || lang === "en") {
  console.error("usage: fetch-translation-models.mjs <language code, e.g. it> [--publish]");
  process.exit(2);
}
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "translation-models", lang);

const registry = await (await fetch(`${BUCKET}/registry.json`)).json();
const pairs = [`${lang}en`, `en${lang}`].filter((p) => registry[p]);
if (!pairs.length) {
  console.error(`No Bergamot models for ${lang}. Available: ${Object.keys(registry).join(" ")}`);
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
for (const pair of pairs) {
  fs.mkdirSync(path.join(out, pair), { recursive: true });
  for (const f of Object.values(registry[pair])) {
    if (typeof f?.name !== "string" || !/^[A-Za-z0-9._-]+$/.test(f.name) || f.name.includes("..")) {
      throw new Error(`Unsafe model filename in registry: ${String(f?.name)}`);
    }
    const dest = path.join(out, pair, f.name);
    const sha = (b) => createHash("sha256").update(b).digest("hex");
    if (fs.existsSync(dest) && sha(fs.readFileSync(dest)) === f.expectedSha256Hash) continue;
    process.stdout.write(`${pair}/${f.name} (${(f.size / 1e6).toFixed(1)} MB)… `);
    const res = await fetch(`${BUCKET}/${pair}/${f.name}`);
    if (!res.ok) throw new Error(`${f.name}: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (sha(bytes) !== f.expectedSha256Hash) throw new Error(`${f.name}: checksum mismatch`);
    fs.writeFileSync(dest, bytes);
    console.log("ok");
  }
}
fs.writeFileSync(path.join(out, "registry.json"), JSON.stringify(Object.fromEntries(pairs.map((p) => [p, registry[p]])), null, 1));
fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><meta charset=utf-8><title>Radica translation: ${lang}</title><p>Translation models used by Radica (${pairs.join(", ")}).</p>\n`);
console.log(`radica-lang-${lang}: ${pairs.join(", ")} in ${path.relative(process.cwd(), out)}`);

if (process.argv.includes("--publish")) {
  const key = `radica-lang-${lang}`;
  const run = (args) => spawnSync("fdev", args, { stdio: "inherit", shell: process.platform === "win32" }).status === 0;
  // the signing key is made once; "init" fails harmlessly when it already exists
  run(["website", "init", key]);
  if (!run(["website", "publish", out, "--key", key])) process.exit(1);
  console.log(`\nNow add the contract key above to ui/freenet-assets.json: "langs": { "${lang}": "<key>" }`);
}
