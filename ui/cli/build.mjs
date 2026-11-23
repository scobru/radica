// Bundles the terminal chat (cli/chat.ts) with Radica's own client code (src/freenet.ts) into one Node file. Vite's
// `*.wasm?url` imports (the contracts' code) become data: URLs, which Node's fetch reads as the browser reads the URL.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const wasmAsDataUrl = {
  name: "wasm-url",
  setup(b) {
    b.onResolve({ filter: /\.wasm\?url$/ }, (a) => ({ path: resolve(a.resolveDir, a.path.slice(0, -4)), namespace: "wasm-url" }));
    b.onLoad({ filter: /.*/, namespace: "wasm-url" }, (a) => ({
      contents: `export default "data:application/wasm;base64,${readFileSync(a.path).toString("base64")}";`,
      loader: "js",
    }));
  },
};

await build({
  entryPoints: [resolve(import.meta.dirname, "chat.ts")], // import.meta.dirname: a URL pathname reads /D:/… on Windows
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: resolve(import.meta.dirname, "../dist-cli/radica-chat.mjs"),
  plugins: [wasmAsDataUrl],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "warning",
});
