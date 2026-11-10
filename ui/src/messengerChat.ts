import {
  computeSafetyBlocks,
  shouldHydratePreview,
  shouldUpdateCachedPreview,
  roomMetaOf,
  type PreviewItem,
  type RoomMeta,
} from "./messengerLogic.ts";
export { computeSafetyBlocks, shouldHydratePreview, shouldUpdateCachedPreview, type PreviewItem };
import { personaName } from "./crypto.ts";
import { plainMentions, renderChatText } from "./caption.ts";
import { CHAT_REACTIONS } from "./logfold.ts";
import { safeStorage } from "./storage.ts";
import { generateDefaultAvatar, compressAvatarFile } from "./avatar.ts";
import { fillFreetunes, freetunesCard } from "./freetunes.ts";
import { fillFreepolls, freepollsCard, type PollNet } from "./freepolls.ts";
import { fillAsocial, asocialCard } from "./asocial.ts";
import { fillFh, fhCard } from "./fh.ts";
import { wormholeCard, fillWormhole } from "./wormhole.ts";
import { freetreeCard } from "./freetree.ts";
import {
  chatMediaCardsHtml,
  fileExtensionIcon,
  fillChatMedia,
  formatBytes,
  formatMediaDuration,
  normalizeAudioMime,
  parseChatMedia,
  prepareChatAudioFile,
  prepareChatDocFile,
  prepareChatImageFile,
  summarizeChatMediaText,
  type PreparedChatMedia,
  sendChatAttachment,
  syncMiniPlayerSlot,
} from "./chatMedia.ts";
import { freenet } from "./freenet.ts";
import { escapeHtml, safeUrl, shortenKey } from "./html.ts";
import { formatTtlLabel } from "./secretChat.ts";
import { burnAtOf, checksHtml, deliveryOf, nextTtl, tickBurnCountdowns, triggerRowBurnAnimation, type ConversationState } from "./conversationState.ts";
import type { ChatMessage, Community, PrivateRoom, UserIdentity } from "./types.ts";
import { renderIcon, type IconName } from "./icons.ts";
import { LANGS, readerLang, translatableFrom, translateText } from "./translate.ts";
import { draftTranslateHtml } from "./composeTranslate.ts";

/** Chat messages translated on this device this session, by message id; "" while in progress. */
const chatTranslations = new Map<string, string>();

export type ChatLayoutMode = "messenger" | "classic";

export interface MessengerActiveState {
  peer: string | null;
  isSecret?: boolean;
  privateRoom: PrivateRoom | null;
  community: Community | null;
  shownMessages: ChatMessage[];
  replyingTo: ChatMessage | null;
  online: boolean;
}

export interface MessengerDeps {
  rootEl: HTMLElement;
  pollNet: PollNet;
  isVisible?: () => boolean;
  getIdentity: () => UserIdentity | null;
  getAllPrivateRooms: () => PrivateRoom[];
  getJoinedCommunities: () => Community[];
  getAllCommunities: () => Community[];
  getFollowingKeys: () => string[];
  getActiveState: () => MessengerActiveState;
  openRoomId: () => string | null;
  getAuthorDisplayName: (pubkey: string) => string;
  getAuthorAvatarUrl: (pubkey: string) => string;

  onSelectPeer: (pubkey: string, isSecret?: boolean) => Promise<void>;
  onSelectPrivateRoom: (room: PrivateRoom) => Promise<void>;
  onSelectCommunity: (comm: Community) => Promise<void>;
  onSendMessage: (rawText: string, sourceBox?: HTMLElement) => Promise<boolean>;
  onEditMessage?: (roomId: string, msgId: string, newText: string) => Promise<void>;
  onPinMessage?: (roomId: string, msgId: string | null) => Promise<void>;
  conversation: ConversationState;
  onSetReply: (msg: ChatMessage | null) => void;
  onReactMessage: (roomId: string, msgId: string, emoji: string, peer?: string) => Promise<void>;
  onDeleteMessage: (roomId: string, msgId: string) => Promise<void>;
  onClearActiveChat: () => Promise<void>;
  onRemovePeer: (peerPubkey: string, secret?: boolean) => void;
  isPeerBlocked?: (pubkey: string) => boolean;
  onToggleBlockPeer?: (pubkey: string) => Promise<void>;
  onLeavePrivateRoom: (room: PrivateRoom) => Promise<void>;
  onOpenCreateRoomModal: () => void;
  onOpenCreateChannelModal?: () => void;
  onOpenJoinRoomModal: () => void;
  onOpenInviteRoomModal: () => void;
  onGetInviteLink: (room: PrivateRoom) => Promise<string | null>;
  onOpenUserProfile: (pubkey: string) => void;
  onOpenPostLink: (e: Event, anchor: HTMLAnchorElement) => void;
  onCreatePollLink: (question: string, options: string[], multi: boolean) => Promise<string>;
  onSwitchLayout: (mode: ChatLayoutMode) => void;
  onToggleFullscreen: () => void;
  onCloseChat: () => void;
  isPickingFile?: () => boolean;
  markPickingFile?: (ms?: number) => void;
  clearPickingFile?: (delayMs?: number) => void;
  showToast: (msg: string, type?: "info" | "warning" | "error") => void;
}

interface UnifiedConversation {
  key: string; // "dm:<pk>" | "priv:<roomId>" | "comm:<commId>" | "secret:<pk>"
  roomId: string;
  type: "dm" | "priv" | "comm" | "secret";
  isSecret?: boolean;
  name: string;
  dupSuffix?: string;
  origin?: string;
  avatarUrl?: string;
  avatarFallbackSeed?: string;
  monogram?: string;
  pinned: boolean;
  unread: number;
  lastTs: number;
  previewText: string;
  previewMine: boolean;
  previewOptimistic: boolean;
  peerPk?: string;
  privateRoom?: PrivateRoom;
  community?: Community;
  isChannel?: boolean;
}

const PALETTE_KEY = "radica_messenger_palette";

const CLOCK_FMT = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" });
const SHORT_WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const SHORT_DATE_FMT = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });
const LONG_DATE_FMT = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long" });
const LONG_DATE_YEAR_FMT = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" });

const SENDER_COLORS = ["#2d7a47", "#9a5b13", "#2b6cb0", "#805ad5", "#b83280", "#c05621"];
function senderColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length];
}

function makeMonogram(label: string, isComm = false): string {
  const clean = label.replace(/^#?r\//i, "").trim();
  if (!clean) return isComm ? "#" : "RM";
  if (isComm) return `#${clean.slice(0, 1).toUpperCase()}`;
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function formatInboxTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return CLOCK_FMT.format(d);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  const diffDays = Math.floor((now.getTime() - ts) / (24 * 60 * 60 * 1000));
  if (diffDays < 7) {
    return SHORT_WEEKDAY_FMT.format(d);
  }
  return SHORT_DATE_FMT.format(d);
}

function formatDateSeparator(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.getFullYear() !== now.getFullYear() ? LONG_DATE_YEAR_FMT.format(d) : LONG_DATE_FMT.format(d);
}

function formatClock(ts: number): string {
  return CLOCK_FMT.format(new Date(ts));
}

/** The html each thread row was built from: a row is rebuilt only when it changes. */
const rowSrc = new WeakMap<Element, string>();

/** Redraw the thread by row key: unchanged rows stay (media, focus, scroll), changed ones are rebuilt, gone ones leave
 *  (a timed message that burned plays its animation first). True when the DOM changed. */
export function reconcileRows(container: HTMLElement, items: { key: string; html: string }[]): boolean {
  const old = new Map<string, Element>();
  let changed = false;
  for (const n of Array.from(container.children) as HTMLElement[]) {
    const k = n.dataset.rowKey;
    if (k) old.set(k, n);
    else {
      n.remove();
      changed = true;
    }
  }
  const keep = new Set<Element>();
  let cursor: Element | null = container.firstElementChild;
  for (const { key, html } of items) {
    let el = old.get(key);
    if (!el || rowSrc.get(el) !== html) {
      const tpl = document.createElement("template");
      tpl.innerHTML = html.trim();
      el = tpl.content.firstElementChild!;
      (el as HTMLElement).dataset.rowKey = key;
      rowSrc.set(el, html);
      changed = true;
    }
    keep.add(el);
    if (el === cursor) cursor = cursor.nextElementSibling;
    else {
      container.insertBefore(el, cursor);
      changed = true;
    }
  }
  const nextKeys = new Set(items.map((i) => i.key));
  for (const [key, n] of old) {
    if (!keep.has(n)) {
      const row = n as HTMLElement;
      // rebuilt (a timed message's countdown changes its html on every draw): the new row stands in, the old one goes.
      // Kept here, it showed the message once more on every redraw.
      if (nextKeys.has(key)) {
        n.remove();
        changed = true;
        continue;
      }
      if (row.dataset?.burning) {
        continue;
      }
      // only a message whose time is up burns; one leaving because another conversation opened just goes
      const burnAt = Number(row.querySelector?.<HTMLElement>("[data-burn-at]")?.dataset.burnAt ?? NaN);
      if (burnAt && burnAt <= Date.now() + 1000) {
        triggerRowBurnAnimation(row);
        continue;
      }
      n.remove();
      changed = true;
    }
  }
  return changed;
}

export function createMessengerChat(deps: MessengerDeps) {
  const { rootEl } = deps;

  let activeFilter: "all" | "unread" | "dm" | "priv" | "channel" | "comm" = "all";
  let inboxQuery = "";
  let threadQuery = "";
  let drawerOpen = false;
  let mobileShowThread = true;
  let lastRenderedConvKey = "";
  const CHAT_PAGE_SIZE = 80;
  let visibleMsgLimit = CHAT_PAGE_SIZE;

  // Real decrypted last-message cache keyed by roomId (backed by safeStorage)
  const previewCache = new Map<string, PreviewItem>();

  function getCachedPreview(roomId: string): PreviewItem | undefined {
    const hit = previewCache.get(roomId);
    if (hit) return hit;
    try {
      const raw = safeStorage.getItem(`radica_preview_${roomId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.text === "string" && typeof parsed.timestamp === "number") {
          previewCache.set(roomId, parsed);
          return parsed;
        }
      }
    } catch {}
    return undefined;
  }

  function setCachedPreview(roomId: string, preview: PreviewItem) {
    previewCache.set(roomId, preview);
    try {
      safeStorage.setItem(`radica_preview_${roomId}`, JSON.stringify(preview));
    } catch {}
  }
  // Tracks which roomId + latestStoredTs we already hydrated so we don't re-decrypt unchanged rooms
  const hydratedStamp = new Map<string, number>();
  let hydrating = false;
  let lastConvs: UnifiedConversation[] = []; // the inbox as last drawn: the long-press menu acts on these
  let inboxRunning = false;
  let inboxQueued = false;
  let lastConvListHtml = "";
  const convRowInner = new WeakMap<HTMLElement, string>();

  const isVisible = () => (deps.isVisible ? deps.isVisible() : true);


  const roomNameCache = new Map<string, string>();

  function pinnedSet(): Set<string> {
    const me = deps.getIdentity()?.pubkey;
    if (!me) return new Set();
    try {
      const list = JSON.parse(safeStorage.getItem(`radica_pinned_chats_${me}`) || "[]");
      return new Set(Array.isArray(list) ? list : []);
    } catch {
      return new Set();
    }
  }

  function togglePinned(convKey: string): boolean {
    const me = deps.getIdentity()?.pubkey;
    if (!me) return false;
    const set = pinnedSet();
    const next = !set.has(convKey);
    if (next) set.add(convKey);
    else set.delete(convKey);
    safeStorage.setItem(`radica_pinned_chats_${me}`, JSON.stringify([...set]));
    safeStorage.flush();
    return next;
  }

  function verifiedSet(): Set<string> {
    const me = deps.getIdentity()?.pubkey;
    if (!me) return new Set();
    try {
      const list = JSON.parse(safeStorage.getItem(`radica_verified_chats_${me}`) || "[]");
      return new Set(Array.isArray(list) ? list : []);
    } catch {
      return new Set();
    }
  }

  function toggleVerified(targetId: string): boolean {
    const me = deps.getIdentity()?.pubkey;
    if (!me) return false;
    const set = verifiedSet();
    const next = !set.has(targetId);
    if (next) set.add(targetId);
    else set.delete(targetId);
    safeStorage.setItem(`radica_verified_chats_${me}`, JSON.stringify([...set]));
    safeStorage.flush();
    return next;
  }

  function activeConvKey(): string | null {
    const st = deps.getActiveState();
    if (st.privateRoom) return `priv:${st.privateRoom.id}`;
    if (st.community) return `comm:${st.community.id}`;
    if (st.peer) return `${st.isSecret ? "secret" : "dm"}:${st.peer}`;
    return null;
  }

  function safetyTarget(): { id: string; material: string; label: string } | null {
    const st = deps.getActiveState();
    if (st.peer) {
      return {
        id: `dm:${st.peer}`,
        material: st.peer,
        label: deps.getAuthorDisplayName(st.peer),
      };
    }
    if (st.privateRoom) {
      const name = roomNameCache.get(st.privateRoom.id) || "E2EE Group";
      return {
        id: `priv:${st.privateRoom.id}`,
        material: st.privateRoom.river?.owner || `${st.privateRoom.creator}:${st.privateRoom.id}`,
        label: name,
      };
    }
    return null;
  }

  // Mount static DOM shell inside rootEl
  const savedPalette = safeStorage.getItem(PALETTE_KEY) === "signal" ? "signal" : "radici";
  rootEl.setAttribute("data-palette", savedPalette);

  rootEl.innerHTML = `
    <div class="rm-workspace" id="rm-workspace">
      <!-- UNIFIED INBOX SIDEBAR -->
      <aside class="rm-inbox" aria-label="Conversations">
        <div class="rm-inbox-header">
          <div class="rm-inbox-title-wrap">
            <h2 class="rm-inbox-title">Messages</h2>
            <div class="rm-node-pill" id="rm-node-pill">
              <span class="dot"></span>
              <span id="rm-node-label">Connecting to node…</span>
            </div>
          </div>
          <div class="rm-inbox-actions">
            <div class="rm-menu-wrap">
              <button type="button" class="rm-icon-btn" data-menu="rm-compose-menu" aria-haspopup="menu" aria-expanded="false" title="New chat, group or channel">
                <svg viewBox="0 0 24 24" class="svg-icon icon-md"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <div class="rm-menu" id="rm-compose-menu" role="menu" hidden>
                <button type="button" class="rm-menu-item" role="menuitem" id="rm-btn-new-chat"><svg viewBox="0 0 24 24" class="svg-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>New message</span></button>
                <button type="button" class="rm-menu-item" role="menuitem" id="rm-btn-create-room"><svg viewBox="0 0 24 24" class="svg-icon"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>New group</span></button>
                <button type="button" class="rm-menu-item" role="menuitem" id="rm-btn-create-channel"><svg viewBox="0 0 24 24" class="svg-icon"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg><span>New channel</span></button>
                <button type="button" class="rm-menu-item" role="menuitem" id="rm-btn-invite-code"><svg viewBox="0 0 24 24" class="svg-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>Join with invite code</span></button>
              </div>
            </div>
            <div class="rm-menu-wrap">
              <button type="button" class="rm-icon-btn" data-menu="rm-inbox-menu" aria-haspopup="menu" aria-expanded="false" title="More"><svg viewBox="0 0 24 24" class="svg-icon icon-md"><circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/></svg></button>
              <div class="rm-menu" id="rm-inbox-menu" role="menu" hidden>
                <button type="button" class="rm-menu-item" role="menuitem" id="rm-btn-palette"><svg viewBox="0 0 24 24" class="svg-icon"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg><span>Switch palette</span></button>
                <button type="button" class="rm-menu-item" role="menuitem" data-layout-mode="classic"><svg viewBox="0 0 24 24" class="svg-icon"><path d="M3 21h18"/><path d="M4 10h16"/><path d="M12 3 4 7v3h16V7z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/></svg><span>Classic view</span></button>
              </div>
            </div>
            <button type="button" class="rm-icon-btn rm-narrow-only" id="rm-btn-inbox-close" title="Close chat and return to feed">${renderIcon("x", { className: "icon-sm" })}</button>
          </div>
        </div>

        <div class="rm-search-box">
          <div class="rm-search-inner">
            <svg viewBox="0 0 24 24" class="svg-icon icon-sm"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              id="rm-inbox-search"
              class="rm-search-input"
              placeholder="Search contacts, groups, or #communities…"
              autocomplete="off"
            />
            <button type="button" class="rm-search-clear" id="rm-inbox-search-clear" title="Clear search">${renderIcon("x", { size: 12, className: "icon-xs" })}</button>
          </div>
        </div>

        <div class="rm-filter-bar" id="rm-filter-bar" role="tablist">
          <button type="button" class="rm-filter-chip active" data-filter="all">All</button>
          <button type="button" class="rm-filter-chip" data-filter="unread">Unread <span class="rm-chip-count" id="rm-chip-unread-count">0</span></button>
          <button type="button" class="rm-filter-chip" data-filter="dm">DMs</button>
          <button type="button" class="rm-filter-chip" data-filter="priv">Groups</button>
          <button type="button" class="rm-filter-chip" data-filter="channel">Channels</button>
          <button type="button" class="rm-filter-chip" data-filter="comm">Communities</button>
        </div>

        <div id="rm-inbox-player-slot"></div>

        <div class="rm-conv-list" id="rm-conv-list"></div>

      </aside>

      <!-- ACTIVE CONVERSATION STAGE -->
      <main class="rm-stage">
        <header class="rm-chat-header">
          <div class="rm-header-left">
            <button type="button" class="rm-icon-btn rm-mobile-back" id="rm-btn-mobile-back" title="Back to conversations">
              <svg viewBox="0 0 24 24" class="svg-icon icon-md"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button type="button" class="rm-header-peer" id="rm-header-peer-trigger" title="Open contact / room details">
              <div id="rm-header-avatar-slot"></div>
              <div class="rm-header-info">
                <div class="rm-header-name-row">
                  <span class="rm-header-name" id="rm-header-title">Select a conversation</span>
                  <span class="rm-trust-pill" id="rm-header-trust-badge" style="display: none;"></span>
                </div>
                <div class="rm-header-sub" id="rm-header-subtitle">Choose a contact or room from the left sidebar</div>
              </div>
            </button>
            <!-- outside the peer button: a <button> nested in a <button> breaks the whole layout's HTML parse -->
            <button type="button" class="rm-ttl-toggle-btn" id="rm-btn-ttl-selector" style="display: none;" title="Disappearing messages timer">${renderIcon("clock", { size: 12 })} <span>Off</span></button>
          </div>

          <div class="rm-header-controls">
            <div class="rm-menu-wrap">
              <button type="button" class="rm-icon-btn" data-menu="rm-header-menu" aria-haspopup="menu" aria-expanded="false" title="More"><svg viewBox="0 0 24 24" class="svg-icon icon-md"><circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/></svg></button>
              <div class="rm-menu" id="rm-header-menu" role="menu" hidden>
                <button type="button" class="rm-menu-item" role="menuitem" id="rm-btn-thread-search"><svg viewBox="0 0 24 24" class="svg-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>Search</span></button>
                <button type="button" class="rm-menu-item" role="menuitem" id="rm-btn-drawer-toggle"><svg viewBox="0 0 24 24" class="svg-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span>Info</span></button>
                <button type="button" class="rm-menu-item" role="menuitem" id="rm-btn-invite-top" style="display: none;"><svg viewBox="0 0 24 24" class="svg-icon"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg><span>Invite members</span></button>
                <button type="button" class="rm-menu-item" role="menuitem" id="rm-btn-safety-verify" style="display: none;"><svg viewBox="0 0 24 24" class="svg-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg><span>Verify safety number</span></button>
                <button type="button" class="rm-menu-item" role="menuitem" id="rm-btn-fullscreen"><svg viewBox="0 0 24 24" class="svg-icon"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg><span>Full screen</span></button>
                <button type="button" class="rm-menu-item" role="menuitem" data-layout-mode="classic"><svg viewBox="0 0 24 24" class="svg-icon"><path d="M3 21h18"/><path d="M4 10h16"/><path d="M12 3 4 7v3h16V7z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/></svg><span>Classic view</span></button>
              </div>
            </div>
            <button type="button" class="rm-icon-btn" id="rm-btn-close" title="Close chat and return to feed">${renderIcon("x", { className: "icon-sm" })}</button>
          </div>
        </header>

        <div id="rm-player-slot"></div>

        <div class="rm-thread-search" id="rm-thread-search-bar">
          <svg viewBox="0 0 24 24" class="svg-icon icon-sm" style="color: var(--rm-text-muted);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="rm-thread-search-input" placeholder="Find in conversation…" autocomplete="off" />
          <button type="button" class="rm-icon-btn" id="rm-thread-search-close" title="Close search">${renderIcon("x", { className: "icon-sm" })}</button>
        </div>

        <div class="rm-pinned-bar" id="rm-pinned-bar" style="display: none;">
          <div class="rm-pinned-content" id="rm-pinned-content" title="Jump to pinned message">
            <div class="rm-pinned-header">
              <span class="rm-pinned-icon">${renderIcon("pin", { size: 13, className: "icon-xs" })}</span>
              <span class="rm-pinned-label">Pinned Message</span>
            </div>
            <div class="rm-pinned-text" id="rm-pinned-text"></div>
          </div>
          <button type="button" class="rm-icon-btn rm-pinned-unpin-btn" id="rm-pinned-unpin-btn" title="Unpin message">${renderIcon("x", { size: 12, className: "icon-xs" })}</button>
        </div>

        <div class="rm-messages-scroller" id="rm-messages-scroller">
          <div class="rm-messages-track" id="rm-messages-track"></div>
        </div>

        <div class="rm-composer-outer" id="rm-composer-outer">
          <div class="rm-composer-track">
            <div class="rm-pinned-scroll-anchor" id="rm-scroll-bottom-anchor"></div>
            <div class="rm-reply-banner" id="rm-reply-banner">
              <div class="rm-reply-banner-text" id="rm-reply-banner-text"></div>
              <button type="button" class="rm-icon-btn" id="rm-reply-banner-cancel" style="width: 24px; height: 24px;" title="Cancel reply">${renderIcon("x", { size: 12, className: "icon-xs" })}</button>
            </div>

            <div class="rm-edit-banner" id="rm-edit-banner" style="display: none;">
              <span class="rm-edit-banner-icon">${renderIcon("edit", { size: 14, className: "icon-sm" })}</span>
              <div class="rm-edit-banner-text" id="rm-edit-banner-text">Editing message</div>
              <button type="button" class="rm-icon-btn" id="rm-edit-banner-cancel" style="width: 24px; height: 24px;" title="Cancel edit">${renderIcon("x", { size: 12, className: "icon-xs" })}</button>
            </div>

            <div class="rm-media-stage" id="rm-media-stage">
              <div class="rm-media-stage-preview" id="rm-media-stage-preview"></div>
              <div class="rm-media-stage-info">
                <span class="rm-media-stage-label" id="rm-media-stage-label"></span>
                <span class="rm-media-stage-sub" style="display:inline-flex;align-items:center;gap:4px;">${renderIcon("lock", { size: 11, className: "icon-xs" })} Encrypted with random 256-bit AES-GCM key on Freenet</span>
              </div>
              <button type="button" class="rm-icon-btn" id="rm-media-stage-cancel" style="width: 26px; height: 26px;" title="Remove attachment">${renderIcon("x", { size: 12, className: "icon-xs" })}</button>
            </div>

            <input type="file" id="rm-file-image" accept="image/*" hidden />
            <input type="file" id="rm-file-audio" accept="audio/*,.mp3,.m4a,.ogg,.opus,.wav,.aac,.webm" hidden />
            <input type="file" id="rm-file-doc" hidden />

            <div class="rm-attach-menu" id="rm-attach-menu">
              <button type="button" class="rm-attach-item" data-attach="image">${renderIcon("image", { className: "icon-sm" })}<span>Send Photo / Image</span></button>
              <button type="button" class="rm-attach-item" data-attach="audio">${renderIcon("music", { className: "icon-sm" })}<span>Send Audio File / Memo</span></button>
              <button type="button" class="rm-attach-item" data-attach="file">${renderIcon("fileText", { className: "icon-sm" })}<span>Send Document / File</span></button>
              <button type="button" class="rm-attach-item" data-attach="mention">${renderIcon("user", { className: "icon-sm" })}<span>Mention someone (@)</span></button>
              <button type="button" class="rm-attach-item" data-attach="poll">${renderIcon("barChart2", { className: "icon-sm" })}<span>Create FreePolls Poll</span></button>
              <button type="button" class="rm-attach-item" data-attach="room-link" id="rm-attach-room-link">${renderIcon("link", { className: "icon-sm" })}<span>Insert Room Invite Link</span></button>
              <button type="button" class="rm-attach-item" data-attach="my-key">${renderIcon("key", { className: "icon-sm" })}<span>Insert My Public Key</span></button>
            </div>

            <div class="rm-typing-bar" id="rm-typing-bar" style="display: none;">
              <span id="rm-typing-text"></span>
              <span class="rm-typing-dots"><span>.</span><span>.</span><span>.</span></span>
            </div>

            <form class="rm-composer-row" id="rm-composer-form">
              <button type="button" class="rm-plus-btn" id="rm-btn-attach" title="Attachments & Freenet actions">
                <svg viewBox="0 0 24 24" class="svg-icon icon-md"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <div class="rm-input-pill">
                <textarea
                  id="rm-composer-input"
                  class="rm-textarea"
                  rows="1"
                  autocomplete="off"
                  placeholder="Write a message…"
                ></textarea>
                ${draftTranslateHtml("rm-composer-input")}
                <button type="button" class="rm-emoji-btn" id="rm-btn-quick-emoji" title="Insert 🌱">🌱</button>
              </div>
              <button type="submit" class="rm-send-btn" id="rm-btn-send" title="Send message (Enter)">
                <svg viewBox="0 0 24 24" class="svg-icon icon-md" style="transform: translateX(1px);">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </main>

      <!-- SLIDE-OVER INFO & MEMBERS DRAWER -->
      <aside class="rm-drawer" id="rm-info-drawer" aria-label="Conversation Details">
        <div class="rm-drawer-top">
          <span id="rm-drawer-header-label">Details</span>
          <button type="button" class="rm-icon-btn" id="rm-btn-drawer-close" title="Close panel">${renderIcon("x", { className: "icon-sm" })}</button>
        </div>
        <div id="rm-drawer-content"></div>
      </aside>
    </div>

    <!-- REAL SHA-256 SAFETY NUMBER MODAL -->
    <div class="rm-modal-backdrop" id="rm-safety-modal">
      <div class="rm-modal">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3>E2EE Safety Number</h3>
          <button type="button" class="rm-icon-btn" id="rm-safety-modal-close">${renderIcon("x", { className: "icon-sm" })}</button>
        </div>
        <p style="margin: 0; font-size: 0.82rem; color: var(--rm-text-secondary); line-height: 1.45;">
          Numeric blocks computed via <b>SHA-256</b> over your real cryptographic keys (<code id="rm-safety-me-name" style="font-weight:700;"></code>) and <b id="rm-safety-peer-name"></b>'s keys. If they match on both devices, this session is end-to-end authentic.
        </p>
        <div class="rm-safety-grid" id="rm-safety-grid"></div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="rm-link-btn" id="rm-btn-copy-safety">Copy Safety Number</button>
          <button type="button" class="rm-icebreaker-btn" style="margin-top: 0; display: inline-flex; align-items: center; gap: 4px;" id="rm-btn-mark-verified">${renderIcon("check", { size: 14, className: "icon-xs" })} Mark Verified</button>
        </div>
      </div>
    </div>

    <!-- NEW CONVERSATION / START REAL DM MODAL -->
    <div class="rm-modal-backdrop" id="rm-new-chat-modal">
      <div class="rm-modal">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3>New Conversation</h3>
          <button type="button" class="rm-icon-btn" id="rm-new-chat-close">${renderIcon("x", { className: "icon-sm" })}</button>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="rm-link-btn" id="rm-modal-create-room">+ New E2EE Group</button>
          <button type="button" class="rm-link-btn" id="rm-modal-join-room">${renderIcon("key", { size: 14, className: "icon-xs" })} Join with Invite Code</button>
          <button type="button" class="rm-link-btn" id="rm-modal-new-secret" style="color: #10b981; border-color: rgba(16, 185, 129, 0.4);">${renderIcon("lock", { size: 14, className: "icon-xs" })} New Secret Chat</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 0.75rem; font-weight: 700; color: var(--rm-text-muted); text-transform: uppercase;">Start DM or Secret Chat (64-hex or search contacts)</label>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="rm-new-chat-input" class="rm-field-input" placeholder="Paste 64-hex pubkey or filter by name…" autocomplete="off" />
            <button type="button" class="rm-icebreaker-btn" id="rm-new-chat-go" style="margin-top: 0; white-space: nowrap;">Open DM</button>
            <button type="button" class="rm-icebreaker-btn" id="rm-new-chat-secret-go" style="margin-top: 0; white-space: nowrap; background: #059669; border-color: #10b981;">${renderIcon("lock", { size: 14, className: "icon-xs" })} Secret</button>
          </div>
        </div>
        <div class="rm-contact-picker-list" id="rm-contact-picker-list"></div>
      </div>
    </div>

    <!-- REAL FREEPOLLS IN-CHAT CREATOR MODAL -->
    <div class="rm-modal-backdrop" id="rm-poll-modal">
      <div class="rm-modal">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3>New FreePolls Poll</h3>
          <button type="button" class="rm-icon-btn" id="rm-poll-close">${renderIcon("x", { className: "icon-sm" })}</button>
        </div>
        <p style="margin: 0; font-size: 0.8rem; color: var(--rm-text-secondary);">
          Publishes a live FreePolls contract on your Freenet node and sends an interactive poll to this conversation.
        </p>
        <input type="text" id="rm-poll-question" class="rm-field-input" placeholder="Poll question…" maxlength="300" />
        <textarea id="rm-poll-options" class="rm-field-input" rows="4" placeholder="One option per line (at least 2)…"></textarea>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--rm-text-secondary); cursor: pointer;">
          <input type="checkbox" id="rm-poll-multi" /> Allow multiple choices
        </label>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="rm-link-btn" id="rm-poll-cancel">Cancel</button>
          <button type="button" class="rm-icebreaker-btn" id="rm-poll-submit" style="margin-top: 0;">Publish & Send</button>
        </div>
      </div>
    </div>
  `;

  // Grab mounted DOM elements
  const workspaceEl = rootEl.querySelector("#rm-workspace") as HTMLElement;
  const nodePillEl = rootEl.querySelector("#rm-node-pill") as HTMLElement;
  const nodeLabelEl = rootEl.querySelector("#rm-node-label") as HTMLElement;
  const inboxSearchEl = rootEl.querySelector("#rm-inbox-search") as HTMLInputElement;
  const inboxSearchClearEl = rootEl.querySelector("#rm-inbox-search-clear") as HTMLButtonElement;
  const filterBarEl = rootEl.querySelector("#rm-filter-bar") as HTMLElement;
  const chipUnreadCountEl = rootEl.querySelector("#rm-chip-unread-count") as HTMLElement;
  const convListEl = rootEl.querySelector("#rm-conv-list") as HTMLElement;

  const headerAvatarSlotEl = rootEl.querySelector("#rm-header-avatar-slot") as HTMLElement;
  const headerTitleEl = rootEl.querySelector("#rm-header-title") as HTMLElement;
  const headerTrustBadgeEl = rootEl.querySelector("#rm-header-trust-badge") as HTMLElement;
  const headerSubtitleEl = rootEl.querySelector("#rm-header-subtitle") as HTMLElement;
  const inviteTopBtn = rootEl.querySelector("#rm-btn-invite-top") as HTMLButtonElement;
  const safetyTopBtn = rootEl.querySelector("#rm-btn-safety-verify") as HTMLButtonElement;
  const drawerToggleBtn = rootEl.querySelector("#rm-btn-drawer-toggle") as HTMLButtonElement;

  const threadSearchBarEl = rootEl.querySelector("#rm-thread-search-bar") as HTMLElement;
  const threadSearchInputEl = rootEl.querySelector("#rm-thread-search-input") as HTMLInputElement;
  const pinnedBarEl = rootEl.querySelector("#rm-pinned-bar") as HTMLElement;
  const pinnedContentEl = rootEl.querySelector("#rm-pinned-content") as HTMLElement;
  const pinnedTextEl = rootEl.querySelector("#rm-pinned-text") as HTMLElement;
  const pinnedUnpinBtn = rootEl.querySelector("#rm-pinned-unpin-btn") as HTMLButtonElement;
  const messagesScrollerEl = rootEl.querySelector("#rm-messages-scroller") as HTMLElement;
  const messagesTrackEl = rootEl.querySelector("#rm-messages-track") as HTMLElement;

  const replyBannerEl = rootEl.querySelector("#rm-reply-banner") as HTMLElement;
  const replyBannerTextEl = rootEl.querySelector("#rm-reply-banner-text") as HTMLElement;
  const editBannerEl = rootEl.querySelector("#rm-edit-banner") as HTMLElement;
  const editBannerTextEl = rootEl.querySelector("#rm-edit-banner-text") as HTMLElement;
  const editBannerCancelBtn = rootEl.querySelector("#rm-edit-banner-cancel") as HTMLButtonElement;
  const mediaStageEl = rootEl.querySelector("#rm-media-stage") as HTMLElement;
  const mediaStagePreviewEl = rootEl.querySelector("#rm-media-stage-preview") as HTMLElement;
  const mediaStageLabelEl = rootEl.querySelector("#rm-media-stage-label") as HTMLElement;
  const fileImageEl = rootEl.querySelector("#rm-file-image") as HTMLInputElement;
  const fileAudioEl = rootEl.querySelector("#rm-file-audio") as HTMLInputElement;
  const fileDocEl = rootEl.querySelector("#rm-file-doc") as HTMLInputElement;
  const attachMenuEl = rootEl.querySelector("#rm-attach-menu") as HTMLElement;
  const attachBtnEl = rootEl.querySelector("#rm-btn-attach") as HTMLButtonElement;
  const composerOuterEl = rootEl.querySelector("#rm-composer-outer") as HTMLElement;
  const composerFormEl = rootEl.querySelector("#rm-composer-form") as HTMLFormElement;
  const composerInputEl = rootEl.querySelector("#rm-composer-input") as HTMLTextAreaElement;
  const sendBtnEl = rootEl.querySelector("#rm-btn-send") as HTMLButtonElement;

  let stagedMedia: PreparedChatMedia | null = null;
  let uploadingMedia = false;
  let editingMessageId: string | null = null;
  // Media tokens of the message being edited, kept so an edit never drops existing attachments.
  let editingMediaTokens = "";

  function setStagedMedia(next: PreparedChatMedia | null) {
    if (stagedMedia && stagedMedia.previewUrl && stagedMedia.previewUrl !== next?.previewUrl) {
      try {
        URL.revokeObjectURL(stagedMedia.previewUrl);
      } catch {}
    }
    stagedMedia = next;
    if (!next) {
      mediaStageEl.classList.remove("open");
      mediaStagePreviewEl.innerHTML = "";
      mediaStageLabelEl.textContent = "";
      return;
    }
    mediaStageLabelEl.textContent = next.label;
    if (next.kind === "img") {
      mediaStagePreviewEl.innerHTML = `<img src="${safeUrl(next.previewUrl)}" alt="Staged photo" />`;
    } else if (next.kind === "audio" || next.kind === "voice") {
      mediaStagePreviewEl.innerHTML = `<span style="display: grid; place-items: center; width: 100%; height: 100%;">${renderIcon("music", { size: 24 })}</span>`;
    } else {
      const icon = fileExtensionIcon(next.filename || "");
      mediaStagePreviewEl.innerHTML = `<span style="font-size: 22px; line-height: 1; display: grid; place-items: center; width: 100%; height: 100%;">${icon}</span>`;
    }
    mediaStageEl.classList.add("open");
  }

  const drawerEl = rootEl.querySelector("#rm-info-drawer") as HTMLElement;
  const drawerHeaderLabelEl = rootEl.querySelector("#rm-drawer-header-label") as HTMLElement;
  const drawerContentEl = rootEl.querySelector("#rm-drawer-content") as HTMLElement;

  const safetyModalEl = rootEl.querySelector("#rm-safety-modal") as HTMLElement;
  const safetyMeNameEl = rootEl.querySelector("#rm-safety-me-name") as HTMLElement;
  const safetyPeerNameEl = rootEl.querySelector("#rm-safety-peer-name") as HTMLElement;
  const safetyGridEl = rootEl.querySelector("#rm-safety-grid") as HTMLElement;
  const markVerifiedBtnEl = rootEl.querySelector("#rm-btn-mark-verified") as HTMLButtonElement;

  const newChatModalEl = rootEl.querySelector("#rm-new-chat-modal") as HTMLElement;
  const newChatInputEl = rootEl.querySelector("#rm-new-chat-input") as HTMLInputElement;
  const contactPickerListEl = rootEl.querySelector("#rm-contact-picker-list") as HTMLElement;

  const pollModalEl = rootEl.querySelector("#rm-poll-modal") as HTMLElement;
  const pollQuestionEl = rootEl.querySelector("#rm-poll-question") as HTMLInputElement;
  const pollOptionsEl = rootEl.querySelector("#rm-poll-options") as HTMLTextAreaElement;
  const pollMultiEl = rootEl.querySelector("#rm-poll-multi") as HTMLInputElement;
  const pollSubmitBtnEl = rootEl.querySelector("#rm-poll-submit") as HTMLButtonElement;

  // Lift modals to chatModal parent so both Messenger & Classic views can use them seamlessly
  if (rootEl.parentElement) {
    if (safetyModalEl) rootEl.parentElement.appendChild(safetyModalEl);
    if (newChatModalEl) rootEl.parentElement.appendChild(newChatModalEl);
    if (pollModalEl) rootEl.parentElement.appendChild(pollModalEl);
  }
  // the lifted modals are no longer inside rootEl: look their buttons up in them (rootEl.querySelector finds nothing and
  // an optional call on null fails silently, which left their X, Cancel and Open DM buttons dead)
  const inModals = (sel: string) => rootEl.querySelector(sel) ?? safetyModalEl?.querySelector(sel) ?? newChatModalEl?.querySelector(sel) ?? pollModalEl?.querySelector(sel);

  function fitInput() {
    if (!composerInputEl.value) {
      composerInputEl.style.height = "";
      composerInputEl.style.overflowY = "hidden";
      return;
    }
    composerInputEl.style.height = "auto";
    const sh = composerInputEl.scrollHeight;
    composerInputEl.style.height = `${Math.min(132, sh)}px`;
    composerInputEl.style.overflowY = sh > 132 ? "auto" : "hidden";
  }

  const roomMetaCache = new Map<string, { raw: string | null; cleared: string | null; meta: RoomMeta }>();

  /** Inspect stored raw messages of a room synchronously for sorting timestamp & optimistic state. */
  function storedRoomMeta(roomId: string): RoomMeta {
    const raw = safeStorage.getItem(`freenet_chat_${roomId}`);
    // the clear mark is part of the key: clearing a chat leaves the stored messages as they are
    const cleared = safeStorage.getItem(`freenet_chat_cleared_${roomId}`);
    const cached = roomMetaCache.get(roomId);
    if (cached && cached.raw === raw && cached.cleared === cleared) return cached.meta;
    const meta = roomMetaOf(raw, Number(cleared || 0));
    roomMetaCache.set(roomId, { raw, cleared, meta });
    return meta;
  }

  function formatPreviewLine(text: string, sender: string, me: string, type: "dm" | "priv" | "comm"): string {
    const clean = summarizeChatMediaText(text, (t) => plainMentions(t, deps.getAuthorDisplayName));
    if (!clean) return "Encrypted message";
    if (sender === me) return clean;
    if (type !== "dm" && sender) {
      const who = sender === "system" ? "System" : deps.getAuthorDisplayName(sender);
      return `${who}: ${clean}`;
    }
    return clean;
  }

  async function buildUnifiedConversations(): Promise<UnifiedConversation[]> {
    const identity = deps.getIdentity();
    if (!identity) return [];
    const me = identity.pubkey;
    const st = deps.getActiveState();
    const read = deps.conversation.readMarks();
    const openId = deps.openRoomId();
    const pins = pinnedSet();

    // Update previewCache directly from currently open conversation if messages are loaded
    if (openId && st.shownMessages.length > 0) {
      const realMsgs = st.shownMessages.filter((m) => !m.system_event);
      const last = realMsgs.length > 0 ? realMsgs[realMsgs.length - 1] : st.shownMessages[st.shownMessages.length - 1];
      setCachedPreview(openId, {
        text: last.text || (last.system_event === "join" ? "joined the room" : ""),
        sender: last.sender,
        timestamp: last.timestamp,
        optimistic: last.id.startsWith("msg_opt_"),
      });
      const openStoredTs = storedRoomMeta(openId).lastTs;
      if (openStoredTs) hydratedStamp.set(openId, openStoredTs);
    } else if (openId && st.shownMessages.length === 0) {
      previewCache.delete(openId);
      try { safeStorage.removeItem(`radica_preview_${openId}`); } catch {}
    }

    const items: UnifiedConversation[] = [];

    // 1. Private Rooms (AES-256-GCM & River WASM)
    const rooms = deps.getAllPrivateRooms();
    await Promise.all(
      rooms.map(async (r) => {
        const name = await freenet
          .getPrivateRoomDecryptedName(identity, r)
          .catch(() => roomNameCache.get(r.id) || `Private Room (${r.id.slice(9, 15)})`);
        roomNameCache.set(r.id, name);

        const unread = openId === r.id ? 0 : deps.conversation.unread(r.id, read);
        const meta = storedRoomMeta(r.id);
        const cached = getCachedPreview(r.id);
        const lastTs = Math.max(cached?.timestamp ?? 0, meta.lastTs, r.created_at || 0);

        let previewText = "No messages · E2EE encrypted room";
        let previewMine = false;
        let previewOptimistic = false;
        if (cached && cached.timestamp >= meta.lastTs) {
          previewMine = cached.sender === me;
          previewOptimistic = !!cached.optimistic;
          previewText = formatPreviewLine(cached.text, cached.sender, me, "priv");
        } else if (meta.count > 0) {
          previewMine = meta.lastSender === me;
          previewOptimistic = meta.optimistic;
          previewText = meta.rawText && !meta.rawText.startsWith("sym:")
            ? formatPreviewLine(meta.rawText, meta.lastSender, me, "priv")
            : "Encrypted message…";
        }

        items.push({
          key: `priv:${r.id}`,
          roomId: r.id,
          type: "priv",
          name,
          origin: r.is_channel ? (r.river ? "Channel · River" : "Channel") : (r.river ? "River" : undefined),
          avatarUrl: r.avatar_url,
          monogram: makeMonogram(name, false),
          pinned: pins.has(`priv:${r.id}`),
          unread,
          lastTs,
          previewText,
          previewMine,
          previewOptimistic,
          privateRoom: r,
          isChannel: !!r.is_channel,
        });
      })
    );

    // 2. Community Rooms
    for (const c of deps.getJoinedCommunities()) {
      const roomId = `comm_${c.id}`;
      const unread = openId === roomId ? 0 : deps.conversation.unread(roomId, read);
      const meta = storedRoomMeta(roomId);
      const cached = getCachedPreview(roomId);
      const lastTs = Math.max(cached?.timestamp ?? 0, meta.lastTs, c.created_at || 0);

      let previewText = c.description ? c.description : `Public room #r/${c.slug}`;
      let previewMine = false;
      let previewOptimistic = false;
      if (meta.count > 0) {
        previewMine = meta.lastSender === me;
        previewOptimistic = meta.optimistic;
        previewText = formatPreviewLine(meta.rawText, meta.lastSender, me, "comm");
      } else if (cached) {
        previewMine = cached.sender === me;
        previewOptimistic = !!cached.optimistic;
        previewText = formatPreviewLine(cached.text, cached.sender, me, "comm");
      }

      items.push({
        key: `comm:${c.id}`,
        roomId,
        type: "comm",
        name: `r/${c.slug}`,
        monogram: makeMonogram(c.slug, true),
        pinned: pins.has(`comm:${c.id}`),
        unread,
        lastTs,
        previewText,
        previewMine,
        previewOptimistic,
        community: c,
      });
    }

    // 3. Direct Messages: only people we have a conversation with. Following someone does not open an empty chat
    // (new chats start from the contact search, which still offers the people we follow).
    // the open plain DM is listed even before its first message; an open Secret Chat does not bring the plain DM along
    const openDm = st.peer && !st.isSecret ? st.peer : null;
    const rawPeers = Array.from(new Set([...freenet.getChatPeers(me), ...(openDm ? [openDm] : [])]));
    freenet.warmPeers(rawPeers);
    const isBlockedPeer = (pk: string) => (deps.isPeerBlocked ? deps.isPeerBlocked(pk) : freenet.blockedBy(me).has(pk));
    const knownPeers = rawPeers.filter(
      (pk) => pk && pk !== me && !isBlockedPeer(pk) && (pk === openDm || !freenet.isChatPeerRemoved(me, pk))
    );

    const nameCount = new Map<string, number>();
    for (const pk of knownPeers) {
      const dn = deps.getAuthorDisplayName(pk);
      nameCount.set(dn, (nameCount.get(dn) ?? 0) + 1);
    }

    for (const pk of knownPeers) {
      const roomId = freenet.getRoomId(me, pk);
      const displayName = deps.getAuthorDisplayName(pk);
      const fromRiver = freenet.riverOnly.has(pk);
      const unread = openId === roomId ? 0 : deps.conversation.unread(roomId, read);
      const meta = storedRoomMeta(roomId);
      const cached = getCachedPreview(roomId);
      const lastTs = Math.max(cached?.timestamp ?? 0, meta.lastTs);

      let previewText = "No messages · Tap to start";
      let previewMine = false;
      let previewOptimistic = false;
      if (cached && cached.timestamp >= meta.lastTs) {
        previewMine = cached.sender === me;
        previewOptimistic = !!cached.optimistic;
        previewText = formatPreviewLine(cached.text, cached.sender, me, "dm");
      } else if (meta.count > 0) {
        previewMine = meta.lastSender === me;
        previewOptimistic = meta.optimistic;
        const isPlain = meta.rawText && !meta.rawText.startsWith("e2e:") && !meta.rawText.startsWith("sym:");
        previewText = isPlain ? formatPreviewLine(meta.rawText, meta.lastSender, me, "dm") : "Encrypted message…";
      } else if (fromRiver) {
        const roomsIn = Object.values(freenet.riverOnly.get(pk) ?? {});
        if (roomsIn.length) previewText = `In ${roomsIn.join(", ")}`;
      }

      items.push({
        key: `dm:${pk}`,
        roomId,
        type: "dm",
        name: displayName,
        dupSuffix: (nameCount.get(displayName) ?? 0) > 1 ? pk.slice(0, 4) : undefined,
        origin: fromRiver ? "River" : undefined,
        avatarUrl: deps.getAuthorAvatarUrl(pk),
        avatarFallbackSeed: pk,
        pinned: pins.has(`dm:${pk}`),
        unread,
        lastTs,
        previewText,
        previewMine,
        previewOptimistic,
        peerPk: pk,
      });
    }

    // 4. Secret Chats (Single-Device Ephemeral PFS Chats)
    const secretPeers = freenet.getSecretChatPeers(me).filter((pk) => pk && pk !== me);
    for (const pk of secretPeers) {
      const roomId = freenet.getSecretRoomId(me, pk);
      const displayName = deps.getAuthorDisplayName(pk);
      const unread = openId === roomId ? 0 : deps.conversation.unread(roomId, read);
      const meta = storedRoomMeta(roomId);
      const cached = getCachedPreview(roomId);
      const lastTs = Math.max(cached?.timestamp ?? 0, meta.lastTs);

      let previewText = "Secret Chat · Tap to start";
      let previewMine = false;
      let previewOptimistic = false;
      if (cached && cached.timestamp >= meta.lastTs) {
        previewMine = cached.sender === me;
        previewOptimistic = !!cached.optimistic;
        previewText = formatPreviewLine(cached.text, cached.sender, me, "dm");
      } else if (meta.count > 0) {
        previewMine = meta.lastSender === me;
        previewOptimistic = meta.optimistic;
        const isPlain = meta.rawText && !meta.rawText.startsWith("secret:v1:") && !meta.rawText.startsWith("e2e:");
        previewText = isPlain ? formatPreviewLine(meta.rawText, meta.lastSender, me, "dm") : "Secret message…";
      }

      items.push({
        key: `secret:${pk}`,
        roomId,
        type: "secret",
        isSecret: true,
        name: displayName,
        avatarUrl: deps.getAuthorAvatarUrl(pk),
        avatarFallbackSeed: pk,
        pinned: pins.has(`secret:${pk}`),
        unread,
        lastTs,
        previewText,
        previewMine,
        previewOptimistic,
        peerPk: pk,
      });
    }

    // Sort: Pinned first, then by real chronological lastTs descending, then alphabetical
    items.sort((a, b) => {
      if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
      if (b.lastTs !== a.lastTs) return b.lastTs - a.lastTs;
      return a.name.localeCompare(b.name);
    });

    return items;
  }

  /** Asynchronously decrypts the last message of closed E2EE DMs / Private Rooms so previews show real text. */
  async function hydrateClosedPreviews(convs: UnifiedConversation[]) {
    if (hydrating || !isVisible()) return;
    const identity = deps.getIdentity();
    if (!identity) return;
    hydrating = true;
    let changed = false;
    try {
      for (const c of convs) {
        if (!isVisible()) break;
        const openId = deps.openRoomId();
        const meta = storedRoomMeta(c.roomId);
        const stamp = meta.lastTs || (c.type === "priv" && c.origin === "River" ? 1 : 0);
        if (
          !shouldHydratePreview({
            type: c.type,
            roomId: c.roomId,
            openRoomId: openId,
            stamp,
            lastHydratedStamp: hydratedStamp.get(c.roomId),
          })
        ) {
          continue;
        }
        hydratedStamp.set(c.roomId, stamp);

        // Yield to macrotask queue between rooms so WASM reads never starve UI input or WebSocket frames
        await new Promise((r) => setTimeout(r, 0));
        if (!isVisible()) break;

        try {
          if (c.type === "priv" && c.privateRoom?.river) {
            const msgs = (await freenet.getPrivateRoomChatMessages(identity, c.privateRoom)).filter((m) => !(deps.isPeerBlocked?.(m.sender) ?? false));
            const afterTs = storedRoomMeta(c.roomId).lastTs;
            if (afterTs) hydratedStamp.set(c.roomId, afterTs);
            if (msgs.length > 0 && deps.openRoomId() !== c.roomId) {
              const last = msgs[msgs.length - 1];
              const nextPreview: PreviewItem = {
                text: last.text,
                sender: last.sender,
                timestamp: last.timestamp,
                optimistic: last.id.startsWith("msg_opt_"),
              };
              const prev = getCachedPreview(c.roomId);
              if (shouldUpdateCachedPreview(prev, nextPreview)) {
                setCachedPreview(c.roomId, nextPreview);
                changed = true;
              }
            }
          } else {
            const visible = freenet.visibleChat(c.roomId);
            if (visible.length === 0) {
              hydratedStamp.set(c.roomId, stamp || 1);
              continue;
            }
            const rawLast = visible[visible.length - 1];
            const last = await freenet.decryptChatMessage(identity, rawLast, c.peerPk, c.roomId);
            const afterTs = last.timestamp || meta.lastTs;
            if (afterTs) hydratedStamp.set(c.roomId, afterTs);

            if (deps.openRoomId() !== c.roomId) {
              const nextPreview: PreviewItem = {
                text: last.text,
                sender: last.sender,
                timestamp: last.timestamp,
                optimistic: last.id.startsWith("msg_opt_"),
              };
              const prev = getCachedPreview(c.roomId);
              if (shouldUpdateCachedPreview(prev, nextPreview)) {
                setCachedPreview(c.roomId, nextPreview);
                changed = true;
              }
            }
          }
        } catch {
          // ignore single room read failure
        }
      }
    } finally {
      hydrating = false;
    }
    if (changed && isVisible()) void refreshInbox(true);
  }

  const restoredDelegatePins = new Set<string>();
  async function refreshInbox(skipHydrate = false) {
    if (!isVisible()) return;
    if (inboxRunning) {
      inboxQueued = true;
      return;
    }
    inboxRunning = true;
    try {
      do {
        inboxQueued = false;
        const identity = deps.getIdentity();
        if (!identity || !isVisible()) return;
        const me = identity.pubkey;

        // shortcut: reads the per-feature entries used before durable.ts (one release only); delete with the next release
        if (!restoredDelegatePins.has(me)) {
          restoredDelegatePins.add(me);
          void import("./delegate.ts").then(async (m) => {
            try {
              if (!safeStorage.getItem(`radica_pinned_chats_${me}`)) {
                const fromNode = await m.nodeGet(`pinned:${me}`);
                if (fromNode) {
                  safeStorage.setItem(`radica_pinned_chats_${me}`, fromNode);
                  void refreshInbox();
                }
              }
              if (!safeStorage.getItem(`radica_verified_chats_${me}`)) {
                const fromNode = await m.nodeGet(`verified:${me}`);
                if (fromNode) {
                  safeStorage.setItem(`radica_verified_chats_${me}`, fromNode);
                }
              }
            } catch {}
          });
        }

        updateStatusBanner();
        const allConvs = await buildUnifiedConversations();
        lastConvs = allConvs;
        if (!isVisible()) return;
        const totalUnreadConvs = allConvs.filter((c) => c.unread > 0).length;
        chipUnreadCountEl.textContent = String(totalUnreadConvs);

        const q = inboxQuery.trim().toLowerCase();
        const activeKey = activeConvKey();

        const filtered = allConvs.filter((c) => {
          if (activeFilter === "unread" && c.unread === 0) return false;
          if (activeFilter === "dm" && c.type !== "dm" && c.type !== "secret") return false; // Secret Chats are DMs too
          if (activeFilter === "priv" && (c.type !== "priv" || c.isChannel)) return false;
          if (activeFilter === "channel" && (c.type !== "priv" || !c.isChannel)) return false;
          if (activeFilter === "comm" && c.type !== "comm") return false;
          if (q) {
            const hay = `${c.name} ${c.peerPk ?? ""} ${c.previewText}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          const emptyHtml = `
            <div style="padding: 28px 14px; text-align: center; color: var(--rm-text-muted); font-size: 0.83rem; line-height: 1.5;">
              ${allConvs.length === 0
                ? `No conversations yet.<br/>Click the compose icon above to start an encrypted chat or create a room.`
                : `No conversations match this filter.`}
            </div>
          `;
          if (emptyHtml !== lastConvListHtml) {
            lastConvListHtml = emptyHtml;
            convListEl.innerHTML = emptyHtml;
          }
        } else {
          const convItems = filtered.map((c) => {
            const isActive = c.key === activeKey;
            let avatarHtml = "";
            if (c.type === "secret") {
              const fallback = generateDefaultAvatar(c.avatarFallbackSeed || "radica");
              avatarHtml = `
                  <div class="rm-conv-avatar-wrap">
                    <img class="rm-conv-avatar" style="border: 2px solid #10b981;" src="${safeUrl(c.avatarUrl) || fallback}" alt="${escapeHtml(c.name)}" onerror="this.onerror=null;this.src='${fallback}'" />
                    <span class="rm-avatar-subbadge" style="background: #10b981; color: #fff;" title="Secret Chat (Single-Device Forward Secrecy)">${renderIcon("lock", { size: 9, className: "icon-xs" })}</span>
                  </div>
                `;
            } else if (c.type === "dm") {
              const fallback = generateDefaultAvatar(c.avatarFallbackSeed || "radica");
              avatarHtml = `
                  <div class="rm-conv-avatar-wrap">
                    <img class="rm-conv-avatar" src="${safeUrl(c.avatarUrl) || fallback}" alt="${escapeHtml(c.name)}" onerror="this.onerror=null;this.src='${fallback}'" />
                    <span class="rm-avatar-subbadge" title="E2EE Direct Messages">
                      <svg viewBox="0 0 24 24" class="svg-icon" style="width:10px;height:10px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                  </div>
                `;
            } else if (c.type === "priv") {
              const isChan = !!c.isChannel;
              const innerAvatar = c.avatarUrl
                ? `<img class="rm-conv-avatar" src="${safeUrl(c.avatarUrl)}" alt="${escapeHtml(c.name)}" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='grid';" /><div class="rm-room-monogram ${isChan ? "chan" : "priv"}" style="display:none;">${isChan ? renderIcon("megaphone", { size: 20 }) : escapeHtml(c.monogram || "RM")}</div>`
                : `<div class="rm-room-monogram ${isChan ? "chan" : "priv"}">${isChan ? renderIcon("megaphone", { size: 20 }) : escapeHtml(c.monogram || "RM")}</div>`;
              avatarHtml = `
                  <div class="rm-conv-avatar-wrap">
                    ${innerAvatar}
                    <span class="rm-avatar-subbadge" title="${isChan ? "Broadcast Channel (Read-Only for Subscribers)" : "E2EE Private Group"}">
                      ${isChan ? renderIcon("megaphone", { size: 10, className: "icon-xs" }) : renderIcon("lock", { size: 10, className: "icon-xs" })}
                    </span>
                  </div>
                `;
            } else {
              avatarHtml = `
                  <div class="rm-conv-avatar-wrap">
                    <div class="rm-room-monogram comm">${escapeHtml(c.monogram || "#")}</div>
                    <span class="rm-avatar-subbadge comm-dot" title="Public Community">#</span>
                  </div>
                `;
            }

            const checkPrefix = c.previewMine
              ? `<span style="color: var(--rm-accent); font-weight:700;">${c.previewOptimistic ? "✓" : "✓✓"} You:</span> `
              : "";

            const cls = `rm-conv-item${isActive ? " active" : ""}${c.unread > 0 ? " unread" : ""}`;
            const inner = `
                  ${avatarHtml}
                  <div class="rm-conv-body">
                    <div class="rm-conv-top">
                      <div class="rm-conv-name-row">
                        <span class="rm-conv-name">${escapeHtml(c.name)}</span>
                        ${c.type === "secret" ? `<span class="rm-origin-pill" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">Secret</span>` : ""}
                        ${c.dupSuffix ? `<span class="rm-origin-pill">${escapeHtml(c.dupSuffix)}</span>` : ""}
                        ${c.origin ? `<span class="rm-origin-pill">${escapeHtml(c.origin)}</span>` : ""}
                      </div>
                      <span class="rm-conv-time">${escapeHtml(c.lastTs ? formatInboxTime(c.lastTs) : "")}</span>
                    </div>
                    <div class="rm-conv-bottom">
                      <span class="rm-conv-preview">${checkPrefix}${escapeHtml(c.previewText)}</span>
                      <div class="rm-conv-meta-right">
                        ${c.pinned ? `<span class="rm-pin-icon" title="Pinned conversation">${renderIcon("pin", { size: 12, className: "icon-xs" })}</span>` : ""}
                        ${c.unread > 0 ? `<span class="rm-unread-pill">${c.unread > 99 ? "99+" : c.unread}</span>` : ""}
                      </div>
                    </div>
                  </div>
                `;
            return { key: c.key, cls, inner };
          });

          const nextSig = convItems.map((i) => `${i.key}\x1f${i.cls}\x1f${i.inner}`).join("\x1e");
          if (nextSig !== lastConvListHtml) {
            lastConvListHtml = nextSig;
            const old = new Map<string, HTMLButtonElement>();
            for (const n of Array.from(convListEl.children) as HTMLElement[]) {
              const k = n.tagName === "BUTTON" ? n.dataset.convKey : undefined;
              if (k) old.set(k, n as HTMLButtonElement);
              else n.remove();
            }
            let cursor: Element | null = convListEl.firstElementChild;
            for (const item of convItems) {
              let btn = old.get(item.key);
              if (!btn) {
                btn = document.createElement("button");
                btn.type = "button";
                btn.dataset.convKey = item.key;
                btn.className = item.cls;
                btn.innerHTML = item.inner;
                convRowInner.set(btn, item.inner);
              } else {
                old.delete(item.key);
                if (btn.className !== item.cls) btn.className = item.cls;
                if (convRowInner.get(btn) !== item.inner) {
                  btn.innerHTML = item.inner;
                  convRowInner.set(btn, item.inner);
                }
              }
              if (btn === cursor) cursor = cursor.nextElementSibling;
              else convListEl.insertBefore(btn, cursor);
            }
            for (const leftover of old.values()) leftover.remove();
          }
        }

        if (!skipHydrate) {
          void hydrateClosedPreviews(allConvs);
        }
      } while (inboxQueued);
    } finally {
      inboxRunning = false;
    }
  }

  function updateStatusBanner() {
    const st = deps.getActiveState();
    const rootsCount = deps.getFollowingKeys().length;
    nodePillEl.classList.toggle("online", st.online);
    nodeLabelEl.textContent = st.online
      ? `Freenet connected${rootsCount ? ` · ${rootsCount} roots` : ""}`
      : "Local archive · Offline";
  }

  /** Computes real shared rooms & communities with a peer for the Signal First-Contact card & Drawer! */
  function sharedSpacesWithPeer(peerPk: string): string[] {
    const shared: string[] = [];
    for (const r of deps.getAllPrivateRooms()) {
      const members = (r.river ? freenet.riverRoster(r.id)?.members : undefined) ?? r.members;
      if (members.includes(peerPk)) {
        shared.push(roomNameCache.get(r.id) || `Room (${r.id.slice(9, 15)})`);
      }
    }
    const riverMap = freenet.riverOnly.get(peerPk);
    if (riverMap) {
      for (const rn of Object.values(riverMap)) {
        if (rn && !shared.includes(rn)) shared.push(rn);
      }
    }
    for (const c of deps.getAllCommunities()) {
      if (c.members.includes(peerPk)) {
        const label = `r/${c.slug}`;
        if (!shared.includes(label)) shared.push(label);
      }
    }
    return shared;
  }

  function renderHeader() {
    const st = deps.getActiveState();
    const verified = verifiedSet();
    const me = deps.getIdentity()?.pubkey || "";
    const openId = deps.openRoomId();
    const ttlBtn = rootEl.querySelector("#rm-btn-ttl-selector") as HTMLElement | null;

    if (st.peer) {
      composerOuterEl.style.display = "";
      const pk = st.peer;
      const name = deps.getAuthorDisplayName(pk);
      const avatar = deps.getAuthorAvatarUrl(pk);
      const fallback = generateDefaultAvatar(pk);
      const isVerified = verified.has(`dm:${pk}`);
      const isRiver = freenet.riverOnly.has(pk);

      headerAvatarSlotEl.innerHTML = `<img class="rm-header-avatar" ${st.isSecret ? 'style="border: 2px solid #10b981;"' : ""} src="${safeUrl(avatar) || fallback}" alt="${escapeHtml(name)}" onerror="this.onerror=null;this.src='${fallback}'" />`;
      const isBlocked = deps.isPeerBlocked ? deps.isPeerBlocked(pk) : freenet.blockedBy(me).has(pk);
      if (isBlocked) {
        headerTitleEl.textContent = name;
        headerTrustBadgeEl.style.display = "inline-flex";
        headerTrustBadgeEl.className = "rm-trust-pill";
        headerTrustBadgeEl.style.background = "var(--rm-danger-soft)";
        headerTrustBadgeEl.style.color = "var(--rm-danger)";
        headerTrustBadgeEl.innerHTML = `${renderIcon("ban", { size: 11 })} <span>Blocked</span>`;
        headerSubtitleEl.textContent = "Blocked contact · Feed & direct messages disabled";
        composerInputEl.placeholder = "Contact is blocked";
        composerInputEl.disabled = true;
        sendBtnEl.disabled = true;
        attachBtnEl.disabled = true;
        if (ttlBtn) ttlBtn.style.display = "none";
      } else {
        headerTrustBadgeEl.style.background = "";
        headerTrustBadgeEl.style.color = "";
        attachBtnEl.disabled = false;
        if (st.isSecret) {
          const curTtl = openId ? freenet.getSecretChatTTL(openId) : 0;
          const ttlLabel = formatTtlLabel(curTtl);
          headerTitleEl.textContent = name;
          headerTrustBadgeEl.style.display = "inline-flex";
          headerTrustBadgeEl.className = "rm-trust-pill secret";
          headerTrustBadgeEl.innerHTML = `${renderIcon("lock", { size: 11 })} <span>Secret Chat · Device Only</span>`;
          headerSubtitleEl.textContent = `PFS Ephemeral · Disappearing: ${ttlLabel}`;
          composerInputEl.placeholder = `Secret message to ${name} (ephemeral)…`;
          if (ttlBtn) {
            ttlBtn.style.display = "inline-flex";
            ttlBtn.innerHTML = `${renderIcon("clock", { size: 12 })} <span>${escapeHtml(ttlLabel)}</span>`;
          }
        } else {
          headerTitleEl.textContent = name;
          headerTrustBadgeEl.style.display = "inline-flex";
          headerTrustBadgeEl.className = "rm-trust-pill";
          headerTrustBadgeEl.innerHTML = isVerified ? `${renderIcon("shield", { size: 11 })} <span>E2EE · Verified</span>` : `${renderIcon("lock", { size: 11 })} <span>E2EE Private</span>`;
          headerSubtitleEl.textContent = `${st.online ? "Node online" : "Local"} · @${shortenKey(personaName(pk))} · ${isRiver ? "River E2EE Bridge" : "X25519 + AES-256-GCM"}`;
          composerInputEl.placeholder = `Encrypted message to ${name}…`;
          if (ttlBtn) ttlBtn.style.display = "none";
        }
        composerInputEl.disabled = false;
        sendBtnEl.disabled = false;
      }
      inviteTopBtn.style.display = "none";
      safetyTopBtn.style.display = "inline-flex";
    } else if (st.privateRoom) {
      if (ttlBtn) ttlBtn.style.display = "none";
      const r = st.privateRoom;
      const name = roomNameCache.get(r.id) || `Room (${r.id.slice(9, 15)})`;
      const memberCount = (r.river ? freenet.riverRoster(r.id)?.members.length : undefined) ?? r.members.length;
      const isVerified = verified.has(`priv:${r.id}`);
      const isChannel = !!r.is_channel;
      const roster = r.river ? freenet.riverRoster(r.id) : null;
      const isOwnerOrMod = (roster?.creator ?? r.creator) === me || (roster?.moderators ?? r.moderators ?? []).includes(me);

      if (r.avatar_url) {
        headerAvatarSlotEl.innerHTML = `<img class="rm-header-avatar" src="${safeUrl(r.avatar_url)}" alt="${escapeHtml(name)}" onerror="this.onerror=null;this.replaceWith((function(){const d=document.createElement('div');d.className='rm-header-monogram rm-room-monogram ${isChannel ? "chan" : "priv"}';if(isChannel){d.innerHTML = renderIcon('megaphone', { size: 22 });}else{d.textContent=makeMonogram(name, false);}return d;})());" />`;
      } else {
        headerAvatarSlotEl.innerHTML = `<div class="rm-header-monogram rm-room-monogram ${isChannel ? "chan" : "priv"}">${isChannel ? renderIcon("megaphone", { size: 22 }) : escapeHtml(makeMonogram(name, false))}</div>`;
      }
      headerTitleEl.textContent = name;
      headerTrustBadgeEl.style.display = "inline-flex";
      headerTrustBadgeEl.className = `rm-trust-pill ${isChannel ? "channel" : ""}`;
      headerTrustBadgeEl.innerHTML = isChannel
        ? (isOwnerOrMod ? `${renderIcon("megaphone", { size: 11 })} <span>Broadcast Channel · Admin</span>` : `${renderIcon("megaphone", { size: 11 })} <span>Broadcast Channel · Read-only</span>`)
        : (isVerified ? `${renderIcon("shield", { size: 11 })} <span>E2EE Group · Verified</span>` : `${renderIcon("lock", { size: 11 })} <span>E2EE Group</span>`);

      const allRooms = deps.getAllPrivateRooms();
      const linkedRoom = r.linked_room_id ? allRooms.find((lr) => lr.id === r.linked_room_id) : undefined;
      const linkedName = linkedRoom ? (roomNameCache.get(linkedRoom.id) || (isChannel ? "Comments" : "Channel")) : undefined;

      const linkedBtnHtml = linkedRoom
        ? ` · <button type="button" class="rm-header-link-pill" data-jump-room="${escapeHtml(linkedRoom.id)}" title="${isChannel ? "Open discussion room" : "Open broadcast channel"}">${isChannel ? renderIcon("messageCircle", { size: 11 }) + " Comments" : renderIcon("megaphone", { size: 11 }) + " Channel"}: ${escapeHtml(linkedName || "")}</button>`
        : "";

      headerSubtitleEl.innerHTML = isChannel
        ? `${memberCount} subscribers · Broadcast Channel${linkedBtnHtml}`
        : `${memberCount} members · ${r.river ? "River WASM Contract · E2EE" : "AES-256-GCM + X25519"}${linkedBtnHtml}`;

      if (isChannel && !isOwnerOrMod) {
        composerOuterEl.style.display = "none";
        composerInputEl.placeholder = "This broadcast channel is read-only for subscribers…";
        composerInputEl.disabled = true;
        sendBtnEl.disabled = true;
        attachBtnEl.disabled = true;
        attachMenuEl.classList.remove("open");
        replyBannerEl.classList.remove("open");
      } else {
        composerOuterEl.style.display = "";
        composerInputEl.placeholder = isChannel ? `Broadcast a message to subscribers…` : `Message ${name} (E2EE)…`;
        composerInputEl.disabled = false;
        sendBtnEl.disabled = false;
        attachBtnEl.disabled = false;
      }
      inviteTopBtn.style.display = "inline-flex";
      safetyTopBtn.style.display = "inline-flex";
    } else if (st.community) {
      composerOuterEl.style.display = "";
      const c = st.community;
      const count = freenet.getCommunityParticipants(c).length;
      headerAvatarSlotEl.innerHTML = `<div class="rm-header-monogram rm-room-monogram comm">${escapeHtml(makeMonogram(c.slug, true))}</div>`;
      headerTitleEl.textContent = `r/${c.slug}`;
      headerTrustBadgeEl.style.display = "inline-flex";
      headerTrustBadgeEl.className = "rm-trust-pill public";
      headerTrustBadgeEl.innerHTML = `${renderIcon("globe", { size: 11 })} <span>Public Room</span>`;
      headerSubtitleEl.textContent = `${count} participants · ${c.name} · Public Ed25519 signed`;
      composerInputEl.placeholder = `Public message in #r/${c.slug}…`;
      composerInputEl.disabled = false;
      sendBtnEl.disabled = false;
      inviteTopBtn.style.display = "none";
      safetyTopBtn.style.display = "none";
    } else {
      composerOuterEl.style.display = "";
      headerAvatarSlotEl.innerHTML = "";
      headerTitleEl.textContent = "Messages on Freenet";
      headerTrustBadgeEl.style.display = "none";
      headerSubtitleEl.textContent = "Select a contact, E2EE group, or community";
      composerInputEl.placeholder = "Select a conversation first…";
      composerInputEl.disabled = true;
      sendBtnEl.disabled = true;
      inviteTopBtn.style.display = "none";
      safetyTopBtn.style.display = "none";
    }
    const hasActiveConv = !!(st.peer || st.privateRoom || st.community);
    if (!hasActiveConv) {
      attachBtnEl.disabled = true;
    }
  }

  function renderReplyBanner() {
    const identity = deps.getIdentity();
    const reply = deps.getActiveState().replyingTo;
    const openId = deps.openRoomId();
    const st = deps.getActiveState();
    const me = identity?.pubkey || "";
    const isChannel = !!st.privateRoom?.is_channel;
    const roster = st.privateRoom?.river ? freenet.riverRoster(st.privateRoom.id) : null;
    const isOwnerOrMod = (roster?.creator ?? st.privateRoom?.creator) === me || (roster?.moderators ?? st.privateRoom?.moderators ?? []).includes(me);

    if (!reply || !openId || reply.room_id !== openId || (isChannel && !isOwnerOrMod)) {
      replyBannerEl.classList.remove("open");
      return;
    }
    const who = reply.sender === identity?.pubkey ? "yourself" : deps.getAuthorDisplayName(reply.sender);
    const excerpt = summarizeChatMediaText(reply.text, (t) => plainMentions(t, deps.getAuthorDisplayName)).slice(0, 90);
    replyBannerTextEl.innerHTML = `Replying to <b>${escapeHtml(who)}</b>: ${escapeHtml(excerpt)}`;
    replyBannerEl.classList.add("open");
  }

  function renderThread(scrollToBottom = false) {
    if (!isVisible()) return;
    const identity = deps.getIdentity();
    if (!identity) return;
    const me = identity.pubkey;
    const st = deps.getActiveState();
    const curKey = activeConvKey() || "";
    const switchedConv = curKey !== lastRenderedConvKey;
    if (switchedConv) {
      visibleMsgLimit = CHAT_PAGE_SIZE;
      setStagedMedia(null);
      editingMessageId = null;
      if (editBannerEl) editBannerEl.style.display = "none";
    }
    lastRenderedConvKey = curKey;

    const wasNearBottom =
      messagesScrollerEl.scrollHeight - messagesScrollerEl.scrollTop - messagesScrollerEl.clientHeight < 90;
    const prevScrollTop = messagesScrollerEl.scrollTop;

    renderHeader();
    renderReplyBanner();

    const openId = deps.openRoomId();
    if (!openId) {
      messagesTrackEl.innerHTML = `
        <div class="rm-first-contact-card">
          <h3>Welcome to Messages</h3>
          <div class="rm-first-contact-mutual">
            Choose a conversation from the left sidebar or start a new end-to-end encrypted direct message.
          </div>
          <button type="button" class="rm-icebreaker-btn" id="rm-empty-start-btn">${renderIcon("edit", { size: 14, className: "icon-xs" })} New Conversation</button>
        </div>
      `;
      messagesTrackEl.querySelector("#rm-empty-start-btn")?.addEventListener("click", () => openNewChatModal());
      return;
    }

    // Security / Public Context Banner at top of stream
    const curTtl = openId ? freenet.getSecretChatTTL(openId) : 0;
    const ttlLabel = formatTtlLabel(curTtl);
    const isPeerBlocked = !!(st.peer && (deps.isPeerBlocked ? deps.isPeerBlocked(st.peer) : freenet.blockedBy(me).has(st.peer)));
    const bannerHtml = isPeerBlocked
      ? `<div class="rm-e2ee-banner" style="background:var(--rm-danger-soft);border-color:var(--rm-danger);color:var(--rm-danger);">
          <span style="display:inline-flex;align-items:center;gap:5px;">${renderIcon("ban", { size: 13, className: "icon-xs" })} <span><b>${escapeHtml(deps.getAuthorDisplayName(st.peer!))}</b> is blocked. Feed posts, comments and direct messages are disabled.</span></span>
          <button type="button" style="margin-left:auto;padding:3px 8px;border-radius:6px;border:1px solid var(--rm-danger);background:transparent;color:var(--rm-danger);cursor:pointer;font-weight:600;" data-block-peer="${escapeHtml(st.peer!)}">Unblock</button>
        </div>`
      : st.isSecret
      ? `<div class="rm-secret-banner">
          <div class="rm-secret-banner-icon">${renderIcon("lock", { size: 22 })}</div>
          <div class="rm-secret-banner-content">
            <div class="rm-secret-banner-title">Secret Chat (Chat Segreta)</div>
            <div class="rm-secret-banner-desc">
              Protected by ephemeral ratchet keys (Forward Secrecy). Messages exist only on this device and can auto-destruct.
            </div>
            <div style="font-size: 0.74rem; color: #10b981; font-weight: 600; margin-top: 2px;">
              <span style="display:inline-flex;align-items:center;gap:4px;">${renderIcon("clock", { size: 12 })} Disappearing timer:</span> <span id="rm-secret-banner-ttl">${ttlLabel}</span>
            </div>
          </div>
        </div>`
      : st.community
        ? `<div class="rm-e2ee-banner">
            <span style="display:inline-flex;align-items:center;gap:5px;">${renderIcon("globe", { size: 13, className: "icon-xs" })} <span>Public community chat for <b>#r/${escapeHtml(st.community.slug)}</b>. Messages are signed with Ed25519 and visible on the node.</span></span>
          </div>`
        : `<div class="rm-e2ee-banner">
            <span style="display:inline-flex;align-items:center;gap:5px;">${renderIcon("lock", { size: 13, className: "icon-xs" })} <span>Messages in this conversation are end-to-end encrypted on your Freenet node.</span></span>
            <button type="button" id="rm-inline-verify-btn">Verify safety number</button>
          </div>`;

    const allMsgs = st.shownMessages;
    const q = threadQuery.trim().toLowerCase();
    const msgs = q
      ? allMsgs.filter((m) => plainMentions(m.text, deps.getAuthorDisplayName).toLowerCase().includes(q))
      : allMsgs;

    if (msgs.length === 0) {
      pinnedBarEl.style.display = "none";
      let cardHtml = "";
      if (q) {
        cardHtml = `
          <div class="rm-first-contact-card">
            <h3>No results</h3>
            <div class="rm-first-contact-mutual">No messages contain "${escapeHtml(threadQuery)}".</div>
          </div>
        `;
      } else if (st.peer) {
        const pk = st.peer;
        const name = deps.getAuthorDisplayName(pk);
        const avatar = deps.getAuthorAvatarUrl(pk);
        const fallback = generateDefaultAvatar(pk);
        const shared = sharedSpacesWithPeer(pk);
        const isRiverOnly = freenet.riverOnly.has(pk);
        if (isPeerBlocked) {
          cardHtml = `
            <div class="rm-first-contact-card">
              <img src="${safeUrl(avatar) || fallback}" alt="${escapeHtml(name)}" onerror="this.onerror=null;this.src='${fallback}'" />
              <h3>${escapeHtml(name)}</h3>
              <span class="rm-first-contact-key">@${escapeHtml(shortenKey(personaName(pk)))}</span>
              <div class="rm-first-contact-mutual" style="color:var(--rm-danger);">
                This contact is currently blocked. Feed posts, comments and direct messages are disabled.
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 4px;">
                <button type="button" class="rm-icebreaker-btn" style="margin-top:0;" data-block-peer="${escapeHtml(pk)}">Unblock ${escapeHtml(name)}</button>
              </div>
            </div>
          `;
        } else {
          cardHtml = `
            <div class="rm-first-contact-card">
              <img src="${safeUrl(avatar) || fallback}" alt="${escapeHtml(name)}" onerror="this.onerror=null;this.src='${fallback}'" />
              <h3>${escapeHtml(name)}</h3>
              <span class="rm-first-contact-key">@${escapeHtml(shortenKey(personaName(pk)))}</span>
              <div class="rm-first-contact-mutual">
                ${shared.length
                  ? `In common on Freenet: <b>${escapeHtml(shared.join(", "))}</b>`
                  : `Direct E2EE session ready · Zero central servers`}
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 4px;">
                ${!isRiverOnly ? `<button type="button" class="rm-link-btn" data-open-profile="${escapeHtml(pk)}">View Profile</button>` : ""}
                <button type="button" class="rm-icebreaker-btn" style="margin-top:0;" data-prefill-hello="${escapeHtml(name)}">${renderIcon("messageCircle", { size: 14, className: "icon-xs" })} Say hello to ${escapeHtml(name)}</button>
              </div>
            </div>
          `;
        }
      } else if (st.privateRoom) {
        const name = roomNameCache.get(st.privateRoom.id) || "Private Room";
        const roomAvatarHtml = st.privateRoom.avatar_url
          ? `<img src="${safeUrl(st.privateRoom.avatar_url)}" alt="${escapeHtml(name)}" style="width:68px;height:68px;border-radius:50%;object-fit:cover;border:1px solid var(--rm-border-subtle);display:block;margin:0 auto 10px;" />`
          : `<div class="rm-room-monogram priv" style="width:68px;height:68px;font-size:1.4rem;">${escapeHtml(makeMonogram(name, false))}</div>`;
        cardHtml = `
          <div class="rm-first-contact-card">
            ${roomAvatarHtml}
            <h3>${escapeHtml(name)}</h3>
            <div class="rm-first-contact-mutual">
              End-to-end encrypted group room. Only authorized members hold the key to read messages.
            </div>
            <button type="button" class="rm-icebreaker-btn" id="rm-empty-invite-btn">${renderIcon("userPlus", { size: 14, className: "icon-xs" })} Invite Members</button>
          </div>
        `;
      } else if (st.community) {
        cardHtml = `
          <div class="rm-first-contact-card">
            <div class="rm-room-monogram comm" style="width:68px;height:68px;font-size:1.4rem;">${escapeHtml(makeMonogram(st.community.slug, true))}</div>
            <h3>#r/${escapeHtml(st.community.slug)}</h3>
            <div class="rm-first-contact-mutual">${escapeHtml(st.community.description || `Welcome to the ${st.community.name} community chatroom!`)}</div>
          </div>
        `;
      }
      messagesTrackEl.innerHTML = bannerHtml + cardHtml;
      return;
    }

    // Group & render real messages in Signal style
    const isGroup = !st.peer;
    const isChannel = !!st.privateRoom?.is_channel;
    const roomCreator = st.privateRoom
      ? freenet.riverRoster(st.privateRoom.id)?.creator ?? st.privateRoom.creator
      : st.community?.creator ?? "";
    const roomMods = st.privateRoom
      ? freenet.riverRoster(st.privateRoom.id)?.moderators ?? st.privateRoom.moderators ?? []
      : st.community?.moderators ?? [];
    const isRoomCreator = roomCreator === me;
    const iAmRoomMod = roomMods.includes(me);
    const isOwnerOrMod = isRoomCreator || iAmRoomMod;
    const isChannelReadOnly = isChannel && !isOwnerOrMod;
    const iAmCommMod = !!(st.community && (st.community.creator === me || st.community.moderators.includes(me)));
    const canPin = st.peer ? true : (st.privateRoom ? (isRoomCreator || iAmRoomMod) : (st.community ? iAmCommMod : false));

    const msgById = new Map<string, ChatMessage>();
    for (const x of allMsgs) msgById.set(x.id, x);
    const dateLabels = msgs.map((m) => formatDateSeparator(m.timestamp));

    const pinnedMsgId = openId ? freenet.getRoomPinnedMessageId(openId) : null;
    if (pinnedMsgId) {
      const pMsg = msgById.get(pinnedMsgId) || allMsgs.find((m) => m.id === pinnedMsgId);
      if (pMsg) {
        pinnedBarEl.style.display = "flex";
        const authorName = pMsg.sender === me ? "You" : deps.getAuthorDisplayName(pMsg.sender);
        const excerpt = summarizeChatMediaText(pMsg.text, (t) => plainMentions(t, deps.getAuthorDisplayName)).slice(0, 100);
        pinnedTextEl.innerHTML = `<b>${escapeHtml(authorName)}:</b> ${escapeHtml(excerpt)}`;
        pinnedContentEl.setAttribute("data-jump-pinned-id", pinnedMsgId);
      } else {
        pinnedBarEl.style.display = "none";
      }
    } else {
      pinnedBarEl.style.display = "none";
    }

    let lastDateStr = "";
    let hasEmbeddedCards = false;
    const rowItems: { key: string; html: string }[] = [{ key: `banner:${curKey}`, html: bannerHtml }];

    const startIndex = !q && msgs.length > visibleMsgLimit ? msgs.length - visibleMsgLimit : 0;
    if (startIndex > 0) {
      rowItems.push({
        key: `load-older:${startIndex}`,
        html: `<div class="rm-load-older-wrap" style="text-align:center;padding:10px 0;"><button type="button" class="rm-link-btn" id="rm-btn-load-older" style="font-size:0.78rem;margin:0 auto;">Load earlier messages (${startIndex} older)</button></div>`,
      });
    }

    for (let i = startIndex; i < msgs.length; i++) {
      const m = msgs[i];
      const prev = msgs[i - 1];
      const next = msgs[i + 1];

      const dateLabel = dateLabels[i];
      if (dateLabel !== lastDateStr) {
        rowItems.push({ key: `sep:${dateLabel}:${i}`, html: `<div class="rm-date-sep">${escapeHtml(dateLabel)}</div>` });
        lastDateStr = dateLabel;
      }

      // System join event (River style)
      if (m.system_event === "join") {
        const members = m.join_members && m.join_members.length > 0 ? m.join_members : [m.sender];
        const names = members.map((pk) => (pk === me ? "You" : deps.getAuthorDisplayName(pk)));
        let joinText = "";
        if (names.length === 1) {
          joinText = `${escapeHtml(names[0])} joined`;
        } else if (names.length === 2) {
          joinText = `${escapeHtml(names[0])} and ${escapeHtml(names[1])} joined`;
        } else if (names.length <= 4) {
          joinText = `${escapeHtml(names.slice(0, -1).join(", "))} and ${escapeHtml(names[names.length - 1])} joined`;
        } else {
          joinText = `${names.length} people joined`;
        }
        rowItems.push({
          key: `join:${m.id}`,
          html: `<div class="rm-system-event-row" data-msg-id="${escapeHtml(m.id)}">
            <span class="rm-system-icon">→]</span>
            <span class="rm-system-text">${joinText}</span>
            <span class="rm-system-time">· ${escapeHtml(formatClock(m.timestamp))}</span>
          </div>`,
        });
        continue;
      }

      const isMine = m.sender === me;
      const groupedPrev =
        !!prev &&
        dateLabels[i - 1] === dateLabel &&
        prev.sender === m.sender &&
        m.timestamp - prev.timestamp < 5 * 60 * 1000;
      const groupedNext =
        !!next &&
        dateLabels[i + 1] === dateLabel &&
        next.sender === m.sender &&
        next.timestamp - m.timestamp < 5 * 60 * 1000;

      const senderName = isMine ? "You" : m.sender === "system" ? "Radica Genesis" : deps.getAuthorDisplayName(m.sender);

      // Sender label inside first bubble of a run in group/community rooms
      let roleBadge = "";
      if (isGroup && !isMine) {
        if (m.sender === roomCreator) roleBadge = `<span class="rm-role-tag">${renderIcon("crown", { size: 10, className: "icon-xs" })} Founder</span>`;
        else if (roomMods.includes(m.sender)) roleBadge = `<span class="rm-role-tag">${renderIcon("shield", { size: 10, className: "icon-xs" })} Mod</span>`;
      }
      const canOpenSender = !isMine && m.sender !== "system" && !freenet.riverOnly.has(m.sender);
      const senderHtml =
        isGroup && !isMine && !groupedPrev
          ? `<div class="rm-sender-label" ${canOpenSender ? `data-open-profile="${escapeHtml(m.sender)}"` : ""} style="color: ${senderColor(m.sender)};">
              <span>${escapeHtml(senderName)}</span>${roleBadge}
            </div>`
          : "";

      // Reply quote lookup (O(1) via msgById)
      let quoteHtml = "";
      if (m.reply_to) {
        const orig = msgById.get(m.reply_to);
        const origAuthor = orig
          ? orig.sender === me
            ? "You"
            : deps.getAuthorDisplayName(orig.sender)
          : "Message";
        const origText = orig
          ? summarizeChatMediaText(orig.text, (t) => plainMentions(t, deps.getAuthorDisplayName)).slice(0, 100)
          : "no longer available";
        quoteHtml = `
          <div class="rm-quote-box" data-jump-msg="${escapeHtml(m.reply_to)}">
            <span class="rm-quote-author">${escapeHtml(origAuthor)}</span>
            <span class="rm-quote-text">${escapeHtml(origText)}</span>
          </div>
        `;
      }

      // Rich body + FreeTunes / FreePolls / Encrypted Media cards
      const { items: mediaItems, caption: textWithoutMedia } = parseChatMedia(m.text);
      const mediaCardsHtml = chatMediaCardsHtml(mediaItems, textWithoutMedia);
      const bodyHtml = textWithoutMedia ? renderChatText(textWithoutMedia, deps.getAuthorDisplayName) : "";
      const embeddedCards = freetunesCard(m.text) + freepollsCard(m.text) + asocialCard(m.text) + fhCard(m.text) + wormholeCard(m.text) + freetreeCard(m.text);
      const cardsHtml = mediaCardsHtml + embeddedCards;
      if (cardsHtml || mediaItems.length > 0) hasEmbeddedCards = true;

      // Reactions (only protocol-valid CHAT_REACTIONS)
      const reactionEntries = Object.entries(m.reactions ?? {}).filter(
        ([emoji, who]) => CHAT_REACTIONS.includes(emoji) && who.length > 0
      );
      const hasReactions = reactionEntries.length > 0;
      const reactionsHtml = hasReactions
        ? `<div class="rm-reactions-row">
            ${reactionEntries
              .map(([emoji, who]) => {
                const iReacted = who.includes(me);
                const names = who.map((pk) => (pk === me ? "You" : deps.getAuthorDisplayName(pk))).join(", ");
                return `<button type="button" class="rm-react-pill ${iReacted ? "mine" : ""}" data-react-emoji="${escapeHtml(emoji)}" data-room-id="${escapeHtml(openId)}" data-msg-id="${escapeHtml(m.id)}" title="${escapeHtml(names)}">
                  <span>${emoji}</span><span>${who.length}</span>
                </button>`;
              })
              .join("")}
          </div>`
        : "";

      const canDelete = st.isSecret
        ? true
        : st.privateRoom
          ? !st.privateRoom.river || isMine
          : st.community
            ? isMine || iAmCommMod
            : true;

      const isPinned = pinnedMsgId === m.id;
      // A River DM carries text only (River's DirectMessageBody: Text | Invite): no reaction, reply quote or edit reaches the other side
      const riverDm = !!st.peer && !st.privateRoom && !st.community && freenet.riverOnly.has(st.peer);
      const tFrom = !isMine && textWithoutMedia ? translatableFrom(textWithoutMedia) : null;
      const translated = chatTranslations.get(m.id);
      const hoverBarHtml = `
        <div class="rm-hover-bar">
          ${tFrom ? `<button type="button" class="rm-hover-btn" data-translate-msg="${escapeHtml(m.id)}" data-from="${tFrom}" title="${translated ? "Hide translation" : `Translate from ${LANGS[tFrom]} on this device`}">${renderIcon("globe", { size: 13, className: "icon-xs" })}</button>` : ""}
          ${riverDm ? "" : `<button type="button" class="rm-hover-btn rm-open-react-btn" data-open-react="${escapeHtml(m.id)}" data-room-id="${escapeHtml(openId)}" title="Add reaction">☺</button>`}
          ${!isChannelReadOnly && !riverDm ? `<button type="button" class="rm-hover-btn" data-reply-msg="${escapeHtml(m.id)}" title="Reply">${renderIcon("reply", { size: 13, className: "icon-xs" })}</button>` : ""}
          ${isMine && !riverDm ? `<button type="button" class="rm-hover-btn" data-edit-msg="${escapeHtml(m.id)}" title="Edit message">${renderIcon("edit", { size: 13, className: "icon-xs" })}</button>` : ""}
          ${canPin ? `<button type="button" class="rm-hover-btn" data-pin-msg="${escapeHtml(m.id)}" data-pinned="${isPinned ? "1" : "0"}" title="${isPinned ? "Unpin message" : "Pin message"}">${renderIcon("pin", { size: 13, className: "icon-xs" })}</button>` : ""}
          ${
            canDelete
              ? `<button type="button" class="rm-hover-btn rm-del-act" data-del-msg="${escapeHtml(m.id)}" data-room-id="${escapeHtml(openId)}" title="Delete message">${renderIcon("trash2", { size: 13, className: "icon-xs" })}</button>`
              : ""
          }
        </div>
      `;

      // Avatar on last message of incoming run (Signal style)
      const fallbackAvatar = generateDefaultAvatar(m.sender || "radica");
      const avatarGutterHtml = !isMine
        ? `<div class="rm-avatar-gutter">
            ${
              !groupedNext
                ? `<img class="rm-msg-avatar" src="${safeUrl(deps.getAuthorAvatarUrl(m.sender)) || fallbackAvatar}" alt="${escapeHtml(senderName)}" ${canOpenSender ? `data-open-profile="${escapeHtml(m.sender)}"` : ""} onerror="this.onerror=null;this.src='${fallbackAvatar}'" />`
                : ""
            }
          </div>`
        : "";

      const peerReadUpto = st.peer ? freenet.getPeerReadUpto(openId, st.peer) : 0;
      const msgChecksHtml = isMine ? checksHtml(deliveryOf(m, peerReadUpto), "rm") : "";

      const editedTagHtml = m.edited_at
        ? `<span class="rm-edited-tag" title="Edited ${formatClock(m.edited_at)}"> · edited</span>`
        : "";

      const burnAt = burnAtOf(m);
      const ttlTagHtml = burnAt
        ? `<span class="rm-msg-ttl-tag" data-burn-at="${burnAt}" data-msg-id="${escapeHtml(m.id)}" title="Disappearing message">⏱️ <span class="rm-ttl-val"></span></span>`
        : "";

      const channelCommentsBtnHtml = (st.privateRoom?.is_channel && st.privateRoom.linked_room_id)
        ? `<div class="rm-bubble-channel-footer"><button type="button" class="rm-channel-comments-btn" data-jump-room="${escapeHtml(st.privateRoom.linked_room_id)}" title="Discuss this post in linked room">${renderIcon("messageCircle", { size: 12, className: "icon-xs" })} Comments</button></div>`
        : "";

      rowItems.push({
        key: `msg:${m.id}`,
        html: `<div class="rm-msg-row ${isMine ? "mine" : "theirs"} ${groupedPrev ? "grouped-prev" : ""} ${groupedNext ? "grouped-next" : ""} ${hasReactions ? "has-reactions" : ""}" data-msg-id="${escapeHtml(m.id)}">
          ${isMine ? hoverBarHtml : avatarGutterHtml}
          <div class="rm-bubble-wrap">
            <div class="rm-bubble">
              ${senderHtml}
              ${quoteHtml}
              ${bodyHtml ? `<span class="rm-bubble-text">${bodyHtml}</span>` : ""}
              ${translated !== undefined ? `<span class="rm-translation">${translated ? escapeHtml(translated) : "Translating on this device…"}</span>` : ""}
              ${cardsHtml}
              <span class="rm-meta-float">
                <span>${escapeHtml(formatClock(m.timestamp))}</span>
                ${editedTagHtml}
                ${ttlTagHtml}
                ${msgChecksHtml}
              </span>
            </div>
            ${channelCommentsBtnHtml}
            ${reactionsHtml}
          </div>
          ${!isMine ? hoverBarHtml : ""}
        </div>`,
      });
    }

    const rowsChanged = reconcileRows(messagesTrackEl, rowItems);
    tickBurnCountdowns(messagesTrackEl);

    // Hydrate any embedded FreeTunes / FreePolls / Encrypted Media cards inside chat bubbles only when present & changed
    if (rowsChanged && hasEmbeddedCards) {
      fillFreetunes(messagesTrackEl, (id) => freenet.appContract(id));
      fillFreepolls(messagesTrackEl, deps.pollNet);
      fillChatMedia(messagesTrackEl, (h) => freenet.getMedia(h));
      fillAsocial(messagesTrackEl);
      fillFh(messagesTrackEl, freenet);
      fillWormhole(messagesTrackEl);
    }

    if (scrollToBottom || switchedConv || wasNearBottom) {
      messagesScrollerEl.scrollTop = messagesScrollerEl.scrollHeight;
    } else {
      messagesScrollerEl.scrollTop = prevScrollTop;
    }
  }

  function renderSharedMediaDrawerSection(messages: ChatMessage[]): string {
    const photos: { msgId: string; item: any }[] = [];
    const files: { msgId: string; item: any; sender: string; ts: number }[] = [];
    const audios: { msgId: string; item: any; sender: string; ts: number }[] = [];
    const links: { msgId: string; url: string; sender: string; ts: number }[] = [];

    const urlRegex = /(?:https?:\/\/|freenet:)[^\s<>"'`]+/gi;

    for (const m of messages) {
      const { items, caption } = parseChatMedia(m.text);
      for (const item of items) {
        if (item.kind === "img") {
          photos.push({ msgId: m.id, item });
        } else if (item.kind === "file") {
          files.push({ msgId: m.id, item, sender: m.sender, ts: m.timestamp });
        } else if (item.kind === "audio" || item.kind === "voice") {
          audios.push({ msgId: m.id, item, sender: m.sender, ts: m.timestamp });
        }
      }
      const textToScan = caption || m.text;
      const matches = textToScan.match(urlRegex);
      if (matches) {
        for (const u of matches) {
          links.push({ msgId: m.id, url: u, sender: m.sender, ts: m.timestamp });
        }
      }
    }

    const total = photos.length + files.length + audios.length + links.length;
    if (total === 0) {
      return `
        <div class="rm-drawer-section">
          <h4>Shared Content</h4>
          <div style="font-size: 0.78rem; color: var(--rm-text-muted); padding: 4px 0;">No shared photos, files, or links yet.</div>
        </div>
      `;
    }

    let photosHtml = "";
    if (photos.length > 0) {
      photosHtml = `<div class="rm-shared-photos-grid">
        ${photos
          .map(
            (p) => `
          <div class="cm-card cm-card-img rm-shared-photo-item" data-jump-msg="${escapeHtml(p.msgId)}" data-cm-kind="img" data-cm-hash="${escapeHtml(p.item.hash)}" data-cm-key="${escapeHtml(p.item.keyHex)}" data-cm-mime="${escapeHtml(p.item.mime || "image/jpeg")}" title="Jump to photo in chat">
            <div class="cm-img-wrap"><div class="cm-img-status">Decrypting…</div></div>
          </div>
        `
          )
          .join("")}
      </div>`;
    } else {
      photosHtml = `<div class="rm-shared-empty">No photos shared in this chat.</div>`;
    }

    let filesHtml = "";
    if (files.length > 0) {
      filesHtml = `<div class="rm-shared-files-list">
        ${files
          .map((f) => {
            const icon = fileExtensionIcon(f.item.filename);
            const name = f.item.filename || "Attachment";
            const sz = formatBytes(f.item.sizeBytes);
            return `
            <div class="rm-shared-file-row" data-jump-msg="${escapeHtml(f.msgId)}" title="Jump to message">
              <span class="rm-shared-file-icon">${icon}</span>
              <div class="rm-shared-file-meta">
                <span class="rm-shared-file-name">${escapeHtml(name)}</span>
                <span class="rm-shared-file-sub">${escapeHtml(sz)} · ${escapeHtml(formatClock(f.ts))}</span>
              </div>
              <button type="button" class="rm-mini-act" title="Go to message">${renderIcon("arrowRight", { size: 12 })}</button>
            </div>
          `;
          })
          .join("")}
      </div>`;
    } else {
      filesHtml = `<div class="rm-shared-empty">No files shared in this chat.</div>`;
    }

    let audioHtml = "";
    if (audios.length > 0) {
      audioHtml = `<div class="rm-shared-files-list">
        ${audios
          .map((a) => {
            const name = a.item.kind === "voice" ? "Voice message" : (a.item.filename || "Audio memo");
            const dur = a.item.durationSec ? formatMediaDuration(a.item.durationSec) : "";
            const sz = formatBytes(a.item.sizeBytes);
            return `
            <div class="rm-shared-file-row" data-jump-msg="${escapeHtml(a.msgId)}" title="Jump to message">
              <span class="rm-shared-file-icon">${renderIcon("music", { size: 16 })}</span>
              <div class="rm-shared-file-meta">
                <span class="rm-shared-file-name">${escapeHtml(name)}</span>
                <span class="rm-shared-file-sub">${dur ? `${dur} · ` : ""}${escapeHtml(sz)} · ${escapeHtml(formatClock(a.ts))}</span>
              </div>
              <button type="button" class="rm-mini-act" title="Go to message">${renderIcon("arrowRight", { size: 12 })}</button>
            </div>
          `;
          })
          .join("")}
      </div>`;
    } else {
      audioHtml = `<div class="rm-shared-empty">No audio or voice memos shared in this chat.</div>`;
    }

    let linksHtml = "";
    if (links.length > 0) {
      linksHtml = `<div class="rm-shared-files-list">
        ${links
          .map((l) => {
            let domain = "";
            try {
              domain = new URL(l.url).hostname;
            } catch {
              domain = l.url.startsWith("freenet:") ? "Freenet Contract" : "Link";
            }
            return `
            <div class="rm-shared-file-row" data-jump-msg="${escapeHtml(l.msgId)}" title="Jump to message">
              <span class="rm-shared-file-icon">${renderIcon("link", { size: 16 })}</span>
              <div class="rm-shared-file-meta">
                <a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer" class="rm-shared-link-url" onclick="event.stopPropagation();">${escapeHtml(l.url)}</a>
                <span class="rm-shared-file-sub">${escapeHtml(domain)} · ${escapeHtml(formatClock(l.ts))}</span>
              </div>
              <button type="button" class="rm-mini-act" title="Go to message">${renderIcon("arrowRight", { size: 12 })}</button>
            </div>
          `;
          })
          .join("")}
      </div>`;
    } else {
      linksHtml = `<div class="rm-shared-empty">No links shared in this chat.</div>`;
    }

    return `
      <div class="rm-drawer-section rm-shared-media-section">
        <h4>Shared Content</h4>
        <div class="rm-media-tabs">
          <button type="button" class="rm-media-tab-btn active" data-media-tab="media">Media (${photos.length})</button>
          <button type="button" class="rm-media-tab-btn" data-media-tab="files">Files (${files.length})</button>
          <button type="button" class="rm-media-tab-btn" data-media-tab="audio">Audio (${audios.length})</button>
          <button type="button" class="rm-media-tab-btn" data-media-tab="links">Links (${links.length})</button>
        </div>
        <div class="rm-media-tab-pane" data-media-pane="media">${photosHtml}</div>
        <div class="rm-media-tab-pane" data-media-pane="files" style="display:none;">${filesHtml}</div>
        <div class="rm-media-tab-pane" data-media-pane="audio" style="display:none;">${audioHtml}</div>
        <div class="rm-media-tab-pane" data-media-pane="links" style="display:none;">${linksHtml}</div>
      </div>
    `;
  }

  function refreshDrawer() {
    if (!drawerOpen || !isVisible()) return;
    const identity = deps.getIdentity();
    if (!identity) return;
    const me = identity.pubkey;
    const st = deps.getActiveState();
    const curKey = activeConvKey();
    if (!curKey) {
      drawerHeaderLabelEl.textContent = "Details";
      drawerContentEl.innerHTML = `<div style="padding: 18px; font-size: 0.82rem; color: var(--rm-text-muted);">Select a conversation to view details and members.</div>`;
      return;
    }

    const isPinned = pinnedSet().has(curKey);
    const verified = verifiedSet();
    const sTarget = safetyTarget();
    const safetyPreview = sTarget ? computeSafetyBlocks(me, sTarget.material).slice(0, 4).join(" ") + " ••••" : "";

    if (st.peer) {
      const pk = st.peer;
      const isBlocked = deps.isPeerBlocked ? deps.isPeerBlocked(pk) : freenet.blockedBy(me).has(pk);
      const name = deps.getAuthorDisplayName(pk);
      const avatar = deps.getAuthorAvatarUrl(pk);
      const fallback = generateDefaultAvatar(pk);
      const isRiverOnly = freenet.riverOnly.has(pk);
      const shared = sharedSpacesWithPeer(pk);
      const isVer = verified.has(`dm:${pk}`);

      drawerHeaderLabelEl.textContent = "Contact Info";
      drawerContentEl.innerHTML = `
        <div class="rm-drawer-hero">
          <img src="${safeUrl(avatar) || fallback}" alt="${escapeHtml(name)}" onerror="this.onerror=null;this.src='${fallback}'" />
          <div class="rm-drawer-name">${escapeHtml(name)}</div>
          <div class="rm-drawer-handle">@${escapeHtml(shortenKey(personaName(pk)))}</div>
          <div class="rm-quick-tiles">
            ${
              !isRiverOnly
                ? `<button type="button" class="rm-tile-btn" data-open-profile="${escapeHtml(pk)}">${renderIcon("user", { size: 18 })}<span>Profile</span></button>`
                : `<button type="button" class="rm-tile-btn" data-copy-pk="${escapeHtml(pk)}">${renderIcon("copy", { size: 18 })}<span>Copy Key</span></button>`
            }
            <button type="button" class="rm-tile-btn" data-toggle-pin="${escapeHtml(curKey)}">
              ${renderIcon("pin", { size: 18 })}<span>${isPinned ? "Pinned" : "Pin"}</span>
            </button>
            <button type="button" class="rm-tile-btn" data-clear-chat="1">
              ${renderIcon("trash2", { size: 18 })}<span>Clear</span>
            </button>
          </div>
        </div>

        <div class="rm-drawer-section">
          <h4>E2EE Session Security</h4>
          <div class="rm-safety-card">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <strong>${isRiverOnly ? "River Direct Bridge" : "X25519 + AES-256-GCM"}</strong>
              <span style="color:var(--rm-online);font-weight:700;font-size:0.72rem;display:inline-flex;align-items:center;gap:3px;">${isVer ? renderIcon("check", { size: 11, className: "icon-xs" }) + " Verified" : "Active"}</span>
            </div>
            <div class="rm-safety-code">${escapeHtml(safetyPreview)}</div>
            <button type="button" class="rm-link-btn" style="align-self:flex-start;" id="rm-drawer-verify-btn">Verify full safety number</button>
          </div>
        </div>

        <div class="rm-drawer-section">
          <h4>Full Public Key</h4>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--rm-bg-subtle);padding:8px 10px;border-radius:10px;">
            <code style="font-size:0.68rem;word-break:break-all;color:var(--rm-text-secondary);">${escapeHtml(pk)}</code>
            <button type="button" class="rm-mini-act" data-copy-pk="${escapeHtml(pk)}">Copy</button>
          </div>
        </div>

        ${
          shared.length > 0
            ? `<div class="rm-drawer-section">
                <h4>Shared Rooms & Communities</h4>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                  ${shared.map((s) => `<span class="rm-link-btn" style="cursor:default;">${escapeHtml(s)}</span>`).join("")}
                </div>
              </div>`
            : ""
        }

        ${renderSharedMediaDrawerSection(st.shownMessages)}

        <div class="rm-drawer-section" style="border-bottom:none; display:flex; flex-direction:column; gap:8px;">
          <button type="button" class="rm-link-btn" data-block-peer="${escapeHtml(pk)}" style="width:100%;justify-content:center;color:var(--rm-danger);border-color:var(--rm-danger-soft);background:var(--rm-danger-soft);">
            ${isBlocked ? "Unblock contact" : `${renderIcon("ban", { size: 13, className: "icon-xs" })} Block contact`}
          </button>
          <button type="button" class="rm-link-btn" data-remove-peer="${escapeHtml(pk)}" style="width:100%;justify-content:center;color:var(--rm-text-muted);border-color:var(--rm-border-subtle);background:transparent;">
            Remove from recent chats
          </button>
        </div>
      `;
      fillChatMedia(drawerContentEl, (h) => freenet.getMedia(h));
      return;
    }

    if (st.privateRoom) {
      const room = st.privateRoom;
      const name = roomNameCache.get(room.id) || "Private Room";
      const roster = room.river ? freenet.riverRoster(room.id) : undefined;
      const members = [...new Set(roster?.members ?? room.members)];
      const creator = roster?.creator ?? room.creator;
      const roomMods = roster?.moderators ?? room.moderators ?? [];
      const isRoomCreator = me === creator;
      const iAmRoomMod = roomMods.includes(me);
      const isOwnerOrMod = isRoomCreator || iAmRoomMod;
      const isVer = verified.has(`priv:${room.id}`);

      const isChannel = !!room.is_channel;
      drawerHeaderLabelEl.textContent = isChannel ? "Broadcast Channel Info" : "E2EE Group Info";
      const memberRows = members
        .map((mPk) => {
          const isCreator = mPk === creator;
          const isYou = mPk === me;
          const isMod = roomMods.includes(mPk);
          const canKick = !isYou && !isCreator && (isRoomCreator || (iAmRoomMod && !isMod));
          const mName = deps.getAuthorDisplayName(mPk);
          const mAvatar = deps.getAuthorAvatarUrl(mPk);
          const mFallback = generateDefaultAvatar(mPk);

          return `
            <div class="rm-member-row">
              <img src="${safeUrl(mAvatar) || mFallback}" alt="${escapeHtml(mName)}" ${!isYou && !freenet.riverOnly.has(mPk) ? `data-open-profile="${escapeHtml(mPk)}"` : ""} onerror="this.onerror=null;this.src='${mFallback}'" />
              <div class="rm-member-meta">
                <div class="rm-member-name">
                  <span>${escapeHtml(mName)}</span>
                  ${isCreator ? `<span class="rm-role-tag">${renderIcon("crown", { size: 10, className: "icon-xs" })} Founder</span>` : ""}
                  ${isMod ? `<span class="rm-role-tag">${renderIcon("shield", { size: 10, className: "icon-xs" })} Mod</span>` : ""}
                  ${isYou ? `<span class="rm-role-tag">You</span>` : ""}
                </div>
                <div class="rm-member-sub">@${escapeHtml(shortenKey(personaName(mPk)))}</div>
              </div>
              <div class="rm-member-actions">
                ${!isYou ? `<button type="button" class="rm-mini-act" data-dm-pk="${escapeHtml(mPk)}" title="Direct Message">${renderIcon("messageCircle", { size: 12 })}</button>` : ""}
                <button type="button" class="rm-mini-act" data-copy-pk="${escapeHtml(mPk)}" title="Copy public key">${renderIcon("copy", { size: 12 })}</button>
                ${
                  !isYou
                    ? `<button type="button" class="rm-mini-act" data-block-peer="${escapeHtml(mPk)}" title="${deps.isPeerBlocked?.(mPk) ? "Unblock contact" : "Block contact"}">${deps.isPeerBlocked?.(mPk) ? "Unblock" : renderIcon("ban", { size: 12 })}</button>`
                    : ""
                }
                ${
                  isRoomCreator && !isYou && !isCreator
                    ? `<button type="button" class="rm-mini-act" data-room-mod="${escapeHtml(mPk)}" data-mod-on="${isMod ? "0" : "1"}">${isMod ? "Unmod" : "Mod"}</button>`
                    : ""
                }
                ${
                  canKick
                    ? `<button type="button" class="rm-mini-act danger" data-room-kick="${escapeHtml(mPk)}" title="Kick and rotate key">Kick</button>`
                    : ""
                }
              </div>
            </div>
          `;
        })
        .join("");

      const allRooms = deps.getAllPrivateRooms();
      const linkedRoom = room.linked_room_id ? allRooms.find((lr) => lr.id === room.linked_room_id) : undefined;
      const linkedName = linkedRoom ? (roomNameCache.get(linkedRoom.id) || (isChannel ? "Discussion Room" : "Channel")) : undefined;

      const discussionSectionHtml = isChannel
        ? `<div class="rm-drawer-section">
            <h4>${renderIcon("messageCircle", { size: 13, className: "icon-xs" })} Discussion Room</h4>
            ${
              linkedRoom
                ? `<button type="button" class="rm-link-btn" data-jump-room="${escapeHtml(linkedRoom.id)}" style="display:inline-flex;align-items:center;gap:6px;font-weight:600;">
                    ${renderIcon("messageCircle", { size: 13, className: "icon-xs" })} Open Comments (${escapeHtml(linkedName || "")}) →
                  </button>`
                : isRoomCreator
                ? `<button type="button" class="rm-link-btn" data-create-disc-room="1" style="display:inline-flex;align-items:center;gap:6px;font-weight:600;">
                    + Create & Link Discussion Room
                  </button>`
                : `<span style="font-size:0.75rem;color:var(--rm-text-muted);">No linked discussion room configured.</span>`
            }
          </div>`
        : linkedRoom
        ? `<div class="rm-drawer-section">
            <h4>${renderIcon("megaphone", { size: 13, className: "icon-xs" })} Broadcast Channel</h4>
            <button type="button" class="rm-link-btn" data-jump-room="${escapeHtml(linkedRoom.id)}" style="display:inline-flex;align-items:center;gap:6px;font-weight:600;">
              ${renderIcon("megaphone", { size: 13, className: "icon-xs" })} Go to Broadcast Channel (${escapeHtml(linkedName || "")}) →
            </button>
          </div>`
        : "";

      drawerContentEl.innerHTML = `
        <div class="rm-drawer-hero">
          <div class="rm-drawer-avatar-wrap">
            ${
              room.avatar_url
                ? `<img class="rm-drawer-avatar" src="${safeUrl(room.avatar_url)}" alt="${escapeHtml(name)}" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='grid';" /><div class="rm-drawer-monogram rm-room-monogram ${isChannel ? "chan" : "priv"}" style="display:none;">${isChannel ? renderIcon("megaphone", { size: 28 }) : escapeHtml(makeMonogram(name, false))}</div>`
                : `<div class="rm-drawer-monogram rm-room-monogram ${isChannel ? "chan" : "priv"}">${isChannel ? renderIcon("megaphone", { size: 28 }) : escapeHtml(makeMonogram(name, false))}</div>`
            }
            ${
              isOwnerOrMod
                ? `<button type="button" class="rm-drawer-avatar-edit-btn" id="rm-edit-room-avatar-btn" title="Change group image">${renderIcon("camera", { size: 14 })}</button>`
                : ""
            }
          </div>
          <input type="file" id="rm-drawer-avatar-file-input" accept="image/*" style="display:none;" />
          <div class="rm-drawer-name">${escapeHtml(name)}</div>
          <div class="rm-drawer-handle">${members.length} ${isChannel ? "subscribers" : "members"} · ${isChannel ? "Broadcast Channel (Read-Only)" : (room.river ? "River WASM Contract" : "AES-256-GCM")}</div>
          <div class="rm-quick-tiles">
            <button type="button" class="rm-tile-btn" data-invite-room="1">${renderIcon("userPlus", { size: 18 })}<span>Invite</span></button>
            <button type="button" class="rm-tile-btn" data-toggle-pin="${escapeHtml(curKey)}">${renderIcon("pin", { size: 18 })}<span>${isPinned ? "Pinned" : "Pin"}</span></button>
            <button type="button" class="rm-tile-btn" data-copy-room-link="1">${renderIcon("link", { size: 18 })}<span>Link</span></button>
            ${
              isOwnerOrMod && room.avatar_url
                ? `<button type="button" class="rm-tile-btn" data-remove-room-avatar="1">${renderIcon("trash2", { size: 18 })}<span>Remove Image</span></button>`
                : ""
            }
          </div>
        </div>

        ${discussionSectionHtml}

        <div class="rm-drawer-section">
          <h4>Room Security</h4>
          <div class="rm-safety-card">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <strong>${room.river ? "River E2EE Room Key" : "AES-256 Symmetric Key"}</strong>
              <span style="color:var(--rm-online);font-weight:700;font-size:0.72rem;display:inline-flex;align-items:center;gap:3px;">${isVer ? renderIcon("check", { size: 11, className: "icon-xs" }) + " Verified" : "Encrypted"}</span>
            </div>
            <div class="rm-safety-code">${escapeHtml(safetyPreview)}</div>
            <button type="button" class="rm-link-btn" style="align-self:flex-start;" id="rm-drawer-verify-btn">Verify room fingerprint</button>
          </div>
        </div>

        <div class="rm-drawer-section">
          <h4>Members (${members.length})</h4>
          <div>${memberRows}</div>
        </div>

        ${renderSharedMediaDrawerSection(st.shownMessages)}

        <div class="rm-drawer-section" style="border-bottom:none;">
          ${
            room.river
              ? `<button type="button" class="rm-link-btn" data-export-river-id="1" style="width:100%;justify-content:center;">${renderIcon("key", { size: 14, className: "icon-xs" })} Export River Identity (Export ID)</button>`
              : ""
          }
          <button type="button" class="rm-link-btn" data-clear-chat="1" style="width:100%;justify-content:center;">${renderIcon("trash2", { size: 14, className: "icon-xs" })} Clear local history</button>
          <button type="button" class="rm-link-btn" data-leave-room="1" style="width:100%;justify-content:center;color:var(--rm-danger);border-color:var(--rm-danger-soft);background:var(--rm-danger-soft);">
            ${isRoomCreator ? "Remove room from list" : "Leave room"}
          </button>
        </div>
      `;

      const avatarFileInput = drawerContentEl.querySelector("#rm-drawer-avatar-file-input") as HTMLInputElement | null;
      if (avatarFileInput) {
        avatarFileInput.addEventListener("change", async () => {
          const file = avatarFileInput.files?.[0];
          if (!file || !st.privateRoom) return;
          try {
            deps.showToast("Compressing and updating group image…", "info");
            const dataUrl = await compressAvatarFile(file, 96, 0.6);
            const updated = await freenet.setRoomAvatar(identity, st.privateRoom.id, dataUrl);
            if (updated) {
              await deps.onSelectPrivateRoom(updated);
              deps.showToast("Group image updated!", "info");
              refreshDrawer();
              void refreshInbox();
            }
          } catch (err: any) {
            deps.showToast(`Could not update image: ${err.message || err}`, "error");
          }
        });
      }

      fillChatMedia(drawerContentEl, (h) => freenet.getMedia(h));
      return;
    }

    if (st.community) {
      const comm = st.community;
      const isUserMod = me === comm.creator || comm.moderators.includes(me);
      const commPks = freenet.getCommunityParticipants(comm);
      const allDisplayPks = Array.from(new Set([...commPks, ...(isUserMod ? comm.banned_members || [] : [])]));

      drawerHeaderLabelEl.textContent = "Community Info";
      const memberRows = allDisplayPks
        .map((mPk) => {
          const isCreator = mPk === comm.creator;
          const isMod = comm.moderators.includes(mPk);
          const isYou = mPk === me;
          const isBanned = !!(comm.banned_members && comm.banned_members.includes(mPk));
          const mName = mPk === "system" ? "Radica Genesis" : deps.getAuthorDisplayName(mPk);
          const mAvatar = deps.getAuthorAvatarUrl(mPk);
          const mFallback = generateDefaultAvatar(mPk);

          return `
            <div class="rm-member-row ${isBanned ? "banned" : ""}">
              <img src="${safeUrl(mAvatar) || mFallback}" alt="${escapeHtml(mName)}" ${!isYou && mPk !== "system" ? `data-open-profile="${escapeHtml(mPk)}"` : ""} onerror="this.onerror=null;this.src='${mFallback}'" />
              <div class="rm-member-meta">
                <div class="rm-member-name">
                  <span>${escapeHtml(mName)}</span>
                  ${isCreator ? `<span class="rm-role-tag">${renderIcon("crown", { size: 10, className: "icon-xs" })} Founder</span>` : ""}
                  ${!isCreator && isMod ? `<span class="rm-role-tag">${renderIcon("shield", { size: 10, className: "icon-xs" })} Mod</span>` : ""}
                  ${isBanned ? `<span class="rm-role-tag" style="color:var(--rm-danger);">Banned</span>` : ""}
                  ${isYou ? `<span class="rm-role-tag">You</span>` : ""}
                </div>
                <div class="rm-member-sub">@${escapeHtml(shortenKey(mPk))}</div>
              </div>
              <div class="rm-member-actions">
                ${!isYou && mPk !== "system" && !isBanned ? `<button type="button" class="rm-mini-act" data-dm-pk="${escapeHtml(mPk)}" title="Direct Message">${renderIcon("messageCircle", { size: 12 })}</button>` : ""}
                ${mPk !== "system" ? `<button type="button" class="rm-mini-act" data-copy-pk="${escapeHtml(mPk)}" title="Copy public key">${renderIcon("copy", { size: 12 })}</button>` : ""}
                ${
                  !isYou && mPk !== "system"
                    ? `<button type="button" class="rm-mini-act" data-block-peer="${escapeHtml(mPk)}" title="${deps.isPeerBlocked?.(mPk) ? "Unblock contact" : "Block contact"}">${deps.isPeerBlocked?.(mPk) ? "Unblock" : renderIcon("ban", { size: 12 })}</button>`
                    : ""
                }
                ${
                  isUserMod && !isYou && !isCreator && mPk !== "system"
                    ? isBanned
                      ? `<button type="button" class="rm-mini-act" data-comm-unban="${escapeHtml(mPk)}">Unban</button>`
                      : `<button type="button" class="rm-mini-act danger" data-comm-ban="${escapeHtml(mPk)}">Ban</button>`
                    : ""
                }
              </div>
            </div>
          `;
        })
        .join("");

      drawerContentEl.innerHTML = `
        <div class="rm-drawer-hero">
          <div class="rm-drawer-monogram rm-room-monogram comm">${escapeHtml(makeMonogram(comm.slug, true))}</div>
          <div class="rm-drawer-name">#r/${escapeHtml(comm.slug)}</div>
          <div class="rm-drawer-handle">${escapeHtml(comm.name)} · ${commPks.length} participants</div>
          ${comm.description ? `<p style="font-size:0.79rem;color:var(--rm-text-secondary);margin:8px 0 0;">${escapeHtml(comm.description)}</p>` : ""}
          <div class="rm-quick-tiles">
            <button type="button" class="rm-tile-btn" data-toggle-pin="${escapeHtml(curKey)}">${renderIcon("pin", { size: 18 })}<span>${isPinned ? "Pinned" : "Pin"}</span></button>
            ${isUserMod ? `<button type="button" class="rm-tile-btn" data-clear-chat="1">${renderIcon("trash2", { size: 18 })}<span>Clear</span></button>` : ""}
          </div>
        </div>
        <div class="rm-drawer-section">
          <h4>Community Participants (${commPks.length})</h4>
          <div>${memberRows}</div>
        </div>
        ${renderSharedMediaDrawerSection(st.shownMessages)}
      `;
      fillChatMedia(drawerContentEl, (h) => freenet.getMedia(h));
    }
  }

  function openSafetyModal() {
    const identity = deps.getIdentity();
    const target = safetyTarget();
    if (!identity || !target) return;

    const blocks = computeSafetyBlocks(identity.pubkey, target.material);
    safetyMeNameEl.textContent = deps.getAuthorDisplayName(identity.pubkey);
    safetyPeerNameEl.textContent = target.label;
    safetyGridEl.innerHTML = blocks.map((b) => `<span>${escapeHtml(b)}</span>`).join("");

    const isVer = verifiedSet().has(target.id);
    markVerifiedBtnEl.innerHTML = isVer ? "Unmark Verified" : `${renderIcon("check", { size: 14, className: "icon-xs" })} Mark Verified`;
    safetyModalEl.classList.add("open");
  }

  function renderContactPickerList() {
    const identity = deps.getIdentity();
    if (!identity) return;
    const me = identity.pubkey;
    const q = newChatInputEl.value.trim().toLowerCase();

    const isPeerBlocked = (pk: string) => (deps.isPeerBlocked ? deps.isPeerBlocked(pk) : freenet.blockedBy(me).has(pk));
    const candidates = Array.from(
      new Set([
        ...deps.getFollowingKeys(),
        ...freenet.getChatPeers(me),
        ...freenet.getDiscoveredPeers(me).map((p) => p.pubkey),
      ])
    ).filter((pk) => pk && pk !== me && pk !== "system" && !isPeerBlocked(pk));

    const filtered = candidates.filter((pk) => {
      if (!q) return true;
      const name = deps.getAuthorDisplayName(pk).toLowerCase();
      return name.includes(q) || pk.toLowerCase().includes(q) || personaName(pk).toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      contactPickerListEl.innerHTML = `
        <div style="padding: 16px; text-align: center; font-size: 0.8rem; color: var(--rm-text-muted);">
          ${/^[0-9a-f]{64}$/i.test(q)
            ? `Valid key detected! Click <b>Open DM</b> to start.`
            : `No matching contacts. You can paste any 64-character hex public key above.`}
        </div>
      `;
      return;
    }

    contactPickerListEl.innerHTML = filtered
      .slice(0, 60)
      .map((pk) => {
        const name = deps.getAuthorDisplayName(pk);
        const avatar = deps.getAuthorAvatarUrl(pk);
        const fallback = generateDefaultAvatar(pk);
        const isFollowed = deps.getFollowingKeys().includes(pk);
        const isRiver = freenet.riverOnly.has(pk);
        return `
          <div class="rm-contact-pick-row" data-pick-peer="${escapeHtml(pk)}" style="display:flex;align-items:center;padding:8px 12px;gap:10px;border-radius:10px;background:var(--rm-bg-secondary);margin-bottom:6px;">
            <img src="${safeUrl(avatar) || fallback}" alt="${escapeHtml(name)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" onerror="this.onerror=null;this.src='${fallback}'" />
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.86rem;font-weight:650;display:flex;align-items:center;gap:6px;">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(name)}</span>
                ${isFollowed ? `<span class="rm-origin-pill">Following</span>` : ""}
                ${isRiver ? `<span class="rm-origin-pill">River</span>` : ""}
              </div>
              <div style="font-family:var(--rm-font-mono);font-size:0.71rem;color:var(--rm-text-muted);">@${escapeHtml(shortenKey(personaName(pk)))}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button type="button" class="rm-contact-btn" data-action="dm" data-pk="${escapeHtml(pk)}">DM</button>
              <button type="button" class="rm-contact-btn secret" data-action="secret" data-pk="${escapeHtml(pk)}" title="Start single-device ephemeral Secret Chat">${renderIcon("lock", { size: 12, className: "icon-xs" })} Secret</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function openNewChatModal() {
    newChatInputEl.value = "";
    renderContactPickerList();
    newChatModalEl.classList.add("open");
    setTimeout(() => newChatInputEl.focus(), 30);
  }

  // ---- Wire Interactive Listeners ----

  // Palette switcher (Radici Warm vs Signal Crisp)
  rootEl.querySelector("#rm-btn-palette")?.addEventListener("click", () => {
    const next = rootEl.getAttribute("data-palette") === "signal" ? "radici" : "signal";
    rootEl.setAttribute("data-palette", next);
    safeStorage.setItem(PALETTE_KEY, next);
    deps.showToast(next === "signal" ? "Signal Crisp palette enabled" : "Radici Warm palette enabled", "info");
  });

  // Telegram-style menus: the trigger opens its list; a choice, a click elsewhere or Escape closes it
  const menus = Array.from(rootEl.querySelectorAll<HTMLElement>("[data-menu]")).map((trigger) => {
    const menu = rootEl.querySelector<HTMLElement>(`#${trigger.dataset.menu}`)!;
    return { trigger, menu };
  });
  const closeMenus = () =>
    menus.forEach(({ trigger, menu }) => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    });
  for (const { trigger, menu } of menus) {
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      closeMenus();
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      if (open) menu.querySelector<HTMLElement>(".rm-menu-item:not([style*='none'])")?.focus();
    });
    menu.addEventListener("click", closeMenus);
  }
  document.addEventListener("click", closeMenus);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });

  // Mode Switcher inside Messenger header
  rootEl.querySelectorAll<HTMLButtonElement>("[data-layout-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.layoutMode as ChatLayoutMode;
      deps.onSwitchLayout(mode);
    });
  });

  // Inbox Search & Filter Chips
  let inboxSearchTimer = 0;
  inboxSearchEl.addEventListener("input", () => {
    inboxQuery = inboxSearchEl.value;
    inboxSearchClearEl.classList.toggle("visible", inboxQuery.length > 0);
    clearTimeout(inboxSearchTimer);
    inboxSearchTimer = window.setTimeout(() => void refreshInbox(true), 120);
  });

  inboxSearchClearEl.addEventListener("click", () => {
    clearTimeout(inboxSearchTimer);
    inboxSearchEl.value = "";
    inboxQuery = "";
    inboxSearchClearEl.classList.remove("visible");
    void refreshInbox(true);
    inboxSearchEl.focus();
  });

  filterBarEl.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>(".rm-filter-chip");
    if (!chip) return;
    activeFilter = (chip.dataset.filter as typeof activeFilter) || "all";
    filterBarEl.querySelectorAll(".rm-filter-chip").forEach((c) => c.classList.toggle("active", c === chip));
    void refreshInbox();
  });

  // Long press (touch or mouse) or right click on a conversation: Pin, Clear, Remove / Leave, without opening it
  let pressTimer = 0;
  let pressAt: { x: number; y: number } | null = null;
  let suppressClick = false;
  const closeConvMenu = () => rootEl.querySelector(".rm-conv-menu")?.remove();
  const openConvMenu = (key: string, x: number, y: number) => {
    const c = lastConvs.find((v) => v.key === key);
    if (!c) return;
    closeConvMenu();
    const item = (act: string, icon: IconName, label: string, danger = false) =>
      `<button type="button" class="rm-menu-item${danger ? " danger" : ""}" role="menuitem" data-conv-act="${act}">${renderIcon(icon, { size: 16 })}<span>${label}</span></button>`;
    const menu = document.createElement("div");
    menu.className = "rm-menu rm-conv-menu";
    menu.setAttribute("role", "menu");
    menu.innerHTML =
      item("pin", "pin", c.pinned ? "Unpin" : "Pin") +
      (c.type !== "comm" ? item("clear", "trash2", "Clear messages") : "") +
      (c.type === "dm" || c.type === "secret" ? item("remove", "x", "Remove from chats", true) : "") +
      (c.type === "priv" ? item("leave", "logOut", c.privateRoom?.creator === deps.getIdentity()?.pubkey ? "Remove from chats" : "Leave", true) : "");
    rootEl.appendChild(menu);
    // inside the screen, next to the finger or the pointer
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
    menu.addEventListener("click", async (ev) => {
      const act = (ev.target as HTMLElement).closest<HTMLElement>("[data-conv-act]")?.dataset.convAct;
      if (!act) return;
      closeConvMenu();
      if (act === "pin") {
        deps.showToast(togglePinned(c.key) ? "Conversation pinned" : "Conversation unpinned", "info");
      } else if (act === "clear") {
        if (c.roomId === deps.openRoomId()) return void (await deps.onClearActiveChat());
        if (!confirm(`Clear the messages with ${c.name} on this device?`)) return;
        await freenet.clearChatRoom(c.roomId);
      } else if (act === "remove" && c.peerPk) {
        deps.onRemovePeer(c.peerPk, c.type === "secret");
      } else if (act === "leave" && c.privateRoom) {
        await deps.onLeavePrivateRoom(c.privateRoom);
      }
      void refreshInbox();
    });
  };
  convListEl.addEventListener("pointerdown", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-conv-key]");
    if (!row || e.button !== 0) return;
    pressAt = { x: e.clientX, y: e.clientY };
    clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      suppressClick = true; // the release after a long press must not open the chat
      openConvMenu(row.dataset.convKey!, pressAt!.x, pressAt!.y);
      navigator.vibrate?.(15);
    }, 500);
  });
  const cancelPress = () => {
    clearTimeout(pressTimer);
    pressAt = null;
  };
  convListEl.addEventListener("pointermove", (e) => {
    if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) cancelPress(); // scrolling, not pressing
  }, { passive: true });
  convListEl.addEventListener("pointerup", cancelPress);
  convListEl.addEventListener("pointercancel", cancelPress);
  convListEl.addEventListener("contextmenu", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-conv-key]");
    if (!row) return;
    e.preventDefault();
    cancelPress();
    openConvMenu(row.dataset.convKey!, e.clientX, e.clientY);
  });

  const closeReactPicker = () => rootEl.querySelector(".rm-react-picker")?.remove();
  const openReactPicker = (msgId: string, roomId: string, anchorEl: HTMLElement) => {
    const existing = rootEl.querySelector<HTMLElement>(".rm-react-picker");
    if (existing && existing.dataset.forMsg === msgId) {
      closeReactPicker();
      return;
    }
    closeReactPicker();
    const picker = document.createElement("div");
    picker.className = "rm-react-picker";
    picker.dataset.forMsg = msgId;
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Reactions");
    picker.innerHTML = `
      <div class="rm-react-grid">
        ${CHAT_REACTIONS.map((emoji) => `<button type="button" class="rm-react-opt" data-react-opt="${emoji}" title="${emoji}">${emoji}</button>`).join("")}
      </div>
    `;
    rootEl.appendChild(picker);
    const rect = anchorEl.getBoundingClientRect();
    const rootRect = rootEl.getBoundingClientRect();
    const pWidth = 168;
    const pHeight = 176;

    let left = rect.left - rootRect.left;
    if (left + pWidth > rootRect.width - 12) {
      left = rootRect.width - pWidth - 12;
    }
    if (left < 12) left = 12;

    let top = rect.top - rootRect.top - pHeight - 6;
    if (top < 10) {
      top = rect.bottom - rootRect.top + 6;
    }
    picker.style.left = `${Math.round(left)}px`;
    picker.style.top = `${Math.round(top)}px`;

    picker.addEventListener("click", async (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-react-opt]");
      if (!btn) return;
      const emoji = btn.dataset.reactOpt;
      if (!emoji) return;
      closeReactPicker();
      const st = deps.getActiveState();
      const peer = st.community || st.privateRoom ? undefined : st.peer ?? undefined;
      await deps.onReactMessage(roomId, msgId, emoji, peer);
    });
  };

  document.addEventListener("pointerdown", (e) => {
    if (!(e.target as HTMLElement).closest(".rm-conv-menu")) closeConvMenu();
    if (!(e.target as HTMLElement).closest(".rm-react-picker, [data-open-react]")) closeReactPicker();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeConvMenu();
      closeReactPicker();
    }
  });
  convListEl.addEventListener("scroll", closeConvMenu, { passive: true });
  messagesTrackEl.addEventListener("scroll", closeReactPicker, { passive: true });

  // Conversation click in unified inbox
  let convSelectSeq = 0;
  convListEl.addEventListener("click", async (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-conv-key]");
    if (!row) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const key = row.dataset.convKey!;
    const seq = ++convSelectSeq;

    // Immediate visual feedback (<16ms) on the inbox row; the box gets focus only when I tap it
    convListEl.querySelectorAll(".rm-conv-item.active").forEach((el) => el.classList.remove("active"));
    row.classList.add("active");
    row.classList.remove("unread");
    row.querySelector(".rm-unread-pill")?.remove();

    composerInputEl.disabled = false;
    composerInputEl.placeholder = "Type a message… (Shift+Enter: new line)";
    composerInputEl.blur(); // no focus on open: on phones it would pop the keyboard over the last messages

    // Load & render the selected conversation before switching panes on mobile so the previous chat never flashes.
    if (key.startsWith("dm:")) {
      await deps.onSelectPeer(key.slice(3), false);
    } else if (key.startsWith("secret:")) {
      await deps.onSelectPeer(key.slice(7), true);
    } else if (key.startsWith("priv:")) {
      const rId = key.slice(5);
      const found = deps.getAllPrivateRooms().find((r) => r.id === rId);
      if (found) await deps.onSelectPrivateRoom(found);
    } else if (key.startsWith("comm:")) {
      const cId = key.slice(5);
      const found = deps.getAllCommunities().find((c) => c.id === cId);
      if (found) await deps.onSelectCommunity(found);
    }
    if (seq !== convSelectSeq) return;
    mobileShowThread = true;
    workspaceEl.classList.add("mobile-thread-open");
    messagesScrollerEl.scrollTop = messagesScrollerEl.scrollHeight;
    syncMiniPlayerSlot();
  });

  const goBackToInboxOnMobile = () => {
    // the conversation's Back step is on top: go back through it, so the next Back gesture is one step, not a skipped one
    if (history.state?.radica === "thread") {
      history.back();
      setTimeout(() => {
        if (mobileShowThread) {
          mobileShowThread = false;
          workspaceEl.classList.remove("mobile-thread-open");
          syncMiniPlayerSlot();
        }
      }, 45);
      return;
    }
    mobileShowThread = false;
    workspaceEl.classList.remove("mobile-thread-open");
    syncMiniPlayerSlot();
  };

  // Mobile back button (returns to unified inbox on phones)
  rootEl.querySelector("#rm-btn-mobile-back")?.addEventListener("click", goBackToInboxOnMobile);

  // Phones: horizontal swipe-right inside the thread returns to the chat list without exiting browser fullscreen
  const stageEl = rootEl.querySelector(".rm-stage") as HTMLElement | null;
  let stageSwipeStart: { x: number; y: number; t: number } | null = null;
  stageEl?.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1 || !workspaceEl.classList.contains("mobile-thread-open")) {
        stageSwipeStart = null;
        return;
      }
      const tgt = e.target as HTMLElement | null;
      if (tgt?.closest("input, textarea, select, pre, code, .carousel-track, audio, video")) {
        stageSwipeStart = null;
        return;
      }
      const touch = e.touches[0];
      if (touch.clientX < 18) {
        stageSwipeStart = null;
        return;
      }
      stageSwipeStart = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    },
    { passive: true }
  );
  stageEl?.addEventListener(
    "touchend",
    (e) => {
      if (!stageSwipeStart || e.changedTouches.length !== 1) return;
      const start = stageSwipeStart;
      stageSwipeStart = null;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = Math.abs(touch.clientY - start.y);
      const dt = Date.now() - start.t;
      if (dx > 76 && dy < 48 && dx > dy * 1.8 && dt < 550) {
        if (drawerOpen) setDrawer(false);
        else goBackToInboxOnMobile();
      }
    },
    { passive: true }
  );

  // Tapping message background dismisses the soft keyboard and restores viewport height
  messagesScrollerEl.addEventListener("pointerdown", (e) => {
    if (document.activeElement === composerInputEl) {
      const t = e.target as HTMLElement | null;
      if (!t?.closest("button, a, input, textarea, [role='button'], .rm-msg-action-btn, .cm-card")) {
        composerInputEl.blur();
      }
    }
  });

  // Header & Footer buttons
  rootEl.querySelector("#rm-btn-new-chat")?.addEventListener("click", () => openNewChatModal());
  rootEl.querySelector("#rm-btn-create-room")?.addEventListener("click", () => deps.onOpenCreateRoomModal());
  rootEl.querySelector("#rm-btn-create-channel")?.addEventListener("click", () => {
    if (deps.onOpenCreateChannelModal) deps.onOpenCreateChannelModal();
    else deps.onOpenCreateRoomModal();
  });
  rootEl.querySelector("#rm-btn-invite-code")?.addEventListener("click", () => deps.onOpenJoinRoomModal());
  inviteTopBtn.addEventListener("click", () => deps.onOpenInviteRoomModal());
  safetyTopBtn.addEventListener("click", () => openSafetyModal());
  rootEl.querySelector("#rm-btn-fullscreen")?.addEventListener("click", () => deps.onToggleFullscreen());
  rootEl.querySelector("#rm-btn-close")?.addEventListener("click", () => deps.onCloseChat());
  rootEl.querySelector("#rm-btn-inbox-close")?.addEventListener("click", () => deps.onCloseChat());

  // Drawer toggle
  const setDrawer = (open: boolean) => {
    drawerOpen = open;
    drawerEl.classList.toggle("open", open);
    drawerToggleBtn.classList.toggle("active", open);
    if (open) refreshDrawer();
  };
  drawerToggleBtn.addEventListener("click", () => setDrawer(!drawerOpen));
  rootEl.querySelector("#rm-header-peer-trigger")?.addEventListener("click", (e) => {
    const jumpBtn = (e.target as HTMLElement).closest<HTMLElement>("[data-jump-room]");
    if (jumpBtn?.dataset.jumpRoom) {
      e.stopPropagation();
      const targetRoom = deps.getAllPrivateRooms().find((r) => r.id === jumpBtn.dataset.jumpRoom);
      if (targetRoom) void deps.onSelectPrivateRoom(targetRoom);
      return;
    }
    if (activeConvKey()) setDrawer(!drawerOpen);
  });
  rootEl.querySelector("#rm-btn-drawer-close")?.addEventListener("click", () => setDrawer(false));

  // In-thread Search
  let threadSearchTimer = 0;
  rootEl.querySelector("#rm-btn-thread-search")?.addEventListener("click", () => {
    const open = threadSearchBarEl.classList.toggle("open");
    if (open) threadSearchInputEl.focus();
    else {
      clearTimeout(threadSearchTimer);
      threadQuery = "";
      threadSearchInputEl.value = "";
      renderThread();
    }
  });
  threadSearchInputEl.addEventListener("input", () => {
    threadQuery = threadSearchInputEl.value;
    clearTimeout(threadSearchTimer);
    threadSearchTimer = window.setTimeout(() => renderThread(), 120);
  });
  rootEl.querySelector("#rm-thread-search-close")?.addEventListener("click", () => {
    clearTimeout(threadSearchTimer);
    threadQuery = "";
    threadSearchInputEl.value = "";
    threadSearchBarEl.classList.remove("open");
    renderThread();
  });

  // Delegated interactions inside messages stream
  // phones: swipe someone's message to the right to mention them in the box (not from the screen edge: that is Back)
  let swipe: { row: HTMLElement; x: number; y: number; dx: number } | null = null;
  messagesTrackEl.addEventListener("touchstart", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".rm-msg-row.theirs");
    const t = e.touches[0];
    swipe = row && e.touches.length === 1 && t.clientX > 24 ? { row, x: t.clientX, y: t.clientY, dx: 0 } : null;
  }, { passive: true });
  messagesTrackEl.addEventListener("touchmove", (e) => {
    if (!swipe) return;
    const dx = e.touches[0].clientX - swipe.x;
    if (Math.abs(e.touches[0].clientY - swipe.y) > 30 || dx < 0) {
      swipe.row.style.transform = "";
      swipe = null;
      return;
    }
    swipe.dx = Math.min(dx, 80);
    swipe.row.style.transform = `translateX(${swipe.dx}px)`;
  }, { passive: true });
  messagesTrackEl.addEventListener("touchend", () => {
    if (!swipe) return;
    const { row, dx } = swipe;
    swipe = null;
    row.style.transform = "";
    const m = dx >= 60 ? deps.getActiveState().shownMessages.find((x) => x.id === row.dataset.msgId) : undefined;
    if (!m || composerInputEl.disabled) return;
    const v = composerInputEl.value;
    composerInputEl.value = `${v}${v && !v.endsWith(" ") ? " " : ""}@${deps.getAuthorDisplayName(m.sender)} `;
    fitInput();
    composerInputEl.focus();
  });

  messagesTrackEl.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;

    const loadOlderBtn = t.closest<HTMLElement>("#rm-btn-load-older");
    if (loadOlderBtn) {
      const prevHeight = messagesScrollerEl.scrollHeight;
      visibleMsgLimit += CHAT_PAGE_SIZE;
      renderThread(false);
      const newHeight = messagesScrollerEl.scrollHeight;
      messagesScrollerEl.scrollTop += (newHeight - prevHeight);
      return;
    }

    const blkBtn = t.closest<HTMLElement>("[data-block-peer]");
    if (blkBtn?.dataset.blockPeer) {
      if (deps.onToggleBlockPeer) {
        await deps.onToggleBlockPeer(blkBtn.dataset.blockPeer);
      }
      return;
    }

    const postLink = t.closest<HTMLAnchorElement>(".post-link");
    if (postLink) {
      deps.onOpenPostLink(e, postLink);
      return;
    }

    const mentionEl = t.closest<HTMLElement>(".mention[data-author]");
    if (mentionEl?.dataset.author) {
      deps.onOpenUserProfile(mentionEl.dataset.author);
      return;
    }

    const profileBtn = t.closest<HTMLElement>("[data-open-profile]");
    if (profileBtn?.dataset.openProfile) {
      deps.onOpenUserProfile(profileBtn.dataset.openProfile);
      return;
    }

    const helloBtn = t.closest<HTMLElement>("[data-prefill-hello]");
    if (helloBtn) {
      const name = helloBtn.dataset.prefillHello!;
      composerInputEl.value = `Hi ${name}!`;
      fitInput();
      composerInputEl.focus();
      return;
    }

    if (t.closest("#rm-inline-verify-btn")) {
      openSafetyModal();
      return;
    }

    if (t.closest("#rm-empty-invite-btn")) {
      deps.onOpenInviteRoomModal();
      return;
    }

    const openReactBtn = t.closest<HTMLElement>("[data-open-react]");
    if (openReactBtn) {
      e.stopPropagation();
      messagesTrackEl.querySelectorAll(".rm-msg-row.actions-open").forEach((el) => el.classList.remove("actions-open"));
      openReactPicker(openReactBtn.dataset.openReact!, openReactBtn.dataset.roomId!, openReactBtn);
      return;
    }

    const reactBtn = t.closest<HTMLElement>("[data-react-emoji]");
    if (reactBtn) {
      messagesTrackEl.querySelectorAll(".rm-msg-row.actions-open").forEach((el) => el.classList.remove("actions-open"));
      const st = deps.getActiveState();
      const peer = st.community || st.privateRoom ? undefined : st.peer ?? undefined;
      await deps.onReactMessage(reactBtn.dataset.roomId!, reactBtn.dataset.msgId!, reactBtn.dataset.reactEmoji!, peer);
      return;
    }

    const translateBtn = t.closest<HTMLElement>("[data-translate-msg]");
    if (translateBtn) {
      e.stopPropagation();
      messagesTrackEl.querySelectorAll(".rm-msg-row.actions-open").forEach((el) => el.classList.remove("actions-open"));
      const id = translateBtn.dataset.translateMsg!;
      const msg = deps.getActiveState().shownMessages.find((m) => m.id === id);
      if (!msg || chatTranslations.get(id) === "") return;
      if (chatTranslations.delete(id)) return renderThread();
      chatTranslations.set(id, "");
      renderThread();
      try {
        chatTranslations.set(id, await translateText(parseChatMedia(msg.text).caption || msg.text, translateBtn.dataset.from!, readerLang()));
      } catch (err: any) {
        chatTranslations.delete(id);
        deps.showToast("Could not translate: " + (err?.message || String(err)), "error");
      }
      renderThread();
      return;
    }

    const replyBtn = t.closest<HTMLElement>("[data-reply-msg]");
    if (replyBtn) {
      messagesTrackEl.querySelectorAll(".rm-msg-row.actions-open").forEach((el) => el.classList.remove("actions-open"));
      const msg = deps.getActiveState().shownMessages.find((m) => m.id === replyBtn.dataset.replyMsg) ?? null;
      deps.onSetReply(msg);
      composerInputEl.focus();
      return;
    }

    const delBtn = t.closest<HTMLElement>("[data-del-msg]");
    if (delBtn) {
      e.stopPropagation();
      messagesTrackEl.querySelectorAll(".rm-msg-row.actions-open").forEach((el) => el.classList.remove("actions-open"));
      await deps.onDeleteMessage(delBtn.dataset.roomId!, delBtn.dataset.delMsg!);
      return;
    }

    const editBtn = t.closest<HTMLElement>("[data-edit-msg]");
    if (editBtn?.dataset.editMsg) {
      e.stopPropagation();
      messagesTrackEl.querySelectorAll(".rm-msg-row.actions-open").forEach((el) => el.classList.remove("actions-open"));
      const msgId = editBtn.dataset.editMsg;
      const msg = deps.getActiveState().shownMessages.find((m) => m.id === msgId);
      if (msg && msg.sender === deps.getIdentity()?.pubkey) {
        editingMessageId = msg.id;
        const { caption, items } = parseChatMedia(msg.text);
        editingMediaTokens = items.map((it) => it.raw).join("\n");
        composerInputEl.value = caption || msg.text;
        fitInput();
        const excerpt = summarizeChatMediaText(msg.text, (txt) => plainMentions(txt, deps.getAuthorDisplayName)).slice(0, 80);
        editBannerTextEl.textContent = `Editing: ${excerpt}`;
        editBannerEl.style.display = "flex";
        composerInputEl.focus();
      }
      return;
    }

    const pinBtn = t.closest<HTMLElement>("[data-pin-msg]");
    if (pinBtn?.dataset.pinMsg) {
      e.stopPropagation();
      messagesTrackEl.querySelectorAll(".rm-msg-row.actions-open").forEach((el) => el.classList.remove("actions-open"));
      const msgId = pinBtn.dataset.pinMsg;
      const isPinned = pinBtn.dataset.pinned === "1";
      const openId = deps.openRoomId();
      if (openId && deps.onPinMessage) {
        await deps.onPinMessage(openId, isPinned ? null : (msgId || null));
      }
      return;
    }

    const jumpEl = t.closest<HTMLElement>("[data-jump-msg]");
    if (jumpEl?.dataset.jumpMsg) {
      const row = messagesTrackEl.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(jumpEl.dataset.jumpMsg)}"]`);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("flash-highlight");
        setTimeout(() => row.classList.remove("flash-highlight"), 1500);
      }
      return;
    }

    const jumpRoomEl = t.closest<HTMLElement>("[data-jump-room]");
    if (jumpRoomEl?.dataset.jumpRoom) {
      e.stopPropagation();
      const targetRoom = deps.getAllPrivateRooms().find((r) => r.id === jumpRoomEl.dataset.jumpRoom);
      if (targetRoom) {
        void deps.onSelectPrivateRoom(targetRoom);
      }
      return;
    }

    // Mobile tap on bubble toggles floating quick-action bar cleanly
    const tappedBubble = t.closest<HTMLElement>(".rm-bubble");
    if (tappedBubble && !t.closest(".fp-card, .ft-card, a, button") && !window.getSelection()?.toString()) {
      const row = tappedBubble.closest<HTMLElement>(".rm-msg-row");
      const wasOpen = row?.classList.contains("actions-open");
      messagesTrackEl.querySelectorAll(".rm-msg-row.actions-open").forEach((el) => el.classList.remove("actions-open"));
      if (row && !wasOpen) row.classList.add("actions-open");
    } else {
      messagesTrackEl.querySelectorAll(".rm-msg-row.actions-open").forEach((el) => el.classList.remove("actions-open"));
    }
  });

  // Delegated interactions inside Info Drawer
  drawerContentEl.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const identity = deps.getIdentity();
    const st = deps.getActiveState();
    if (!identity) return;

    const mediaTabBtn = t.closest<HTMLElement>("[data-media-tab]");
    if (mediaTabBtn?.dataset.mediaTab) {
      const tabName = mediaTabBtn.dataset.mediaTab;
      drawerContentEl.querySelectorAll(".rm-media-tab-btn").forEach((btn) => btn.classList.remove("active"));
      mediaTabBtn.classList.add("active");
      drawerContentEl.querySelectorAll<HTMLElement>(".rm-media-tab-pane").forEach((pane) => {
        pane.style.display = pane.dataset.mediaPane === tabName ? "block" : "none";
      });
      return;
    }

    const jumpMediaEl = t.closest<HTMLElement>("[data-jump-msg]");
    if (jumpMediaEl?.dataset.jumpMsg) {
      const targetId = jumpMediaEl.dataset.jumpMsg;
      const row = messagesTrackEl.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(targetId)}"]`);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("flash-highlight");
        setTimeout(() => row.classList.remove("flash-highlight"), 1500);
      }
      return;
    }

    if (t.closest("#rm-drawer-verify-btn")) {
      openSafetyModal();
      return;
    }

    const jumpRoomEl = t.closest<HTMLElement>("[data-jump-room]");
    if (jumpRoomEl?.dataset.jumpRoom) {
      const targetRoom = deps.getAllPrivateRooms().find((r) => r.id === jumpRoomEl.dataset.jumpRoom);
      if (targetRoom) {
        setDrawer(false);
        void deps.onSelectPrivateRoom(targetRoom);
      }
      return;
    }

    if (t.closest("[data-create-disc-room]") && st.privateRoom?.is_channel) {
      try {
        deps.showToast("Creating linked discussion room…", "info");
        const name = roomNameCache.get(st.privateRoom.id) || "Channel";
        const disc = await freenet.createPrivateRoom(identity, `${name} · Comments`, st.privateRoom.members);
        await freenet.setRoomLinkedDiscussion(identity, st.privateRoom.id, disc.id);
        await freenet.setRoomLinkedDiscussion(identity, disc.id, st.privateRoom.id);
        deps.showToast("Discussion room linked successfully!", "info");
        refreshDrawer();
      } catch (err: any) {
        deps.showToast(`Could not create discussion room: ${err.message || err}`, "error");
      }
      return;
    }

    const prof = t.closest<HTMLElement>("[data-open-profile]");
    if (prof?.dataset.openProfile) {
      deps.onOpenUserProfile(prof.dataset.openProfile);
      return;
    }

    const pinBtn = t.closest<HTMLElement>("[data-toggle-pin]");
    if (pinBtn?.dataset.togglePin) {
      const on = togglePinned(pinBtn.dataset.togglePin);
      deps.showToast(on ? "Conversation pinned" : "Conversation unpinned", "info");
      refreshDrawer();
      void refreshInbox();
      return;
    }

    if (t.closest("[data-clear-chat]")) {
      await deps.onClearActiveChat();
      return;
    }

    if (t.closest("[data-invite-room]")) {
      deps.onOpenInviteRoomModal();
      return;
    }

    if (t.closest("#rm-edit-room-avatar-btn") && st.privateRoom) {
      const input = drawerContentEl.querySelector("#rm-drawer-avatar-file-input") as HTMLInputElement | null;
      input?.click();
      return;
    }

    if (t.closest("[data-remove-room-avatar]") && st.privateRoom) {
      try {
        const updated = await freenet.setRoomAvatar(identity, st.privateRoom.id, undefined);
        if (updated) {
          await deps.onSelectPrivateRoom(updated);
          deps.showToast("Group image removed", "info");
          refreshDrawer();
          void refreshInbox();
        }
      } catch (err: any) {
        deps.showToast(`Could not remove image: ${err.message || err}`, "error");
      }
      return;
    }

    if (t.closest("[data-copy-room-link]") && st.privateRoom) {
      const link = await deps.onGetInviteLink(st.privateRoom);
      if (link) {
        await navigator.clipboard.writeText(link);
        deps.showToast("Zero-knowledge invite link copied to clipboard!", "info");
      }
      return;
    }

    if (t.closest("[data-export-river-id]") && st.privateRoom) {
      try {
        const token = await freenet.exportRiverIdentity(identity, st.privateRoom);
        await navigator.clipboard.writeText(token);
        alert(
          "Your River identity for this room is copied to the clipboard.\n\nImport it in River (Import ID) or riverctl to be the same member there.\n\nIt holds your private key in this room: treat it like a password, do not share it."
        );
      } catch (err: any) {
        deps.showToast(`Could not export: ${err.message || err}`, "error");
      }
      return;
    }

    if (t.closest("[data-leave-room]") && st.privateRoom) {
      await deps.onLeavePrivateRoom(st.privateRoom);
      if (!deps.getActiveState().privateRoom) setDrawer(false);
      return;
    }

    const rmPeer = t.closest<HTMLElement>("[data-remove-peer]");
    if (rmPeer?.dataset.removePeer) {
      deps.onRemovePeer(rmPeer.dataset.removePeer);
      if (!deps.getActiveState().peer) setDrawer(false);
      return;
    }

    const blkPeer = t.closest<HTMLElement>("[data-block-peer]");
    if (blkPeer?.dataset.blockPeer) {
      if (deps.onToggleBlockPeer) {
        await deps.onToggleBlockPeer(blkPeer.dataset.blockPeer);
      }
      return;
    }

    const dmBtn = t.closest<HTMLElement>("[data-dm-pk]");
    if (dmBtn?.dataset.dmPk) {
      await deps.onSelectPeer(dmBtn.dataset.dmPk);
      return;
    }

    const copyBtn = t.closest<HTMLElement>("[data-copy-pk]");
    if (copyBtn?.dataset.copyPk) {
      await navigator.clipboard.writeText(copyBtn.dataset.copyPk);
      deps.showToast("Public key copied to clipboard!", "info");
      return;
    }

    const modBtn = t.closest<HTMLElement>("[data-room-mod]");
    if (modBtn?.dataset.roomMod && st.privateRoom) {
      try {
        const updated = await freenet.setPrivateRoomModerator(
          identity,
          st.privateRoom.id,
          modBtn.dataset.roomMod,
          modBtn.dataset.modOn === "1"
        );
        await deps.onSelectPrivateRoom(updated);
      } catch (err: any) {
        alert(`Could not update moderator: ${err.message || err}`);
      }
      return;
    }

    const kickBtn = t.closest<HTMLElement>("[data-room-kick]");
    if (kickBtn?.dataset.roomKick && st.privateRoom) {
      const pk = kickBtn.dataset.roomKick;
      const name = deps.getAuthorDisplayName(pk);
      if (!confirm(`Kick ${name} from this private room?\n\nA new encryption key will be rotated for remaining members.`)) return;
      try {
        const updated = await freenet.kickMemberFromPrivateRoom(identity, st.privateRoom.id, pk);
        await deps.onSelectPrivateRoom(updated);
        deps.showToast(`${name} removed from room.`, "info");
      } catch (err: any) {
        alert(`Could not kick member: ${err.message || err}`);
      }
      return;
    }

    const banBtn = t.closest<HTMLElement>("[data-comm-ban]");
    if (banBtn?.dataset.commBan && st.community) {
      const pk = banBtn.dataset.commBan;
      const name = deps.getAuthorDisplayName(pk);
      if (!confirm(`Ban ${name} from r/${st.community.slug}?`)) return;
      try {
        const res = await freenet.banMemberFromCommunity(identity, st.community.id, pk);
        if (res.success && res.community) await deps.onSelectCommunity(res.community);
        else alert(res.msg);
      } catch (err: any) {
        alert(`Could not ban member: ${err.message || err}`);
      }
      return;
    }

    const unbanBtn = t.closest<HTMLElement>("[data-comm-unban]");
    if (unbanBtn?.dataset.commUnban && st.community) {
      try {
        const res = await freenet.unbanMemberFromCommunity(identity, st.community.id, unbanBtn.dataset.commUnban);
        if (res.success && res.community) await deps.onSelectCommunity(res.community);
        else alert(res.msg);
      } catch (err: any) {
        alert(`Could not unban member: ${err.message || err}`);
      }
    }
  });

  // Pinned bar interactions
  pinnedContentEl?.addEventListener("click", () => {
    const pinnedId = pinnedContentEl.getAttribute("data-jump-pinned-id");
    if (pinnedId) {
      const row = messagesTrackEl.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(pinnedId)}"]`);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("flash-highlight");
        setTimeout(() => row.classList.remove("flash-highlight"), 1500);
      }
    }
  });

  pinnedUnpinBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const openId = deps.openRoomId();
    if (openId && deps.onPinMessage) {
      await deps.onPinMessage(openId, null);
    }
  });

  // Reply banner cancel
  rootEl.querySelector("#rm-reply-banner-cancel")?.addEventListener("click", () => {
    deps.onSetReply(null);
  });

  // Edit banner cancel
  const cancelEditing = () => {
    editingMessageId = null;
    editingMediaTokens = "";
    if (editBannerEl) editBannerEl.style.display = "none";
  };

  editBannerCancelBtn?.addEventListener("click", () => {
    cancelEditing();
    composerInputEl.value = "";
    fitInput();
  });

  // Composer input & submit
  composerInputEl.addEventListener("input", fitInput);
  composerInputEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    composerFormEl.requestSubmit();
  });

  rootEl.querySelector("#rm-btn-quick-emoji")?.addEventListener("click", () => {
    if (composerInputEl.disabled) return;
    composerInputEl.value += (composerInputEl.value ? " " : "") + "🌱";
    fitInput();
    composerInputEl.focus();
  });

  const sendCurrentPayload = async () => {
    if (composerInputEl.disabled || uploadingMedia) return;
    const raw = composerInputEl.value.trim();
    if (!raw && !stagedMedia) return;

    if (!activeConvKey()) {
      deps.showToast("Select a conversation first.", "warning");
      return;
    }

    let finalPayload = raw;
    let newToken = "";
    if (stagedMedia) {
      uploadingMedia = true;
      sendBtnEl.disabled = true;
      const prevSendHtml = sendBtnEl.innerHTML;
      sendBtnEl.innerHTML = renderIcon("lock", { size: 14, className: "icon-sm" });
      try {
        const stageSub = rootEl.querySelector<HTMLElement>(".rm-media-stage-sub");
        const token = await sendChatAttachment(stagedMedia, (b) => freenet.putMedia(b), (done, total) => {
          sendBtnEl.innerHTML = total > 1 ? `<span style="font-size:0.7rem;">${done}/${total}</span>` : renderIcon("lock", { size: 14, className: "icon-sm" });
          if (stageSub) stageSub.textContent = `⏳ Uploading to Freenet… ${Math.round((done / total) * 100)}%${total > 1 ? ` (${done}/${total} pieces)` : ""}`;
        });
        newToken = token;
        finalPayload = raw ? `${raw}\n${token}` : token;
      } catch (err: any) {
        deps.showToast(`Could not send media: ${err.message || err}`, "error");
        uploadingMedia = false;
        sendBtnEl.disabled = false;
        sendBtnEl.innerHTML = prevSendHtml;
        return;
      } finally {
        uploadingMedia = false;
        sendBtnEl.disabled = false;
        sendBtnEl.innerHTML = prevSendHtml;
        const stageSub = rootEl.querySelector<HTMLElement>(".rm-media-stage-sub");
        if (stageSub) stageSub.innerHTML = `${renderIcon("lock", { size: 11, className: "icon-xs" })} Encrypted with random 256-bit AES-GCM key on Freenet`;
      }
    }

    if (editingMessageId) {
      const openId = deps.openRoomId();
      if (!openId) return;
      const targetMsgId = editingMessageId;
      const editedText = [raw, editingMediaTokens, newToken].filter(Boolean).join("\n");
      cancelEditing();
      composerInputEl.value = "";
      fitInput();
      setStagedMedia(null);
      if (deps.onEditMessage) {
        await deps.onEditMessage(openId, targetMsgId, editedText);
      }
      return;
    }

    const sent = await deps.onSendMessage(finalPayload, composerInputEl);
    if (sent) {
      composerInputEl.value = "";
      fitInput();
      setStagedMedia(null);
    }
  };

  composerFormEl.addEventListener("submit", (e) => {
    e.preventDefault();
    void sendCurrentPayload();
  });

  // Media stage cancel
  rootEl.querySelector("#rm-media-stage-cancel")?.addEventListener("click", () => {
    setStagedMedia(null);
  });

  // File pickers
  fileImageEl.addEventListener("change", async () => {
    deps.clearPickingFile?.(1500);
    mobileShowThread = true;
    workspaceEl.classList.add("mobile-thread-open");
    const f = fileImageEl.files?.[0];
    if (!f) return;
    try {
      deps.showToast("Optimizing photo for Freenet…", "info");
      const prep = await prepareChatImageFile(f);
      setStagedMedia(prep);
      mobileShowThread = true;
      workspaceEl.classList.add("mobile-thread-open");
      composerInputEl.focus();
    } catch (err: any) {
      deps.showToast(err.message || String(err), "error");
    }
  });
  fileImageEl.addEventListener("cancel", () => {
    deps.clearPickingFile?.(1000);
    mobileShowThread = true;
    workspaceEl.classList.add("mobile-thread-open");
  });

  fileAudioEl.addEventListener("change", async () => {
    deps.clearPickingFile?.(1500);
    mobileShowThread = true;
    workspaceEl.classList.add("mobile-thread-open");
    const f = fileAudioEl.files?.[0];
    if (!f) return;
    try {
      deps.showToast("Preparing audio file…", "info");
      const prep = await prepareChatAudioFile(f, "audio");
      setStagedMedia(prep);
      mobileShowThread = true;
      workspaceEl.classList.add("mobile-thread-open");
      composerInputEl.focus();
    } catch (err: any) {
      deps.showToast(err.message || String(err), "error");
    }
  });
  fileAudioEl.addEventListener("cancel", () => {
    deps.clearPickingFile?.(1000);
    mobileShowThread = true;
    workspaceEl.classList.add("mobile-thread-open");
  });

  fileDocEl.addEventListener("change", async () => {
    deps.clearPickingFile?.(1500);
    mobileShowThread = true;
    workspaceEl.classList.add("mobile-thread-open");
    const f = fileDocEl.files?.[0];
    if (!f) return;
    try {
      deps.showToast("Preparing document file…", "info");
      const prep = await prepareChatDocFile(f);
      setStagedMedia(prep);
      mobileShowThread = true;
      workspaceEl.classList.add("mobile-thread-open");
      composerInputEl.focus();
    } catch (err: any) {
      deps.showToast(err.message || String(err), "error");
    }
  });
  fileDocEl.addEventListener("cancel", () => {
    deps.clearPickingFile?.(1000);
    mobileShowThread = true;
    workspaceEl.classList.add("mobile-thread-open");
  });

  // Drag & drop support on composer
  const handleDropFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const file = files[0];
    try {
      if (file.type.startsWith("image/")) {
        deps.showToast("Optimizing dropped photo…", "info");
        const prep = await prepareChatImageFile(file);
        setStagedMedia(prep);
      } else if (file.type.startsWith("audio/") || normalizeAudioMime(file.type, file.name)) {
        deps.showToast("Preparing dropped audio…", "info");
        const prep = await prepareChatAudioFile(file, "audio");
        setStagedMedia(prep);
      } else {
        deps.showToast("Preparing dropped file…", "info");
        const prep = await prepareChatDocFile(file);
        setStagedMedia(prep);
      }
    } catch (err: any) {
      deps.showToast(err.message || String(err), "error");
    }
  };

  composerOuterEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  composerOuterEl.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void handleDropFiles(e.dataTransfer?.files ?? null);
  });

  // Clipboard paste support on textarea
  composerInputEl.addEventListener("paste", async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          try {
            deps.showToast("Pasting photo…", "info");
            const prep = await prepareChatImageFile(file);
            setStagedMedia(prep);
          } catch (err: any) {
            deps.showToast(err.message || String(err), "error");
          }
          break;
        }
      } else if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          try {
            if (file.type.startsWith("audio/") || normalizeAudioMime(file.type, file.name)) {
              deps.showToast("Pasting audio…", "info");
              const prep = await prepareChatAudioFile(file, "audio");
              setStagedMedia(prep);
            } else {
              deps.showToast("Pasting file…", "info");
              const prep = await prepareChatDocFile(file);
              setStagedMedia(prep);
            }
          } catch (err: any) {
            deps.showToast(err.message || String(err), "error");
          }
          break;
        }
      }
    }
  });

  // Click on chat photo to open Radica Lightbox
  messagesTrackEl.addEventListener("click", (e) => {
    const img = (e.target as HTMLElement).closest(".cm-img-wrap img") as HTMLImageElement | null;
    if (!img || !img.src) return;
    const box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = `<img src="${safeUrl(img.src)}" alt="Chat photo" />`;
    const close = () => {
      box.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && close();
    box.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(box);
  });

  // Attachment Popover Menu (100% real Freenet actions)
  rootEl.querySelector("#rm-btn-attach")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const roomLinkBtn = rootEl.querySelector("#rm-attach-room-link") as HTMLElement | null;
    if (roomLinkBtn) {
      roomLinkBtn.style.display = deps.getAllPrivateRooms().length > 0 ? "flex" : "none";
    }
    attachMenuEl.classList.toggle("open");
  });

  document.addEventListener("click", () => attachMenuEl.classList.remove("open"));

  attachMenuEl.addEventListener("click", async (e) => {
    e.stopPropagation();
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-attach]");
    if (!btn) return;
    attachMenuEl.classList.remove("open");
    const kind = btn.dataset.attach;
    const identity = deps.getIdentity();
    if (!identity) return;

    if (kind === "image") {
      deps.markPickingFile?.(45000);
      fileImageEl.value = "";
      fileImageEl.click();
    } else if (kind === "audio") {
      deps.markPickingFile?.(45000);
      fileAudioEl.value = "";
      fileAudioEl.click();
    } else if (kind === "file") {
      deps.markPickingFile?.(45000);
      fileDocEl.value = "";
      fileDocEl.click();
    } else if (kind === "mention") {
      composerInputEl.value += (composerInputEl.value && !composerInputEl.value.endsWith(" ") ? " " : "") + "@";
      composerInputEl.focus();
      composerInputEl.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (kind === "my-key") {
      composerInputEl.value += (composerInputEl.value ? "\n" : "") + identity.pubkey;
      fitInput();
      composerInputEl.focus();
    } else if (kind === "room-link") {
      const st = deps.getActiveState();
      const targetRoom = st.privateRoom ?? deps.getAllPrivateRooms()[0];
      if (!targetRoom) {
        deps.showToast("You don't have any private rooms to share yet.", "warning");
        return;
      }
      const link = await deps.onGetInviteLink(targetRoom);
      if (link) {
        const rName = roomNameCache.get(targetRoom.id) || "Private Room";
        composerInputEl.value += (composerInputEl.value ? "\n" : "") + `Invite to "${rName}": ${link}`;
        fitInput();
        composerInputEl.focus();
      }
    } else if (kind === "poll") {
      if (!activeConvKey()) {
        deps.showToast("Select a conversation first.", "warning");
        return;
      }
      pollQuestionEl.value = "";
      pollOptionsEl.value = "";
      pollMultiEl.checked = false;
      pollModalEl.classList.add("open");
      setTimeout(() => pollQuestionEl.focus(), 30);
    }
  });

  // Safety Modal listeners
  inModals("#rm-safety-modal-close")?.addEventListener("click", () => safetyModalEl.classList.remove("open"));
  safetyModalEl.addEventListener("click", (e) => {
    if (e.target === safetyModalEl) safetyModalEl.classList.remove("open");
  });
  inModals("#rm-btn-copy-safety")?.addEventListener("click", async () => {
    const identity = deps.getIdentity();
    const target = safetyTarget();
    if (!identity || !target) return;
    const blocks = computeSafetyBlocks(identity.pubkey, target.material).join(" ");
    await navigator.clipboard.writeText(blocks);
    deps.showToast("Safety number copied to clipboard!", "info");
  });
  markVerifiedBtnEl.addEventListener("click", () => {
    const target = safetyTarget();
    if (!target) return;
    const on = toggleVerified(target.id);
    safetyModalEl.classList.remove("open");
    renderHeader();
    if (drawerOpen) refreshDrawer();
    deps.showToast(on ? `${target.label} marked as verified` : "Verification removed", "info");
  });

  // New Chat Modal listeners
  inModals("#rm-new-chat-close")?.addEventListener("click", () => newChatModalEl.classList.remove("open"));
  newChatModalEl.addEventListener("click", (e) => {
    if (e.target === newChatModalEl) newChatModalEl.classList.remove("open");
  });
  inModals("#rm-modal-create-room")?.addEventListener("click", () => {
    newChatModalEl.classList.remove("open");
    deps.onOpenCreateRoomModal();
  });
  inModals("#rm-modal-join-room")?.addEventListener("click", () => {
    newChatModalEl.classList.remove("open");
    deps.onOpenJoinRoomModal();
  });
  newChatInputEl.addEventListener("input", () => renderContactPickerList());
  const startDmFromInput = (isSecret = false) => {
    const raw = newChatInputEl.value.trim().toLowerCase();
    const identity = deps.getIdentity();
    if (!identity) return;
    if (/^[0-9a-f]{64}$/.test(raw)) {
      if (raw === identity.pubkey) {
        deps.showToast("You cannot start a chat with your own public key.", "warning");
        return;
      }
      if (deps.isPeerBlocked?.(raw) || freenet.blockedBy(identity.pubkey).has(raw)) {
        deps.showToast("This contact is blocked. Unblock them first to start a chat.", "warning");
        return;
      }
      newChatModalEl.classList.remove("open");
      mobileShowThread = true;
      workspaceEl.classList.add("mobile-thread-open");
      void deps.onSelectPeer(raw, isSecret);
      return;
    }
    const firstBtn = contactPickerListEl.querySelector<HTMLElement>("[data-pick-peer]");
    if (firstBtn?.dataset.pickPeer) {
      newChatModalEl.classList.remove("open");
      mobileShowThread = true;
      workspaceEl.classList.add("mobile-thread-open");
      void deps.onSelectPeer(firstBtn.dataset.pickPeer, isSecret);
    } else {
      deps.showToast("Enter a valid 64-character hex public key or pick a contact.", "warning");
    }
  };
  inModals("#rm-new-chat-go")?.addEventListener("click", () => startDmFromInput(false));
  inModals("#rm-new-chat-secret-go")?.addEventListener("click", () => startDmFromInput(true));
  inModals("#rm-modal-new-secret")?.addEventListener("click", () => {
    newChatInputEl.focus();
    deps.showToast("Select a contact or paste 64-hex key to start a Secret Chat", "info");
  });
  newChatInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      startDmFromInput(false);
    }
  });
  contactPickerListEl.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>("[data-action]");
    const row = target.closest<HTMLElement>("[data-pick-peer]");
    const pk = btn?.dataset.pk || row?.dataset.pickPeer;
    if (!pk) return;
    const isSecret = btn?.dataset.action === "secret";
    newChatModalEl.classList.remove("open");
    mobileShowThread = true;
    workspaceEl.classList.add("mobile-thread-open");
    void deps.onSelectPeer(pk, isSecret);
  });

  // Disappearing messages timer toggle listener
  rootEl.querySelector("#rm-btn-ttl-selector")?.addEventListener("click", () => {
    const st = deps.getActiveState();
    if (!st.peer || !st.isSecret) return;
    const openId = deps.openRoomId();
    if (!openId) return;
    const nextPreset = { seconds: nextTtl(freenet.getSecretChatTTL(openId)), label: "" };
    nextPreset.label = formatTtlLabel(nextPreset.seconds);
    freenet.setSecretChatTTL(openId, nextPreset.seconds);
    const ttlBtnEl = rootEl.querySelector("#rm-btn-ttl-selector");
    if (ttlBtnEl) ttlBtnEl.innerHTML = `${renderIcon("clock", { size: 12 })} <span>${escapeHtml(nextPreset.label)}</span>`;
    headerSubtitleEl.textContent = `PFS Ephemeral · Disappearing: ${nextPreset.label}`;
    const bannerTtl = rootEl.querySelector("#rm-secret-banner-ttl");
    if (bannerTtl) bannerTtl.textContent = nextPreset.label;
    deps.showToast(`Disappearing messages set to ${nextPreset.label}`, "info");
    void refreshInbox(true);
  });


  // Typing indicator broadcast and listener
  composerInputEl.addEventListener("input", () => {
    const openId = deps.openRoomId();
    if (openId) deps.conversation.localTyping(openId);
  });

  deps.conversation.onTypingChange((roomId) => {
    if (roomId !== deps.openRoomId()) return;
    const typingBar = rootEl.querySelector("#rm-typing-bar") as HTMLElement | null;
    const typingText = rootEl.querySelector("#rm-typing-text") as HTMLElement | null;
    if (!typingBar || !typingText) return;
    const typers = deps.conversation.typersIn(roomId);
    typingText.textContent = typers.length ? `${typers.map((s) => deps.getAuthorDisplayName(s)).join(", ")} is typing` : "";
    typingBar.style.display = typers.length ? "flex" : "none";
  });

  // FreePolls Creator Modal listeners
  const closePollModal = () => pollModalEl.classList.remove("open");
  inModals("#rm-poll-close")?.addEventListener("click", closePollModal);
  inModals("#rm-poll-cancel")?.addEventListener("click", closePollModal);
  pollModalEl.addEventListener("click", (e) => {
    if (e.target === pollModalEl) closePollModal();
  });
  pollSubmitBtnEl.addEventListener("click", async () => {
    const question = pollQuestionEl.value.trim();
    const options = [...new Set(pollOptionsEl.value.split("\n").map((o) => o.trim()).filter(Boolean))].slice(0, 20);
    if (!question || options.length < 2) {
      deps.showToast("Enter a question and at least two options (one per line).", "warning");
      return;
    }
    pollSubmitBtnEl.disabled = true;
    pollSubmitBtnEl.textContent = "Publishing to node…";
    try {
      const link = await deps.onCreatePollLink(question, options, pollMultiEl.checked);
      closePollModal();
      await deps.onSendMessage(`[Poll] ${question}\n${link}`);
    } catch (err: any) {
      deps.showToast(`Could not create poll: ${err.message || err}`, "error");
    } finally {
      pollSubmitBtnEl.disabled = false;
      pollSubmitBtnEl.textContent = "Publish & Send";
    }
  });

  let lastViewportHeight = typeof window !== "undefined" ? (window.visualViewport?.height ?? window.innerHeight) : 0;
  function onViewportResize(nextHeight: number) {
    const prev = lastViewportHeight;
    lastViewportHeight = nextHeight;
    if (!isVisible() || prev <= 0) return;
    const delta = prev - nextHeight;
    if (delta > 24) {
      const distFromBottom = messagesScrollerEl.scrollHeight - messagesScrollerEl.scrollTop - messagesScrollerEl.clientHeight;
      if (document.activeElement === composerInputEl || distFromBottom < delta + 120) {
        messagesScrollerEl.scrollTop = Math.min(messagesScrollerEl.scrollHeight, messagesScrollerEl.scrollTop + delta);
      }
    }
  }

  return {
    composerInputEl,
    refreshInbox,
    renderThread,
    refreshDrawer: () => {
      if (drawerOpen) refreshDrawer();
    },
    renderReplyBanner,
    updateStatusBanner,
    onViewportResize,
    showInboxOnMobileIfEmpty: () => {
      if (!activeConvKey()) {
        mobileShowThread = false;
        workspaceEl.classList.remove("mobile-thread-open");
      } else {
        workspaceEl.classList.toggle("mobile-thread-open", mobileShowThread);
      }
      syncMiniPlayerSlot();
    },
    openThreadOnMobile: () => {
      mobileShowThread = true;
      workspaceEl.classList.add("mobile-thread-open");
      messagesScrollerEl.scrollTop = messagesScrollerEl.scrollHeight;
      syncMiniPlayerSlot();
    },
    /** Phones: back to the conversations list (the thread stays selected). */
    showInboxOnMobile: () => {
      mobileShowThread = false;
      workspaceEl.classList.remove("mobile-thread-open");
      syncMiniPlayerSlot();
    },
    isThreadOpenOnMobile: () => workspaceEl.classList.contains("mobile-thread-open") && getComputedStyle(workspaceEl.querySelector(".rm-inbox")!).display === "none",
    /** Peel one mobile overlay/drawer/thread layer inside Messenger chat; returns true if handled. */
    stepBackOnMobile: (): boolean => {
      if (deps.isPickingFile?.()) return false;
      if (pollModalEl.classList.contains("open")) {
        pollModalEl.classList.remove("open");
        return true;
      }
      if (newChatModalEl.classList.contains("open")) {
        newChatModalEl.classList.remove("open");
        return true;
      }
      if (safetyModalEl.classList.contains("open")) {
        safetyModalEl.classList.remove("open");
        return true;
      }
      if (drawerOpen) {
        setDrawer(false);
        return true;
      }
      if (attachMenuEl.classList.contains("open") || rootEl.querySelector(".rm-react-picker")) {
        attachMenuEl.classList.remove("open");
        closeReactPicker();
        return true;
      }
      if (workspaceEl.classList.contains("mobile-thread-open") && getComputedStyle(workspaceEl.querySelector(".rm-inbox")!).display === "none") {
        mobileShowThread = false;
        workspaceEl.classList.remove("mobile-thread-open");
        syncMiniPlayerSlot();
        return true;
      }
      return false;
    },
    openSafetyModal: () => openSafetyModal(),
    openNewChatModal: (preferSecret = false) => {
      openNewChatModal();
      if (preferSecret) {
        const secretBtn = newChatModalEl.querySelector("#rm-new-chat-secret-go") as HTMLElement | null;
        if (secretBtn) secretBtn.style.boxShadow = "0 0 0 2px #10b981";
      } else {
        const secretBtn = newChatModalEl.querySelector("#rm-new-chat-secret-go") as HTMLElement | null;
        if (secretBtn) secretBtn.style.boxShadow = "";
      }
    },
    openPollModal: () => {
      pollQuestionEl.value = "";
      pollOptionsEl.value = "";
      pollMultiEl.checked = false;
      pollModalEl.classList.add("open");
      setTimeout(() => pollQuestionEl.focus(), 30);
    },
  };
}
