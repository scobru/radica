import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { UPDATES } from "./src/updates.ts";
import zlib from "node:zlib";

/** This build's id: the page knows it, and version.json tells an open page when a newer build is published. */
const BUILD = String(Date.now());
/** Keys of the radica-assets / -filter / -litert web containers holding the heavy files (see scripts/split-freenet-dist.mjs); "" = none. */
const FREENET_ASSETS = JSON.parse(fs.readFileSync(path.resolve("freenet-assets.json"), "utf8"));
const ASSET_KEYS: Record<string, string> = { assets: FREENET_ASSETS.key ?? "", filter: FREENET_ASSETS.filterKey ?? "", litert: FREENET_ASSETS.litertKey ?? "" };
/** Keys of the radica-lang-<code> web containers holding translation models (see scripts/fetch-translation-models.mjs). */
const LANG_KEYS: Record<string, string> = FREENET_ASSETS.langs ?? {};

function versionFilePlugin(): Plugin {
  return {
    name: "radica-version-file",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD, updates: UPDATES.slice(0, 20) }) });
    },
  };
}

function desertAntWasmPlugin(): Plugin {
  const getWasmPath = () => path.resolve("node_modules/@desert-ant-labs/moderator/dist/ModeratorWeb.wasm");
  const getDepsPath = () => path.resolve("node_modules/.vite/deps/ModeratorWeb.wasm");

  const syncWasm = () => {
    try {
      const src = getWasmPath();
      const dest = getDepsPath();
      const depsDir = path.dirname(dest);
      if (fs.existsSync(src) && fs.existsSync(depsDir) && !fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    } catch {
      // ignore
    }
  };

  return {
    name: "desert-ant-wasm-plugin",
    configureServer(server) {
      syncWasm();

      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.includes("ModeratorWeb.wasm")) {
          const wasmPath = getWasmPath();
          if (fs.existsSync(wasmPath)) {
            res.setHeader("Content-Type", "application/wasm");
            const stat = fs.statSync(wasmPath);
            res.setHeader("Content-Length", stat.size);
            fs.createReadStream(wasmPath).pipe(res);
            return;
          }
        }
        next();
      });
    },
    buildStart() {
      syncWasm();
    },
  };
}

// The filter's wasm is 44 MiB, over the 32 MiB a Freenet node allows for one file of a web container: the build publishes it
// gzipped (moderation/filter/) and the package's own fetch of it is swapped for the app's loader (src/filterWasm.ts).
function moderatorWasmPlugin(): Plugin {
  const dist = path.resolve("node_modules/@desert-ant-labs/moderator/dist");
  const ownFetch = 'fetch(new URL("ModeratorWeb.wasm", import.meta.url))';
  return {
    name: "moderator-wasm-plugin",
    apply: "build",
    transform(code, id) {
      if (!id.split("?")[0].endsWith("/@desert-ant-labs/moderator/dist/index.js")) return null;
      if (!code.includes(ownFetch)) throw new Error("moderator package changed: update moderatorWasmPlugin");
      return code.replace(ownFetch, "globalThis.__radicaFilterWasm()");
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "moderation/filter/ModeratorWeb.gz.bin", source: zlib.gzipSync(fs.readFileSync(path.join(dist, "ModeratorWeb.wasm")), { level: 9 }) });
    },
  };
}

// The Freenet gateway's CSP only allows the app's own origin, so the LiteRT runtime that the moderator would
// fetch from jsDelivr is served with the app instead (dev: from node_modules, build: emitted into the bundle).
function litertWasmPlugin(): Plugin {
  const dir = path.resolve("node_modules/@litertjs/core/wasm");
  const files = ["litert_wasm_internal.js", "litert_wasm_internal.wasm", "litert_wasm_compat_internal.js", "litert_wasm_compat_internal.wasm"];
  return {
    name: "litert-wasm-plugin",
    configureServer(server) {
      server.middlewares.use("/moderation/litert/", (req, res, next) => {
        const f = path.basename((req.url || "").split("?")[0]);
        if (!files.includes(f)) return next();
        res.setHeader("Content-Type", f.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        fs.createReadStream(path.join(dir, f)).pipe(res);
      });
    },
    generateBundle() {
      for (const f of files) this.emitFile({ type: "asset", fileName: `moderation/litert/${f}`, source: fs.readFileSync(path.join(dir, f)) });
    },
  };
}

// The Bergamot translation engine, served as heavy files under translate/. Its worker is started from a blob: URL (the
// app's iframe has an opaque origin), where relative URLs do not resolve: it loads the engine from self.__bergamotBase.
function bergamotPlugin(): Plugin {
  const dir = path.resolve("node_modules/@browsermt/bergamot-translator/worker");
  const read = (f: string): string | Buffer => {
    if (f !== "translator-worker.js") return fs.readFileSync(path.join(dir, f));
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    const out = src
      .replace("new URL('./bergamot-translator-worker.wasm', self.location)", "new URL('bergamot-translator-worker.wasm', self.__bergamotBase)")
      .replace("self.importScripts('bergamot-translator-worker.js')", "self.importScripts(self.__bergamotBase + 'bergamot-translator-worker.js')");
    if ((out.match(/__bergamotBase/g) || []).length !== 2) throw new Error("bergamot worker changed: update bergamotPlugin");
    return out;
  };
  const files = ["translator-worker.js", "bergamot-translator-worker.js", "bergamot-translator-worker.wasm"];
  return {
    name: "bergamot-plugin",
    configureServer(server) {
      // models fetched with scripts/fetch-translation-models.mjs, for trying translation in dev
      server.middlewares.use("/translation-models/", (req, res, next) => {
        const f = path.resolve("translation-models", "." + decodeURIComponent((req.url || "").split("?")[0]));
        if (!f.startsWith(path.resolve("translation-models") + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return next();
        fs.createReadStream(f).pipe(res);
      });
      server.middlewares.use("/translate/", (req, res, next) => {
        const f = path.basename((req.url || "").split("?")[0]);
        if (!files.includes(f)) return next();
        res.setHeader("Content-Type", f.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        res.end(read(f));
      });
    },
    generateBundle() {
      for (const f of files) this.emitFile({ type: "asset", fileName: `translate/${f}`, source: read(f) });
    },
  };
}

function peerSyncPlugin(): Plugin {
  // In-memory memory relay for local development across normal & incognito tabs
  const memoryStore: {
    posts: any[];
    peers: Record<string, any>;
    communities: Record<string, any>;
    chatMessages: Record<string, any[]>;
  } = {
    posts: [],
    peers: {},
    communities: {},
    chatMessages: {},
  };

  return {
    name: "peer-sync-plugin",
    configureServer(server) {
      const handlePeerEvent = (data: any, client: any) => {
        if (!data) return;

        if (data.type === "hello") {
          if (data.pubkey) {
            memoryStore.peers[data.pubkey] = data.profile || { display_name: "Anonymous" };
          }
          // Send all cached state to newly joined client
          client.send("radica:sync-state", memoryStore);
          client.send("spruce:sync-state", memoryStore);
        } else if (data.type === "post") {
          if (data.post && !memoryStore.posts.some((p: any) => p.id === data.post.id)) {
            memoryStore.posts.unshift(data.post);
            memoryStore.posts = memoryStore.posts.slice(0, 200);
          }
        } else if (data.type === "community") {
          if (data.community && data.community.id) {
            memoryStore.communities[data.community.id] = data.community;
          }
        } else if (data.type === "chat") {
          if (data.message && data.message.room_id) {
            if (!memoryStore.chatMessages[data.message.room_id]) {
              memoryStore.chatMessages[data.message.room_id] = [];
            }
            if (!memoryStore.chatMessages[data.message.room_id].some((m: any) => m.id === data.message.id)) {
              memoryStore.chatMessages[data.message.room_id].push(data.message);
            }
          }
        } else if (data.type === "chat_clear") {
          if (data.roomId && memoryStore.chatMessages[data.roomId]) {
            memoryStore.chatMessages[data.roomId] = [];
          }
        } else if (data.type === "chat_delete") {
          if (data.roomId && data.messageId && memoryStore.chatMessages[data.roomId]) {
            memoryStore.chatMessages[data.roomId] = memoryStore.chatMessages[data.roomId].filter(
              (m: any) => m.id !== data.messageId
            );
          }
        }

        // Broadcast to all other connected tabs/clients
        for (const other of server.ws.clients) {
          const rawSocket = (other as any).socket;
          const isReady = rawSocket ? rawSocket.readyState === 1 : true;
          if (other !== client && isReady) {
            try {
              other.send("radica:peer-event", data);
              other.send("spruce:peer-event", data);
            } catch (err) {
              console.error("[peer-relay] send error:", err);
            }
          }
        }
      };

      server.ws.on("radica:peer-event", handlePeerEvent);
      server.ws.on("spruce:peer-event", handlePeerEvent);
    },
  };
}

// base "./": Freenet serves the app from a sandboxed iframe under a contract path.
export default defineConfig({
  base: "./",
  build: {
    target: "esnext",
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@noble")) {
            return "vendor-crypto";
          }
          if (id.includes("node_modules/@freenetorg")) {
            return "vendor-freenet";
          }
        },
      },
    },
  },
  optimizeDeps: {
    // imported only on the first Translate: found then, it would reload the dev page mid-translation
    include: ["@browsermt/bergamot-translator/translator.js"],
    esbuildOptions: {
      target: "esnext",
      supported: {
        "top-level-await": true,
      },
    },
  },
  server: {
    port: 5173,
  },
  define: { __RADICA_BUILD__: JSON.stringify(BUILD), __RADICA_ASSET_KEYS__: JSON.stringify(ASSET_KEYS), __RADICA_LANG_KEYS__: JSON.stringify(LANG_KEYS) },
  plugins: [desertAntWasmPlugin(), moderatorWasmPlugin(), litertWasmPlugin(), bergamotPlugin(), peerSyncPlugin(), versionFilePlugin()],
});
