import { RADICA_DEFAULT_MODS, RADICA_MAINTAINER, type SecretChatSession } from "./types.ts";
import { visoGhostkeyOf, visoProfileOf } from "./viso.ts";
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
  formatPostSignatureMessage,
  formatCommentSignatureMessage,
  formatProfileSignatureMessage,
  formatLikeSignatureMessage,
  formatFollowingSignatureMessage,
  formatDeleteSignatureMessage,
  verifySignature,
  formatLogEntryMessage,
  formatChatMessageSignatureMessage,
  formatCommunitySignatureMessage,
  formatModActionSignatureMessage,
  formatPrivateRoomSignatureMessage,
  encryptDirectMessage,
  decryptDirectMessage,
  addReadKeys,
  readEncPubs,
  generateRoomKey,
  encryptWithSymmetricKey,
  decryptWithSymmetricKey,
  encryptRoomKeyForPeer,
  decryptRoomKeyFromPeer,
  bytesToHex,
  hexToBytes,
  personaName,
} from "./crypto.ts";
import { safeStorage } from "./storage.ts";
import { FreenetNetwork, contractKey, type ContractId } from "./network.ts";
import { CURRENT } from "./legacy.ts";
import { dedupeChat, directoryWeights, laneSample, foldHiddenCommunities, foldBlocklist, foldReports, foldReportedMedia, foldDismissed, foldReportQueue, type ReportedItem, foldChat, foldChatHides, foldChatRead, foldCommunities, foldRoom, hasLeftRoom, roomJoiners, keepNewest, foldCommentLikes, foldPostDislikes, foldPostEdits, stateSlotFor, compactLog, isDmEntry, type LogEntry } from "./logfold.ts";
import { overlayFeed } from "./feedmerge.ts";
import { shouldFetch, LIVE_RECHECK_MS, REFRESH_EVERY_MS, type Change } from "./refresh.ts";
import { river } from "./river.ts";
import { lightFeedAsync, type LightFeed } from "./feedlight.ts";
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
import { yieldToMain } from "./limit.ts";
import { knownAnchor, resolveRoomContract } from "./riverPointer.ts";
import { RiverRooms, roomOwnerSk, vkOf, type RiverJoin } from "./riverRooms.ts";
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
import { mergeRoomBackup } from "./roomBackup.ts";
import {
  addSecretChatPeer,
  editSecretMessage,
  burnSecretMessage,
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
    void (id.startsWith("feed:") ? this.feedChanged(id.slice(5), change ?? {}) : id.startsWith("river:") ? this.rivers().then((r) => (r.changed(id.slice(6)), this.notifyListeners())) : this.logChanged(id.slice(4), change ?? {}))
  );
  private riverP?: Promise<RiverRooms>;
  /** Private rooms on River's contract, loaded on first use (river.wasm and River's pointer). */
  private rivers(): Promise<RiverRooms> {
    return (this.riverP ??= river().then((call) => {
      // never wait on the network for the pointer: start from what this install knows, and resolve it once per session behind
      let anchor = knownAnchor();
      void resolveRoomContract((k) => this.net.getRaw(k), call).then((a) => (anchor = a));
      const code = () => import("./wasm/river_room_contract.wasm?url").then(({ default: url }) => fetch(url)).then(async (r) => new Uint8Array(await r.arrayBuffer()));
      return new RiverRooms(call, this.net, async () => anchor, code);
    }));
  }
  private identity: UserIdentity | null = null;
  private lastRefresh = new Map<string, number>();
  private unsentLogs = new Set<string>(); // logs where a send failed: the next refresh sends the entries again
  private offlineMedia = new Map<string, Uint8Array>(); // in-session fallback when no local node is connected
  private me = "";
  private pending = new Map<string, FeedState[]>(); // per feed: changes the network has not accepted yet
  private bc: BroadcastChannel | null = null;
  private listeners: (() => void)[] = [];
  private typingListeners: ((roomId: string, sender: string) => void)[] = [];
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
  private privateRoomKeyCache: Map<string, Uint8Array> = new Map();

  constructor() {
    if (typeof BroadcastChannel !== "undefined") {
      this.bc = new BroadcastChannel("radica_peer_sync");
      this.bc.onmessage = (ev) => {
        this.handlePeerEvent(ev.data);
      };
    }

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
        return { ...c, id: "c_radica", name: "Radica Hub", slug: "radica", moderators: Array.from(mods) };
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
        const isSecret = !!(msg.is_secret || msg.text?.startsWith("secret:v1:") || (msg.room_id && this.isSecretRoomId(msg.room_id)));
        const notifText = isSecret
          ? "sent you a secret chat message 🔐"
          : msg.text.startsWith("e2e:")
            ? "sent you an encrypted direct message 🔒"
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

  public async connect(): Promise<boolean> {
    try {
      await this.net.connect();
      this.isConnected = true;
      void this.refreshLog("directory", true); // learn who else is on the network, and publish my own entry
      void this.refreshLog("supporters", true);
      void this.refreshLog("ghostkeys", true);
      void this.refreshLog("supporter-receipts", true);
      void this.refreshLog("post-edits", true);
    } catch (err) {
      console.warn("[Freenet] Could not connect to the Freenet node, using local storage only:", err);
      this.isConnected = false;
      this.connectError = String((err as Error)?.message ?? err);
    }
    return this.isConnected;
  }

  /** Fetch a feed from the network into the local cache (at most once a minute unless `force`). */
  /** True while the chat is on screen: feeds (posts, follows) are not fetched then; chat logs and the profiles chat shows still are. */
  public feedsPaused = false;

  public async refresh(owner: string, force = false, urgent = false): Promise<void> {
    if (!this.isConnected) return;
    if (this.feedsPaused && !force && !urgent) return;
    const last = this.lastRefresh.get(owner) ?? 0;
    const unsent = (this.pending.get(owner)?.length ?? 0) > 0;
    if (!shouldFetch({ force, sinceLast: Date.now() - last, liveAge: this.net.liveAge(`feed:${owner}`), unsent })) return;
    this.lastRefresh.set(owner, Date.now());
    try {
      await this.pushPending(owner);
      const text = await this.net.getText(`feed:${owner}`, urgent || owner === this.me); // my own profile never waits behind others' feeds
      if (text !== null) await this.takeFeed(owner, text);
    } catch (e) {
      console.warn("[Freenet] Could not fetch feed", owner, e);
    }
  }

  /** A followed feed changed on the network: take the state or the delta the node sent instead of fetching it again. */
  private async feedChanged(owner: string, c: Change): Promise<void> {
    // my own feed and one with unsent changes are fetched whole: unsent changes go on top of the full state, and a delta
    // carries no follow certificate
    if (owner !== this.me && !this.pending.get(owner)?.length) {
      try {
        const stored = localStorage.getItem(`freenet_feed_${owner}`);
        const light = c.state ? undefined : c.delta && stored ? await lightFeedAsync(stored, c.delta) : null;
        const text = c.state ?? light?.text;
        if (text !== undefined) {
          this.lastRefresh.set(owner, Date.now());
          return await this.takeFeed(owner, text, light ?? undefined);
        }
      } catch (e) {
        console.warn("[Freenet] Could not apply the change of feed", owner, e);
      }
    }
    return this.refresh(owner, true);
  }

  /** Store a feed's text and update names and listeners. `light`: the feed already parsed in the worker. */
  private async takeFeed(owner: string, text: string, light?: LightFeed): Promise<void> {
    await yieldToMain(); // each fetched feed is handled in its own task, so clicks are not queued behind a burst of them
    const pend = this.pending.get(owner) ?? [];
    let json = text;
    let profile: ProfileInfo | undefined;
    if (pend.length || owner === this.me) {
      // my own feed (or one with unsent changes): the page reads it whole, parse it here
      const feed: FeedState = JSON.parse(text);
      for (const d of pend) overlayFeed(feed, d); // keep what the network has not taken yet
      if (owner === this.me) this.requeueLostDeletions(feed);
      this.postTotals.set(owner, Object.keys(feed.posts ?? {}).length);
      json = JSON.stringify(feed);
      this.feedCache.set(`freenet_feed_${owner}`, { raw: json, feed });
      profile = feed.profile;
    } else {
      // another person's feed: stored as it came, parsed in the worker (that also readies it for the timeline)
      const l = light ?? (await lightFeedAsync(text));
      this.peerPostsCache.set(owner, { raw: text, posts: l.posts });
      this.peerFollowing.set(owner, l.following ?? []);
      this.postTotals.set(owner, l.total ?? l.posts.length);
      profile = l.profile;
    }
    const same = localStorage.getItem(`freenet_feed_${owner}`) === json;
    if (!same) localStorage.setItem(`freenet_feed_${owner}`, json);
    if (profile) this.knownPeers[owner] = { display_name: profile.display_name, avatar_url: profile.avatar_url }; // names and avatars of other people
    if (!same) this.notifyListeners(); // unchanged feed: no redraw of chat and posts
  }

  /** My deletions kept locally but missing on the network (unsent queue lost on reload, or made offline): keep them and send them again,
   *  or the network copy would bring the deleted posts back. */
  private requeueLostDeletions(feed: FeedState): void {
    const key = `freenet_feed_${feed.owner}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const hit = this.feedCache.get(key);
    let local: FeedState;
    try {
      local = hit?.raw === raw ? hit.feed : JSON.parse(raw);
    } catch {
      return;
    }
    const lost = Object.entries(local.deleted ?? {}).filter(([id]) => !feed.deleted?.[id]);
    if (!lost.length) return;
    const d: FeedState = { owner: feed.owner, posts: {}, following: [], deleted: Object.fromEntries(lost) };
    overlayFeed(feed, d);
    this.pending.set(feed.owner, [...(this.pending.get(feed.owner) ?? []), d]);
    this.lastRefresh.delete(feed.owner);
    setTimeout(() => void this.refresh(feed.owner, true), 0); // push them once; next time they are in the queue, so no loop
  }

  /** Publish my local feed (merged with what the network has), then take the merged result. */
  private readKeysReady: Promise<void> = Promise.resolve();

  /** The persona that signs log entries (messages, community actions). Call once at startup. */
  public setIdentity(identity: UserIdentity): void {
    this.identity = identity;
    this.me = identity.pubkey;
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
    void this.restoreRoomsFromNode();
    this.secretReady = durable.start(identity.pubkey).then(() => this.restoreSecretFromNode());
    this.riverOnlyReady = this.restoreRiverOnly();
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
    void this.announceDevice(identity).catch((e) => console.warn("[Freenet] Could not publish this device's key:", e));
    await this.migrateOwnFeed(identity);
    const feed = await this.getFeed(identity.pubkey);
    // a new app key (Viso's shared one): the profile must name it, since that is the key people encrypt to
    if (feed.profile && feed.profile.enc_pub !== identity.encPub) {
      const pr = { ...feed.profile, enc_pub: identity.encPub, cert: identity.cert, updated_at: Date.now() };
      pr.sig = await identity.sign(formatProfileSignatureMessage(identity.pubkey, pr.display_name, pr.bio, pr.avatar_url, pr.enc_pub, pr.updated_at));
      feed.profile = pr;
    }
    await this.saveFeed(feed);
  }

  /** One time: re-sign my feed in the v2 format the contract checks; drop what cannot be re-signed. */
  private async migrateOwnFeed(identity: UserIdentity): Promise<void> {
    const marker = `radica_feed_v3_${identity.pubkey}`; // v3: profile signs its encryption key; Viso delegations
    if (localStorage.getItem(marker)) return;
    const me = identity.pubkey;
    const feed = await this.getFeed(me);
    const posts: Record<string, Post> = {};
    for (const p of Object.values(feed.posts)) {
      if (p.author !== me) continue;
      const comments: Record<string, Comment> = {};
      for (const c of Object.values(p.comments || {})) {
        const msg = formatCommentSignatureMessage(c.id, c.post_id, c.author, c.text, c.timestamp);
        if (c.post_id === p.id && (await verifySignature(msg, c.sig, c.author))) comments[`${c.author}:${c.id}`] = c;
      }
      const post: Post = { ...p, is_nsfw: !!p.is_nsfw, comments, likes: Array.isArray(p.likes) ? {} : p.likes || {} };
      post.cert = identity.cert;
      post.sig = await identity.sign(formatPostSignatureMessage(post));
      posts[p.id] = post;
    }
    feed.posts = posts;
    if (feed.profile) {
      const pr = feed.profile;
      pr.enc_pub = identity.encPub;
      pr.cert = identity.cert;
      pr.sig = await identity.sign(formatProfileSignatureMessage(me, pr.display_name, pr.bio, pr.avatar_url, pr.enc_pub, pr.updated_at));
    }
    if (feed.following.length) {
      feed.following_updated_at = Date.now();
      feed.following_cert = identity.cert;
      feed.following_sig = await identity.sign(formatFollowingSignatureMessage(me, feed.following_updated_at, feed.following));
    }
    const deleted: FeedState["deleted"] = {};
    for (const id of Object.keys(feed.deleted || {}))
      deleted[id] = { sig: await identity.sign(formatDeleteSignatureMessage(me, id)), cert: identity.cert };
    feed.deleted = deleted;
    localStorage.setItem(`freenet_feed_${me}`, JSON.stringify(feed));
    localStorage.setItem(marker, "1");
  }

  public get isNodeOnline(): boolean {
    return this.isConnected;
  }

  private feedCache = new Map<string, { raw: string; feed: FeedState }>();

  private peerPostsCache = new Map<string, { raw: string; posts: Post[] }>();

  /** The newest posts of another person's stored feed, parsed off the main thread (the timeline never needs the rest). */
  private async peerPosts(pubkey: string): Promise<Post[]> {
    const raw = localStorage.getItem(`freenet_feed_${pubkey}`);
    void this.refresh(pubkey);
    if (!raw) return [];
    const hit = this.peerPostsCache.get(pubkey);
    if (hit?.raw === raw) return hit.posts;
    const { posts, total, following } = await lightFeedAsync(raw);
    this.peerPostsCache.set(pubkey, { raw, posts });
    this.peerFollowing.set(pubkey, following ?? []);
    this.postTotals.set(pubkey, total ?? posts.length);
    return posts;
  }

  /** Whom each other person follows, from their feeds read this session. */
  private peerFollowing = new Map<string, string[]>();

  /** Personas `pubkey` follows, from their feed read this session. */
  public followingOf(pubkey: string): string[] {
    return this.peerFollowing.get(pubkey) ?? [];
  }

  /** People whose feed this node has read and who follow `pubkey`: only a part of them, never a count to show. */
  public followersOf(pubkey: string): string[] {
    return [...this.peerFollowing].filter(([k, f]) => k !== pubkey && f.includes(pubkey)).map(([k]) => k);
  }

  /** How many posts each feed this node has read holds (all of them, not only the newest the timeline shows). */
  private postTotals = new Map<string, number>();

  /** Another Freenet app's contract by its instance id, or null when the network does not have it. */
  public appContract(instance: string): Promise<Uint8Array | null> {
    return this.net.getByInstance(instance);
  }

  /** Another app's contract, written by its own rules (FreePolls polls created and answered here). */
  public putAppContract(key: ContractKey, code: Uint8Array, params: Uint8Array, state: Uint8Array): Promise<void> {
    return this.net.putRaw(key, code, params, state);
  }

  public updateAppContract(key: ContractKey, delta: Uint8Array): Promise<void> {
    return this.net.updateRaw(key, delta);
  }

  /** Universal Freenet URI (freenet:<contract_key_base58>) for a feed, media, or log contract. */
  public async getContractUri(id: ContractId): Promise<string> {
    const k = await contractKey(id);
    return `freenet:${k.encode()}`;
  }

  /** People's feeds this node keeps a copy of and passes changes on for, right now (its subscriptions). */
  public hostedFeeds(): number {
    return this.net.liveIds().filter((id) => id.startsWith("feed:")).length;
  }

  /** Posts in every feed this node has read this session. */
  public knownPostCount(): number {
    let n = 0;
    for (const v of this.postTotals.values()) n += v;
    return n;
  }

  // Load feed for a given owner pubkey
  public async getFeed(ownerPubkey: string): Promise<FeedState> {
    const key = `freenet_feed_${ownerPubkey}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        // reparsing a feed (up to 16 MB) on every call is the slow part of drawing the feed: reuse it while the stored text is unchanged
        let parsed: FeedState;
        const hit = this.feedCache.get(key);
        if (hit?.raw === raw) parsed = hit.feed;
        else {
          parsed = JSON.parse(raw);
          this.feedCache.set(key, { raw, feed: parsed });
          this.postTotals.set(ownerPubkey, Object.keys(parsed.posts ?? {}).length);
        }
        if (!parsed.profile) {
          const profRaw = localStorage.getItem(`radica_profile_${ownerPubkey}`);
          if (profRaw) {
            try {
              parsed.profile = JSON.parse(profRaw);
            } catch {}
          }
        }
        void this.refresh(ownerPubkey);
        return parsed;
      } catch {
        // pass
      }
    }
    void this.refresh(ownerPubkey);
    return {
      owner: ownerPubkey,
      posts: {},
      following: [],
    };
  }

  /** Save `feed` locally and send `delta` (what changed) to the network; kept and retried until the network takes it. */
  public async saveFeed(feed: FeedState, delta: FeedState = feed): Promise<void> {
    const key = `freenet_feed_${feed.owner}`;
    feed.posts = { ...feed.posts }; // ponytail: new ref triggers sizedPosts check without re-parsing JSON in getFeed
    const raw = JSON.stringify(feed);
    localStorage.setItem(key, raw);
    this.feedCache.set(key, { raw, feed });
    this.postTotals.set(feed.owner, Object.keys(feed.posts).length);
    if (!this.isConnected) return;
    this.pending.set(feed.owner, [...(this.pending.get(feed.owner) ?? []), delta]);
    void this.refresh(feed.owner, true); // in background: the change is already local and queued until the network takes it
  }

  // shortcut: a change the contract rejects for good is retried on every refresh of this session, then dropped on reload
  private async pushPending(owner: string): Promise<void> {
    for (const d of this.pending.get(owner) ?? []) {
      try {
        await this.net.push(`feed:${owner}`, d); // the contract merges it with what other peers sent
        this.pending.set(owner, (this.pending.get(owner) ?? []).filter((x) => x !== d));
      } catch (e) {
        console.warn("[Freenet] The network did not accept a change to feed", owner, e);
      }
    }
  }

  // ---- Logs (log-contract): inbox/<pubkey>, communities, community-chat/<id>, room/<id> ----

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

  private logEntriesCache = new Map<string, { obj: Record<string, LogEntry>; list: LogEntry[] }>();
  private logEntries(name: string): LogEntry[] {
    try {
      const obj = this.readJson<Record<string, LogEntry>>(`freenet_log_${name}`, "{}");
      const hit = this.logEntriesCache.get(name);
      if (hit?.obj === obj) return hit.list;
      const list = Object.values(obj);
      this.logEntriesCache.set(name, { obj, list });
      return list;
    } catch {
      return [];
    }
  }

  private storedPrivateRooms(): PrivateRoom[] {
    return this.readJson<PrivateRoom[]>("freenet_private_rooms", "[]");
  }

  private communitiesFold?: { raw: string | null; list: Community[] };
  private editsFold?: { raw: string | null; map: Map<string, { caption: string; ts: number }> };

  /** The newest edit of a post by its author, if any (the feed keeps a post as first published; edits live in a log). */
  public postEdit(author: string, postId: string): { caption: string; ts: number } | undefined {
    const raw = localStorage.getItem("freenet_log_post-edits");
    if (this.editsFold?.raw !== raw) this.editsFold = { raw, map: foldPostEdits(this.logEntries("post-edits")) };
    return this.editsFold.map.get(`${author}:${postId}`);
  }

  /** Change what my post says: a signed edit everyone's app applies over the original. */
  public editPost(postId: string, caption: string): Promise<void> {
    return this.logAppend("post-edits", { type: "edit", post: postId, caption });
  }

  /** Communities folded from the log, recomputed only when the stored log changes (folding replays every entry, and this is read on each sync pass). */
  private foldedCommunities(): Community[] {
    const raw = localStorage.getItem("freenet_log_communities");
    if (this.communitiesFold?.raw !== raw) this.communitiesFold = { raw, list: foldCommunities(this.logEntries("communities"), GENESIS) };
    return this.communitiesFold.list;
  }

  private saveLog(name: string, entries: LogEntry[]): void {
    localStorage.setItem(`freenet_log_${name}`, JSON.stringify(Object.fromEntries(entries.map((e) => [`${e.author}:${e.id}`, e]))));
  }

  /** Sign `body` as a new entry of log `name`, apply it here and send it to the network. */
  private async logAppend(name: string, body: object): Promise<void> {
    const me = this.identity;
    if (!me) throw new Error("No identity to sign with");
    // state (a read mark, a hidden room…) goes under one id per subject: the log keeps only the newest
    const id = stateSlotFor(body as Record<string, unknown>) ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const e: LogEntry = { author: me.pubkey, id, ts: Date.now(), body: JSON.stringify(body), sig: "" };
    e.sig = await me.sign(formatLogEntryMessage(name, e.author, e.id, e.ts, e.body));
    if (me.cert) e.cert = me.cert;
    this.saveLog(name, [...this.logEntries(name), e]);
    this.applyLog(name);
    if (this.isConnected) void this.pushLog(name, [e]);
    else {
      this.unsentLogs.add(name); // offline: sent once the node is back
      this.retryUnsent(name);
    }
  }

  /** Each author's latest choice on the public supporters wall: their receipt token, or null when withdrawn. */
  public supporterTokens(): { author: string; token: string | null }[] {
    const latest = new Map<string, LogEntry>();
    for (const e of this.logEntries("supporters")) if (e.ts >= (latest.get(e.author)?.ts ?? -1)) latest.set(e.author, e);
    return [...latest.values()].map((e) => {
      try {
        const t = JSON.parse(e.body).receipt;
        return { author: e.author, token: typeof t === "string" ? t : null };
      } catch {
        return { author: e.author, token: null };
      }
    });
  }

  /** Each author's latest GhostKey proof (bundle hex) in the "ghostkeys" log, null when they took it back; unchecked. */
  public ghostkeyBundles(): { author: string; bundle: string | null }[] {
    const latest = new Map<string, LogEntry>();
    for (const e of this.logEntries("ghostkeys")) if (e.ts >= (latest.get(e.author)?.ts ?? -1)) latest.set(e.author, e);
    return [...latest.values()].map((e) => {
      try {
        const b = JSON.parse(e.body).bundle;
        return { author: e.author, bundle: typeof b === "string" && /^[0-9a-f]+$/.test(b) ? b : null };
      } catch {
        return { author: e.author, bundle: null };
      }
    });
  }

  /** Publish my GhostKey proof (so others see the badge), or null to take it back. */
  public setGhostkey(bundle: string | null): Promise<void> {
    return this.logAppend("ghostkeys", { type: "ghostkey", bundle });
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

  /** Reported posts waiting for a Radica moderator: not yet removed (reported on a moderator's blocklist) nor dismissed by one. */
  public reportQueue(weigh?: (reporter: string) => number): ReportedItem[] {
    const resolved = new Set<string>();
    for (const m of [RADICA_MAINTAINER, ...this.modsOf(RADICA_MAINTAINER)]) {
      const log = this.logEntries(`blocklist/${m}`);
      for (const t of foldReports(log, m).keys()) resolved.add(t);
      for (const t of foldDismissed(log, m)) resolved.add(t);
    }
    return foldReportQueue(this.logEntries("reports"), resolved, 50, weigh);
  }

  /** Moderator: set a report aside without removing the post. Every moderator sees it, since each reads the others' lists. */
  public dismissReport(target: string): Promise<void> {
    return this.logAppend(`blocklist/${this.me}`, { type: "dismiss", target });
  }

  /** Hide a community (`c_<slug>`) on my own blocklist, or show it again: whoever follows my list stops seeing it in lists,
   *  search and timelines. It stays on the network; only the people following the list stop seeing it. */
  public async setCommunityHidden(id: string, on: boolean, reason = ""): Promise<void> {
    await this.logAppend(`blocklist/${this.me}`, { type: "hide_community", target: id, on, reason: reason.slice(0, 200) });
    this.notifyListeners();
  }

  /** The communities `curator` hid (id -> reason), as last fetched. */
  public hiddenCommunitiesBy(curator: string): Map<string, string> {
    const raw = localStorage.getItem(`freenet_log_blocklist/${curator}`);
    const hit = this.hiddenCommFolds.get(curator);
    if (hit?.raw === raw) return hit.map;
    const map = foldHiddenCommunities(this.logEntries(`blocklist/${curator}`), curator);
    this.hiddenCommFolds.set(curator, { raw, map });
    return map;
  }
  private hiddenCommFolds = new Map<string, { raw: string | null; map: Map<string, string> }>();

  /** Name (or drop) a global moderator: their reports and blocks count for everyone who follows my list (the maintainer's). */
  public setGlobalMod(target: string, on: boolean): Promise<void> {
    return this.logAppend(`blocklist/${this.me}`, { type: "mod", target, on });
  }

  /** The moderators `curator` named on their blocklist, as last fetched. */
  public modsOf(curator: string): Set<string> {
    const raw = localStorage.getItem(`freenet_log_blocklist/${curator}`);
    const hit = this.blocklistFolds.get(`mod:${curator}`);
    if (hit?.raw === raw) return hit.set;
    const set = foldBlocklist(this.logEntries(`blocklist/${curator}`), curator, "mod", curator === RADICA_MAINTAINER ? RADICA_DEFAULT_MODS : []);
    this.blocklistFolds.set(`mod:${curator}`, { raw, set });
    return set;
  }

  /** Withdraw a post report from my own blocklist so I and my curators see it again. */
  public unreportPost(author: string, postId: string): Promise<void> {
    return this.logAppend(`blocklist/${this.me}`, { type: "report", target: `${author}:${postId}`, on: false });
  }


  /** Name my Delta blog (its site prefix) on my profile, or none. */
  public setDeltaSite(prefix: string | null): Promise<void> {
    return this.logAppend(`delta/${this.me}`, { type: "site", prefix });
  }

  /** The Delta blog `pubkey` named, from their own newest entry, as last fetched (refreshLog(`delta/<pubkey>`) to update). */
  public deltaSiteOf(pubkey: string): string | null {
    const mine = this.logEntries(`delta/${pubkey}`).filter((e) => e.author === pubkey).sort((a, b) => b.ts - a.ts)[0];
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

  public setOrtoBlog(url: string | null): Promise<void> {
    return this.logAppend(`orto/${this.me}`, { type: "blog", url });
  }

  /** The Orto blog url/setting pubkey named, or null. */
  public ortoBlogOf(pubkey: string): string | null {
    const mine = this.logEntries(`orto/${pubkey}`).filter((e) => e.author === pubkey).sort((a, b) => b.ts - a.ts)[0];
    try {
      const url = mine && JSON.parse(mine.body).url;
      return typeof url === "string" ? url : null;
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
    return this.logAppend(`asocial/${this.me}`, { type: "profile", key });
  }

  /** The Asocial author key/profile link pubkey named, or null. */
  public asocialKeyOf(pubkey: string): string | null {
    const mine = this.logEntries(`asocial/${pubkey}`).filter((e) => e.author === pubkey).sort((a, b) => b.ts - a.ts)[0];
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
    return this.logAppend(`freetunes/${this.me}`, { type: "profile", input });
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
    const mine = this.logEntries(`freetunes/${pubkey}`).filter((e) => e.author === pubkey).sort((a, b) => b.ts - a.ts)[0];
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
    return this.logAppend(`freetree/${this.me}`, { type: "hub", prefix });
  }

  /** The Freetree hub prefix configured in their profile, or null. */
  public freetreeOf(pubkey: string): string | null {
    const mine = this.logEntries(`freetree/${pubkey}`).filter((e) => e.author === pubkey).sort((a, b) => b.ts - a.ts)[0];
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
    return this.logAppend(`fh/${this.me}`, { type: "profile", input });
  }

  /** The Fisherman's Horizon setting pubkey configured in their profile, or null. */
  public fhOf(pubkey: string): string | null {
    const mine = this.logEntries(`fh/${pubkey}`).filter((e) => e.author === pubkey).sort((a, b) => b.ts - a.ts)[0];
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

  private blocklistFolds = new Map<string, { raw: string | null; set: Set<string> }>();
  private reportFolds = new Map<string, { raw: string | null; map: Map<string, string> }>();

  /** Posts (`<author>:<post id>`) that `curator` reported, with the reason, as last fetched. */
  public reportedBy(curator: string): Map<string, string> {
    const raw = localStorage.getItem(`freenet_log_blocklist/${curator}`);
    const hit = this.reportFolds.get(curator);
    if (hit?.raw === raw) return hit.map;
    const map = foldReports(this.logEntries(`blocklist/${curator}`), curator);
    this.reportFolds.set(curator, { raw, map });
    return map;
  }

  private mediaFolds = new Map<string, { raw: string | null; set: Set<string> }>();

  /** Media hashes of the posts `curator` reported, as last fetched. */
  public reportedMediaBy(curator: string): Set<string> {
    const raw = localStorage.getItem(`freenet_log_blocklist/${curator}`);
    const hit = this.mediaFolds.get(curator);
    if (hit?.raw === raw) return hit.set;
    const set = foldReportedMedia(this.logEntries(`blocklist/${curator}`), curator);
    this.mediaFolds.set(curator, { raw, set });
    return set;
  }

  /** Authors that `curator` blocks, as last fetched. Call refreshLog(`blocklist/<curator>`) to update. */
  public blockedBy(curator: string): Set<string> {
    const raw = localStorage.getItem(`freenet_log_blocklist/${curator}`);
    const hit = this.blocklistFolds.get(curator);
    if (hit?.raw === raw) return hit.set;
    const set = foldBlocklist(this.logEntries(`blocklist/${curator}`), curator);
    this.blocklistFolds.set(curator, { raw, set });
    return set;
  }

  private reactionFolds = new Map<string, { raw: string | null; map: Map<string, string[]> }>();

  /** Liker pubkeys for a comment, from the author's `reactions/<postAuthor>` log. */
  public commentLikers(postAuthor: string, postId: string, commentKey: string): string[] {
    const raw = localStorage.getItem(`freenet_log_reactions/${postAuthor}`);
    const hit = this.reactionFolds.get(postAuthor);
    let map: Map<string, string[]>;
    if (hit && hit.raw === raw) {
      map = hit.map;
    } else {
      map = foldCommentLikes(this.logEntries(`reactions/${postAuthor}`));
      this.reactionFolds.set(postAuthor, { raw, map });
    }
    return map.get(`${postId}:${commentKey}`) ?? map.get(commentKey) ?? [];
  }

  private postDislikeFolds = new Map<string, { raw: string | null; map: Map<string, string[]> }>();

  /** Disliker pubkeys for a post, from the author's `reactions/<postAuthor>` log. */
  public postDislikers(postAuthor: string, postId: string): string[] {
    const raw = localStorage.getItem(`freenet_log_reactions/${postAuthor}`);
    const hit = this.postDislikeFolds.get(postAuthor);
    let map: Map<string, string[]>;
    if (hit && hit.raw === raw) {
      map = hit.map;
    } else {
      map = foldPostDislikes(this.logEntries(`reactions/${postAuthor}`));
      this.postDislikeFolds.set(postAuthor, { raw, map });
    }
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

  private async pushLog(name: string, entries: LogEntry[]): Promise<void> {
    try {
      await this.net.push(`log:${name}`, { entries: Object.fromEntries(entries.map((e) => [`${e.author}:${e.id}`, e])) });
      this.unsentLogs.delete(name);
    } catch (e) {
      this.unsentLogs.add(name);
      console.warn("[Freenet] Could not send to log", name, e); // kept locally, sent again on the next refresh
      this.retryUnsent(name);
    }
  }

  /** Send a log's unsent entries again until the network takes them: nothing else refreshes someone else's inbox,
   *  so a message whose first send failed would otherwise never reach them. */
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private retryUnsent(name: string): void {
    if (this.retryTimers.has(name)) return;
    this.retryTimers.set(name, setTimeout(async () => {
      await this.refreshLog(name, true); // fetch, then send what the network does not have
      this.retryTimers.delete(name);
      if (this.unsentLogs.has(name)) this.retryUnsent(name);
    }, REFRESH_EVERY_MS));
  }

  /** Fetch a log (and subscribe to it), send it what only we have, then rebuild the state it feeds. */
  public async refreshLog(name: string, force = false): Promise<void> {
    if (!this.isConnected) return;
    const last = this.lastRefresh.get(`log:${name}`) ?? 0;
    if (!shouldFetch({ force, sinceLast: Date.now() - last, liveAge: this.net.liveAge(`log:${name}`), unsent: this.unsentLogs.has(name) })) return;
    this.lastRefresh.set(`log:${name}`, Date.now());
    try {
      const remote = (await this.net.get<{ entries: Record<string, LogEntry> }>(`log:${name}`))?.entries ?? {};
      await this.takeLog(name, remote);
    } catch (e) {
      console.warn("[Freenet] Could not fetch log", name, e);
    }
  }

  /** A followed log changed on the network: take the state or the new entries the node sent instead of fetching it again. */
  private async logChanged(name: string, c: Change): Promise<void> {
    try {
      const remote = c.state
        ? JSON.parse(c.state).entries
        : c.delta
          ? { ...this.readJson<Record<string, LogEntry>>(`freenet_log_${name}`, "{}"), ...JSON.parse(c.delta).entries }
          : undefined;
      if (remote) {
        this.lastRefresh.set(`log:${name}`, Date.now());
        return await this.takeLog(name, remote);
      }
    } catch (e) {
      console.warn("[Freenet] Could not apply the change of log", name, e);
    }
    return this.refreshLog(name, true);
  }

  /** Merge the network's entries of a log with ours, rebuild what it feeds, and send what only we have. */
  private async takeLog(name: string, remote: Record<string, LogEntry>): Promise<void> {
    const local = this.logEntries(name);
    // what only we have, or a newer state entry under a key the network holds an older one of (as the contract decides)
    const missing = local.filter((e) => {
      const r = remote[`${e.author}:${e.id}`];
      return !r || e.ts > r.ts || (e.ts === r.ts && e.sig > r.sig);
    });
    const remoteCount = Object.keys(remote).length;
    if (missing.length === 0 && local.length === remoteCount) {
      this.unsentLogs.delete(name);
      return;
    }
    const before = localStorage.getItem(`freenet_log_${name}`);
    this.saveLog(name, [...Object.values(remote), ...missing]); // later wins: ours where it is newer
    if (localStorage.getItem(`freenet_log_${name}`) !== before) { // unchanged log: no rebuild, no redraw
      this.applyLog(name);
      this.notifyListeners();
    }
    if (missing.length) await this.pushLog(name, missing);
    else this.unsentLogs.delete(name); // the network has everything we hold
    if (name === "communities") void this.checkJoined();
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
              this.storeNotification(this.me, { id: `n_${m.id}`, type: "chat", from: m.sender, text: "sent you an encrypted direct message 🔒", timestamp: m.timestamp, read: false, linkRoomId: m.room_id, isSecret: false });
          } else if (b.message.room_id === getSecretRoomId(this.me, peer)) {
            rooms.add(b.message.room_id);
            this.addSecretChatPeer(this.me, peer, e.ts);
            const m = b.message as ChatMessage;
            const seen = Math.max(read[m.room_id] ?? 0, Number(localStorage.getItem(`freenet_chat_cleared_${m.room_id}`) || 0));
            if (m.recipient === this.me && m.sender !== this.me && m.timestamp > seen)
              this.storeNotification(this.me, { id: `n_${m.id}`, type: "chat", from: m.sender, text: "sent you a secret chat message 🔐", timestamp: m.timestamp, read: false, linkRoomId: m.room_id, isSecret: true });
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
          // my signed membership and sealed room secret for a River room: sent with my first message there
          if (b.room.river && typeof b.river_join?.member === "string") localStorage.setItem(`river_join_${b.room.id}`, JSON.stringify(b.river_join));
          void this.refreshLog(`room/${b.room.id}`);
        } else if (b.type === "dm_ref" && typeof b.room === "string") {
          // a conversation of mine changed in its own log (the other side or my other device wrote there)
          const peer = dmPeerOf(b.room, this.me);
          if (peer && (e.author === this.me || e.author === peer) && !this.isBlocked(peer)) {
            rooms.add(b.room);
            if (isSecretRoomId(b.room)) this.addSecretChatPeer(this.me, peer, e.ts);
            else this.addChatPeer(this.me, peer, e.ts);
            void this.refreshLog(`dm/${b.room}`);
          }
        } else if (b.type === "room_ref" && e.author === this.me && typeof b.roomId === "string" && /^privroom_[\w]+$/.test(b.roomId)) {
          void this.refreshLog(`room/${b.roomId}`); // a room I made or joined: its log has the descriptor and my key
        }
      }
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
    } else if (name.startsWith("community-chat/")) {
      const id = name.slice("community-chat/".length);
      const comm = this.foldedCommunities().find((c) => c.id === id);
      const isMod = (pk: string) => !!comm && (pk === comm.creator || comm.moderators.includes(pk));
      const banned = (pk: string) => !!comm?.banned_members?.includes(pk);
      this.writeChat(`comm_${id}`, foldChat(entries, `comm_${id}`, (a, m) => a === m.sender || isMod(a), (sender) => banned(sender) || this.isBlocked(sender)), entries);
    } else if (name.startsWith("dm/")) {
      this.applyDm(name.slice("dm/".length));
    } else if (name.startsWith("room/")) {
      const id = name.slice("room/".length);
      const room = foldRoom(entries, id);
      if (room) {
        const list: PrivateRoom[] = JSON.parse(localStorage.getItem("freenet_private_rooms") || "[]");
        const existing = list.find((r) => r.id === id);
        const me = this.me;
        // Keep this user's membership if they already had access (via River invite code or saved key)
        const myMembership = me && (
          existing?.members?.includes(me) ||
          !!localStorage.getItem(`river_key_${id}`) ||
          this.rememberedRooms.has(id)
        );
        const mergedMembers = Array.from(new Set([
          ...(room.members || []),
          ...(existing?.members || []),
          ...(myMembership ? [me] : []),
        ]));
        const mergedKeys = {
          ...(room.encrypted_keys || {}),
          ...(existing?.encrypted_keys || {}),
        };
        const mergedRoom: PrivateRoom = {
          ...existing,
          ...room,
          avatar_url: room.avatar_url !== undefined ? (room.avatar_url || undefined) : existing?.avatar_url,
          pinned_message_id: room.pinned_message_id !== undefined ? (room.pinned_message_id || undefined) : existing?.pinned_message_id,
          members: mergedMembers,
          encrypted_keys: mergedKeys,
          is_channel: existing?.is_channel ?? room.is_channel,
          linked_room_id: existing?.linked_room_id ?? room.linked_room_id,
          river: existing?.river ?? room.river,
        };
        localStorage.setItem("freenet_private_rooms", JSON.stringify([...list.filter((r) => r.id !== id), mergedRoom]));
        this.saveRoomsToNode();
      }
      this.writeChat(id, foldChat(entries, id, (a, m) => a === m.sender, (sender) => this.isBlocked(sender)), entries);
    } else if (name.startsWith("reactions/")) {
      const author = name.slice("reactions/".length);
      this.reactionFolds.delete(author);
      this.postDislikeFolds.delete(author);
    }
  }

  /** Messages from the log, plus local ones the log has not received yet. */
  private writeChat(roomId: string, fromLog: ChatMessage[], entries: LogEntry[]): void {
    const inLog = new Set(entries.map((e) => /"id":"([^"]+)"/.exec(e.body)?.[1]).filter(Boolean)); // ids of the messages entries carry
    const local = this.readJson<ChatMessage[]>(`freenet_chat_${roomId}`, "[]");
    const merged = dedupeChat([...fromLog, ...local.filter((m) => !inLog.has(m.id))]);
    localStorage.setItem(`freenet_chat_${roomId}`, JSON.stringify(merged));
  }

  /** The key to encrypt to for `pubkey`: the one in their signed profile (Viso users), else the persona key. */
  private async encPubOf(pubkey: string): Promise<string> {
    if (pubkey === this.me && this.identity) return this.identity.encPub;
    const enc = (await this.getFeed(pubkey)).profile?.enc_pub;
    return enc && /^[0-9a-f]{64}$/.test(enc) ? enc : pubkey;
  }

  // A Viso persona has one app key per device, and the profile names only one: each device also publishes its key in
  // the log devices/<persona>, and direct messages carry a copy encrypted to every one of them.
  // shortcut: a key is never withdrawn (a lost device keeps getting copies), add a "revoke" entry when that matters

  /** Encryption keys `pubkey`'s devices published (entries by that persona only: the log contract checks the author). */
  private deviceKeys(pubkey: string): string[] {
    const keys = this.logEntries(`devices/${pubkey}`)
      .filter((e) => e.author === pubkey)
      .map((e) => {
        try {
          return JSON.parse(e.body).enc_pub;
        } catch {
          return null;
        }
      });
    return keys.filter((k): k is string => typeof k === "string" && /^[0-9a-f]{64}$/.test(k));
  }

  /** Every key a direct message to `pubkey` must be readable with: their profile's and their devices'. */
  private async encPubsOf(pubkey: string): Promise<string[]> {
    await this.refreshLog(`devices/${pubkey}`); // at most once a minute
    return [...new Set([await this.encPubOf(pubkey), ...this.deviceKeys(pubkey)])];
  }

  /** Publish this device's key once, so the messages sent to me reach it too. A local key is the same on every device. */
  private async announceDevice(identity: UserIdentity): Promise<void> {
    if (identity.encPub === identity.pubkey) return;
    const name = `devices/${identity.pubkey}`;
    await this.refreshLog(name, true);
    if (!this.deviceKeys(identity.pubkey).includes(identity.encPub)) await this.logAppend(name, { type: "device", enc_pub: identity.encPub });
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
        this.storeNotification(this.me, { id: `n_${m.id}`, type: "chat", from: peer, text: secret ? "sent you a secret chat message 🔐" : "sent you an encrypted direct message 🔒", timestamp: m.timestamp, read: false, linkRoomId: roomId, isSecret: secret });
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
    this.logEntriesCache.clear();
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
    if (roomId.startsWith("comm_")) return `community-chat/${roomId.slice(5)}`;
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
    const sigMsg = formatProfileSignatureMessage(identity.pubkey, displayName, bio, avatarUrl, identity.encPub, updatedAt);
    const sig = await identity.sign(sigMsg);

    const profile: ProfileInfo = {
      display_name: displayName,
      bio,
      avatar_url: avatarUrl,
      enc_pub: identity.encPub,
      updated_at: updatedAt,
      sig,
      cert: identity.cert,
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
    };
    post.sig = await identity.sign(formatPostSignatureMessage(post));

    const feed = await this.getFeed(identity.pubkey);
    feed.posts[id] = post;
    await this.saveFeed(feed, { owner: feed.owner, posts: { [id]: post }, following: [] });
    this.cachePeerPost(id, post);
    this.broadcast({ type: "post", post });
    void this.notifyMentions(caption, id, identity.pubkey);
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
    const sig = await identity.sign(formatDeleteSignatureMessage(identity.pubkey, postId));
    feed.deleted = { ...feed.deleted, [postId]: { sig, cert: identity.cert } };
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
    const sigMsg = formatCommentSignatureMessage(commentId, postId, identity.pubkey, text, timestamp);
    const sig = await identity.sign(sigMsg);

    const comment: Comment = {
      id: commentId,
      post_id: postId,
      author: identity.pubkey,
      text,
      timestamp,
      sig,
      cert: identity.cert,
    };

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
      const c: Comment = { ...old, text: "", timestamp: ts, cert: identity.cert, sig: "" };
      c.sig = await identity.sign(formatCommentSignatureMessage(c.id, c.post_id, c.author, c.text, c.timestamp));
      if (c.sig <= old.sig) continue; // signatures are deterministic: another timestamp gives another one
      post.comments[key] = c;
      await this.saveFeed(feed, { owner: feed.owner, posts: { [postId]: { ...post, likes: {}, comments: { [key]: c } } }, following: [] });
      return true;
    }
    return false;
  }

  // Like or unlike a post
  public async toggleLike(identity: UserIdentity, postAuthorPubkey: string, postId: string): Promise<boolean> {
    const feed = await this.getFeed(postAuthorPubkey);
    if (!feed.posts[postId]) return false;

    const post = feed.posts[postId];
    const liked = !post.likes?.[identity.pubkey]?.liked;
    const ts = Date.now();
    const sig = await identity.sign(formatLikeSignatureMessage(postAuthorPubkey, postId, identity.pubkey, liked, ts));
    post.likes = { ...post.likes, [identity.pubkey]: { liked, ts, sig, cert: identity.cert } };
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
    feed.following_sig = await identity.sign(
      formatFollowingSignatureMessage(identity.pubkey, feed.following_updated_at, feed.following)
    );
    const { following_updated_at, following_sig, following_cert } = feed;
    await this.saveFeed(feed, { owner: feed.owner, posts: {}, following: [...feed.following], following_updated_at, following_sig, following_cert });
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
  public async getExploreTimeline(identity: UserIdentity, opts: { prefer?: string[]; skip?: (pubkey: string) => boolean } = {}): Promise<Post[]> {
    const myFeed = await this.getFeed(identity.pubkey);
    const postMap: Record<string, Post> = { ...this.peerCache, ...myFeed.posts }; // feed copies win: a live copy misses later comments

    const core = new Set([...myFeed.following, ...(opts.prefer ?? []).slice(0, 40)]);
    const pool = Object.keys(this.knownPeers).filter((k) => k !== identity.pubkey && !core.has(k) && /^[0-9a-f]{64}$/.test(k) && !opts.skip?.(k));
    const lane = laneSample(pool, directoryWeights(this.logEntries("directory")), 30, this.laneSeed); // shortcut: no paging
    const peers = await Promise.all([...new Set([...core, ...lane])].map((k) => this.peerPosts(k)));
    for (const posts of peers) for (const p of posts) postMap[p.id] = p;

    return Object.values(postMap).sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Members of a community plus everyone who spoke in its chat (nobody has to "join" to chat). */
  public getCommunityParticipants(comm: Community): string[] {
    const banned = comm.banned_members ?? [];
    const speakers = this.visibleChat(`comm_${comm.id}`).map((m) => m.sender);
    return [...new Set([...comm.members, ...speakers])].filter((pk) => pk !== "system" && !banned.includes(pk)); // "system" is the seed communities' creator, not a person
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

  // ---- DMs with River users: River keeps DMs inside a room both are in (direct_messages), not in Radica's inbox log ----

  /** A River room that holds `peer` (their key there), with my key in it. */
  private async sharedRiverRoom(identity: UserIdentity, peer: string): Promise<PrivateRoom> {
    const rooms = await this.rivers();
    const list = this.storedPrivateRooms();
    for (const room of list) {
      if (!room.river || !room.members?.includes(identity.pubkey)) continue;
      const state = await rooms.load(room.river.owner);
      if (state && rooms.read(state, room.river.owner, this.riverKey(identity, room), this.riverJoin(room.id)).members.some((m) => m.vk === peer)) return room;
    }
    throw new Error("You share no River room with this contact: a DM to a River user goes through a room you are both in.");
  }

  private async sendRiverDm(identity: UserIdentity, peer: string, text: string): Promise<ChatMessage> {
    const room = await this.sharedRiverRoom(identity, peer);
    await (await this.rivers()).dm(this.riverKey(identity, room), room.river!.owner, peer, text, this.riverJoin(room.id), this.nickname());
    // what I sent is sealed to the other side, so my copy goes to my own inbox log, encrypted to myself: it survives a
    // refresh (this page has no storage of its own) and reaches my other devices
    const [roomId, id, timestamp] = [this.getRoomId(identity.pubkey, peer), `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`, Date.now()];
    const sealed = await encryptDirectMessage(identity.secretKey, identity.encPub, text);
    const sig = await identity.sign(formatChatMessageSignatureMessage(id, roomId, identity.pubkey, peer, sealed, timestamp));
    const message: ChatMessage = { id, room_id: roomId, sender: identity.pubkey, recipient: peer, text: sealed, timestamp, sig, enc_pub: identity.encPub, to_enc_pub: identity.encPub };
    const key = `freenet_chat_${roomId}`;
    localStorage.setItem(key, JSON.stringify([...JSON.parse(localStorage.getItem(key) || "[]"), message]));
    this.addChatPeer(identity.pubkey, peer);
    await this.chatAppend(roomId, { type: "chat", message });
    return { ...message, text };
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

  /** Sync group messages for all River rooms where I am a member:
   *  loads room state, updates decrypted message stubs in localStorage for unread counts,
   *  establishes a read baseline for newly discovered rooms, and stores chat notifications
   *  for incoming messages. True when new messages arrived. */
  public async syncRiverRooms(identity: UserIdentity, activeRoomId?: string | null): Promise<boolean> {
    const rooms = await this.rivers();
    const list = this.storedPrivateRooms();
    let fresh = false;
    for (const room of list) {
      const owner = room.river?.owner;
      if (!owner || !room.members?.includes(identity.pubkey)) continue;
      const state = await rooms.load(owner); // at most one read of the network per room every 30 s
      if (!state) continue;
      try {
        const msgs = await this.riverMessages(identity, room);
        const lastSeen = localReadMarks(localStorage)[room.id];
        if (lastSeen === undefined) {
          // a room seen for the first time: its history is not news
          seedReadMark(localStorage, room.id, msgs.reduce((max, m) => Math.max(max, m.timestamp), 0) || Date.now());
        } else if (room.id !== activeRoomId) {
          const newMsgs = msgs.filter((m) => m.sender && m.sender !== identity.pubkey && m.timestamp > lastSeen);
          if (newMsgs.length > 0) {
            fresh = true;
            for (const m of newMsgs) {
              const notifId = `rvmsg_${m.id}`;
              this.storeNotification(identity.pubkey, {
                id: notifId,
                type: "chat",
                from: m.sender,
                text: "sent a message in an encrypted Private Room 🔒",
                linkRoomId: room.id,
                timestamp: m.timestamp,
                read: false,
              });
            }
          }
        }
      } catch (e) {
        console.warn("[River] Could not sync room messages", room.id, e);
      }
    }
    return fresh;
  }

  /** DMs River users sent me: each sender joins my DM list (so the conversation shows up unopened), a stub with no text
   *  lands in the chat's list for the unread count, and the bell gets a note. True when something new arrived. */
  public async syncRiverDms(identity: UserIdentity): Promise<boolean> {
    const rooms = await this.rivers();
    const list = this.storedPrivateRooms();
    let fresh = false;
    for (const room of list) {
      const owner = room.river?.owner;
      if (!owner || !room.members?.includes(identity.pubkey)) continue;
      const state = await rooms.load(owner); // at most one read of the network per room every 30 s
      if (!state) continue;
      let dms;
      try {
        dms = rooms.read(state, owner, this.riverKey(identity, room), this.riverJoin(room.id)).dms;
      } catch {
        continue;
      }
      // a sender not known as River-only yet: reading the room sorts the River members from the Radica ones
      if (dms.some((d) => d.sender && !this.riverOnly.has(d.sender))) await this.riverMessages(identity, room).catch(() => []);
      for (const d of dms) {
        if (!d.sender || !this.riverOnly.has(d.sender)) continue;
        const roomId = this.getRoomId(identity.pubkey, d.sender);
        const id = `rvdm_${d.sig.slice(0, 16)}`;
        const key = `freenet_chat_${roomId}`;
        const stubs: ChatMessage[] = JSON.parse(localStorage.getItem(key) || "[]");
        if (stubs.some((m) => m.id === id)) continue;
        seedReadMark(localStorage, roomId, d.time_ms - 1); // the first one counts as unread
        stubs.push({ id, room_id: roomId, sender: d.sender, recipient: identity.pubkey, text: "", timestamp: d.time_ms, sig: d.sig });
        localStorage.setItem(key, JSON.stringify(stubs));
        this.addChatPeer(identity.pubkey, d.sender, d.time_ms);
        this.storeNotification(identity.pubkey, { id, type: "chat", from: d.sender, text: "sent you a direct message", timestamp: d.time_ms, read: false });
        fresh = true;
      }
    }
    return fresh;
  }

  /** My sent DMs plus those River users sent me in the River rooms we share, oldest first. */
  private async riverDmThread(identity: UserIdentity, peer: string): Promise<ChatMessage[]> {
    void this.refreshLog(`inbox/${identity.pubkey}`);
    const rooms = await this.rivers();
    const roomId = this.getRoomId(identity.pubkey, peer);
    const list = this.storedPrivateRooms();
    const seen = new Set<string>();
    const incoming: ChatMessage[] = [];
    for (const room of list) {
      if (!room.river || !room.members?.includes(identity.pubkey)) continue;
      const state = await this.riverState(rooms, room.river.owner);
      if (!state) continue;
      for (const d of rooms.read(state, room.river.owner, this.riverKey(identity, room), this.riverJoin(room.id)).dms) {
        if (d.sender !== peer || seen.has(d.sig)) continue;
        seen.add(d.sig);
        incoming.push({ id: `rvdm_${d.sig.slice(0, 16)}`, room_id: roomId, sender: peer, recipient: identity.pubkey, text: d.text, timestamp: d.time_ms, sig: d.sig });
      }
    }
    const sent = await Promise.all(
      this.visibleChat(roomId)
        .filter((m) => m.sender === identity.pubkey && m.text.startsWith("e2e:"))
        .map(async (m) => ({ ...m, text: await this.plain(`me|${identity.pubkey}|${m.text}`, () => decryptDirectMessage(identity.secretKey, identity.encPub, m.text)) }))
    );
    const cleared = Number(localStorage.getItem(`freenet_chat_cleared_${roomId}`) || 0);
    return [...sent, ...incoming].filter((m) => m.timestamp > cleared).sort((a, b) => a.timestamp - b.timestamp);
  }

  public async sendChatMessage(
    identity: UserIdentity,
    recipientPubkey: string,
    text: string,
    replyTo?: string
  ): Promise<ChatMessage> {
    await this.riverOnlyReady;
    if (this.riverOnly.has(recipientPubkey)) return this.sendRiverDm(identity, recipientPubkey, text);
    const roomId = this.getRoomId(identity.pubkey, recipientPubkey);
    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = Date.now();

    // 1-on-1 direct messages are end-to-end encrypted with X25519 ECDH + AES-256-GCM, to the key the recipient
    // published in their profile (a Viso user's app key) or else to their persona key
    await this.refresh(recipientPubkey, false, true); // not forced, urgent queue: fast check before sealing
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
    await Promise.all([this.riverOnlyReady, this.readKeysReady]);
    if (this.riverOnly.has(peerPubkey)) return this.riverDmThread(identity, peerPubkey);
    void this.refreshLog(`inbox/${identity.pubkey}`);
    const roomId = this.getRoomId(identity.pubkey, peerPubkey);
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
      await this.refresh(k); // not forced, as for direct messages
      const fromProfile = await this.encPubOf(k);
      if (fromProfile !== k) return fromProfile;
      // no key in their profile (a new Viso persona may have no profile yet): the key their device published, as DMs do
      await this.refreshLog(`devices/${k}`);
      return this.deviceKeys(k).pop() ?? k; // the newest device
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
    void this.refreshLog(`inbox/${identity.pubkey}`);
    await this.secretReady;
    return readSecretChat(this.secretTransport, identity, peerPubkey);
  }

  public async burnSecretMessage(roomId: string, messageId: string, peerPubkey?: string): Promise<void> {
    burnSecretMessage(this.secretTransport, roomId, messageId, this.identity?.pubkey, peerPubkey);
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

  public async sendCommunityChatMessage(
    identity: UserIdentity,
    communityId: string,
    text: string,
    replyTo?: string
  ): Promise<ChatMessage> {
    const comm = await this.getCommunity(communityId);
    if (comm && comm.banned_members && comm.banned_members.includes(identity.pubkey)) {
      throw new Error("You are banned from sending messages in this community.");
    }

    const roomId = `comm_${communityId}`;
    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = Date.now();
    const sigMsg = formatChatMessageSignatureMessage(id, roomId, identity.pubkey, "community", text, timestamp);
    const sig = await identity.sign(sigMsg);

    const message: ChatMessage = {
      id,
      room_id: roomId,
      sender: identity.pubkey,
      community_id: communityId,
      text,
      timestamp,
      sig,
      ...(replyTo ? { reply_to: replyTo } : {}),
    };

    const roomKey = `freenet_chat_${roomId}`;
    const raw = localStorage.getItem(roomKey);
    const messages: ChatMessage[] = raw ? JSON.parse(raw) : [];
    messages.push(message);
    localStorage.setItem(roomKey, JSON.stringify(messages));

    this.broadcast({ type: "chat", message });
    await this.logAppend(`community-chat/${communityId}`, { type: "chat", message });
    return message;
  }

  public computeLogJoins(roomId: string, entries: LogEntry[]): ChatMessage[] {
    return computeLogJoins(roomId, entries as any);
  }

  public async getCommunityChatMessages(communityId: string): Promise<ChatMessage[]> {
    void this.refreshLog(`community-chat/${communityId}`);
    const entries = this.logEntries(`community-chat/${communityId}`);
    const joins = this.computeLogJoins(`comm_${communityId}`, entries);
    const messages = this.visibleChat(`comm_${communityId}`);
    return [...messages, ...joins].sort((a, b) => a.timestamp - b.timestamp);
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

  private visibleChatCache = new Map<string, { stored: ChatMessage[]; cleared: number; visible: ChatMessage[] }>();

  /** Do not change the returned list: it is shared until the room's stored messages or its clear mark change. */
  public visibleChat(roomId: string): ChatMessage[] {
    const cleared = Number(localStorage.getItem(`freenet_chat_cleared_${roomId}`) || 0);
    const stored = this.readJson<ChatMessage[]>(`freenet_chat_${roomId}`, "[]"); // the same array until the stored text changes
    // the unread badge and the chat list ask for every conversation on each redraw: dedupe and sort once per change
    const hit = this.visibleChatCache.get(roomId);
    if (hit?.stored === stored && hit.cleared === cleared) return hit.visible;
    const visible = dedupeChat(stored).filter((m) => m.timestamp > cleared);
    this.visibleChatCache.set(roomId, { stored, cleared, visible });
    return visible;
  }

  /** The River room behind a chat room id, if it is one I can act in. */
  private riverRoomOf(roomId: string): PrivateRoom | undefined {
    const list = this.storedPrivateRooms();
    return this.identity ? list.find((r) => r.id === roomId && r.river) : undefined;
  }

  public async deleteChatMessage(roomId: string, messageId: string): Promise<void> {
    const river = this.riverRoomOf(roomId);
    if (river) {
      // River deletes for everyone, and only the author's own messages (others' it ignores)
      await (await this.rivers()).act(this.riverKey(this.identity!, river), river.river!.owner, "delete", messageId, {}, this.riverJoin(roomId), this.nickname());
      this.notifyListeners();
      return;
    }
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
    const river = this.riverRoomOf(roomId);
    if (river) {
      // River's own edit, sealed with the room's key
      await (await this.rivers()).act(this.riverKey(identity, river), river.river!.owner, "edit", messageId, { text: newText }, this.riverJoin(roomId), this.nickname());
      this.notifyListeners();
      return;
    }
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
    } else if (!roomId.startsWith("comm_")) {
      const dmPair = /^([0-9a-f]{64}):([0-9a-f]{64})$/.exec(roomId);
      if (dmPair) {
        const peer = dmPair[1] === this.me ? dmPair[2] : dmPair[1];
        if (peer) {
          const targetEncPub = await this.encPubOf(peer);
          encryptedText = await encryptDirectMessage(identity.secretKey, targetEncPub, newText);
        }
      }
    }
    // only a community's chat is public by design: anything else goes out sealed or not at all
    if (encryptedText === newText && !roomId.startsWith("comm_")) throw new Error("This message cannot be edited here");

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
    const river = this.riverRoomOf(roomId);
    if (river) {
      const rooms = await this.rivers();
      const [owner, key, join] = [river.river!.owner, this.riverKey(this.identity!, river), this.riverJoin(roomId)];
      const state = rooms.cached(owner);
      const mine = !!state && !!rooms.read(state, owner, key, join).messages.find((m) => m.id === messageId)?.reactions[emoji]?.includes(vkOf(key));
      await rooms.act(key, owner, mine ? "unreact" : "react", messageId, { emoji }, join, this.nickname());
      this.notifyListeners();
      return;
    }
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
      if (this.riverOnly.has(pk)) continue; // a River key has no Radica feed to fetch
      const k = this.knownPeers[pk];
      if (pk === this.me || (k?.avatar_url && !k.display_name.startsWith("Persona @"))) continue;
      jobs.push(this.nameFromStoredFeed(pk)); // what an earlier visit kept: no network needed
      if (Date.now() - (this.lastRefresh.get(pk) ?? 0) > LIVE_RECHECK_MS) jobs.push(this.refresh(pk, true)); // people with no avatar are not refetched every minute; forced past the chat pause but on the background queue: a feed nobody published holds its slot until the 45 s timeout, and in the foreground queue that stalls images and River rooms
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
    if (!profile?.display_name) return;
    const k = this.knownPeers[pk];
    if (k?.display_name && !k.display_name.startsWith("Persona @") && k.avatar_url) return; // learned meanwhile
    this.knownPeers[pk] = { display_name: profile.display_name, avatar_url: profile.avatar_url || k?.avatar_url };
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

  private storeNotification(owner: string, item: NotificationItem): void {
    if (this.dismissedNotifications(owner).includes(item.id)) return; // the log would bring it back otherwise
    if (owner === this.me && item.timestamp <= (this.clearUpTo ??= this.foldInboxUpTo("notif_clear"))) return;
    // a notification made after the inbox was read (River DMs) still honours "mark all read"
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
    await this.logAppend("communities", {
      type: "community_create",
      community: {
        id,
        name: name.trim(),
        description: description.trim(),
        avatar_url: avatarUrl,
        require_trusted_to_post: requireTrustedToPost,
      },
    });
    return (await this.getCommunity(id))!;
  }

  /** Change a community's name and description. Only its creator can: the fold ignores a later `community_create` from anyone else. */
  public async updateCommunity(
    identity: UserIdentity,
    communityId: string,
    name: string,
    description: string,
    requireTrustedToPost?: boolean
  ): Promise<Community> {
    const comm = await this.getCommunity(communityId);
    if (!comm) throw new Error("Community not found");
    if (comm.creator !== identity.pubkey) throw new Error("Only the community's creator can edit it.");
    await this.logAppend("communities", {
      type: "community_create",
      community: {
        id: comm.id,
        name: name.trim(),
        description: description.trim(),
        require_trusted_to_post: requireTrustedToPost,
      },
    });
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
    if (identity.pubkey !== comm.creator && identity.pubkey !== modPubkey) {
      return { success: false, msg: "Only the community creator can demote moderators." };
    }
    await this.communityEvent("community_mod_remove", comm.id, { target: modPubkey });
    return { success: true, msg: "Moderator removed." };
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
    if (targetPubkey === comm.creator) {
      return { success: false, msg: "The community creator/owner cannot be banned!" };
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
    const deleted = new Set(comm.deleted_post_ids);
    return timeline.filter(
      (p) =>
        (p.community_id === comm.id || p.community_id === comm.slug) &&
        !deleted.has(p.id)
    );
  }

  // -------------------------------------------------------------
  // E2EE Private Rooms
  // -------------------------------------------------------------

  // ---- Private rooms on River (riverRooms.ts); rooms without `river` are the older log-based ones ----

  public isRiverOwner(identity: UserIdentity, room: PrivateRoom): boolean {
    if (!room.river?.owner) return room.creator === identity.pubkey;
    const derived = vkOf(roomOwnerSk(identity.secretKey, room.id));
    if (derived === room.river.owner) return true;
    const given = localStorage.getItem(`river_key_${room.id}`);
    if (given && vkOf(hexToBytes(given)) === room.river.owner) return true;
    return false;
  }

  /** My River key in a room: the one a link, code or imported River identity gave me, else the derived owner key in a
   *  room I made here, else my identity key. */
  private riverKey(identity: UserIdentity, room: PrivateRoom): Uint8Array {
    if (room.river?.owner && vkOf(roomOwnerSk(identity.secretKey, room.id)) === room.river.owner) {
      return roomOwnerSk(identity.secretKey, room.id);
    }
    const given = localStorage.getItem(`river_key_${room.id}`);
    if (given) return hexToBytes(given);
    return room.creator === identity.pubkey ? roomOwnerSk(identity.secretKey, room.id) : identity.secretKey;
  }

  /** The room's owner key when I own it: derived for rooms made here, or the imported River key that is the owner's. */
  private riverOwnerKey(identity: UserIdentity, room: PrivateRoom): Uint8Array {
    const key = this.riverKey(identity, room);
    if (vkOf(key) === room.river?.owner) return key;
    const derived = roomOwnerSk(identity.secretKey, room.id);
    if (vkOf(derived) === room.river?.owner) return derived;
    return key;
  }

  private riverJoin(roomId: string): RiverJoin | undefined {
    try {
      return JSON.parse(localStorage.getItem(`river_join_${roomId}`) || "null") ?? undefined;
    } catch {
      return undefined;
    }
  }

  private nickname(): string {
    return this.knownPeers[this.me]?.display_name || `Persona @${personaName(this.me).substring(0, 6)}`;
  }

  /** A room I made before rooms moved to River: made again on River (same name and members, under an id derived from
   *  the old one, so a second device lands on the same room) and the old one points to it. Old messages stay behind. */
  private migrating = new Set<string>();
  private async moveToRiver(identity: UserIdentity, room: PrivateRoom): Promise<void> {
    if (this.migrating.has(room.id)) return;
    this.migrating.add(room.id);
    try {
      const name = await this.getPrivateRoomDecryptedName(identity, room);
      const next = await this.createPrivateRoom(identity, name, room.members, `${room.id}_r`, {
        avatar_url: room.avatar_url,
        is_channel: room.is_channel,
        linked_room_id: room.linked_room_id,
      });
      await this.logAppend(`room/${room.id}`, { type: "room_moved", roomId: room.id, to: next.id });
      this.notifyListeners();
    } catch (e) {
      console.warn("[River] Could not move room", room.id, e); // tried again next session
    }
  }

  /** The old room was moved to River by its creator. */
  private movedToRiver(room: PrivateRoom): boolean {
    return this.logEntries(`room/${room.id}`).some((e) => {
      try {
        return e.author === room.creator && JSON.parse(e.body).type === "room_moved";
      } catch {
        return false;
      }
    });
  }

  public mergeRemotePrivateRooms(incoming: PrivateRoom[]): void {
    const raw = localStorage.getItem("freenet_private_rooms");
    const list: PrivateRoom[] = raw ? JSON.parse(raw) : [];
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
          avatar_url: room.avatar_url !== undefined ? (room.avatar_url || undefined) : existing.avatar_url,
          pinned_message_id: room.pinned_message_id !== undefined ? (room.pinned_message_id || undefined) : existing.pinned_message_id,
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
      localStorage.setItem("freenet_private_rooms", JSON.stringify(list));
      this.saveRoomsToNode();
    }
  }

  /** A note in my own inbox that I belong to this room, so a fresh browser (or a lost local cache) can find it again. */
  private rememberedRooms = new Set<string>();
  private async rememberRoom(roomId: string): Promise<void> {
    if (this.rememberedRooms.has(roomId)) return;
    this.rememberedRooms.add(roomId);
    const known = this.logEntries(`inbox/${this.me}`).some((e) => {
      try {
        const b = JSON.parse(e.body);
        return e.author === this.me && b.type === "room_ref" && b.roomId === roomId;
      } catch {
        return false;
      }
    });
    if (!known) await this.logAppend(`inbox/${this.me}`, { type: "room_ref", roomId }).catch((e) => console.warn("[Freenet] room_ref:", e));
  }

  public async createPrivateRoom(
    identity: UserIdentity,
    name: string,
    memberPubkeys: string[],
    roomId = `privroom_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    opts?: { is_channel?: boolean; linked_room_id?: string; avatar_url?: string; public?: boolean }
  ): Promise<PrivateRoom> {
    // public: not encrypted, and one invite link serves everyone (each holder joins as their own member)
    const owner = await (await this.rivers()).create(identity.secretKey, roomId, name, this.nickname(), !opts?.public);
    const room: PrivateRoom = {
      id: roomId,
      creator: identity.pubkey,
      name_encrypted: "", // the name lives sealed in the River room
      ...(opts?.avatar_url ? { avatar_url: opts.avatar_url.trim() } : {}),
      members: [identity.pubkey],
      encrypted_keys: {},
      created_at: Date.now(),
      sig: "",
      river: { owner },
      ...(opts?.is_channel ? { is_channel: true } : {}),
      ...(opts?.linked_room_id ? { linked_room_id: opts.linked_room_id } : {}),
    };
    // the room's descriptor tells members and my other devices where it is; River decides who is in it
    this.mergeRemotePrivateRooms([room]);
    this.broadcast({ type: "private_room", room });
    await this.logAppend(`room/${roomId}`, { type: "private_room", room });
    await this.rememberRoom(roomId);
    for (const member of new Set(memberPubkeys.filter((m) => m && m !== identity.pubkey))) {
      await this.inviteMemberToPrivateRoom(identity, roomId, member).catch((e) => console.warn("[River] Could not invite", member, e));
    }
    seedReadMark(localStorage, roomId);
    this.notifyListeners();
    return (await this.getPrivateRooms(identity)).find((r) => r.id === roomId) ?? room;
  }

  public async setRoomLinkedDiscussion(
    identity: UserIdentity,
    roomId: string,
    linkedRoomId?: string
  ): Promise<PrivateRoom | null> {
    const raw = localStorage.getItem("freenet_private_rooms");
    const list: PrivateRoom[] = raw ? JSON.parse(raw) : [];
    const room = list.find((r) => r.id === roomId);
    if (!room || room.creator !== identity.pubkey) return null;
    room.linked_room_id = linkedRoomId || undefined;
    this.mergeRemotePrivateRooms([room]);
    this.broadcast({ type: "private_room", room });
    await this.logAppend(`room/${roomId}`, { type: "private_room", room });
    this.notifyListeners();
    return room;
  }

  public async setRoomAvatar(
    identity: UserIdentity,
    roomId: string,
    avatarUrl?: string
  ): Promise<PrivateRoom | null> {
    const raw = localStorage.getItem("freenet_private_rooms");
    const list: PrivateRoom[] = raw ? JSON.parse(raw) : [];
    const room = list.find((r) => r.id === roomId);
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
    this.broadcast({ type: "private_room", room });
    await this.logAppend(`room/${roomId}`, {
      type: "room_avatar",
      roomId,
      avatar_url: room.avatar_url || "",
    }).catch((e) => console.warn("[Freenet] room_avatar log:", e));
    this.notifyListeners();
    return room;
  }

  public async setRoomPinnedMessage(
    identity: UserIdentity,
    roomId: string,
    messageId?: string | null
  ): Promise<void> {
    const cleanId = messageId && messageId.trim() ? messageId.trim() : undefined;
    if (roomId.startsWith("privroom_")) {
      const raw = localStorage.getItem("freenet_private_rooms");
      const list: PrivateRoom[] = raw ? JSON.parse(raw) : [];
      const room = list.find((r) => r.id === roomId);
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
        this.broadcast({ type: "private_room", room });
        await this.logAppend(`room/${roomId}`, {
          type: "room_pin",
          roomId,
          messageId: cleanId || "",
        }).catch((e) => console.warn("[Freenet] room_pin log:", e));
      }
    } else {
      localStorage.setItem(`freenet_pin_${roomId}`, cleanId || "");
      await this.logAppend(this.logOfRoom(roomId), {
        type: "room_pin",
        roomId,
        messageId: cleanId || "",
      }).catch((e) => console.warn("[Freenet] room_pin log:", e));
    }
    this.notifyListeners();
  }

  public getRoomPinnedMessageId(roomId: string): string | null {
    if (roomId.startsWith("privroom_")) {
      const raw = localStorage.getItem("freenet_private_rooms");
      const list: PrivateRoom[] = raw ? JSON.parse(raw) : [];
      const room = list.find((r) => r.id === roomId);
      if (room?.pinned_message_id) return room.pinned_message_id;
    }
    return localStorage.getItem(`freenet_pin_${roomId}`) || null;
  }

  public async getPrivateRooms(identity: UserIdentity): Promise<PrivateRoom[]> {
    void this.refreshLog(`inbox/${identity.pubkey}`); // invitations
    const raw = localStorage.getItem("freenet_private_rooms");
    const list: PrivateRoom[] = raw ? JSON.parse(raw) : [];
    let listModified = false;
    for (const r of list) {
      if (r?.river && !r.members?.includes(identity.pubkey) && (localStorage.getItem(`river_key_${r.id}`) || this.rememberedRooms.has(r.id))) {
        r.members = [...new Set([...(r.members || []), identity.pubkey])];
        listModified = true;
      }
      if (!r?.river && r.members?.includes(identity.pubkey)) {
        void this.refreshLog(`room/${r.id}`);
        if (this.isConnected) void this.rememberRoom(r.id); // rooms made before the inbox note existed
      }
    }
    if (listModified) {
      localStorage.setItem("freenet_private_rooms", JSON.stringify(list));
      this.saveRoomsToNode();
    }
    for (const r of list)
      if (!r.river && r.creator === identity.pubkey && this.isConnected && this.logEntries(`room/${r.id}`).length && !this.movedToRiver(r))
        void this.moveToRiver(identity, r);
    if (this.isConnected && !this.syncingAccess) {
      this.syncingAccess = true;
      void this.syncRoomAccess(identity, list).finally(() => (this.syncingAccess = false));
    }
    // Only return rooms where current identity is an authorized member (and has not left: an old invite still lists me)
    return list.filter(
      (r) => !(!r.river && this.movedToRiver(r))
    ).filter(
      (r) =>
        r &&
        ((r.members && r.members.includes(identity.pubkey)) || (r.river && (!!localStorage.getItem(`river_key_${r.id}`) || this.rememberedRooms.has(r.id)))) &&
        !localStorage.getItem(`freenet_room_left_${identity.pubkey}_${r.id}`) &&
        !hasLeftRoom(this.logEntries(`room/${r.id}`), r.id, identity.pubkey)
    );
  }

  private syncingAccess = false;

  /** What my other devices (the desktop app) need to open my River rooms, which this page keeps only in its own storage
   *  and the node's delegate: each room's owner, my key and join, sealed to myself in my inbox (`river_access`). Rooms
   *  I left here are marked removed there too (`room_hide`). Written once per room, again when it changes. */
  private async syncRoomAccess(identity: UserIdentity, list: PrivateRoom[]): Promise<void> {
    const inbox = `inbox/${identity.pubkey}`;
    for (const r of list) {
      if (localStorage.getItem(`freenet_room_left_${identity.pubkey}_${r.id}`)) {
        const mark = `room_hide_sent_${r.id}`;
        if (localStorage.getItem(mark)) continue;
        localStorage.setItem(mark, "1");
        await this.logAppend(inbox, { type: "room_hide", roomId: r.id }).catch(() => localStorage.removeItem(mark));
        continue;
      }
      if (!r.river) continue;
      const access = JSON.stringify({
        owner: r.river.owner,
        creator: r.creator,
        k: localStorage.getItem(`river_key_${r.id}`) ?? "", // empty: my identity key (or the owner key derived from it)
        join: this.riverJoin(r.id) ?? null,
        is_channel: !!r.is_channel,
        linked_room_id: r.linked_room_id ?? null,
      });
      const mark = `river_access_sent_${r.id}`;
      if (localStorage.getItem(mark) === access) continue;
      localStorage.setItem(mark, access);
      const sealed = await encryptDirectMessage(identity.secretKey, identity.encPub, access);
      await this.logAppend(inbox, { type: "river_access", roomId: r.id, sealed }).catch(() => localStorage.removeItem(mark));
    }
  }

  public async getPrivateRoomKey(
    identity: UserIdentity,
    room: PrivateRoom
  ): Promise<Uint8Array | null> {
    if (room.river) return null; // River seals the room: there is no Radica room key
    const cached = this.privateRoomKeyCache.get(room.id);
    if (cached) return cached;
    await this.readKeysReady;

    const myEncryptedKey = room.encrypted_keys ? room.encrypted_keys[identity.pubkey] : undefined;
    if (!myEncryptedKey) return null;

    // Encrypted by the moderator who last rotated the keys, by the creator, or by myself when I joined through an invite link
    const key =
      (room.keys_enc_pub ? await decryptRoomKeyFromPeer(identity.secretKey, room.keys_enc_pub, myEncryptedKey) : null) ??
      (await decryptRoomKeyFromPeer(identity.secretKey, room.creator_enc_pub || room.creator, myEncryptedKey)) ??
      (await decryptRoomKeyFromPeer(identity.secretKey, identity.encPub, myEncryptedKey));
    if (key) {
      this.privateRoomKeyCache.set(room.id, key);
      return key;
    }
    return null;
  }

  public async getPrivateRoomDecryptedName(
    identity: UserIdentity,
    room: PrivateRoom
  ): Promise<string> {
    if (room.river) {
      // lists are drawn often: the copy here, and the network read behind (the list is drawn again when it lands)
      const rooms = await this.rivers();
      const state = rooms.cached(room.river.owner);
      if (!state) void rooms.load(room.river.owner).then((s) => s && this.notifyListeners());
      try {
        const name = state ? rooms.read(state, room.river.owner, this.riverKey(identity, room), this.riverJoin(room.id)).name : null;
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
    newMemberPubkey: string
  ): Promise<PrivateRoom> {
    await this.refreshLog(`room/${roomId}`, true); // start from the room as the network has it: a stale copy would undo others
    const rooms = await this.getPrivateRooms(identity);
    const room = rooms.find((r) => r.id === roomId);
    if (!room) throw new Error("Private room not found or unauthorized");
    // members decrypt their key with the creator's public key, and peers accept the room only from its creator
    if (room.creator !== identity.pubkey) throw new Error("Only the room creator can invite (others can share the invite link)");
    if (room.river) {
      const join = await (await this.rivers()).invite(this.riverOwnerKey(identity, room), room.river.owner, await this.encPubOf(newMemberPubkey));
      if (!room.members.includes(newMemberPubkey)) room.members.push(newMemberPubkey);
      this.replacePrivateRoom(room);
      await this.logAppend(`room/${room.id}`, { type: "private_room", room });
      await this.logAppend(`inbox/${newMemberPubkey}`, { type: "room_invite", room, river_join: join }); // the secret in it is sealed to them
      this.addNotification(newMemberPubkey, { type: "chat", from: identity.pubkey, text: `invited you to an encrypted Private Room 🔒`, linkRoomId: room.id });
      this.notifyListeners();
      return room;
    }

    const roomKey = await this.getPrivateRoomKey(identity, room);
    if (!roomKey) throw new Error("Cannot decrypt room key to invite peer");

    const encKey = await encryptRoomKeyForPeer(identity.secretKey, await this.encPubOf(newMemberPubkey), roomKey);
    room.encrypted_keys[newMemberPubkey] = encKey;
    if (!room.members.includes(newMemberPubkey)) {
      room.members.push(newMemberPubkey);
    }

    this.mergeRemotePrivateRooms([room]);
    this.broadcast({ type: "private_room", room });
    await this.logAppend(`room/${room.id}`, { type: "private_room", room });
    await this.logAppend(`inbox/${newMemberPubkey}`, { type: "room_invite", room });

    this.addNotification(newMemberPubkey, {
      type: "chat",
      from: identity.pubkey,
      text: `invited you to an encrypted Private Room 🔒`,
      linkRoomId: room.id,
    });

    this.notifyListeners();
    return room;
  }

  /**
   * My room list also lives in the node's delegate: the page keeps its state in the URL hash, which the shell cuts at 8192
   * chars, so a long room list does not fit. (The `room_ref` notes in my inbox log bring rooms back too, from the network.)
   */
  private roomsSaveTimer?: ReturnType<typeof setTimeout>;
  private saveRoomsToNode(): void {
    if (!this.me) return;
    clearTimeout(this.roomsSaveTimer);
    this.roomsSaveTimer = setTimeout(() => void this.putRoomsToNode(), 500);
  }
  private async putRoomsToNode(): Promise<void> {
    const { nodeGet, nodePut } = await import("./delegate.ts");
    let saved: PrivateRoom[] = [];
    try {
      saved = JSON.parse((await nodeGet(`privrooms:${this.me}`)) || "[]");
    } catch {}
    const local = JSON.parse(localStorage.getItem("freenet_private_rooms") || "[]") as PrivateRoom[];
    await nodePut(`privrooms:${this.me}`, JSON.stringify(mergeRoomBackup(local, saved, this.me)));
  }

  private async restoreRoomsFromNode(): Promise<void> {
    const { nodeGet } = await import("./delegate.ts");
    const raw = await nodeGet(`privrooms:${this.me}`);
    if (!raw) return;
    let saved: PrivateRoom[];
    try {
      saved = JSON.parse(raw);
    } catch {
      return;
    }
    for (const r of saved) // keys invite links gave me in River rooms, and what lets them in
      if (r?.river && !localStorage.getItem(`river_key_${r.id}`)) {
        const [k, join] = [await nodeGet(`river-key:${r.id}`), await nodeGet(`river-join:${r.id}`)];
        if (k) localStorage.setItem(`river_key_${r.id}`, k);
        if (join) localStorage.setItem(`river_join_${r.id}`, join);
      }
    const localList = (JSON.parse(localStorage.getItem("freenet_private_rooms") || "[]") as PrivateRoom[]);
    const haveMap = new Map(localList.map((r) => [r.id, r]));
    const missing = saved.filter(
      (r) =>
        r?.id &&
        Array.isArray(r.members) &&
        r.members.includes(this.me) &&
        (!haveMap.has(r.id) || !haveMap.get(r.id)!.members?.includes(this.me))
    );
    if (!missing.length) return;
    this.mergeRemotePrivateRooms(missing);
    for (const r of missing) if (!r.river) void this.refreshLog(`room/${r.id}`); // the log has the latest members and keys
    this.notifyListeners();
  }

  /** Store `room` as the room's state: unlike `mergeRemotePrivateRooms`, members that left stay gone. */
  private replacePrivateRoom(room: PrivateRoom): void {
    const list: PrivateRoom[] = JSON.parse(localStorage.getItem("freenet_private_rooms") || "[]");
    localStorage.setItem("freenet_private_rooms", JSON.stringify([...list.filter((r) => r.id !== room.id), room]));
    this.saveRoomsToNode();
  }

  /** The creator, or a moderator the creator named, removes a member and rotates the room key for the others. */
  public async kickMemberFromPrivateRoom(
    identity: UserIdentity,
    roomId: string,
    targetPubkey: string
  ): Promise<PrivateRoom> {
    await this.refreshLog(`room/${roomId}`, true); // start from the room as the network has it: a stale copy would undo others
    const rooms = await this.getPrivateRooms(identity);
    const room = rooms.find((r) => r.id === roomId);
    if (!room) throw new Error("Private room not found or unauthorized");
    if (room.river) {
      const byOwner = room.creator === identity.pubkey;
      const mods = this.rosters.get(room.id)?.moderators ?? room.moderators ?? [];
      if (!byOwner && !mods.includes(identity.pubkey)) throw new Error("Only the room owner or a moderator can remove members");
      // River bans them; the owner's ban (or the owner's next visit after a moderator's) seals what comes next under a new secret
      await (await this.rivers()).kick(this.riverKey(identity, room), room.river.owner, await this.encPubOf(targetPubkey));
      room.members = room.members.filter((m) => m !== targetPubkey);
      if (byOwner) {
        this.replacePrivateRoom(room);
        await this.logAppend(`room/${room.id}`, { type: "private_room", room });
      }
      // the member list follows; a channel's subscriber list too
      await this.logAppend(`room/${room.id}`, { type: "room_kick", roomId: room.id, target: targetPubkey });
      this.notifyListeners();
      return room;
    }

    const byCreator = room.creator === identity.pubkey;
    const mods = room.moderators ?? [];
    if (!byCreator && !mods.includes(identity.pubkey)) throw new Error("Only the room creator or a moderator can kick members");
    if (targetPubkey === room.creator) throw new Error("The room creator cannot be kicked");
    if (!byCreator && mods.includes(targetPubkey)) throw new Error("Only the room creator can kick a moderator");

    // 1. Remove from members (and moderators), and drop their key
    room.members = room.members.filter((m) => m !== targetPubkey);
    room.moderators = mods.filter((m) => m !== targetPubkey);
    delete room.encrypted_keys?.[targetPubkey];

    // 2. Key rotation for forward secrecy: a new symmetric key for the room, encrypted by me for each remaining member
    const newRoomKey = generateRoomKey();
    const currentName = await this.getPrivateRoomDecryptedName(identity, room);
    room.name_encrypted = await encryptWithSymmetricKey(newRoomKey, currentName);
    this.privateRoomKeyCache.set(room.id, newRoomKey);
    const updatedKeys: Record<string, string> = {};
    for (const m of room.members) {
      try {
        updatedKeys[m] = await encryptRoomKeyForPeer(identity.secretKey, await this.encPubOf(m), newRoomKey);
      } catch (e) {
        console.warn(`Could not re-encrypt key for member ${m}:`, e);
      }
    }
    room.encrypted_keys = updatedKeys;
    room.keys_enc_pub = byCreator ? undefined : identity.encPub;

    this.replacePrivateRoom(room);
    this.broadcast({ type: "private_room_kick", roomId, kicked: targetPubkey, room });
    // the creator publishes the whole descriptor; a moderator can only publish the kick, which peers check against the moderators list
    if (byCreator) await this.logAppend(`room/${room.id}`, { type: "private_room", room });
    else
      await this.logAppend(`room/${room.id}`, {
        type: "room_kick",
        roomId,
        target: targetPubkey,
        name_encrypted: room.name_encrypted,
        encrypted_keys: room.encrypted_keys,
        keys_enc_pub: room.keys_enc_pub,
      });
    this.notifyListeners();
    return room;
  }

  /** A member leaves a room: the room log says so, and the room disappears from my list. The creator cannot leave. */
  public async leavePrivateRoom(identity: UserIdentity, roomId: string): Promise<void> {
    const room = (await this.getPrivateRooms(identity)).find((r) => r.id === roomId);
    if (!room) throw new Error("Private room not found or unauthorized");
    // the creator only removes the room from their own list (members keep it); a member also leaves its roster
    if (room.creator !== identity.pubkey) await this.logAppend(`room/${roomId}`, { type: "room_leave", roomId });
    localStorage.setItem(`freenet_room_left_${identity.pubkey}_${roomId}`, String(Date.now()));
    // in my inbox too: page storage does not outlive the session, and my other devices drop it as well
    await this.logAppend(`inbox/${identity.pubkey}`, { type: "room_hide", roomId });
    this.privateRoomKeyCache.delete(roomId);
    const keys = { ...room.encrypted_keys };
    delete keys[identity.pubkey];
    this.replacePrivateRoom({
      ...room,
      members: room.members.filter((m) => m !== identity.pubkey),
      moderators: (room.moderators ?? []).filter((m) => m !== identity.pubkey),
      encrypted_keys: keys,
    });
    this.notifyListeners();
  }

  /** Creator only: let a member kick others (or take that back). */
  public async setPrivateRoomModerator(identity: UserIdentity, roomId: string, target: string, on: boolean): Promise<PrivateRoom> {
    await this.refreshLog(`room/${roomId}`, true);
    const room = (await this.getPrivateRooms(identity)).find((r) => r.id === roomId);
    if (!room) throw new Error("Private room not found or unauthorized");
    const isOwner = this.isRiverOwner(identity, room);
    if (room.river) {
      if (!isOwner) throw new Error("Only the room creator can name moderators");
    } else {
      if (room.creator !== identity.pubkey) throw new Error("Only the room creator can name moderators");
    }
    const roster = room.river ? this.rosters.get(room.id) : undefined;
    const creator = roster?.creator ?? room.creator;
    if (target === creator || !(roster?.members ?? room.members).includes(target)) throw new Error("Only a member other than the creator can be a moderator");
    const current = roster?.moderators ?? room.moderators ?? [];
    room.moderators = on ? [...new Set([...current, target])] : current.filter((m) => m !== target);
    if (room.river) {
      // River's deputies: the owner lists them, and the room enforces their bans
      const resolveVk = async (m: string): Promise<string> => {
        if (roster?.memberVks?.[m]) return roster.memberVks[m];
        if (/^[0-9a-f]{64}$/i.test(m)) return m;
        return this.encPubOf(m);
      };
      const vks = await Promise.all(room.moderators.map(resolveVk));
      await (await this.rivers()).setDeputies(this.riverOwnerKey(identity, room), room.river.owner, vks);
    }
    this.replacePrivateRoom(room);
    this.broadcast({ type: "private_room", room });
    await this.logAppend(`room/${room.id}`, { type: "private_room", room });
    this.notifyListeners();
    return room;
  }

  /** Who is in each River room as River's contract says (persona where I know who holds the key, else the River key). */
  /** River keys with no Radica persona behind them: contacts that come from River itself. */
  /** ...mapped to the rooms they are in (id -> name). Kept: a DM to one must not fall back to the inbox after a reload. */
  public riverOnly = new Map<string, Record<string, string>>();
  /** Filled from the node's storage after sign-in; sending or reading a DM waits for it. */
  private riverOnlyReady: Promise<void> = Promise.resolve();
  private riverOnlySaveTimer: ReturnType<typeof setTimeout> | undefined;
  private saveRiverOnly(): void {
    clearTimeout(this.riverOnlySaveTimer);
    this.riverOnlySaveTimer = setTimeout(async () => {
      const { nodePut } = await import("./delegate.ts");
      await nodePut(`river-only:${this.me}`, JSON.stringify(Object.fromEntries(this.riverOnly)));
    }, 500);
  }
  private async restoreRiverOnly(): Promise<void> {
    const { nodeGet } = await import("./delegate.ts");
    try {
      for (const [vk, rooms] of Object.entries(JSON.parse((await nodeGet(`river-only:${this.me}`)) || "{}"))) if (!this.riverOnly.has(vk)) this.riverOnly.set(vk, rooms as Record<string, string>);
    } catch {}
    this.notifyListeners(); // the DM list can now tell the River contacts
  }
  private rosters = new Map<string, { members: string[]; creator: string; moderators: string[]; deputyOf: Record<string, string[]>; memberVks: Record<string, string> }>();
  public riverRoster(roomId: string): { members: string[]; creator: string; moderators: string[]; deputyOf: Record<string, string[]>; memberVks: Record<string, string> } | undefined {
    return this.rosters.get(roomId);
  }

  /** The room from the copy here, so a chat opens at once; a network read that is due redraws it when it lands. Waits only when there is no copy. */
  private async riverState(rooms: RiverRooms, owner: string): Promise<string | null> {
    const cached = rooms.cached(owner);
    if (!cached) return rooms.load(owner);
    void rooms.load(owner).then((s) => s !== cached && this.notifyListeners());
    return cached;
  }

  /** A River room's messages, authors named by persona where I know who holds the key. */
  private async riverMessages(identity: UserIdentity, room: PrivateRoom): Promise<ChatMessage[]> {
    const rooms = await this.rivers();
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
        who.set(await this.encPubOf(p), p);
      }
    }

    const cleared = Number(localStorage.getItem(`freenet_chat_cleared_${room.id}`) || 0);
    const name = (vk: string | null) => (vk ? who.get(vk) ?? vk : "");
    // whoever I know no Radica persona for goes by their nickname in the room (and is a River-only member)
    const here = new Set(view.members.map((m) => m.vk));
    for (const [vk, rooms] of this.riverOnly) if (!here.has(vk)) delete rooms[room.id]; // left, or pruned
    for (const m of view.members) if (!who.has(m.vk)) this.riverOnly.set(m.vk, { ...this.riverOnly.get(m.vk), [room.id]: view.name ?? "room" });
    this.saveRiverOnly();
    // a River-only member's nickname follows what they set in River (a Radica persona keeps its own profile name)
    for (const m of view.members)
      if (m.nickname && (!who.has(m.vk) || !this.knownPeers[name(m.vk)])) this.knownPeers[name(m.vk)] = { ...this.knownPeers[name(m.vk)], display_name: m.nickname };

    const memberVks: Record<string, string> = {};
    for (const m of view.members) memberVks[name(m.vk)] = m.vk;

    const creator = isOwner ? identity.pubkey : (name(owner) || owner);
    const moderators = [...new Set(view.members.filter((m) => m.deputy).map((m) => name(m.vk)))];
    let members = view.members.map((m) => name(m.vk));
    // a channel's subscribers never write, so River prunes them: they count from their join in the room's log
    if (room.is_channel) {
      void this.refreshLog(`room/${room.id}`);
      members = [...members, ...roomJoiners(this.logEntries(`room/${room.id}`), room.id, new Set([creator, ...moderators]))];
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
        reactions: Object.fromEntries(Object.entries(m.reactions).map(([e, vks]) => [e, vks.filter((v): v is string => !!v).map(name)])),
      }))
      .filter((m) => m.timestamp > cleared);
    let activeMessages = messages;
    if (room.is_channel) {
      const roster = this.rosters.get(room.id);
      const mods = new Set(roster?.moderators ?? room.moderators ?? []);
      const channelOwner = roster?.creator ?? room.creator;
      activeMessages = messages.filter((m) => {
        return m.sender === channelOwner || mods.has(m.sender) || (isOwner && m.sender === identity.pubkey);
      });
    }
    const joinEvents = this.computeRiverJoins(room.id, [...new Set(view.members.map((m) => name(m.vk)))], activeMessages, isOwner ? identity.pubkey : (name(owner) || owner));
    const allMessages = [...activeMessages, ...joinEvents].sort((a, b) => a.timestamp - b.timestamp);
    if (room.creator === identity.pubkey) void rooms.rotateIfDue(this.riverOwnerKey(identity, room), owner, state).catch((e) => console.warn("[River] rotate:", e));
    localStorage.setItem(`freenet_chat_${room.id}`, JSON.stringify(activeMessages.map((m) => ({ ...m, text: "" })))); // for unread counts: no plaintext kept
    return allMessages;
  }

  private computeRiverJoins(roomId: string, members: string[], messages: ChatMessage[], creator?: string): ChatMessage[] {
    const seenKey = `radica_seen_members_${roomId}`;
    let seen: Record<string, number> = {};
    try { seen = JSON.parse(localStorage.getItem(seenKey) || "{}"); } catch {}
    let seenChanged = false;
    const now = Date.now();

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
      try { localStorage.setItem(seenKey, JSON.stringify(seen)); } catch {}
    }
    if (!joinList.length) return [];
    joinList.sort((a, b) => a.ts - b.ts);

    // Group joins occurring within 5 minutes (River style)
    const grouped: { authors: string[]; ts: number }[] = [];
    for (const j of joinList) {
      const last = grouped[grouped.length - 1];
      if (last && j.ts - last.ts <= 5 * 60 * 1000) {
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

  /** An invite link to a River room, carrying a River invitation code: Radica, River and riverctl all accept it.
   *  Whoever holds it can join (as with the older rooms' links). Only the owner can make one. In a private room it is one
   *  member's key, so share one per person; in a public room each holder joins as their own member (`inviteUnder`). */
  public async getRiverInviteLink(identity: UserIdentity, room: PrivateRoom): Promise<string> {
    if (room.creator !== identity.pubkey || !room.river) throw new Error("Only the room owner can make an invite link");
    const code = await (await this.rivers()).invitation(this.riverOwnerKey(identity, room), room.river.owner);
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
    const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
    const params = new URLSearchParams({ river_invite: code });
    params.set("room_id", room.id);
    params.set("creator", room.creator);
    if (room.is_channel) params.set("chan", "1");
    if (room.linked_room_id) {
      params.set("lr", room.linked_room_id);
      // a channel's link lets you into its discussion room too: without it the Comments button leads nowhere
      const linked = (await this.getPrivateRooms(identity)).find((r) => r.id === room.linked_room_id);
      if (linked?.river && linked.creator === identity.pubkey)
        await (await this.rivers()).invitation(this.riverOwnerKey(identity, linked), linked.river.owner).then((c) => params.set("lr_invite", c), (e) => console.warn("[River] linked room invitation:", e));
    }
    return `${origin}${pathname}#${params.toString()}`;
  }

  /** Joining (again) a room I removed: it comes back here and on my other devices. */
  private unhideRoom(identity: UserIdentity, roomId: string): void {
    const key = `freenet_room_left_${identity.pubkey}_${roomId}`;
    if (localStorage.getItem(key) === null && !foldChatHides(this.logEntries(`inbox/${identity.pubkey}`), identity.pubkey).rooms[roomId]) return;
    localStorage.removeItem(key);
    void this.logAppend(`inbox/${identity.pubkey}`, { type: "room_hide", roomId, on: false }).catch((e) => console.warn("[Freenet] room_hide:", e));
  }

  /** Join a River room from a River invitation code (made by Radica, River's UI or riverctl). */
  public async joinRiverInvitation(
    identity: UserIdentity,
    code: string,
    meta?: {
      roomId?: string;
      creator?: string;
      name?: string;
      is_channel?: boolean;
      linked_room_id?: string;
      /** A River invitation to the linked room (a channel's discussion room), joined along with this one. */
      linked_invite?: string;
    }
  ): Promise<PrivateRoom> {
    const rooms = await this.rivers();
    const { owner, sk, join } = rooms.accept(code);
    // a public room's link is shared by many: sign my own key in under the link's, so I am not everyone else holding it
    const mine = await rooms.inviteUnder(sk, join.member, owner, vkOf(identity.secretKey)).catch((e) => (console.warn("[River] Could not join under the link key:", e), null));
    const list: PrivateRoom[] = JSON.parse(localStorage.getItem("freenet_private_rooms") || "[]");
    const known = list.find((r) => r.river?.owner === owner || (meta?.roomId && r.id === meta.roomId));
    const roomId = meta?.roomId ?? known?.id ?? `privroom_river_${owner.slice(0, 16)}`;
    this.unhideRoom(identity, roomId);
    this.keepRiverAccess(roomId, mine ? null : sk, mine ?? join);
    seedReadMark(localStorage, roomId);
    const creator = meta?.creator ?? known?.creator ?? owner;
    const isChannel = meta?.is_channel ?? known?.is_channel ?? false;
    const linkedRoomId = meta?.linked_room_id ?? known?.linked_room_id;
    // a room made outside Radica has no persona as creator: its owner key stands in
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
          created_at: Date.now(),
          sig: "",
          river: { owner },
          ...(isChannel ? { is_channel: true } : {}),
          ...(linkedRoomId ? { linked_room_id: linkedRoomId } : {}),
        };
    this.mergeRemotePrivateRooms([room]);
    await this.logAppend(`room/${roomId}`, { type: "room_join", roomId }).catch((e) => console.warn("[River] room_join log:", e));
    await this.rememberRoom(roomId);

    if (meta?.linked_invite && linkedRoomId)
      await this.joinRiverInvitation(identity, meta.linked_invite, { roomId: linkedRoomId, creator, linked_room_id: roomId }).catch((e) => console.warn("[River] Could not join the linked room:", e));
    safeStorage.flush();
    void this.putRoomsToNode();
    this.notifyListeners();
    return room;
  }

  /** Take on my identity in a River room from River's "Export ID" token: the same member there, not a second one. */
  public async importRiverIdentity(identity: UserIdentity, token: string): Promise<PrivateRoom> {
    const { owner, sk, join } = (await this.rivers()).importIdentity(token);
    const list: PrivateRoom[] = JSON.parse(localStorage.getItem("freenet_private_rooms") || "[]");
    const known = list.find((r) => r.river?.owner === owner);
    const roomId = known?.id ?? `privroom_river_${owner.slice(0, 16)}`;
    this.unhideRoom(identity, roomId);
    this.keepRiverAccess(roomId, sk, join);
    seedReadMark(localStorage, roomId);
    // the owner's own key makes me the room's creator here; otherwise its owner key stands in for a creator persona
    const creator = vkOf(hexToBytes(sk)) === owner ? identity.pubkey : known?.creator ?? owner;
    const room: PrivateRoom = known
      ? { ...known, creator, members: [...new Set([...known.members, identity.pubkey])] }
      : { id: roomId, creator, name_encrypted: "", members: [identity.pubkey], encrypted_keys: {}, created_at: Date.now(), sig: "", river: { owner } };
    this.mergeRemotePrivateRooms([room]);
    await this.rememberRoom(roomId);
    this.notifyListeners();
    return room;
  }

  /** My identity in a River room as River's "Export ID" token (it holds my key in that room: a password). */
  public async exportRiverIdentity(identity: UserIdentity, room: PrivateRoom): Promise<string> {
    if (!room.river) throw new Error("Only River rooms have a River identity");
    return (await this.rivers()).exportIdentity(this.riverKey(identity, room), room.river.owner, this.riverJoin(room.id), this.nickname());
  }

  /** The key a link gave me in a room (null: my identity key) and what lets it in, here and in the node (the page's storage does not last). */
  private keepRiverAccess(roomId: string, k: string | null, join: RiverJoin): void {
    if (k) localStorage.setItem(`river_key_${roomId}`, k);
    else localStorage.removeItem(`river_key_${roomId}`);
    localStorage.setItem(`river_join_${roomId}`, JSON.stringify(join));
    void import("./delegate.ts").then(async (m) => {
      await m.nodePut(`river-key:${roomId}`, k ?? ""); // empty: restore keeps no key, so my identity key is used
      await m.nodePut(`river-join:${roomId}`, JSON.stringify(join));
    });
  }

  public getPrivateRoomInviteLink(room: PrivateRoom, roomKey: Uint8Array, roomName: string): string {
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
    if (room.linked_room_id) params.set("lr", room.linked_room_id);
    return `${origin}${pathname}#${params.toString()}`;
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
      river?: { owner: string; k: string; member: string; secret?: string };
    }
  ): Promise<PrivateRoom> {
    const { roomId, name, keyHex, creator, is_channel, linked_room_id } = inviteData;
    this.unhideRoom(identity, roomId); // joining again after leaving
    if (inviteData.river) {
      const { owner, k, member, secret } = inviteData.river;
      if (!/^[0-9a-f]{64}$/.test(owner) || !/^[0-9a-f]{64}$/.test(k)) throw new Error("Invalid invite link");
      this.keepRiverAccess(roomId, k, { member, secret: secret || undefined }); // the link's key is my key in this room
      const room: PrivateRoom = {
        id: roomId,
        creator,
        name_encrypted: "",
        members: [creator, identity.pubkey],
        encrypted_keys: {},
        created_at: Date.now(),
        sig: "invite_join",
        river: { owner },
        ...(is_channel ? { is_channel: true } : {}),
        ...(linked_room_id ? { linked_room_id } : {}),
      };
      this.mergeRemotePrivateRooms([room]);
      await this.logAppend(`room/${roomId}`, { type: "room_join", roomId }); // so the room's member list shows me
      await this.rememberRoom(roomId);
  
      safeStorage.flush();
      this.notifyListeners();
      return room;
    }
    const roomKey = hexToBytes(keyHex);
    if (roomKey.length !== 32) {
      throw new Error("Invalid room key in invite link");
    }

    // Cache the decrypted room key locally
    this.privateRoomKeyCache.set(roomId, roomKey);

    // Encrypt room key for self so it persists across sessions
    const encKeyForSelf = await encryptRoomKeyForPeer(identity.secretKey, identity.encPub, roomKey);

    const existingRooms = await this.getPrivateRooms(identity);
    let room = existingRooms.find((r) => r.id === roomId);

    if (room) {
      if (!room.members.includes(identity.pubkey)) {
        room.members.push(identity.pubkey);
      }
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
        encrypted_keys: {
          [identity.pubkey]: encKeyForSelf,
        },
        created_at: Date.now(),
        sig: "invite_join",
        ...(is_channel ? { is_channel: true } : {}),
        ...(linked_room_id ? { linked_room_id } : {}),
      };
    }

    this.mergeRemotePrivateRooms([room]);
    this.broadcast({ type: "private_room", room });
    await this.logAppend(`room/${roomId}`, { type: "room_join", roomId, encrypted_key: encKeyForSelf }); // my copy of the key, for my eyes only
    await this.rememberRoom(roomId);

    safeStorage.flush();
    this.notifyListeners();
    return room;
  }

  public async sendPrivateRoomChatMessage(
    identity: UserIdentity,
    room: PrivateRoom,
    text: string,
    replyTo?: string
  ): Promise<ChatMessage> {
    if (room.is_channel) {
      const roster = this.rosters.get(room.id);
      const isOwner = identity.pubkey === (roster?.creator ?? room.creator);
      const isModerator = (roster?.moderators ?? room.moderators ?? []).includes(identity.pubkey);
      if (!isOwner && !isModerator) {
        throw new Error("This broadcast channel is read-only. Only the owner or administrators can post messages.");
      }
    }
    const notifMsg = room.is_channel
      ? "posted an update in a Broadcast Channel 📢"
      : "sent a message in an encrypted Private Room 🔒";

    if (room.river) {
      await (await this.rivers()).say(this.riverKey(identity, room), room.river.owner, text, this.riverJoin(room.id), this.nickname(), replyTo);
      for (const member of room.members)
        if (member !== identity.pubkey) this.addNotification(member, { type: "chat", from: identity.pubkey, text: notifMsg, linkRoomId: room.id });
      const now = Date.now();
      return { id: `river_${now}`, room_id: room.id, private_room_id: room.id, sender: identity.pubkey, text, timestamp: now, sig: "" };
    }
    const roomKey = await this.getPrivateRoomKey(identity, room);
    if (!roomKey) throw new Error("Unauthorized: no room key found to encrypt message");

    const encryptedText = await encryptWithSymmetricKey(roomKey, text);
    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = Date.now();
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
    const raw = localStorage.getItem(storageKey);
    const messages: ChatMessage[] = raw ? JSON.parse(raw) : [];
    messages.push(message);
    localStorage.setItem(storageKey, JSON.stringify(messages));

    this.broadcast({ type: "chat", message });
    await this.logAppend(`room/${room.id}`, { type: "chat", message });

    // Send notifications to all other room members
    for (const member of room.members) {
      if (member !== identity.pubkey) {
        this.addNotification(member, {
          type: "chat",
          from: identity.pubkey,
          text: notifMsg,
          linkRoomId: room.id,
        });
      }
    }

    return {
      ...message,
      text, // Return decrypted for caller
    };
  }

  public async getPrivateRoomChatMessages(
    identity: UserIdentity,
    room: PrivateRoom
  ): Promise<ChatMessage[]> {
    if (room.river) return this.riverMessages(identity, room);
    void this.refreshLog(`room/${room.id}`);
    const entries = this.logEntries(`room/${room.id}`);
    const joins = this.computeLogJoins(room.id, entries);
    const messages = this.visibleChat(room.id);

    const roomKey = await this.getPrivateRoomKey(identity, room);
    const list = !roomKey ? messages : await Promise.all(
      messages.map(async (msg) => {
        if (msg.text && msg.text.startsWith("sym:")) {
          return { ...msg, text: await this.plain(`sym|${identity.pubkey}|${room.id}|${msg.text}`, () => decryptWithSymmetricKey(roomKey, msg.text)) };
        }
        return msg;
      })
    );
    return [...list, ...joins].sort((a, b) => a.timestamp - b.timestamp);
  }
}

export const freenet = new FreenetClient();
