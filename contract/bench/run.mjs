// Times what the node does in validate_state: parse a feed and re-verify every signature. See README.md.
import { readFileSync } from "node:fs";
const bytes = readFileSync(process.argv[2]);
const mod = await WebAssembly.compile(bytes);
const imports = {};
for (const i of WebAssembly.Module.imports(mod)) (imports[i.module] ??= {})[i.name] = () => 0;
const { exports: x } = await WebAssembly.instantiate(mod, imports);
for (const [p, c, l] of [[100, 10, 10], [100, 50, 50], [200, 50, 50], [100, 200, 200]]) {
  const size = x.prepare(p, c, l);
  const recs = p * (1 + c + l);
  x.run(); // warm-up
  const t = performance.now(); const ok = x.run(); const ms = performance.now() - t;
  console.log(`${recs} records, ${(size / 1048576).toFixed(1)} MiB: ${ms.toFixed(0)} ms, valid=${ok}, ${(ms * 1000 / recs).toFixed(1)} us/record`);
}
