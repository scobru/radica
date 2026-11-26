// Unified Private Rooms lifecycle manager (Native E2EE AES-GCM/X25519 + River MLS/group bridge):
// creation, invite links, key decryption, moderator kicks + key rotation, The Gardener membership, and delegate backup/restore.

import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { roomJoinProofMessage } from "../../shared/protocol.js";
import { seedReadMark } from "./conversationState.ts";
import {
  bytesToHex,
  decryptRoomKeyFromPeer,
  decryptWithSymmetricKey,
  encryptDirectMessage,
  encryptRoomKeyForPeer,
  encryptWithSymmetricKey,
  formatChatMessageSignatureMessage,
  generateRoomKey,
  hexToBytes,
  personaName,
} from "./crypto.ts";
import { foldChatHides, hasLeftRoom, roomJoiners, roomJoinProofs, type LogEntry } from "./logfold.ts";
import { buildPrivateRoomInviteLink, createNativeRoomDescriptor, filterChannelMessages } from "./nativeRooms.ts";
import { RiverRooms, roomOwnerSk, vkOf, type RiverJoin } from "./riverRooms.ts";
import {
  AI_REPORTERS,
  RADICA_MAINTAINER,
  type ChatMessage,
  type NotificationItem,
  type PrivateRoom,
  type UserIdentity,
} from "./types.ts";

const ROOMS_STORAGE_KEY = "freenet_private_rooms";
const RIVER_JOIN_GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * The room list to back up on the node: rooms I am in here, plus every room the backup holds that this page
 * has not loaded yet. Page storage starts empty each session, so saving only local rooms would wipe unrestored rooms.
 */
export function mergeRoomBackup(local: PrivateRoom[], saved: PrivateRoom[], me: string): PrivateRoom[] {
  const here = new Set(local.map((r) => r?.id));
  return [...local.filter((r) => r?.members?.includes(me)), ...saved.filter((r) => r?.id && !here.has(r.id))];
}

/** Deterministic HMAC-SHA256 key possession proof embedded in `room_join` entries. */
export function computeRoomJoinProof(roomKey: Uint8Array, roomId: string, pubkey: string): string {
  return bytesToHex(hmac(sha256, roomKey, new TextEncoder().encode(roomJoinProofMessage(roomId, pubkey))));
}

export interface RiverRoomRoster {
  members: string[];
  creator: string;
  moderators: string[];
  deputyOf: Record<string, string[]>;
  memberVks: Record<string, string>;
}

export interface PrivateRoomStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PrivateRoomDeps {
  storage: PrivateRoomStorageLike;
  flushStorage: () => void;
  logEntries: (name: string) => LogEntry[];
  logAppend: (name: string, body: object, opts?: { flush?: boolean }) => Promise<void>;
  refreshLog: (name: string, force?: boolean, urgent?: boolean) => Promise<void>;
  logOfRoom: (roomId: string) => string;
  rivers: () => Promise<RiverRooms>;
  nodeGet: (key: string) => Promise<string | null>;
  nodePut: (key: string, value: string) => Promise<void>;
  readKeysReady: () => Promise<void>;
  encPubOf: (pubkey: string) => Promise<string>;
  isConnected: () => boolean;
  me: () => string;
  visibleChat: (roomId: string) => ChatMessage[];
  computeLogJoins: (roomId: string, entries: LogEntry[]) => ChatMessage[];
  plain: (key: string, decrypt: () => Promise<string>) => Promise<string>;
  broadcast: (data: unknown) => void;
  addNotification: (to: string, notif: Omit<NotificationItem, "id" | "timestamp" | "read">) => void;
  notifyListeners: () => void;
  peerDisplayName: (pubkey: string) => string | undefined;
  onPeerName: (pubkey: string, displayName: string) => void;
  now?: () => number;
}

export class PrivateRoomManager {
  private readonly deps: PrivateRoomDeps;
  private readonly now: () => number;

  public riverOnly = new Map<string, Record<string, string>>();
  public riverOnlyReady: Promise<void> = Promise.resolve();

  private privateRoomKeyCache = new Map<string, Uint8Array>();
  private rememberedRooms = new Set<string>();
  private roomsReady: Promise<void> = Promise.resolve();
  private syncingAccess = false;
  private roomsSaveTimer: ReturnType<typeof setTimeout> | undefined;
  private riverOnlySaveTimer: ReturnType<typeof setTimeout> | undefined;
  private rosters = new Map<string, RiverRoomRoster>();

  constructor(deps: PrivateRoomDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => Date.now());
  }

  public startRestore(): void {
    this.roomsReady = this.restoreRoomsFromNode();
    this.riverOnlyReady = this.restoreRiverOnly();
  }

  public dispose(): void {
    clearTimeout(this.roomsSaveTimer);
    this.roomsSaveTimer = undefined;
    clearTimeout(this.riverOnlySaveTimer);
    this.riverOnlySaveTimer = undefined;
  }

  public readRooms(): PrivateRoom[] {
    try {
      const raw = this.deps.storage.getItem(ROOMS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as PrivateRoom[]) : [];
    } catch {
      return [];
    }
  }

  private writeRooms(list: PrivateRoom[]): void {
    this.deps.storage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(list));
  }

  public riverRoster(roomId: string): RiverRoomRoster | undefined {
    return this.rosters.get(roomId);
  }

  public isRiverOwner(identity: UserIdentity, room: PrivateRoom): boolean {
    if (!room.river?.owner) return room.creator === identity.pubkey;
    const derived = vkOf(roomOwnerSk(identity.secretKey, room.id));
    if (derived === room.river.owner) return true;
    const given = this.deps.storage.getItem(`river_key_${room.id}`);
    if (given && vkOf(hexToBytes(given)) === room.river.owner) return true;
    return false;
  }

  public riverKey(identity: UserIdentity, room: PrivateRoom): Uint8Array {
    if (room.river?.owner && vkOf(roomOwnerSk(identity.secretKey, room.id)) === room.river.owner) {
      return roomOwnerSk(identity.secretKey, room.id);
    }
    const given = this.deps.storage.getItem(`river_key_${room.id}`);
    if (given) return hexToBytes(given);
    return room.creator === identity.pubkey ? roomOwnerSk(identity.secretKey, room.id) : identity.secretKey;
  }

  public riverOwnerKey(identity: UserIdentity, room: PrivateRoom): Uint8Array {
    const key = this.riverKey(identity, room);
    if (vkOf(key) === room.river?.owner) return key;
    const derived = roomOwnerSk(identity.secretKey, room.id);
    if (vkOf(derived) === room.river?.owner) return derived;
    return key;
  }

  public riverJoin(roomId: string): RiverJoin | undefined {
    try {
      return JSON.parse(this.deps.storage.getItem(`river_join_${roomId}`) || "null") ?? undefined;
    } catch {
      return undefined;
    }
  }

  private nickname(): string {
    const me = this.deps.me();
    return this.deps.peerDisplayName(me) || `Persona @${personaName(me).substring(0, 6)}`;
  }

  private movedToRiver(room: PrivateRoom): boolean {
    return this.deps.logEntries(`room/${room.id}`).some((e) => {
      try {
        return e.author === room.creator && JSON.parse(e.body).type === "room_moved";
      } catch {
        return false;
      }
    });
  }

  /** Fold-level merge used when applying `room/<id>` logs: native rooms take `foldRoom` as authoritative. */
  public mergeFoldedRoom(id: string, room: PrivateRoom): void {
    const list = this.readRooms();
    const existing = list.find((r) => r.id === id);
    const me = this.deps.me();
    const isRiverRoom = !!(room.river || existing?.river);
    const myMembership =
      isRiverRoom &&
      me &&
      (existing?.members?.includes(me) || !!this.deps.storage.getItem(`river_key_${id}`) || this.rememberedRooms.has(id));
    const mergedMembers = isRiverRoom
      ? Array.from(new Set([...(room.members || []), ...(existing?.members || []), ...(myMembership ? [me] : [])]))
      : room.members;
    const mergedKeys = isRiverRoom
      ? { ...(room.encrypted_keys || {}), ...(existing?.encrypted_keys || {}) }
      : room.encrypted_keys;
    const mergedRoom: PrivateRoom = {
      ...existing,
      ...room,
      avatar_url: room.avatar_url !== undefined ? room.avatar_url || undefined : existing?.avatar_url,
      pinned_message_id: room.pinned_message_id !== undefined ? room.pinned_message_id || undefined : existing?.pinned_message_id,
      gardener_enc_pub: room.gardener_enc_pub,
      members: mergedMembers,
      encrypted_keys: mergedKeys,
      is_channel: existing?.is_channel ?? room.is_channel,
      linked_room_id: existing?.linked_room_id ?? room.linked_room_id,
      river: existing?.river ?? room.river,
    };
    this.writeRooms([...list.filter((r) => r.id !== id), mergedRoom]);
    this.saveRoomsToNode();
  }

  public mergeRemotePrivateRooms(incoming: PrivateRoom[]): void {
    const list = this.readRooms();
    let changed = false;
    for (const room of incoming) {
      if (!room || !room.id) continue;
      const idx = list.findIndex((r) => r.id === room.id);
      if (idx >= 0) {
        const existing = list[idx];
        const mergedMembers = Array.from(new Set([...(existing.members || []), ...(room.members || [])]));
        const mergedKeys = { ...(existing.encrypted_keys || {}), ...(room.encrypted_keys || {}) };
        list[idx] = {
          ...existing,
          ...room,
          avatar_url: room.avatar_url !== undefined ? room.avatar_url || undefined : existing.avatar_url,
          pinned_message_id: room.pinned_message_id !== undefined ? room.pinned_message_id || undefined : existing.pinned_message_id,
          members: mergedMembers,
          encrypted_keys: mergedKeys,
        };
        changed = true;
      } else {
        list.push(room);
        changed = true;
      }
    }
    if (changed) {
      this.writeRooms(list);
      this.saveRoomsToNode();
    }
  }

  private replacePrivateRoom(room: PrivateRoom): void {
    const list = this.readRooms();
    this.writeRooms([...list.filter((r) => r.id !== room.id), room]);
    this.saveRoomsToNode();
  }

  private async rememberRoom(roomId: string): Promise<void> {
    if (this.rememberedRooms.has(roomId)) return;
    this.rememberedRooms.add(roomId);
    const me = this.deps.me();
    const known = this.deps.logEntries(`inbox/${me}`).some((e) => {
      try {
        const b = JSON.parse(e.body);
        return e.author === me && b.type === "room_ref" && b.roomId === roomId;
      } catch {
        return false;
      }
    });
    if (!known) {
      await this.deps.logAppend(`inbox/${me}`, { type: "room_ref", roomId }).catch((e) => console.warn("[Freenet] room_ref:", e));
    }
  }

  public async createPrivateRoom(
    identity: UserIdentity,
    name: string,
    memberPubkeys: string[],
    roomId = `privroom_${this.now()}_${bytesToHex(crypto.getRandomValues(new Uint8Array(16)))}`,
    opts?: { is_channel?: boolean; linked_room_id?: string; avatar_url?: string; public?: boolean; river?: boolean },
  ): Promise<PrivateRoom> {
    let room: PrivateRoom;
    if (opts?.river) {
      const owner = await (await this.deps.rivers()).create(identity.secretKey, roomId, name, this.nickname(), !opts?.public);
      room = {
        id: roomId,
        creator: identity.pubkey,
        name_encrypted: "",
        ...(opts?.avatar_url ? { avatar_url: opts.avatar_url.trim() } : {}),
        members: [identity.pubkey],
        encrypted_keys: {},
        created_at: this.now(),
        sig: "",
        river: { owner },
        ...(opts?.is_channel ? { is_channel: true } : {}),
        ...(opts?.linked_room_id ? { linked_room_id: opts.linked_room_id } : {}),
      };
    } else {
      const myEncPub = identity.encPub || (await this.deps.encPubOf(identity.pubkey));
      const created = await createNativeRoomDescriptor(identity, name, roomId, myEncPub, opts);
      this.privateRoomKeyCache.set(roomId, created.roomKey);
      room = created.room;
    }
    this.mergeRemotePrivateRooms([room]);
    this.deps.broadcast({ type: "private_room", room });
    await this.deps.logAppend(`room/${roomId}`, { type: "private_room", room });
    await this.rememberRoom(roomId);
    for (const member of new Set(memberPubkeys.filter((m) => m && m !== identity.pubkey))) {
      await this.inviteMemberToPrivateRoom(identity, roomId, member).catch((e) =>
        console.warn("[PrivateRoom] Could not invite", member, e),
      );
    }
    seedReadMark(this.deps.storage, roomId);
    this.deps.notifyListeners();
    return (await this.getPrivateRooms(identity)).find((r) => r.id === roomId) ?? room;
  }

  public async setRoomLinkedDiscussion(
    identity: UserIdentity,
    roomId: string,
    linkedRoomId?: string,
  ): Promise<PrivateRoom | null> {
    const room = this.readRooms().find((r) => r.id === roomId);
    if (!room || room.creator !== identity.pubkey) return null;
    room.linked_room_id = linkedRoomId || undefined;
    this.mergeRemotePrivateRooms([room]);
    this.deps.broadcast({ type: "private_room", room });
    await this.deps.logAppend(`room/${roomId}`, { type: "private_room", room });
    this.deps.notifyListeners();
    return room;
  }

  public async setRoomAvatar(identity: UserIdentity, roomId: string, avatarUrl?: string): Promise<PrivateRoom | null> {
    const room = this.readRooms().find((r) => r.id === roomId);
    if (!room) return null;
    const roster = room.river ? this.riverRoster(room.id) : null;
    const isOwnerOrMod =
      (roster?.creator ?? room.creator) === identity.pubkey ||
      (roster?.moderators ?? room.moderators ?? []).includes(identity.pubkey);
    if (!isOwnerOrMod) {
      throw new Error("Only the room creator or administrators can change the group picture");
    }
    room.avatar_url = avatarUrl && avatarUrl.trim() ? avatarUrl.trim() : undefined;
    this.mergeRemotePrivateRooms([room]);
    this.deps.broadcast({ type: "private_room", room });
    await this.deps
      .logAppend(`room/${roomId}`, {
        type: "room_avatar",
        roomId,
        avatar_url: room.avatar_url || "",
      })
      .catch((e) => console.warn("[Freenet] room_avatar log:", e));
    this.deps.notifyListeners();
    return room;
  }

  public async setRoomPinnedMessage(
    identity: UserIdentity,
    roomId: string,
    messageId?: string | null,
  ): Promise<void> {
    const cleanId = messageId && messageId.trim() ? messageId.trim() : undefined;
    if (roomId.startsWith("privroom_")) {
      const room = this.readRooms().find((r) => r.id === roomId);
      if (room) {
        const roster = room.river ? this.riverRoster(room.id) : null;
        const isOwnerOrMod =
          (roster?.creator ?? room.creator) === identity.pubkey ||
          (roster?.moderators ?? room.moderators ?? []).includes(identity.pubkey);
        if (!isOwnerOrMod) {
          throw new Error("Only the room creator or administrators can pin messages");
        }
        room.pinned_message_id = cleanId;
        this.mergeRemotePrivateRooms([room]);
        this.deps.broadcast({ type: "private_room", room });
        await this.deps
          .logAppend(`room/${roomId}`, {
            type: "room_pin",
            roomId,
            messageId: cleanId || "",
          })
          .catch((e) => console.warn("[Freenet] room_pin log:", e));
      }
    } else {
      this.deps.storage.setItem(`freenet_pin_${roomId}`, cleanId || "");
      await this.deps
        .logAppend(this.deps.logOfRoom(roomId), {
          type: "room_pin",
          roomId,
          messageId: cleanId || "",
        })
        .catch((e) => console.warn("[Freenet] room_pin log:", e));
    }
    this.deps.notifyListeners();
  }

  public getRoomPinnedMessageId(roomId: string): string | null {
    if (roomId.startsWith("privroom_")) {
      const room = this.readRooms().find((r) => r.id === roomId);
      if (room?.pinned_message_id) return room.pinned_message_id;
    }
    return this.deps.storage.getItem(`freenet_pin_${roomId}`) || null;
  }

  public async getPrivateRooms(identity: UserIdentity): Promise<PrivateRoom[]> {
    await this.roomsReady;
    void this.deps.refreshLog(`inbox/${identity.pubkey}`);
    const list = this.readRooms();
    let listModified = false;
    for (const r of list) {
      if (
        r?.river &&
        !r.members?.includes(identity.pubkey) &&
        (this.deps.storage.getItem(`river_key_${r.id}`) || this.rememberedRooms.has(r.id))
      ) {
        r.members = [...new Set([...(r.members || []), identity.pubkey])];
        listModified = true;
      }
      if (!r?.river && r.members?.includes(identity.pubkey)) {
        void this.deps.refreshLog(`room/${r.id}`);
        if (this.deps.isConnected()) void this.rememberRoom(r.id);
      }
    }
    if (listModified) {
      this.writeRooms(list);
      this.saveRoomsToNode();
    }
    if (this.deps.isConnected() && !this.syncingAccess) {
      this.syncingAccess = true;
      void this.syncRoomAccess(identity, list).finally(() => (this.syncingAccess = false));
    }
    return list
      .filter((r) => !(!r.river && this.movedToRiver(r)))
      .filter(
        (r) =>
          r &&
          ((r.members && r.members.includes(identity.pubkey)) ||
            (r.river && (!!this.deps.storage.getItem(`river_key_${r.id}`) || this.rememberedRooms.has(r.id)))) &&
          !this.deps.storage.getItem(`freenet_room_left_${identity.pubkey}_${r.id}`) &&
          !hasLeftRoom(this.deps.logEntries(`room/${r.id}`), r.id, identity.pubkey),
      );
  }

  private async syncRoomAccess(identity: UserIdentity, list: PrivateRoom[]): Promise<void> {
    const inbox = `inbox/${identity.pubkey}`;
    for (const r of list) {
      if (this.deps.storage.getItem(`freenet_room_left_${identity.pubkey}_${r.id}`)) {
        const mark = `room_hide_sent_${r.id}`;
        if (this.deps.storage.getItem(mark)) continue;
        this.deps.storage.setItem(mark, "1");
        await this.deps
          .logAppend(inbox, { type: "room_hide", roomId: r.id })
          .catch(() => this.deps.storage.removeItem(mark));
        continue;
      }
      if (!r.river) continue;
      const access = JSON.stringify({
        owner: r.river.owner,
        creator: r.creator,
        k: this.deps.storage.getItem(`river_key_${r.id}`) ?? "",
        join: this.riverJoin(r.id) ?? null,
        is_channel: !!r.is_channel,
        linked_room_id: r.linked_room_id ?? null,
      });
      const mark = `river_access_sent_${r.id}`;
      if (this.deps.storage.getItem(mark) === access) continue;
      this.deps.storage.setItem(mark, access);
      const sealed = await encryptDirectMessage(identity.secretKey, identity.encPub, access);
      await this.deps
        .logAppend(inbox, { type: "river_access", roomId: r.id, sealed })
        .catch(() => this.deps.storage.removeItem(mark));
    }
  }

  public async getPrivateRoomKey(identity: UserIdentity, room: PrivateRoom): Promise<Uint8Array | null> {
    if (room.river) return null;
    const myEncryptedKey = room.encrypted_keys?.[identity.pubkey] ?? room.encrypted_keys?.[identity.pubkey.toLowerCase()];
    if (!myEncryptedKey) return null;
    const cacheKey = `${room.id}:${myEncryptedKey}:${room.keys_enc_pub ?? ""}`;
    const cached = this.privateRoomKeyCache.get(cacheKey) ?? this.privateRoomKeyCache.get(room.id);
    if (cached && this.privateRoomKeyCache.has(cacheKey)) return cached;
    await this.deps.readKeysReady();

    const key =
      (room.keys_enc_pub ? await decryptRoomKeyFromPeer(identity.secretKey, room.keys_enc_pub, myEncryptedKey) : null) ??
      (room.gardener_enc_pub ? await decryptRoomKeyFromPeer(identity.secretKey, room.gardener_enc_pub, myEncryptedKey) : null) ??
      (await decryptRoomKeyFromPeer(identity.secretKey, room.creator_enc_pub || room.creator, myEncryptedKey)) ??
      (await decryptRoomKeyFromPeer(identity.secretKey, identity.encPub, myEncryptedKey));
    if (key) {
      this.privateRoomKeyCache.set(cacheKey, key);
      return key;
    }
    return null;
  }

  public async getPrivateRoomDecryptedName(identity: UserIdentity, room: PrivateRoom): Promise<string> {
    if (room.river) {
      const rooms = await this.deps.rivers();
      const state = rooms.cached(room.river.owner);
      if (!state) void rooms.load(room.river.owner).then((s) => s && this.deps.notifyListeners());
      try {
        const name = state
          ? rooms.read(state, room.river.owner, this.riverKey(identity, room), this.riverJoin(room.id)).name
          : null;
        if (name) return name;
      } catch (e) {
        console.warn("[River] Could not read room", room.id, e);
      }
      return `Private Room (${room.id.slice(9, 15)})`;
    }
    try {
      const key = await this.getPrivateRoomKey(identity, room);
      if (key && room.name_encrypted) {
        const decrypted = await decryptWithSymmetricKey(key, room.name_encrypted);
        if (!decrypted.startsWith("[Encrypted")) {
          return decrypted;
        }
      }
    } catch (e) {
      console.warn("Failed to decrypt private room name:", e);
    }
    return `Private Room (${room.id.slice(9, 15)})`;
  }

  public async inviteMemberToPrivateRoom(
    identity: UserIdentity,
    roomId: string,
    newMemberPubkey: string,
  ): Promise<PrivateRoom> {
    await this.deps.refreshLog(`room/${roomId}`, true);
    const rooms = await this.getPrivateRooms(identity);
    const room = rooms.find((r) => r.id === roomId);
    if (!room) throw new Error("Private room not found or unauthorized");
    if (room.creator !== identity.pubkey) {
      throw new Error("Only the room creator can invite (others can share the invite link)");
    }
    if (room.river) {
      const join = await (await this.deps.rivers()).invite(
        this.riverOwnerKey(identity, room),
        room.river.owner,
        await this.deps.encPubOf(newMemberPubkey),
      );
      if (!room.members.includes(newMemberPubkey)) room.members.push(newMemberPubkey);
      this.replacePrivateRoom(room);
      await this.deps.logAppend(`room/${room.id}`, { type: "private_room", room });
      await this.deps.logAppend(`inbox/${newMemberPubkey}`, { type: "room_invite", room, river_join: join });
      this.deps.addNotification(newMemberPubkey, {
        type: "chat",
        from: identity.pubkey,
        text: "invited you to an encrypted Private Room",
        linkRoomId: room.id,
      });
      this.deps.notifyListeners();
      return room;
    }

    const roomKey = await this.getPrivateRoomKey(identity, room);
    if (!roomKey) throw new Error("Cannot decrypt room key to invite peer");

    const encKey = await encryptRoomKeyForPeer(identity.secretKey, await this.deps.encPubOf(newMemberPubkey), roomKey);
    room.encrypted_keys[newMemberPubkey] = encKey;
    if (!room.members.includes(newMemberPubkey)) room.members.push(newMemberPubkey);

    this.mergeRemotePrivateRooms([room]);
    this.deps.broadcast({ type: "private_room", room });
    await this.deps.logAppend(`room/${room.id}`, { type: "private_room", room });
    await this.deps.logAppend(`inbox/${newMemberPubkey}`, { type: "room_invite", room });
    this.deps.addNotification(newMemberPubkey, {
      type: "chat",
      from: identity.pubkey,
      text: "invited you to an encrypted Private Room",
      linkRoomId: room.id,
    });
    this.deps.notifyListeners();
    return room;
  }

  public saveRoomsToNode(): void {
    if (!this.deps.me()) return;
    clearTimeout(this.roomsSaveTimer);
    this.roomsSaveTimer = setTimeout(() => void this.putRoomsToNode(), 500);
  }

  private async putRoomsToNode(): Promise<void> {
    const me = this.deps.me();
    let saved: PrivateRoom[] = [];
    try {
      saved = JSON.parse((await this.deps.nodeGet(`privrooms:${me}`)) || "[]");
    } catch {}
    const local = this.readRooms();
    await this.deps.nodePut(`privrooms:${me}`, JSON.stringify(mergeRoomBackup(local, saved, me)));
  }

  private async restoreRoomsFromNode(): Promise<void> {
    const me = this.deps.me();
    const raw = await this.deps.nodeGet(`privrooms:${me}`);
    if (!raw) return;
    let saved: PrivateRoom[];
    try {
      saved = JSON.parse(raw);
    } catch {
      return;
    }
    for (const r of saved) {
      if (r?.river && !this.deps.storage.getItem(`river_key_${r.id}`)) {
        const [k, join] = [await this.deps.nodeGet(`river-key:${r.id}`), await this.deps.nodeGet(`river-join:${r.id}`)];
        if (k) this.deps.storage.setItem(`river_key_${r.id}`, k);
        if (join) this.deps.storage.setItem(`river_join_${r.id}`, join);
      }
    }
    const localList = this.readRooms();
    const haveMap = new Map(localList.map((r) => [r.id, r]));
    const missing = saved.filter(
      (r) =>
        r?.id &&
        Array.isArray(r.members) &&
        r.members.includes(me) &&
        (!haveMap.has(r.id) || !haveMap.get(r.id)!.members?.includes(me)),
    );
    if (!missing.length) return;
    this.mergeRemotePrivateRooms(missing);
    for (const r of missing) if (!r.river) void this.deps.refreshLog(`room/${r.id}`);
    this.deps.notifyListeners();
  }

  public async addGardenerToPrivateRoom(identity: UserIdentity, roomId: string): Promise<PrivateRoom> {
    const gardener = AI_REPORTERS[0]?.toLowerCase();
    if (!gardener) throw new Error("The Gardener key is not configured");
    if (identity.pubkey.toLowerCase() !== RADICA_MAINTAINER.toLowerCase()) {
      throw new Error("Only Radica's maintainer can enable The Gardener");
    }
    await this.deps.refreshLog(`room/${roomId}`, true);
    const rooms = await this.getPrivateRooms(identity);
    const room = rooms.find((r) => r.id === roomId);
    if (!room) throw new Error("Private room not found or unauthorized");
    if (room.river || room.is_channel) throw new Error("The Gardener only supports native E2EE groups");

    const meLow = identity.pubkey.toLowerCase();
    const byCreator = room.creator.toLowerCase() === meLow;
    const isMod = (room.moderators ?? []).some((m) => m.toLowerCase() === meLow);
    if (!byCreator && !isMod) {
      throw new Error("Only the room creator or a room moderator can add The Gardener");
    }

    const roomKey = await this.getPrivateRoomKey(identity, room);
    if (!roomKey) throw new Error("Cannot decrypt room key to add The Gardener");

    const encKey = await encryptRoomKeyForPeer(identity.secretKey, await this.deps.encPubOf(gardener), roomKey);
    room.encrypted_keys = { ...(room.encrypted_keys ?? {}), [gardener]: encKey };
    if (!room.members.some((m) => m.toLowerCase() === gardener)) room.members = [...room.members, gardener];
    const mods = room.moderators ?? [];
    if (!mods.some((m) => m.toLowerCase() === gardener)) room.moderators = [...mods, gardener];
    room.gardener_enc_pub = identity.encPub;

    this.replacePrivateRoom(room);
    this.deps.broadcast({ type: "private_room", room });
    if (byCreator) await this.deps.logAppend(`room/${room.id}`, { type: "private_room", room }, { flush: true });
    await this.deps.logAppend(
      `room/${room.id}`,
      { type: "room_gardener", roomId: room.id, on: true, target: gardener, encrypted_key: encKey, inviter_enc_pub: identity.encPub },
      { flush: true },
    );
    await this.deps.logAppend(`inbox/${gardener}`, { type: "room_invite", room }, { flush: true });
    this.deps.notifyListeners();
    return room;
  }

  public async kickMemberFromPrivateRoom(
    identity: UserIdentity,
    roomId: string,
    targetPubkey: string,
  ): Promise<PrivateRoom> {
    await this.deps.refreshLog(`room/${roomId}`, true);
    const rooms = await this.getPrivateRooms(identity);
    const room = rooms.find((r) => r.id === roomId);
    if (!room) throw new Error("Private room not found or unauthorized");
    if (room.river) {
      const byOwner = room.creator === identity.pubkey;
      const mods = this.rosters.get(room.id)?.moderators ?? room.moderators ?? [];
      if (!byOwner && !mods.includes(identity.pubkey)) throw new Error("Only the room owner or a moderator can remove members");
      await (await this.deps.rivers()).kick(
        this.riverKey(identity, room),
        room.river.owner,
        await this.deps.encPubOf(targetPubkey),
      );
      room.members = room.members.filter((m) => m !== targetPubkey);
      if (byOwner) {
        this.replacePrivateRoom(room);
        await this.deps.logAppend(`room/${room.id}`, { type: "private_room", room });
      }
      await this.deps.logAppend(`room/${room.id}`, { type: "room_kick", roomId: room.id, target: targetPubkey });
      this.deps.notifyListeners();
      return room;
    }

    const byCreator = room.creator === identity.pubkey;
    const mods = room.moderators ?? [];
    const targetIsGardener = AI_REPORTERS.some((g) => g.toLowerCase() === targetPubkey.toLowerCase());
    if (!byCreator && !mods.includes(identity.pubkey)) throw new Error("Only the room creator or a moderator can kick members");
    if (targetPubkey === room.creator) throw new Error("The room creator cannot be kicked");
    if (!byCreator && mods.includes(targetPubkey) && !targetIsGardener) {
      throw new Error("Only the room creator can kick a moderator");
    }

    const targetLower = targetPubkey.toLowerCase();
    const oldRoomKey = await this.getPrivateRoomKey(identity, room);
    const roomEntries = this.deps.logEntries(`room/${room.id}`);
    const { creatorListed, joinProofs } = roomJoinProofs(roomEntries, room.id);
    const legacyProvenJoiners = new Set<string>();
    if (oldRoomKey) {
      for (const le of roomEntries) {
        const sender = le.author.toLowerCase();
        if (creatorListed.has(sender) || legacyProvenJoiners.has(sender)) continue;
        try {
          const parsed = JSON.parse(le.body);
          if (parsed?.type === "chat" && typeof parsed?.message?.text === "string" && parsed.message.text.startsWith("sym:")) {
            const plain = await decryptWithSymmetricKey(oldRoomKey, parsed.message.text);
            if (!plain.startsWith("[Encrypted room message")) legacyProvenJoiners.add(sender);
          }
        } catch {}
      }
    }

    room.members = room.members.filter((m) => {
      const ml = m.toLowerCase();
      if (ml === targetLower) return false;
      if (ml === room.creator.toLowerCase() || ml === identity.pubkey.toLowerCase() || creatorListed.has(ml)) return true;
      if (!oldRoomKey) return false;
      return joinProofs.get(ml) === computeRoomJoinProof(oldRoomKey, room.id, ml) || legacyProvenJoiners.has(ml);
    });
    room.moderators = mods.filter((m) => m.toLowerCase() !== targetLower && room.members.includes(m));
    delete room.encrypted_keys?.[targetPubkey];
    delete room.encrypted_keys?.[targetLower];

    const newRoomKey = generateRoomKey();
    const currentName = await this.getPrivateRoomDecryptedName(identity, room);
    room.name_encrypted = await encryptWithSymmetricKey(newRoomKey, currentName);
    for (const ck of [...this.privateRoomKeyCache.keys()]) {
      if (ck === room.id || ck.startsWith(`${room.id}:`)) this.privateRoomKeyCache.delete(ck);
    }
    const updatedKeys: Record<string, string> = {};
    for (const m of room.members) {
      try {
        updatedKeys[m] = await encryptRoomKeyForPeer(identity.secretKey, await this.deps.encPubOf(m), newRoomKey);
      } catch (e) {
        console.warn(`Could not re-encrypt key for member ${m}:`, e);
      }
    }
    room.encrypted_keys = updatedKeys;
    room.keys_enc_pub = byCreator ? undefined : identity.encPub;
    room.gardener_enc_pub = undefined;
    const newSelfEnc = updatedKeys[identity.pubkey];
    if (newSelfEnc) this.privateRoomKeyCache.set(`${room.id}:${newSelfEnc}:${room.keys_enc_pub ?? ""}`, newRoomKey);

    this.replacePrivateRoom(room);
    this.deps.broadcast({ type: "private_room_kick", roomId, kicked: targetPubkey, room });
    if (byCreator) await this.deps.logAppend(`room/${room.id}`, { type: "private_room", room }, { flush: true });
    await this.deps.logAppend(
      `room/${room.id}`,
      {
        type: "room_kick",
        roomId: room.id,
        target: targetPubkey,
        name_encrypted: room.name_encrypted,
        encrypted_keys: room.encrypted_keys,
        keys_enc_pub: room.keys_enc_pub,
      },
      { flush: true },
    );
    this.deps.notifyListeners();
    return room;
  }

  public async leavePrivateRoom(identity: UserIdentity, roomId: string): Promise<void> {
    const room = (await this.getPrivateRooms(identity)).find((r) => r.id === roomId);
    if (!room) throw new Error("Private room not found or unauthorized");
    if (room.creator !== identity.pubkey) await this.deps.logAppend(`room/${roomId}`, { type: "room_leave", roomId });
    this.deps.storage.setItem(`freenet_room_left_${identity.pubkey}_${roomId}`, String(this.now()));
    await this.deps.logAppend(`inbox/${identity.pubkey}`, { type: "room_hide", roomId });
    this.privateRoomKeyCache.delete(roomId);
    const keys = { ...room.encrypted_keys };
    delete keys[identity.pubkey];
    delete keys[identity.pubkey.toLowerCase()];
    this.replacePrivateRoom({
      ...room,
      members: room.members.filter((m) => m !== identity.pubkey),
      moderators: (room.moderators ?? []).filter((m) => m !== identity.pubkey),
      encrypted_keys: keys,
    });
    this.deps.notifyListeners();
  }

  public async setPrivateRoomModerator(
    identity: UserIdentity,
    roomId: string,
    target: string,
    on: boolean,
  ): Promise<PrivateRoom> {
    await this.deps.refreshLog(`room/${roomId}`, true);
    const room = (await this.getPrivateRooms(identity)).find((r) => r.id === roomId);
    if (!room) throw new Error("Private room not found or unauthorized");
    const isOwner = this.isRiverOwner(identity, room);
    if (room.river) {
      if (!isOwner) throw new Error("Only the room creator can name moderators");
    } else if (room.creator !== identity.pubkey) {
      throw new Error("Only the room creator can name moderators");
    }
    const roster = room.river ? this.rosters.get(room.id) : undefined;
    const creator = roster?.creator ?? room.creator;
    if (target === creator || !(roster?.members ?? room.members).includes(target)) {
      throw new Error("Only a member other than the creator can be a moderator");
    }
    const current = roster?.moderators ?? room.moderators ?? [];
    room.moderators = on ? [...new Set([...current, target])] : current.filter((m) => m !== target);
    if (room.river) {
      const resolveVk = async (m: string): Promise<string> => {
        if (roster?.memberVks?.[m]) return roster.memberVks[m];
        if (/^[0-9a-f]{64}$/i.test(m)) return m;
        return this.deps.encPubOf(m);
      };
      const vks = await Promise.all(room.moderators.map(resolveVk));
      await (await this.deps.rivers()).setDeputies(this.riverOwnerKey(identity, room), room.river.owner, vks);
    }
    this.replacePrivateRoom(room);
    this.deps.broadcast({ type: "private_room", room });
    await this.deps.logAppend(`room/${room.id}`, { type: "private_room", room });
    this.deps.notifyListeners();
    return room;
  }

  private saveRiverOnly(): void {
    clearTimeout(this.riverOnlySaveTimer);
    this.riverOnlySaveTimer = setTimeout(async () => {
      await this.deps.nodePut(`river-only:${this.deps.me()}`, JSON.stringify(Object.fromEntries(this.riverOnly)));
    }, 500);
  }

  private async restoreRiverOnly(): Promise<void> {
    try {
      const raw = (await this.deps.nodeGet(`river-only:${this.deps.me()}`)) || "{}";
      for (const [vk, rooms] of Object.entries(JSON.parse(raw))) {
        if (!this.riverOnly.has(vk)) this.riverOnly.set(vk, rooms as Record<string, string>);
      }
    } catch {}
    this.deps.notifyListeners();
  }

  public async riverState(rooms: RiverRooms, owner: string): Promise<string | null> {
    const cached = rooms.cached(owner);
    if (!cached) return rooms.load(owner);
    void rooms.load(owner).then((s) => s !== cached && this.deps.notifyListeners());
    return cached;
  }

  public async riverMessages(identity: UserIdentity, room: PrivateRoom): Promise<ChatMessage[]> {
    const rooms = await this.deps.rivers();
    const owner = room.river!.owner;
    const state = await this.riverState(rooms, owner);
    if (!state) return [];
    const myKey = this.riverKey(identity, room);
    const view = rooms.read(state, owner, myKey, this.riverJoin(room.id));
    const isOwner = this.isRiverOwner(identity, room);
    const who = new Map<string, string>();
    if (isOwner) {
      who.set(owner, identity.pubkey);
    } else {
      who.set(vkOf(myKey), identity.pubkey);
      if (room.creator && room.creator !== identity.pubkey) {
        who.set(owner, room.creator);
      }
    }
    for (const p of room.members) {
      if (p !== identity.pubkey && p !== room.creator) {
        who.set(await this.deps.encPubOf(p), p);
      }
    }

    const cleared = Number(this.deps.storage.getItem(`freenet_chat_cleared_${room.id}`) || 0);
    const name = (vk: string | null) => (vk ? who.get(vk) ?? vk : "");
    const here = new Set(view.members.map((m) => m.vk));
    for (const [, rmap] of this.riverOnly) if (!here.has(vkOf(myKey))) void rmap; // keep unused check quiet
    for (const [vk, rmap] of this.riverOnly) if (!here.has(vk)) delete rmap[room.id];
    for (const m of view.members) {
      if (!who.has(m.vk)) this.riverOnly.set(m.vk, { ...this.riverOnly.get(m.vk), [room.id]: view.name ?? "room" });
    }
    this.saveRiverOnly();
    for (const m of view.members) {
      if (m.nickname && (!who.has(m.vk) || !this.deps.peerDisplayName(name(m.vk)))) {
        this.deps.onPeerName(name(m.vk), m.nickname);
      }
    }

    const memberVks: Record<string, string> = {};
    for (const m of view.members) memberVks[name(m.vk)] = m.vk;

    const creator = isOwner ? identity.pubkey : name(owner) || owner;
    const moderators = [...new Set(view.members.filter((m) => m.deputy).map((m) => name(m.vk)))];
    let members = view.members.map((m) => name(m.vk));
    void this.deps.refreshLog(`room/${room.id}`);
    if (room.is_channel) {
      members = [...members, ...roomJoiners(this.deps.logEntries(`room/${room.id}`), room.id, new Set([creator, ...moderators]))];
    }
    this.rosters.set(room.id, {
      members: [...new Set(members)],
      creator,
      moderators,
      deputyOf: Object.fromEntries(view.members.filter((m) => m.deputy).map((m) => [name(m.vk), m.deputy_of.map(name)])),
      memberVks,
    });
    const messages: ChatMessage[] = view.messages
      .map((m) => ({
        id: m.id,
        room_id: room.id,
        private_room_id: room.id,
        sender: name(m.author),
        text: m.text,
        timestamp: m.time_ms,
        sig: "",
        ...(m.reply_to ? { reply_to: m.reply_to } : {}),
        reactions: Object.fromEntries(
          Object.entries(m.reactions).map(([e, vks]) => [e, vks.filter((v): v is string => !!v).map(name)]),
        ),
      }))
      .filter((m) => m.timestamp > cleared);
    let activeMessages = messages;
    if (room.is_channel) {
      const roster = this.rosters.get(room.id);
      const mods = new Set(roster?.moderators ?? room.moderators ?? []);
      const channelOwner = roster?.creator ?? room.creator;
      activeMessages = messages.filter(
        (m) => m.sender === channelOwner || mods.has(m.sender) || (isOwner && m.sender === identity.pubkey),
      );
    }
    const joinEvents = this.computeRiverJoins(
      room.id,
      [...new Set(view.members.map((m) => name(m.vk)))],
      activeMessages,
      isOwner ? identity.pubkey : name(owner) || owner,
    );
    const allMessages = [...activeMessages, ...joinEvents].sort((a, b) => a.timestamp - b.timestamp);
    if (room.creator === identity.pubkey) {
      void rooms.rotateIfDue(this.riverOwnerKey(identity, room), owner, state).catch((e) => console.warn("[River] rotate:", e));
    }
    this.deps.storage.setItem(
      `freenet_chat_${room.id}`,
      JSON.stringify(activeMessages.map((m) => ({ ...m, text: "" }))),
    );
    // the live view replaces the archive (deletions included); the archive is what stays once River is gone
    if (activeMessages.length) this.deps.storage.setItem(`radica_river_archive_${room.id}`, JSON.stringify(activeMessages));
    return allMessages;
  }

  /** This device's last readable copy of a River room's messages. */
  public riverArchive(roomId: string): ChatMessage[] {
    const cleared = Number(this.deps.storage.getItem(`freenet_chat_cleared_${roomId}`) || 0);
    try {
      return (JSON.parse(this.deps.storage.getItem(`radica_river_archive_${roomId}`) || "[]") as ChatMessage[]).filter((m) => m.timestamp > cleared);
    } catch {
      return [];
    }
  }

  /** The native room a River room moved to: this device's mark, or its owner's `room_migrated` entry. */
  public riverMigratedTo(room: PrivateRoom): string | null {
    const local = this.deps.storage.getItem(`river_migrated_${room.id}`);
    if (local) return local;
    for (const e of this.deps.logEntries(`room/${room.id}`)) {
      try {
        const b = JSON.parse(e.body);
        if (e.author === room.creator && b.type === "room_migrated" && typeof b.to === "string") return b.to;
      } catch {}
    }
    return null;
  }

  /** Owner only: move a River room to a native room with the same name and kind, invite its Radica members, keep its
   *  moderators, and leave the native invite link as the last River message for everyone else. */
  public async migrateRiverRoom(identity: UserIdentity, roomId: string): Promise<PrivateRoom> {
    const room = this.readRooms().find((r) => r.id === roomId);
    if (!room?.river) throw new Error("Not a River room");
    if (!this.isRiverOwner(identity, room)) throw new Error("Only the room owner can migrate it");
    const moved = this.riverMigratedTo(room);
    const done = moved && this.readRooms().find((r) => r.id === moved);
    if (done) return done;
    await this.riverMessages(identity, room);
    const roster = this.rosters.get(room.id);
    if (!roster) throw new Error("Your node cannot read this River room right now: retry when it reaches it");
    const name = await this.getPrivateRoomDecryptedName(identity, room);
    // River-only members (no Radica identity) cannot get a native invite: they get the link below
    const invitees = roster.members.filter((m) => m !== identity.pubkey && !this.riverOnly.has(m));
    const native = await this.createPrivateRoom(identity, name, invitees, undefined, {
      ...(room.is_channel ? { is_channel: true } : {}),
      ...(room.avatar_url ? { avatar_url: room.avatar_url } : {}),
    });
    for (const m of roster.moderators) {
      if (!native.members.includes(m)) continue;
      await this.setPrivateRoomModerator(identity, native.id, m, true).catch((e) => console.warn("[River] migrate moderator:", e));
    }
    const key = await this.getPrivateRoomKey(identity, native);
    if (key) {
      const text = `This room moved to a native Radica room. Join here: ${buildPrivateRoomInviteLink(native, key, name)}`;
      await (await this.deps.rivers())
        .say(this.riverKey(identity, room), room.river.owner, text, this.riverJoin(room.id), this.nickname())
        .catch((e) => console.warn("[River] migrate notice:", e));
    }
    this.deps.storage.setItem(`river_migrated_${room.id}`, native.id);
    await this.deps.logAppend(`room/${room.id}`, { type: "room_migrated", to: native.id });
    this.deps.notifyListeners();
    return native;
  }

  private computeRiverJoins(roomId: string, members: string[], messages: ChatMessage[], creator?: string): ChatMessage[] {
    const seenKey = `radica_seen_members_${roomId}`;
    let seen: Record<string, number> = {};
    try {
      seen = JSON.parse(this.deps.storage.getItem(seenKey) || "{}");
    } catch {}
    let seenChanged = false;
    const now = this.now();

    const joinList: { member: string; ts: number }[] = [];
    for (const m of members) {
      if (!m || (creator && m === creator)) continue;
      const firstMsg = messages.filter((msg) => msg.sender === m).sort((a, b) => a.timestamp - b.timestamp)[0];
      let ts = firstMsg ? firstMsg.timestamp : seen[m];
      if (!ts) {
        ts = now;
        seen[m] = ts;
        seenChanged = true;
      } else if (!seen[m]) {
        seen[m] = ts;
        seenChanged = true;
      }
      joinList.push({ member: m, ts });
    }
    if (seenChanged) {
      try {
        this.deps.storage.setItem(seenKey, JSON.stringify(seen));
      } catch {}
    }
    if (!joinList.length) return [];
    joinList.sort((a, b) => a.ts - b.ts);

    const grouped: { authors: string[]; ts: number }[] = [];
    for (const j of joinList) {
      const last = grouped[grouped.length - 1];
      if (last && j.ts - last.ts <= RIVER_JOIN_GROUP_WINDOW_MS) {
        if (!last.authors.includes(j.member)) last.authors.push(j.member);
      } else {
        grouped.push({ authors: [j.member], ts: j.ts });
      }
    }
    return grouped.map((g) => ({
      id: `rvjoin_${g.authors[0]}_${g.ts}`,
      room_id: roomId,
      private_room_id: roomId,
      sender: g.authors[0],
      join_members: g.authors,
      text: "",
      timestamp: g.ts,
      sig: "",
      system_event: "join" as const,
    }));
  }

  public async getRiverInviteLink(identity: UserIdentity, room: PrivateRoom, roomName?: string): Promise<string> {
    if (room.creator !== identity.pubkey || !room.river) throw new Error("Only the room owner can make an invite link");
    const code = await (await this.deps.rivers()).invitation(this.riverOwnerKey(identity, room), room.river.owner);
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
    const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
    const params = new URLSearchParams({ river_invite: code });
    params.set("room_id", room.id);
    if (roomName) params.set("name", roomName);
    params.set("creator", room.creator);
    if (room.is_channel) params.set("chan", "1");
    if (room.linked_room_id) {
      params.set("lr", room.linked_room_id);
      const linked = (await this.getPrivateRooms(identity)).find((r) => r.id === room.linked_room_id);
      if (linked?.river && linked.creator === identity.pubkey) {
        await (await this.deps.rivers())
          .invitation(this.riverOwnerKey(identity, linked), linked.river.owner)
          .then(
            (c) => params.set("lr_invite", c),
            (e) => console.warn("[River] linked room invitation:", e),
          );
      }
    }
    const prefix = /^https?:\/\//i.test(origin) ? `${origin}${pathname}` : "";
    return `${prefix}#${params.toString()}`;
  }

  private unhideRoom(identity: UserIdentity, roomId: string): void {
    const key = `freenet_room_left_${identity.pubkey}_${roomId}`;
    if (
      this.deps.storage.getItem(key) === null &&
      !foldChatHides(this.deps.logEntries(`inbox/${identity.pubkey}`), identity.pubkey).rooms[roomId]
    ) {
      return;
    }
    this.deps.storage.removeItem(key);
    void this.deps
      .logAppend(`inbox/${identity.pubkey}`, { type: "room_hide", roomId, on: false })
      .catch((e) => console.warn("[Freenet] room_hide:", e));
  }

  public async joinRiverInvitation(
    identity: UserIdentity,
    code: string,
    meta?: {
      roomId?: string;
      creator?: string;
      name?: string;
      is_channel?: boolean;
      linked_room_id?: string;
      linked_invite?: string;
    },
  ): Promise<PrivateRoom> {
    const rooms = await this.deps.rivers();
    const { owner, sk, join } = rooms.accept(code);
    const mine = await rooms
      .inviteUnder(sk, join.member, owner, vkOf(identity.secretKey))
      .catch((e) => (console.warn("[River] Could not join under the link key:", e), null));
    const list = this.readRooms();
    const known = list.find((r) => r.river?.owner === owner || (meta?.roomId && r.id === meta.roomId));
    const roomId = meta?.roomId ?? known?.id ?? `privroom_river_${owner.slice(0, 16)}`;
    this.unhideRoom(identity, roomId);
    this.keepRiverAccess(roomId, mine ? null : sk, mine ?? join);
    seedReadMark(this.deps.storage, roomId);
    const creator = meta?.creator ?? known?.creator ?? owner;
    const isChannel = meta?.is_channel ?? known?.is_channel ?? false;
    const linkedRoomId = meta?.linked_room_id ?? known?.linked_room_id;
    const room: PrivateRoom = known
      ? {
          ...known,
          id: roomId,
          creator,
          members: [...new Set([...known.members, identity.pubkey])],
          ...(isChannel ? { is_channel: true } : {}),
          ...(linkedRoomId ? { linked_room_id: linkedRoomId } : {}),
        }
      : {
          id: roomId,
          creator,
          name_encrypted: "",
          members: [identity.pubkey],
          encrypted_keys: {},
          created_at: this.now(),
          sig: "",
          river: { owner },
          ...(isChannel ? { is_channel: true } : {}),
          ...(linkedRoomId ? { linked_room_id: linkedRoomId } : {}),
        };
    this.mergeRemotePrivateRooms([room]);
    await this.deps.logAppend(`room/${roomId}`, { type: "room_join", roomId }).catch((e) => console.warn("[River] room_join log:", e));
    await this.rememberRoom(roomId);

    if (meta?.linked_invite && linkedRoomId) {
      await this.joinRiverInvitation(identity, meta.linked_invite, {
        roomId: linkedRoomId,
        creator,
        linked_room_id: roomId,
      }).catch((e) => console.warn("[River] Could not join the linked room:", e));
    }
    this.deps.flushStorage();
    void this.putRoomsToNode();
    this.deps.notifyListeners();
    return room;
  }

  public async importRiverIdentity(identity: UserIdentity, token: string): Promise<PrivateRoom> {
    const { owner, sk, join } = (await this.deps.rivers()).importIdentity(token);
    const known = this.readRooms().find((r) => r.river?.owner === owner);
    const roomId = known?.id ?? `privroom_river_${owner.slice(0, 16)}`;
    this.unhideRoom(identity, roomId);
    this.keepRiverAccess(roomId, sk, join);
    seedReadMark(this.deps.storage, roomId);
    const creator = vkOf(hexToBytes(sk)) === owner ? identity.pubkey : known?.creator ?? owner;
    const room: PrivateRoom = known
      ? { ...known, creator, members: [...new Set([...known.members, identity.pubkey])] }
      : {
          id: roomId,
          creator,
          name_encrypted: "",
          members: [identity.pubkey],
          encrypted_keys: {},
          created_at: this.now(),
          sig: "",
          river: { owner },
        };
    this.mergeRemotePrivateRooms([room]);
    await this.rememberRoom(roomId);
    this.deps.notifyListeners();
    return room;
  }

  public async exportRiverIdentity(identity: UserIdentity, room: PrivateRoom): Promise<string> {
    if (!room.river) throw new Error("Only River rooms have a River identity");
    return (await this.deps.rivers()).exportIdentity(
      this.riverKey(identity, room),
      room.river.owner,
      this.riverJoin(room.id),
      this.nickname(),
    );
  }

  private keepRiverAccess(roomId: string, k: string | null, join: RiverJoin): void {
    if (k) this.deps.storage.setItem(`river_key_${roomId}`, k);
    else this.deps.storage.removeItem(`river_key_${roomId}`);
    this.deps.storage.setItem(`river_join_${roomId}`, JSON.stringify(join));
    void (async () => {
      await this.deps.nodePut(`river-key:${roomId}`, k ?? "");
      await this.deps.nodePut(`river-join:${roomId}`, JSON.stringify(join));
    })();
  }

  public getPrivateRoomInviteLink(
    room: PrivateRoom,
    roomKey: Uint8Array,
    roomName: string,
    linkedRoomKey?: Uint8Array | null,
  ): string {
    return buildPrivateRoomInviteLink(room, roomKey, roomName, linkedRoomKey);
  }

  public async joinPrivateRoomFromInvite(
    identity: UserIdentity,
    inviteData: {
      roomId: string;
      name: string;
      keyHex: string;
      creator: string;
      is_channel?: boolean;
      linked_room_id?: string;
      linked_key_hex?: string;
      river?: { owner: string; k: string; member: string; secret?: string };
    },
  ): Promise<PrivateRoom> {
    const { roomId, name, keyHex, creator, is_channel, linked_room_id, linked_key_hex } = inviteData;
    this.unhideRoom(identity, roomId);
    if (inviteData.river) {
      const { owner, k, member, secret } = inviteData.river;
      if (!/^[0-9a-f]{64}$/.test(owner) || !/^[0-9a-f]{64}$/.test(k)) throw new Error("Invalid invite link");
      this.keepRiverAccess(roomId, k, { member, secret: secret || undefined });
      const room: PrivateRoom = {
        id: roomId,
        creator,
        name_encrypted: "",
        members: [creator, identity.pubkey],
        encrypted_keys: {},
        created_at: this.now(),
        sig: "invite_join",
        river: { owner },
        ...(is_channel ? { is_channel: true } : {}),
        ...(linked_room_id ? { linked_room_id } : {}),
      };
      this.mergeRemotePrivateRooms([room]);
      await this.deps.logAppend(`room/${roomId}`, { type: "room_join", roomId });
      await this.rememberRoom(roomId);
      this.deps.flushStorage();
      this.deps.notifyListeners();
      return room;
    }
    const roomKey = hexToBytes(keyHex);
    if (roomKey.length !== 32) {
      throw new Error("Invalid room key in invite link");
    }

    const encKeyForSelf = await encryptRoomKeyForPeer(identity.secretKey, identity.encPub, roomKey);
    this.privateRoomKeyCache.set(`${roomId}:${encKeyForSelf}:`, roomKey);

    const existingRooms = await this.getPrivateRooms(identity);
    let room = existingRooms.find((r) => r.id === roomId);
    if (room) {
      if (!room.members.includes(identity.pubkey)) room.members.push(identity.pubkey);
      if (!room.encrypted_keys) room.encrypted_keys = {};
      room.encrypted_keys[identity.pubkey] = encKeyForSelf;
      if (is_channel) room.is_channel = true;
      if (linked_room_id) room.linked_room_id = linked_room_id;
    } else {
      const name_encrypted = await encryptWithSymmetricKey(roomKey, name);
      room = {
        id: roomId,
        creator: creator || identity.pubkey,
        name_encrypted,
        members: creator && creator !== identity.pubkey ? [creator, identity.pubkey] : [identity.pubkey],
        encrypted_keys: { [identity.pubkey]: encKeyForSelf },
        created_at: this.now(),
        sig: "invite_join",
        ...(is_channel ? { is_channel: true } : {}),
        ...(linked_room_id ? { linked_room_id } : {}),
      };
    }

    this.mergeRemotePrivateRooms([room]);
    this.deps.broadcast({ type: "private_room", room });
    const key_proof = computeRoomJoinProof(roomKey, roomId, identity.pubkey);
    await this.deps.logAppend(`room/${roomId}`, { type: "room_join", roomId, encrypted_key: encKeyForSelf, key_proof });
    await this.rememberRoom(roomId);

    if (linked_room_id && linked_key_hex && linked_key_hex.length === 64) {
      await this.joinPrivateRoomFromInvite(identity, {
        roomId: linked_room_id,
        name: `${name} · Comments`,
        keyHex: linked_key_hex,
        creator,
        linked_room_id: roomId,
      }).catch((e) => console.warn("[Freenet] Could not join linked discussion room", linked_room_id, e));
    }

    this.deps.flushStorage();
    this.deps.notifyListeners();
    return room;
  }

  public async sendPrivateRoomChatMessage(
    identity: UserIdentity,
    room: PrivateRoom,
    text: string,
    replyTo?: string,
  ): Promise<ChatMessage> {
    if (room.is_channel) {
      const roster = this.rosters.get(room.id);
      const isOwner = identity.pubkey === (roster?.creator ?? room.creator);
      const isModerator = (roster?.moderators ?? room.moderators ?? []).includes(identity.pubkey);
      if (!isOwner && !isModerator) {
        throw new Error("This broadcast channel is read-only. Only the owner or administrators can post messages.");
      }
    }
    const notifMsg = room.is_channel ? "posted an update in a Broadcast Channel" : "sent a message in an encrypted Private Room";

    if (room.river) {
      if (this.riverMigratedTo(room)) throw new Error("This River room moved to a native Radica room: write there.");
      await (await this.deps.rivers()).say(
        this.riverKey(identity, room),
        room.river.owner,
        text,
        this.riverJoin(room.id),
        this.nickname(),
        replyTo,
      );
      for (const member of room.members) {
        if (member !== identity.pubkey) {
          this.deps.addNotification(member, { type: "chat", from: identity.pubkey, text: notifMsg, linkRoomId: room.id });
        }
      }
      const now = this.now();
      return { id: `river_${now}`, room_id: room.id, private_room_id: room.id, sender: identity.pubkey, text, timestamp: now, sig: "" };
    }
    const roomKey = await this.getPrivateRoomKey(identity, room);
    if (!roomKey) throw new Error("Unauthorized: no room key found to encrypt message");

    const encryptedText = await encryptWithSymmetricKey(roomKey, text);
    const id = `msg_${this.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = this.now();
    const sigMsg = formatChatMessageSignatureMessage(id, room.id, identity.pubkey, "privateroom", text, timestamp);
    const sig = await identity.sign(sigMsg);

    const message: ChatMessage = {
      id,
      room_id: room.id,
      private_room_id: room.id,
      sender: identity.pubkey,
      text: encryptedText,
      timestamp,
      sig,
      ...(replyTo ? { reply_to: replyTo } : {}),
    };

    const storageKey = `freenet_chat_${room.id}`;
    const raw = this.deps.storage.getItem(storageKey);
    const messages: ChatMessage[] = raw ? JSON.parse(raw) : [];
    messages.push(message);
    this.deps.storage.setItem(storageKey, JSON.stringify(messages));

    this.deps.broadcast({ type: "chat", message });
    await this.deps.logAppend(`room/${room.id}`, { type: "chat", message });

    for (const member of room.members) {
      if (member !== identity.pubkey) {
        this.deps.addNotification(member, { type: "chat", from: identity.pubkey, text: notifMsg, linkRoomId: room.id });
      }
    }
    return { ...message, text };
  }

  public async getPrivateRoomChatMessages(identity: UserIdentity, room: PrivateRoom): Promise<ChatMessage[]> {
    if (room.river) {
      const live = await this.riverMessages(identity, room).catch((e) => {
        console.warn("[River] read failed, showing the local archive:", e);
        return [] as ChatMessage[];
      });
      return live.length ? live : this.riverArchive(room.id);
    }
    void this.deps.refreshLog(`room/${room.id}`);
    const entries = this.deps.logEntries(`room/${room.id}`);
    const joins = this.deps.computeLogJoins(room.id, entries);
    const messages = this.deps.visibleChat(room.id);

    const roomKey = await this.getPrivateRoomKey(identity, room);
    const rawList = !roomKey
      ? messages
      : await Promise.all(
          messages.map(async (msg) => {
            if (msg.text && msg.text.startsWith("sym:")) {
              return {
                ...msg,
                text: await this.deps.plain(`sym|${identity.pubkey}|${room.id}|${msg.text}`, () =>
                  decryptWithSymmetricKey(roomKey, msg.text),
                ),
              };
            }
            return msg;
          }),
        );
    const list = filterChannelMessages(room, rawList);
    return [...list, ...joins].sort((a, b) => a.timestamp - b.timestamp);
  }
}
