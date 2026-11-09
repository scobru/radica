// Private rooms on River's room contract. The rules (who is a member, who may write, who reads what) are River's
// contract's, not Radica's: river.wasm builds the signed, sealed deltas and the contract refuses the rest.
//
// - A room is River's: its key is BLAKE3(room contract code || CBOR{owner}), with the code hash from River's pointer.
// - The owner key of a room is derived from its creator's identity key and the room id, so it needs no storage and
//   comes back on any device holding that identity.
// - A member's River key is their identity key (`identity.secretKey`, published as `encPub`), or the key an invite
//   link carried.
// - Only the owner invites (River's private rooms: only the owner signs the secret each member gets).
import { blake3 } from "@noble/hashes/blake3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import type { ContractKey } from "@freenetorg/freenet-stdlib";
import { bytesToHex, hexToBytes } from "./crypto.ts";
import type { RiverCall } from "./river.ts";
import { type Anchor, keyOf, roomKey } from "./riverPointer.ts";
import { safeStorage } from "./storage.ts";

/** What lets a key into a room: its signed membership, plus the room secret as an owner-signed blob (Radica's inbox
 *  invites) or in clear (River invitation codes, a bearer credential like an invite link). */
export type RiverJoin = { member: string; chain?: string[]; secret?: string; secrets?: Record<string, string> };
export type RiverView = {
  name: string | null;
  private: boolean;
  // deputy_of: who named them a moderator, among those who matter to the reader (River's 🛡: the owner, the reader,
  // or someone above the reader in the invite chain)
  members: { vk: string; nickname: string | null; owner: boolean; deputy: boolean; deputy_of: string[] }[];
  messages: { id: string; author: string | null; time_ms: number; text: string; reply_to: string | null; edited: boolean; reactions: Record<string, (string | null)[]> }[];
  rotate_due: boolean;
  /** DMs sent to me in this room (what I sent is sealed to the other side: the caller keeps its own copy) */
  dms: { sender: string | null; time_ms: number; text: string; sig: string }[];
};

export type RiverNet = {
  getRaw(key: ContractKey, watch?: `river:${string}`): Promise<Uint8Array | null>;
  putRaw(key: ContractKey, code: Uint8Array, params: Uint8Array, state: Uint8Array): Promise<void>;
  updateRaw(key: ContractKey, delta: Uint8Array): Promise<void>;
  liveAge?(id: `river:${string}`): number | null;
};

const ownerSkCache = new WeakMap<Uint8Array, Map<string, Uint8Array>>();
const vkWeakCache = new WeakMap<Uint8Array, string>();
const vkHexCache = new Map<string, string>();
const enc = new TextEncoder();

/** The owner key of room `roomId` made by the holder of `identitySk`: BLAKE3 keyed by that key. */
export function roomOwnerSk(identitySk: Uint8Array, roomId: string): Uint8Array {
  let byRoom = ownerSkCache.get(identitySk);
  if (!byRoom) {
    byRoom = new Map();
    ownerSkCache.set(identitySk, byRoom);
  }
  let sk = byRoom.get(roomId);
  if (!sk) {
    sk = blake3(enc.encode(`radica/river-room-owner/v1:${roomId}`), { key: identitySk });
    byRoom.set(roomId, sk);
  }
  return sk;
}

export const vkOf = (sk: Uint8Array): string => {
  const w = vkWeakCache.get(sk);
  if (w !== undefined) return w;
  const hex = bytesToHex(sk);
  let vk = vkHexCache.get(hex);
  if (vk === undefined) {
    vk = bytesToHex(ed25519.getPublicKey(sk));
    if (vkHexCache.size >= 512) vkHexCache.clear();
    vkHexCache.set(hex, vk);
  }
  vkWeakCache.set(sk, vk);
  return vk;
};

export class RiverRooms {
  private states = new Map<string, string>(); // owner vk -> state (hex CBOR), as last read or written
  private views = new Map<string, { state: string; view: RiverView; at: number }>();
  private fetched = new Map<string, number>(); // owner vk -> when it was last read from the network
  private call: RiverCall;
  private net: RiverNet;
  private anchor: () => Promise<Anchor>;
  private roomCode: () => Promise<Uint8Array>;
  private store: Pick<Storage, "getItem" | "setItem">;

  constructor(call: RiverCall, net: RiverNet, anchor: () => Promise<Anchor>, roomCode: () => Promise<Uint8Array>, store: Pick<Storage, "getItem" | "setItem"> = safeStorage) { // the sandboxed web container has no localStorage
    this.call = call;
    this.net = net;
    this.anchor = anchor;
    this.roomCode = roomCode;
    this.store = store;
  }

  private async key(owner: string): Promise<ContractKey> {
    return roomKey(await this.anchor(), this.call, owner);
  }

  private async writable(): Promise<void> {
    const a = await this.anchor();
    if (!a.canWrite)
      throw new Error(a.withdrawn ? "River withdrew its room contract: rooms are read-only." : "River updated its room contract: update Radica to write in rooms again (they stay readable).");
  }

  private keep(owner: string, state: string): void {
    this.states.set(owner, state);
    try {
      this.store.setItem(`river_state_${owner}`, state); // sealed: no plaintext of a private room is in it
    } catch {}
  }

  /** The last copy here, without asking the network (for names in lists drawn often). */
  cached(owner: string): string | null {
    return this.states.get(owner) ?? this.store.getItem(`river_state_${owner}`);
  }

  /** The room changed on the network (its subscription said so): the next `load` reads it again. */
  changed(owner: string): void {
    this.fetched.delete(owner);
  }

  /** The room as the network has it (and follow its changes), else the last copy here. Read at most every 30 s:
   *  the subscription brings changes in between (`changed`). */
  async load(owner: string, force = false): Promise<string | null> {
    const live = this.net.liveAge?.(`river:${owner}`) != null; // subscribed: a change clears `fetched` (`changed`), so a write need not ask the network first
    if ((!force || live) && Date.now() - (this.fetched.get(owner) ?? 0) < 30_000 && this.cached(owner)) return this.cached(owner);
    this.fetched.set(owner, Date.now());
    try {
      const raw = await this.net.getRaw(await this.key(owner), `river:${owner}`);
      if (raw) this.keep(owner, bytesToHex(raw));
      else if (!this.cached(owner)) await this.recover(owner);
    } catch (e) {
      console.warn("[River] Could not fetch room", owner, e);
    }
    return this.cached(owner);
  }

  private probed = new Set<string>();

  /** River re-keys its room contract now and then: a room nobody wrote to since lives under an earlier generation. Look
   *  there, newest first (River's own registry, via river.wasm), and carry it forward under the current key, as River's
   *  clients do. Once per room per session. */
  private async recover(owner: string): Promise<void> {
    if (this.probed.has(owner)) return;
    this.probed.add(owner);
    const params = hexToBytes(this.call({ op: "params", owner_vk: owner }).params);
    const hashes: string[] = this.call({ op: "legacy" }).code_hashes;
    // shortcut: probes the 8 newest generations only; widen it if rooms older than that turn up
    for (const hash of hashes.slice(0, 8)) {
      const raw = await this.net.getRaw(keyOf(hash, params)).catch(() => null);
      if (!raw) continue;
      this.keep(owner, bytesToHex(raw));
      if ((await this.anchor()).canWrite)
        await this.net.putRaw(await this.key(owner), await this.roomCode(), params, raw).catch((e) => console.warn("[River] Could not carry the room forward", owner, e));
      return;
    }
  }

  /** Make a room (private unless `isPrivate` is false) owned by a key derived from mine; returns its owner key. */
  async create(mySk: Uint8Array, roomId: string, name: string, nickname: string, isPrivate = true): Promise<string> {
    await this.writable();
    const ownerSk = roomOwnerSk(mySk, roomId);
    const owner = vkOf(ownerSk);
    const state: string = this.call({ op: "new_room", owner_sk: bytesToHex(ownerSk), name, nickname, private: isPrivate, time_ms: Date.now() }).state;
    const params = hexToBytes(this.call({ op: "params", owner_vk: owner }).params);
    await this.net.putRaw(await this.key(owner), await this.roomCode(), params, hexToBytes(state));
    this.keep(owner, state);
    return owner;
  }

  /** As the owner, let `inviteeVk` in: their signed membership and their sealed copy of the room secret. */
  async invite(ownerSk: Uint8Array, owner: string, inviteeVk: string): Promise<RiverJoin> {
    const state = await this.load(owner, true); // a write starts from the room as it is now (members, secret version)
    if (!state) throw new Error("Room not found on the network");
    const r = this.call({ op: "invite", inviter_sk: bytesToHex(ownerSk), owner_vk: owner, state, invitee_vk: inviteeVk });
    return { member: r.member, secret: r.secret };
  }

  /** As the owner, a River invitation code (base58, as River's UI and riverctl make them) for a fresh key: whoever
   *  holds it can join, from Radica, River or riverctl. */
  async invitation(ownerSk: Uint8Array, owner: string): Promise<string> {
    const state = await this.load(owner, true);
    if (!state) throw new Error("Room not found on the network");
    const invitee = crypto.getRandomValues(new Uint8Array(32));
    return this.call({ op: "invitation", owner_sk: bytesToHex(ownerSk), state, invitee_sk: bytesToHex(invitee) }).code;
  }

  /** In a public room any member may invite: under the key a shared link gives (`linkSk`, let in by `linkMember`), let
   *  `inviteeVk` in as their own member. Null in a private room, where only the owner invites. */
  async inviteUnder(linkSk: string, linkMember: string, owner: string, inviteeVk: string): Promise<RiverJoin | null> {
    const state = await this.load(owner, true);
    if (!state || this.read(state, owner, hexToBytes(linkSk)).private) return null;
    const r = this.call({ op: "invite", inviter_sk: linkSk, owner_vk: owner, state, invitee_vk: inviteeVk });
    return { member: r.member, chain: [linkMember] }; // the link key never writes, so the room does not hold it: send it along
  }

  /** What River's "Export ID" token holds: one's key and membership in one room (so Radica is the same member as River). */
  importIdentity(token: string): { owner: string; sk: string; join: RiverJoin; nickname: string | null; roomName: string | null } {
    const r = this.call({ op: "import_identity", token });
    return { owner: r.owner_vk, sk: r.sk, join: { member: r.member, chain: r.chain, secrets: r.secrets }, nickname: r.nickname, roomName: r.room_name };
  }

  /** My identity in a room as River's "Export ID" token, for River's UI or riverctl. */
  async exportIdentity(sk: Uint8Array, owner: string, join?: RiverJoin, nickname?: string): Promise<string> {
    const state = await this.load(owner, true);
    if (!state) throw new Error("Room not found on the network");
    return this.call({ op: "export_identity", sk: bytesToHex(sk), owner_vk: owner, state, member: join?.member, chain: join?.chain ?? [], secrets: join?.secrets, nickname }).token;
  }

  /** What a River invitation code holds: the room, the key it gives me, and what lets that key in. */
  accept(code: string): { owner: string; sk: string; join: RiverJoin } {
    const r = this.call({ op: "accept", code });
    return { owner: r.owner_vk, sk: r.sk, join: { member: r.member, secrets: r.secrets } };
  }

  /** Ban `targetVk`, as the owner or one of its deputies (`bannerSk`). The owner's ban also seals what comes next under a
   *  secret the banned do not get; after a deputy's ban the owner does that on their next visit (`rotateIfDue`). */
  async kick(bannerSk: Uint8Array, owner: string, targetVk: string): Promise<void> {
    await this.writable();
    const state = await this.load(owner, true);
    if (!state) throw new Error("Room not found on the network");
    const delta = this.call({ op: "kick", banner_sk: bytesToHex(bannerSk), owner_vk: owner, state, target_vk: targetVk, time_ms: Date.now() }).delta;
    if (!(await this.send(owner, state, delta))) throw new Error("The room did not take the ban (not the owner or a moderator?)");
  }

  /** As the owner: name the room's moderators (River's deputies: they may ban anyone but the owner). */
  async setDeputies(ownerSk: Uint8Array, owner: string, deputies: string[]): Promise<void> {
    await this.writable();
    const state = await this.load(owner, true);
    if (!state) throw new Error("Room not found on the network");
    await this.send(owner, state, this.call({ op: "deputies", sk: bytesToHex(ownerSk), owner_vk: owner, state, deputies }).delta);
  }

  /** As the owner: a new room secret when a moderator banned someone since the last one. */
  async rotateIfDue(ownerSk: Uint8Array, owner: string, state: string): Promise<void> {
    if (!this.read(state, owner, ownerSk).rotate_due || !(await this.anchor()).canWrite) return;
    await this.send(owner, state, this.call({ op: "rotate", owner_sk: bytesToHex(ownerSk), state, time_ms: Date.now() }).delta);
  }

  /** One of River's message actions on `target`: edit or delete my own message, react or take my reaction back. */
  async act(sk: Uint8Array, owner: string, action: "edit" | "delete" | "react" | "unreact", target: string, extra: { text?: string; emoji?: string }, join?: RiverJoin, nickname?: string): Promise<void> {
    await this.writable();
    const state = await this.load(owner, true);
    if (!state) throw new Error("Room not found on the network");
    // River drops what a member the room no longer holds sends (it prunes members with no recent messages): come back in with it
    const me = vkOf(sk);
    const inRoom = me === owner || this.read(state, owner, sk, join).members.some((m) => m.vk === me);
    const back = inRoom ? {} : { join, nickname };
    const delta = this.call({ op: "act", author_sk: bytesToHex(sk), owner_vk: owner, state, action, target, time_ms: Date.now(), secrets: join?.secrets, ...back, ...extra }).delta;
    if (!(await this.send(owner, state, delta))) throw new Error(join || inRoom ? "The room did not take it" : "This room does not hold you yet: write a message first");
  }

  /** Post `text` as `sk`; `join` and `nickname` go along until the room holds me (a first message, or after a prune). */
  async say(sk: Uint8Array, owner: string, text: string, join?: RiverJoin, nickname?: string, replyTo?: string): Promise<void> {
    await this.writable();
    const state = await this.load(owner, true); // a write starts from the room as it is now (members, secret version)
    if (!state) throw new Error("Room not found on the network");
    const me = vkOf(sk);
    const inRoom = me === owner || this.read(state, owner, sk, join).members.some((m) => m.vk === me);
    const extra = inRoom ? {} : { join, nickname };
    const delta = this.call({ op: "message", author_sk: bytesToHex(sk), owner_vk: owner, state, text, time_ms: Date.now(), secrets: join?.secrets, reply_to: replyTo, ...extra }).delta;
    if (!(await this.send(owner, state, delta))) throw new Error("The room did not take the message (not a member?)");
  }

  /** A River in-room DM to `to` (their key in this room), as River's UI sends it; the room must hold both of us. */
  async dm(sk: Uint8Array, owner: string, to: string, text: string, join?: RiverJoin, nickname?: string): Promise<void> {
    await this.writable();
    const state = await this.load(owner, true);
    if (!state) throw new Error("Room not found on the network");
    const me = vkOf(sk);
    const inRoom = me === owner || this.read(state, owner, sk, join).members.some((m) => m.vk === me);
    const extra = inRoom ? {} : { join, nickname };
    const delta = this.call({ op: "dm_send", author_sk: bytesToHex(sk), owner_vk: owner, state, recipient_vk: to, text, time_ms: Date.now(), secrets: join?.secrets, ...extra }).delta;
    if (!(await this.send(owner, state, delta))) throw new Error("The room did not take the message (is the contact still a member?)");
  }

  /** Apply `delta` here first (the contract runs the same code), then send it; false when it changes nothing. */
  private async send(owner: string, state: string, delta: string): Promise<boolean> {
    const next: string = this.call({ op: "apply", owner_vk: owner, state, delta }).state;
    if (next === state) return false;
    await this.net.updateRaw(await this.key(owner), hexToBytes(delta));
    this.keep(owner, next);
    return true;
  }

  /** The room as `sk` sees it; `join` lets an invitee read it before their first message files their secret. */
  read(state: string, owner: string, sk: Uint8Array, join?: RiverJoin): RiverView {
    // the wasm read decrypts and verifies the whole room on the main thread: once per state, not once per redraw
    const skHex = bytesToHex(sk);
    const viewKey = `${owner}|${skHex}|${join?.secret ?? ""}|${join?.secrets ? JSON.stringify(join.secrets) : ""}`;
    const hit = this.views.get(viewKey);
    if (hit && hit.state === state && (vkOf(sk) !== owner || Date.now() - hit.at < 30_000)) return hit.view; // rotate_due has time in it, and only the owner acts on it
    const view = this.call({ op: "read", owner_vk: owner, state, member_sk: skHex, secret: join?.secret, secrets: join?.secrets }) as RiverView;
    if (this.views.size >= 128) {
      const oldest = this.views.keys().next().value;
      if (oldest) this.views.delete(oldest);
    }
    this.views.set(viewKey, { state, view, at: Date.now() });
    return view;
  }
}
