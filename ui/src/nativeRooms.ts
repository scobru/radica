import type { ChatMessage, PrivateRoom, UserIdentity } from "./types.ts";
import {
  bytesToHex,
  encryptRoomKeyForPeer,
  encryptWithSymmetricKey,
  formatPrivateRoomSignatureMessage,
  generateRoomKey,
} from "./crypto.ts";

export interface ParsedRoomInvite {
  roomId: string;
  name: string;
  keyHex: string;
  creator: string;
  is_channel: boolean;
  linked_room_id?: string;
  linked_key_hex?: string;
  river?: { owner: string; k: string; member: string; secret?: string };
}

/** Create a signed, end-to-end encrypted native Radica PrivateRoom descriptor and its 32-byte symmetric key. */
export async function createNativeRoomDescriptor(
  identity: UserIdentity,
  name: string,
  roomId: string,
  myEncPub: string,
  opts?: { is_channel?: boolean; linked_room_id?: string; avatar_url?: string }
): Promise<{ room: PrivateRoom; roomKey: Uint8Array }> {
  const roomKey = generateRoomKey();
  const name_encrypted = await encryptWithSymmetricKey(roomKey, name);
  const created_at = Date.now();
  const encrypted_keys: Record<string, string> = {
    [identity.pubkey]: await encryptRoomKeyForPeer(identity.secretKey, myEncPub, roomKey),
  };
  const sig = await identity.sign(formatPrivateRoomSignatureMessage(roomId, identity.pubkey, created_at));
  const room: PrivateRoom = {
    id: roomId,
    creator: identity.pubkey,
    ...(identity.encPub ? { creator_enc_pub: identity.encPub } : {}),
    name_encrypted,
    ...(opts?.avatar_url ? { avatar_url: opts.avatar_url.trim() } : {}),
    members: [identity.pubkey],
    encrypted_keys,
    created_at,
    sig,
    ...(opts?.is_channel ? { is_channel: true } : {}),
    ...(opts?.linked_room_id ? { linked_room_id: opts.linked_room_id } : {}),
  };
  return { room, roomKey };
}

/** Build a zero-knowledge hash fragment invite URL for a native Radica room (and linked discussion room if present). */
export function buildPrivateRoomInviteLink(
  room: PrivateRoom,
  roomKey: Uint8Array,
  roomName: string,
  linkedRoomKey?: Uint8Array | null
): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const keyHex = bytesToHex(roomKey);
  const params = new URLSearchParams({
    join_room: room.id,
    name: roomName,
    key: keyHex,
    creator: room.creator,
  });
  if (room.is_channel) params.set("chan", "1");
  if (room.linked_room_id) {
    params.set("lr", room.linked_room_id);
    if (linkedRoomKey) params.set("lr_key", bytesToHex(linkedRoomKey));
  }
  return `${origin}${pathname}#${params.toString()}`;
}

/** Parse a room invite fragment's URLSearchParams into structured join parameters, or null if invalid. */
export function parseRoomInviteParams(params: URLSearchParams): ParsedRoomInvite | null {
  const roomId = params.get("join_room");
  const name = params.get("name") || "Private Room";
  const creator = params.get("creator") || "";
  const isChannel = params.get("chan") === "1" || params.get("is_channel") === "true";
  const linkedRoomId = params.get("lr") || params.get("linked_room_id") || undefined;
  const linkedKeyHex = params.get("lr_key") || undefined;
  const owner = params.get("river_owner");
  if (roomId && owner) {
    return {
      roomId,
      name,
      creator,
      keyHex: "",
      is_channel: isChannel,
      linked_room_id: linkedRoomId,
      river: { owner, k: params.get("k") ?? "", member: params.get("m") ?? "", secret: params.get("s") || undefined },
    };
  }
  const keyHex = params.get("key");
  return roomId && keyHex && keyHex.length === 64
    ? {
        roomId,
        name,
        keyHex,
        creator,
        is_channel: isChannel,
        linked_room_id: linkedRoomId,
        ...(linkedKeyHex?.length === 64 ? { linked_key_hex: linkedKeyHex } : {}),
      }
    : null;
}

/** Enforce read-only broadcast rules on native channels by keeping only creator and moderator messages. */
export function filterChannelMessages(
  room: Pick<PrivateRoom, "is_channel" | "creator" | "moderators">,
  messages: ChatMessage[]
): ChatMessage[] {
  if (!room.is_channel) return messages;
  const mods = new Set(room.moderators ?? []);
  return messages.filter((m) => m.sender === room.creator || mods.has(m.sender));
}
