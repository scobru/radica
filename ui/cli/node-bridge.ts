// What the desktop app injects as `window.__radicaNative` (apps/desktop/src/web.rs), for Node: the whole page store as
// one JSON file (getAll/setAll), and the LAN mesh as UDP broadcasts on port 47509 (meshSend, received packets posted as
// `{ type: "radica_mesh" }` messages). Imported before Radica's client code, which then runs unchanged.
import { createSocket } from "node:dgram";
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HOME = process.env.RADICA_HOME || join(homedir(), ".radica");
const STORE = join(HOME, "storage.json");
const MESH_PORT = 47509;
const MESH_MAX_BYTES = 60_000;
mkdirSync(HOME, { recursive: true, mode: 0o700 });

// Radica's client logs freely to the console (in a page, only devtools see it): here it goes to a file, so the chat stays
// readable; a rejection nobody awaited is logged too, as a page would, instead of ending the program.
const LOG = join(HOME, "chat.log");
const toLog = (...a: unknown[]) => {
  try {
    appendFileSync(LOG, `${new Date().toISOString()} ${a.map((x) => (x instanceof Error ? x.stack : typeof x === "string" ? x : JSON.stringify(x))).join(" ")}\n`);
  } catch {}
};
console.log = console.info = console.warn = console.error = console.debug = toLog;
process.on("unhandledRejection", (e) => toLog("unhandled:", e));

// a page's event bus: lanMesh.ts listens for "message", storage.ts flushes on "pagehide"
const bus = new EventTarget();
const g = globalThis as Record<string, unknown>;
g.addEventListener = bus.addEventListener.bind(bus);
g.removeEventListener = bus.removeEventListener.bind(bus);

let meshUp = false;
const udp = createSocket({ type: "udp4", reuseAddr: true });
udp.on("error", () => {
  meshUp = false; // port taken or no network: chat over Freenet still works
});
udp.on("message", (buf) => {
  if (buf.length <= MESH_MAX_BYTES) bus.dispatchEvent(new MessageEvent("message", { data: { type: "radica_mesh", data: buf.toString("utf8") } }));
});
udp.bind(MESH_PORT, () => {
  udp.setBroadcast(true);
  meshUp = true;
});

g.__radicaNative = {
  getAppMode: () => "messenger",
  getAll: () => {
    try {
      return readFileSync(STORE, "utf8");
    } catch {
      return null;
    }
  },
  setAll: (json: string) => {
    // atomic: a crash mid-write must not lose the identity seed
    writeFileSync(`${STORE}.tmp`, json, { mode: 0o600 });
    renameSync(`${STORE}.tmp`, STORE);
  },
  meshSend: (json: string) => {
    if (meshUp && Buffer.byteLength(json) <= MESH_MAX_BYTES) udp.send(json, MESH_PORT, "255.255.255.255");
  },
};

export const lanMeshUp = (): boolean => meshUp;

/** Write the store to disk and let go of the socket. */
export function shutdown(): void {
  bus.dispatchEvent(new Event("pagehide"));
  try {
    udp.close();
  } catch {}
}
