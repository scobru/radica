// What the desktop app injects as `window.__radicaNative` (apps/desktop/src/web.rs), for Node: the whole page store as
// one JSON file (getAll/setAll), and the LAN mesh as UDP broadcasts on port 47509 (meshSend, received packets posted as
// `{ type: "radica_mesh" }` messages). Imported before Radica's client code, which then runs unchanged.
import { createSocket } from "node:dgram";
import { Session } from "node:inspector/promises";
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
// typing lags when the main thread is busy: note every stall, so a slow terminal can be traced from chat.log
let tick = Date.now();
setInterval(() => {
  const late = Date.now() - tick - 250;
  if (late > 300) toLog(`event loop blocked ${late} ms`);
  tick = Date.now();
}, 250).unref();

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

// RADICA_PROFILE=1: a CPU profile of the whole run; on quit, the functions that held the main thread longest (what makes
// typing lag), printed and written to chat.log
const profiler = process.env.RADICA_PROFILE ? new Session() : null;
if (profiler) {
  profiler.connect();
  void profiler.post("Profiler.enable").then(() => profiler.post("Profiler.start"));
}

async function profileSummary(): Promise<string> {
  if (!profiler) return "";
  type Node = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number };
  const { profile } = (await profiler.post("Profiler.stop")) as { profile: { nodes: Node[]; samples: number[]; timeDeltas: number[] } };
  const ms = new Map<number, number>();
  profile.samples.forEach((id, i) => ms.set(id, (ms.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000));
  const byFn = new Map<string, number>();
  for (const n of profile.nodes) {
    const t = ms.get(n.id) ?? 0;
    if (!t || n.callFrame.functionName === "(idle)" || n.callFrame.functionName === "(program)") continue;
    const k = `${n.callFrame.functionName || "(anonymous)"} ${n.callFrame.url.split(/[\\/]/).pop()}:${n.callFrame.lineNumber + 1}`;
    byFn.set(k, (byFn.get(k) ?? 0) + t);
  }
  const top = [...byFn].sort((a, z) => z[1] - a[1]).slice(0, 15);
  const text = `CPU profile, busiest functions (self time):\n${top.map(([k, t]) => `  ${t.toFixed(0).padStart(7)} ms  ${k}`).join("\n")}`;
  toLog(text);
  return text;
}

/** Write the store to disk and let go of the socket; with RADICA_PROFILE, the profile summary to print. */
export async function shutdown(): Promise<string> {
  bus.dispatchEvent(new Event("pagehide"));
  try {
    udp.close();
  } catch {}
  return profileSummary().catch(() => "");
}
