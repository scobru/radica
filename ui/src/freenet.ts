import { AI_REPORTERS, RADICA_DEFAULT_MODS, RADICA_MAINTAINER, type SecretChatSession } from "./types.ts";
import {
  verifiedDelegations,
  verifiedPohs,
  verifyVisoDelegation,
  verifyVisoPoh,
  visoAnteBits,
  visoGhostkeyOf,
  visoPohOf,
  visoPohRawOf,
  visoProfileOf,
  type DelegationProofV1,
  type PohBadge,
  type PohLogEntry,
  type VerifiedDelegation,
} from "./viso.ts";
import { ANNOUNCE_POW_BITS, COMMENT_POW_BITS, postIdWithPow, solvePoW } from "./pow.ts";
import type {
  FeedState,
  Post,
  Comment,
  UserIdentity,
  PostCategory,
  ProfileInfo,
  ChatMessage,
  NotificationItem,
  Community,
  PrivateRoom,
  PoWProof,
} from "./types.ts";
import {
  formatProfileSignatureMessage,
  postMsg3,
  commentMsg3,
  likeMsg3,
  profileMsg4,
  followingMsg3,
  deleteMsg3,
  grindNonce,
  verifyAuthorSignature,
  formatChatMessageSignatureMessage,
  formatCommunitySignatureMessage,
  formatModActionSignatureMessage,
  encryptDirectMessage,
  decryptDirectMessage,
  addReadKeys,
  readEncPubs,
  encryptWithSymmetricKey,
  decryptWithSymmetricKey,
  bytesToHex,
  hexToBytes,
  personaName,
} from "./crypto.ts";
import { safeStorage } from "./storage.ts";
import { FreenetNetwork, contractKey, type ContractId } from "./network.ts";
import { cleanWallets, type Wallets } from "./wallets.ts";
import { CURRENT } from "./legacy.ts";
import { explorePeerKeys } from "./circleMode.ts";
import { dedupeChat, directoryWeights, laneSample, foldHiddenCommunities, foldBlocklist, foldReports, foldReportedMedia, foldDismissed, foldReportQueue, foldHandledReports, foldAiHolds, type ReportedItem, type HandledReportItem, foldChat, foldChatHides, foldChatRead, foldCommunities, canEditCommunity, foldRoom, isPostDeletedInCommunity, keepNewest, foldCommentLikes, foldPostDislikes, foldPostEdits, foldHandles, normalizeHandle, RESERVED_HANDLES, compactLog, isDmEntry, deviceKeyTimes, revokedDeviceKeys, DEVICE_HEARTBEAT_MS, SECRET_DEVICE_TTL_MS, foldSupporterTokens, foldGhostkeyBundles, foldPohProofs, foldDelegationProofs, type LogEntry } from "./logfold.ts";
import { LogStore } from "./logStore.ts";
import { FeedStore } from "./feedStore.ts";
import { PrivateRoomManager } from "./privateRooms.ts";
import { shouldFetch, LIVE_RECHECK_MS, REFRESH_EVERY_MS, type Change } from "./refresh.ts";
import { lightFeedAsync } from "./feedlight.ts";
import { parseSite, resolveSiteCode, siteKey, type DeltaSite } from "./delta.ts";
import { computeLogJoins } from "./messengerLogic.ts";
import { ortoVaultKey, parseOrtoVaultPosts, parseOrtoUri, type OrtoBlog, type OrtoPost, ORTO_SITE } from "./orto.ts";
import {
  asocialPersonOf,
  asocialOwnStoreKey,
  asocialWorksStoreKey,
  parseAsocialProfile,
  parseAsocialWorks,
  type AsocialData,
  type AsocialWorkItem,
} from "./asocial.ts";
import {
  FH_SITE,
  FH_APP_PATH,
  fhListKey,
  fhPersonaHex,
  parseFhListState,
  parseFhProfileInput,
  type FhListData,
  type FhSite,
} from "./fh.ts";
import {
  freetunesDirKey,
  parseFreetunesDirectory,
  freetunesReleasesForArtist,
  parseRelease,
  parseFreetunesProfileInput,
  localFreetunesArtist,
  localFreetunesReleases,
  type FtArtistData,
  type FtReleaseItem,
} from "./freetunes.ts";
import { namesOf, registryKey, resolveName, sitesOf, zoneKey } from "./freenames.ts";
import type { ContractKey } from "@freenetorg/freenet-stdlib";
import { MEDIA_PREFIX, dataUrlBytes, keepMedia, mediaHashOf, mediaUris } from "./media.ts";
import { revokeChatMediaInText, summarizeChatMediaText } from "./chatMedia.ts";
import { mentionsIn, plainMentions } from "./caption.ts";
import { repostRef } from "./repost.ts";
import {
  getSecretRoomId,
  isSecretRoomId,
  peerFromSecretRoomId,
  getActiveSecretChatTTL,
  setActiveSecretChatTTL,
  clearSecretChatSession,
  loadSecretChatSessions,
  saveSecretChatSession,
  ACTIVE_TTL_STORAGE_KEY,
} from "./secretChat.ts";
import { dmPeerOf, localReadMarks, seedReadMark } from "./conversationState.ts";
import { durable } from "./durable.ts";
import { acceptHello, acceptMeshPacket, HELLO_EVERY_MS, HELLO_FRESH_MS, helloPacket, helloSigMessage, meshBroadcast, meshSend, onMeshPacket } from "./lanMesh.ts";
import { readContactCards, saveContactCard, type ContactCard } from "./contactCard.ts";
import {
  backupOwnProfileExtras,
  isProfileExtraLog,
  latestOwnLogEntry,
  profileExtraLogNames,
  restoreOwnProfileExtras,
  type ProfileExtraKind,
} from "./profileExtras.ts";
import {
  addSecretChatPeer,
  editSecretMessage,
  burnSecretMessage,
  readBurnedSecretIds,
  readSecretChat,
  removeSecretChatPeer,
  secretChatPeers,
  sendSecretChatMessage,
  type SecretChatTransport,
} from "./secretChatTransport.ts";

const localStorage = safeStorage;


const GENESIS: Community[] = [
  {
    id: "c_radica",
    name: "Radica Hub",
    slug: "radica",
    description: "Decentralized social commons, Freenet dApps, and network updates.",
    created_at: 1710000000000,
    creator: "system",
    moderators: ["system", RADICA_MAINTAINER],
    members: [],
    deleted_post_ids: [],
    sig: "genesis",
  },
  {
    id: "c_tech",
    name: "Tech & P2P",
    slug: "tech",
    description: "Peer-to-peer protocols, cryptography, and Web3 decentralization.",
    created_at: 1710000000000,
    creator: "system",
    moderators: ["system"],
    members: [],
    deleted_post_ids: [],
    sig: "genesis",
  },
];

export class FreenetClient {
  private isConnected = false;
  public connectError = "";
  private net = new FreenetNetwork((id, change) =>
    void (id.startsWith("mail:") ? this.mailChanged(id.slice(5), change) : id.startsWith("feed:") ? this.feedChanged(id.slice(5), change ?? {}) : this.logChanged(id.slice(4), change ?? {}))
  );
  private mailWatch = new Map<string, () => void>();

  /** Subscribe to a Freenet Mail inbox (this persona's own): `onChange` runs when the node says it changed, so new mail
   *  is synced at once instead of on the next Refresh. Once per inbox; kept across reconnections. */
  public watchMailInbox(instance: string, onChange: () => void): void {
    if (this.mailWatch.has(instance)) return;
    this.mailWatch.set(instance, onChange);
    this.subscribeMail(instance);
  }

  private subscribeMail(instance: string): void {
    void this.net.watchByInstance(instance, `mail:${instance}`).catch(() => {});
  }

  /** A watched inbox changed, or (no `change`) the socket came back: subscribe again, then sync. */
  private async mailChanged(instance: string, change?: unknown): Promise<void> {
    if (!change) this.subscribeMail(instance);
    this.mailWatch.get(instance)?.();
  }

  private identity: UserIdentity | null = null;
  private offlineMedia = new Map<string, Uint8Array>(); // in-session fallback when no local node is connected
  private me = "";
  private bc: BroadcastChannel | null = null;
  private listeners: (() => void)[] = [];
  private typingListeners: ((roomId: string, sender: string) => void)[] = [];
  private warmedWallets = new Set<string>();
  private logs = new LogStore({
    storage: {
      getItem: (k) => localStorage.getItem(k),
      setItem: (k, v) => localStorage.setItem(k, v),
    },
    net: this.net,
    isConnected: () => this.isConnected,
    identity: () => this.identity,
    onApplied: (name) => this.applyLog(name),
    onChanged: (name) => {
      this.applyLog(name);
      this.notifyListeners();
    },
    onLoaded: (name) => {
      if (this.me && isProfileExtraLog(name) && name.endsWith(`/${this.me}`)) {
        backupOwnProfileExtras(localStorage, this.me, (n) => this.logEntries(n));
      }
    },
    onPostTake: (name) => {
      if (name === "communities") void this.checkJoined();
    },
    onSynced: (name) => {
      let any = false;
      for (const [id, log] of this.unpushed) if (log === name) any = this.unpushed.delete(id);
      if (any) this.notifyListeners();
    },
  });
  private feeds = new FeedStore({
    storage: {
      getItem: (k) => localStorage.getItem(k),
      setItem: (k, v) => localStorage.setItem(k, v),
    },
    net: this.net,
    isConnected: () => this.isConnected,
    me: () => this.me,
    onPeerProfile: (owner, profile) => {
      const prev = this.knownPeers[owner];
      const next = {
        display_name: profile.display_name || prev?.display_name || "",
        avatar_url: profile.avatar_url ?? prev?.avatar_url,
      };
      if (prev?.display_name === next.display_name && prev?.avatar_url === next.avatar_url) return;
      this.knownPeers[owner] = next;
      this.notifyListeners();
    },
    onChanged: () => this.notifyListeners(),
  });
  private privateRooms = new PrivateRoomManager({
    storage: {
      getItem: (k) => localStorage.getItem(k),
      setItem: (k, v) => localStorage.setItem(k, v),
      removeItem: (k) => localStorage.removeItem(k),
    },
    flushStorage: () => safeStorage.flush(),
    logEntries: (name) => this.logEntries(name),
    logAppend: (name, body, opts) => this.logAppend(name, body, opts),
    refreshLog: (name, force, urgent) => this.refreshLog(name, force, urgent),
    logOfRoom: (roomId) => this.logOfRoom(roomId),
    nodeGet: (key) => import("./delegate.ts").then((m) => m.nodeGet(key)),
    nodePut: (key, val) => import("./delegate.ts").then((m) => m.nodePut(key, val)),
    readKeysReady: () => this.readKeysReady,
    encPubOf: (pubkey) => this.encPubOf(pubkey),
    isConnected: () => this.isConnected,
    me: () => this.me,
    visibleChat: (roomId) => this.visibleChat(roomId),
    computeLogJoins: (roomId, entries) => this.computeLogJoins(roomId, entries),
    plain: (key, decrypt) => this.plain(key, decrypt),
    broadcast: (data) => this.broadcast(data),
    addNotification: (to, notif) => this.addNotification(to, notif),
    notifyListeners: () => this.notifyListeners(),
  });
  private static readonly MAX_PEER_CACHE = 400;
  public peerCache: Record<string, Post> = {};
  public cachePeerPost(id: string, post: Post): void {
    const keys = Object.keys(this.peerCache);
    if (keys.length >= FreenetClient.MAX_PEER_CACHE && !this.peerCache[id]) {
      delete this.peerCache[keys[0]];
    }
    this.peerCache[id] = post;
  }
  public knownPeers: Record<string, { display_name: string; avatar_url?: string }> = {};

  constructor() {
    if (typeof BroadcastChannel !== "undefined") {
      this.bc = new BroadcastChannel("radica_peer_sync");
      this.bc.onmessage = (ev) => {
        this.handlePeerEvent(ev.data);
      };
    }
    // the LAN mesh (lanMesh.ts): a checked message is handled as if another tab had sent it
    onMeshPacket(async (raw) => {
      const card = await acceptHello(raw, this.me, (pk) => this.blockedBy(this.me).has(pk));
      if (card) {
        this.nearby.set(card.pubkey, { card, seen: Date.now() });
        this.notifyListeners();
        return;
      }
      const message = await acceptMeshPacket(raw, this.me, (pk) => this.blockedBy(this.me).has(pk));
      if (message) this.handlePeerEvent({ type: "chat", message });
    });

    if (import.meta.hot) {
      import.meta.hot.on("radica:peer-event", (data: any) => {
        this.handlePeerEvent(data);
      });
      import.meta.hot.on("spruce:peer-event", (data: any) => {
        this.handlePeerEvent(data);
      });
      const handleSyncState = (state: any) => {
        if (state.posts && Array.isArray(state.posts)) {
          for (const p of state.posts) {
            this.cachePeerPost(p.id, p);
          }
        }
        if (state.peers) {
          Object.assign(this.knownPeers, state.peers);
        }
        if (state.communities) {
          const list = Object.values(state.communities) as Community[];
          this.mergeRemoteCommunities(list);
        }
        if (state.chatMessages) {
          for (const [roomId, msgs] of Object.entries(state.chatMessages)) {
            const roomKey = `freenet_chat_${roomId}`;
            const raw = localStorage.getItem(roomKey);
            const list: ChatMessage[] = raw ? JSON.parse(raw) : [];
            for (const m of msgs as ChatMessage[]) {
              if (!list.some((existing) => existing.id === m.id)) {
                list.push(m);
              }
              if (m.recipient && m.recipient !== "community") {
                // a Secret Chat message lists its Secret Chat, not the plain DM with the same person
                const secret = m.is_secret || isSecretRoomId(roomId);
                (secret ? this.addSecretChatPeer : this.addChatPeer).call(this, m.sender, m.recipient);
                (secret ? this.addSecretChatPeer : this.addChatPeer).call(this, m.recipient, m.sender);
              }
            }
            localStorage.setItem(roomKey, JSON.stringify(list));
          }
        }
        this.notifyListeners();
      };
      import.meta.hot.on("radica:sync-state", handleSyncState);
      import.meta.hot.on("spruce:sync-state", handleSyncState);
    }
  }

  public async announceIdentity(identity: UserIdentity, profile?: ProfileInfo | null) {
    const data = {
      type: "hello",
      pubkey: identity.pubkey,
      profile: profile ? { display_name: profile.display_name } : { display_name: `Persona @${personaName(identity.pubkey).substring(0, 6)}` },
    };
    this.knownPeers[identity.pubkey] = data.profile;
    this.broadcast(data);

    // the network-wide phone book: BroadcastChannel only reaches tabs of this browser
    const last = this.logEntries("directory").filter((e) => e.author === identity.pubkey).sort((a, b) => b.ts - a.ts)[0];
    let lastName = "";
    try {
      lastName = JSON.parse(last?.body ?? "{}").display_name;
    } catch {}
    // Without a name yet I still announce myself once (as "Persona @…"), or nobody's Explore would ask for my posts; readers keep a
    // real name over a default one, so a hello sent before my feed arrived cannot overwrite it.
    if (profile ? !last || lastName !== data.profile.display_name || Date.now() - last.ts > 7 * 864e5 : !last)
      // the hello carries a proof of work: readers weigh a newcomer's place in their Explore by it
      await this.logAppend("directory", { type: "hello", display_name: data.profile.display_name, pow: await this.helloPow(identity.pubkey) }).catch((e) => console.warn("[Freenet] directory:", e));

    try {
      const comms = await this.getCommunities();
      for (const c of comms) {
        if (c.creator !== "system") {
          this.broadcast({ type: "community", community: c });
        }
      }
    } catch (e) {
      console.warn("[Freenet] Error announcing communities:", e);
    }
  }

  public broadcast(data: any) {
    try {
      this.bc?.postMessage(data);
    } catch {}
    const m = data?.type === "chat" ? (data.message as ChatMessage | undefined) : undefined;
    if (m && m.sender === this.me && dmPeerOf(m.room_id, this.me)) meshSend(m, this.identity?.cert);
    if (import.meta.hot) {
      import.meta.hot.send("radica:peer-event", data);
    }
  }

  public mergeRemoteCommunities(incoming: Community[]) {
    if (!incoming || incoming.length === 0) return;
    const raw = localStorage.getItem("freenet_communities");
    let list: Community[] = [];
    if (raw) {
      try {
        list = JSON.parse(raw);
      } catch {
        list = [];
      }
    }
    list = list.map((c) => {
      if (c.id === "c_spruce" || c.id === "c_radica") {
        const mods = new Set(c.moderators || []);
        mods.add(RADICA_MAINTAINER);
        return { ...c, id: "c_radica", name: c.name || "Radica Hub", slug: "radica", moderators: Array.from(mods) };
      }
      return c;
    });
    if (list.length === 0) {
      list = [
        {
          id: "c_radica",
          name: "Radica Hub",
          slug: "radica",
          description: "Decentralized social commons, Freenet dApps, and network updates.",
          created_at: 1710000000000,
          creator: "system",
          moderators: ["system", RADICA_MAINTAINER],
          members: [],
          deleted_post_ids: [],
          sig: "genesis",
        },
        {
          id: "c_tech",
          name: "Tech & P2P",
          slug: "tech",
          description: "Peer-to-peer protocols, cryptography, and Web3 decentralization.",
          created_at: 1710000000000,
          creator: "system",
          moderators: ["system"],
          members: [],
          deleted_post_ids: [],
          sig: "genesis",
        },
      ];
    }
    let changed = false;
    for (const comm of incoming) {
      if (!comm || !comm.id) continue;
      const idx = list.findIndex(
        (c) => c.id === comm.id || (c.slug && c.slug.toLowerCase() === comm.slug?.toLowerCase())
      );
      if (idx >= 0) {
        const existing = list[idx];
        const members = Array.from(new Set([...(existing.members || []), ...(comm.members || [])]));
        const moderators = Array.from(new Set([...(existing.moderators || []), ...(comm.moderators || [])]));
        const deleted_post_ids = Array.from(new Set([...(existing.deleted_post_ids || []), ...(comm.deleted_post_ids || [])]));
        list[idx] = {
          ...existing,
          ...comm,
          members,
          moderators,
          deleted_post_ids,
        };
        changed = true;
      } else {
        list.push(comm);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem("freenet_communities", JSON.stringify(list));
    }
  }

  private handlePeerEvent(data: any) {
    if (!data) return;
    if (data.type === "post" && data.post) {
      const p = data.post as Post;
      this.cachePeerPost(p.id, p);
      if (p.author) {
        if (!this.knownPeers[p.author]) {
          this.knownPeers[p.author] = { display_name: `Persona @${personaName(p.author).substring(0, 6)}` };
        }
      }
      this.notifyListeners();
    } else if (data.type === "hello" && data.pubkey) {
      this.knownPeers[data.pubkey] = data.profile ? { ...this.knownPeers[data.pubkey], ...data.profile } : { display_name: `Persona @${personaName(data.pubkey).substring(0, 6)}` };
      this.notifyListeners();
    } else if (data.type === "community" && data.community) {
      this.mergeRemoteCommunities([data.community]);
      this.notifyListeners();
    } else if (data.type === "chat" && data.message) {
      const msg = data.message as ChatMessage;
      const roomKey = `freenet_chat_${msg.room_id}`;
      const raw = localStorage.getItem(roomKey);
      const messages: ChatMessage[] = raw ? JSON.parse(raw) : [];
      if (!messages.some((m) => m.id === msg.id)) {
        messages.push(msg);
        localStorage.setItem(roomKey, JSON.stringify(messages));
      }
      if (msg.recipient && msg.recipient !== "community") {
        if (msg.is_secret || isSecretRoomId(msg.room_id)) {
          this.addSecretChatPeer(msg.sender, msg.recipient, msg.timestamp);
          this.addSecretChatPeer(msg.recipient, msg.sender, msg.timestamp);
        } else {
          this.addChatPeer(msg.sender, msg.recipient);
          this.addChatPeer(msg.recipient, msg.sender);
        }
        const isSecret = !!(msg.is_secret || msg.text?.startsWith("secret:v") || (msg.room_id && this.isSecretRoomId(msg.room_id)));
        const notifText = isSecret
          ? "sent you a secret chat message"
          : msg.text.startsWith("e2e:")
            ? "sent you an encrypted direct message"
            : (() => { const s = summarizeChatMediaText(msg.text); return `sent you a message: "${s.length > 30 ? s.substring(0, 30) + '...' : s}"`; })();
        if (msg.recipient === this.me) // local tabs only: notifications to others travel through their inbox
          this.storeNotification(msg.recipient, {
            id: `n_${msg.id}`,
            type: "chat",
            from: msg.sender,
            text: notifText,
            timestamp: msg.timestamp,
            read: false,
            linkRoomId: msg.room_id,
            isSecret,
          });
      }
      this.notifyListeners();
    } else if ((data.type === "chat_delete" || data.type === "chat_burn") && data.roomId && data.messageId) {
      const roomKey = `freenet_chat_${data.roomId}`;
      const raw = localStorage.getItem(roomKey);
      if (raw) {
        const messages: ChatMessage[] = JSON.parse(raw);
        const filtered = messages.filter((m) => m.id !== data.messageId);
        localStorage.setItem(roomKey, JSON.stringify(filtered));
      }
      this.notifyListeners();
    } else if (data.type === "chat_read" && data.roomId && typeof data.upto === "number") {
      const peer = data.sender || data.by;
      if (peer) this.savePeerReadUpto(data.roomId, peer, data.upto);
      this.notifyListeners();
    } else if (data.type === "chat_typing" && data.roomId && data.sender) {
      for (const cb of this.typingListeners) cb(data.roomId, data.sender);
    } else if (data.type === "chat_edit" && data.roomId && data.messageId && data.text) {
      const roomKey = `freenet_chat_${data.roomId}`;
      const raw = localStorage.getItem(roomKey);
      if (raw) {
        const messages: ChatMessage[] = JSON.parse(raw);
        const idx = messages.findIndex((m) => m.id === data.messageId);
        if (idx >= 0) {
          messages[idx].text = data.text;
          // a Secret Chat edit always names its copies (maybe none); a DM edit does not and keeps what the message had
          if (data.copies) messages[idx].copies = Object.keys(data.copies).length ? data.copies : undefined;
          messages[idx].edited_at = Date.now();
          localStorage.setItem(roomKey, JSON.stringify(messages));
        }
      }
      this.notifyListeners();
    } else if (data.type === "chat_clear" && data.roomId) {
      const roomKey = `freenet_chat_${data.roomId}`;
      localStorage.setItem(roomKey, JSON.stringify([]));
      this.notifyListeners();
    } else if (data.type === "private_room" && data.room) {
      this.mergeRemotePrivateRooms([data.room]);
      this.notifyListeners();
    } else if (data.type === "private_room_kick" && data.room) {
      this.mergeRemotePrivateRooms([data.room]);
      this.notifyListeners();
    } else if ((data.type === "community_ban" || data.type === "community_unban") && data.community) {
      this.mergeRemoteCommunities([data.community]);
      this.notifyListeners();
    }
  }

  public onSyncUpdate(fn: () => void) {
    this.listeners.push(fn);
  }

  // coalesce bursts (every refresh fires one) into a single pass of the heavy UI listeners,
  // and keep passes 2 s apart while feeds trickle in: each one redraws the feed and the open chat
  private notifyTimer: ReturnType<typeof setTimeout> | undefined;
  private lastNotify = 0;
  private notifyListeners() {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = undefined;
      this.lastNotify = Date.now();
      for (const fn of this.listeners) {
        try {
          fn();
        } catch (e) {
          console.error(e);
        }
      }
    }, Math.max(150, 2000 - (Date.now() - this.lastNotify)));
  }

  /** `chatOnly` (the terminal chat): only the log chat needs at start, @handles; the social logs below are big to fetch and
   *  verify, and nothing there reads them. */
  public async connect(opts?: { chatOnly?: boolean }): Promise<boolean> {
    try {
      await this.net.connect();
      this.isConnected = true;
      if (this.me && !opts?.chatOnly) void this.refresh(this.me, true, true); // own profile & following list take top fgGate priority
      void this.refreshLog("handles", true, true); // own @handle resolves immediately without waiting behind bgGate
      if (!opts?.chatOnly) {
        void this.refreshLog("communities", true, true);
        void this.refreshLog("directory", false, true);
      }
      if (this.me) void this.refreshLog(`inbox/${this.me}`, true);
      if (!opts?.chatOnly) void this.connectSocial();
    } catch (err) {
      console.warn("[Freenet] Could not connect to the Freenet node, using local storage only:", err);
      this.isConnected = false;
      this.connectError = String((err as Error)?.message ?? err);
    }
    return this.isConnected;
  }

  /** The social logs the feed needs and chat does not (the terminal chat loads them when a feed is opened). */
  public connectSocial(): Promise<unknown> {
    return Promise.allSettled(
      ["communities", "directory", "supporters", "ghostkeys", "poh", "delegations", "supporter-receipts", "post-edits"].map((l) => this.refreshLog(l, true)) // directory: learn who else is on the network, and publish my own entry
    );
  }

  /** Fetch a feed from the network into the local cache (at most once a minute unless `force`). */
  /** True while the chat is on screen: feeds (posts, follows) are not fetched then; chat logs and the profiles chat shows still are. */
  public get feedsPaused(): boolean {
    return this.feeds.feedsPaused;
  }
  public set feedsPaused(v: boolean) {
    this.feeds.feedsPaused = v;
  }

  public refresh(owner: string, force = false, urgent = false): Promise<void> {
    return this.feeds.refresh(owner, force, urgent);
  }

  /** A followed feed changed on the network: take the state or the delta the node sent instead of fetching it again. */
  private feedChanged(owner: string, c: Change): Promise<void> {
    return this.feeds.applyChange(owner, c);
  }

  /** Publish my local feed (merged with what the network has), then take the merged result. */
  private readKeysReady: Promise<void> = Promise.resolve();

  /** The persona that signs log entries (messages, community actions). Call once at startup. */
  /** People whose hello I heard on the LAN in the last minute (lanMesh.ts). */
  private nearby = new Map<string, { card: ContactCard; seen: number }>();
  public nearbyPeers(): ContactCard[] {
    const fresh = Date.now() - HELLO_FRESH_MS;
    return [...this.nearby.values()].filter((n) => n.seen > fresh).map((n) => n.card);
  }

  private helloTimer: ReturnType<typeof setInterval> | undefined;
  public isNearbyVisible(): boolean {
    return localStorage.getItem("radica_nearby_visible") === "1";
  }
  /** "Let people on this Wi-Fi find me": broadcast my signed hello while on (per device, off by default). */
  public setNearbyVisible(on: boolean): void {
    localStorage.setItem("radica_nearby_visible", on ? "1" : "0");
    clearInterval(this.helloTimer);
    this.helloTimer = undefined;
    if (!on) return;
    const hello = async () => {
      const id = this.identity;
      if (!id) return;
      const h = { pubkey: id.pubkey, encPub: id.encPub, name: this.nickname().slice(0, 64), ts: Date.now() };
      meshBroadcast(helloPacket(h, await id.sign(helloSigMessage(h)), id.cert));
    };
    void hello();
    this.helloTimer = setInterval(() => void hello(), HELLO_EVERY_MS);
  }

  /** A contact card I took in person (contactCard.ts). */
  public contactCard(pubkey: string): ContactCard | undefined {
    return this.me ? readContactCards(localStorage, this.me)[pubkey] : undefined;
  }

  public saveContactCard(card: ContactCard): void {
    saveContactCard(localStorage, this.me, card);
    if (card.name && !this.knownPeers[card.pubkey]) this.knownPeers[card.pubkey] = { display_name: card.name };
  }

  public setIdentity(identity: UserIdentity): void {
    this.identity = identity;
    this.me = identity.pubkey;
    restoreOwnProfileExtras(localStorage, identity.pubkey);
    if (this.isNearbyVisible()) this.setNearbyVisible(true);
    for (const c of Object.values(readContactCards(localStorage, this.me)))
      if (c.name && !this.knownPeers[c.pubkey]) this.knownPeers[c.pubkey] = { display_name: c.name };
    this.moveLocalLogs();
    this.applyDmHistory();
    void this.loadDmHistory();
    // keys this device used before Viso's shared one: load first so DMs and room keys never decrypt before they arrive
    addReadKeys(JSON.parse(localStorage.getItem("radica_read_keys") || "[]"));
    this.readKeysReady = import("./delegate.ts").then(async (m) => {
      const fromNode: string[] = JSON.parse((await m.nodeGet("read-keys")) || "[]");
      if (!fromNode.length) return;
      addReadKeys(fromNode);
      const merged = [...new Set([...JSON.parse(localStorage.getItem("radica_read_keys") || "[]"), ...fromNode])];
      localStorage.setItem("radica_read_keys", JSON.stringify(merged));
      this.plainCache.clear();
      this.notifyListeners();
    }, () => {});
    this.privateRooms.startRestore();
    this.secretReady = durable.start(identity.pubkey).then(() => {
      if (restoreOwnProfileExtras(localStorage, identity.pubkey)) this.notifyListeners();
      return this.restoreSecretFromNode();
    });
    this.joinedReady = this.restoreJoined();
    // communities I created before they lived on the network: publish them once
    const legacy: Community[] = JSON.parse(localStorage.getItem("freenet_communities") || "[]");
    const known = new Set(this.foldedCommunities().map((c) => c.id));
    for (const c of legacy) {
      if (c.creator === identity.pubkey && !known.has(c.id))
        void this.logAppend("communities", { type: "community_create", community: { id: c.id, name: c.name, description: c.description, avatar_url: c.avatar_url } });
    }
  }

  public async syncOwnFeed(identity: UserIdentity): Promise<void> {
    this.setIdentity(identity);
    await this.feeds.syncOwnFeed(identity, {
      onAfterInitialFetch: () => {
        void this.announceDevice(identity).catch((e) => console.warn("[Freenet] Could not publish this device's key:", e));
      },
    });
  }

  public get isNodeOnline(): boolean {
    return this.isConnected;
  }

  /** The newest posts of another person's stored feed, parsed off the main thread (the timeline never needs the rest). */
  private peerPosts(pubkey: string): Promise<Post[]> {
    return this.feeds.peerPosts(pubkey);
  }

  /** Personas `pubkey` follows, from their feed read this session. */
  public followingOf(pubkey: string): string[] {
    return this.feeds.followingOf(pubkey);
  }

  /** People whose feed this node has read and who follow `pubkey`: only a part of them, never a count to show. */
  public followersOf(pubkey: string): string[] {
    return this.feeds.followersOf(pubkey);
  }

  /** Another Freenet app's contract by its instance id, or null when the network does not have it. Pass `fetchCode`
   *  before updating a contract this node has never held (see `FreenetNetwork.getRaw`): mailClient.ts's
   *  `getContractFn.call(freenet, id, true)` reaches this method, not `net.getByInstance` directly, so without this
   *  forwarding the flag never made it to the actual request and an update kept timing out as if it had no effect. */
  public appContract(instance: string, fetchCode = false): Promise<Uint8Array | null> {
    return this.net.getByInstance(instance, fetchCode);
  }

  /** Code of Freenet Mail's AFT token-allocation-record contract (frozen v1 generation), loaded on first use. A sender's
   *  record must exist on the network before an inbox accepts a token from it (see mailClient.ts). */
  public tokenRecordCode(): Promise<Uint8Array> {
    return import("./wasm/freenet_token_allocation_record.wasm?url")
      .then(({ default: url }) => fetch(url))
      .then(async (r) => new Uint8Array(await r.arrayBuffer()));
  }

  /** Freenet Mail's frozen v1 inbox contract code (`INBOX_V1_CODE_HASH`): this persona's own inbox is PUT with it. */
  public inboxCode(): Promise<Uint8Array> {
    return import("./wasm/freenet_email_inbox.wasm?url")
      .then(({ default: url }) => fetch(url))
      .then(async (r) => new Uint8Array(await r.arrayBuffer()));
  }

  /** Another app's contract, written by its own rules (FreePolls polls created and answered here). */
  public putAppContract(key: ContractKey, code: Uint8Array, params: Uint8Array, state: Uint8Array): Promise<void> {
    return this.net.putRaw(key, code, params, state);
  }

  public updateAppContract(key: ContractKey, delta: Uint8Array): Promise<void> {
    return this.net.updateRaw(key, delta);
  }

  /** Send a related contract state alongside a delta update (used for Freenet Mail AFT token delivery). */
  public updateAppContractWithRelated(
    key: ContractKey,
    relatedToInstance: Uint8Array,
    relatedState: Uint8Array,
    delta: Uint8Array
  ): Promise<void> {
    return this.net.updateRawRelatedStateAndDelta(key, relatedToInstance, relatedState, delta);
  }

  /** Universal Freenet URI (freenet:<contract_key_base58>) for a feed, media, or log contract. */
  public async getContractUri(id: ContractId): Promise<string> {
    const k = await contractKey(id);
    return `freenet:${k.encode()}`;
  }

  /** People's feeds this node keeps a copy of and passes changes on for, right now (its subscriptions). */
  public hostedFeeds(): number {
    return this.feeds.hostedFeeds();
  }

  /** Posts in every feed this node has read this session. */
  public knownPostCount(): number {
    return this.feeds.knownPostCount();
  }

  // Load feed for a given owner pubkey
  public getFeed(ownerPubkey: string): Promise<FeedState> {
    return this.feeds.getFeed(ownerPubkey);
  }

  /** Save `feed` locally and send `delta` (what changed) to the network; kept and retried until the network takes it. */
  public saveFeed(feed: FeedState, delta: FeedState = feed): Promise<void> {
    return this.feeds.saveFeed(feed, delta);
  }

  // ---- Logs (log-contract): inbox/<pubkey>, communities, room/<id>, dm/<id> ----

  // JSON kept in memory while its stored text is unchanged: re-parsing a log or chat on every call is what slows each sync pass.
  // Only for reads that never modify what they get back.
  private jsonCache = new Map<string, { raw: string; val: unknown }>();
  private readJson<T>(key: string, empty: string): T {
    const raw = localStorage.getItem(key) || empty;
    const hit = this.jsonCache.get(key);
    if (hit?.raw === raw) return hit.val as T;
    const val = JSON.parse(raw);
    this.jsonCache.set(key, { raw, val });
    return val as T;
  }

  private logEntries(name: string): LogEntry[] {
    return this.logs.entries(name);
  }

  private storedPrivateRooms(): PrivateRoom[] {
    return this.privateRooms.readRooms();
  }

  /** The newest edit of a post by its author, if any (the feed keeps a post as first published; edits live in a log). */
  public postEdit(author: string, postId: string): { caption: string; ts: number } | undefined {
    return this.logs.memo("post-edits", "post-edits", foldPostEdits).get(`${author}:${postId}`);
  }

  /** Change what my post says: a signed edit everyone's app applies over the original. */
  public editPost(postId: string, caption: string): Promise<void> {
    return this.logAppend("post-edits", { type: "edit", post: postId, caption });
  }

  /** Communities folded from the log, recomputed only when the stored log changes (folding replays every entry, and this is read on each sync pass). */
  private foldedCommunities(): Community[] {
    return this.logs.memo("communities", "communities", (e) => foldCommunities(e, GENESIS));
  }

  public getHandlesFold(): { byHandle: Map<string, string>; byPubkey: Map<string, string> } {
    return this.logs.memo("handles", "handles", foldHandles);
  }

  /** Resolves a human-readable Radica handle ("@alice" or "alice") to its 64-hex public key, or null if unclaimed. */
  public resolveHandle(query: string | null | undefined): string | null {
    const h = normalizeHandle(query);
    if (!h) return null;
    return this.getHandlesFold().byHandle.get(h) ?? null;
  }

  /** Looks up the registered Radica handle for a 64-hex public key, returning e.g. "alice" without "@", or null if none. */
  public handleOf(pubkey: string | null | undefined): string | null {
    if (!pubkey) return null;
    return this.getHandlesFold().byPubkey.get(pubkey.toLowerCase()) ?? null;
  }

  /** Returns all registered Radica handles mapped to their owner 64-hex pubkeys. */
  public allHandles(): Map<string, string> {
    return new Map(this.getHandlesFold().byHandle);
  }

  /** Claims a Radica @handle for the current identity. Checks format, availability, and appends to the "handles" log. */
  public async claimHandle(identity: UserIdentity, handle: string): Promise<{ success: boolean; error?: string }> {
    const norm = normalizeHandle(handle);
    if (!norm) {
      return {
        success: false,
        error: "Invalid handle format. Must be 3-20 lowercase alphanumeric characters or underscores (a-z, 0-9, _).",
      };
    }
    if (RESERVED_HANDLES.has(norm)) {
      return { success: false, error: `Handle @${norm} is reserved.` };
    }

    if (this.isConnected) {
      await this.refreshLog("handles", true).catch(() => {});
    }

    const { byHandle } = this.getHandlesFold();
    const existing = byHandle.get(norm);
    if (existing && existing.toLowerCase() !== identity.pubkey.toLowerCase()) {
      return { success: false, error: `@${norm} is already claimed by another user.` };
    }

    await this.logAppend("handles", { type: "handle_claim", handle: norm }, { flush: true });
    this.notifyListeners();
    return { success: true };
  }

  /** Releases the current identity's claimed Radica handle. */
  public async releaseHandle(identity: UserIdentity): Promise<void> {
    await this.logAppend("handles", { type: "handle_release" }, { flush: true });
    this.notifyListeners();
  }

  private saveLog(name: string, entries: LogEntry[]): void {
    this.logs.save(name, entries);
  }

  /** Sign `body` as a new entry of log `name`, apply it here and send it to the network. */
  private logAppend(name: string, body: object, opts?: { flush?: boolean }): Promise<void> {
    const id = (body as { type?: string; message?: { id?: unknown } }).type === "chat" ? (body as { message?: { id?: unknown } }).message?.id : undefined;
    if (typeof id === "string") this.unpushed.set(id, name);
    return this.logs.append(name, body, opts);
  }

  /** My chat messages signed and stored here but not yet on the network, and the log each waits in (memory only). */
  private unpushed = new Map<string, string>();
  /** Whether my chat message `id` has reached the network (drives ✓ / ✓✓). */
  public isOnNetwork(id: string): boolean {
    return !this.unpushed.has(id);
  }

  public hasUnsentLog(name: string): boolean {
    return this.logs.hasUnsent(name);
  }

  public hasLoadedLog(name: string): boolean {
    return this.logs.hasLoaded(name);
  }

  private async writeOwnProfileExtra(kind: ProfileExtraKind, body: object): Promise<void> {
    if (!this.me) throw new Error("No identity to sign with");
    const logName = `${kind}/${this.me}`;
    await this.logAppend(logName, body, { flush: true });
    this.logs.markLoaded(logName);
    backupOwnProfileExtras(localStorage, this.me, (n) => this.logEntries(n));
    void durable.flush();
    this.notifyListeners();
  }

  /** Eagerly fetch all personal profile-extra logs (`wallets/`, `delta/`, `orto/`, `asocial/`, `freetunes/`, `freetree/`, `fh/`) for `pubkey`. */
  public async refreshProfileExtras(pubkey: string, opts?: { force?: boolean; urgent?: boolean }): Promise<void> {
    if (!this.isConnected || !pubkey) return;
    const force = !!opts?.force;
    const urgent = !!opts?.urgent;
    await Promise.allSettled(profileExtraLogNames(pubkey).map((n) => this.refreshLog(n, force, urgent)));
  }

  /** Warm `wallets/<pk>` in background for visible timeline/followed authors so opening their profile is instant. */
  public warmPeerWallets(pubkeys: string[], limit = 16): void {
    if (!this.isConnected) return;
    const targets: string[] = [];
    const seen = new Set<string>();
    for (const raw of pubkeys) {
      const pk = typeof raw === "string" ? raw.trim() : "";
      if (!pk || pk === this.me || seen.has(pk) || this.warmedWallets.has(pk)) continue;
      seen.add(pk);
      this.warmedWallets.add(pk);
      targets.push(pk);
      if (targets.length >= limit) break;
    }
    for (const pk of targets) {
      void this.refreshLog(`wallets/${pk}`, false, false);
    }
  }

  /** Each author's latest choice on the public supporters wall: their receipt token, or null when withdrawn. */
  public supporterTokens(): { author: string; token: string | null }[] {
    return this.logs.memo("supporters", "supporters", foldSupporterTokens);
  }

  /** Each author's latest GhostKey proof (bundle hex) in the "ghostkeys" log, null when they took it back; unchecked. */
  public ghostkeyBundles(): { author: string; bundle: string | null }[] {
    return this.logs.memo("ghostkeys", "ghostkeys", foldGhostkeyBundles);
  }

  /** Publish my GhostKey proof (so others see the badge), or null to take it back. */
  public setGhostkey(bundle: string | null): Promise<void> {
    return this.logAppend("ghostkeys", { type: "ghostkey", bundle });
  }

  /** Each author's latest Viso PoH proof (hex CBOR PohAttestationV1, optional delegation) in the "poh" log, or null when withdrawn. */
  public pohProofs(): PohLogEntry[] {
    return this.logs.memo("poh", "poh", foldPohProofs);
  }

  /** Publish my Viso PoH proof (so others see the Verified Human / GitHub badge), or null to take it back. */
  public setPohProof(proof: string | null, delegation?: DelegationProofV1 | null): Promise<void> {
    return this.logAppend("poh", delegation ? { type: "poh", proof, delegation } : { type: "poh", proof });
  }

  /** Each author's latest Viso persona delegation (`DelegationProofV1`) in the "delegations" log, or null when withdrawn. */
  public delegationProofs(): { author: string; proof: DelegationProofV1 | null }[] {
    return this.logs.memo("delegations", "delegations", foldDelegationProofs);
  }

  /** Publish my dual-signed Viso persona handoff certificate, or null to unlink it. */
  public setDelegationProof(proof: DelegationProofV1 | null): Promise<void> {
    return this.logAppend("delegations", { type: "delegation", proof });
  }

  /** Publish a donation proof (RADICA-ZK-V1 token) for the attester bot, which answers in "supporter-receipts". */
  public submitSupporterClaim(token: string): Promise<void> {
    return this.logAppend("supporter-claims", { type: "claim", token });
  }

  /** Receipt tokens attesters published for `pubkey`; the caller checks who signed them. */
  public supporterReceiptsFor(pubkey: string): string[] {
    const out: string[] = [];
    for (const e of this.logEntries("supporter-receipts"))
      try {
        const b = JSON.parse(e.body);
        if (b.type === "receipt" && b.donor === pubkey && typeof b.token === "string") out.push(b.token);
      } catch {}
    return out;
  }

  /** Why an attester in `issuers` turned down claims of `pubkey`, oldest first. */
  public supporterRejectionsFor(pubkey: string, issuers: readonly string[]): { ts: number; reason: string }[] {
    const out: { ts: number; reason: string }[] = [];
    for (const e of this.logEntries("supporter-receipts"))
      try {
        const b = JSON.parse(e.body);
        if (b.type === "rejected" && b.claimant === pubkey && issuers.includes(e.author) && typeof b.reason === "string") out.push({ ts: e.ts, reason: b.reason.slice(0, 200) });
      } catch {}
    return out.sort((a, b) => a.ts - b.ts);
  }

  /** The Greenhouse log: supporters' seeds (ideas, bugs), votes on them, and the maintainer's status for each. */
  public greenhouseEntries(): LogEntry[] {
    return this.logEntries("greenhouse");
  }
  public greenhouseAppend(body: object): Promise<void> {
    return this.logAppend("greenhouse", body);
  }

  /** Show my receipt on the public supporters wall, or take it down (null). */
  public setSupporterPublic(token: string | null): Promise<void> {
    return this.logAppend("supporters", { type: "supporter", receipt: token });
  }

  /** Publish (or withdraw) a block on my own blocklist; anyone who trusts my list then hides that author. */
  public async setBlocked(target: string, on: boolean): Promise<void> {
    if (on) {
      this.removeChatPeer(this.me, target);
    }
    await this.logAppend(`blocklist/${this.me}`, { type: "block", target, on });
    this.notifyListeners();
  }

  public isBlocked(pubkey: string): boolean {
    if (!this.me || !pubkey) return false;
    return this.blockedBy(this.me).has(pubkey);
  }
  /** Report a post on my own blocklist: I and anyone who trusts my list stop seeing it, and its media (`media`, an
   *  image's or video's hash) wherever it is posted again. */
  public async reportPost(author: string, postId: string, reason: string, media?: string | null, toModerators = false): Promise<void> {
    const body = { type: "report", target: `${author}:${postId}`, reason: reason.slice(0, 200), ...(media ? { media } : {}) };
    await this.logAppend(`blocklist/${this.me}`, body);
    // a public post also lands in the open `reports` log, the queue Radica's moderators work through
    if (toModerators) await this.logAppend("reports", body).catch(() => {});
  }

  /** All global moderators: the maintainer plus whoever they currently name as a moderator. */
  public globalModerators(): string[] {
    return [...new Set([RADICA_MAINTAINER, ...this.modsOf(RADICA_MAINTAINER)])];
  }

  /** Reported posts waiting for a Radica moderator: not yet removed (reported on a moderator's blocklist) nor dismissed by one. */
  public reportQueue(weigh?: (reporter: string) => number): ReportedItem[] {
    const resolved = new Set<string>();
    for (const m of this.globalModerators()) {
      const log = this.logEntries(`blocklist/${m}`);
      for (const t of foldReports(log, m).keys()) resolved.add(t);
      for (const t of foldDismissed(log, m)) resolved.add(t);
    }
    return foldReportQueue(this.logEntries("reports"), resolved, 50, weigh);
  }

  /** Recent post/comment decisions already made by Radica's global moderators (removed or dismissed), newest first. */
  public handledReports(max = 20): HandledReportItem[] {
    const modLogs = this.globalModerators().map((moderator) => ({
      moderator,
      entries: this.logEntries(`blocklist/${moderator}`),
    }));
    return foldHandledReports(modLogs, this.logEntries("reports"), max);
  }

  /** Latest active global-moderator decision for a `<author>:<post id>` target, if another moderator already handled it. */
  public modDecisionFor(target: string): HandledReportItem | null {
    return this.handledReports(Number.POSITIVE_INFINITY).find((h) => h.target === target) ?? null;
  }

  /** Moderator: set a report aside without removing the post. Every moderator sees it, since each reads the others' lists. */
  public dismissReport(target: string, on = true): Promise<void> {
    return this.logAppend(`blocklist/${this.me}`, { type: "dismiss", target, ...(on ? {} : { on: false }) });
  }

  /** Posts (`<author>:<post id>`) Radica's AI moderation helper is currently holding: hidden the same way a
   *  moderator's own report hides a post, for anyone following Radica's moderation, but the author still sees
   *  their own. A moderator's Dismiss (on the hold's queue item, same as for any report) lifts it; the AI's own
   *  signed key is what it can retract, not anyone's blocklist, so a dismiss is tracked separately here. */
  public aiHeldTargets(): Set<string> {
    const held = foldAiHolds(this.logEntries("reports"), AI_REPORTERS);
    if (!held.size) return held;
    for (const m of [RADICA_MAINTAINER, ...this.modsOf(RADICA_MAINTAINER)])
      for (const t of foldDismissed(this.logEntries(`blocklist/${m}`), m)) held.delete(t);
    return held;
  }

  /** Hide a community (`c_<slug>`) on my own blocklist, or show it again: whoever follows my list stops seeing it in lists,
   *  search and timelines. It stays on the network; only the people following the list stop seeing it. */
  public async setCommunityHidden(id: string, on: boolean, reason = ""): Promise<void> {
    await this.logAppend(`blocklist/${this.me}`, { type: "hide_community", target: id, on, reason: reason.slice(0, 200) });
    this.notifyListeners();
  }

  /** The communities `curator` hid (id -> reason), as last fetched. */
  public hiddenCommunitiesBy(curator: string): Map<string, string> {
    return this.logs.memo(`blocklist/${curator}`, `hiddenComm:${curator}`, (e) => foldHiddenCommunities(e, curator));
  }

  /** Name (or drop) a global moderator: their reports and blocks count for everyone who follows my list (the maintainer's). */
  public setGlobalMod(target: string, on: boolean): Promise<void> {
    return this.logAppend(`blocklist/${this.me}`, { type: "mod", target, on });
  }

  /** The moderators `curator` named on their blocklist, as last fetched. */
  public modsOf(curator: string): Set<string> {
    return this.logs.memo(`blocklist/${curator}`, `mod:${curator}`, (e) =>
      foldBlocklist(e, curator, "mod", curator === RADICA_MAINTAINER ? RADICA_DEFAULT_MODS : []),
    );
  }

  /** Withdraw a post report from my own blocklist so I and my curators see it again. */
  public unreportPost(author: string, postId: string): Promise<void> {
    return this.logAppend(`blocklist/${this.me}`, { type: "report", target: `${author}:${postId}`, on: false });
  }


  /** Name my Delta blog (its site prefix) on my profile, or none. */
  public setDeltaSite(prefix: string | null): Promise<void> {
    return this.writeOwnProfileExtra("delta", { type: "site", prefix });
  }

  /** The Delta blog `pubkey` named, from their own newest entry, as last fetched (refreshLog(`delta/<pubkey>`) to update). */
  public deltaSiteOf(pubkey: string): string | null {
    const mine = latestOwnLogEntry(this.logEntries(`delta/${pubkey}`), pubkey);
    try {
      const prefix = mine && JSON.parse(mine.body).prefix;
      return typeof prefix === "string" ? prefix : null;
    } catch {
      return null;
    }
  }

  private siteCode?: Promise<string>;

  /** A Delta site read from the network (under the code hash Delta's pointer names), or null when it is not there. */
  private sites = new Map<string, Promise<DeltaSite | null>>();

  /** A Delta site, fetched once per session: a big site is megabytes and slow to come from the network. Null when it
   *  cannot be had right now (a failed fetch is tried again next time). */
  public deltaSite(prefix: string): Promise<DeltaSite | null> {
    let site = this.sites.get(prefix);
    if (!site) {
      site = (async () => {
        this.siteCode ??= resolveSiteCode((k) => this.net.getRaw(k));
        const raw = await this.net.getRaw(siteKey(await this.siteCode, prefix));
        return raw ? parseSite(raw) : null;
      })().catch((e) => {
        console.warn("[Delta] Could not fetch site", prefix, e);
        return null;
      });
      this.sites.set(prefix, site);
      void site.then((s) => s || this.sites.delete(prefix));
    }
    return site;
  }

  public setWallets(wallets: Wallets): Promise<void> {
    return this.writeOwnProfileExtra("wallets", { type: "wallets", ...wallets });
  }

  /** The wallet addresses pubkey published, each checked by format (anyone can write to a log: only theirs count). */
  public walletsOf(pubkey: string): Wallets {
    const mine = latestOwnLogEntry(this.logEntries(`wallets/${pubkey}`), pubkey);
    try {
      return mine ? cleanWallets(JSON.parse(mine.body)) : {};
    } catch {
      return {};
    }
  }

  public setOrtoBlog(url: string | null): Promise<void> {
    return this.writeOwnProfileExtra("orto", { type: "blog", url });
  }

  /** The Orto blog url/setting pubkey named, or null. */
  public ortoBlogOf(pubkey: string): string | null {
    const mine = latestOwnLogEntry(this.logEntries(`orto/${pubkey}`), pubkey);
    try {
      const url = mine && JSON.parse(mine.body).url;
      // ponytail: allow only http(s), freenet:, or #fblog= to block javascript:/data: injection
      return typeof url === "string" && /^(?:https?:\/\/|freenet:|#fblog=)/i.test(url.trim()) ? url.trim() : null;
    } catch {
      return null;
    }
  }

  private ortoBlogs = new Map<string, Promise<OrtoBlog | null>>();

  /** A user's Orto blog, fetched from their Orto vault on Freenet or their configured URL. */
  public ortoBlog(pubkey: string): Promise<OrtoBlog | null> {
    let p = this.ortoBlogs.get(pubkey);
    if (!p) {
      p = (async () => {
        const customUrl = this.ortoBlogOf(pubkey);
        if (customUrl) {
          const parsed = parseOrtoUri(customUrl);
          if (parsed?.post) {
            return {
              title: parsed.post.title,
              author: parsed.post.author || "Author",
              posts: [parsed.post],
              url: customUrl,
            };
          }
        }
        if (/^[0-9a-f]{64}$/i.test(pubkey)) {
          try {
            const key = await ortoVaultKey(pubkey);
            const raw = await this.net.getRaw(key);
            if (raw) {
              const posts = parseOrtoVaultPosts(raw);
              if (posts.length) {
                const author = posts[0]?.author || "Author";
                return {
                  title: `${author}'s Blog`,
                  author,
                  posts,
                  url: customUrl || `http://127.0.0.1:7509/v1/contract/web/${ORTO_SITE}/`,
                };
              }
            }
          } catch (e) {
            console.warn("[Orto] Could not fetch vault", pubkey, e);
          }
        }
        return null;
      })();
      this.ortoBlogs.set(pubkey, p);
      void p.then((b) => b || this.ortoBlogs.delete(pubkey));
    }
    return p;
  }

  /** FreeNames' registry, read once per session (tried again after a failed read). */
  /** Set the user's Asocial author key or profile link in their personal log. */
  public setAsocialKey(key: string | null): Promise<void> {
    return this.writeOwnProfileExtra("asocial", { type: "profile", key });
  }

  /** The Asocial author key/profile link pubkey named, or null. */
  public asocialKeyOf(pubkey: string): string | null {
    const mine = latestOwnLogEntry(this.logEntries(`asocial/${pubkey}`), pubkey);
    try {
      const key = mine && JSON.parse(mine.body).key;
      return typeof key === "string" ? key : null;
    } catch {
      return null;
    }
  }

  private asocialProfiles = new Map<string, Promise<AsocialData | null>>();
  private asocialProfilesSync = new Map<string, AsocialData>();

  /** Synchronous check for cached Asocial profile data. */
  public cachedAsocialProfile(asocialKey: string): AsocialData | null {
    const cleanKey = asocialPersonOf(asocialKey) || asocialKey;
    return this.asocialProfilesSync.get(cleanKey) || null;
  }

  /** An Asocial author profile and published works, fetched from the Freenet network. */
  public asocialProfile(asocialKey: string): Promise<AsocialData | null> {
    const cleanKey = asocialPersonOf(asocialKey) || asocialKey;
    let p = this.asocialProfiles.get(cleanKey);
    if (!p) {
      p = (async () => {
        try {
          const ownKey = asocialOwnStoreKey(cleanKey);
          const worksKeyAsocial = asocialWorksStoreKey(cleanKey, "asocial");
          const worksKeyMain = asocialWorksStoreKey(cleanKey, "main");

          const [ownRaw, worksAsocialRaw, worksMainRaw] = await Promise.all([
            this.net.getRaw(ownKey).catch(() => null),
            this.net.getRaw(worksKeyAsocial).catch(() => null),
            this.net.getRaw(worksKeyMain).catch(() => null),
          ]);

          const profile = ownRaw ? parseAsocialProfile(ownRaw) : {};
          const worksAsocial = worksAsocialRaw ? parseAsocialWorks(worksAsocialRaw, cleanKey) : [];
          const worksMain = worksMainRaw ? parseAsocialWorks(worksMainRaw, cleanKey) : [];

          const worksMap = new Map<string, AsocialWorkItem>();
          for (const w of [...worksAsocial, ...worksMain]) {
            if (!worksMap.has(w.title)) {
              worksMap.set(w.title, w);
            }
          }

          const data: AsocialData = {
            key: cleanKey,
            name: profile.name,
            about: profile.about,
            works: Array.from(worksMap.values()),
          };

          this.asocialProfilesSync.set(cleanKey, data);
          return data;
        } catch (e) {
          console.warn("[Asocial] Could not fetch profile", cleanKey, e);
          return null;
        }
      })();
      this.asocialProfiles.set(cleanKey, p);
      void p.then((b) => b || this.asocialProfiles.delete(cleanKey));
    }
    return p;
  }

  // ---------------- FreeTunes Music & Artist integration ----------------

  /** Set the user's FreeTunes artist link, persona key or release links in their personal log. */
  public setFreetunes(input: string | null): Promise<void> {
    this.clearFreetunesArtistCache(this.me);
    return this.writeOwnProfileExtra("freetunes", { type: "profile", input });
  }

  public clearFreetunesArtistCache(pubkey?: string): void {
    if (pubkey) {
      this.ftArtists.delete(pubkey.trim().toLowerCase());
    } else {
      this.ftArtists.clear();
    }
  }

  /** The FreeTunes setting pubkey configured in their profile, or null. */
  public freetunesOf(pubkey: string): string | null {
    const mine = latestOwnLogEntry(this.logEntries(`freetunes/${pubkey}`), pubkey);
    try {
      const input = mine && JSON.parse(mine.body).input;
      return typeof input === "string" ? input : null;
    } catch {
      return null;
    }
  }

  private ftDirectory?: Promise<FtReleaseItem[]>;

  /** Fetch the public FreeTunes release directory from Freenet (cached per session). */
  public freetunesDirectory(): Promise<FtReleaseItem[]> {
    return (this.ftDirectory ??= (async () => {
      try {
        const raw = await this.net.getRaw(freetunesDirKey());
        return raw ? parseFreetunesDirectory(raw) : [];
      } catch (e) {
        console.warn("[FreeTunes] Could not fetch directory", e);
        return [];
      }
    })());
  }

  private ftArtists = new Map<string, Promise<FtArtistData | null>>();

  /** FreeTunes artist profile and releases, discovered via directory or direct links. */
  public freetunesArtist(pubkey: string): Promise<FtArtistData | null> {
    const clean = pubkey.trim().toLowerCase();
    let p = this.ftArtists.get(clean);
    if (!p) {
      p = (async () => {
        try {
          const custom = this.freetunesOf(pubkey);
          const parsedInput = custom ? parseFreetunesProfileInput(custom) : null;
          const isMe = this.me && this.me.toLowerCase() === clean;
          const artistHex = (parsedInput?.artistHex || (/^[0-9a-f]{64}$/i.test(pubkey) ? pubkey : "")).toLowerCase();

          // Auto-detect local FreeTunes releases and artist profile for current user
          const localArtist = isMe ? localFreetunesArtist() : {};
          const localReleases = isMe ? localFreetunesReleases() : [];

          const effectiveArtistHex = artistHex || localArtist.artistHex || (isMe && /^[0-9a-f]{64}$/i.test(this.me) ? this.me.toLowerCase() : "");

          const dir = await this.freetunesDirectory();
          const dirReleases = effectiveArtistHex ? freetunesReleasesForArtist(dir, effectiveArtistHex) : [];

          // Also resolve any direct release links the user pasted (even if unlisted in the directory)
          const directReleases: FtReleaseItem[] = [];
          if (parsedInput?.releases?.length) {
            await Promise.all(
              parsedInput.releases.map(async ({ id, params }) => {
                try {
                  const raw = await this.appContract(id);
                  const rel = raw ? parseRelease(raw) : null;
                  if (rel) {
                    directReleases.push({
                      id,
                      params,
                      owner: params.slice(0, 64),
                      title: rel.title || "Untitled",
                      artist: rel.artist || "Unknown artist",
                      creator: rel.creator,
                      cover: rel.cover,
                      ts: Date.now(),
                    });
                  }
                } catch {}
              })
            );
          }

          const combinedMap = new Map<string, FtReleaseItem>();
          for (const r of [...localReleases, ...directReleases, ...dirReleases]) {
            if (!combinedMap.has(r.id)) combinedMap.set(r.id, r);
          }
          const allReleases = Array.from(combinedMap.values());
          if (!allReleases.length && !effectiveArtistHex) return null;

          const distinctArtists = Array.from(new Set(allReleases.map((r) => r.artist).filter(Boolean)));

          let creatorName: string | undefined = localArtist.creatorName;
          if (!creatorName && typeof localStorage !== "undefined") {
            creatorName = (effectiveArtistHex ? (localStorage.getItem(`ft-creator-name-${effectiveArtistHex}`) || undefined) : undefined)
              || (isMe ? (localStorage.getItem("ft-creator-name") || undefined) : undefined)
              || undefined;
          }
          if (!creatorName) {
            creatorName = allReleases.find((r) => r.creator)?.creator;
          }

          const artistName =
            creatorName ||
            (distinctArtists.length === 1 ? distinctArtists[0] : (localArtist.artistName || (effectiveArtistHex ? personaName(effectiveArtistHex) : "FreeTunes Artist")));

          return {
            artistHex: effectiveArtistHex || allReleases[0]?.owner || "",
            artistName,
            creatorName,
            releases: allReleases,
          };
        } catch (e) {
          console.warn("[FreeTunes] Could not fetch artist", pubkey, e);
          return null;
        }
      })();
      this.ftArtists.set(clean, p);
      void p.then((b) => b || this.ftArtists.delete(clean));
    }
    return p;
  }

  // ---------------- Freetree Hub integration ----------------

  /** Set the user's Freetree hub prefix/link in their personal log. */
  public setFreetree(prefix: string | null): Promise<void> {
    return this.writeOwnProfileExtra("freetree", { type: "hub", prefix });
  }

  /** The Freetree hub prefix configured in their profile, or null. */
  public freetreeOf(pubkey: string): string | null {
    const mine = latestOwnLogEntry(this.logEntries(`freetree/${pubkey}`), pubkey);
    try {
      const prefix = mine && JSON.parse(mine.body).prefix;
      return typeof prefix === "string" ? prefix : null;
    } catch {
      return null;
    }
  }

  // ---------------- Fisherman's Horizon Bookmarks integration ----------------

  /** Set the user's Fisherman's Horizon share link, persona, or JSON in their personal log. */
  public setFh(input: string | null): Promise<void> {
    return this.writeOwnProfileExtra("fh", { type: "profile", input });
  }

  /** The Fisherman's Horizon setting pubkey configured in their profile, or null. */
  public fhOf(pubkey: string): string | null {
    const mine = latestOwnLogEntry(this.logEntries(`fh/${pubkey}`), pubkey);
    try {
      const input = mine && JSON.parse(mine.body).input;
      return typeof input === "string" ? input : null;
    } catch {
      return null;
    }
  }

  private fhLists = new Map<string, Promise<FhListData | null>>();

  /** Fetch a user's curated Freenet bookmark list from Fisherman's Horizon. */
  public fhList(personaHex: string, appPath = FH_APP_PATH, siteKey = FH_SITE): Promise<FhListData | null> {
    const cleanKey = (fhPersonaHex(personaHex) || personaHex).toLowerCase();
    const cacheKey = `${cleanKey}|${appPath}|${siteKey}`;
    let p = this.fhLists.get(cacheKey);
    if (!p) {
      p = (async () => {
        try {
          const custom = this.fhOf(personaHex);
          if (custom) {
            const parsed = parseFhProfileInput(custom);
            if (parsed?.kind === "json") {
              return {
                persona: cleanKey,
                siteKey,
                sites: parsed.sites,
                ts: Date.now(),
              };
            }
            if (parsed?.kind === "persona") {
              appPath = parsed.appPath;
              siteKey = parsed.siteKey;
            }
          }

          if (!/^[0-9a-f]{64}$/i.test(cleanKey)) return null;
          const key = fhListKey(cleanKey, appPath);
          const raw = await this.net.getRaw(key);
          if (!raw) return null;
          const listState = parseFhListState(raw);
          if (!listState || !listState.sites.length) return null;
          return {
            persona: cleanKey,
            siteKey,
            sites: listState.sites,
            ts: listState.ts,
          };
        } catch (e) {
          console.warn("[Fisherman's Horizon] Could not fetch list", personaHex, e);
          return null;
        }
      })();
      this.fhLists.set(cacheKey, p);
      void p.then((b) => b || this.fhLists.delete(cacheKey));
    }
    return p;
  }

  private registry?: Promise<Uint8Array | null>;

  /** The FreeNames names a persona owns, [] when none or the registry cannot be had right now. */
  public async freenamesOf(persona: string): Promise<string[]> {
    this.registry ??= this.net.getRaw(registryKey()).catch(() => null);
    const raw = await this.registry;
    if (!raw) this.registry = undefined;
    return raw ? namesOf(raw, persona) : [];
  }

  /** The sites a persona's FreeNames zone points to, [] when none or the zone cannot be had right now. */
  public async freenameSites(persona: string): Promise<{ name: string; target: string }[]> {
    const raw = await this.net.getRaw(zoneKey(persona)).catch(() => null);
    return raw ? sitesOf(raw) : [];
  }

  /** Resolves a FreeNames identifier ("freenet:name/sub", "name/sub", "fn:name", etc.) to its target contract id and owner. */
  public async resolveFreename(input: string): Promise<{ owner: string | null; target: string | null } | null> {
    return resolveName(input, (k) => this.net.getRaw(k));
  }

  /** Posts (`<author>:<post id>`) that `curator` reported, with the reason, as last fetched. */
  public reportedBy(curator: string): Map<string, string> {
    return this.logs.memo(`blocklist/${curator}`, `report:${curator}`, (e) => foldReports(e, curator));
  }

  /** Media hashes of the posts `curator` reported, as last fetched. */
  public reportedMediaBy(curator: string): Set<string> {
    return this.logs.memo(`blocklist/${curator}`, `media:${curator}`, (e) => foldReportedMedia(e, curator));
  }

  /** Authors that `curator` blocks, as last fetched. Call refreshLog(`blocklist/<curator>`) to update. */
  public blockedBy(curator: string): Set<string> {
    return this.logs.memo(`blocklist/${curator}`, `block:${curator}`, (e) => foldBlocklist(e, curator));
  }

  /** Liker pubkeys for a comment, from the author's `reactions/<postAuthor>` log. */
  public commentLikers(postAuthor: string, postId: string, commentKey: string): string[] {
    const map = this.logs.memo(`reactions/${postAuthor}`, `react:${postAuthor}`, foldCommentLikes);
    return map.get(`${postId}:${commentKey}`) ?? map.get(commentKey) ?? [];
  }

  /** Disliker pubkeys for a post, from the author's `reactions/<postAuthor>` log. */
  public postDislikers(postAuthor: string, postId: string): string[] {
    const map = this.logs.memo(`reactions/${postAuthor}`, `dislike:${postAuthor}`, foldPostDislikes);
    return map.get(postId) ?? [];
  }

  /** Dislike or undislike a post on Freenet via the post author's reactions log. */
  public async toggleDislike(identity: UserIdentity, postAuthor: string, postId: string): Promise<boolean> {
    const current = this.postDislikers(postAuthor, postId);
    const disliked = !current.includes(identity.pubkey);
    const body = {
      type: "post_dislike",
      postId,
      disliked,
      ts: Date.now(),
    };
    await this.logAppend(`reactions/${postAuthor}`, body);
    this.notifyListeners();
    return disliked;
  }

  /** Like or unlike a comment on Freenet via the post author's reactions log. */
  public async toggleCommentLike(
    identity: UserIdentity,
    postAuthor: string,
    postId: string,
    commentKey: string,
    commentAuthor: string,
    commentText: string
  ): Promise<boolean> {
    const current = this.commentLikers(postAuthor, postId, commentKey);
    const liked = !current.includes(identity.pubkey);
    const body = {
      type: "comment_like",
      postId,
      commentKey,
      liked,
      ts: Date.now(),
    };
    await this.logAppend(`reactions/${postAuthor}`, body);

    if (liked && commentAuthor && commentAuthor !== identity.pubkey) {
      await this.addNotification(commentAuthor, {
        type: "like",
        from: identity.pubkey,
        text: `liked your comment: "${commentText.length > 35 ? commentText.substring(0, 35) + "..." : commentText}"`,
        linkPostId: postId,
        linkPostOwner: postAuthor,
      });
    }
    this.notifyListeners();
    return liked;
  }

  /** Fetch a log (and subscribe to it), send it what only we have, then rebuild the state it feeds. */
  public refreshLog(name: string, force = false, urgent = false): Promise<void> {
    return this.logs.refresh(name, force, urgent);
  }

  /** A followed log changed on the network: take the state or the new entries the node sent instead of fetching it again. */
  private logChanged(name: string, c: Change): Promise<void> {
    return this.logs.applyChange(name, c);
  }

  /** Rebuild the local chat lists, notifications and rooms a log feeds. Communities are folded on read. */
  private applyLog(name: string): void {
    const entries = this.logEntries(name);
    if (name === `inbox/${this.me}`) {
      this.readUpTo = this.foldReadUpTo(); // before storing: notifications older than "mark all read" are stored read
      this.clearUpTo = this.foldInboxUpTo("notif_clear"); // and those older than "clear all" are not stored
      // my clears and removals first: a message newer than a removal, below, brings the conversation back
      const hides = foldChatHides(entries, this.me);
      const atLeast = (key: string, upto: number) => upto > Number(localStorage.getItem(key) ?? 0) && localStorage.setItem(key, String(upto));
      for (const [room, upto] of Object.entries(hides.cleared)) atLeast(`freenet_chat_cleared_${room}`, upto);
      for (const [peer, upto] of Object.entries(hides.removed)) atLeast(`freenet_chat_removed_${this.me}_${peer}`, upto);
      for (const [room, on] of Object.entries(hides.rooms))
        if (on) localStorage.setItem(`freenet_room_left_${this.me}_${room}`, "1");
        else localStorage.removeItem(`freenet_room_left_${this.me}_${room}`);
      const rooms = new Set<string>();
      const dmToRefresh = new Set<string>();
      const roomsToRefresh = new Set<string>();
      const read = { ...localReadMarks(localStorage), ...foldChatRead(entries, this.me) };
      for (const e of entries) {
        let b: any;
        try {
          b = JSON.parse(e.body);
        } catch {
          continue;
        }
        if (b.type === "chat" && b.message?.sender === e.author && typeof b.message.room_id === "string") {
          const peer = b.message.sender === this.me ? b.message.recipient : b.message.sender;
          if (b.message.sender !== this.me && this.isBlocked(b.message.sender)) {
            continue; // drop DMs from blocked senders
          }
          if (b.message.room_id === this.getRoomId(this.me, peer)) {
            rooms.add(b.message.room_id);
            this.addChatPeer(this.me, peer, e.ts);
            const m = b.message as ChatMessage;
            const seen = Math.max(read[m.room_id] ?? 0, Number(localStorage.getItem(`freenet_chat_cleared_${m.room_id}`) || 0));
            // a DM from someone else rings the bell as soon as the inbox arrives, not only once the chat is opened
            if (m.recipient === this.me && m.sender !== this.me && m.timestamp > seen)
              this.storeNotification(this.me, { id: `n_${m.id}`, type: "chat", from: m.sender, text: "sent you an encrypted direct message", timestamp: m.timestamp, read: false, linkRoomId: m.room_id, isSecret: false });
          } else if (b.message.room_id === getSecretRoomId(this.me, peer)) {
            rooms.add(b.message.room_id);
            this.addSecretChatPeer(this.me, peer, e.ts);
            const m = b.message as ChatMessage;
            const seen = Math.max(read[m.room_id] ?? 0, Number(localStorage.getItem(`freenet_chat_cleared_${m.room_id}`) || 0));
            if (m.recipient === this.me && m.sender !== this.me && m.timestamp > seen)
              this.storeNotification(this.me, { id: `n_${m.id}`, type: "chat", from: m.sender, text: "sent you a secret chat message", timestamp: m.timestamp, read: false, linkRoomId: m.room_id, isSecret: true });
          }
        } else if ((b.type === "chat_delete" || b.type === "chat_burn") && typeof b.roomId === "string" && typeof b.messageId === "string") {
          const roomKey = `freenet_chat_${b.roomId}`;
          const raw = localStorage.getItem(roomKey);
          if (raw) {
            const messages: ChatMessage[] = JSON.parse(raw);
            const filtered = messages.filter((m) => m.id !== b.messageId);
            localStorage.setItem(roomKey, JSON.stringify(filtered));
          }
        } else if (b.type === "chat_read" && typeof b.room === "string" && typeof b.upto === "number") {
          this.savePeerReadUpto(b.room, e.author, b.upto);
        } else if (b.type === "notif" && b.notif?.from === e.author) {
          if (this.isBlocked(e.author)) continue;
          this.storeNotification(this.me, { ...b.notif, id: `n_${e.author}:${e.id}`, timestamp: e.ts, read: false });
        } else if (b.type === "room_invite" && b.room?.creator === e.author && typeof b.room.id === "string") {
          if (this.isBlocked(e.author)) continue;
          this.mergeRemotePrivateRooms([b.room]);
          roomsToRefresh.add(b.room.id);
        } else if (b.type === "dm_ref" && typeof b.room === "string") {
          // a conversation of mine changed in its own log (the other side or my other device wrote there)
          const peer = dmPeerOf(b.room, this.me);
          if (peer && (e.author === this.me || e.author === peer) && !this.isBlocked(peer)) {
            rooms.add(b.room);
            if (isSecretRoomId(b.room)) this.addSecretChatPeer(this.me, peer, e.ts);
            else this.addChatPeer(this.me, peer, e.ts);
            dmToRefresh.add(b.room);
          }
        } else if (b.type === "room_ref" && e.author === this.me && typeof b.roomId === "string" && /^privroom_[\w]+$/.test(b.roomId)) {
          roomsToRefresh.add(b.roomId); // a room I made or joined: its log has the descriptor and my key
        }
      }
      for (const roomId of roomsToRefresh) void this.refreshLog(`room/${roomId}`);
      for (const dmId of dmToRefresh) void this.refreshLog(`dm/${dmId}`);
      // "mark all read" is a signed entry of mine, so it survives a re-login or a new device
      if (this.readUpTo) this.markNotificationsReadUpTo(this.me, this.readUpTo);
      for (const roomId of rooms) this.applyDm(roomId);
    } else if (name === "directory") {
      for (const e of [...entries].sort((a, b) => a.ts - b.ts)) {
        try {
          const b = JSON.parse(e.body);
          const known = this.knownPeers[e.author]?.display_name; // a name from the person's own feed profile wins
          if (b.type === "hello" && typeof b.display_name === "string" && (!known || known.startsWith("Persona @")))
            this.knownPeers[e.author] = { ...this.knownPeers[e.author], display_name: b.display_name.slice(0, 100) };
        } catch {}
      }
    } else if (name.startsWith("dm/")) {
      this.applyDm(name.slice("dm/".length));
    } else if (name.startsWith("room/")) {
      const id = name.slice("room/".length);
      const room = foldRoom(entries, id);
      if (room) this.privateRooms.mergeFoldedRoom(id, room);
      const isRoomMod = (pk: string) => !!room && (pk === room.creator || (room.moderators ?? []).includes(pk));
      this.writeChat(id, foldChat(entries, id, (a, m) => a === m.sender || isRoomMod(a), (sender) => this.isBlocked(sender)), entries);
    }
  }

  /** Messages from the log, plus local ones the log has not received yet. */
  private writeChat(roomId: string, fromLog: ChatMessage[], entries: LogEntry[]): void {
    const inLog = new Set(entries.map((e) => /"id":"([^"]+)"/.exec(e.body)?.[1]).filter(Boolean)); // ids of the messages entries carry
    const local = this.readJson<ChatMessage[]>(`freenet_chat_${roomId}`, "[]");
    const localById = new Map(local.map((m) => [m.id, m]));
    const burned = isSecretRoomId(roomId) && this.me ? readBurnedSecretIds(localStorage, this.me) : null;
    const adjustedFromLog = fromLog
      .filter((m) => !burned?.has(m.id))
      .map((m) => {
        const cur = localById.get(m.id);
        if (cur?.burn_started && cur.burn_at) {
          return { ...m, ttl_seconds: cur.ttl_seconds ?? m.ttl_seconds, burn_at: cur.burn_at, burn_started: true };
        }
        return m;
      });
    const merged = dedupeChat([...adjustedFromLog, ...local.filter((m) => !inLog.has(m.id) && !burned?.has(m.id))]);
    localStorage.setItem(`freenet_chat_${roomId}`, JSON.stringify(merged));
  }

  /** The key to encrypt to for `pubkey`: the one in their signed profile (Viso users), else the persona key. */
  private async encPubOf(pubkey: string): Promise<string> {
    if (pubkey === this.me && this.identity) return this.identity.encPub;
    const pr = (await this.getFeed(pubkey)).profile;
    const enc = pr?.enc_pub;
    // no signed profile (offline, or not published yet): the key from a contact card taken in person
    if (!pr || !enc || !/^[0-9a-f]{64}$/.test(enc) || enc === pubkey) return this.contactCard(pubkey)?.encPub ?? pubkey;
    return (await this.profileSigOk(pubkey, pr)) ? enc : pubkey;
  }

  private async profileNamesOtherKey(pubkey: string): Promise<boolean> {
    await this.refresh(pubkey); // a store that never saw this feed (the terminal chat's first run) has no profile yet
    const pr = (await this.getFeed(pubkey)).profile;
    return !!pr?.enc_pub && pr.enc_pub !== pubkey && /^[0-9a-f]{64}$/.test(pr.enc_pub) && (await this.profileSigOk(pubkey, pr));
  }

  private profileSigOk(pubkey: string, pr: NonNullable<Awaited<ReturnType<FreenetClient["getFeed"]>>["profile"]>): Promise<boolean> {
    const msg = pr.v === 3
      ? profileMsg4(pubkey, pr)
      : formatProfileSignatureMessage(pubkey, pr.display_name ?? "", pr.bio ?? "", pr.avatar_url ?? "", pr.enc_pub ?? "", pr.updated_at ?? 0);
    return verifyAuthorSignature(msg, pr.sig ?? "", pubkey, pr.cert);
  }

  // A Viso persona has one app key per device, and the profile names only one: each device also publishes its key in
  // the log devices/<persona>, and direct messages carry a copy encrypted to every one of them.
  // shortcut: DM copies go to every key ever announced and not revoked; Secret Chats also drop keys not announced for 30
  // days. A revoke is for good and any device of the persona can sign one; the UI is the Devices section of Identity & keys and `/devices`, `/revoke` in the terminal chat.

  /** Encryption keys `pubkey`'s devices published (entries by that persona only: the log contract checks the author). */
  private deviceKeys(pubkey: string, maxAgeMs = Infinity): string[] {
    const since = Date.now() - maxAgeMs;
    return [...deviceKeyTimes(this.logEntries(`devices/${pubkey}`), pubkey)].filter(([, ts]) => ts >= since).map(([k]) => k);
  }

  /** Every key a direct message to `pubkey` must be readable with: their profile's and their devices'. */
  /** The keys to seal to `pubkey`: someone this device already has a profile of seals at once, with their profile and
   *  device keys refreshed behind; only a first contact waits for the network. shortcut: a key changed in the last
   *  moments misses this one message (the next one has it); wait on the refresh if that ever matters. */
  private async keysFresh(pubkey: string): Promise<void> {
    const fetched = Promise.all([this.refresh(pubkey, false, true), this.refreshLog(`devices/${pubkey}`)]).then(
      () => {},
      () => {},
    );
    if (pubkey !== this.me && !(await this.getFeed(pubkey)).profile) await fetched;
  }

  private async encPubsOf(pubkey: string): Promise<string[]> {
    await this.keysFresh(pubkey);
    return [...new Set([await this.encPubOf(pubkey), ...this.deviceKeys(pubkey)])];
  }

  /** Publish this device's key once, so the messages sent to me reach it too. A local key is the same on every device. */
  public async announceDevice(identity: UserIdentity): Promise<void> {
    // a local key is the same on every device, unless the profile names another one (this persona also signs in with Viso):
    // then this device must say it reads with the persona key too, or senders seal to the profile's key only
    if (identity.encPub === identity.pubkey && !(await this.profileNamesOtherKey(identity.pubkey))) return;
    const name = `devices/${identity.pubkey}`;
    await this.refreshLog(name, true);
    if (revokedDeviceKeys(this.logEntries(name), identity.pubkey).has(identity.encPub)) return; // revoked for good: never announce again
    // announced again once a week: a Secret Chat sender drops keys not heard from in 30 days
    const last = deviceKeyTimes(this.logEntries(name), identity.pubkey).get(identity.encPub) ?? 0;
    if (Date.now() - last > DEVICE_HEARTBEAT_MS) await this.logAppend(name, { type: "device", enc_pub: identity.encPub });
  }

  /** My devices' keys not revoked, with when each was last heard from; `current` marks this device's. */
  public async ownDevices(): Promise<{ key: string; seen: number; current: boolean }[]> {
    const me = this.identity;
    if (!me) return [];
    await this.refreshLog(`devices/${me.pubkey}`, true);
    return [...deviceKeyTimes(this.logEntries(`devices/${me.pubkey}`), me.pubkey)].map(([key, seen]) => ({ key, seen, current: key === me.encPub }));
  }

  /** Revoke one of my devices' keys for good: senders stop sealing to it (DM copies and Secret Chat copies). It still
   *  reads what was already sealed to it. Not this device's own key, and not the key my profile names. */
  public async revokeDevice(key: string): Promise<void> {
    const me = this.identity;
    if (!me) throw new Error("Sign in first");
    if (key === me.encPub) throw new Error("That is this device");
    if (!(await this.ownDevices()).some((d) => d.key === key)) throw new Error("Not one of your announced devices");
    await this.logAppend(`devices/${me.pubkey}`, { type: "device_revoke", enc_pub: key });
  }

  /** Append to a room's log. In a one-to-one conversation the other side's inbox gets a "this conversation changed"
   *  entry (one per conversation and author, replaced each time: it wakes their client without growing the inbox),
   *  and mine one too, once, so my other devices find the conversation. */
  private async chatAppend(roomId: string, body: object): Promise<void> {
    await this.logAppend(this.logOfRoom(roomId), body);
    const peer = this.me ? dmPeerOf(roomId, this.me) : null;
    if (!peer) return;
    void this.logAppend(`inbox/${peer}`, { type: "dm_ref", room: roomId }).catch((e) => console.warn("[Freenet] dm_ref:", e));
    if (!this.dmRefsSent.has(roomId)) {
      this.dmRefsSent.add(roomId);
      void this.logAppend(`inbox/${this.me}`, { type: "dm_ref", room: roomId }).catch(() => this.dmRefsSent.delete(roomId));
    }
  }
  private dmRefsSent = new Set<string>();

  /** A conversation, from its own log, my inbox and the history from before conversations had logs of their own. */
  private applyDm(roomId: string): void {
    const peer = this.me ? dmPeerOf(roomId, this.me) : null;
    if (!peer) return;
    // anyone can append to a log: in a conversation's, only its two people count
    const own = this.logEntries(`dm/${roomId}`).filter((e) => e.author === this.me || e.author === peer);
    const inbox = this.logEntries(`inbox/${this.me}`);
    const entries = [...own, ...inbox, ...this.dmHistory()];
    const read = { ...localReadMarks(localStorage), ...foldChatRead(inbox, this.me) };
    const seen = Math.max(read[roomId] ?? 0, Number(localStorage.getItem(`freenet_chat_cleared_${roomId}`) || 0));
    const secret = isSecretRoomId(roomId);
    for (const e of own) {
      let b: any;
      try {
        b = JSON.parse(e.body);
      } catch {
        continue;
      }
      const m = b.type === "chat" ? (b.message as ChatMessage) : null;
      if (m && m.sender === peer && e.author === peer && m.recipient === this.me && m.room_id === roomId && m.timestamp > seen && !this.isBlocked(peer))
        this.storeNotification(this.me, { id: `n_${m.id}`, type: "chat", from: peer, text: secret ? "sent you a secret chat message" : "sent you an encrypted direct message", timestamp: m.timestamp, read: false, linkRoomId: roomId, isSecret: secret });
      else if (b.type === "chat_read" && e.author === peer && b.room === roomId && typeof b.upto === "number") this.savePeerReadUpto(roomId, peer, b.upto);
    }
    // only I can take someone's message out of my own view; a sender takes theirs out for both
    this.writeChat(roomId, foldChat(entries, roomId, (a, m) => a === this.me || a === m.sender || secret, (sender) => this.isBlocked(sender), (a, m) => a === m.sender || a === m.recipient), entries);
  }

  /** A new log contract: the logs cached here are compacted as the network's are (an inbox's conversations move to
   *  its history), or syncing would send back to the new logs everything they left behind. Once per generation. */
  private moveLocalLogs(): void {
    const mark = "radica_log_generation";
    if (localStorage.getItem(mark) === CURRENT.log) return;
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("freenet_log_")) continue;
      const name = k.slice("freenet_log_".length);
      try {
        const entries = JSON.parse(localStorage.getItem(k) || "{}") as Record<string, LogEntry>;
        if (name.startsWith("inbox/")) this.keepDmHistory(name.slice("inbox/".length), Object.values(entries));
        localStorage.setItem(k, JSON.stringify(compactLog(name, entries)));
      } catch {}
    }
    this.logs.clearCache();
    localStorage.setItem(mark, CURRENT.log);
  }

  /** Conversations' entries from before each had a log of its own: read-only history, apart from the inbox. */
  private keepDmHistory(owner: string, entries: LogEntry[]): void {
    const key = `freenet_dm_history_${owner}`;
    const have = { ...this.readJson<Record<string, LogEntry>>(key, "{}") };
    for (const e of entries) if (isDmEntry(e)) have[`${e.author}:${e.id}`] = e;
    localStorage.setItem(key, JSON.stringify(have));
  }

  private dmHistory(): LogEntry[] {
    return Object.values(this.readJson<Record<string, LogEntry>>(`freenet_dm_history_${this.me}`, "{}"));
  }

  /** The conversations the history holds, listed and shown. */
  private applyDmHistory(): void {
    const rooms = new Set<string>();
    for (const e of this.dmHistory()) {
      try {
        const m = JSON.parse(e.body).message;
        const peer = m && typeof m.room_id === "string" ? dmPeerOf(m.room_id, this.me) : null;
        if (!peer || m.sender !== e.author || this.isBlocked(peer)) continue;
        rooms.add(m.room_id);
        if (isSecretRoomId(m.room_id)) this.addSecretChatPeer(this.me, peer, e.ts);
        else this.addChatPeer(this.me, peer, e.ts);
      } catch {}
    }
    for (const r of rooms) this.applyDm(r);
  }

  /** The history as the previous inbox holds it, read once per device (a device that never cached it has none). */
  private async loadDmHistory(): Promise<void> {
    const mark = `radica_dm_history_${this.me}`;
    if (localStorage.getItem(mark)) return;
    const old = await this.net.legacy<{ entries?: Record<string, LogEntry> }>(`log:inbox/${this.me}`).catch(() => null);
    if (!old) return; // unreachable now: tried again next session
    this.keepDmHistory(this.me, Object.values(old.entries ?? {}));
    localStorage.setItem(mark, "1");
    this.applyDmHistory();
    this.notifyListeners();
  }

  /** Which log a chat room lives in: every room and conversation in its own log. */
  private logOfRoom(roomId: string): string {
    if (roomId.startsWith("privroom_")) return `room/${roomId}`;
    if (this.me && dmPeerOf(roomId, this.me)) return `dm/${roomId}`; // a direct message or Secret Chat: its own log
    return `inbox/${this.me}`;
  }

  // Update user profile info
  public async updateProfile(
    identity: UserIdentity,
    displayName: string,
    bio: string,
    avatarUrl: string
  ): Promise<ProfileInfo> {
    const updatedAt = Date.now();
    const sig = await identity.sign(profileMsg4(identity.pubkey, { display_name: displayName, bio, avatar_url: avatarUrl, enc_pub: identity.encPub, updated_at: updatedAt }));

    const profile: ProfileInfo = {
      display_name: displayName,
      bio,
      avatar_url: avatarUrl,
      enc_pub: identity.encPub,
      updated_at: updatedAt,
      sig,
      cert: identity.cert,
      v: 3,
    };

    const feed = await this.getFeed(identity.pubkey);
    feed.profile = profile;
    await this.saveFeed(feed, { owner: feed.owner, posts: {}, following: [], profile });
    return profile;
  }

  public async publishPost(
    identity: UserIdentity,
    category: PostCategory,
    caption: string,
    mediaUri?: string,
    location?: string,
    eventDate?: string,
    communityId?: string,
    isNsfw?: boolean,
    nsfwScore?: number,
    powProof?: PoWProof
  ): Promise<Post> {
    // the proof was ground against its own timestamp, which the post must then carry
    const timestamp = powProof ? Number(powProof.challenge.split(":").pop()) : Date.now();
    const id = postIdWithPow(timestamp, powProof);
    const post: Post = {
      id,
      author: identity.pubkey,
      category,
      caption,
      community_id: communityId,
      media_uri: mediaUri && (await Promise.all(mediaUris(mediaUri).map((u) => this.mediaRefOf(u)))).join(" "),
      location,
      event_date: eventDate,
      is_nsfw: !!isNsfw,
      timestamp,
      sig: "",
      likes: {},
      comments: {},
      nsfw_score: nsfwScore,
      cert: identity.cert,
      pow: powProof,
      v: 3,
    };
    post.sig = await identity.sign(postMsg3(post));

    const feed = await this.getFeed(identity.pubkey);
    feed.posts[id] = post;
    await this.saveFeed(feed, { owner: feed.owner, posts: { [id]: post }, following: [] });
    this.cachePeerPost(id, post);
    this.broadcast({ type: "post", post });
    void this.notifyMentions(caption, id, identity.pubkey);
    // a repost tells the author of the post it shares, unless the caption already mentions them
    const shared = repostRef(caption);
    if (shared && !mentionsIn(caption).includes(shared.author))
      void this.addNotification(shared.author, { type: "mention", from: this.me, text: "reposted your post", linkPostId: id, linkPostOwner: identity.pubkey }).catch((e) => console.warn("[Freenet] repost:", e));
    return post;
  }

  /** An image goes to its own contract and the post names it (the feed stays small). Offline or refused: the image
   *  stays in the post, as before. */
  private async mediaRefOf(uri?: string): Promise<string | undefined> {
    const bytes = uri && this.isConnected ? dataUrlBytes(uri) : null;
    if (!bytes) return uri;
    try {
      const hash = await this.net.putMedia(bytes);
      keepMedia(hash, bytes); // shown at once, not fetched back
      return MEDIA_PREFIX + hash;
    } catch (e) {
      console.warn("[Freenet] Could not publish the image on its own, keeping it in the post:", e);
      return uri;
    }
  }

  /** An image a post names (see media.ts). */
  /** The name and bio a Viso persona published in Viso, checked against its key; null for a local key or no profile. */
  public visoProfile(pubkey: string): Promise<{ name: string; bio: string } | null> {
    return this.net
      .visoIdentity(pubkey)
      .then((state) => (state ? visoProfileOf(state, pubkey) : null))
      .catch(() => null);
  }

  /** The GhostKey proof a Viso persona linked in Viso (unchecked), or null. */
  public visoGhostkey(pubkey: string): Promise<string | null> {
    return this.net
      .visoIdentity(pubkey)
      .then((state) => (state ? visoGhostkeyOf(state) : null))
      .catch(() => null);
  }

  /** Verified Viso persona delegation (`pubkey` -> active Viso persona), from local durable storage or the `"delegations"` log. */
  public async visoDelegationOf(
    pubkey: string,
  ): Promise<{ raw: DelegationProofV1; verified: VerifiedDelegation } | null> {
    const localRaw = localStorage.getItem(`radica_delegation_${pubkey}`);
    if (localRaw) {
      try {
        const parsed = JSON.parse(localRaw) as DelegationProofV1;
        const verified = await verifyVisoDelegation(parsed, pubkey);
        if (verified) return { raw: parsed, verified };
      } catch {}
    }
    const entry = this.delegationProofs().find((d) => d.author === pubkey && d.proof);
    if (!entry?.proof) return null;
    const verified = await verifyVisoDelegation(entry.proof, pubkey).catch(() => null);
    return verified ? { raw: entry.proof, verified } : null;
  }

  /** Verified Viso delegation map for all authors on the `"delegations"` log. */
  public verifiedDelegationMap(): Promise<Map<string, VerifiedDelegation>> {
    return verifiedDelegations(this.delegationProofs());
  }

  /** Verified Viso Proof-of-Personhood badges published on `pubkey`'s Viso contract (or via a verified Viso delegation). */
  public async visoPoh(pubkey: string): Promise<PohBadge[]> {
    try {
      const state = await this.net.visoIdentity(pubkey);
      if (state) {
        const direct = await visoPohOf(state, pubkey);
        if (direct.length) return direct;
      }
      const del = await this.visoDelegationOf(pubkey);
      if (!del) return [];
      const targetState = await this.net.visoIdentity(del.verified.toHex);
      return targetState ? await visoPohOf(targetState, del.verified.toHex) : [];
    } catch {
      return [];
    }
  }

  /** Resolve and verify `poh:<provider>` slot bytes (hex) from `pubkey` or its verified Viso delegation target.
   *  When `slot` is omitted, checks `["poh:github", "poh:google"]` in order and returns the first verified proof. */
  public async visoPohResolved(
    pubkey: string,
    slot?: string,
  ): Promise<{ proofHex: string; badge: PohBadge; delegation?: DelegationProofV1 } | null> {
    const slots = slot ? [slot] : ["poh:github", "poh:google"];
    try {
      const state = await this.net.visoIdentity(pubkey);
      if (state) {
        for (const s of slots) {
          const raw = visoPohRawOf(state, s);
          if (raw) {
            const badge = await verifyVisoPoh(raw, pubkey);
            if (badge) return { proofHex: bytesToHex(raw), badge };
          }
        }
      }
      const del = await this.visoDelegationOf(pubkey);
      if (!del) return null;
      const targetState = await this.net.visoIdentity(del.verified.toHex);
      if (!targetState) return null;
      for (const s of slots) {
        const targetRaw = visoPohRawOf(targetState, s);
        if (targetRaw) {
          const badge = await verifyVisoPoh(targetRaw, del.verified.toHex);
          if (badge) return { proofHex: bytesToHex(targetRaw), badge, delegation: del.raw };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Raw CBOR `poh:<provider>` slot bytes (hex) from `pubkey`'s Viso identity contract (or delegated target), or null. */
  public visoPohHex(pubkey: string, slot = "poh:github"): Promise<string | null> {
    return this.visoPohResolved(pubkey, slot).then((r) => r?.proofHex ?? null);
  }

  /** Verified PoH authors from Radica's public `"poh"` log. */
  public verifiedPohAuthors(): Promise<string[]> {
    return verifiedPohs(this.pohProofs());
  }

  /** Verified Viso `ante` commitment bits published on `pubkey`'s Viso contract (or via a verified Viso delegation). */
  public async visoAnte(pubkey: string): Promise<number | null> {
    try {
      const state = await this.net.visoIdentity(pubkey);
      if (state) {
        const direct = await visoAnteBits(state, pubkey);
        if (direct !== null) return direct;
      }
      const del = await this.visoDelegationOf(pubkey);
      if (!del) return null;
      const targetState = await this.net.visoIdentity(del.verified.toHex);
      return targetState ? await visoAnteBits(targetState, del.verified.toHex) : null;
    } catch {
      return null;
    }
  }

  public getMedia(hash: string): Promise<Uint8Array | null> {
    const local = this.offlineMedia.get(hash);
    if (local) return Promise.resolve(local);
    return this.isConnected ? this.net.getMedia(hash) : Promise.resolve(null);
  }

  /** Publish raw or E2EE-sealed attachment bytes to `media-contract` (up to 768 KB), returning its BLAKE3 hash. */
  public async putMedia(bytes: Uint8Array): Promise<string> {
    if (this.isConnected) return await this.net.putMedia(bytes);
    const hash = mediaHashOf(bytes);
    this.offlineMedia.set(hash, bytes);
    return hash;
  }

  // Delete a post
  public async deletePost(identity: UserIdentity, postId: string): Promise<boolean> {
    const feed = await this.getFeed(identity.pubkey);
    // tombstone even when the post is not in the local copy yet: the network may still hold it
    delete feed.posts[postId];
    delete this.peerCache[postId];
    const sig = await identity.sign(deleteMsg3(identity.pubkey, postId));
    feed.deleted = { ...feed.deleted, [postId]: { sig, cert: identity.cert, v: 3 } };
    await this.saveFeed(feed, { owner: feed.owner, posts: {}, following: [], deleted: { [postId]: feed.deleted[postId] } });
    return true;
  }

  // Add comment to a post
  public async addComment(
    identity: UserIdentity,
    postAuthorPubkey: string,
    postId: string,
    text: string,
    withPow = true
  ): Promise<Comment> {
    const timestamp = Date.now();
    // readers hide a newcomer's comment without its proof (pow.ts)
    const proof = withPow ? await solvePoW(identity.pubkey, timestamp, COMMENT_POW_BITS, "comment") : undefined;
    const commentId = postIdWithPow(timestamp, proof, "comment");
    const comment: Comment = { id: commentId, post_id: postId, author: identity.pubkey, text, timestamp, sig: "", cert: identity.cert, v: 3 };
    await this.signComment(identity, postAuthorPubkey, comment);

    const feed = await this.getFeed(postAuthorPubkey);
    if (feed.posts[postId]) {
      const existingComments = Object.values(feed.posts[postId].comments || {}).filter((c) => c && c.text !== "");
      const previousCommenters = new Set(
        existingComments
          .map((c) => c.author)
          .filter((author) => author && author !== identity.pubkey && author !== postAuthorPubkey)
      );

      feed.posts[postId].comments[`${identity.pubkey}:${commentId}`] = comment;
      const post = { ...feed.posts[postId], likes: {}, comments: { [`${identity.pubkey}:${commentId}`]: comment } };
      await this.saveFeed(feed, { owner: feed.owner, posts: { [postId]: post }, following: [] });

      // Track that I commented on this post so future replies will notify me
      this.trackCommentedPost(identity.pubkey, postId, postAuthorPubkey, timestamp);

      // Trigger notification if commenting on someone else's post
      if (identity.pubkey !== postAuthorPubkey) {
        await this.addNotification(postAuthorPubkey, {
          type: "comment",
          from: identity.pubkey,
          text: `commented: "${text.substring(0, 35)}..."`,
          linkPostId: postId,
          linkPostOwner: postAuthorPubkey,
        });
      }

      // Also notify all other participants who commented on this post thread
      for (const commenter of previousCommenters) {
        await this.addNotification(commenter, {
          type: "comment",
          from: identity.pubkey,
          text: `replied to a post you commented on: "${text.substring(0, 35)}..."`,
          linkPostId: postId,
          linkPostOwner: postAuthorPubkey,
        });
      }

      void this.notifyMentions(text, postId, postAuthorPubkey, [postAuthorPubkey, ...previousCommenters]); // the post's author and other commenters already hear of the comment
    }
    return comment;
  }

  /** Take back one of my comments. The feed contract has no deletion, but it replaces a comment with a new version
   *  of the same author and id whose signature sorts higher, so every node keeps the same one: an empty version
   *  (a comment is never empty otherwise) stands for "deleted" and is not shown. */
  public async deleteComment(identity: UserIdentity, postAuthor: string, postId: string, key: string): Promise<boolean> {
    const feed = await this.getFeed(postAuthor);
    const post = feed.posts[postId];
    const old = post?.comments[key];
    if (!old || old.author !== identity.pubkey || old.text === "") return false;
    for (let ts = Math.max(Date.now(), old.timestamp + 1), tries = 0; tries < 64; ts++, tries++) {
      const c: Comment = { ...old, text: "", timestamp: ts, cert: identity.cert, sig: "", v: 3 };
      await this.signComment(identity, postAuthor, c);
      if (c.sig <= old.sig) continue; // signatures are deterministic: another timestamp gives another one
      post.comments[key] = c;
      await this.saveFeed(feed, { owner: feed.owner, posts: { [postId]: { ...post, likes: {}, comments: { [key]: c } } }, following: [] });
      return true;
    }
    return false;
  }

  /** Change the text of one of my comments. As for a delete, the contract keeps the version of the same author and id
   *  whose signature sorts higher; here the id and timestamp stay (they carry the anti-bot proof readers check), so
   *  only the nonce changes until the signature sorts above the current one. */
  public async editComment(identity: UserIdentity, postAuthor: string, postId: string, key: string, text: string): Promise<boolean> {
    const feed = await this.getFeed(postAuthor);
    const post = feed.posts[postId];
    const old = post?.comments[key];
    if (!old || old.author !== identity.pubkey || old.text === "" || !text.trim() || text === old.text) return false;
    const owner = identity.pubkey === postAuthor;
    for (let nonce = (old.nonce ?? 0) + 1, tries = 0; tries < 64; nonce++, tries++) {
      const c: Comment = { ...old, text, cert: identity.cert, sig: "", v: 3, nonce };
      // on someone else's feed every nonce tried must also pay the proof of work
      if (!owner) c.nonce = nonce = grindNonce((n) => commentMsg3(postAuthor, { ...c, nonce: n }), nonce);
      c.sig = await identity.sign(commentMsg3(postAuthor, c));
      if (c.sig <= old.sig) continue;
      post.comments[key] = c;
      await this.saveFeed(feed, { owner: feed.owner, posts: { [postId]: { ...post, likes: {}, comments: { [key]: c } } }, following: [] });
      return true;
    }
    return false;
  }

  /** Sign a v3 comment on `owner`'s feed: on someone else's feed the contract wants a proof of work first. */
  private async signComment(identity: UserIdentity, owner: string, c: Comment): Promise<void> {
    c.nonce = identity.pubkey === owner ? 0 : grindNonce((nonce) => commentMsg3(owner, { ...c, nonce }));
    c.sig = await identity.sign(commentMsg3(owner, c));
  }

  // Like or unlike a post
  public async toggleLike(identity: UserIdentity, postAuthorPubkey: string, postId: string): Promise<boolean> {
    const feed = await this.getFeed(postAuthorPubkey);
    if (!feed.posts[postId]) return false;

    const post = feed.posts[postId];
    const liked = !post.likes?.[identity.pubkey]?.liked;
    const ts = Date.now();
    const nonce = identity.pubkey === postAuthorPubkey ? 0 : grindNonce((n) => likeMsg3(postAuthorPubkey, postId, identity.pubkey, { liked, ts, nonce: n }));
    const sig = await identity.sign(likeMsg3(postAuthorPubkey, postId, identity.pubkey, { liked, ts, nonce }));
    post.likes = { ...post.likes, [identity.pubkey]: { liked, ts, sig, cert: identity.cert, v: 3, nonce } };
    if (liked && identity.pubkey !== postAuthorPubkey) {
      // Trigger notification if liking someone else's post
      await this.addNotification(postAuthorPubkey, {
        type: "like",
        from: identity.pubkey,
        text: "liked your post.",
        linkPostId: postId,
      });
    }
    await this.saveFeed(feed, { owner: feed.owner, posts: { [postId]: { ...post, comments: {}, likes: { [identity.pubkey]: post.likes[identity.pubkey] } } }, following: [] });
    return liked;
  }

  // Follow or unfollow a user
  public async toggleFollow(identity: UserIdentity, targetPubkey: string): Promise<boolean> {
    const feed = await this.getFeed(identity.pubkey);
    const index = feed.following.indexOf(targetPubkey);
    let following = false;
    if (index >= 0) {
      feed.following.splice(index, 1);
      following = false;
    } else {
      feed.following.push(targetPubkey);
      following = true;

      // Trigger notification
      await this.addNotification(targetPubkey, {
        type: "follow",
        from: identity.pubkey,
        text: "started following your persona.",
      });
    }
    feed.following_updated_at = Date.now();
    feed.following_cert = identity.cert;
    feed.following_v = 3;
    feed.following_sig = await identity.sign(followingMsg3(identity.pubkey, feed.following_updated_at, feed.following));
    const { following_updated_at, following_sig, following_cert, following_v } = feed;
    await this.saveFeed(feed, { owner: feed.owner, posts: {}, following: [...feed.following], following_updated_at, following_sig, following_cert, following_v });
    return following;
  }

  // Aggregate timeline: own posts + followed users' posts sorted by timestamp
  public async getTimeline(identity: UserIdentity): Promise<Post[]> {
    const myFeed = await this.getFeed(identity.pubkey);
    const postMap: Record<string, Post> = { ...myFeed.posts };

    const peerPostsList = await Promise.all(myFeed.following.map((pk) => this.peerPosts(pk)));
    const livePosts = Object.values(this.peerCache);
    for (let i = 0; i < myFeed.following.length; i++) {
      const followedPubkey = myFeed.following[i];
      for (const p of peerPostsList[i]) postMap[p.id] = p;
      for (const p of livePosts) {
        if (p.author === followedPubkey && !postMap[p.id]) { // a live copy is older than the feed's: it misses later comments
          postMap[p.id] = p;
        }
      }
    }

    return Object.values(postMap).sort((a, b) => b.timestamp - a.timestamp);
  }

  // Global Explore feed: all posts published by any persona on the network
  /** The proof of work my directory hello carries, made once a session (and again after a day). */
  private helloProof?: { pk: string; p: Promise<{ ts: number; nonce: number }> };
  private async helloPow(pk: string): Promise<{ ts: number; nonce: number }> {
    if (this.helloProof?.pk !== pk) {
      this.helloProof = { pk, p: (async () => { const ts = Date.now(); return { ts, nonce: (await solvePoW(pk, ts, ANNOUNCE_POW_BITS, "hello")).nonce }; })() };
    }
    const proof = await this.helloProof.p;
    if (Date.now() - proof.ts > 864e5) {
      this.helloProof = undefined;
      return this.helloPow(pk);
    }
    return proof;
  }

  /** Places in an Explore for newcomers: drawn by weight (see logfold.ts laneSample), the same draw for this whole session. */
  private laneSeed = Math.random().toString(36).slice(2);

  /**
   * Everyone's posts for the Explore: the people I follow and `prefer` (my network: friends of friends, supporters,
   * GhostKeys) always, and a fixed lane of newcomers beside them. Announcing is free, so who takes the lane's places is a
   * draw weighted by the work in each announcement, never "the latest": a flood of new identities fills the lane at
   * most, and the rest of the feed is out of its reach.
   */
  /** "My circle only" (Settings): Explore fetches and shows only the people I follow. */
  public circleOnly = false;

  public async getExploreTimeline(identity: UserIdentity, opts: { prefer?: string[]; skip?: (pubkey: string) => boolean } = {}): Promise<Post[]> {
    const myFeed = await this.getFeed(identity.pubkey);
    const postMap: Record<string, Post> = { ...this.peerCache, ...myFeed.posts }; // feed copies win: a live copy misses later comments

    const core = new Set([...myFeed.following, ...(opts.prefer ?? []).slice(0, 40)]);
    const lane = () => {
      const pool = Object.keys(this.knownPeers).filter((k) => k !== identity.pubkey && !core.has(k) && /^[0-9a-f]{64}$/.test(k) && !opts.skip?.(k));
      return laneSample(pool, directoryWeights(this.logEntries("directory")), 30, this.laneSeed); // shortcut: no paging
    };
    const keys = explorePeerKeys(myFeed.following, opts.prefer ?? [], lane, this.circleOnly);
    const peers = await Promise.all(keys.map((k) => this.peerPosts(k)));
    for (const posts of peers) for (const p of posts) postMap[p.id] = p;
    const mine = new Set([identity.pubkey, ...myFeed.following]);
    const shown = Object.values(postMap).filter((p) => !this.circleOnly || mine.has(p.author)); // a profile I opened leaves its posts in peerCache

    return shown.sort((a, b) => b.timestamp - a.timestamp);
  }

  public getDiscoveredPeers(myPubkey: string): { pubkey: string; name: string }[] {
    const list: { pubkey: string; name: string }[] = [];
    for (const [pk, prof] of Object.entries(this.knownPeers)) {
      if (pk !== myPubkey) {
        list.push({ pubkey: pk, name: prof.display_name || `Persona @${personaName(pk).substring(0, 6)}` });
      }
    }
    return list;
  }

  // ---- 1-on-1 P2P Chat ----

  public getRoomId(pkA: string, pkB: string): string {
    return pkA < pkB ? `${pkA}:${pkB}` : `${pkB}:${pkA}`;
  }

  /** Posts where I left a comment: tracked so we can detect replies by others. */
  public trackCommentedPost(myPubkey: string, postId: string, postAuthor: string, timestamp = Date.now()): void {
    const key = `freenet_commented_posts_${myPubkey}`;
    const tracked: Record<string, { postAuthor: string; lastSeen: number }> = JSON.parse(localStorage.getItem(key) || "{}");
    const existing = tracked[postId];
    tracked[postId] = {
      postAuthor,
      lastSeen: Math.max(existing?.lastSeen ?? 0, timestamp),
    };
    localStorage.setItem(key, JSON.stringify(tracked));
  }

  /** Scan known posts and feeds for replies to posts I commented on. True if fresh notifications were stored. */
  public async syncCommentedPosts(identity: UserIdentity): Promise<boolean> {
    const key = `freenet_commented_posts_${identity.pubkey}`;
    const tracked: Record<string, { postAuthor: string; lastSeen: number }> = JSON.parse(localStorage.getItem(key) || "{}");

    // Automatically discover posts where I commented from peerCache
    for (const post of Object.values(this.peerCache)) {
      if (!post || !post.id || !post.comments) continue;
      const myComments = Object.values(post.comments).filter((c) => c && c.author === identity.pubkey && c.text !== "");
      if (myComments.length > 0 && !tracked[post.id]) {
        const myLatest = myComments.reduce((max, c) => Math.max(max, c.timestamp), 0);
        tracked[post.id] = { postAuthor: post.author, lastSeen: myLatest };
      }
    }

    let fresh = false;
    for (const [postId, meta] of Object.entries(tracked)) {
      if (!postId || !meta?.postAuthor) continue;
      let post: Post | undefined = this.peerCache[postId];
      if (!post) {
        try {
          const feed = await this.getFeed(meta.postAuthor);
          post = feed.posts?.[postId];
          if (post) this.cachePeerPost(postId, post);
        } catch {}
      }
      if (!post || !post.comments) continue;

      const comments = Object.values(post.comments).filter((c) => c && c.text !== "");
      const replies = comments.filter((c) => c.author && c.author !== identity.pubkey && c.timestamp > (meta.lastSeen || 0));
      if (replies.length > 0) {
        fresh = true;
        for (const r of replies) {
          const notifId = `reply_${postId}_${r.id}`;
          this.storeNotification(identity.pubkey, {
            id: notifId,
            type: "comment",
            from: r.author,
            text: `replied to a post you commented on: "${r.text.substring(0, 35)}..."`,
            linkPostId: postId,
            linkPostOwner: meta.postAuthor,
            timestamp: r.timestamp,
            read: false,
          });
        }
        meta.lastSeen = Math.max(meta.lastSeen || 0, ...replies.map((r) => r.timestamp));
      }
    }

    localStorage.setItem(key, JSON.stringify(tracked));
    return fresh;
  }

  /** Sync group messages for all private rooms where I am a member (archived River rooms have none):
   *  refreshes room logs, establishes a read baseline for
   *  newly discovered rooms, and stores chat notifications for incoming messages.
   *  True when new messages arrived. */
  public async syncPrivateRooms(identity: UserIdentity, activeRoomId?: string | null): Promise<boolean> {
    const eligible = this.storedPrivateRooms().filter((r) => !r.river && !!r.members?.includes(identity.pubkey));
    if (!eligible.length) return false;
    let fresh = false;
    await Promise.allSettled(
      eligible.map(async (room) => {
        try {
          if (this.isConnected) await this.refreshLog(`room/${room.id}`);
          const msgs = await this.getPrivateRoomChatMessages(identity, room);
          const lastSeen = localReadMarks(localStorage)[room.id];
          if (lastSeen === undefined) {
            // a room seen for the first time: its history is not news
            seedReadMark(localStorage, room.id, msgs.reduce((max, m) => Math.max(max, m.timestamp), 0) || Date.now());
          } else if (room.id !== activeRoomId) {
            const newMsgs = msgs.filter((m) => m.sender && m.sender !== identity.pubkey && m.timestamp > lastSeen);
            if (newMsgs.length > 0) {
              fresh = true;
              for (const m of newMsgs) {
                this.storeNotification(identity.pubkey, {
                  id: `prmsg_${m.id}`,
                  type: "chat",
                  from: m.sender,
                  text: "sent a message in an encrypted Private Room",
                  linkRoomId: room.id,
                  timestamp: m.timestamp,
                  read: false,
                });
              }
            }
          }
        } catch (e) {
          console.warn("[PrivateRoom] Could not sync room messages", room.id, e);
        }
      }),
    );
    return fresh;
  }

  public async sendChatMessage(
    identity: UserIdentity,
    recipientPubkey: string,
    text: string,
    replyTo?: string
  ): Promise<ChatMessage> {
    const roomId = this.getRoomId(identity.pubkey, recipientPubkey);
    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = Date.now();

    // 1-on-1 direct messages are end-to-end encrypted with X25519 ECDH + AES-256-GCM, to the key the recipient
    // published in their profile (a Viso user's app key) or else to their persona key
    await Promise.all([this.keysFresh(recipientPubkey), this.keysFresh(identity.pubkey)]);
    const [toEncPub, peerEncs, myEncs] = await Promise.all([
      this.encPubOf(recipientPubkey),
      this.encPubsOf(recipientPubkey),
      this.encPubsOf(identity.pubkey),
    ]);
    const encryptedText = await encryptDirectMessage(identity.secretKey, toEncPub, text);
    // the recipient's other devices and mine: each gets its own copy (old clients read `text`, encrypted as before)
    const others = [...new Set([...peerEncs, ...myEncs])].filter(
      (k) => k !== toEncPub && k !== identity.encPub
    );
    const copies = Object.fromEntries(await Promise.all(others.map(async (k) => [k, await encryptDirectMessage(identity.secretKey, k, text)])));

    const sigMsg = formatChatMessageSignatureMessage(id, roomId, identity.pubkey, recipientPubkey, encryptedText, timestamp);
    const sig = await identity.sign(sigMsg);

    const message: ChatMessage = {
      id,
      room_id: roomId,
      sender: identity.pubkey,
      recipient: recipientPubkey,
      text: encryptedText,
      timestamp,
      sig,
      enc_pub: identity.encPub,
      to_enc_pub: toEncPub,
      ...(others.length ? { copies } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    };

    // Store in room messages (ciphertext stored at rest)
    const roomKey = `freenet_chat_${roomId}`;
    const raw = localStorage.getItem(roomKey);
    const messages: ChatMessage[] = raw ? JSON.parse(raw) : [];
    messages.push(message);
    localStorage.setItem(roomKey, JSON.stringify(messages));

    // Track active chat peers for both sender and recipient
    this.addChatPeer(identity.pubkey, recipientPubkey);
    this.addChatPeer(recipientPubkey, identity.pubkey);
    this.broadcast({ type: "chat", message });
    await this.chatAppend(roomId, { type: "chat", message });

    // Return message with decrypted plaintext for the local caller
    return {
      ...message,
      text,
    };
  }

  private plainCache = new Map<string, string>();
  /** Decrypted text kept per ciphertext: every chat redraw would decrypt the whole history again. In memory only. */
  private async plain(key: string, decrypt: () => Promise<string>): Promise<string> {
    const hit = this.plainCache.get(key);
    if (hit !== undefined) return hit;
    const p = await decrypt();
    // ponytail: never cache failed decryptions ("[Encrypted...") so late-arriving read-keys can decrypt on retry
    if (!p.startsWith("[Encrypted")) this.plainCache.set(key, p);
    return p;
  }

  public async getChatMessages(identity: UserIdentity, peerPubkey: string): Promise<ChatMessage[]> {
    await this.readKeysReady;
    void this.refreshLog(`inbox/${identity.pubkey}`);
    const roomId = this.getRoomId(identity.pubkey, peerPubkey);
    void this.refreshLog(`dm/${roomId}`);
    const messages = this.visibleChat(roomId);

    // Decrypt messages asynchronously using peer's pubkey
    const mine = [identity.encPub, ...(await readEncPubs())]; // keys this device used before too
    const decryptedList = await Promise.all(
      messages.map(async (msg) => {
        // a copy encrypted to this device's key, by the sender's key
        const k = mine.find((x) => msg.copies?.[x]);
        const copy = k && msg.copies![k];
        if (copy && msg.enc_pub) return { ...msg, text: await this.plain(`${identity.pubkey}|${msg.enc_pub}|${copy}`, () => decryptDirectMessage(identity.secretKey, msg.enc_pub!, copy)) };
        if (msg.text && msg.text.startsWith("e2e:")) {
          const other = msg.sender === identity.pubkey ? msg.to_enc_pub || peerPubkey : msg.enc_pub || msg.sender;
          return { ...msg, text: await this.plain(`${identity.pubkey}|${other}|${msg.text}`, () => decryptDirectMessage(identity.secretKey, other, msg.text)) };
        }
        return msg;
      })
    );
    return decryptedList;
  }

  /** Decrypt a single chat message (for previews or hydration) without fetching the whole room log. */
  public async decryptChatMessage(
    identity: UserIdentity,
    msg: ChatMessage,
    peerPubkey?: string,
    roomId?: string
  ): Promise<ChatMessage> {
    if (!msg || !msg.text) return msg;
    if (msg.copies || msg.text.startsWith("e2e:")) {
      const mine = [identity.encPub, ...(await readEncPubs())];
      const k = mine.find((x) => msg.copies?.[x]);
      const copy = k && msg.copies![k];
      if (copy && msg.enc_pub) {
        return { ...msg, text: await this.plain(`${identity.pubkey}|${msg.enc_pub}|${copy}`, () => decryptDirectMessage(identity.secretKey, msg.enc_pub!, copy)) };
      }
      if (msg.text.startsWith("e2e:")) {
        const other = msg.sender === identity.pubkey ? msg.to_enc_pub || peerPubkey : msg.enc_pub || msg.sender;
        if (other) {
          return { ...msg, text: await this.plain(`${identity.pubkey}|${other}|${msg.text}`, () => decryptDirectMessage(identity.secretKey, other, msg.text)) };
        }
      }
    }
    if (roomId && msg.text.startsWith("sym:")) {
      const room = this.storedPrivateRooms().find((r) => r.id === roomId);
      if (room && !room.river) {
        const roomKey = await this.getPrivateRoomKey(identity, room);
        if (roomKey) {
          return { ...msg, text: await this.plain(`sym|${identity.pubkey}|${room.id}|${msg.text}`, () => decryptWithSymmetricKey(roomKey, msg.text)) };
        }
      }
    }
    return msg;
  }

  public getChatPeers(myPubkey: string): string[] {
    void this.refreshLog(`inbox/${myPubkey}`);
    const key = `freenet_chat_peers_${myPubkey}`;
    const raw = localStorage.getItem(key);
    const blocked = this.blockedBy(myPubkey);
    return (raw ? JSON.parse(raw) : []).filter((p: string) => !blocked.has(p));
  }

  public getSecretRoomId(userA: string, userB: string): string {
    return getSecretRoomId(userA, userB);
  }

  public isSecretRoomId(roomId: string): boolean {
    return isSecretRoomId(roomId);
  }

  public getSecretChatPeers(myPubkey: string): string[] {
    void this.refreshLog(`inbox/${myPubkey}`);
    return this.storedSecretChatPeers(myPubkey);
  }

  /** Secret Chat peers as stored, without asking the network for news. */
  public storedSecretChatPeers(myPubkey: string): string[] {
    return secretChatPeers(this.secretTransport, myPubkey);
  }

  public addSecretChatPeer(myPubkey: string, peerPubkey: string, ts?: number): void {
    addSecretChatPeer(this.secretTransport, myPubkey, peerPubkey, ts);
  }

  public removeSecretChatPeer(myPubkey: string, peerPubkey: string): void {
    removeSecretChatPeer(this.secretTransport, myPubkey, peerPubkey);
  }

  /** Where Secret Chats are stored and delivered (secretChatTransport.ts). */
  private secretTransport: SecretChatTransport = {
    store: localStorage,
    blockedBy: (me) => this.blockedBy(me),
    visibleChat: (roomId) => this.visibleChat(roomId),
    deliver: async (entry) => {
      this.broadcast(entry);
      const e = entry as { roomId?: string; message?: { room_id?: string } };
      const room = e.roomId ?? e.message?.room_id;
      if (room) await this.chatAppend(room, entry); // the conversation's own log, as direct messages
    },
    encPubOf: async (k) => {
      await this.keysFresh(k);
      const fromProfile = await this.encPubOf(k);
      if (fromProfile !== k) return fromProfile;
      // their signed profile names their own key (a local identity): stale device entries must not override it
      const pr = (await this.getFeed(k)).profile;
      if (pr?.enc_pub === k && (await this.profileSigOk(k, pr))) return k;
      // no key in their profile (a new Viso persona may have no profile yet): the key their device published, as DMs do
      await this.refreshLog(`devices/${k}`);
      return this.deviceKeys(k, SECRET_DEVICE_TTL_MS).pop() ?? k; // the newest device still heard from
    },
    // the main key first, then the newest devices: each gets its own sealed copy (secretChatTransport.ts caps the count)
    encPubsOf: async (k) => {
      const main = await this.secretTransport.encPubOf(k);
      return [...new Set([main, ...this.deviceKeys(k, SECRET_DEVICE_TTL_MS).reverse()])];
    },
  };

  public getSecretChatTTL(roomId: string): number {
    return getActiveSecretChatTTL(roomId);
  }

  public setSecretChatTTL(roomId: string, ttlSeconds: number): void {
    setActiveSecretChatTTL(roomId, ttlSeconds);
  }

  /** Secret Chat sessions and timers are durable keys (durable.ts): a browser refresh must not lose them, or my own
   *  sent messages turn unreadable. Sign-in brings them back before any Secret Chat is read or written. */
  private secretReady: Promise<void> = Promise.resolve();

  // shortcut: reads the per-feature entry used before durable.ts (one release only); delete with the next release
  private async restoreSecretFromNode(): Promise<void> {
    const me = this.me;
    if (!me) return;
    const { nodeGet } = await import("./delegate.ts");
    let saved: { sessions?: SecretChatSession[]; ttls?: Record<string, number> };
    try {
      saved = JSON.parse((await nodeGet(`secret:${me}`)) || "{}");
    } catch {
      return;
    }
    const local = loadSecretChatSessions();
    for (const s of saved.sessions ?? []) {
      if (!s?.sessionId || s.myPubkey !== me || local[s.sessionId]) continue;
      saveSecretChatSession(s);
      this.addSecretChatPeer(me, s.peerPubkey, 1); // restoring a key is not a new message: a chat I removed stays removed
    }
    for (const [roomId, ttl] of Object.entries(saved.ttls ?? {}))
      if (!localStorage.getItem(`${ACTIVE_TTL_STORAGE_KEY}_${roomId}`)) setActiveSecretChatTTL(roomId, ttl);
    this.notifyListeners();
  }

  public async sendSecretChatMessage(
    identity: UserIdentity,
    recipientPubkey: string,
    text: string,
    ttlSeconds?: number,
    replyTo?: string,
    id?: string
  ): Promise<ChatMessage> {
    await this.secretReady; // a session made before the saved one is back would replace it
    return sendSecretChatMessage(this.secretTransport, identity, recipientPubkey, text, ttlSeconds, replyTo, id);
  }

  public async getSecretChatMessages(identity: UserIdentity, peerPubkey: string): Promise<ChatMessage[]> {
    const roomId = getSecretRoomId(identity.pubkey, peerPubkey);
    void this.refreshLog(`inbox/${identity.pubkey}`);
    void this.refreshLog(`dm/${roomId}`);
    await this.secretReady;
    return readSecretChat(this.secretTransport, identity, peerPubkey);
  }

  public async burnSecretMessage(
    roomId: string,
    messageId: string,
    peerPubkey?: string,
    opts?: { localOnly?: boolean }
  ): Promise<void> {
    burnSecretMessage(this.secretTransport, roomId, messageId, this.identity?.pubkey, peerPubkey, opts);
  }

  public sendTyping(roomId: string): void {
    if (!this.me) return;
    this.broadcast({ type: "chat_typing", roomId, sender: this.me, timestamp: Date.now() });
  }

  public onTyping(cb: (roomId: string, sender: string) => void): () => void {
    this.typingListeners.push(cb);
    return () => {
      this.typingListeners = this.typingListeners.filter((l) => l !== cb);
    };
  }

  public getPeerReadUpto(roomId: string, peerPubkey: string): number {
    try {
      return Number(safeStorage.getItem(`radica_peer_read_${roomId}_${peerPubkey}`) || 0);
    } catch {
      return 0;
    }
  }

  public savePeerReadUpto(roomId: string, peerPubkey: string, upto: number): void {
    const cur = this.getPeerReadUpto(roomId, peerPubkey);
    if (upto > cur) {
      safeStorage.setItem(`radica_peer_read_${roomId}_${peerPubkey}`, String(upto));
    }
  }

  public computeLogJoins(roomId: string, entries: LogEntry[]): ChatMessage[] {
    return computeLogJoins(roomId, entries as any);
  }

  /** Stored messages of a room, without those before the last time I cleared it. */
  /** When I last read each room, as stored in my own inbox log. */
  public readMarks(): Record<string, number> {
    return foldChatRead(this.logEntries(`inbox/${this.me}`), this.me);
  }

  public async markRoomRead(roomId: string, upto: number): Promise<void> {
    this.broadcast({ type: "chat_read", roomId, upto, sender: this.me });
    await this.logAppend(`inbox/${this.me}`, { type: "chat_read", room: roomId, upto });
    if (this.me) {
      const peer = dmPeerOf(roomId, this.me);
      if (peer) {
        void this.logAppend(`dm/${roomId}`, { type: "chat_read", room: roomId, upto }).catch(() => {}); // their read receipt
      }
    }
  }

  /** Messages in a room from other people newer than `since`. */
  public unreadCount(roomId: string, me: string, since: number): number {
    return this.visibleChat(roomId).filter((m) => m.sender !== me && m.timestamp > since).length;
  }

  private visibleChatCache = new Map<string, { stored: ChatMessage[]; cleared: number; burnedRaw: string | null; visible: ChatMessage[] }>();

  /** Do not change the returned list: it is shared until the room's stored messages or its clear mark change. */
  public visibleChat(roomId: string): ChatMessage[] {
    const cleared = Number(localStorage.getItem(`freenet_chat_cleared_${roomId}`) || 0);
    const stored = this.readJson<ChatMessage[]>(`freenet_chat_${roomId}`, "[]"); // the same array until the stored text changes
    const secret = isSecretRoomId(roomId) && this.me;
    const burnedRaw = secret ? localStorage.getItem(`radica_secret_burned_${this.me}`) : null;
    // the unread badge and the chat list ask for every conversation on each redraw: dedupe and sort once per change
    const hit = this.visibleChatCache.get(roomId);
    if (hit?.stored === stored && hit.cleared === cleared && hit.burnedRaw === burnedRaw) return hit.visible;
    const burned = burnedRaw && secret ? readBurnedSecretIds(localStorage, this.me) : null;
    const visible = dedupeChat(stored).filter((m) => m.timestamp > cleared && !burned?.has(m.id));
    this.visibleChatCache.set(roomId, { stored, cleared, burnedRaw, visible });
    return visible;
  }

  /** Archived River rooms are read-only: nothing to delete, edit or react to there. */
  private refuseRiverArchive(roomId: string): void {
    if (this.storedPrivateRooms().some((r) => r.id === roomId && r.river)) throw new Error("River rooms are retired: this one is a read-only archive.");
  }

  public async deleteChatMessage(roomId: string, messageId: string): Promise<void> {
    this.refuseRiverArchive(roomId);
    const roomKey = `freenet_chat_${roomId}`;
    const raw = localStorage.getItem(roomKey);
    if (raw) {
      const messages: ChatMessage[] = JSON.parse(raw);
      const filtered = messages.filter((m) => m.id !== messageId);
      localStorage.setItem(roomKey, JSON.stringify(filtered));
    }
    this.broadcast({ type: "chat_delete", roomId, messageId });
    await this.chatAppend(roomId, { type: "chat_delete", roomId, messageId });
    const deletedChatMsg = raw ? (JSON.parse(raw) as ChatMessage[]).find((m) => m.id === messageId) : undefined;
    if (deletedChatMsg?.text) revokeChatMediaInText(deletedChatMsg.text);
    this.notifyListeners();
  }

  public async editChatMessage(roomId: string, messageId: string, newText: string): Promise<void> {
    if (!this.identity) throw new Error("Not signed in");
    const identity = this.identity;
    // a Secret Chat edit is sealed like a message; sent as plain text it would sit in a public inbox log
    if (isSecretRoomId(roomId)) {
      await editSecretMessage(this.secretTransport, identity, peerFromSecretRoomId(roomId, identity.pubkey), messageId, newText);
      this.notifyListeners();
      return;
    }
    this.refuseRiverArchive(roomId);
    let encryptedText = newText;

    if (roomId.startsWith("privroom_")) {
      const rooms = await this.getPrivateRooms(identity);
      const room = rooms.find((r) => r.id === roomId);
      if (room && !room.river) {
        const roomKey = await this.getPrivateRoomKey(identity, room);
        if (roomKey) {
          encryptedText = await encryptWithSymmetricKey(roomKey, newText);
        }
      }
    } else {
      const dmPair = /^([0-9a-f]{64}):([0-9a-f]{64})$/.exec(roomId);
      if (dmPair) {
        const peer = dmPair[1] === this.me ? dmPair[2] : dmPair[1];
        if (peer) {
          const targetEncPub = await this.encPubOf(peer);
          encryptedText = await encryptDirectMessage(identity.secretKey, targetEncPub, newText);
        }
      }
    }
    // every chat goes out sealed or not at all
    if (encryptedText === newText) throw new Error("This message cannot be edited here");

    const roomKey = `freenet_chat_${roomId}`;
    const raw = localStorage.getItem(roomKey);
    const now = Date.now();
    if (raw) {
      const messages: ChatMessage[] = JSON.parse(raw);
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx >= 0 && messages[idx].sender === identity.pubkey) {
        messages[idx].text = encryptedText;
        messages[idx].edited_at = now;
        localStorage.setItem(roomKey, JSON.stringify(messages));
      }
    }

    this.broadcast({ type: "chat_edit", roomId, messageId, text: encryptedText });
    await this.chatAppend(roomId, { type: "chat_edit", roomId, messageId, text: encryptedText }).catch((e) =>
      console.warn("[Freenet] chat_edit log:", e)
    );
    this.notifyListeners();
  }

  /** Toggle my `emoji` on a message (a conversation's other side sees it in the conversation's own log). */
  public async reactToChatMessage(roomId: string, messageId: string, emoji: string, peer?: string): Promise<void> {
    this.refuseRiverArchive(roomId);
    const key = `freenet_chat_${roomId}`;
    const list: ChatMessage[] = JSON.parse(localStorage.getItem(key) || "[]");
    const m = list.find((x) => x.id === messageId);
    if (!m) return;
    const others = (m.reactions?.[emoji] ?? []).filter((a) => a !== this.me);
    const on = !(m.reactions?.[emoji] ?? []).includes(this.me);
    m.reactions = { ...m.reactions, [emoji]: on ? [...others, this.me] : others };
    if (!m.reactions[emoji].length) delete m.reactions[emoji];
    localStorage.setItem(key, JSON.stringify(list));
    const body = { type: "chat_react", roomId, messageId, emoji, on };
    await this.chatAppend(roomId, body);
    this.notifyListeners();
  }

  public async clearChatRoom(roomId: string): Promise<void> {
    // only my view: messages up to now stay hidden here, even when the network sends them again
    const upto = Date.now();
    localStorage.setItem(`freenet_chat_cleared_${roomId}`, String(upto));
    // a signed entry in my inbox: the clear holds on my other devices and after a new sign-in
    void this.logAppend(`inbox/${this.me}`, { type: "chat_clear", room: roomId, upto }).catch((e) => console.warn("[Freenet] chat_clear:", e));
    this.broadcast({ type: "chat_clear", roomId });
    this.notifyListeners();
  }

  public removeChatPeer(myPubkey: string, peerPubkey: string): void {
    const key = `freenet_chat_peers_${myPubkey}`;
    const raw = localStorage.getItem(key);
    let list: string[] = raw ? JSON.parse(raw) : [];
    list = list.filter((p) => p !== peerPubkey);
    localStorage.setItem(key, JSON.stringify(list));
    // the network log still holds their old messages: remember when I removed them so those do not bring them back
    const upto = Date.now();
    localStorage.setItem(`freenet_chat_removed_${myPubkey}_${peerPubkey}`, String(upto));
    void this.logAppend(`inbox/${myPubkey}`, { type: "chat_remove", peer: peerPubkey, upto }).catch((e) => console.warn("[Freenet] chat_remove:", e));
    this.notifyListeners();
  }

  /** Fetch the feeds of people whose name or avatar is not known yet (knownPeers lives in memory only); each feed is fetched at most once a minute. */
  public warmPeers(pubkeys: string[]): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const pk of pubkeys.slice(0, 30)) {
      const k = this.knownPeers[pk];
      if (pk === this.me || (k?.avatar_url && !k.display_name.startsWith("Persona @"))) continue;
      jobs.push(this.nameFromStoredFeed(pk)); // what an earlier visit kept: no network needed
      if (Date.now() - this.feeds.lastRefreshOf(pk) > LIVE_RECHECK_MS) jobs.push(this.refresh(pk, true)); // people with no avatar are not refetched every minute; forced past the chat pause but on the background queue: a feed nobody published holds its slot until the 45 s timeout, and in the foreground queue that stalls images and River rooms
    }
    return Promise.all(jobs).then(() => {});
  }

  private storedNameTried = new Set<string>();

  /** knownPeers lives in memory, but a person's feed (with their name and picture) is kept on disk: read the profile from it,
   *  in the worker, so a name does not wait for the network (a node slow to answer left chat showing their key). */
  private async nameFromStoredFeed(pk: string): Promise<void> {
    const raw = this.storedNameTried.has(pk) ? null : localStorage.getItem(`freenet_feed_${pk}`);
    this.storedNameTried.add(pk);
    if (!raw) return;
    const profile = (await lightFeedAsync(raw)).profile;
    if (!profile?.display_name && !profile?.avatar_url) return;
    const k = this.knownPeers[pk];
    if (k?.display_name && !k.display_name.startsWith("Persona @") && k.avatar_url) return; // learned meanwhile
    this.knownPeers[pk] = {
      display_name: profile.display_name || k?.display_name || `Persona @${personaName(pk).substring(0, 6)}`,
      avatar_url: profile.avatar_url || k?.avatar_url,
    };
    this.notifyListeners();
  }

  public isChatPeerRemoved(myPubkey: string, peerPubkey: string): boolean {
    return !!localStorage.getItem(`freenet_chat_removed_${myPubkey}_${peerPubkey}`);
  }

  /** `ts`: when the message that adds the peer was sent; a removal hides only messages up to the removal. */
  private addChatPeer(ownerPubkey: string, peerPubkey: string, ts = Date.now()): void {
    if (!ownerPubkey || !peerPubkey || peerPubkey === "community") return;
    if (this.blockedBy(ownerPubkey).has(peerPubkey)) return;
    const removedKey = `freenet_chat_removed_${ownerPubkey}_${peerPubkey}`;
    const removed = localStorage.getItem(removedKey);
    if (ts <= Number(removed ?? 0)) return;
    if (removed !== null) localStorage.removeItem(removedKey); // a newer message brings the conversation back (a write per inbox entry otherwise)
    const key = `freenet_chat_peers_${ownerPubkey}`;
    const raw = localStorage.getItem(key);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(peerPubkey)) {
      list.push(peerPubkey);
      localStorage.setItem(key, JSON.stringify(list));
    }
  }

  // ---- Notifications / Activity Feed ----

  public async getNotifications(identity: UserIdentity): Promise<NotificationItem[]> {
    void this.refreshLog(`inbox/${identity.pubkey}`);
    const key = `freenet_notifs_${identity.pubkey}`;
    const raw = localStorage.getItem(key);
    // filtered here too: the dismissed list and "clear all" can come back from the node after the inbox was stored
    const dismissed = new Set(this.dismissedNotifications(identity.pubkey));
    const cleared = identity.pubkey === this.me ? (this.clearUpTo ??= this.foldInboxUpTo("notif_clear")) : 0;
    const list: NotificationItem[] = raw ? JSON.parse(raw) : [];
    return list.filter((n) => !dismissed.has(n.id) && n.timestamp > cleared).sort((a, b) => b.timestamp - a.timestamp);
  }

  public async addNotification(
    recipientPubkey: string,
    notif: Omit<NotificationItem, "id" | "timestamp" | "read">
  ): Promise<void> {
    if (recipientPubkey === this.me || !this.identity) return;
    await this.logAppend(`inbox/${recipientPubkey}`, { type: "notif", notif: { ...notif, from: this.me } });
  }

  /** Tell each persona a post or comment mentions (at most 10, so a post cannot spam the network). */
  private async notifyMentions(text: string, postId: string, postOwner: string, skip: string[] = []): Promise<void> {
    const name = (pk: string) => this.knownPeers[pk]?.display_name ?? pk.slice(0, 8);
    const excerpt = plainMentions(text, name).replace(/\s+/g, " ").trim();
    for (const pk of mentionsIn(text).filter((pk) => !skip.includes(pk)).slice(0, 10))
      await this.addNotification(pk, {
        type: "mention",
        from: this.me,
        text: `mentioned you: "${excerpt.length > 60 ? excerpt.slice(0, 60) + "\u2026" : excerpt}"`,
        linkPostId: postId,
        linkPostOwner: postOwner,
      }).catch((e) => console.warn("[Freenet] mention:", e));
  }

  /** The newest "mark all read" (notif_read) or "clear all" (notif_clear) of mine in my inbox log (0 if none). */
  private foldInboxUpTo(type: "notif_read" | "notif_clear"): number {
    let upto = 0;
    for (const e of this.logEntries(`inbox/${this.me}`)) {
      if (e.author !== this.me || !e.body.includes(type)) continue;
      try {
        const b = JSON.parse(e.body);
        if (b.type === type && typeof b.upto === "number") upto = Math.max(upto, b.upto);
      } catch {}
    }
    return upto;
  }
  private foldReadUpTo = () => this.foldInboxUpTo("notif_read");
  private readUpTo?: number;
  private clearUpTo?: number;

  /** Store a local notification on this device (e.g. for post-quantum mail or direct app notices). */
  public recordLocalNotification(owner: string, item: NotificationItem): void {
    this.storeNotification(owner, item);
  }

  private storeNotification(owner: string, item: NotificationItem): void {
    if (this.dismissedNotifications(owner).includes(item.id)) return; // the log would bring it back otherwise
    if (owner === this.me && item.timestamp <= (this.clearUpTo ??= this.foldInboxUpTo("notif_clear"))) return;
    // a notification made after the inbox was read still honours "mark all read"
    if (owner === this.me && item.timestamp <= (this.readUpTo ??= this.foldReadUpTo())) item = { ...item, read: true };
    const key = `freenet_notifs_${owner}`;
    const list: NotificationItem[] = JSON.parse(localStorage.getItem(key) || "[]");
    if (list.some((n) => n.id === item.id || (n.linkPostId && n.linkPostId === item.linkPostId && n.from === item.from && Math.abs(n.timestamp - item.timestamp) < 5000))) return;
    const kept = keepNewest(list, item, 50);
    if (kept !== list) localStorage.setItem(key, JSON.stringify(kept));
  }

  private dismissedNotifications(owner: string): string[] {
    return JSON.parse(localStorage.getItem(`freenet_notifs_dismissed_${owner}`) || "[]");
  }

  /** Delete one notification for good (on this device): a later read of the inbox log does not bring it back. */
  public dismissNotification(identity: UserIdentity, id: string): void {
    const dismissed = this.dismissedNotifications(identity.pubkey);
    if (!dismissed.includes(id)) localStorage.setItem(`freenet_notifs_dismissed_${identity.pubkey}`, JSON.stringify([...dismissed, id].slice(-500)));
    const key = `freenet_notifs_${identity.pubkey}`;
    const list: NotificationItem[] = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.setItem(key, JSON.stringify(list.filter((n) => n.id !== id)));
  }

  /** Mark one notification read (on this device); it stays in the list. */
  public markNotificationRead(identity: UserIdentity, id: string): void {
    this.markNotificationsReadWhere(identity, (n) => n.id === id);
  }

  /** Mark every unread notification that matches read (on this device), for opening what they are about; returns how many. */
  public markNotificationsReadWhere(identity: UserIdentity, matches: (n: NotificationItem) => boolean): number {
    const key = `freenet_notifs_${identity.pubkey}`;
    const list: NotificationItem[] = JSON.parse(localStorage.getItem(key) || "[]");
    const hit = list.filter((n) => !n.read && matches(n));
    if (!hit.length) return 0;
    for (const n of hit) n.read = true;
    localStorage.setItem(key, JSON.stringify(list));
    return hit.length;
  }

  private markNotificationsReadUpTo(owner: string, upto: number): number {
    const key = `freenet_notifs_${owner}`;
    const list: NotificationItem[] = JSON.parse(localStorage.getItem(key) || "[]");
    for (const item of list) if (item.timestamp <= upto) item.read = true;
    localStorage.setItem(key, JSON.stringify(list));
    return list.reduce((m, n) => Math.max(m, n.timestamp), 0);
  }

  /** Remove every notification, on every device: a signed entry in my inbox, like "mark all read". */
  public async clearNotifications(identity: UserIdentity): Promise<void> {
    const key = `freenet_notifs_${identity.pubkey}`;
    const list: NotificationItem[] = JSON.parse(localStorage.getItem(key) || "[]");
    const upto = list.reduce((m, n) => Math.max(m, n.timestamp), 0);
    localStorage.setItem(key, "[]");
    if (!upto) return;
    this.clearUpTo = Math.max(this.clearUpTo ?? 0, upto);
    await this.logAppend(`inbox/${identity.pubkey}`, { type: "notif_clear", upto });
  }

  public async markNotificationsAsRead(identity: UserIdentity): Promise<void> {
    const upto = this.markNotificationsReadUpTo(identity.pubkey, Infinity);
    this.readUpTo = Math.max(this.readUpTo ?? 0, upto);
    if (upto) await this.logAppend(`inbox/${identity.pubkey}`, { type: "notif_read", upto });
  }

  // ---- Decentralized Communities & Moderation ----

  public async getCommunities(): Promise<Community[]> {
    void this.refreshLog("communities");
    // until the network's log is in, the communities I joined come from what my node remembers
    const early = (c: Community) => !this.communitiesLoaded && this.joinedOnNode.has(c.id) && !c.members.includes(this.me);
    // "system" is the seed communities' creator, not a person: it must not count as a member
    return this.foldedCommunities().map((c) => ({ ...c, moderators: [...c.moderators], deleted_post_ids: [...c.deleted_post_ids], members: [...c.members.filter((m) => m !== "system"), ...(early(c) ? [this.me] : [])] })); // copies: callers edit them and the folded list is shared
  }

  /** The communities I joined, as my node remembers them: page storage does not outlive the session, and a join that
   *  never reached the network (tab closed first) would be lost. */
  private joinedOnNode = new Set<string>();
  private communitiesLoaded = false;
  private joinedReady: Promise<void> = Promise.resolve();
  private async restoreJoined(): Promise<void> {
    const { nodeGet } = await import("./delegate.ts");
    try {
      for (const id of JSON.parse((await nodeGet(`joined:${this.me}`)) || "[]")) if (typeof id === "string") this.joinedOnNode.add(id);
    } catch {}
    this.notifyListeners();
  }
  /** After the network's log came in: join again where my join was lost (no join or leave of mine in the log), then
   *  remember what the log says. */
  private async checkJoined(): Promise<void> {
    await this.joinedReady; // or the node's list would be overwritten before it is read
    this.communitiesLoaded = true;
    const mine = new Set<string>();
    for (const e of this.logEntries("communities"))
      if (e.author === this.me && /"community_(join|leave)"/.test(e.body))
        try {
          mine.add(JSON.parse(e.body).community_id);
        } catch {}
    for (const id of this.joinedOnNode) if (!mine.has(id)) void this.logAppend("communities", { type: "community_join", community_id: id });
    const joined = this.foldedCommunities().filter((c) => c.members.includes(this.me)).map((c) => c.id);
    if (joined.join() === [...this.joinedOnNode].join()) return;
    this.joinedOnNode = new Set(joined);
    void import("./delegate.ts").then((m) => m.nodePut(`joined:${this.me}`, JSON.stringify(joined)), () => {});
  }

  public async getCommunity(idOrSlug: string): Promise<Community | null> {
    const communities = await this.getCommunities();
    const query = idOrSlug.toLowerCase().replace(/^r\//, "");
    return (
      communities.find((c) => c.id.toLowerCase() === query || c.slug.toLowerCase() === query) || null
    );
  }

  public async createCommunity(
    identity: UserIdentity,
    name: string,
    rawSlug: string,
    description: string,
    avatarUrl?: string,
    requireTrustedToPost?: boolean
  ): Promise<Community> {
    const slug = rawSlug.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40);
    const id = `c_${slug}`;
    if (!slug) throw new Error("Choose a name made of letters, digits or _.");
    if (await this.getCommunity(id)) throw new Error(`r/${slug} already exists.`);
    await this.logAppend(
      "communities",
      {
        type: "community_create",
        community: {
          id,
          name: name.trim(),
          description: description.trim(),
          avatar_url: avatarUrl,
          require_trusted_to_post: requireTrustedToPost,
        },
      },
      { flush: true }
    );
    return (await this.getCommunity(id))!;
  }

  /** Change a community's name and description. Founder, active moderators, and maintainer (on system genesis communities) can edit. */
  public async updateCommunity(
    identity: UserIdentity,
    communityId: string,
    name: string,
    description: string,
    requireTrustedToPost?: boolean
  ): Promise<Community> {
    const comm = await this.getCommunity(communityId);
    if (!comm) throw new Error("Community not found");
    if (!canEditCommunity(comm, identity.pubkey)) {
      throw new Error("Only the community's founder or moderators can edit it.");
    }
    await this.logAppend(
      "communities",
      {
        type: "community_create",
        community: {
          id: comm.id,
          name: name.trim(),
          description: description.trim(),
          ...(comm.avatar_url ? { avatar_url: comm.avatar_url } : {}),
          require_trusted_to_post: requireTrustedToPost,
        },
      },
      { flush: true }
    );
    this.notifyListeners();
    return (await this.getCommunity(comm.id))!;
  }

  /** Append a community event; the fold applies it only if the author may (see logfold.ts). */
  private async communityEvent(type: string, communityId: string, extra: object = {}): Promise<Community | null> {
    await this.logAppend("communities", { type, community_id: communityId, ...extra });
    this.notifyListeners();
    return this.getCommunity(communityId);
  }

  public async toggleJoinCommunity(identity: UserIdentity, communityId: string): Promise<boolean> {
    const comm = await this.getCommunity(communityId);
    if (!comm) return false;
    const join = !comm.members.includes(identity.pubkey);
    await this.communityEvent(join ? "community_join" : "community_leave", comm.id);
    return join;
  }

  public async addCommunityModerator(
    identity: UserIdentity,
    communityId: string,
    modPubkey: string
  ): Promise<{ success: boolean; msg: string }> {
    const comm = await this.getCommunity(communityId);
    if (!comm) return { success: false, msg: "Community not found" };
    if (identity.pubkey !== comm.creator && !comm.moderators.includes(identity.pubkey)) {
      return { success: false, msg: "Only moderators or owner can promote users." };
    }
    if (comm.moderators.includes(modPubkey)) return { success: false, msg: "User is already a moderator." };
    await this.communityEvent("community_mod_add", comm.id, { target: modPubkey });
    return { success: true, msg: "User promoted to moderator." };
  }

  public async removeCommunityModerator(
    identity: UserIdentity,
    communityId: string,
    modPubkey: string
  ): Promise<{ success: boolean; msg: string }> {
    const comm = await this.getCommunity(communityId);
    if (!comm) return { success: false, msg: "Community not found" };
    if (modPubkey === comm.creator) {
      return { success: false, msg: "The community creator/owner cannot be demoted!" };
    }
    const isMod = identity.pubkey === comm.creator || comm.moderators.includes(identity.pubkey);
    const canRemoveTarget = identity.pubkey === comm.creator || identity.pubkey === modPubkey || (isMod && (AI_REPORTERS.includes(modPubkey) || comm.creator === "system"));
    if (!canRemoveTarget) {
      return { success: false, msg: "Only the community creator (or a moderator for bots/genesis rooms) can remove this moderator." };
    }
    await this.communityEvent("community_mod_remove", comm.id, { target: modPubkey });
    return { success: true, msg: AI_REPORTERS.includes(modPubkey) ? "The Gardener removed." : "Moderator removed." };
  }

  public async banMemberFromCommunity(
    identity: UserIdentity,
    communityId: string,
    targetPubkey: string
  ): Promise<{ success: boolean; msg: string; community?: Community }> {
    const comm = await this.getCommunity(communityId);
    if (!comm) return { success: false, msg: "Community not found" };
    if (identity.pubkey !== comm.creator && !comm.moderators.includes(identity.pubkey)) {
      return { success: false, msg: "Only moderators or owner can ban members." };
    }
    if (targetPubkey === comm.creator || comm.moderators.includes(targetPubkey) || this.globalModerators().includes(targetPubkey)) {
      return { success: false, msg: "Moderators and the community owner cannot be banned!" };
    }
    const updated = await this.communityEvent("community_ban", comm.id, { target: targetPubkey });
    return { success: true, msg: "User banned from community.", community: updated ?? undefined };
  }

  public async unbanMemberFromCommunity(
    identity: UserIdentity,
    communityId: string,
    targetPubkey: string
  ): Promise<{ success: boolean; msg: string; community?: Community }> {
    const comm = await this.getCommunity(communityId);
    if (!comm) return { success: false, msg: "Community not found" };
    if (identity.pubkey !== comm.creator && !comm.moderators.includes(identity.pubkey)) {
      return { success: false, msg: "Only moderators or owner can unban members." };
    }
    const updated = await this.communityEvent("community_unban", comm.id, { target: targetPubkey });
    return { success: true, msg: "User unbanned.", community: updated ?? undefined };
  }

  public async modDeletePost(
    identity: UserIdentity,
    communityId: string,
    postId: string,
    postAuthor: string
  ): Promise<{ success: boolean; msg: string }> {
    const comm = await this.getCommunity(communityId);
    if (!comm) return { success: false, msg: "Community not found" };
    const isModerator = identity.pubkey === comm.creator || comm.moderators.includes(identity.pubkey);
    if (!isModerator && identity.pubkey !== postAuthor) {
      return { success: false, msg: "You do not have moderation rights in this community." };
    }
    await this.communityEvent("community_delete_post", comm.id, { post_id: postId, post_author: postAuthor });
    if (identity.pubkey === postAuthor) await this.deletePost(identity, postId);
    return { success: true, msg: "Post removed from community by moderator." };
  }

  public async getCommunityFeed(communityId: string, identity: UserIdentity): Promise<Post[]> {
    const comm = await this.getCommunity(communityId);
    if (!comm) return [];

    const timeline = await this.getTimeline(identity);
    return timeline.filter(
      (p) =>
        (p.community_id === comm.id || p.community_id === comm.slug) &&
        !isPostDeletedInCommunity(comm, p)
    );
  }

  // -------------------------------------------------------------
  // E2EE Private Rooms
  // -------------------------------------------------------------

  private nickname(): string {
    return this.knownPeers[this.me]?.display_name || `Persona @${personaName(this.me).substring(0, 6)}`;
  }

  public isRiverOwner(identity: UserIdentity, room: PrivateRoom): boolean {
    return this.privateRooms.isRiverOwner(identity, room);
  }

  public mergeRemotePrivateRooms(incoming: PrivateRoom[]): void {
    this.privateRooms.mergeRemotePrivateRooms(incoming);
  }

  public createPrivateRoom(
    identity: UserIdentity,
    name: string,
    memberPubkeys: string[],
    roomId?: string,
    opts?: { is_channel?: boolean; linked_room_id?: string; avatar_url?: string }
  ): Promise<PrivateRoom> {
    return this.privateRooms.createPrivateRoom(identity, name, memberPubkeys, roomId, opts);
  }

  public setRoomLinkedDiscussion(identity: UserIdentity, roomId: string, linkedRoomId?: string): Promise<PrivateRoom | null> {
    return this.privateRooms.setRoomLinkedDiscussion(identity, roomId, linkedRoomId);
  }

  public setRoomAvatar(identity: UserIdentity, roomId: string, avatarUrl?: string): Promise<PrivateRoom | null> {
    return this.privateRooms.setRoomAvatar(identity, roomId, avatarUrl);
  }

  public setRoomPinnedMessage(identity: UserIdentity, roomId: string, messageId?: string | null): Promise<void> {
    return this.privateRooms.setRoomPinnedMessage(identity, roomId, messageId);
  }

  public getRoomPinnedMessageId(roomId: string): string | null {
    return this.privateRooms.getRoomPinnedMessageId(roomId);
  }

  public getPrivateRooms(identity: UserIdentity): Promise<PrivateRoom[]> {
    return this.privateRooms.getPrivateRooms(identity);
  }

  public getPrivateRoomKey(identity: UserIdentity, room: PrivateRoom): Promise<Uint8Array | null> {
    return this.privateRooms.getPrivateRoomKey(identity, room);
  }

  public getPrivateRoomDecryptedName(identity: UserIdentity, room: PrivateRoom): Promise<string> {
    return this.privateRooms.getPrivateRoomDecryptedName(identity, room);
  }

  public inviteMemberToPrivateRoom(identity: UserIdentity, roomId: string, newMemberPubkey: string): Promise<PrivateRoom> {
    return this.privateRooms.inviteMemberToPrivateRoom(identity, roomId, newMemberPubkey);
  }

  public addGardenerToPrivateRoom(identity: UserIdentity, roomId: string): Promise<PrivateRoom> {
    return this.privateRooms.addGardenerToPrivateRoom(identity, roomId);
  }

  public kickMemberFromPrivateRoom(identity: UserIdentity, roomId: string, targetPubkey: string): Promise<PrivateRoom> {
    return this.privateRooms.kickMemberFromPrivateRoom(identity, roomId, targetPubkey);
  }

  public leavePrivateRoom(identity: UserIdentity, roomId: string): Promise<void> {
    return this.privateRooms.leavePrivateRoom(identity, roomId);
  }

  public setPrivateRoomModerator(identity: UserIdentity, roomId: string, target: string, on: boolean): Promise<PrivateRoom> {
    return this.privateRooms.setPrivateRoomModerator(identity, roomId, target, on);
  }

  public migrateRiverRoom(identity: UserIdentity, roomId: string, name: string): Promise<PrivateRoom> {
    return this.privateRooms.migrateRiverRoom(identity, roomId, name);
  }

  public riverMigratedTo(room: PrivateRoom): string | null {
    return this.privateRooms.riverMigratedTo(room);
  }

  public getPrivateRoomInviteLink(room: PrivateRoom, roomKey: Uint8Array, roomName: string, linkedRoomKey?: Uint8Array | null): string {
    return this.privateRooms.getPrivateRoomInviteLink(room, roomKey, roomName, linkedRoomKey);
  }

  public joinPrivateRoomFromInvite(
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
    }
  ): Promise<PrivateRoom> {
    return this.privateRooms.joinPrivateRoomFromInvite(identity, inviteData);
  }

  public sendPrivateRoomChatMessage(identity: UserIdentity, room: PrivateRoom, text: string, replyTo?: string): Promise<ChatMessage> {
    return this.privateRooms.sendPrivateRoomChatMessage(identity, room, text, replyTo);
  }

  public getPrivateRoomChatMessages(identity: UserIdentity, room: PrivateRoom): Promise<ChatMessage[]> {
    return this.privateRooms.getPrivateRoomChatMessages(identity, room);
  }
}

export const freenet = new FreenetClient();
