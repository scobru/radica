import type { Cert } from "./whoiam.ts";
import type { PoWProof } from "./pow.ts";
export type { PoWProof };

export type PostCategory = "thought" | "moment" | "event";

export interface ProfileInfo {
  display_name: string;
  bio: string;
  avatar_url: string;
  enc_pub?: string; // hex Ed25519 key whose X25519 form others encrypt direct messages to
  updated_at: number;
  sig: string;
  cert?: Cert; // Viso: delegation of the app key that signed
  v?: number; // 3: signed the v3 way (contract/src/lib.rs); none: legacy
}

export interface Comment {
  id: string;
  post_id: string;
  author: string; // hex 32-byte pubkey
  text: string;
  timestamp: number;
  sig: string;
  cert?: Cert;
  v?: number;
  nonce?: number; // contract proof of work (v3, on someone else's feed)
}

export interface Like {
  liked: boolean; // false = unliked
  ts: number;
  sig: string; // by the liker
  cert?: Cert;
  v?: number;
  nonce?: number;
}

export interface Post {
  id: string;
  author: string; // hex 32-byte pubkey
  category: PostCategory;
  caption: string;
  community_id?: string;
  media_uri?: string;
  location?: string;
  event_date?: string;
  timestamp: number;
  sig: string;
  cert?: Cert;
  v?: number;
  likes: Record<string, Like>; // liker hex pubkey -> like (see likers())
  comments: Record<string, Comment>; // "<author>:<comment id>" -> Comment
  is_nsfw?: boolean;
  nsfw_score?: number; // local only, not signed nor sent to the contract
  pow?: PoWProof;
}

/** Radica creator / maintainer public key (Scobru). */
import { AI_REPORTERS, RADICA_DEFAULT_MODS, RADICA_MAINTAINER } from "../../shared/protocol.js";
export { AI_REPORTERS, RADICA_DEFAULT_MODS, RADICA_MAINTAINER };
export const GARDENER_NAME = "🌱 The Gardener";

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatar_url?: string;
  created_at: number;
  creator: string; // hex pubkey (owner / root founder)
  moderators: string[]; // list of moderator hex pubkeys
  members: string[]; // list of member hex pubkeys
  banned_members?: string[]; // list of banned member hex pubkeys
  deleted_post_ids: string[]; // post IDs removed by moderators
  require_trusted_to_post?: boolean; // if true, only WoT trusted members can initiate threads
  sig: string;
}

export interface FeedState {
  owner: string; // hex 32-byte pubkey
  profile?: ProfileInfo;
  posts: Record<string, Post>;
  following: string[]; // list of followed hex pubkeys
  following_updated_at?: number;
  following_sig?: string; // owner signature over the list
  following_cert?: Cert;
  following_v?: number;
  deleted?: Record<string, { sig: string; cert?: Cert; v?: number }>; // deleted post id -> owner signature
}

/** Pubkeys that currently like a post. */
export const likers = (p: Post): string[] =>
  Object.entries(p.likes || {}).filter(([, l]) => l.liked).map(([k]) => k);

export interface UserIdentity {
  pubkey: string;
  secretKey: Uint8Array;
  sign: (msg: string) => Promise<string>;
  type?: "local" | "viso";
  personaName?: string;
  cert?: Cert; // Viso: signatures are by a delegated app key and carry this delegation
  encPub: string; // hex Ed25519 public key of secretKey: what others encrypt to
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender: string; // hex pubkey
  recipient?: string; // hex pubkey (for 1-on-1 chats)
  community_id?: string; // community ID (for community chatrooms)
  private_room_id?: string; // private room ID (for E2EE group rooms)
  text: string;
  timestamp: number;
  sig: string;
  enc_pub?: string; // sender's encryption key (Viso: the app key, not the persona)
  to_enc_pub?: string; // the recipient key the message was encrypted to
  copies?: Record<string, string>; // the same text encrypted to each other device key of recipient and sender (enc key -> ciphertext)
  reply_to?: string; // id of the message this one answers (the quote is looked up locally: encrypted rooms keep their text out of the log)
  reactions?: Record<string, string[]>; // emoji -> who reacted, folded from the room's log (never sent as is)
  edited_at?: number; // timestamp when this message was last edited
  is_secret?: boolean; // secret chat message (single-device only, ephemeral ratchet keys)
  ttl_seconds?: number; // disappearing message countdown duration in seconds (0 = off)
  burn_at?: number; // exact timestamp when this message expires and must be destroyed
  burn_started?: boolean; // local-only flag: true once recipient has opened/started counting down a disappearing message
  is_read?: boolean; // true when peer has read the message
  pending?: boolean; // my message still being sealed and signed (an optimistic placeholder), never stored
  via_lan?: boolean; // local-only: this copy arrived over the LAN mesh (lanMesh.ts), not from Freenet
  system_event?: "join" | "leave"; // room events (e.g. user joined notice like River)
  join_members?: string[]; // author pubkeys or names who joined
}

export interface SecretChatSession {
  sessionId: string;
  peerPubkey: string;
  myPubkey: string;
  peerEncPub?: string; // the peer key the session was derived with (Viso: their app key)
  myEncPub?: string; // mine, likewise
  rootKey: string; // hex
  sendChainKey: string; // hex
  recvChainKey: string; // hex
  sendCount: number;
  recvCount: number;
  ttlSeconds: number; // default TTL for new messages
  ephemeralPriv: string; // hex (Montgomery private key)
  ephemeralPub: string; // hex (Montgomery public key)
  peerEphemeralPub?: string; // hex
  createdAt: number;
  lastActive: number;
}

export interface PrivateRoom {
  id: string; // privroom_...
  creator: string; // hex pubkey
  creator_enc_pub?: string; // the key the member keys were encrypted with
  name_encrypted: string; // encrypted with room symmetric key (sym:iv:cipher)
  avatar_url?: string; // custom room avatar data URL or media reference
  pinned_message_id?: string; // ID of the pinned message in this room
  members: string[]; // list of hex pubkeys
  moderators?: string[]; // members the creator let kick others (not the creator, not each other)
  encrypted_keys: Record<string, string>; // memberPubkey -> e2e:iv:cipher(roomKeyHex)
  keys_enc_pub?: string; // the key those were encrypted with, when a moderator rotated them (else creator_enc_pub)
  gardener_enc_pub?: string; // the key used to encrypt The Gardener's room key copy when added via room_gardener
  created_at: number;
  sig: string;
  river?: { owner: string }; // a retired River room (its River owner key): a read-only local archive, see privateRooms.ts
  is_channel?: boolean; // Telegram-style broadcast channel (only owner/moderators can post)
  linked_room_id?: string; // ID of the discussion / comments room linked to this channel
}

export interface RoomState {
  participants: [string, string];
  messages: Record<string, ChatMessage>;
}

export interface NotificationItem {
  id: string;
  type: "like" | "comment" | "follow" | "chat" | "mention" | "report" | "mail";
  from: string;
  text: string;
  timestamp: number;
  read: boolean;
  linkPostId?: string;
  /** Whose feed holds the post (a mention can be on anyone's post); absent: mine. */
  linkPostOwner?: string;
  /** The private room a chat notification is about. */
  linkRoomId?: string;
  /** The email message id a mail notification is about. */
  linkMailId?: string;
  /** Whether this chat notification is for a Secret Chat (ephemeral ratchet). */
  isSecret?: boolean;
}
