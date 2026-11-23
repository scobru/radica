// LAN mesh (see CONTEXT.md): a direct message or Secret Chat message I send also goes out as a UDP broadcast on the
// local network, through the Android / desktop apps' bridge (`__radicaNative.meshSend`), so two Radica devices on one
// Wi-Fi or hotspot still reach each other when Freenet cannot. The packet is the same signed, end-to-end sealed
// message the inbox log carries, so the LAN learns nothing the public log does not; a receiver keeps it only if it is
// addressed to them, in the two people's own conversation, signed by its sender and not from someone they block.

import type { ChatMessage } from "./types.ts";
import type { Cert } from "./whoiam.ts";
import { formatChatMessageSignatureMessage, verifyAuthorSignature } from "./crypto.ts";
import { dmPeerOf } from "./conversationState.ts";

/** One UDP datagram, with room to spare under its 65 507-byte limit. */
export const MESH_MAX_BYTES = 60_000;
/** A message is broadcast again every RESEND_EVERY_MS for RESEND_FOR_MS: UDP broadcast is lossy and a peer may join late. */
const RESEND_EVERY_MS = 20_000;
const RESEND_FOR_MS = 10 * 60_000;

interface MeshBridge {
  meshSend?: (json: string) => void;
}
const bridge = (): MeshBridge | undefined => (globalThis as { __radicaNative?: MeshBridge }).__radicaNative;

/** True in the Android and desktop apps, which can broadcast on the LAN. */
export const hasLanMesh = (): boolean => typeof bridge()?.meshSend === "function";

export function meshPacket(message: ChatMessage, cert?: Cert): string {
  return JSON.stringify({ v: 1, message, ...(cert ? { cert } : {}) });
}

/** A packet from the LAN, checked: the message, marked `via_lan`, or null. */
export async function acceptMeshPacket(raw: unknown, me: string, isBlocked: (pubkey: string) => boolean): Promise<ChatMessage | null> {
  if (!me || typeof raw !== "string" || raw.length > MESH_MAX_BYTES) return null;
  let p: { v?: unknown; message?: Partial<ChatMessage>; cert?: Cert };
  try {
    p = JSON.parse(raw);
  } catch {
    return null;
  }
  const m = p?.message;
  if (p?.v !== 1 || !m) return null;
  const { id, room_id, sender, recipient, text, timestamp, sig } = m;
  if (typeof id !== "string" || typeof room_id !== "string" || typeof sender !== "string" || typeof text !== "string") return null;
  if (typeof timestamp !== "number" || typeof sig !== "string" || recipient !== me) return null;
  // only the two people's own conversation: a signed message must not be filed into my chat with someone else
  if (dmPeerOf(room_id, me) !== sender || isBlocked(sender)) return null;
  const ok = await verifyAuthorSignature(formatChatMessageSignatureMessage(id, room_id, sender, recipient, text, timestamp), sig, sender, p.cert);
  return ok ? ({ ...m, via_lan: true } as ChatMessage) : null;
}

// shortcut: the resend queue is in memory, so a message sent just before the app closes is not broadcast again; it
// still reaches its inbox log once Freenet is back (logAppend's unsent queue)
const outbox = new Map<string, { json: string; until: number }>();
let timer: ReturnType<typeof setInterval> | undefined;

function resend(): void {
  const now = Date.now();
  for (const [id, o] of outbox) {
    if (o.until < now) outbox.delete(id);
    else bridge()?.meshSend?.(o.json);
  }
  if (!outbox.size && timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

/** Broadcast my message on the LAN now and for a while after. No-op outside the native apps or for an oversized one. */
export function meshSend(message: ChatMessage, cert?: Cert): void {
  const send = bridge()?.meshSend;
  if (typeof send !== "function") return;
  const json = meshPacket(message, cert);
  if (json.length > MESH_MAX_BYTES) return;
  outbox.set(message.id, { json, until: Date.now() + RESEND_FOR_MS });
  try {
    send(json);
  } catch {}
  timer ??= setInterval(resend, RESEND_EVERY_MS);
}

/** Packets the native app received on the LAN (posted to every frame as `{ type: "radica_mesh", data }`). */
export function onMeshPacket(fn: (raw: string) => void): void {
  if (typeof window === "undefined") return;
  window.addEventListener("message", (ev) => {
    const d = ev.data as { type?: unknown; data?: unknown } | null;
    if (d?.type === "radica_mesh" && typeof d.data === "string") fn(d.data);
  });
}
