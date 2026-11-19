// Splits ui/dist into the Freenet web containers (see src/heavyAssets.ts and scripts/heavy.mjs):
//   node scripts/split-freenet-dist.mjs app      -> ui/dist-app: the app without the heavy files
//   node scripts/split-freenet-dist.mjs assets   -> ui/dist-assets: stock GIFs and translation engine (radica-assets)
//   node scripts/split-freenet-dist.mjs filter   -> ui/dist-filter: the filter's gzipped wasm and model (radica-filter)
//   node scripts/split-freenet-dist.mjs litert   -> ui/dist-litert: the LiteRT runtime (radica-litert)
// Each container's fingerprint is saved when it is built and checked by "app", so an app that needs heavy files the published
// containers lack (e.g. after a moderator upgrade) is never published. Every container, the app's included, must fit what a
// Freenet 0.2.161+ node unpacks (LIMITS in heavy.mjs), or the script fails: the node answers "failed unpacking contract".
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTAINERS, LIMITS, containerOf } from "./heavy.mjs";

const ui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(ui, "dist");
const cfgPath = path.join(ui, "freenet-assets.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
/** freenet-assets.json field holding each container's key. */
const KEY_FIELD = { assets: "key", filter: "filterKey", litert: "litertKey" };

const files = (dir, base = dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, base) : [path.relative(base, p).split(path.sep).join("/")];
  });

function copy(rels, out) {
  fs.rmSync(out, { recursive: true, force: true });
  for (const rel of rels) {
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.copyFileSync(path.join(dist, rel), path.join(out, rel));
  }
}

const fingerprintOf = (rels) => {
  const hash = createHash("sha256");
  for (const rel of rels) hash.update(rel + "\0").update(fs.readFileSync(path.join(dist, rel)));
  return hash.digest("hex");
};

/** Fails when a container would not unpack on a node: too big, a file too big, or too many entries (directories count). */
function checkLimits(name, rels) {
  const sizes = rels.map((rel) => [rel, fs.statSync(path.join(dist, rel)).size]);
  const total = sizes.reduce((n, [, s]) => n + s, 0);
  const dirs = new Set(rels.flatMap((rel) => rel.split("/").slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join("/"))));
  const big = sizes.filter(([, s]) => s > LIMITS.file);
  const mib = (n) => (n / 1048576).toFixed(1);
  if (total > LIMITS.total || big.length || rels.length + dirs.size > LIMITS.entries) {
    console.error(
      `${name} would not unpack on a Freenet node: ${mib(total)} MiB (max ${mib(LIMITS.total)}), ` +
        `${rels.length + dirs.size} entries (max ${LIMITS.entries})` +
        (big.length ? `, files over ${mib(LIMITS.file)} MiB: ${big.map(([r, s]) => `${r} (${mib(s)})`).join(", ")}` : "") +
        ". Move files to another container (scripts/heavy.mjs).",
    );
    process.exit(1);
  }
  console.log(`${name}: ${rels.length} files, ${mib(total)} MiB (limit ${mib(LIMITS.total)})`);
}

const mode = process.argv[2];
if (!fs.existsSync(dist)) throw new Error("ui/dist missing: build first");
const all = files(dist).sort();

if (CONTAINERS.includes(mode)) {
  const rels = all.filter((rel) => containerOf(rel) === mode);
  checkLimits(`radica-${mode}`, rels);
  copy(rels, path.join(ui, `dist-${mode}`));
  fs.writeFileSync(path.join(ui, `dist-${mode}`, "index.html"), `<!doctype html><meta charset=utf-8><title>Radica ${mode}</title><p>Files used by Radica.</p>\n`);
  const { fingerprint: _old, ...rest } = cfg;
  fs.writeFileSync(cfgPath, JSON.stringify({ ...rest, fingerprints: { ...cfg.fingerprints, [mode]: fingerprintOf(rels) } }, null, 2) + "\n");
  console.log(`ui/dist-${mode} ready (fingerprint saved to ui/freenet-assets.json)`);
} else if (mode === "app") {
  const missing = CONTAINERS.filter((c) => !cfg[KEY_FIELD[c]]);
  if (missing.length) {
    console.error(`No key in ui/freenet-assets.json for: ${missing.map((c) => `radica-${c} ("${KEY_FIELD[c]}")`).join(", ")}. Publish those containers first (README).`);
    process.exit(1);
  }
  const stale = CONTAINERS.filter((c) => cfg.fingerprints?.[c] !== fingerprintOf(all.filter((rel) => containerOf(rel) === c)));
  if (stale.length) {
    console.error(`The files of ${stale.map((c) => `radica-${c}`).join(", ")} changed since it was last published. Run first: ${stale.map((c) => `npm run freenet:${c}:update`).join(" && ")}`);
    process.exit(1);
  }
  const app = all.filter((rel) => !containerOf(rel));
  checkLimits("app", app);
  copy(app, path.join(ui, "dist-app"));
  console.log(`App ready in ui/dist-app; ${all.length - app.length} heavy files load from the containers.`);
} else {
  console.error("usage: split-freenet-dist.mjs app|assets|filter|litert");
  process.exit(2);
}
