import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import { UPDATES } from "./updates";
import { ecosystemFooter, ecosystemCard } from "./ecosystem";
import { closeModal, installModalDismiss } from "./modals";
import { initShortcuts } from "./shortcuts";
import { findCommunities, type CommunitySort } from "./communityFinder";
import { getIdentity, personaName } from "./crypto";
import { linkify, renderCaption, renderPost, renderComment, mentionsIn, nodeOrigin, renderChatText, setMaskBadWords, trendingTags } from "./caption.ts";
import { deltaPrefixOf, pageHref, deltaCard, fillDelta } from "./delta.ts";
import { ortoCard, fillOrto, ortoPostHref, ORTO_SITE } from "./orto.ts";
import { asocialCard, fillAsocial, asocialPersonOf, asocialProfileCard } from "./asocial.ts";
import { fhCard, fillFh, fhProfileCard } from "./fh.ts";
import { wormholeCard, fillWormhole } from "./wormhole.ts";
import { freetreeCard, freetreeProfileCard, parseFreetreeInput } from "./freetree.ts";
import { nameHref, freenamesCard, fillFreenames } from "./freenames.ts";
import { attachMentionPicker, withMentionKeys } from "./mentionPicker.ts";
import { rootsSvg } from "./roots.ts";
import "./chat.css";
import "./messengerChat.css";
import { createMessengerChat, type ChatLayoutMode } from "./messengerChat.ts";
import { formatTtlLabel } from "./secretChat.ts";
import { escapeHtml, safeUrl, shortenKey } from "./html.ts";
import { burnAtOf, checksHtml, createConversationState, deliveryOf, dmPeerOf, nextTtl, tickBurnCountdowns, triggerRowBurnAnimation } from "./conversationState.ts";
import {
  chatMediaCardsHtml,
  fileExtensionIcon,
  fillChatMedia,
  maskChatMediaTokens,
  parseChatMedia,
  prepareChatAudioFile,
  prepareChatDocFile,
  prepareChatImageFile,
  summarizeChatMediaText,
  type PreparedChatMedia,
  sendChatAttachment,
  syncMiniPlayerSlot,
} from "./chatMedia.ts";
import {
  finishSignIn,
  startSignIn,
  officialViso,
  createLocalIdentity,
  localIdentityKey,
  signOut,
  goTo,
  certShowsHost,
  restart,
} from "./whoiam";
import { freenet } from "./freenet";
import { durable } from "./durable.ts";
import { CHAT_REACTIONS } from "./logfold";
import { analyzeImageFile, analyzeTextContent, personalDataIn, type ImageModerationResult } from "./moderation";
import { renderIcon, type IconName } from "./icons";
import { safeStorage } from "./storage";
import { FEED_BUDGET, FEED_SHOW, FEED_TARGET, feedBytes, formatBytes, oldestToFree } from "./feedsize";
import { generateDefaultAvatar, compressAvatarFile, compressPostImageFile } from "./avatar";
import type {
  Post,
  Comment,
  PostCategory,
  UserIdentity,
  ProfileInfo,
  ChatMessage,
  NotificationItem,
  Community,
  PrivateRoom,
} from "./types.ts";
import { initSupporterPanel, renderSupporterStatus } from "./supporterPanel.ts";
import { initGreenhouse, openGreenhouse } from "./greenhousePage.ts";
import { foldSupporters, getStoredReceipt } from "./supporter.ts";
import { verifiedGhostkeys } from "./ghostkey.ts";
import { savedPosts, toggleSaved, isSaved } from "./savedPosts.ts";
import { likers, RADICA_MAINTAINER } from "./types.ts";
import { isFuture, sortPosts, type FeedSort } from "./topPosts.ts";
import { splitNotifs } from "./notifTrust.ts";
import { GONE_MESSAGE, whyGone } from "./postGone.ts";
import { WebOfTrust, type TrustBadgeInfo } from "./wot.ts";
import { solvePoW, COMMENT_POW_BITS, POST_POW_BITS, POST_POW_SINCE, postHasPow, type PoWProof } from "./pow.ts";
import { METRIC_LABELS, countsOf, nextUp, reached, type Counts } from "./milestones.ts";
import { growRoots } from "./rootsfx.ts";
import { fillFreetunes, freetunesCard, freetunesProfileCard, fillFreetunesProfile, localFreetunesArtist, localFreetunesReleases } from "./freetunes.ts";
import { createPoll, fillFreepolls, freepollsCard, freepollsLink, type PollNet } from "./freepolls.ts";
import { keepMedia, dataUrlBytes, mediaRef, mediaUrl, mediaUris } from "./media.ts";
import { playVideo, prepareVideo, publishVideo, videoPosterUrl, videoRef } from "./video.ts";
import { LANGS, READER_LANG_KEY, availableLangs, readerLang, translatableFrom, translateText } from "./translate.ts";
import { openGifPicker } from "./gifPicker.ts";
import { draftTranslateHtml, initDraftTranslate } from "./composeTranslate.ts";
import { yieldToMain } from "./limit.ts";
import { playPopSound, isSoundEnabled, toggleSoundEnabled } from "./sound.ts";
import { startVersionCheck } from "./versionCheck.ts";

let currentIdentity: UserIdentity | null = null;
let currentProfile: ProfileInfo | null = null;
let currentCategory: "all" | "poll" | PostCategory = "all"; // "poll" is a format, not a category: a post whose text links a poll
let activeComposerType: PostCategory = "thought";
let timelinePosts: Post[] = [];
let followingKeys: string[] = [];
let activeChatPeer: string | null = null;
let activeChatCommunity: Community | null = null;
let activeChatPrivateRoom: PrivateRoom | null = null;
let activeChatSecret = false;
let allCommunities: Community[] = [];
let allPrivateRooms: PrivateRoom[] = [];
let activeCommunity: Community | null = null;

const POSTS_PER_PAGE = 20;
let visiblePosts = POSTS_PER_PAGE;
let lastPageKey = "";
let activeTagFilter: string | null = null;
let searchQuery: string = "";
let currentFeedSort: FeedSort = "recent";
let currentFeedScope: "explore" | "following" | "myposts" | "saved" = "explore";
let feedAuthor: string | null = null; // "myposts" showing someone else's posts (opened from their profile)
let currentMediaNsfw = false;
// the scanner misreads pale animals and faces (seal 70%, ferret 71%, a clothed face 53%): 50-80% posts blurred, 80%+ is refused
const NSFW_SENSITIVE = 0.5;
const NSFW_BLOCK = 0.8;
let currentMediaNsfwScore = 0;
/** A moment video, scanned and encoded, waiting for "Plant post". */
let stagedVideo: Uint8Array | null = null;
let stagedVideoPoster: Blob | null = null;

// Non-blocking toast notification helper
function showToast(message: string, type: "info" | "warning" | "error" = "info", duration = 3500) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// Theme Elements
const themeToggleBtn = document.getElementById("theme-toggle-btn") as HTMLButtonElement | null;
const themeIcon = document.getElementById("theme-icon") as HTMLElement | null;

// Identity & Key Management Elements
const openIdentityBtn = document.getElementById("open-identity-btn") as HTMLButtonElement | null;
const identityModal = document.getElementById("identity-modal") as HTMLElement;
const identityCloseBtn = document.getElementById("identity-close-btn") as HTMLButtonElement;
const identityTypeBadge = document.getElementById("identity-type-badge") as HTMLElement;
const identityPersonaName = document.getElementById("identity-persona-name") as HTMLElement;
const identityPubkeyVal = document.getElementById("identity-pubkey-val") as HTMLElement;
const identityBackupActions = document.getElementById("identity-backup-actions") as HTMLElement;
const identityVisoActions = document.getElementById("identity-viso-actions") as HTMLElement;
const idShowKeyBtn = document.getElementById("id-show-key-btn") as HTMLButtonElement;
const idDownloadKeyBtn = document.getElementById("id-download-key-btn") as HTMLButtonElement;
const idSecretKeyDisplay = document.getElementById("id-secret-key-display") as HTMLElement;
const idSignoutBtn = document.getElementById("id-signout-btn") as HTMLButtonElement;
const idVisoSignoutBtn = document.getElementById("id-viso-signout-btn") as HTMLButtonElement;
const visoUrlInput = document.getElementById("viso-url-input") as HTMLInputElement;
const visoSigninBtn = document.getElementById("viso-signin-btn") as HTMLButtonElement;
const visoUseOfficialBtn = document.getElementById("viso-use-official-btn") as HTMLButtonElement;
const visoStatusMsg = document.getElementById("viso-status-msg") as HTMLElement;
const createNewKeyBtn = document.getElementById("create-new-key-btn") as HTMLButtonElement;
const localCreateMsg = document.getElementById("local-create-msg") as HTMLElement;
const importKeyInput = document.getElementById("import-key-input") as HTMLInputElement;
const importKeyBtn = document.getElementById("import-key-btn") as HTMLButtonElement;
const localImportMsg = document.getElementById("local-import-msg") as HTMLElement;

// Navbar Elements
const freenetDot = document.getElementById("freenet-dot") as HTMLElement;
const freenetStatusLabel = document.getElementById("freenet-status-label") as HTMLElement;
const myPubkeyBadge = document.getElementById("my-pubkey-badge") as HTMLElement;
const openChatBtn = document.getElementById("open-chat-btn") as HTMLButtonElement;
const openNotifsBtn = document.getElementById("open-notifs-btn") as HTMLButtonElement;
const notifBadge = document.getElementById("notif-badge") as HTMLElement;
const feedSearchInput = document.getElementById("feed-search-input") as HTMLInputElement;

// Sidebar Elements
const sidebarName = document.getElementById("sidebar-name") as HTMLElement;
const sidebarBio = document.getElementById("sidebar-bio") as HTMLElement;
const sidebarHandle = document.getElementById("sidebar-handle") as HTMLElement | null;
const sidebarAvatar = document.getElementById("sidebar-avatar") as HTMLImageElement;
const sidebarStatMyPosts = document.getElementById("sidebar-stat-myposts") as HTMLButtonElement | null;
const sidebarMyPostsCount = document.getElementById("sidebar-my-posts-count") as HTMLElement | null;
const sidebarMyFollowingCount = document.getElementById("sidebar-my-following-count") as HTMLElement | null;
const postsContainer = document.getElementById("posts-container") as HTMLElement;
const editProfileBtn = document.getElementById("edit-profile-btn") as HTMLButtonElement;
const followingCount = document.getElementById("following-count") as HTMLElement;
const followForm = document.getElementById("follow-form") as HTMLFormElement;
const followPubkeyInput = document.getElementById("follow-pubkey-input") as HTMLInputElement;
const followingList = document.getElementById("following-list") as HTMLElement;
const discoveredPeersList = document.getElementById("discovered-peers-list") as HTMLElement;
const followersList = document.getElementById("followers-list") as HTMLElement;
followersList?.addEventListener("click", (e) => {
  const pk = (e.target as HTMLElement).closest<HTMLElement>(".author-clickable")?.dataset.author;
  if (pk) openUserProfile(pk);
});
const communitiesList = document.getElementById("communities-list") as HTMLElement;
const findCommInput = document.getElementById("find-comm-input") as HTMLInputElement;
const commSortSelect = document.getElementById("comm-sort-select") as HTMLSelectElement;

// Main Feed & Filter Banners
const scopeExploreBtn = document.getElementById("scope-explore-btn") as HTMLButtonElement;
const scopeFollowingBtn = document.getElementById("scope-following-btn") as HTMLButtonElement;
const scopeFollowingCount = document.getElementById("scope-following-count") as HTMLElement;
const scopeMyPostsBtn = document.getElementById("scope-myposts-btn") as HTMLButtonElement;
const scopeMyPostsCount = document.getElementById("scope-myposts-count") as HTMLElement;
const scopeSavedBtn = document.getElementById("scope-saved-btn") as HTMLButtonElement;

const activeFilterBanner = document.getElementById("active-filter-banner") as HTMLElement;
const activeFilterTag = document.getElementById("active-filter-tag") as HTMLElement;
const clearFilterBtn = document.getElementById("clear-filter-btn") as HTMLButtonElement;

const communityHeaderBanner = document.getElementById("community-header-banner") as HTMLElement;
const commBannerSlug = document.getElementById("comm-banner-slug") as HTMLElement;
const commBannerDesc = document.getElementById("comm-banner-desc") as HTMLElement;
const commRoleBadge = document.getElementById("comm-role-badge") as HTMLElement;
const commHideBtn = document.getElementById("comm-hide-btn") as HTMLButtonElement;
const commMembersCount = document.getElementById("comm-members-count") as HTMLElement;
const commModsCount = document.getElementById("comm-mods-count") as HTMLElement;
const commJoinBtn = document.getElementById("comm-join-btn") as HTMLButtonElement;
const commChatBtn = document.getElementById("comm-chat-btn") as HTMLButtonElement | null;
const commModBtn = document.getElementById("comm-mod-btn") as HTMLButtonElement;
const commEditBtn = document.getElementById("comm-edit-btn") as HTMLButtonElement;
const commBannerName = document.getElementById("comm-banner-name") as HTMLElement;
const commExitBtn = document.getElementById("comm-exit-btn") as HTMLButtonElement;

// Composer Elements
const composerCommunitySelect = document.getElementById("composer-community-select") as HTMLSelectElement;
const postCaption = document.getElementById("post-caption") as HTMLTextAreaElement;
const momentFields = document.getElementById("moment-fields") as HTMLElement;
const eventFields = document.getElementById("event-fields") as HTMLElement;
const postFilePicker = document.getElementById("post-file-picker") as HTMLInputElement;
const postMediaUrl = document.getElementById("post-media-url") as HTMLInputElement;
const imagePreviewContainer = document.getElementById("image-preview-container") as HTMLElement;
const imagePreview = document.getElementById("image-preview") as HTMLImageElement;
const clearImageBtn = document.getElementById("clear-image-btn") as HTMLButtonElement;
const imagePreviewExtra = document.getElementById("image-preview-extra") as HTMLElement;
const MAX_CAROUSEL = 10;
/** The carousel's images after the first (which sits in postMediaUrl), as compressed data: URIs. */
let extraMedia: string[] = [];
function setExtraMedia(list: string[]) {
  extraMedia = list;
  imagePreviewExtra.innerHTML = list.map((u) => `<img src="${safeUrl(u)}" alt="" style="max-height: 80px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border);" />`).join("");
}
const moderationStatus = document.getElementById("moderation-status") as HTMLElement;
const moderationBadgeText = document.getElementById("moderation-badge-text") as HTMLElement;
const nsfwManualToggle = document.getElementById("nsfw-manual-toggle") as HTMLInputElement | null;
const postLocation = document.getElementById("post-location") as HTMLInputElement;
const postEventDate = document.getElementById("post-event-date") as HTMLInputElement;
const publishBtn = document.getElementById("publish-btn") as HTMLButtonElement;

// Category counter badges
const countAll = document.getElementById("count-all") as HTMLElement;
const countThought = document.getElementById("count-thought") as HTMLElement;
const countMoment = document.getElementById("count-moment") as HTMLElement;
const countEvent = document.getElementById("count-event") as HTMLElement;
const countPoll = document.getElementById("count-poll") as HTMLElement;

// Edit Profile Modal
const profileModal = document.getElementById("profile-modal") as HTMLElement;
const modalAvatarPreview = document.getElementById("modal-avatar-preview") as HTMLImageElement;
const modalAvatarFileInput = document.getElementById("modal-avatar-file-input") as HTMLInputElement;
const modalAvatarResetBtn = document.getElementById("modal-avatar-reset-btn") as HTMLButtonElement;
const modalNameInput = document.getElementById("modal-name-input") as HTMLInputElement;
const modalBioInput = document.getElementById("modal-bio-input") as HTMLTextAreaElement;
const modalDeltaInput = document.getElementById("modal-delta-input") as HTMLInputElement;
const modalOrtoInput = document.getElementById("modal-orto-input") as HTMLInputElement;
const modalAsocialInput = document.getElementById("modal-asocial-input") as HTMLInputElement;
const modalFreetunesInput = document.getElementById("modal-freetunes-input") as HTMLInputElement;
const modalFhInput = document.getElementById("modal-fh-input") as HTMLInputElement;
const modalFreetreeInput = document.getElementById("modal-freetree-input") as HTMLInputElement;
const modalAvatarInput = document.getElementById("modal-avatar-input") as HTMLInputElement;
const modalCancelBtn = document.getElementById("modal-cancel-btn") as HTMLButtonElement;
const modalSaveBtn = document.getElementById("modal-save-btn") as HTMLButtonElement;

// User Profile View Modal
const userProfileModal = document.getElementById("user-profile-modal") as HTMLElement;
const uviewAvatar = document.getElementById("uview-avatar") as HTMLImageElement;
const uviewName = document.getElementById("uview-name") as HTMLElement;
const uviewKey = document.getElementById("uview-key") as HTMLElement;
const uviewBio = document.getElementById("uview-bio") as HTMLElement;
const uviewFollowBtn = document.getElementById("uview-follow-btn") as HTMLButtonElement;
const uviewTalkBtn = document.getElementById("uview-talk-btn") as HTMLButtonElement;
const uviewHideBtn = document.getElementById("uview-hide-btn") as HTMLButtonElement;

// Authors I hid: only on this device, their posts vanish from every feed here.
const HIDDEN_KEY = "radica_hidden_users";
function hiddenUsers(): string[] {
  try {
    const list = JSON.parse(safeStorage.getItem(HIDDEN_KEY) || "[]");
    return Array.isArray(list) ? list.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}
function setUserHidden(pubkey: string, hide: boolean): void {
  const rest = hiddenUsers().filter((k) => k !== pubkey);
  saveList(HIDDEN_KEY, hide ? [...rest, pubkey] : rest);
}
// durable keys (durable.ts): the node keeps a copy, a browser refresh does not lose them
function saveList(key: string, list: string[]): void {
  safeStorage.setItem(key, JSON.stringify(list));
}
// shortcut: reads the per-feature entries used before durable.ts (one release only); delete with the next release
const listsFromNode = Promise.all(
  [HIDDEN_KEY, "radica_trusted_blocklists"].map(async (key) => {
    if (safeStorage.getItem(key)) return;
    const saved = await import("./delegate.ts").then((m) => m.nodeGet(key), () => null);
    if (saved) safeStorage.setItem(key, saved);
  }),
);
const WOT_MODERATION_KEY = "radica_wot_moderation";
function isWotModerationEnabled(): boolean {
  return safeStorage.getItem(WOT_MODERATION_KEY) !== "false";
}
function setWotModerationEnabled(enabled: boolean): void {
  safeStorage.setItem(WOT_MODERATION_KEY, enabled ? "true" : "false");
  renderTimeline();
}

const revealedWotPosts = new Set<string>();

let cachedWot: WebOfTrust | null = null;
let lastWotKey = "";
/** Verified supporters: those on the public supporters wall, plus me when I hold a receipt. */
let supporterKeys: string[] = [];
/** People a checked GhostKey proof vouches for (the ghostkeys log), plus me when I hold one. */
let ghostkeyKeys: string[] = [];
const ghostkeyKey = (pk: string) => `radica_ghostkey_${pk}`;
function getWebOfTrust(): WebOfTrust {
  const me = currentIdentity?.pubkey ?? "";
  const trusted = trustedCurators();
  const key = `${me}|${followingKeys.join(",")}|${trusted.join(",")}|${supporterKeys.join(",")}|${ghostkeyKeys.join(",")}`;
  if (cachedWot && lastWotKey === key) return cachedWot;
  lastWotKey = key;
  cachedWot = new WebOfTrust(me, followingKeys, trusted, (pk) => freenet.followingOf(pk), supporterKeys, ghostkeyKeys);
  return cachedWot;
}
/** A newcomer's comment without its anti-bot proof, likely written by a script around Radica: not shown. */
function unprovenComment(c: Comment, wot: WebOfTrust): boolean {
  return c.timestamp >= POST_POW_SINCE && c.author !== currentIdentity?.pubkey && wot.trustTier(c.author) === 0 && !postHasPow(c, COMMENT_POW_BITS, "comment");
}

/** Trusted by every reader (on the public supporters wall, or with a published GhostKey proof): my posts need no anti-bot proof. */
let vouchedForAll = false;

async function refreshSupporters() {
  const wall = await foldSupporters(freenet.supporterTokens()); // every receipt is checked against the attester's key
  const me = currentIdentity?.pubkey;
  vouchedForAll = !!me && ([...wall.oak, ...wall.root, ...wall.sprout].includes(me) || !!safeStorage.getItem(ghostkeyKey(me)));
  const next = [...new Set([...wall.oak, ...wall.root, ...wall.sprout, ...(me && getStoredReceipt(me) ? [me] : [])])].sort();
  // GhostKey proofs: checked in ghostkey.wasm (certificate chain to the Freenet master key), each once per page
  const ghosts = [...new Set([...(await verifiedGhostkeys(freenet.ghostkeyBundles())), ...(me && safeStorage.getItem(ghostkeyKey(me)) ? [me] : [])])].sort();
  if (next.join(",") === supporterKeys.join(",") && ghosts.join(",") === ghostkeyKeys.join(",")) return;
  supporterKeys = next;
  ghostkeyKeys = ghosts;
  cardCache.clear(); // badges are part of each card
  renderTimeline();
}

// Curators whose public blocklist I follow: whoever they block, and the posts they report, are hidden for me too.
const TRUSTED_KEY = "radica_trusted_blocklists";
/** Radica's maintainer: trusted until the user stops trusting them in Blocklists. */
const DEFAULT_CURATOR = RADICA_MAINTAINER;
/**
 * Whether my newcomer limits (anti-bot PoW, 15 s between posts, trusted-only communities) are lifted: someone I trust
 * follows me, or I hold a supporter receipt.
 */
function amVouched(): boolean {
  const me = currentIdentity?.pubkey;
  return !!me && (!!getStoredReceipt(me) || !!safeStorage.getItem(ghostkeyKey(me)) || getWebOfTrust().vouches(me, freenet.followersOf(me)));
}

let cachedTrustedRaw: string | null | undefined;
let cachedTrustedList: string[] = [];
function trustedCurators(): string[] {
  const raw = safeStorage.getItem(TRUSTED_KEY);
  if (raw === cachedTrustedRaw) return cachedTrustedList;
  cachedTrustedRaw = raw;
  try {
    const list = JSON.parse(raw ?? JSON.stringify([DEFAULT_CURATOR]));
    cachedTrustedList = Array.isArray(list) ? list.filter((k) => typeof k === "string") : [];
  } catch {
    cachedTrustedList = [];
  }
  return cachedTrustedList;
}
function setCuratorTrusted(pubkey: string, trust: boolean): void {
  const rest = trustedCurators().filter((k) => k !== pubkey);
  saveList(TRUSTED_KEY, trust ? [...rest, pubkey] : rest);
}
/** Whose reports and blocks apply to me: the curators I trust, and, while I trust the maintainer, the global
 *  moderators the maintainer named (one level: a moderator's own picks do not count). */
function moderationCurators(): string[] {
  const trusted = trustedCurators();
  return trusted.includes(DEFAULT_CURATOR) ? [...new Set([...trusted, ...freenet.modsOf(DEFAULT_CURATOR)])] : trusted;
}
/** I may remove posts and comments for everyone who follows Radica's moderation. */
function amGlobalMod(): boolean {
  const me = currentIdentity?.pubkey;
  return !!me && (me === DEFAULT_CURATOR || freenet.modsOf(DEFAULT_CURATOR).has(me));
}
/** Communities hidden for me: by my own list and by the lists I follow (Radica's moderators included): id -> reason. */
function hiddenCommunityIds(): Map<string, string> {
  const out = new Map<string, string>();
  const me = currentIdentity?.pubkey;
  for (const c of new Set([...moderationCurators(), ...(me ? [me] : [])])) for (const [id, why] of freenet.hiddenCommunitiesBy(c)) out.set(id, why);
  return out;
}
/** The communities that are not hidden for me. */
async function loadCommunities(): Promise<Community[]> {
  const hidden = hiddenCommunityIds();
  return (await freenet.getCommunities()).filter((c) => !hidden.has(c.id));
}
let hiddenCommsSig = "";
function isHiddenAuthor(pubkey: string): boolean {
  const me = currentIdentity?.pubkey;
  return (
    hiddenUsers().includes(pubkey) ||
    (me ? freenet.blockedBy(me).has(pubkey) : false) ||
    moderationCurators().some((c) => freenet.blockedBy(c).has(pubkey))
  );
}
let blocklistFlushTimer = 0;
function refreshTrustedBlocklists(seen = new Set<string>()): void {
  const me = currentIdentity?.pubkey;
  // my own list too: a new session starts with no copy of it
  for (const c of new Set([...moderationCurators(), ...(me ? [me] : [])])) {
    if (seen.has(c)) continue;
    seen.add(c);
    void freenet.refreshLog(`blocklist/${c}`).then(() => {
      if (c === DEFAULT_CURATOR) refreshTrustedBlocklists(seen); // it may name new moderators
      if (blocklistFlushTimer) return;
      blocklistFlushTimer = window.setTimeout(() => {
        blocklistFlushTimer = 0;
        paintModButton();
        if (amGlobalMod()) {
          void freenet.refreshLog("reports").then(() => updateBlocklistsBadge());
          if (isOpen(blocklistsModal) && paneModeration?.style.display !== "none") renderModDashboard();
        }
        renderTimeline();
        const sig = [...hiddenCommunityIds().keys()].sort().join(",");
        if (sig !== hiddenCommsSig) {
          hiddenCommsSig = sig; // a list I follow hid or showed a community: redraw the lists
          void loadCommunities().then((list) => {
            allCommunities = list;
            renderCommunities();
          });
        }
        if (isOpen(blocklistsModal) && paneBlocklists?.style.display !== "none") renderBlocklists(); // not behind the Moderation tab
      }, 0);
    });
  }
}
function hideButtonHtml(hidden: boolean): string {
  return `<span class="btn-icon-text">${renderIcon(hidden ? "eye" : "ban", { className: "icon-xs" })} <span>${hidden ? "Unhide" : "Hide user"}</span></span>`;
}
const uviewBlockBtn = document.getElementById("uview-block-btn") as HTMLButtonElement;
const uviewTrustBtn = document.getElementById("uview-trust-btn") as HTMLButtonElement;
const uviewModBtn = document.getElementById("uview-mod-btn") as HTMLButtonElement;
const uviewPostsGallery = document.getElementById("uview-posts-gallery") as HTMLElement;
const uviewCloseBtn = document.getElementById("uview-close-btn") as HTMLButtonElement;

// Chat Modal Elements
const chatModal = document.getElementById("chat-modal") as HTMLElement;
const chatBody = document.getElementById("chat-body") as HTMLElement | null;
const chatPeerInfo = document.getElementById("chat-peer-info") as HTMLElement;
const chatCommunitiesList = document.getElementById("chat-communities-list") as HTMLElement;
const chatSecretList = document.getElementById("chat-secret-list") as HTMLElement | null;
const chatPeersList = document.getElementById("chat-peers-list") as HTMLElement;
const newSecretChatBtn = document.getElementById("new-secret-chat-btn") as HTMLButtonElement | null;
const newDirectChatBtn = document.getElementById("new-direct-chat-btn") as HTMLButtonElement | null;
const chatTtlBtn = document.getElementById("chat-ttl-btn") as HTMLButtonElement | null;
const chatClassicTypingBar = document.getElementById("chat-classic-typing-bar") as HTMLElement | null;
const chatClassicTypingText = document.getElementById("chat-classic-typing-text") as HTMLElement | null;
const chatMessagesList = document.getElementById("chat-messages-list") as HTMLElement;
const chatSendForm = document.getElementById("chat-send-form") as HTMLFormElement;
const chatMessageInput = document.getElementById("chat-message-input") as HTMLTextAreaElement;
// the message box grows with what is written (CSS caps it, then it scrolls); Enter sends, Shift+Enter starts a new line
const fitChatInput = () => {
  chatMessageInput.style.height = "auto";
  chatMessageInput.style.height = `${chatMessageInput.scrollHeight}px`;
  const openId = openRoomId();
  if (openId) conversation.localTyping(openId);
};
chatMessageInput.addEventListener("input", fitChatInput);
chatMessageInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
  e.preventDefault();
  chatSendForm.requestSubmit();
});
const chatReplyBar = document.getElementById("chat-reply-bar") as HTMLElement;
const chatReplyText = document.getElementById("chat-reply-text") as HTMLElement;
const chatReplyCancel = document.getElementById("chat-reply-cancel") as HTMLButtonElement;
const chatCloseBtn = document.getElementById("chat-close-btn") as HTMLButtonElement;
const chatClearBtn = document.getElementById("chat-clear-btn") as HTMLButtonElement;
const chatInviteBtn = document.getElementById("chat-invite-btn") as HTMLButtonElement | null;
const chatParticipantsToggleBtn = document.getElementById("chat-participants-toggle-btn") as HTMLButtonElement | null;
const chatParticipantsHeaderCount = document.getElementById("chat-participants-header-count") as HTMLElement | null;
const chatParticipantsSidebar = document.getElementById("chat-participants-sidebar") as HTMLElement | null;
const chatParticipantsTitle = document.getElementById("chat-participants-title") as HTMLElement | null;
const chatParticipantsCount = document.getElementById("chat-participants-count") as HTMLElement | null;
const chatParticipantsList = document.getElementById("chat-participants-list") as HTMLElement | null;
const chatPrivateRoomsList = document.getElementById("chat-private-rooms-list") as HTMLElement | null;
const newPrivateRoomBtn = document.getElementById("new-private-room-btn") as HTMLButtonElement | null;
const chatChannelsList = document.getElementById("chat-channels-list") as HTMLElement | null;
const newChannelBtn = document.getElementById("new-channel-btn") as HTMLButtonElement | null;
const chatSearchBtn = document.getElementById("chat-search-btn") as HTMLButtonElement | null;
const chatSafetyBtn = document.getElementById("chat-safety-btn") as HTMLButtonElement | null;
const chatThreadSearchBar = document.getElementById("chat-thread-search-bar") as HTMLElement | null;
const chatThreadSearchInput = document.getElementById("chat-thread-search-input") as HTMLInputElement | null;
const chatThreadSearchClose = document.getElementById("chat-thread-search-close") as HTMLButtonElement | null;
const chatMediaStage = document.getElementById("chat-media-stage") as HTMLElement | null;
const chatMediaStagePreview = document.getElementById("chat-media-stage-preview") as HTMLElement | null;
const chatMediaStageLabel = document.getElementById("chat-media-stage-label") as HTMLElement | null;
const chatMediaStageCancel = document.getElementById("chat-media-stage-cancel") as HTMLButtonElement | null;
const chatFileImage = document.getElementById("chat-file-image") as HTMLInputElement | null;
const chatFileAudio = document.getElementById("chat-file-audio") as HTMLInputElement | null;
const chatFileDoc = document.getElementById("chat-file-doc") as HTMLInputElement | null;
const chatAttachMenu = document.getElementById("chat-attach-menu") as HTMLElement | null;
const chatBtnAttach = document.getElementById("chat-btn-attach") as HTMLButtonElement | null;
const chatAttachRoomLink = document.getElementById("chat-attach-room-link") as HTMLElement | null;
const chatPinBtn = document.getElementById("chat-pin-btn") as HTMLButtonElement | null;
const chatPinIcon = document.getElementById("chat-pin-icon") as HTMLElement | null;
const chatPinLabel = document.getElementById("chat-pin-label") as HTMLElement | null;

function getActiveChatConvKey(): string | null {
  if (activeChatPrivateRoom) return `priv:${activeChatPrivateRoom.id}`;
  if (activeChatCommunity) return `comm:${activeChatCommunity.id}`;
  if (activeChatPeer) return `${activeChatSecret ? "secret" : "dm"}:${activeChatPeer}`;
  return null;
}

function getPinnedSet(): Set<string> {
  const me = currentIdentity?.pubkey;
  if (!me) return new Set();
  try {
    const list = JSON.parse(safeStorage.getItem(`radica_pinned_chats_${me}`) || "[]");
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function updateChatPinBtnUI() {
  if (!chatPinBtn) return;
  const key = getActiveChatConvKey();
  if (!key) {
    chatPinBtn.style.display = "none";
    return;
  }
  chatPinBtn.style.display = "inline-flex";
  const pinned = getPinnedSet().has(key);
  if (chatPinIcon) chatPinIcon.textContent = pinned ? "📌" : "📍";
  if (chatPinLabel) chatPinLabel.textContent = pinned ? "Pinned" : "Pin";
  chatPinBtn.title = pinned ? "Unpin this conversation" : "Pin this conversation to top";
  chatPinBtn.classList.toggle("btn-active", pinned);
}

chatPinBtn?.addEventListener("click", () => {
  const key = getActiveChatConvKey();
  const me = currentIdentity?.pubkey;
  if (!key || !me) return;
  const pins = getPinnedSet();
  const isPinned = pins.has(key);
  if (isPinned) pins.delete(key);
  else pins.add(key);
  safeStorage.setItem(`radica_pinned_chats_${me}`, JSON.stringify([...pins]));
  safeStorage.flush();
  updateChatPinBtnUI();
  void renderChatSidebar();
  void messengerChat.refreshInbox();
  showToast(isPinned ? "Conversation unpinned" : "Conversation pinned to top 📌", "info");
});

// Share Post & Freenet Info Modal Elements
const sharePostModal = document.getElementById("share-post-modal") as HTMLElement | null;
const sharePostCloseBtn = document.getElementById("share-post-close-btn") as HTMLButtonElement | null;
const sharePostDoneBtn = document.getElementById("share-post-done-btn") as HTMLButtonElement | null;
const sharePostSnippet = document.getElementById("share-post-snippet") as HTMLElement | null;
const sharePostLinkInput = document.getElementById("share-post-link-input") as HTMLInputElement | null;
const sharePostCopyBtn = document.getElementById("share-post-copy-btn") as HTMLButtonElement | null;
const sharePostAuthor = document.getElementById("share-post-author") as HTMLElement | null;
const sharePostCopyAuthor = document.getElementById("share-post-copy-author") as HTMLButtonElement | null;
const sharePostFeedId = document.getElementById("share-post-feed-id") as HTMLElement | null;
const sharePostFreenetUri = document.getElementById("share-post-freenet-uri") as HTMLElement | null;
const sharePostCopyFreenetUri = document.getElementById("share-post-copy-freenet-uri") as HTMLButtonElement | null;
const sharePostMediaRow = document.getElementById("share-post-media-row") as HTMLElement | null;
const sharePostMediaUri = document.getElementById("share-post-media-uri") as HTMLElement | null;
const sharePostCopyMedia = document.getElementById("share-post-copy-media") as HTMLButtonElement | null;
const sharePostNativeBtn = document.getElementById("share-post-native-btn") as HTMLButtonElement | null;

// Create Private Room Modal Elements
const createPrivateRoomModal = document.getElementById("create-private-room-modal") as HTMLElement | null;
const createPrivroomCloseBtn = document.getElementById("create-privroom-close-btn") as HTMLButtonElement | null;
const createPrivroomCancelBtn = document.getElementById("create-privroom-cancel-btn") as HTMLButtonElement | null;
const createPrivroomSubmitBtn = document.getElementById("create-privroom-submit-btn") as HTMLButtonElement | null;
const privroomNameInput = document.getElementById("privroom-name-input") as HTMLInputElement | null;
const privroomNameLabel = document.getElementById("privroom-name-label") as HTMLElement | null;
const privroomTypeGroup = document.getElementById("privroom-type-group") as HTMLInputElement | null;
const privroomTypeChannel = document.getElementById("privroom-type-channel") as HTMLInputElement | null;
const privroomTypeGroupLabel = document.getElementById("privroom-type-group-label") as HTMLElement | null;
const privroomTypeChannelLabel = document.getElementById("privroom-type-channel-label") as HTMLElement | null;
const privroomChannelOptions = document.getElementById("privroom-channel-options") as HTMLElement | null;
const privroomLinkDiscussionCheck = document.getElementById("privroom-link-discussion-check") as HTMLInputElement | null;
const privroomPublicCheck = document.getElementById("privroom-public-check") as HTMLInputElement | null;
const privroomMembersInput = document.getElementById("privroom-members-input") as HTMLTextAreaElement | null;
const privroomQuickPick = document.getElementById("privroom-quick-pick") as HTMLElement | null;
const privroomAvatarPreview = document.getElementById("privroom-avatar-preview") as HTMLElement | null;
const privroomAvatarInput = document.getElementById("privroom-avatar-input") as HTMLInputElement | null;
const privroomAvatarRemoveBtn = document.getElementById("privroom-avatar-remove-btn") as HTMLButtonElement | null;
let privroomAvatarData: string | null = null;

// Invite Private Room Modal Elements
const invitePrivroomModal = document.getElementById("invite-privroom-modal") as HTMLElement | null;
const invitePrivroomCloseBtn = document.getElementById("invite-privroom-close-btn") as HTMLButtonElement | null;
const invitePrivroomCancelBtn = document.getElementById("invite-privroom-cancel-btn") as HTMLButtonElement | null;
const invitePrivroomSubmitBtn = document.getElementById("invite-privroom-submit-btn") as HTMLButtonElement | null;
const invitePrivroomKeyInput = document.getElementById("invite-privroom-key-input") as HTMLInputElement | null;
const invitePrivroomLinkInput = document.getElementById("invite-privroom-link-input") as HTMLInputElement | null;
const copyPrivroomLinkBtn = document.getElementById("copy-privroom-link-btn") as HTMLButtonElement | null;
const sharePrivroomLinkBtn = document.getElementById("share-privroom-link-btn") as HTMLButtonElement | null;
const copyLinkFeedback = document.getElementById("copy-link-feedback") as HTMLElement | null;

// Join Private Room Modal Elements
const joinPrivateRoomBtn = document.getElementById("join-private-room-btn") as HTMLButtonElement | null;
const joinPrivroomModal = document.getElementById("join-privroom-modal") as HTMLElement | null;
const joinPrivroomCloseBtn = document.getElementById("join-privroom-close-btn") as HTMLButtonElement | null;
const joinPrivroomCancelBtn = document.getElementById("join-privroom-cancel-btn") as HTMLButtonElement | null;
const joinPrivroomSubmitBtn = document.getElementById("join-privroom-submit-btn") as HTMLButtonElement | null;
const joinPrivroomInput = document.getElementById("join-privroom-input") as HTMLTextAreaElement | null;

installModalDismiss(); // Escape or a click outside closes the top popup
initShortcuts(); // Keyboard shortcuts across feed, posts, audio, and navigation

// "@" in the post box, comment box, or chat composer lists people I know of: those I follow first
attachMentionPicker("#post-caption, .comment-input, #chat-message-input, #rm-composer-input", (q) => {
  const me = currentIdentity?.pubkey;
  const query = q.toLowerCase();
  return Object.entries(freenet.knownPeers)
    .filter(([pk, p]) => pk !== me && p.display_name && !p.display_name.startsWith("Persona @") && p.display_name.toLowerCase().includes(query))
    .sort(([a], [b]) => Number(followingKeys.includes(b)) - Number(followingKeys.includes(a)))
    .map(([pubkey, p]) => ({ pubkey, name: p.display_name }));
});

// Notifications / Updates Modal Elements
const updatesModal = document.getElementById("updates-modal") as HTMLElement;
const updatesNewsTabBtn = document.getElementById("updates-tab-news-btn") as HTMLButtonElement | null;
const updatesEcoTabBtn = document.getElementById("updates-tab-eco-btn") as HTMLButtonElement | null;
const updatesNewsTabContent = document.getElementById("updates-news-tab-content") as HTMLElement | null;
const updatesEcoTabContent = document.getElementById("updates-eco-tab-content") as HTMLElement | null;
const updatesTeaserOpenEcoBtn = document.getElementById("updates-teaser-open-eco-btn") as HTMLButtonElement | null;
const updatesLoadMoreBtn = document.getElementById("updates-load-more-btn") as HTMLButtonElement | null;

const RECENT_UPDATES_LIMIT = 7;
let showingAllUpdates = false;

function renderUpdatesList(all: boolean) {
  const listEl = document.getElementById("updates-list");
  if (!listEl) return;
  const list = all ? UPDATES : UPDATES.slice(0, RECENT_UPDATES_LIMIT);
  listEl.innerHTML = list.map(
    (u) => `<div><strong>${escapeHtml(u.date)}</strong><div>${escapeHtml(u.text)}</div></div>`
  ).join("");
  if (updatesLoadMoreBtn) {
    if (all || UPDATES.length <= RECENT_UPDATES_LIMIT) {
      updatesLoadMoreBtn.style.display = "none";
    } else {
      updatesLoadMoreBtn.style.display = "";
      updatesLoadMoreBtn.textContent = `Show older updates (${UPDATES.length - RECENT_UPDATES_LIMIT} more)`;
    }
  }
}

function setUpdatesTab(tab: "news" | "eco") {
  if (updatesNewsTabBtn) updatesNewsTabBtn.classList.toggle("active", tab === "news");
  if (updatesEcoTabBtn) updatesEcoTabBtn.classList.toggle("active", tab === "eco");
  if (updatesNewsTabContent) updatesNewsTabContent.style.display = tab === "news" ? "" : "none";
  if (updatesEcoTabContent) updatesEcoTabContent.style.display = tab === "eco" ? "" : "none";
}

updatesNewsTabBtn?.addEventListener("click", () => setUpdatesTab("news"));
updatesEcoTabBtn?.addEventListener("click", () => setUpdatesTab("eco"));
updatesTeaserOpenEcoBtn?.addEventListener("click", () => setUpdatesTab("eco"));
updatesLoadMoreBtn?.addEventListener("click", () => {
  showingAllUpdates = true;
  renderUpdatesList(true);
});

document.getElementById("updates-open-btn")!.addEventListener("click", () => {
  showingAllUpdates = false;
  renderUpdatesList(false);
  setUpdatesTab("news");
  const ecoCard = document.getElementById("updates-ecosystem-card");
  if (ecoCard) {
    ecoCard.innerHTML = ecosystemCard(nodeOrigin());
    document.getElementById("eco-open-identity-support-btn")?.addEventListener("click", () => {
      updatesModal.style.display = "none";
      openIdentityBtn?.click();
      const supSec = document.getElementById("supporter-section");
      supSec?.scrollIntoView({ behavior: "smooth" });
    });
  }
  updatesModal.style.display = "flex";
});
document.getElementById("updates-close-btn")!.addEventListener("click", () => (updatesModal.style.display = "none"));
// Translate what I write, before publishing: the post composer here, comments and chat in their own markup
initDraftTranslate(showToast);
document.getElementById("poll-toggle-btn")?.insertAdjacentHTML("beforebegin", draftTranslateHtml("post-caption"));

// Phones: the secondary places open from More in the bottom bar; picking one, or tapping elsewhere, closes it
const rail = document.querySelector<HTMLElement>(".rail");
const railMoreBtn = document.getElementById("rail-more-btn");
const setRailMore = (on: boolean) => {
  rail?.classList.toggle("more-open", on);
  railMoreBtn?.setAttribute("aria-expanded", String(on));
};
railMoreBtn?.addEventListener("click", () => setRailMore(!rail?.classList.contains("more-open")));
document.getElementById("rail-more-group")?.addEventListener("click", (e) => (e.target as HTMLElement).closest(".rail-btn") && setRailMore(false));
document.addEventListener("pointerdown", (e) => !(e.target as HTMLElement).closest(".rail") && setRailMore(false));
document.addEventListener("keydown", (e) => e.key === "Escape" && setRailMore(false));

// Full screen on phones (an installed desktop app already has no address bar). Hidden where the gateway's frame forbids it.
const isMobileTextEntry = (el: Element | null): el is HTMLElement =>
  !!el &&
  el.matches(
    'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="color"])'
  );

let pickingFileUntil = 0;
export const isPickingFile = () => Date.now() < pickingFileUntil;
export const markPickingFile = (ms = 45000) => {
  pickingFileUntil = Date.now() + ms;
};
export const clearPickingFile = (delayMs = 1200) => {
  pickingFileUntil = Date.now() + delayMs;
};

document.addEventListener(
  "click",
  (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t.matches('input[type="file"]') || t.closest('input[type="file"], [data-attach="image"], [data-attach="audio"], [data-attach="file"]')) {
      markPickingFile(45000);
    }
  },
  true
);
document.addEventListener(
  "change",
  (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.matches('input[type="file"]')) {
      clearPickingFile(1500);
    }
  },
  true
);
document.addEventListener(
  "cancel",
  (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.matches('input[type="file"]')) {
      clearPickingFile(1200);
    }
  },
  true
);
window.addEventListener("focus", () => {
  if (isPickingFile()) {
    setTimeout(() => {
      pickingFileUntil = 0;
    }, 1500);
  }
});

let handleFullscreenBackExit: (() => void) | null = null;
const fullscreenBtn = document.getElementById("fullscreen-btn") as HTMLButtonElement | null;
if (fullscreenBtn && document.fullscreenEnabled && matchMedia("(pointer: coarse) and (max-width: 768px)").matches) {
  fullscreenBtn.style.display = "";
  const label = fullscreenBtn.querySelector("span")!;
  // full screen stays on until I press Exit full: Android's Back gesture only ends it, so that gesture becomes Radica's
  // own Back step, and the next tap brings full screen back (the browser allows it only from a tap)
  let wantFull = false;
  const enter = () => document.documentElement.requestFullscreen({ navigationUI: "hide" });
  document.addEventListener("fullscreenchange", () => {
    label.textContent = document.fullscreenElement ? "Exit full" : "Full screen";
    if (!document.fullscreenElement && wantFull && !document.hidden) {
      if (isPickingFile()) {
        const restoreFs = () => {
          window.removeEventListener("focus", restoreFs);
          if (wantFull && !document.fullscreenElement) {
            enter().catch(() => {});
          }
        };
        window.addEventListener("focus", restoreFs, { once: true });
        return;
      }
      handleFullscreenBackExit?.();
    }
  });
  const tryRestoreFullscreen = (e: Event) => {
    if (!wantFull || document.fullscreenElement || document.hidden) return;
    const t = e.target as HTMLElement | null;
    if (!t || t === fullscreenBtn || fullscreenBtn.contains(t)) return;
    if (isMobileTextEntry(t.closest("input, textarea, [contenteditable]")) || isMobileTextEntry(document.activeElement)) return;
    if (t.closest(".rm-composer-outer, #chat-send-form, .comment-form")) return;
    enter().catch(() => {});
  };
  document.addEventListener("click", tryRestoreFullscreen);
  fullscreenBtn.addEventListener("click", () => {
    wantFull = !document.fullscreenElement;
    (wantFull ? enter() : document.exitFullscreen()).catch((e) => {
      wantFull = false;
      showToast(`Full screen is not available here: ${e.message || e}`, "warning");
    });
  });
}

const greenhouseModal = document.getElementById("greenhouse-modal") as HTMLElement;
document.getElementById("greenhouse-open-btn")!.addEventListener("click", () => {
  greenhouseModal.style.display = "flex";
  void openGreenhouse();
});
document.getElementById("greenhouse-close-btn")!.addEventListener("click", () => (greenhouseModal.style.display = "none"));
document.getElementById("greenhouse-list")?.addEventListener("click", (e) => {
  const pk = (e.target as HTMLElement).closest<HTMLElement>(".author-clickable")?.dataset.author;
  if (pk) openUserProfile(pk);
});
const guideModal = document.getElementById("guide-modal") as HTMLElement;
document.getElementById("guide-open-btn")!.addEventListener("click", () => (guideModal.style.display = "flex"));
document.getElementById("guide-close-btn")!.addEventListener("click", () => (guideModal.style.display = "none"));

/** What I am writing in the composer, kept until I publish it (or empty it). */
const draftKey = (pk: string) => `radica_draft_${pk}`;
let draftTimer = 0;
postCaption.addEventListener("input", () => {
  clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    if (!currentIdentity) return;
    const text = postCaption.value;
    if (text.trim()) safeStorage.setItem(draftKey(currentIdentity.pubkey), text);
    else safeStorage.removeItem(draftKey(currentIdentity.pubkey));
  }, 400);
});

// ---- First steps: name, people to follow, first post. Shown once, to an identity still called "Persona @…" ----
const welcomeModal = document.getElementById("welcome-modal") as HTMLElement;
const welcomeDoneKey = (pk: string) => `radica_welcomed_${pk}`;
const hasDefaultName = () => !currentProfile?.display_name || currentProfile.display_name.startsWith("Persona @");

async function maybeShowWelcome() {
  await durable.ready; // "seen" may be on the node only: the sandboxed page storage does not outlive a session
  if (!currentIdentity || safeStorage.getItem(welcomeDoneKey(currentIdentity.pubkey)) || !hasDefaultName()) return;
  const nameInput = document.getElementById("welcome-name-input") as HTMLInputElement;
  nameInput.value = "";
  welcomeStep(1);
  welcomeModal.style.display = "flex";
  // signed in with Viso: the name the persona already has there is offered, unless something was typed meanwhile
  const pk = currentIdentity.pubkey;
  void freenet.visoProfile(pk).then((p) => {
    if (p?.name && !nameInput.value && currentIdentity?.pubkey === pk && welcomeModal.style.display !== "none") {
      nameInput.value = p.name;
      nameInput.title = "Your name in Viso";
    }
  });
}

function finishWelcome() {
  if (currentIdentity) safeStorage.setItem(welcomeDoneKey(currentIdentity.pubkey), "1");
  welcomeModal.style.display = "none";
}

function welcomeStep(n: number) {
  welcomeModal.querySelectorAll<HTMLElement>("section[data-step]").forEach((el) => (el.hidden = el.dataset.step !== String(n)));
  welcomeModal.querySelectorAll<HTMLElement>(".welcome-steps li").forEach((el) => el.classList.toggle("active", el.dataset.step === String(n)));
  if (n === 1) (document.getElementById("welcome-name-input") as HTMLInputElement).focus();
  if (n === 2) renderWelcomeSuggestions();
}

/** Named people this node has seen (Radica's maintainer first) and the biggest communities, each one click to follow or join. */
function renderWelcomeSuggestions() {
  const me = currentIdentity?.pubkey;
  if (!me) return;
  const named = (pk: string) => !!freenet.knownPeers[pk]?.display_name && !freenet.knownPeers[pk].display_name.startsWith("Persona @");
  const people = [RADICA_MAINTAINER, ...freenet.getDiscoveredPeers(me).map((p) => p.pubkey)]
    .filter((pk, i, all) => pk !== me && all.indexOf(pk) === i && !freenet.riverOnly.has(pk) && (pk === RADICA_MAINTAINER || named(pk)))
    .slice(0, 8);
  const comms = [...allCommunities].sort((a, b) => b.members.length - a.members.length).slice(0, 5);
  const row = (label: string, sub: string, btn: string) => `<div class="welcome-row"><div><b>${label}</b><span>${sub}</span></div>${btn}</div>`;
  const peopleHtml = people
    .map((pk) => {
      const on = followingKeys.includes(pk);
      return row(escapeHtml(named(pk) ? getAuthorDisplayName(pk) : "Radica"), pk === RADICA_MAINTAINER ? "Radica's maintainer" : "", `<button type="button" class="${on ? "btn-secondary" : "btn-primary"} btn-sm" data-welcome-follow="${escapeHtml(pk)}">${on ? "Following" : "Follow"}</button>`);
    })
    .join("");
  const commHtml = comms
    .map((c) => {
      const on = isJoined(c);
      return row(`r/${escapeHtml(c.slug)}`, `${c.members.length} members`, `<button type="button" class="${on ? "btn-secondary" : "btn-primary"} btn-sm" data-welcome-join="${escapeHtml(c.id)}">${on ? "Joined" : "Join"}</button>`);
    })
    .join("");
  document.getElementById("welcome-suggestions")!.innerHTML =
    `<h4>People</h4>${peopleHtml}` +
    (commHtml ? `<h4>Communities</h4>${commHtml}` : "") +
    (people.length < 3 ? `<p class="welcome-note">Your node is still reading the network: more people show up in Discover as it does.</p>` : "");
}

document.getElementById("welcome-skip-btn")!.addEventListener("click", finishWelcome);
document.getElementById("welcome-name-btn")!.addEventListener("click", async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  const name = (document.getElementById("welcome-name-input") as HTMLInputElement).value.trim();
  if (!currentIdentity) return;
  if (!name) return welcomeStep(2); // keeping "Persona @…" is allowed
  btn.disabled = true;
  try {
    applyProfile(await freenet.updateProfile(currentIdentity, name, currentProfile?.bio ?? "", currentProfile?.avatar_url ?? ""));
    welcomeStep(2);
  } catch (err) {
    showToast("Could not save your name: " + ((err as Error)?.message || String(err)), "error");
  } finally {
    btn.disabled = false;
  }
});
document.getElementById("welcome-name-input")!.addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter") document.getElementById("welcome-name-btn")!.click();
});
document.getElementById("welcome-suggestions")!.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-welcome-follow], [data-welcome-join]");
  if (!btn || !currentIdentity || btn.disabled) return;
  btn.disabled = true;
  try {
    if (btn.dataset.welcomeFollow) {
      const pk = btn.dataset.welcomeFollow;
      const on = await freenet.toggleFollow(currentIdentity, pk);
      followingKeys = on ? [...new Set([...followingKeys, pk])] : followingKeys.filter((k) => k !== pk);
      renderFollowingList();
    } else {
      await freenet.toggleJoinCommunity(currentIdentity, btn.dataset.welcomeJoin!);
      allCommunities = await loadCommunities();
      renderCommunities();
    }
  } catch (err) {
    showToast("Could not do that: " + ((err as Error)?.message || String(err)), "error");
  }
  renderWelcomeSuggestions();
});
document.getElementById("welcome-people-btn")!.addEventListener("click", () => {
  welcomeStep(3);
  void reloadPosts();
});
document.getElementById("welcome-post-btn")!.addEventListener("click", () => {
  finishWelcome();
  postCaption.placeholder = "Hello Radica! I'm here because…";
  setTimeout(() => postCaption.focus(), 50); // after the page closes and the feed scrolls back
});

// ---- Milestones (easter egg): five quick clicks on the "Radica" title ----
const milestonesModal = document.getElementById("milestones-modal") as HTMLElement;
const MS_SEEN = "radica_milestones_seen";
const networkCounts = (posts: Post[]): Counts =>
  countsOf(posts, allCommunities.length, Object.keys(freenet.knownPeers).length, freenet.knownPostCount(), freenet.hostedFeeds());
function renderMilestones(c: Counts) {
  const done = reached(c);
  const next = nextUp(c);
  document.getElementById("milestones-list")!.innerHTML =
    done.map((m) => `<li class="ms done"><span aria-hidden="true">🌱</span><span>${escapeHtml(m.text)}</span></li>`).join("") +
    next
      .map((m) => {
        const pct = Math.min(100, Math.round((c[m.metric] / m.at) * 100));
        return `<li class="ms next"><span>${c[m.metric].toLocaleString()} / ${m.at.toLocaleString()} ${METRIC_LABELS[m.metric]}</span><span class="ms-bar"><span style="width: ${pct}%"></span></span></li>`;
      })
      .join("") +
    `<li class="ms hidden">??? <span>more roots to grow</span></li>`;
  document.querySelectorAll<HTMLElement>("#milestones-list .ms").forEach((li, i) => li.style.setProperty("--i", String(i)));
}
let titleClicks: number[] = [];
document.querySelector(".feed-title")?.addEventListener("click", async () => {
  const now = Date.now();
  titleClicks = [...titleClicks.filter((t) => now - t < 2000), now];
  if (titleClicks.length < 5 || !currentIdentity) return;
  titleClicks = [];
  renderMilestones(networkCounts(await freenet.getExploreTimeline(currentIdentity)));
  milestonesModal.style.display = "flex";
  growRoots();
});
document.getElementById("milestones-close-btn")!.addEventListener("click", () => (milestonesModal.style.display = "none"));
// the milestones already announced, kept on the node too (page storage does not outlive a session in Freenet)
const msSeenOnNode = import("./delegate.ts").then((m) => m.nodeGet("milestones"), () => null).catch(() => null);
/** A cryptic hint when a milestone is reached; the very first count only takes note. */
async function checkMilestones(posts: Post[]) {
  const ids = reached(networkCounts(posts)).map((m) => m.id);
  let seen: string[] | null = null;
  try {
    seen = JSON.parse(safeStorage.getItem(MS_SEEN) ?? (await msSeenOnNode) ?? "null");
  } catch {}
  const fresh = ids.filter((id) => !seen?.includes(id));
  if (seen && fresh.length) {
    showToast("Something grew in the roots… 🌱", "info", 5000);
    growRoots();
  }
  if (!seen || fresh.length) {
    const all = JSON.stringify([...(seen ?? []), ...fresh]);
    safeStorage.setItem(MS_SEEN, all);
    void import("./delegate.ts").then((m) => m.nodePut("milestones", all), () => {});
  }
}
// Click a post or comment picture to see it at full size.
document.addEventListener("click", (e) => {
  const img = (e.target as HTMLElement).closest(".gram-media img, .uview-post-thumb img, .comment-media img") as HTMLImageElement | null;
  if (!img || img.closest(".nsfw-shielded:not(.revealed)")) return;
  const box = document.createElement("div");
  box.className = "lightbox";
  box.innerHTML = `<img src="${safeUrl(img.src)}" alt="Post media" />`;
  const close = () => {
    box.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && close();
  box.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(box);
});
const blocklistsModal = document.getElementById("blocklists-modal") as HTMLElement;
function renderBlocklists() {
  const me = currentIdentity!.pubkey;
  const wotToggle = document.getElementById("wot-moderation-toggle") as HTMLInputElement | null;
  if (wotToggle) {
    wotToggle.checked = isWotModerationEnabled();
    wotToggle.onchange = () => setWotModerationEnabled(wotToggle.checked);
  }
  const row = (pk: string, note: string, action: string) =>
    `<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;"><span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;" data-act="profile" data-author="${escapeHtml(pk)}">${escapeHtml(getAuthorDisplayName(pk))} <small style="color: var(--text-muted);">${escapeHtml(note)}</small></span><button class="btn-secondary btn-sm" data-act="${action}" data-pk="${escapeHtml(pk)}">${action === "untrust" ? "Stop" : action === "unhide-user" ? "Unhide" : "Remove"}</button></div>`;
  const trusted = trustedCurators();
  setHtmlIfChanged(document.getElementById("blocklists-trusted")!,
    trusted.map((c) => row(c, `blocks ${freenet.blockedBy(c).size}, reports ${freenet.reportedBy(c).size}${c === DEFAULT_CURATOR ? ` (Radica's default${freenet.modsOf(c).size ? `; with its moderators ${[...freenet.modsOf(c)].map(getAuthorDisplayName).join(", ")}` : ""})` : ""}`, "untrust")).join("") || "<small>None yet.</small>");
  setHtmlIfChanged(document.getElementById("blocklists-mine")!,
    [...freenet.blockedBy(me)].map((t) => row(t, "", "unblock")).join("") || "<small>Empty.</small>");

  const hiddenEl = document.getElementById("blocklists-hidden");
  if (hiddenEl) {
    const hidden = hiddenUsers();
    setHtmlIfChanged(hiddenEl, hidden.map((pk) => row(pk, "", "unhide-user")).join("") || "<small>None.</small>");
  }

  const reportsEl = document.getElementById("blocklists-reports");
  if (reportsEl) {
    const myReports = [...freenet.reportedBy(me).entries()];
    setHtmlIfChanged(reportsEl, myReports.map(([target, reason]) => {
      const colon = target.indexOf(":");
      const author = colon > 0 ? target.slice(0, colon) : target;
      const postId = colon > 0 ? target.slice(colon + 1) : "";
      const authorName = getAuthorDisplayName(author);
      const reasonNote = reason ? `: "${reason.slice(0, 40)}"` : "";
      return `<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${postId.startsWith("comm_") ? "Comment" : "Post"} by <b>${escapeHtml(authorName)}</b> <small style="color: var(--text-muted);">${escapeHtml(reasonNote)}</small></span>
        <button class="btn-secondary btn-sm" data-act="unreport" data-author="${escapeHtml(author)}" data-post-id="${escapeHtml(postId)}">Unreport</button>
      </div>`;
    }).join("") || "<small>None yet.</small>");
  }
}
document.getElementById("blocklists-open-btn")!.addEventListener("click", () => {
  if (!currentIdentity) return;
  paintModButton();
  const hasReports = amGlobalMod() && freenet.reportQueue().length > 0;
  showBlocklistTab(hasReports ? "moderation" : "blocklists");
  blocklistsModal.style.display = "flex";
  refreshTrustedBlocklists();
});
document.getElementById("blocklists-close-btn")!.addEventListener("click", () => (blocklistsModal.style.display = "none"));
blocklistsModal.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
  if (!btn) return;
  const { act, author = "", postId = "", media = "", target = "" } = btn.dataset;
  if (act === "profile") {
    const pk = author || btn.dataset.pk;
    if (pk) openUserProfile(pk);
    return;
  }
  if (act === "view-post") {
    blocklistsModal.style.display = "none";
    if (postId && author) void showMyPost(postId, author);
    return;
  }
  if (act === "unhide-user") {
    const pk = btn.dataset.pk!;
    setUserHidden(pk, false);
    if (userProfileModal.style.display === "flex" && uviewKey.textContent === pk) {
      uviewHideBtn.innerHTML = hideButtonHtml(false);
    }
    renderBlocklists();
    renderTimeline();
    return;
  }
  if (act === "untrust") {
    setCuratorTrusted(btn.dataset.pk!, false);
    renderBlocklists();
    renderTimeline();
    return;
  }
  if (act === "unreport") {
    await freenet.unreportPost(btn.dataset.author!, btn.dataset.postId!);
    renderBlocklists();
    renderTimeline();
    return;
  }
  if (act === "unblock") {
    await freenet.setBlocked(btn.dataset.pk!, false);
    renderBlocklists();
    renderTimeline();
    return;
  }
  if (!amGlobalMod()) return;
  e.preventDefault();
  if (act === "remove") await globalRemove(author, postId, media || null);
  else if (act === "dismiss") await freenet.dismissReport(target);
  else if (act === "ban") {
    if (!confirm(`Ban ${getAuthorDisplayName(author)}? Everything they post is hidden for everyone who follows Radica's moderation.`)) return;
    await freenet.setBlocked(author, true);
    showToast("Banned.", "info");
  } else if (act === "unban") await freenet.setBlocked(author, false);
  else if (act === "unhide-comm") {
    await freenet.setCommunityHidden(target, false);
    hiddenCommsSig = [...hiddenCommunityIds().keys()].sort().join(",");
    allCommunities = await loadCommunities();
    renderCommunities();
  }
  renderModDashboard();
  renderTimeline();
});
document.getElementById("blocklists-add-form")!.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("blocklists-add-input") as HTMLInputElement;
  const pk = input.value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(pk)) return alert("That is not a persona public key.");
  setCuratorTrusted(pk, true);
  input.value = "";
  renderBlocklists();
  refreshTrustedBlocklists();
});

// Moderation dashboard: for Radica's moderators only (the maintainer and whoever they named). Reported posts waiting for a
// decision, and who is banned. Everything it does goes on my public blocklist, which Radica's followers read.
const blocklistsTabs = document.getElementById("blocklists-tabs") as HTMLElement | null;
const tabBtnBlocklists = document.getElementById("tab-btn-blocklists") as HTMLElement | null;
const tabBtnModeration = document.getElementById("tab-btn-moderation") as HTMLElement | null;
const paneBlocklists = document.getElementById("pane-blocklists") as HTMLElement | null;
const paneModeration = document.getElementById("pane-moderation") as HTMLElement | null;
const blocklistsModalTitle = document.getElementById("blocklists-modal-title") as HTMLElement | null;
const blocklistsBadge = document.getElementById("blocklists-badge") as HTMLElement | null;
let prevReportQueueCount = -1;
const warmedModPeers = new Set<string>();

function updateBlocklistsBadge(): void {
  if (!blocklistsBadge) return;
  if (!amGlobalMod()) {
    blocklistsBadge.style.display = "none";
    if (tabBtnModeration) tabBtnModeration.textContent = "🛡️ Moderation";
    return;
  }
  const queue = freenet.reportQueue();
  const count = queue.length;
  if (count > 0) {
    blocklistsBadge.textContent = count > 99 ? "99+" : String(count);
    blocklistsBadge.style.display = "inline-block";
  } else {
    blocklistsBadge.style.display = "none";
  }
  if (tabBtnModeration) {
    tabBtnModeration.textContent = count > 0 ? `🛡️ Moderation (${count})` : "🛡️ Moderation";
  }
  if (prevReportQueueCount !== -1 && count > prevReportQueueCount) {
    playPopSound();
  }
  prevReportQueueCount = count;
}

const paintModButton = () => {
  const isMod = amGlobalMod();
  if (blocklistsTabs) blocklistsTabs.style.display = isMod ? "flex" : "none";
  if (tabBtnModeration) tabBtnModeration.style.display = isMod ? "" : "none";
  if (blocklistsModalTitle) blocklistsModalTitle.textContent = isMod ? "Blocklists & Moderation" : "Blocklists";
  updateBlocklistsBadge();
};

function showBlocklistTab(tab: "blocklists" | "moderation") {
  if (tab === "moderation") {
    tabBtnModeration?.classList.add("active");
    tabBtnBlocklists?.classList.remove("active");
    if (paneBlocklists) paneBlocklists.style.display = "none";
    if (paneModeration) paneModeration.style.display = "block";
    renderModDashboard();
    void freenet.refreshLog("reports", true).then(() => {
      if (isOpen(blocklistsModal) && paneModeration?.style.display !== "none") renderModDashboard();
    });
  } else {
    tabBtnBlocklists?.classList.add("active");
    tabBtnModeration?.classList.remove("active");
    if (paneBlocklists) paneBlocklists.style.display = "block";
    if (paneModeration) paneModeration.style.display = "none";
    renderBlocklists();
  }
}

tabBtnBlocklists?.addEventListener("click", () => showBlocklistTab("blocklists"));
tabBtnModeration?.addEventListener("click", () => showBlocklistTab("moderation"));
function renderModDashboard() {
  const me = currentIdentity!.pubkey;
  const btn = (act: string, label: string, attrs: string, cls = "btn-secondary") =>
    `<button class="${cls} btn-sm" data-act="${act}" ${attrs}>${label}</button>`;
  // a report weighs what a dislike from that person would: people I trust (and the moderators) count, fresh keys do not
  const wot = getWebOfTrust();
  const mods = new Set([DEFAULT_CURATOR, ...freenet.modsOf(DEFAULT_CURATOR)]);
  const queue = freenet.reportQueue((pk) => (mods.has(pk) ? 3 : wot.dislikeWeight(pk)));
  const [heard, strangers] = [queue.filter((it) => it.score > 0), queue.filter((it) => it.score === 0)];
  document.getElementById("mod-queue-count")!.textContent = queue.length ? `(${queue.length})` : "";
  updateBlocklistsBadge();

  // Warm peers for all reporters and authors so display names and avatars resolve (only warm unseen peers to prevent infinite re-render loops)
  const peersToWarm = [
    ...queue.map((it) => it.target.slice(0, it.target.indexOf(":"))),
    ...queue.flatMap((it) => it.reporterKeys ?? []),
  ].filter((pk) => pk && !warmedModPeers.has(pk));

  if (peersToWarm.length) {
    for (const pk of peersToWarm) warmedModPeers.add(pk);
    void freenet.warmPeers(peersToWarm).then(() => {
      if (isOpen(blocklistsModal) && paneModeration?.style.display !== "none") renderModDashboard();
    });
  }

  const itemHtml = (items: typeof queue) =>
    items
      .map((it) => {
        const colon = it.target.indexOf(":");
        const author = it.target.slice(0, colon);
        const postId = it.target.slice(colon + 1);
        const post = timelinePosts.find((p) => p.author === author && p.id === postId);
        const media = post ? postMediaHash(post) : null;
        const postCaption = post ? (freenet.postEdit(author, postId)?.caption ?? post.caption) : "";
        const preview = post ? `${post.media_uri ? "🖼 " : ""}${postCaption.slice(0, 200)}` : "(post not loaded here)";
        const attrs = `data-author="${escapeHtml(author)}" data-post-id="${escapeHtml(postId)}" data-media="${escapeHtml(media ?? "")}"`;

        const reportersHtml = (it.reports && it.reports.length)
          ? `<div style="font-size: 0.8rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; display: flex; flex-direction: column; gap: 4px;">
              <span style="font-weight: 600; color: var(--text-muted); font-size: 0.75rem;">Reported by:</span>
              ${it.reports.map((r) => {
                const repName = getAuthorDisplayName(r.reporter);
                const isTrusted = wot.isTrusted(r.reporter);
                const timeStr = r.ts ? formatTimeAgo(r.ts) : "";
                return `<div style="display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;">
                  <a href="#" data-act="profile" data-author="${escapeHtml(r.reporter)}" style="font-weight: 600; text-decoration: none; color: var(--primary);">@${escapeHtml(repName)}</a>
                  ${isTrusted ? `<span title="In your trust network" style="font-size: 0.75rem;">🌿</span>` : `<span title="Outside network" style="font-size: 0.75rem; color: var(--text-muted);">(newcomer)</span>`}
                  ${r.reason ? `<span style="color: var(--text-main);">“${escapeHtml(r.reason)}”</span>` : `<span style="color: var(--text-muted);">(no reason given)</span>`}
                  ${timeStr ? `<small style="color: var(--text-muted); margin-left: auto;">${escapeHtml(timeStr)}</small>` : ""}
                </div>`;
              }).join("")}
            </div>`
          : (it.reasons.length ? `<small style="color: var(--text-muted);">${it.reasons.map((r) => `“${escapeHtml(r)}”`).join(" · ")}</small>` : "");

        return `<div style="border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 0.8rem;"><a href="#" data-act="profile" data-author="${escapeHtml(author)}"><b>${escapeHtml(getAuthorDisplayName(author))}</b></a>
            <small style="color: var(--text-muted);">· ${it.reporters} report${it.reporters === 1 ? "" : "s"}${it.trusted ? `, ${it.trusted} from people you trust` : ""}${postId.startsWith("comm_") ? " · comment" : ""}</small></div>
          <div style="font-size: 0.85rem; white-space: pre-wrap; overflow-wrap: anywhere;">${escapeHtml(preview)}</div>
          ${reportersHtml}
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">${btn("remove", "Remove", attrs, "btn-primary")}${btn("ban", "Ban author", attrs)}${btn("dismiss", "Dismiss", `data-target="${escapeHtml(it.target)}"`)}${btn("view-post", "View post", attrs)}</div>
        </div>`;
      })
      .join("");
  // skipped when unchanged: a sync redraws this on every update, which would close the open <details> under the reader
  setHtmlIfChanged(document.getElementById("mod-queue")!,
    (itemHtml(heard) || (strangers.length ? "" : "<small>Nothing reported.</small>")) +
    (strangers.length
      ? `<details style="margin-top: 8px;"><summary style="cursor: pointer; font-size: 0.8rem; color: var(--text-muted);">Reported only by people outside your network (${strangers.length}): anyone can make a key, so these wait here</summary><div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">${itemHtml(strangers)}</div></details>`
      : ""));

  const banned: string[] = [];
  for (const mod of [DEFAULT_CURATOR, ...freenet.modsOf(DEFAULT_CURATOR)]) {
    for (const pk of freenet.blockedBy(mod)) {
      banned.push(
        `<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;"><span>${escapeHtml(getAuthorDisplayName(pk))} <small style="color: var(--text-muted);">by ${escapeHtml(mod === me ? "me" : getAuthorDisplayName(mod))}</small></span>${mod === me ? btn("unban", "Unban", `data-author="${escapeHtml(pk)}"`) : ""}</div>`
      );
    }
  }
  setHtmlIfChanged(document.getElementById("mod-banned")!, banned.join("") || "<small>Nobody.</small>");

  const hiddenRows: string[] = [];
  for (const mod of [DEFAULT_CURATOR, ...freenet.modsOf(DEFAULT_CURATOR)]) {
    for (const [id, why] of freenet.hiddenCommunitiesBy(mod)) {
      hiddenRows.push(
        `<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;"><span>r/${escapeHtml(id.slice(2))} <small style="color: var(--text-muted);">by ${escapeHtml(mod === me ? "me" : getAuthorDisplayName(mod))}${why ? ` · “${escapeHtml(why)}”` : ""}</small></span>${mod === me ? btn("unhide-comm", "Show again", `data-target="${escapeHtml(id)}"`) : ""}</div>`
      );
    }
  }
  setHtmlIfChanged(document.getElementById("mod-comm-list")!, hiddenRows.join("") || "<small>None.</small>");
}

/** Hide a community for everyone who follows Radica's moderation (a moderator's act), and redraw what shows it. */
async function hideCommunityForAll(id: string, reason = ""): Promise<void> {
  if (!amGlobalMod()) return;
  if (id === "c_radica") return void showToast("r/radica is Radica's home: it cannot be hidden.", "warning");
  await freenet.setCommunityHidden(id, true, reason);
  hiddenCommsSig = [...hiddenCommunityIds().keys()].sort().join(",");
  allCommunities = await loadCommunities();
  if (activeCommunity?.id === id) commExitBtn.click();
  renderCommunities();
  renderTimeline();
  if (isOpen(blocklistsModal) && paneModeration?.style.display !== "none") renderModDashboard();
}
commHideBtn.addEventListener("click", async () => {
  if (!activeCommunity) return;
  if (!confirm(`Hide r/${activeCommunity.slug} for everyone who follows Radica's moderation? It leaves their lists and timelines (it stays on the network). You can undo it in Moderation.`)) return;
  await hideCommunityForAll(activeCommunity.id, prompt("Why? (optional)") ?? "");
  showToast("Community hidden.", "info");
});
document.getElementById("mod-comm-form")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("mod-comm-input") as HTMLInputElement;
  const reason = document.getElementById("mod-comm-reason") as HTMLInputElement;
  const slug = input.value.trim().toLowerCase().replace(/^r\//, "");
  if (!/^[a-z0-9_]{1,40}$/.test(slug)) return alert("That is not a community name.");
  await hideCommunityForAll(`c_${slug}`, reason.value);
  input.value = reason.value = "";
});
document.getElementById("mod-ban-form")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!amGlobalMod()) return;
  const input = document.getElementById("mod-ban-input") as HTMLInputElement;
  const pk = input.value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(pk)) return alert("That is not a persona public key.");
  if (pk === currentIdentity!.pubkey || pk === DEFAULT_CURATOR || freenet.modsOf(DEFAULT_CURATOR).has(pk)) return alert("A moderator cannot be banned from here.");
  if (!confirm(`Ban ${getAuthorDisplayName(pk)} (${shortenKey(pk)})? Everything they post is hidden for everyone who follows Radica's moderation.`)) return;
  await freenet.setBlocked(pk, true);
  input.value = "";
  showToast("Banned.", "info");
  renderModDashboard();
  renderTimeline();
});
const notifsModal = document.getElementById("notifs-modal") as HTMLElement;
const notifsList = document.getElementById("notifs-list") as HTMLElement;
const notifsCloseBtn = document.getElementById("notifs-close-btn") as HTMLButtonElement;
const notifsMarkReadBtn = document.getElementById("notifs-mark-read-btn") as HTMLButtonElement;
const notifsSoundBtn = document.getElementById("notifs-sound-btn") as HTMLButtonElement | null;

// Create Community Modal Elements
const createCommModal = document.getElementById("create-comm-modal") as HTMLElement;
const commNameInput = document.getElementById("comm-name-input") as HTMLInputElement;
const commDescInput = document.getElementById("comm-desc-input") as HTMLTextAreaElement;
const commRequireTrustedInput = document.getElementById("comm-require-trusted-input") as HTMLInputElement | null;
const createCommCancelBtn = document.getElementById("create-comm-cancel-btn") as HTMLButtonElement;
const createCommSaveBtn = document.getElementById("create-comm-save-btn") as HTMLButtonElement;

// Community Moderation Modal Elements
const commModModal = document.getElementById("comm-mod-modal") as HTMLElement;
const modModalCommTitle = document.getElementById("mod-modal-comm-title") as HTMLElement;
const commModsList = document.getElementById("comm-mods-list") as HTMLElement;
const addModForm = document.getElementById("add-mod-form") as HTMLFormElement;
const addModPubkeyInput = document.getElementById("add-mod-pubkey-input") as HTMLInputElement;
const modDeletedCount = document.getElementById("mod-deleted-count") as HTMLElement;
const commDeletedPostsList = document.getElementById("comm-deleted-posts-list") as HTMLElement;
const commModCloseBtn = document.getElementById("comm-mod-close-btn") as HTMLButtonElement;

function getAuthorDisplayName(pubkey: string): string {
  if (currentIdentity && pubkey === currentIdentity.pubkey && currentProfile?.display_name) {
    return currentProfile.display_name;
  }
  const peer = freenet.knownPeers[pubkey];
  if (peer?.display_name) {
    return peer.display_name;
  }
  return `@${shortenKey(personaName(pubkey))}`;
}

function getAuthorAvatarUrl(pubkey: string): string {
  if (currentIdentity && pubkey === currentIdentity.pubkey && currentProfile?.avatar_url) {
    return currentProfile.avatar_url;
  }
  const peer = freenet.knownPeers[pubkey];
  if (peer?.avatar_url) {
    return peer.avatar_url;
  }
  return generateDefaultAvatar(pubkey);
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const rootsGraph = document.getElementById("roots-graph") as HTMLElement;
const rootsGraphBig = document.getElementById("roots-graph-big") as HTMLElement;
const composerAvatar = document.getElementById("composer-avatar") as HTMLImageElement;
composerAvatar.src = sidebarAvatar.src; // the default face until my profile loads
const ROOT_FRESH_MS = 24 * 60 * 60 * 1000;

/** The people I follow around me; those who posted in the last day pulse. */
function renderRoots() {
  if (!rootsGraph) return;
  const now = Date.now();
  // ponytail: single pass over timelinePosts for fresh authors + setHtmlIfChanged to avoid redundant SVG DOM rebuilds
  const freshAuthors = new Set<string>();
  for (const p of timelinePosts) if (now - p.timestamp < ROOT_FRESH_MS) freshAuthors.add(p.author);
  const roots = followingKeys.map((pk) => ({
    pk,
    name: getAuthorDisplayName(pk),
    fresh: freshAuthors.has(pk),
  }));
  roots.sort((a, b) => Number(b.fresh) - Number(a.fresh)); // the lively ones first, at the top
  const more = roots.length > 12 ? `<div class="roots-more">+${roots.length - 12} more</div>` : "";
  const html = roots.length ? rootsSvg(roots) + more : `<div class="roots-empty">Follow someone and your first root grows here.</div>`;
  setHtmlIfChanged(rootsGraph, html);
  if (rootsGraphBig) setHtmlIfChanged(rootsGraphBig, roots.length ? rootsSvg(roots, 24) : html);
  for (const id of ["roots-count", "pp-roots-count"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(roots.length);
  }
}

for (const graph of [rootsGraph, rootsGraphBig]) {
  graph?.addEventListener("click", (e) => {
    const node = (e.target as Element).closest<SVGGElement>(".root-node");
    if (node?.dataset.author) openUserProfile(node.dataset.author);
  });
  graph?.addEventListener("keydown", (e) => {
    const node = (e.target as Element).closest<SVGGElement>(".root-node");
    if (node?.dataset.author && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openUserProfile(node.dataset.author);
    }
  });
}

function updateCategoryCounts() {
  renderRoots();
  let thought = 0, moment = 0, event = 0, poll = 0;
  for (const p of timelinePosts) {
    if (p.category === "thought") thought++;
    else if (p.category === "moment") moment++;
    else if (p.category === "event") event++;
    const postCaption = freenet.postEdit(p.author, p.id)?.caption ?? p.caption;
    if (freepollsLink(postCaption)) poll++;
  }
  countAll.textContent = timelinePosts.length.toString();
  countThought.textContent = thought.toString();
  countMoment.textContent = moment.toString();
  countEvent.textContent = event.toString();
  countPoll.textContent = poll.toString();
}

function renderFollowingList() {
  renderFollowers();
  freenet.warmPeers(followingKeys);
  followingCount.textContent = followingKeys.length.toString();
  if (scopeFollowingCount) {
    scopeFollowingCount.textContent = followingKeys.length.toString();
  }
  if (followingKeys.length === 0) {
    setHtmlIfChanged(followingList, `<div style="font-size: 0.8rem; color: var(--text-muted);">Not following anyone yet.</div>`);
    renderRoots();
    return;
  }

  const painted = setHtmlIfChanged(followingList, followingKeys
    .map(
      (pk) => `
    <div class="following-item">
      <div class="following-info author-clickable" data-author="${escapeHtml(pk)}" style="cursor: pointer;" title="View Profile">
        <img src="${safeUrl(getAuthorAvatarUrl(pk))}" class="following-img" onerror="this.onerror=null; this.src='${generateDefaultAvatar(pk)}'" />
        <span class="following-name">${escapeHtml(getAuthorDisplayName(pk))}</span>
      </div>
      <div style="display: flex; gap: 4px; align-items: center;">
        <button class="action-btn talk-btn" data-author="${escapeHtml(pk)}" title="Direct Message" style="font-size: 0.75rem; padding: 2px 4px;">${renderIcon("chat", { className: "icon-xs" })}</button>
        <button class="unfollow-btn" data-pubkey="${escapeHtml(pk)}" title="Unfollow">${renderIcon("x", { className: "icon-xs" })}</button>
      </div>
    </div>
  `
    )
    .join(""));

  // Following list click handlers
  if (painted) followingList.querySelectorAll(".unfollow-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const pk = (e.currentTarget as HTMLElement).dataset.pubkey!;
      if (!currentIdentity) return;
      await freenet.toggleFollow(currentIdentity, pk);
      followingKeys = followingKeys.filter((k) => k !== pk);
      renderFollowingList();
      renderDiscoveredPeers();
      await reloadPosts();
    });
  });

  if (painted) followingList.querySelectorAll(".author-clickable").forEach((el) => {
    el.addEventListener("click", (e) => {
      const pk = (e.currentTarget as HTMLElement).dataset.author!;
      openUserProfile(pk);
    });
  });

  if (painted) followingList.querySelectorAll(".talk-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const pk = (e.currentTarget as HTMLElement).dataset.author!;
      openChatWithPeer(pk);
    });
  });
  renderRoots();
}

/** People seen following me; shown only to me, without a number (it is never the whole count). */
function renderFollowers() {
  if (!followersList || !currentIdentity) return;
  const keys = freenet.followersOf(currentIdentity.pubkey);
  setHtmlIfChanged(
    followersList,
    keys
      .map((pk) => `<div class="following-item"><div class="following-info author-clickable" data-author="${escapeHtml(pk)}" style="cursor: pointer;" title="View Profile"><img src="${safeUrl(getAuthorAvatarUrl(pk))}" class="following-img" onerror="this.onerror=null; this.src='${generateDefaultAvatar(pk)}'" /><span class="following-name">${escapeHtml(getAuthorDisplayName(pk))}</span></div></div>`)
      .join("") || `<div style="font-size: 0.8rem; color: var(--text-muted);">Nobody seen yet: only people whose feed your node has read show here.</div>`,
  );
}

function renderDiscoveredPeers() {
  if (!discoveredPeersList || !currentIdentity) return;
  // only people who chose a name: default "Persona @…" accounts are noise
  const discoveredAll = freenet.getDiscoveredPeers(currentIdentity.pubkey);
  freenet.warmPeers(discoveredAll.map((p) => p.pubkey));
  // Exclude contacts that are only River room members and not native Radica personas with their own feed
  const peers = discoveredAll.filter(
    (p) =>
      !freenet.riverOnly.has(p.pubkey) &&
      freenet.knownPeers[p.pubkey]?.display_name &&
      !freenet.knownPeers[p.pubkey].display_name.startsWith("Persona @")
  );
  if (peers.length === 0) {
    setHtmlIfChanged(discoveredPeersList, `<div style="font-size: 0.8rem; color: var(--text-muted);">No other peers detected yet. Open another tab to connect!</div>`);
    return;
  }

  const painted = setHtmlIfChanged(discoveredPeersList, peers
    .map((p) => {
      const isFollowing = followingKeys.includes(p.pubkey);
      return `
      <div class="discovered-item">
        <div class="discovered-info author-clickable" data-author="${escapeHtml(p.pubkey)}" style="cursor: pointer;" title="View Profile">
          <img src="${safeUrl(getAuthorAvatarUrl(p.pubkey))}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;" onerror="this.onerror=null; this.src='${generateDefaultAvatar(p.pubkey)}'" />
          <span style="font-weight: 600;">${escapeHtml(getAuthorDisplayName(p.pubkey))}</span>
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
          <button class="talk-btn action-btn" data-author="${escapeHtml(p.pubkey)}" title="Send Message" style="font-size: 0.75rem; padding: 2px 4px;">${renderIcon("chat", { className: "icon-xs" })}</button>
          <button class="action-btn toggle-follow-peer-btn ${isFollowing ? "btn-secondary" : "btn-primary"} btn-icon-text" data-pubkey="${escapeHtml(p.pubkey)}" style="font-size: 0.75rem; padding: 2px 8px;">
            ${isFollowing ? `${renderIcon("userCheck", { className: "icon-xs" })} <span>Following</span>` : `${renderIcon("userPlus", { className: "icon-xs" })} <span>Follow</span>`}
          </button>
        </div>
      </div>
    `;
    })
    .join(""));

  if (painted) discoveredPeersList.querySelectorAll(".toggle-follow-peer-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const targetPk = (e.currentTarget as HTMLElement).dataset.pubkey!;
      if (!currentIdentity) return;
      const isNowFollowing = await freenet.toggleFollow(currentIdentity, targetPk);
      if (isNowFollowing) {
        if (!followingKeys.includes(targetPk)) followingKeys.push(targetPk);
      } else {
        followingKeys = followingKeys.filter((k) => k !== targetPk);
      }
      renderFollowingList();
      renderDiscoveredPeers();
      await reloadPosts();
    });
  });

  if (painted) discoveredPeersList.querySelectorAll(".author-clickable").forEach((el) => {
    el.addEventListener("click", (e) => {
      const pk = (e.currentTarget as HTMLElement).dataset.author!;
      openUserProfile(pk);
    });
  });

  if (painted) discoveredPeersList.querySelectorAll(".talk-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const pk = (e.currentTarget as HTMLElement).dataset.author!;
      openChatWithPeer(pk);
    });
  });
}

// A big feed slows loading for me and my readers. The panel only appears once it is half the app's soft budget (not a Freenet limit);
// "Free space" (delete the oldest posts) shows once the feed is above its target.
function renderFeedSize(posts: Post[]) {
  const label = document.getElementById("feed-size");
  const btn = document.getElementById("feed-free-btn") as HTMLButtonElement | null;
  const panel = document.getElementById("feed-size-panel");
  if (!label || !btn || !panel) return;
  const used = feedBytes(posts);
  panel.style.display = used >= FEED_SHOW ? "" : "none";
  label.textContent = formatBytes(used);
  label.style.color = used > FEED_BUDGET ? "#ef4444" : used > FEED_BUDGET * 0.8 ? "#f59e0b" : "";
  const bar = document.getElementById("feed-size-bar");
  if (bar) {
    bar.style.width = `${Math.min(100, Math.max(1, (used / FEED_BUDGET) * 100))}%`;
    bar.style.background = label.style.color;
  }
  btn.style.display = used > FEED_TARGET ? "" : "none";
  btn.onclick = async () => {
    if (!currentIdentity) return;
    const ids = oldestToFree(posts, FEED_TARGET);
    if (!ids.length) return;
    if (!confirm(`Delete your ${ids.length} oldest post(s) to bring the feed down to about ${formatBytes(FEED_TARGET)}?\n\nThis cannot be undone.`)) return;
    for (const id of ids) await freenet.deletePost(currentIdentity, id);
    await reloadPosts();
    await updateMyPostsAndScopeCounts();
  };
}

let sizedPosts: object | undefined;
async function updateMyPostsAndScopeCounts() {
  if (!currentIdentity) return;
  try {
    const myFeed = await freenet.getFeed(currentIdentity.pubkey);
    const myCount = Object.keys(myFeed.posts || {}).length;
    if (scopeMyPostsCount) scopeMyPostsCount.textContent = myCount.toString();
    document.getElementById("scope-saved-count")!.textContent = String(savedPosts(currentIdentity.pubkey).length);
    if (sidebarMyPostsCount) sidebarMyPostsCount.textContent = myCount.toString();
    document.getElementById("pp-posts-count")!.textContent = myCount.toString();
    // measuring re-serializes every post (up to 16 MB) and this runs on each sync pass: getFeed hands back the same object while the stored feed is unchanged
    if (myFeed.posts !== sizedPosts) {
      sizedPosts = myFeed.posts;
      renderFeedSize(Object.values(myFeed.posts || {}));
    }
    if (scopeFollowingCount) scopeFollowingCount.textContent = followingKeys.length.toString();
    if (sidebarMyFollowingCount) sidebarMyFollowingCount.textContent = followingKeys.length.toString();
    if (followingCount) followingCount.textContent = followingKeys.length.toString();
  } catch (err) {
    console.warn("Could not update scope counts:", err);
  }
}

function refreshVisibleReactions(): void {
  const authors = Array.from(new Set(timelinePosts.map((p) => p.author))).slice(0, 5);
  for (const a of authors) void freenet.refreshLog(`reactions/${a}`);
}

async function reloadPosts() {
  if (!currentIdentity) return;
  refreshTrustedBlocklists();
  refreshVisibleReactions();
  if (currentFeedScope === "explore") {
    timelinePosts = await freenet.getExploreTimeline(currentIdentity, {
      prefer: [...new Set([...getWebOfTrust().tier2, ...supporterKeys, ...ghostkeyKeys])],
      skip: isHiddenAuthor,
    });
    void checkMilestones(timelinePosts);
  } else if (currentFeedScope === "following") {
    timelinePosts = await freenet.getTimeline(currentIdentity);
    const wot = getWebOfTrust();
    // Include Tier 2 posts from known peerCache in the Radicato feed
    const existingIds = new Set(timelinePosts.map((x) => x.id));
    for (const [id, p] of Object.entries(freenet.peerCache)) {
      if (wot.tier2.has(p.author) && !existingIds.has(id)) {
        timelinePosts.push(p);
        existingIds.add(id);
      }
    }
    timelinePosts.sort((a, b) => b.timestamp - a.timestamp);
  } else if (currentFeedScope === "myposts") {
    const myFeed = await freenet.getFeed(feedAuthor ?? currentIdentity.pubkey);
    timelinePosts = Object.values(myFeed.posts || {}).sort((a, b) => b.timestamp - a.timestamp);
  } else if (currentFeedScope === "saved") {
    timelinePosts = savedPosts(currentIdentity.pubkey);
  }
  await yieldToMain(); // gathering the posts and drawing them are separate tasks
  renderTimeline();
  renderTrending();
  updateMyPostsAndScopeCounts();
}

/** Joined communities only: the sidebar, composer and feed show these, the rest are found by name. */
const isJoined = (c: Community) => c.members.includes(currentIdentity?.pubkey ?? "");

interface StagedCommentMedia {
  type: "file" | "url";
  file?: File;
  url?: string;
  previewUrl: string;
  label: string;
}

const stagedCommentMedia = new Map<string, StagedCommentMedia>();

function renderCommentStaging(postId: string) {
  const stagingEl = document.getElementById(`comment-staging-${postId}`);
  if (!stagingEl) return;
  const staged = stagedCommentMedia.get(postId);
  if (!staged) {
    stagingEl.style.display = "none";
    stagingEl.innerHTML = "";
    return;
  }
  stagingEl.style.display = "flex";
  stagingEl.innerHTML = `
    <div class="comment-staging-thumb-wrap">
      <img src="${safeUrl(staged.previewUrl)}" alt="Preview" class="comment-staging-thumb" />
    </div>
    <div class="comment-staging-info">
      <span class="comment-staging-title">${escapeHtml(staged.label)}</span>
      <span class="comment-staging-sub">${staged.type === "url" ? "GIF Link" : "Image Attachment"}</span>
    </div>
    <button type="button" class="comment-staging-remove" data-post-id="${escapeHtml(postId)}" title="Remove attachment" aria-label="Remove attachment">✕</button>
  `;
}

function removeStagedCommentMedia(postId: string) {
  const old = stagedCommentMedia.get(postId);
  if (old?.previewUrl && old.type === "file") URL.revokeObjectURL(old.previewUrl);
  stagedCommentMedia.delete(postId);
  renderCommentStaging(postId);
}

function stageCommentUrl(postId: string, url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  removeStagedCommentMedia(postId);
  stagedCommentMedia.set(postId, {
    type: "url",
    url: trimmed,
    previewUrl: trimmed,
    label: "GIF",
  });
  renderCommentStaging(postId);
}

async function stageCommentFile(postId: string, file: File) {
  if (!file.type.startsWith("image/")) {
    showToast("Only image files are supported.", "error");
    return;
  }
  if (file.type === "image/gif" && file.size > 768 * 1024) {
    showToast("GIF is too large (maximum 750 KB for decentralized storage).", "error");
    return;
  }
  removeStagedCommentMedia(postId);
  const previewUrl = URL.createObjectURL(file);
  stagedCommentMedia.set(postId, {
    type: "file",
    file,
    previewUrl,
    label: file.name || "Photo",
  });
  renderCommentStaging(postId);
}

/** Finds the card currently in view or active in the feed to anchor the user's scroll position. */
function findFeedScrollAnchor(container: HTMLElement): { id: string; top: number } | null {
  if (window.scrollY <= 10) return null; // at the top: keep natural top view for newly published posts

  // 1. If an input or button inside a post is focused
  const activeCard = document.activeElement?.closest<HTMLElement>(".gram-card");
  if (activeCard?.id && container.contains(activeCard)) {
    return { id: activeCard.id, top: activeCard.getBoundingClientRect().top };
  }

  // 2. If a post's menu or edit box is open
  const openCard = container.querySelector<HTMLElement>(".gram-card:has(.post-more[open]), .gram-card.menu-open, .gram-card:has(.edit-post-box)");
  if (openCard?.id) {
    return { id: openCard.id, top: openCard.getBoundingClientRect().top };
  }

  // 3. The post card most visible in the viewport
  const cards = Array.from(container.querySelectorAll<HTMLElement>(".gram-card"));
  const vh = window.innerHeight;
  let bestCard: HTMLElement | null = null;
  let bestScore = -Infinity;

  for (const card of cards) {
    if (!card.id) continue;
    const r = card.getBoundingClientRect();
    const visibleTop = Math.max(0, r.top);
    const visibleBottom = Math.min(vh, r.bottom);
    const visibleHeight = visibleBottom - visibleTop;

    if (visibleHeight > 0) {
      // Prioritize cards taking the most screen height, with slight preference to the upper half
      const score = visibleHeight - visibleTop * 0.4;
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }
  }

  if (!bestCard?.id) return null;
  return { id: bestCard.id, top: bestCard.getBoundingClientRect().top };
}

/** Restores the scroll offset so the anchored post stays at the exact same viewport position. */
function restoreScrollAnchor(anchor: { id: string; top: number }) {
  const applyDelta = () => {
    const el = document.getElementById(anchor.id);
    if (!el) return;
    const currentTop = el.getBoundingClientRect().top;
    const delta = currentTop - anchor.top;
    if (Math.abs(delta) >= 1) {
      window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
    }
  };
  applyDelta();
  requestAnimationFrame(applyDelta);
}

function renderTimeline() {
  if (!currentIdentity) return;

  const me = currentIdentity.pubkey;
  // ponytail: build hidden author set and community map once per render instead of per-post JSON.parse + linear scans
  const hidden = new Set(hiddenUsers());
  const curators = new Set([...moderationCurators(), me]);
  const globalMod = amGlobalMod();
  for (const c of curators) for (const pk of freenet.blockedBy(c)) hidden.add(pk);
  const commByRef = new Map<string, Community>();
  for (const c of allCommunities) {
    commByRef.set(c.id, c);
    commByRef.set(c.slug, c);
  }
  const commOf = (p: Post) => (p.community_id ? commByRef.get(p.community_id) : undefined);

  const reported = new Set<string>();
  const reportedMedia = new Set<string>();
  for (const c of curators) {
    for (const k of freenet.reportedBy(c).keys()) reported.add(k);
    for (const h of freenet.reportedMediaBy(c)) reportedMedia.add(h);
  }
  // reports made before they named the media: take it from the reported post, when it is here
  for (const p of timelinePosts) if (reported.has(`${p.author}:${p.id}`)) { const h = postMediaHash(p); if (h) reportedMedia.add(h); }

  const deletedSet = activeCommunity?.deleted_post_ids ? new Set(activeCommunity.deleted_post_ids) : null;
  const tagLower = activeTagFilter ? "#" + activeTagFilter.toLowerCase() : null;
  const qLower = searchQuery ? searchQuery.toLowerCase() : null;

  // Single-pass filter pipeline (avoids allocating multiple intermediate arrays)
  const nowMs = Date.now();
  const hiddenComms = hiddenCommunityIds();
  const topWot = getWebOfTrust();
  const visible = timelinePosts.filter((p) => {
    if (hidden.has(p.author)) return false;
    if (p.author !== me && isFuture(p, nowMs)) return false;
    if (p.community_id && p.author !== me && hiddenComms.has(p.community_id)) return false;
    if (p.author !== me && reported.has(`${p.author}:${p.id}`)) return false;
    if (p.author !== me && reportedMedia.size && reportedMedia.has(postMediaHash(p) ?? "")) return false;

    if (currentFeedScope === "following") {
      const isTrusted = p.author === me || topWot.isTrusted(p.author);
      if (!isTrusted) return false;
    }

    if (currentFeedScope !== "myposts" && currentFeedScope !== "saved") {
      const c = commOf(p);
      if (c && c.deleted_post_ids.includes(p.id)) return false;
      if (!activeCommunity && c && !isJoined(c) && p.author !== me) return false;
    }

    if (activeCommunity) {
      if (p.community_id !== activeCommunity.id && p.community_id !== activeCommunity.slug) return false;
      if (deletedSet && deletedSet.has(p.id)) return false;
    }

    const postCaption = freenet.postEdit(p.author, p.id)?.caption ?? p.caption;
    if (currentCategory !== "all" && (currentCategory === "poll" ? !freepollsLink(postCaption) : p.category !== currentCategory)) return false;

    if (tagLower && !postCaption.toLowerCase().includes(tagLower)) return false;

    if (qLower) {
      const matchCaption = postCaption.toLowerCase().includes(qLower);
      const matchAuthor = p.author.toLowerCase().includes(qLower);
      const matchLoc = p.location && p.location.toLowerCase().includes(qLower);
      if (!matchCaption && !matchAuthor && !matchLoc) return false;
    }

    return true;
  });
  // "Top": best-liked of a period (the likes of the post and its dislikes from the reactions log); otherwise as gathered, newest first
  const filtered = currentFeedSort === "recent" || currentFeedScope === "saved" ? visible : sortPosts(visible, currentFeedSort, likers, (p) => freenet.postDislikers(p.author, p.id), nowMs, { like: (k) => topWot.likeWeight(k), dislike: (k) => topWot.dislikeWeight(k) });

  updateCategoryCounts();

  if (filtered.length === 0) {
    if (currentFeedScope === "saved") {
      postsContainer.innerHTML = `<div class="empty-state"><p>Nothing saved yet. Press Save under a post to keep it here.</p></div>`;
    } else if (currentFeedScope === "myposts" && !feedAuthor) {
      postsContainer.innerHTML = `
        <div class="empty-state">
          <p style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">You haven't published any posts yet.</p>
          <p style="font-size: 0.85rem; color: var(--text-muted);">Share your first thought, moment, or event using the composer above!</p>
        </div>
      `;
    } else {
      postsContainer.innerHTML = `
        <div class="empty-state">
          <p>No posts match the current filter. Be the first to publish on Freenet!</p>
        </div>
      `;
    }
    return;
  }

  // Page the feed: a long feed is drawn 20 posts at a time. Any change of filter starts again from the first page.
  const pageKey = [currentFeedScope, currentFeedSort, activeCommunity?.id, currentCategory, activeTagFilter, searchQuery].join("|");
  const isFeedSwitch = pageKey !== lastPageKey;
  if (isFeedSwitch) {
    lastPageKey = pageKey;
    visiblePosts = POSTS_PER_PAGE;
  }
  const moreHtml =
    filtered.length > visiblePosts
      ? `<div class="load-more"><button type="button" class="btn-secondary" id="load-more-btn">Show more (${filtered.length - visiblePosts} left)</button></div>`
      : "";

  const items = filtered
    .slice(0, visiblePosts)
    .filter((post) => SAFE_ID.test(post.id) && HEX64.test(post.author))
    .map((post) => {
      const isLiked = !!post.likes?.[currentIdentity!.pubkey]?.liked;
      const postLikers = likers(post);
      const dislikersList = freenet.postDislikers(post.author, post.id);
      const isDisliked = !!currentIdentity && dislikersList.includes(currentIdentity.pubkey);
      const dislikeCount = dislikersList.length;
      const postComm = commOf(post);
      const commMods = postComm ? [postComm.creator, ...postComm.moderators] : [];
      const wot = topWot;
      const wotEval = wot.evaluatePost(post, postLikers, dislikersList, commMods);
      // a newcomer's post without its anti-bot proof: written around Radica (a script), so covered like a disliked one
      const noPow = !wotEval.isPenalized && post.timestamp >= POST_POW_SINCE && post.author !== currentIdentity!.pubkey && wot.trustTier(post.author) === 0 && !postHasPow(post);
      const isWotShielded = isWotModerationEnabled() && (wotEval.isPenalized || noPow) && !revealedWotPosts.has(post.id);
      const isMyPost = post.author === currentIdentity!.pubkey;
      const isModOrOwner =
        activeCommunity &&
        (activeCommunity.creator === currentIdentity!.pubkey ||
          activeCommunity.moderators.includes(currentIdentity!.pubkey));
      // an empty comment is one its author took back (freenet.deleteComment)
      // a reported comment is `<author>:<comment id>`, like a post
      const liveComments = Object.values(post.comments).filter((c) => c.text !== "" && (c.author === me || !reported.has(`${c.author}:${c.id}`)));
      // newcomers' comments without the anti-bot proof wait behind a "show" button (not dropped: a newcomer on an old app would vanish)
      const unproven = isWotModerationEnabled() && !revealedUnproven.has(post.id) ? liveComments.filter((c) => unprovenComment(c, wot)) : [];
      const commentsArray = liveComments.filter((c) => !unproven.includes(c)).sort((a, b) => a.timestamp - b.timestamp);
      // the newest few, so a long thread does not turn into a box that scrolls inside the feed
      const shownComments = expandedComments.has(post.id) ? commentsArray : commentsArray.slice(-COMMENTS_SHOWN);
      const authorDisplayName = getAuthorDisplayName(post.author);
      const authorAvatar = getAuthorAvatarUrl(post.author);
      const authorIsMod = !!postComm && (postComm.creator === post.author || postComm.moderators.includes(post.author));
      const authorTrust = wot.trustBadge(post.author);
      // everything the card shows: unchanged since the last draw, its html (and its DOM node) are reused
      const timeAgo = formatTimeAgo(post.timestamp);
      const edit = freenet.postEdit(post.author, post.id); // the feed keeps the first version; edits come from a log
      const saved = !!currentIdentity && isSaved(currentIdentity.pubkey, post);
      const caption = edit?.caption ?? post.caption;
      const key = `card-${post.id}`;
      const hit = cardCache.get(post.id);
      const postSig = `${post.sig ?? ""}\x1f${post.caption}\x1f${post.media_uri ?? ""}\x1f${post.is_nsfw ? 1 : 0}\x1f${post.category}\x1f${post.community_id ?? ""}\x1f${post.event_date ?? ""}\x1f${post.location ?? ""}`;
      const likesSig = postLikers.length ? postLikers.map((k) => `${k}:${getAuthorDisplayName(k)}`).join(",") : "";
      let commSig: string | undefined;
      let mentionSig: string | undefined;
      const getCommSig = () => (commSig ??= commentsArray.map((c) => {
        const ck = `${c.author}:${c.id}`;
        return `${c.id}|${c.text}|${getAuthorDisplayName(c.author)}|${formatTimeAgo(c.timestamp)}|${freenet.commentLikers(post.author, post.id, ck).join(",")}|${postTranslations.get(`${post.author}:${post.id}|${ck}`) ?? ""}`;
      }).join("\n"));
      const getMentionSig = () => {
        if (mentionSig !== undefined) return mentionSig;
        const mentionText = caption + (commentsArray.length ? commentsArray.map((c) => c.text).join(" ") : "");
        return (mentionSig = mentionText.includes("@") ? mentionsIn(mentionText).map(getAuthorDisplayName).join("|") : "");
      };

      if (
        hit &&
        hit.sig[0] === postSig &&
        hit.sig[1] === likesSig &&
        hit.sig[2] === isLiked &&
        hit.sig[3] === isDisliked &&
        hit.sig[4] === dislikeCount &&
        hit.sig[5] === isWotShielded &&
        hit.sig[6] === isModOrOwner &&
        hit.sig[7] === authorIsMod &&
        hit.sig[8] === authorDisplayName &&
        hit.sig[9] === authorAvatar &&
        hit.sig[10] === timeAgo &&
        hit.sig[13] === authorTrust.tier &&
        hit.sig[14] === (edit?.ts ?? 0) &&
        hit.sig[15] === postTranslations.get(`${post.author}:${post.id}`) &&
        hit.sig[16] === saved &&
        hit.sig[17] === shownComments.length &&
        hit.sig[18] === globalMod &&
        hit.sig[19] === unproven.length &&
        hit.sig[11] === getCommSig() &&
        hit.sig[12] === getMentionSig()
      ) {
        cardCache.delete(post.id);
        cardCache.set(post.id, hit);
        return { key, html: hit.html };
      }

      const sig = [postSig, likesSig, isLiked, isDisliked, dislikeCount, isWotShielded, isModOrOwner, authorIsMod, authorDisplayName, authorAvatar, timeAgo, getCommSig(), getMentionSig(), authorTrust.tier, edit?.ts ?? 0, postTranslations.get(`${post.author}:${post.id}`), saved, shownComments.length, globalMod, unproven.length];

      const html = `
      <article class="gram-card${isWotShielded ? " wot-shielded" : ""}" id="card-${post.id}">
        ${
          isWotShielded
            ? `
          <div class="wot-shield-banner">
            <div class="wot-shield-info">
              <span class="wot-shield-icon">${renderIcon("shield", { className: "icon-sm" })}</span>
              <div>
                <div class="wot-shield-title">${noPow ? "Newcomer post without the anti-bot proof" : escapeHtml(wotEval.penaltyReason ?? "Shielded by Web-of-Trust")}</div>
                <div class="wot-shield-sub">${noPow ? "Radica asks new accounts for a small proof of work; this post was published without it, likely by a script." : `Disliked by ${escapeHtml(wotEval.trustedDislikers.map(getAuthorDisplayName).join(", "))}`}</div>
              </div>
            </div>
            <button type="button" class="btn-reveal-wot btn-secondary btn-sm" data-post-id="${escapeHtml(post.id)}">Show post</button>
          </div>
        `
            : ""
        }
        <div class="gram-card-header">
          <div class="gram-author-info">
            <img src="${safeUrl(authorAvatar)}" loading="lazy" decoding="async" class="gram-author-img author-clickable" data-author="${escapeHtml(post.author)}" onerror="this.onerror=null; this.src='${generateDefaultAvatar(post.author)}'" style="cursor: pointer;" />
            <div>
              <span class="gram-author-name author-clickable" data-author="${escapeHtml(post.author)}" style="cursor: pointer;" title="Persona: ${post.author}">${escapeHtml(authorDisplayName)}</span>
              ${
                // "Rooted" is most of the feed: only the exceptions get a badge here (the profile still shows it)
                authorTrust.label === "Rooted"
                  ? ""
                  : `<span class="gram-trust-badge ${authorTrust.badgeClass}" title="${escapeHtml(authorTrust.description)}">${authorTrust.icon} ${escapeHtml(authorTrust.label)}</span>`
              }
              ${
                // a plain thought is most of the feed: its icon is noise; moments and events keep theirs
                post.category === "thought"
                  ? ""
                  : `<span class="gram-category-tag ${escapeHtml(post.category)}" title="${escapeHtml(post.category)}">${renderIcon(CATEGORY_ICON[post.category] ?? "messageCircle", { className: "icon-xs", ariaLabel: post.category })}</span>`
              }
              ${authorIsMod ? `<span class="gram-trust-badge badge-mod" title="Moderator of r/${escapeHtml(postComm!.slug)}">mod</span>` : ""}
              ${
                post.is_nsfw
                  ? `<span class="gram-category-tag nsfw" title="18+ Adult Content (Moderated On-Device)">NSFW</span>`
                  : ""
              }
              ${
                post.community_id
                  ? `<span class="comm-badge community-link" data-community="${escapeHtml(post.community_id)}" title="View Community">r/${escapeHtml(post.community_id.replace(/^c_/, ""))}</span>`
                  : ""
              }
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="gram-time">${formatTimeAgo(post.timestamp)}</span>
            ${edit ? `<span class="gram-edited" title="Edited ${formatTimeAgo(edit.ts)}">edited</span>` : ""}
            ${
              globalMod && !isMyPost
                ? `${freenet.reportQueue().some((r) => r.target === `${post.author}:${post.id}`) ? `<button type="button" class="btn-sm btn-icon-text mod-report-flag" data-act="open-moderation" title="This post was reported - click to view in Moderation" style="background: rgba(239, 68, 68, 0.12); color: var(--danger); border: 1px solid var(--danger); border-radius: 999px; padding: 2px 8px; font-size: 0.72rem; font-weight: 600; cursor: pointer;">⚠️ Reported</button>` : ""}<button type="button" class="global-remove-btn btn-icon-text" data-post-id="${escapeHtml(post.id)}" data-author="${escapeHtml(post.author)}" title="Radica moderator: remove this post for everyone who follows Radica's moderation">${renderIcon("shield", { className: "icon-xs" })} <span>Remove</span></button>`
                : ""
            }
            ${
              isModOrOwner && !isMyPost
                ? `<button class="mod-delete-btn btn-icon-text" data-post-id="${escapeHtml(post.id)}" data-author="${escapeHtml(post.author)}" title="Moderator: Delete post from community">${renderIcon("shield", { className: "icon-xs" })} <span>Mod Delete</span></button>`
                : ""
            }
            ${
              isMyPost
                ? `<button class="edit-post-btn" data-post-id="${escapeHtml(post.id)}" title="Edit this post">${renderIcon("edit", { className: "icon-sm" })}</button><button class="delete-post-btn" data-post-id="${escapeHtml(post.id)}" title="Delete this post">${renderIcon("trash2", { className: "icon-sm" })}</button>`
                : ""
            }
          </div>
        </div>

        ${
          post.media_uri
            ? `
          <div class="gram-media ${post.is_nsfw ? "nsfw-shielded" : ""}" id="media-${post.id}">
            ${
              videoRef(post.media_uri)
                ? `${videoRef(post.media_uri)!.posterHash ? `<img class="video-poster" data-vposter="${escapeHtml(post.media_uri)}" alt="Video preview" />` : ""}<button type="button" class="video-load btn-icon-text" data-video="${escapeHtml(post.media_uri)}">\u25B6 <span>Play video</span></button>`
                : postImagesHtml(post.media_uri)
            }
            ${
              post.is_nsfw
                ? `
              <div class="nsfw-overlay" data-media-id="media-${post.id}">
                <div class="nsfw-overlay-card">
                  <div style="font-size: 1.2rem; margin-bottom: 6px; color: #ef4444; display: flex; align-items: center; justify-content: center;">${renderIcon("ban", { className: "icon-lg" })}</div>
                  <div style="font-weight: 700; font-size: 0.9rem;">Sensitive / Adult Media</div>
                  <div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 10px;">Scanned on-device by Desert Ant</div>
                  <button type="button" class="btn-reveal-nsfw btn-icon-text" data-media-id="media-${post.id}">${renderIcon("eye", { className: "icon-xs" })} <span>Click to View</span></button>
                </div>
              </div>
            `
                : ""
            }
          </div>
        `
            : ""
        }

        <div class="gram-content">
          ${(() => {
            const { html, card } = renderPost(caption, getAuthorDisplayName);
            const from = html ? translatableFrom(caption) : null;
            const translated = postTranslations.get(`${post.author}:${post.id}`);
            const translate = from
              ? `<button type="button" class="translate-btn" data-post-id="${escapeHtml(post.id)}" data-author="${escapeHtml(post.author)}" data-from="${from}">${translated === "" ? TRANSLATING : translated ? "Hide translation" : `Translate from ${LANGS[from]}`}</button>` +
                (translated ? `<p class="gram-translation">${escapeHtml(translated)}</p>` : "")
              : "";
            return (html ? `<p class="gram-caption">${html}</p>` : "") + translate + card + freetunesCard(caption) + freepollsCard(caption) + freenamesCard(caption) + deltaCard(caption) + ortoCard(caption) + asocialCard(caption) + fhCard(caption, nodeOrigin()) + wormholeCard(caption, nodeOrigin()) + freetreeCard(caption, nodeOrigin());
          })()}

          ${
            post.category === "event" && (post.location || post.event_date)
              ? `
            <div class="gram-event-details">
              ${post.event_date ? `<div class="btn-icon-text">${renderIcon("calendar", { className: "icon-xs" })} <span>Date: ${escapeHtml(post.event_date)}</span></div>` : ""}
              ${post.location ? `<div class="btn-icon-text">${renderIcon("mapPin", { className: "icon-xs" })} <span>Location: ${escapeHtml(post.location)}</span></div>` : ""}
            </div>
          `
              : ""
          }
        </div>

        <div class="gram-actions">
          <button class="action-btn like-btn ${isLiked ? "liked" : ""}" data-post-id="${escapeHtml(post.id)}" data-author="${escapeHtml(post.author)}" title="${isLiked ? "Unlike this post" : "Like this post"}">
            <span>${isLiked ? renderIcon("heartFilled", { className: "icon-sm", ariaLabel: "Liked" }) : renderIcon("heart", { className: "icon-sm", ariaLabel: "Like" })}</span>
            <span><span class="action-count">${likers(post).length}</span><span class="action-label"> ${likers(post).length === 1 ? "Like" : "Likes"}</span></span>
          </button>
          <button class="action-btn dislike-btn ${isDisliked ? "disliked" : ""}" data-post-id="${escapeHtml(post.id)}" data-author="${escapeHtml(post.author)}" title="${isDisliked ? "Remove dislike" : "Dislike this post"}">
            <span>${isDisliked ? renderIcon("thumbsDownFilled", { className: "icon-sm", ariaLabel: "Disliked" }) : renderIcon("thumbsDown", { className: "icon-sm", ariaLabel: "Dislike" })}</span>
            <span><span class="action-count">${dislikeCount}</span><span class="action-label"> ${dislikeCount === 1 ? "Dislike" : "Dislikes"}</span></span>
          </button>
          <button class="action-btn comment-count-btn" onclick="document.getElementById('comment-input-${post.id}')?.focus()">
            <span>${renderIcon("messageSquare", { className: "icon-sm" })}</span>
            <span><span class="action-count">${commentsArray.length}</span><span class="action-label"> ${commentsArray.length === 1 ? "Comment" : "Comments"}</span></span>
          </button>
          <button class="action-btn share-post-btn" data-post-id="${escapeHtml(post.id)}" data-author="${escapeHtml(post.author)}" title="Share post and view Freenet details">
            <span>${renderIcon("share2", { className: "icon-sm" })}</span>
            <span><span class="action-label"> Share</span></span>
          </button>
          <!-- the less frequent actions wait in a menu, so the row stays readable -->
          <details class="post-more">
            <summary class="action-btn" title="More actions" aria-label="More actions">${renderIcon("moreHorizontal", { className: "icon-sm" })}</summary>
            <div class="post-more-menu">
          <button class="action-btn save-post-btn ${saved ? "liked" : ""}" data-post-id="${escapeHtml(post.id)}" data-author="${escapeHtml(post.author)}" title="${saved ? "Remove from Saved" : "Save this post for later (kept on this device)"}" aria-pressed="${saved}">
            <span>${renderIcon("bookmark", { className: "icon-sm" })}</span>
            <span><span class="action-label"> ${saved ? "Saved" : "Save"}</span></span>
          </button>
          ${
            !isMyPost
              ? `<button class="action-btn talk-btn btn-icon-text" data-author="${escapeHtml(post.author)}" title="Direct Message" aria-label="Talk">
                   ${renderIcon("chat", { className: "icon-sm" })}
                   <span class="action-text">Talk</span>
                 </button>
                 <button class="action-btn hide-user-btn btn-icon-text" data-author="${escapeHtml(post.author)}" title="Hide all posts from this user on this device" aria-label="Hide user">
                   ${renderIcon("ban", { className: "icon-sm" })}
                   <span class="action-text">Hide</span>
                 </button>
                 <button class="action-btn report-post-btn btn-icon-text" data-author="${escapeHtml(post.author)}" data-post-id="${escapeHtml(post.id)}" title="Report this post" aria-label="Report">
                   ${renderIcon("alertTriangle", { className: "icon-sm" })}
                   <span class="action-text">Report</span>
                 </button>`
              : ""
          }
            </div>
          </details>
        </div>
        <div class="liked-by" id="liked-by-${post.id}">${reactionsByHtml(post)}</div>

        <div class="gram-comments">
          <div class="comments-list" id="comments-${post.id}">
            ${
              commentsArray.length > shownComments.length
                ? `<button type="button" class="show-all-comments" data-post-id="${escapeHtml(post.id)}">Show all ${commentsArray.length} comments</button>`
                : ""
            }
            ${
              unproven.length
                ? `<button type="button" class="show-unproven-comments" data-post-id="${escapeHtml(post.id)}">${unproven.length} comment${unproven.length === 1 ? "" : "s"} from newcomers without the anti-bot proof hidden: show</button>`
                : ""
            }
            ${shownComments
              .map(
                (c) => {
                  const commKey = `${c.author}:${c.id}`;
                  const cLikers = freenet.commentLikers(post.author, post.id, commKey);
                  const isCLiked = currentIdentity ? cLikers.includes(currentIdentity.pubkey) : false;
                  const cTooltip = cLikers.length > 0 ? `Liked by ${cLikers.map(getAuthorDisplayName).join(", ")}` : "Like comment";
                  const cFrom = translatableFrom(c.text);
                  const cTranslated = postTranslations.get(`${post.author}:${post.id}|${commKey}`);
                  const cTranslate = cFrom
                    ? `<button type="button" class="translate-btn comment-translate-btn" data-post-id="${escapeHtml(post.id)}" data-author="${escapeHtml(post.author)}" data-comment-key="${escapeHtml(commKey)}" data-from="${cFrom}" title="Translate from ${LANGS[cFrom]} on this device">${cTranslated === "" ? "Translating…" : cTranslated ? "Hide translation" : "Translate"}</button>`
                    : "";
                  return `
              <div class="comment-item" id="comment-${escapeHtml(c.id)}">
                <span class="comment-author author-clickable" data-author="${escapeHtml(c.author)}" style="cursor: pointer;" title="Persona: ${c.author}">${escapeHtml(getAuthorDisplayName(c.author))}:</span>
                <span class="comment-text">${renderComment(c.text, getAuthorDisplayName)}</span>
                <span class="comment-time" title="${escapeHtml(new Date(c.timestamp).toLocaleString())}">${formatTimeAgo(c.timestamp)}</span>
                <button type="button" class="comment-like-btn${isCLiked ? " liked" : ""}" data-post-id="${escapeHtml(post.id)}" data-author="${escapeHtml(post.author)}" data-comment-key="${escapeHtml(commKey)}" data-comment-author="${escapeHtml(c.author)}" title="${escapeHtml(cTooltip)}" aria-label="Like comment">
                  <span class="comment-heart">${isCLiked ? "❤️" : "🤍"}</span>${cLikers.length > 0 ? `<span class="comment-like-count">${cLikers.length}</span>` : ""}
                </button>
                ${cTranslate}
                ${globalMod && c.author !== me ? `<button type="button" class="comment-remove-btn" data-comment-author="${escapeHtml(c.author)}" data-comment-id="${escapeHtml(c.id)}" title="Radica moderator: remove this comment for everyone who follows Radica's moderation" aria-label="Remove comment as moderator">🛡️</button>` : ""}
                ${c.author === currentIdentity!.pubkey ? `<button type="button" class="comment-del-btn" data-post-id="${escapeHtml(post.id)}" data-author="${escapeHtml(post.author)}" data-key="${escapeHtml(commKey)}" title="Delete my comment" aria-label="Delete my comment">✕</button>` : ""}
                ${cTranslated ? `<div class="comment-translation">${escapeHtml(cTranslated)}</div>` : ""}
              </div>
            `;
                }
              )
              .join("")}
          </div>

          <form class="comment-form" data-post-id="${escapeHtml(post.id)}" data-author="${escapeHtml(post.author)}">
            <div class="comment-form-row">
              <div class="comment-input-wrap">
                <textarea id="comment-input-${post.id}" class="comment-input" rows="1" enterkeyhint="send" placeholder="Write a comment..."></textarea>
                <div class="comment-actions">
                  <button type="button" class="comment-btn-media comment-btn-file" data-post-id="${escapeHtml(post.id)}" title="Attach photo or GIF" aria-label="Attach photo or GIF">
                    ${renderIcon("image", { className: "icon-xs" })}
                  </button>
                  <button type="button" class="comment-btn-media comment-btn-gif" data-post-id="${escapeHtml(post.id)}" title="Choose a GIF" aria-label="Choose a GIF">
                    <span class="comment-gif-badge">GIF</span>
                  </button>
                  ${draftTranslateHtml(`comment-input-${post.id}`)}
                </div>
              </div>
              <button type="submit" class="btn-primary comment-submit-btn" style="padding: 4px 12px; font-size: 0.8rem;">Send</button>
            </div>
            <input type="file" id="comment-file-${post.id}" class="comment-file-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
            <div class="comment-staging" id="comment-staging-${post.id}" style="display: none;"></div>
          </form>
        </div>
      </article>
    `;
      cacheCard(post.id, { sig, html });
      return { key, html };
    });
  if (moreHtml) items.push({ key: "load-more", html: moreHtml });
  // a changed card is rebuilt (a new comment, "12m ago" turning "13m ago"): what is being typed in its comment box stays
  const typing = Array.from(postsContainer.querySelectorAll<HTMLTextAreaElement>(".comment-input")).filter((i) => i.value);
  const focused = document.activeElement instanceof HTMLTextAreaElement && document.activeElement.classList.contains("comment-input") ? document.activeElement : null;
  const caret = focused?.selectionStart ?? null;
  // a post being edited keeps its edit box (text, caret and focus) when its card is rebuilt under it
  const editing = Array.from(postsContainer.querySelectorAll<HTMLElement>(".edit-post-box")).map((box) => {
    const input = box.querySelector<HTMLTextAreaElement>("textarea")!;
    return { box, cardId: box.closest(".gram-card")!.id, focused: document.activeElement === input, sel: [input.selectionStart, input.selectionEnd] as const };
  });
  const openMenuCardId = postsContainer.querySelector("details.post-more[open]")?.closest(".gram-card")?.id;
  // Scroll Pinning: if reading down the feed (or focused on a post/input), anchor to the card currently in view
  // so incoming posts above or older posts loaded below do not cause layout shifts.
  const anchor = isFeedSwitch ? null : findFeedScrollAnchor(postsContainer);
  // sync passes redraw the feed every few seconds: only new or changed cards are built and touch the DOM
  reconcileItems(postsContainer, items, (el) => el.id || (el.classList.contains("load-more") ? "load-more" : undefined));
  if (openMenuCardId) {
    const card = document.getElementById(openMenuCardId);
    card?.querySelector("details.post-more")?.setAttribute("open", "");
    card?.classList.add("menu-open");
  }
  for (const { box, cardId, focused: had, sel } of editing) {
    if (box.isConnected) continue;
    const content = document.getElementById(cardId)?.querySelector(".gram-content");
    if (!content) continue;
    const shown = content.querySelector(".gram-caption");
    if (shown) shown.replaceWith(box);
    else content.prepend(box);
    if (had) {
      const input = box.querySelector("textarea")!;
      input.focus();
      input.setSelectionRange(sel[0], sel[1]);
    }
  }
  // the box itself moves into the new card: its text and the @mentions picked in it go along
  for (const old of new Set([...typing, ...(focused ? [focused] : [])])) {
    const now = old.isConnected ? null : document.getElementById(old.id);
    if (now) now.replaceWith(old);
  }
  if (focused && document.activeElement !== focused && focused.isConnected) {
    focused.focus();
    if (caret !== null) focused.setSelectionRange(caret, caret);
  }
  for (const pid of stagedCommentMedia.keys()) {
    renderCommentStaging(pid);
  }
  showMedia(postsContainer);
  fillFreetunes(postsContainer, (id) => freenet.appContract(id), nodeOrigin(), (pk) => freenet.freetunesArtist(pk));
  fillFreepolls(postsContainer, pollNet);
  fillFreenames(postsContainer, freenet);
  fillDelta(postsContainer, freenet);
  fillOrto(postsContainer);
  fillAsocial(postsContainer);
  fillFh(postsContainer, freenet, nodeOrigin());
  fillWormhole(postsContainer);

  if (anchor) {
    restoreScrollAnchor(anchor);
  }

  moreObserver?.disconnect();
  const moreBtn = document.getElementById("load-more-btn");
  if (moreBtn) {
    // reaching the button loads the next page by itself
    moreObserver = new IntersectionObserver((entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) {
        obs.disconnect();
        showMorePosts();
      }
    });
    moreObserver.observe(moreBtn);
  }
}

let moreObserver: IntersectionObserver | undefined;
const CARD_CACHE_MAX = 250;
const cardCache = new Map<string, { sig: unknown[]; html: string }>();
/** Comments shown under a post until "Show all" is pressed; the posts where it was pressed. */
const COMMENTS_SHOWN = 3;
const expandedComments = new Set<string>();
const revealedUnproven = new Set<string>();
function cacheCard(id: string, entry: { sig: unknown[]; html: string }): void {
  if (cardCache.size >= CARD_CACHE_MAX) {
    const oldestKey = cardCache.keys().next().value;
    if (oldestKey) cardCache.delete(oldestKey);
  }
  cardCache.set(id, entry);
}

/** Draw one card again from scratch (the feed otherwise reuses an unchanged card's DOM, editor included). */
function redrawCard(postId: string) {
  cardCache.delete(postId);
  document.getElementById(`card-${postId}`)?.remove(); // an identical html would keep the old node, editor and all
  renderTimeline();
}

/** Post translations made on this device this session, by "author:id"; shown under the original. */
const postTranslations = new Map<string, string>();
const TRANSLATING = "Translating on this device… (the first time downloads the language model)";

/** Translate a post's (or one of its comments') text on this device and show it under the original; pressed again, hide it. */
async function translatePostFromCard(btn: HTMLButtonElement) {
  const { postId, author, from, commentKey } = btn.dataset;
  const post = timelinePosts.find((p) => p.id === postId && p.author === author);
  const comment = commentKey ? post?.comments?.[commentKey] : undefined;
  const key = `${post?.author}:${post?.id}` + (commentKey ? `|${commentKey}` : "");
  if (!post || !from || (commentKey && !comment) || postTranslations.get(key) === "") return;
  if (postTranslations.delete(key)) return redrawCard(post.id);
  postTranslations.set(key, ""); // "" = in progress, so a redraw meanwhile keeps saying so
  redrawCard(post.id);
  try {
    const text = comment ? comment.text : (freenet.postEdit(post.author, post.id)?.caption ?? post.caption);
    postTranslations.set(key, await translateText(text, from, readerLang()));
  } catch (err: any) {
    postTranslations.delete(key);
    showToast("Could not translate: " + (err?.message || String(err)), "error");
  }
  redrawCard(post.id);
}

/** Personal data in what I am about to publish is asked about, not silently removed. False: I go back and edit. */
function okToPublish(text: string): boolean {
  const found = personalDataIn(text);
  return !found.length || confirm(`This contains: ${found.join(", ")}.\n\nEveryone who can read it will see it. Publish it as written?`);
}

/** Turn my post's caption into an editor: what it says now (the newest edit, or the original). */
function startEditPost(postId: string) {
  const me = currentIdentity?.pubkey;
  const post = timelinePosts.find((p) => p.id === postId && p.author === me);
  const content = document.getElementById(`card-${postId}`)?.querySelector(".gram-content");
  if (!me || !post || !content || content.querySelector(".edit-post-box")) return;
  const box = document.createElement("div");
  box.className = "edit-post-box";
  box.innerHTML = `<textarea class="composer-input edit-post-input" maxlength="4000" aria-label="Edit post"></textarea>
    <div class="edit-post-actions"><button type="button" class="btn-secondary btn-sm edit-post-cancel" data-post-id="${escapeHtml(postId)}">Cancel</button>
    <button type="button" class="btn-primary btn-sm edit-post-save" data-post-id="${escapeHtml(postId)}">Save</button></div>`;
  const input = box.querySelector("textarea")!;
  input.value = freenet.postEdit(me, postId)?.caption ?? post.caption;
  const shown = content.querySelector(".gram-caption");
  if (shown) shown.replaceWith(box);
  else content.prepend(box);
  input.focus();
}

async function saveEditPost(postId: string) {
  const input = document.getElementById(`card-${postId}`)?.querySelector<HTMLTextAreaElement>(".edit-post-input");
  const text = input?.value.trim();
  if (!input || !text) return showToast("A post cannot be empty: delete it instead.", "warning");
  if (!okToPublish(text)) return;
  input.disabled = true;
  try {
    await freenet.editPost(postId, text);
    redrawCard(postId);
  } catch (err: any) {
    input.disabled = false;
    showToast("Could not save the edit: " + (err?.message || String(err)), "error");
  }
}

function showMorePosts() {
  visiblePosts += POSTS_PER_PAGE;
  renderTimeline();
}


const HEX64 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[\w-]{1,100}$/;

/** The image attribute of a post's media: an image in its own contract is loaded when it nears the screen (showMedia). */
/** A post's image, or a swipeable carousel of its images. */
function postImagesHtml(uri: string): string {
  const list = mediaUris(uri);
  const imgs = list.map((u) => `<img ${mediaAttr(u)} alt="Post media" loading="lazy" decoding="async" onerror="this.style.display='none'" />`).join("");
  if (list.length < 2) return imgs;
  return `<div class="carousel"><div class="carousel-track">${imgs}</div><button type="button" class="carousel-nav prev" aria-label="Previous photo">\u2039</button><button type="button" class="carousel-nav next" aria-label="Next photo">\u203A</button><span class="carousel-count">1/${list.length}</span></div>`;
}

function mediaAttr(uri: string | undefined): string {
  const h = mediaRef(uri);
  return h ? `data-media="${h}"` : `src="${safeUrl(uri)}"`;
}

const mediaObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const img = e.target as HTMLImageElement;
      mediaObserver.unobserve(img);
      // not on the network yet: left empty, tried again on the next draw
      const get = (h: string) => freenet.getMedia(h);
      void (img.dataset.vposter ? videoPosterUrl(img.dataset.vposter, get) : mediaUrl(img.dataset.media!, get)).then((u) => u && (img.src = u));
    }
  },
  { rootMargin: "600px" }
);
/** Start loading the not yet shown images under `root`. */
function showMedia(root: ParentNode) {
  root.querySelectorAll<HTMLImageElement>("img[data-media]:not([src]), img[data-vposter]:not([src])").forEach((img) => mediaObserver.observe(img));
}

async function handleFreenameLink(a: HTMLAnchorElement, e: Event): Promise<boolean> {
  const fnName = a.dataset.freenames || a.closest<HTMLElement>(".fn-card")?.dataset.freenames;
  if (!fnName) return false;
  if (a.dataset.resolved === "true" || a.closest<HTMLElement>(".fn-card")?.dataset.resolved === "true") return false;
  e.preventDefault();
  e.stopPropagation();
  try {
    const res = await freenet.resolveFreename(fnName);
    if (res?.target) {
      a.dataset.resolved = "true";
      const card = a.closest<HTMLElement>(".fn-card");
      if (card) {
        card.dataset.resolved = "true";
        const titleEl = card.querySelector<HTMLElement>(".fn-card-title");
        if (titleEl) titleEl.textContent = `Open site (${res.target.slice(0, 6)}\u2026${res.target.slice(-4)})`;
      }
      const origin = nodeOrigin();
      const subpath = (a.dataset.subpath || card?.dataset.subpath || "").replace(/^\//, "");
      const fullUrl = `${origin}/v1/contract/web/${res.target}/${subpath}`;
      a.href = fullUrl;
      a.title = `FreeNames: ${fnName} \u2192 ${res.target}`;
      const w = window.open(fullUrl, "_blank");
      if (w) w.opener = null;
      else goTo(fullUrl);
      return true;
    }
  } catch (err) {
    console.warn("FreeNames resolution failed:", err);
  }
  const fallback = a.href;
  const w = window.open(fallback, "_blank");
  if (w) w.opener = null;
  else goTo(fallback);
  return true;
}

function openPostLink(this: HTMLAnchorElement, e: Event) {
  e.stopPropagation();
  const fnName = this.dataset.freenames || this.closest<HTMLElement>(".fn-card")?.dataset.freenames;
  if (fnName && this.dataset.resolved !== "true" && this.closest<HTMLElement>(".fn-card")?.dataset.resolved !== "true") {
    void handleFreenameLink(this, e);
    return;
  }
  const href = this.getAttribute("href") || this.href;
  if (/(?:[?#&]invitation=|[#&]river_invite=|[#&]join_room=)/.test(href)) {
    e.preventDefault();
    void handleJoinFromInviteUrl(href);
    return;
  }
  if (/#post=[^&]+/.test(href)) {
    e.preventDefault();
    try {
      const u = new URL(href, window.location.href);
      const hash = u.hash ? u.hash.substring(1) : "";
      const params = new URLSearchParams(hash);
      const postId = params.get("post");
      const author = params.get("author") || undefined;
      if (postId) {
        void showMyPost(postId, author);
        return;
      }
    } catch {}
  }
  if (window.parent === window) return; // normal page: the browser follows the link
  e.preventDefault();
  const w = window.open(this.href, "_blank"); // not "noopener": that always returns null, and null is how we notice a blocked popup
  if (w) w.opener = null;
  else goTo(this.href);
}

// an open post menu closes on a click elsewhere or on Escape
const closePostMenus = (keep?: Element | null) =>
  document.querySelectorAll<HTMLDetailsElement>("details.post-more[open]").forEach((d) => {
    if (d !== keep) {
      d.open = false;
      d.closest(".gram-card")?.classList.remove("menu-open");
    }
  });
document.addEventListener("click", (e) => closePostMenus((e.target as Element).closest("details.post-more")));
document.addEventListener("keydown", (e) => e.key === "Escape" && closePostMenus());
// toggle does not bubble: capture intercepts whenever a menu opens or closes (by click, keyboard or script)
document.addEventListener(
  "toggle",
  (e) => {
    const d = e.target as HTMLDetailsElement;
    if (d?.classList?.contains("post-more")) {
      d.closest(".gram-card")?.classList.toggle("menu-open", d.open);
    }
  },
  true
);

/** The icon that stands for a post's kind next to the author's name. */
const CATEGORY_ICON: Record<string, IconName> = { thought: "messageCircle", moment: "camera", event: "calendar" };

/** One step for Back to undo. A browser that refuses history entries in the sandboxed page must not break what opened. */
function pushBackStep(step: "page" | "thread" | "drawer") {
  try {
    history.pushState({ radica: step }, "");
  } catch {}
}

// One pair of listeners on the feed, set up once: cards come and go as the feed is reconciled, so none sit on the cards.
function initCardListeners() {
  // scroll does not bubble: caught on the way down
  postsContainer.addEventListener(
    "scroll",
    (e) => {
      const track = e.target as HTMLElement;
      if (!track.classList?.contains("carousel-track")) return;
      const count = track.parentElement!.querySelector(".carousel-count")!;
      count.textContent = `${Math.round(track.scrollLeft / track.clientWidth) + 1}/${track.children.length}`;
    },
    true
  );
  postsContainer.addEventListener("click", (e) => {
    const t = e.target as Element;
    const hit = <T extends HTMLElement = HTMLElement>(sel: string) => t.closest<T>(sel);
    let el: HTMLElement | null;
    if (t.closest(".post-more-menu button")) {
      const d = t.closest<HTMLDetailsElement>("details.post-more");
      if (d) {
        d.open = false;
        d.closest(".gram-card")?.classList.remove("menu-open");
      }
    }
    if ((el = hit(".btn-reveal-nsfw, .nsfw-overlay"))) {
      e.stopPropagation();
      document.getElementById(el.dataset.mediaId!)?.classList.toggle("revealed"); // NSFW reveal toggle
    } else if ((el = hit(".carousel-nav"))) {
      const track = el.parentElement!.querySelector(".carousel-track")!;
      track.scrollBy({ left: (el.classList.contains("prev") ? -1 : 1) * track.clientWidth, behavior: "smooth" });
    } else if ((el = hit(".video-load"))) {
      // Fetched only on click: a video is many MB, and nothing is downloaded the reader did not ask for.
      const btn = el as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = "Loading video…";
      let got = { done: 0, total: 0, missing: 0 };
      const onProgress = (done: number, total: number, missing: number) => {
        got = { done, total, missing };
        btn.textContent = `Loading video… ${done}/${total} pieces`;
      };
      const missingText = () =>
        // total 0: not even the list of pieces (the manifest) arrived
        got.total ? `${got.missing} of ${got.total} pieces not found on this node yet. Try again` : "Video not found on this node yet. Try again";
      const poster = btn.parentElement?.querySelector<HTMLImageElement>(".video-poster");
      const { video, done } = playVideo(btn.dataset.video!, (h) => freenet.getMedia(h), onProgress, (v) => {
        // shown as soon as it can play: with the first pieces when it streams, else once whole
        v.poster = poster?.src ?? "";
        poster?.remove();
        btn.replaceWith(v);
      });
      void done.then((ok) => {
        if (ok) return;
        // shown early but nothing playable came (not streamable, and pieces missing): a greyed player at 0:00 helps
        // nobody, so the Play button comes back with what is missing
        if (!btn.isConnected && video.readyState === 0) {
          video.replaceWith(btn);
          if (poster) btn.before(poster);
        }
        if (btn.isConnected) {
          btn.disabled = false;
          btn.textContent = missingText();
        } else showToast(`The video stopped: ${missingText()}`, "warning"); // it streamed, then pieces were missing
      });
    } else if ((el = hit(".clickable-hashtag"))) {
      e.stopPropagation();
      setTagFilter(el.dataset.tag!);
    } else if ((el = hit(".community-link"))) {
      e.stopPropagation();
      const cId = el.dataset.community!;
      const found = allCommunities.find((c) => c.id === cId || c.slug === cId);
      if (found) selectCommunity(found);
    } else if ((el = hit<HTMLAnchorElement>(".post-link, .fn-card-inner"))) {
      // links in posts: open in a new tab; the sandboxed page may not be allowed to, so fall back to the shell
      openPostLink.call(el as HTMLAnchorElement, e);
    } else if ((el = hit(".talk-btn"))) {
      openChatWithPeer(el.dataset.author!);
    } else if ((el = hit(".hide-user-btn"))) {
      const author = el.dataset.author!;
      if (!confirm(`Hide all posts from ${getAuthorDisplayName(author)} on this device?\n\nYou can unhide them from Blocklists or from their profile.`)) return;
      setUserHidden(author, true);
      renderTimeline();
      if (blocklistsModal.style.display === "flex") renderBlocklists();
    } else if ((el = hit(".mod-report-flag"))) {
      paintModButton();
      showBlocklistTab("moderation");
      blocklistsModal.style.display = "flex";
      renderModDashboard();
    } else if ((el = hit(".report-post-btn"))) {
      void reportPostFromCard(el);
    } else if ((el = hit(".share-post-btn"))) {
      void openSharePostModal(el.dataset.postId!, el.dataset.author!);
    } else if ((el = hit(".comment-del-btn"))) {
      void deleteCommentFromCard(el);
    } else if ((el = hit(".comment-like-btn"))) {
      void toggleCommentLikeFromButton(el);
    } else if ((el = hit(".mod-delete-btn"))) {
      void modDeleteFromCard(el);
    } else if ((el = hit(".global-remove-btn"))) {
      const post = timelinePosts.find((p) => p.id === el!.dataset.postId && p.author === el!.dataset.author);
      if (post && confirm("Remove this post for everyone who follows Radica's moderation? Its picture or video is hidden wherever it is posted again. You can undo it in Blocklists."))
        void globalRemove(post.author, post.id, postMediaHash(post));
    } else if ((el = hit(".comment-remove-btn"))) {
      if (confirm("Remove this comment for everyone who follows Radica's moderation? You can undo it in Blocklists."))
        void globalRemove(el.dataset.commentAuthor!, el.dataset.commentId!);
    } else if ((el = hit(".btn-reveal-wot"))) {
      const pid = el.dataset.postId;
      if (pid) {
        revealedWotPosts.add(pid);
        renderTimeline();
      }
    } else if ((el = hit(".delete-post-btn"))) {
      void deletePostFromCard(el);
    } else if ((el = hit(".save-post-btn"))) {
      const post = timelinePosts.find((p) => p.id === el!.dataset.postId && p.author === el!.dataset.author);
      if (post && currentIdentity) {
        showToast(toggleSaved(currentIdentity.pubkey, post) ? "Saved: find it under Saved." : "Removed from Saved.", "info");
        if (currentFeedScope === "saved") void reloadPosts();
        else redrawCard(post.id);
        void updateMyPostsAndScopeCounts();
      }
    } else if ((el = hit(".show-unproven-comments"))) {
      revealedUnproven.add(el.dataset.postId!);
      redrawCard(el.dataset.postId!);
    } else if ((el = hit(".show-all-comments"))) {
      expandedComments.add(el.dataset.postId!);
      redrawCard(el.dataset.postId!);
    } else if ((el = hit(".translate-btn"))) {
      void translatePostFromCard(el as HTMLButtonElement);
    } else if ((el = hit(".edit-post-btn"))) {
      startEditPost(el.dataset.postId!);
    } else if ((el = hit(".edit-post-save"))) {
      void saveEditPost(el.dataset.postId!);
    } else if ((el = hit(".edit-post-cancel"))) {
      redrawCard(el.dataset.postId!);
    } else if ((el = hit(".dislike-btn"))) {
      void toggleDislikeFromCard(el);
    } else if ((el = hit(".like-btn"))) {
      void toggleLikeFromCard(el);
    } else if ((el = hit(".load-more .btn-secondary, #load-more-btn"))) {
      showMorePosts();
    } else if ((el = hit(".author-clickable"))) {
      openUserProfile(el.dataset.author!);
    } else if ((el = hit(".comment-btn-file"))) {
      const pid = el.dataset.postId;
      if (pid) {
        const fileInput = document.getElementById(`comment-file-${pid}`) as HTMLInputElement | null;
        fileInput?.click();
      }
    } else if ((el = hit(".comment-btn-gif"))) {
      const pid = el.dataset.postId;
      if (pid) {
        openGifPicker({
          onSelect: (url) => {
            stageCommentUrl(pid, url);
          },
        });
      }
    } else if ((el = hit(".comment-staging-remove"))) {
      const pid = el.dataset.postId;
      if (pid) {
        removeStagedCommentMedia(pid);
      }
    }
  });

  postsContainer.addEventListener("change", (e) => {
    const input = (e.target as Element).closest<HTMLInputElement>(".comment-file-input");
    if (!input || !input.files?.[0]) return;
    const form = input.closest<HTMLFormElement>(".comment-form");
    const postId = form?.dataset.postId;
    if (postId) {
      void stageCommentFile(postId, input.files[0]);
      input.value = "";
    }
  });

  postsContainer.addEventListener("paste", (e) => {
    const input = (e.target as Element).closest<HTMLTextAreaElement>(".comment-input");
    if (!input) return;
    const form = input.closest<HTMLFormElement>(".comment-form");
    const postId = form?.dataset.postId;
    if (!postId) return;

    const files = e.clipboardData?.files;
    if (files && files.length > 0 && files[0].type.startsWith("image/")) {
      e.preventDefault();
      void stageCommentFile(postId, files[0]);
      return;
    }
    const text = e.clipboardData?.getData("text/plain")?.trim();
    if (
      text &&
      (/^https?:\/\/.+\.(?:gif|png|jpe?g|webp)(?:\?.*)?$/i.test(text) ||
        /^https?:\/\/(?:media\d*\.giphy\.com|media\.tenor\.com)\/.+/i.test(text))
    ) {
      e.preventDefault();
      stageCommentUrl(postId, text);
    }
  });

  // a comment box: Enter sends, Shift+Enter starts a new line; the box grows with its lines
  postsContainer.addEventListener("keydown", (e) => {
    const box = (e.target as Element).closest<HTMLTextAreaElement>("textarea.comment-input");
    if (!box || e.key !== "Enter" || e.shiftKey || e.isComposing || e.defaultPrevented) return;
    e.preventDefault();
    box.form?.requestSubmit();
  });
  postsContainer.addEventListener("input", (e) => {
    const box = (e.target as Element).closest<HTMLTextAreaElement>("textarea.comment-input");
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  });

  postsContainer.addEventListener("dragover", (e) => {
    const form = (e.target as Element).closest<HTMLFormElement>(".comment-form");
    if (!form) return;
    e.preventDefault();
  });

  postsContainer.addEventListener("drop", (e) => {
    const form = (e.target as Element).closest<HTMLFormElement>(".comment-form");
    if (!form) return;
    const postId = form.dataset.postId;
    if (!postId) return;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && files[0].type.startsWith("image/")) {
      e.preventDefault();
      void stageCommentFile(postId, files[0]);
    }
  });

  postsContainer.addEventListener("submit", (e) => {
    const form = (e.target as Element).closest<HTMLFormElement>(".comment-form");
    if (!form) return;
    e.preventDefault();
    void submitCommentFromCard(form);
  });
}

function paintCommentLikeButton(btn: HTMLElement, likers: string[], isLiked: boolean) {
  btn.classList.toggle("liked", isLiked);
  const heart = isLiked ? "❤️" : "🤍";
  const countHtml = likers.length > 0 ? `<span class="comment-like-count">${likers.length}</span>` : "";
  btn.innerHTML = `<span class="comment-heart">${heart}</span>${countHtml}`;
  const names = likers.map(getAuthorDisplayName).join(", ");
  btn.title = likers.length > 0 ? `Liked by ${names}` : "Like comment";
}

async function toggleCommentLikeFromButton(btn: HTMLElement) {
  const identity = currentIdentity;
  if (!identity) return;
  const { postId, author, commentKey, commentAuthor } = btn.dataset as {
    postId: string;
    author: string;
    commentKey: string;
    commentAuthor: string;
  };
  if (!postId || !author || !commentKey) return;

  const idx = timelinePosts.findIndex((p) => p.id === postId);
  const post = idx !== -1 ? timelinePosts[idx] : undefined;
  const comment = post?.comments[commentKey];
  const commentText = comment?.text || "";

  const currentLikers = freenet.commentLikers(author, postId, commentKey);
  const wasLiked = currentLikers.includes(identity.pubkey);
  const nextLiked = !wasLiked;

  const optimisticLikers = nextLiked
    ? [...currentLikers.filter((k) => k !== identity.pubkey), identity.pubkey]
    : currentLikers.filter((k) => k !== identity.pubkey);

  paintCommentLikeButton(btn, optimisticLikers, nextLiked);

  try {
    await freenet.toggleCommentLike(
      identity,
      author,
      postId,
      commentKey,
      commentAuthor,
      commentText
    );
  } catch (err) {
    console.error("Failed to toggle comment like:", err);
    showToast("Could not like comment.", "error");
    paintCommentLikeButton(btn, currentLikers, wasLiked);
  }
}

async function deleteCommentFromCard(btn: HTMLElement) {
  if (!currentIdentity || !confirm("Delete this comment?")) return;
  const { postId, author, key } = btn.dataset as { postId: string; author: string; key: string };
  const idx = timelinePosts.findIndex((p) => p.id === postId);
  const post = idx !== -1 ? timelinePosts[idx] : undefined;
  const old = post?.comments[key];
  if (post && old) {
    // ponytail: clone post in timelinePosts so freenet.feedCache is not mutated before freenet.deleteComment reads old.text
    timelinePosts[idx] = { ...post, comments: { ...post.comments, [key]: { ...old, text: "" } } };
    renderTimeline();
  }
  const ok = await freenet.deleteComment(currentIdentity, author, postId, key).catch(() => false);
  if (!ok) {
    showToast("Could not delete the comment.", "error");
    if (post && old && idx !== -1) {
      timelinePosts[idx] = post;
      renderTimeline();
    }
  }
}

/** Emergency moderation of the public timeline: a report on my blocklist, which everyone following the maintainer's follows. */
async function globalRemove(author: string, id: string, media?: string | null) {
  try {
    await freenet.reportPost(author, id, "Removed by Radica's moderators", media);
    showToast("Removed for everyone who follows Radica's moderation.", "info");
  } catch (e) {
    showToast(`Could not remove it: ${(e as Error).message}`, "error");
  }
  renderTimeline();
}

async function modDeleteFromCard(btn: HTMLElement) {
  if (!currentIdentity || !activeCommunity) return;
  const postId = btn.dataset.postId!;
  const author = btn.dataset.author!;
  if (!confirm(`Moderator Action: Remove this post from r/${activeCommunity.slug}?`)) return;

  const res = await freenet.modDeletePost(currentIdentity, activeCommunity.id, postId, author);
  alert(res.msg);
  if (res.success) {
    if (!activeCommunity.deleted_post_ids.includes(postId)) {
      activeCommunity.deleted_post_ids.push(postId);
    }
    renderTimeline();
  }
}

async function deletePostFromCard(btn: HTMLElement) {
  const postId = btn.dataset.postId!;
  if (!confirm("Are you sure you want to delete this post from Freenet?")) return;
  if (!currentIdentity) return;

  const prev = [...timelinePosts];
  timelinePosts = timelinePosts.filter((p) => p.id !== postId);
  const card = document.getElementById(`card-${postId}`);
  if (card) {
    card.style.transition = "opacity 0.2s, transform 0.2s";
    card.style.opacity = "0";
    card.style.transform = "scale(0.98)";
    setTimeout(() => card.remove(), 200);
  } else {
    renderTimeline();
  }

  freenet.deletePost(currentIdentity, postId).catch((err) => {
    console.error("Failed to delete post:", err);
    showToast("Could not delete post from Freenet.", "error");
    timelinePosts = prev;
    renderTimeline();
  });
}

async function toggleLikeFromCard(target: HTMLElement) {
  const postId = target.dataset.postId!;
  const author = target.dataset.author!;
  const identity = currentIdentity;
  if (!identity) return;

  const idx = timelinePosts.findIndex((p) => p.id === postId);
  if (idx === -1) return;
  const post = timelinePosts[idx];

  const currentlyLiked = !!post.likes?.[identity.pubkey]?.liked;
  const newLiked = !currentlyLiked;
  // ponytail: clone post in timelinePosts so freenet.feedCache is not mutated before freenet.toggleLike reads current liked state
  const optimisticPost: Post = { ...post, likes: { ...post.likes, [identity.pubkey]: { liked: newLiked, ts: Date.now(), sig: "" } } };
  timelinePosts[idx] = optimisticPost;

  const card = document.getElementById(`card-${postId}`);
  const btnEl = card?.querySelector(`.like-btn[data-post-id="${postId}"]`) as HTMLButtonElement | null;
  if (btnEl) {
    btnEl.classList.toggle("liked", newLiked);
    btnEl.innerHTML = `<span>${newLiked ? renderIcon("heartFilled", { className: "icon-sm", ariaLabel: "Liked" }) : renderIcon("heart", { className: "icon-sm", ariaLabel: "Like" })}</span> <span><span class="action-count">${likers(optimisticPost).length}</span><span class="action-label"> ${likers(optimisticPost).length === 1 ? "Like" : "Likes"}</span></span>`;
  }

  // Mutual exclusivity: if liking, remove any existing dislike
  const curDislikers = freenet.postDislikers(author, postId);
  if (newLiked && curDislikers.includes(identity.pubkey)) {
    const dislikeBtn = card?.querySelector(`.dislike-btn[data-post-id="${postId}"]`) as HTMLButtonElement | null;
    const nextDislikers = curDislikers.filter((k) => k !== identity.pubkey);
    if (dislikeBtn) {
      dislikeBtn.classList.remove("disliked");
      dislikeBtn.innerHTML = `<span>${renderIcon("thumbsDown", { className: "icon-sm", ariaLabel: "Dislike" })}</span> <span><span class="action-count">${nextDislikers.length}</span><span class="action-label"> ${nextDislikers.length === 1 ? "Dislike" : "Dislikes"}</span></span>`;
    }
    void freenet.toggleDislike(identity, author, postId).catch((err) => console.error("Failed to undislike on like:", err));
  }

  paintReactionsBy(optimisticPost);
  updateNotificationsBadge();

  freenet.toggleLike(identity, author, postId).catch((err) => {
    console.error("Failed to toggle like:", err);
    const curIdx = timelinePosts.findIndex((p) => p.id === postId);
    if (curIdx !== -1) timelinePosts[curIdx] = post;
    const b = document.getElementById(`card-${postId}`)?.querySelector(`.like-btn[data-post-id="${postId}"]`) as HTMLButtonElement | null;
    if (b) {
      b.classList.toggle("liked", currentlyLiked);
      b.innerHTML = `<span>${currentlyLiked ? renderIcon("heartFilled", { className: "icon-sm", ariaLabel: "Liked" }) : renderIcon("heart", { className: "icon-sm", ariaLabel: "Like" })}</span> <span><span class="action-count">${likers(post).length}</span><span class="action-label"> ${likers(post).length === 1 ? "Like" : "Likes"}</span></span>`;
      paintReactionsBy(post);
    }
    updateNotificationsBadge();
  });
}

async function toggleDislikeFromCard(btn: HTMLElement) {
  const postId = btn.dataset.postId!;
  const author = btn.dataset.author!;
  const identity = currentIdentity;
  if (!identity) return;

  const curDislikers = freenet.postDislikers(author, postId);
  const currentlyDisliked = curDislikers.includes(identity.pubkey);
  const newDisliked = !currentlyDisliked;

  const card = document.getElementById(`card-${postId}`);
  const dislikeBtn = card?.querySelector(`.dislike-btn[data-post-id="${postId}"]`) as HTMLButtonElement | null;
  const likeBtn = card?.querySelector(`.like-btn[data-post-id="${postId}"]`) as HTMLButtonElement | null;

  const idx = timelinePosts.findIndex((p) => p.id === postId);
  const post = idx !== -1 ? timelinePosts[idx] : undefined;

  // Mutual exclusivity: if disliking, remove any existing like
  const currentlyLiked = !!post?.likes?.[identity.pubkey]?.liked;
  let optimisticPost = post;
  if (newDisliked && currentlyLiked && post) {
    optimisticPost = { ...post, likes: { ...post.likes, [identity.pubkey]: { liked: false, ts: Date.now(), sig: "" } } };
    timelinePosts[idx] = optimisticPost;
    if (likeBtn) {
      likeBtn.classList.remove("liked");
      likeBtn.innerHTML = `<span>${renderIcon("heart", { className: "icon-sm", ariaLabel: "Like" })}</span> <span><span class="action-count">${likers(optimisticPost).length}</span><span class="action-label"> ${likers(optimisticPost).length === 1 ? "Like" : "Likes"}</span></span>`;
    }
    void freenet.toggleLike(identity, author, postId).catch((err) => console.error("Failed to unlike on dislike:", err));
  }

  const nextDislikers = newDisliked
    ? [...curDislikers.filter((k) => k !== identity.pubkey), identity.pubkey]
    : curDislikers.filter((k) => k !== identity.pubkey);

  if (dislikeBtn) {
    dislikeBtn.classList.toggle("disliked", newDisliked);
    dislikeBtn.innerHTML = `<span>${newDisliked ? renderIcon("thumbsDownFilled", { className: "icon-sm", ariaLabel: "Disliked" }) : renderIcon("thumbsDown", { className: "icon-sm", ariaLabel: "Dislike" })}</span> <span><span class="action-count">${nextDislikers.length}</span><span class="action-label"> ${nextDislikers.length === 1 ? "Dislike" : "Dislikes"}</span></span>`;
  }
  if (optimisticPost) paintReactionsBy(optimisticPost);

  freenet.toggleDislike(identity, author, postId).catch((err) => {
    console.error("Failed to toggle dislike:", err);
    renderTimeline();
  });
}

/** Report a post: it goes on my public blocklist (hidden for me and whoever trusts my list) and, in a community, its
 *  owner and moderators get a notification that opens it. */
/** The hash naming a post's image or video (the same file posted again has the same one), or null. */
const postMediaHash = (p: Post) => mediaRef(mediaUris(p.media_uri)[0]) ?? videoRef(p.media_uri)?.hash ?? null;

async function reportPostFromCard(el: HTMLElement) {
  const author = el.dataset.author!;
  const postId = el.dataset.postId!;
  const post = timelinePosts.find((p) => p.id === postId && p.author === author);
  const comm = post?.community_id ? allCommunities.find((c) => c.id === post.community_id || c.slug === post.community_id) : undefined;
  const reason = prompt(
    `Report this post by ${getAuthorDisplayName(author)}?\n\nWhy (spam, abuse, illegal content…)? It is hidden for you and for whoever trusts your blocklist; ${comm ? `moderators of r/${comm.slug}` : "Radica's maintainer and moderators"} are notified.`
  );
  if (reason === null) return;
  try {
    await freenet.reportPost(author, postId, reason.trim(), post ? postMediaHash(post) : null, !post?.community_id); // public posts also go to Radica's moderators
    const postAuthorName = getAuthorDisplayName(author);
    const targetLabel = author === currentIdentity?.pubkey ? "your" : `@${postAuthorName}'s`;
    const text = comm
      ? `reported ${targetLabel} post in r/${comm.slug}${reason.trim() ? `: "${reason.trim().slice(0, 80)}"` : ""}`
      : `reported ${targetLabel} post${reason.trim() ? `: "${reason.trim().slice(0, 80)}"` : ""}`;

    const recipients = new Set<string>();
    // Radica maintainer and global moderators
    recipients.add(DEFAULT_CURATOR);
    for (const mod of freenet.modsOf(DEFAULT_CURATOR)) {
      recipients.add(mod);
    }
    // If inside a community, also notify its creator and moderators
    if (comm) {
      recipients.add(comm.creator);
      for (const mod of comm.moderators) recipients.add(mod);
    }

    for (const recipient of recipients) {
      void freenet.addNotification(recipient, {
        type: "report",
        from: currentIdentity?.pubkey || "",
        text,
        linkPostId: postId,
        linkPostOwner: author,
      }).catch(() => {});
    }
    updateBlocklistsBadge();
    showToast("Post reported.");
  } catch (err: any) {
    alert(`Could not report the post: ${err?.message || err}`);
  }
  renderTimeline();
}

/** "Liked by A, B · Disliked by X": the names open the reactor's profile. */
function reactionsByHtml(post: Post): string {
  const likeKeys = likers(post);
  const dislikeKeys = freenet.postDislikers(post.author, post.id);
  const parts: string[] = [];
  const wot = getWebOfTrust();

  if (likeKeys.length) {
    const names = likeKeys
      .slice(0, 3)
      .map((k) => `<span class="author-clickable" data-author="${escapeHtml(k)}">${escapeHtml(getAuthorDisplayName(k))}</span>`)
      .join(", ");
    parts.push(`Liked by ${names}${likeKeys.length > 3 ? ` and ${likeKeys.length - 3} more` : ""}`);
  }

  if (dislikeKeys.length) {
    const names = dislikeKeys
      .slice(0, 3)
      .map((k) => {
        const isTrusted = wot.isTrusted(k);
        const name = escapeHtml(getAuthorDisplayName(k));
        return `<span class="author-clickable${isTrusted ? " wot-trusted" : ""}" data-author="${escapeHtml(k)}" title="${isTrusted ? "In your Web-of-Trust" : ""}">${name}${isTrusted ? " 🛡️" : ""}</span>`;
      })
      .join(", ");
    parts.push(`Disliked by ${names}${dislikeKeys.length > 3 ? ` and ${dislikeKeys.length - 3} more` : ""}`);
  }

  return parts.join(" · ");
}
function paintReactionsBy(post: Post): void {
  const el = document.getElementById(`liked-by-${post.id}`);
  if (el) el.innerHTML = reactionsByHtml(post);
}

async function submitCommentFromCard(target: HTMLFormElement) {
  const postId = target.dataset.postId!;
  const author = target.dataset.author!;
  const input = target.querySelector(".comment-input") as HTMLTextAreaElement;
  const text = input.value.trim();
  const identity = currentIdentity;
  const staged = stagedCommentMedia.get(postId);
  if ((!text && !staged) || !identity) return;
  if (text && !okToPublish(text)) return;

  const now = Date.now();
  if (now - lastCommentTime < COMMENT_COOLDOWN_MS) {
    return;
  }

  const submitBtn = target.querySelector<HTMLButtonElement>(".comment-submit-btn");
  const originalBtnHtml = submitBtn?.innerHTML ?? "Send";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
  }

  let mediaMarkdown = "";
  try {
    if (staged) {
      if (staged.type === "file" && staged.file) {
        if (staged.file.type === "image/gif") {
          const arrayBuf = await staged.file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          const hash = await freenet.putMedia(bytes);
          keepMedia(hash, bytes);
          mediaMarkdown = `![image](radica-media:${hash})`;
        } else {
          const compressedDataUri = await compressPostImageFile(staged.file, 1024, 0.8);
          const decoded = dataUrlBytes(compressedDataUri);
          if (decoded) {
            const hash = await freenet.putMedia(decoded);
            keepMedia(hash, decoded);
            mediaMarkdown = `![image](radica-media:${hash})`;
          } else {
            mediaMarkdown = `![image](${compressedDataUri})`;
          }
        }
      } else if (staged.type === "url" && staged.url) {
        mediaMarkdown = `![gif](${staged.url})`;
      }
    }
  } catch (err: any) {
    console.error("Failed to process comment media:", err);
    showToast("Failed to upload media: " + (err.message || String(err)), "error");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
    return;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  }

  input.value = "";
  input.style.height = ""; // back to one line
  removeStagedCommentMedia(postId);
  lastCommentTime = now;
  const textWithKeys = withMentionKeys(input, text);
  const finalText = textWithKeys
    ? (mediaMarkdown ? `${textWithKeys} ${mediaMarkdown}` : textWithKeys)
    : mediaMarkdown;

  const idx = timelinePosts.findIndex((p) => p.id === postId);
  const post = idx !== -1 ? timelinePosts[idx] : undefined;
  const tempCommentId = `c_temp_${ now }`;
  const tempKey = `${identity.pubkey}:${tempCommentId}`;
  const visibleCommentCount = (p: Post) => Object.values(p.comments).filter((c) => c.text !== "").length;
  let optimisticPost = post;
  if (post && idx !== -1) {
    const optimisticComment: Comment = {
      id: tempCommentId,
      post_id: postId,
      author: identity.pubkey,
      text: finalText,
      timestamp: now,
      sig: "",
    };
    // ponytail: use "${author}:${id}" key matching contract & clone post so feedCache is not polluted with unsigned temp comment
    optimisticPost = { ...post, comments: { ...(post.comments || {}), [tempKey]: optimisticComment } };
    timelinePosts[idx] = optimisticPost;

    const commentsContainer = document.getElementById(`comments-${postId}`);
    if (commentsContainer) {
      commentsContainer.insertAdjacentHTML(
        "beforeend",
        `<div class="comment-item" id="comment-${tempCommentId}">
          <span class="comment-author author-clickable" data-author="${escapeHtml(identity.pubkey)}" style="cursor: pointer;" title="Persona: ${identity.pubkey}">${escapeHtml(getAuthorDisplayName(identity.pubkey))}:</span>
          <span class="comment-text">${renderComment(finalText, getAuthorDisplayName)}</span>
          <span class="comment-time" title="${escapeHtml(new Date(now).toLocaleString())}">${formatTimeAgo(now)}</span>
        </div>`
      );
      showMedia(commentsContainer);
      const card = document.getElementById(`card-${postId}`);
      const countBtn = card?.querySelector(".comment-count-btn");
      if (countBtn) {
        countBtn.innerHTML = `<span>${renderIcon("messageSquare", { className: "icon-sm" })}</span> <span><span class="action-count">${visibleCommentCount(optimisticPost)}</span><span class="action-label"> ${visibleCommentCount(optimisticPost) === 1 ? "Comment" : "Comments"}</span></span>`;
      }
    } else {
      renderTimeline();
    }
    updateNotificationsBadge();
  }

  freenet.addComment(identity, author, postId, finalText, !vouchedForAll).then((realComment) => {
    if (optimisticPost) {
      const realKey = `${realComment.author}:${realComment.id}`;
      delete optimisticPost.comments[tempKey];
      optimisticPost.comments[realKey] = realComment;
      const el = document.getElementById(`comment-${tempCommentId}`);
      if (el) {
        el.id = `comment-${realComment.id}`;
        el.insertAdjacentHTML(
          "beforeend",
          `<button type="button" class="comment-del-btn" data-post-id="${escapeHtml(postId)}" data-author="${escapeHtml(author)}" data-key="${escapeHtml(realKey)}" title="Delete my comment" aria-label="Delete my comment">✕</button>`
        );
      }
    }
  }).catch((err) => {
    console.error("Failed to add comment:", err);
    showToast("Could not post comment to Freenet.", "error");
    if (optimisticPost) {
      delete optimisticPost.comments[tempKey];
      document.getElementById(`comment-${tempCommentId}`)?.remove();
      const card = document.getElementById(`card-${postId}`);
      const countBtn = card?.querySelector(".comment-count-btn");
      if (countBtn) {
        countBtn.innerHTML = `<span>${renderIcon("messageSquare", { className: "icon-sm" })}</span> <span><span class="action-count">${visibleCommentCount(optimisticPost)}</span><span class="action-label"> ${visibleCommentCount(optimisticPost) === 1 ? "Comment" : "Comments"}</span></span>`;
      }
    }
  });
}

initCardListeners();

// Anti-Flood & Rate Limiting Controls
let lastPostTime = 0;
let recentPostTimestamps: number[] = [];
let recentPostContents: string[] = [];
const POST_COOLDOWN_MS = 2000; // 2s cooldown between consecutive posts
const MAX_POSTS_PER_MINUTE = 10; // Maximum 10 posts in 60s sliding window

let lastCommentTime = 0;
const COMMENT_COOLDOWN_MS = 1000; // 1s cooldown between comments

let lastChatMessageTime = 0;
const CHAT_COOLDOWN_MS = 300; // 300ms debounce between chat messages

let cooldownTimer: any = null;
let activeCooldownDurationMs = POST_COOLDOWN_MS;

function isPostInCooldown(): boolean {
  return cooldownTimer !== null || (Date.now() - lastPostTime < activeCooldownDurationMs && lastPostTime > 0);
}

function startPostCooldown(durationSeconds: number = 2) {
  activeCooldownDurationMs = durationSeconds * 1000;
  let remaining = durationSeconds;
  publishBtn.disabled = true;
  publishBtn.style.opacity = "0.7";
  publishBtn.style.cursor = "not-allowed";
  publishBtn.style.backgroundColor = "";
  publishBtn.style.borderColor = "";
  publishBtn.title = "Please wait a moment.";
  publishBtn.textContent = `⏳ (${remaining}s)`;

  if (cooldownTimer) clearInterval(cooldownTimer);

  cooldownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      publishBtn.textContent = `⏳ (${remaining}s)`;
    } else {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      if (!currentMediaNsfw) {
        resetPublishBtnState();
      }
    }
  }, 1000);
}

function resetPublishBtnState() {
  if (isPostInCooldown()) return;
  publishBtn.disabled = false;
  publishBtn.style.opacity = "";
  publishBtn.style.cursor = "";
  publishBtn.style.backgroundColor = "";
  publishBtn.style.borderColor = "";
  publishBtn.title = "";
  publishBtn.textContent = "Plant post";
}

function blockPublishBtnForNsfw(label: string, score: number) {
  currentMediaNsfw = true;
  publishBtn.disabled = true;
  publishBtn.style.opacity = "0.6";
  publishBtn.style.cursor = "not-allowed";
  publishBtn.style.backgroundColor = "#dc2626";
  publishBtn.style.borderColor = "#b91c1c";
  publishBtn.title = "Publishing blocked: Adult / explicit content detected.";
  publishBtn.textContent = "Publishing Prohibited";

  if (moderationStatus && moderationBadgeText) {
    moderationStatus.style.display = "flex";
    moderationStatus.style.background = "#fef2f2";
    moderationStatus.style.border = "1px solid #f87171";
    moderationBadgeText.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="color: #b91c1c; font-weight: 700; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
            ${renderIcon("ban", { className: "icon-sm" })}
            <span>Adult Content Detected (${escapeHtml(label)}, confidence: ${(score * 100).toFixed(0)}%)</span>
          </span>
          <span style="background: #ef4444; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">BLOCKED</span>
        </div>
        <span style="color: #7f1d1d; font-size: 0.75rem; font-weight: normal;">Publishing adult or explicit content is strictly prohibited. Please remove the image to proceed.</span>
      </div>
    `;
  }
}

function setPublishBtnScanning() {
  publishBtn.disabled = true;
  publishBtn.style.opacity = "0.7";
  publishBtn.style.cursor = "not-allowed";
  publishBtn.textContent = "Moderation scan in progress...";

  if (moderationStatus && moderationBadgeText) {
    moderationStatus.style.display = "flex";
    moderationStatus.style.background = "var(--primary-soft)";
    moderationStatus.style.border = "1px solid var(--border)";
    moderationBadgeText.innerHTML = `<span style="color: var(--primary); font-weight: 600;">Scanning on-device with Desert Ant Moderator...</span>`;
  }
}

// Fail closed: if the on-device scan could not run, do not let the image through unchecked.
function blockPublishBtnForUnverified() {
  currentMediaNsfw = true;
  publishBtn.disabled = true;
  publishBtn.style.opacity = "0.6";
  publishBtn.style.cursor = "not-allowed";
  publishBtn.title = "Publishing blocked: the image could not be scanned.";

  if (moderationStatus && moderationBadgeText) {
    moderationStatus.style.display = "flex";
    moderationStatus.style.background = "#fffbeb";
    moderationStatus.style.border = "1px solid #fbbf24";
    moderationBadgeText.innerHTML = `<span style="color: #92400e; font-weight: 600; font-size: 0.8rem;">The on-device scanner is unavailable, so this image cannot be verified. Remove it or reload the app and try again.</span>`;
  }
}

function setMediaVerifiedSafe(score: number) {
  currentMediaNsfw = false;
  resetPublishBtnState();

  if (moderationStatus && moderationBadgeText) {
    moderationStatus.style.display = "flex";
    moderationStatus.style.background = "#f0fdf4";
    moderationStatus.style.border = "1px solid #86efac";
    moderationBadgeText.innerHTML = `<span style="color: #15803d; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${renderIcon("shield", { className: "icon-xs" })} <span>Desert Ant Verified Safe (score: ${score})</span></span>`;
  }
}

function showScanResult(modRes: ImageModerationResult) {
  currentMediaNsfwScore = modRes.score;
  if (modRes.unverified) blockPublishBtnForUnverified();
  else if (modRes.score >= NSFW_BLOCK) blockPublishBtnForNsfw(modRes.label, modRes.score);
  else if (modRes.score >= NSFW_SENSITIVE) setMediaSensitive(modRes.score);
  else setMediaVerifiedSafe(modRes.score);
}

/** Possibly sensitive: posted marked NSFW (blurred until clicked) unless the author unticks the box: the scanner also
 *  flags pale furry animals. */
function setMediaSensitive(score: number) {
  currentMediaNsfw = false;
  resetPublishBtnState();
  if (moderationStatus && moderationBadgeText) {
    moderationStatus.style.display = "flex";
    moderationStatus.style.background = "#fffbeb";
    moderationStatus.style.border = "1px solid #fbbf24";
    moderationBadgeText.innerHTML = `<label style="color: #92400e; font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;"><input type="checkbox" id="nsfw-mark" checked /> <span>Mark as sensitive: the image is blurred until clicked. The scanner rated it ${(score * 100).toFixed(0)}%; untick if it is not.</span></label>`;
  }
}

// File Picker for Moments with Desert Ant On-Device Scan
postFilePicker.addEventListener("change", async (e) => {
  const files = Array.from((e.target as HTMLInputElement).files ?? []);
  if (!files.length) return;

  setPublishBtnScanning();
  setExtraMedia([]);
  const video = files.find((f) => f.type.startsWith("video/"));
  if (video) return void stageVideo(video);
  if (files.length > MAX_CAROUSEL) showToast(`Up to ${MAX_CAROUSEL} photos per post: the first ${MAX_CAROUSEL} are kept.`, "warning");
  const picked = files.slice(0, MAX_CAROUSEL);

  try {
    // Compress and downscale Moment images to lightweight web format (~2-4 KB)
    const compressed = await Promise.all(picked.map((f) => compressPostImageFile(f)));
    postMediaUrl.value = compressed[0];
    imagePreview.src = compressed[0];
    setExtraMedia(compressed.slice(1));
    imagePreviewContainer.style.display = "flex";

    // one at a time: the scanner model is heavy; the worst result stands for the whole post
    const scans: ImageModerationResult[] = [];
    for (const f of picked) scans.push(await analyzeImageFile(f));
    showScanResult(scans.find((s) => s.unverified) ?? scans.reduce((a, b) => (b.score > a.score ? b : a)));
  } catch (err) {
    console.error("Failed to process image for Moment:", err);
    resetPublishBtnState();
  }
});

let stagedPosterObjUrl = "";
function revokePosterUrl() {
  if (stagedPosterObjUrl) {
    URL.revokeObjectURL(stagedPosterObjUrl);
    stagedPosterObjUrl = "";
  }
}

/** Scan a video frame by frame (blocked: never encoded), then encode it for the post. */
async function stageVideo(file: File) {
  stagedVideo = null;
  stagedVideoPoster = null;
  revokePosterUrl();
  postMediaUrl.value = "";
  try {
    const { worst, poster, bytes, audioDropped } = await prepareVideo(file, analyzeImageFile, NSFW_BLOCK, (stage, p) => {
      if (moderationBadgeText) moderationBadgeText.textContent = stage === "scan" ? `Scanning video frames… ${Math.round(p * 100)}%` : `Encoding video… ${Math.round(p * 100)}%`;
    });
    if (poster) {
      stagedPosterObjUrl = URL.createObjectURL(poster);
      imagePreview.src = stagedPosterObjUrl;
      imagePreviewContainer.style.display = "flex";
    }
    stagedVideo = bytes ?? null;
    stagedVideoPoster = poster;
    showScanResult(worst);
    if (audioDropped) showToast("This browser could not encode the sound: the video will be posted without audio.", "warning");
  } catch (err: any) {
    console.error("Failed to process video for Moment:", err);
    showToast(err?.message || String(err), "error");
    clearImageBtn.click();
  }
}

// URL or Base64 pasted directly into Moment media field
postMediaUrl.addEventListener("change", async () => {
  const val = postMediaUrl.value.trim();
  if (!val) {
    clearImageBtn.click();
    return;
  }
  setPublishBtnScanning();
  setExtraMedia([]);

  try {
    const compressed = await compressPostImageFile(val);
    postMediaUrl.value = compressed;
    imagePreview.src = compressed;
    imagePreviewContainer.style.display = "flex";

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      showScanResult(await analyzeImageFile(img));
    };
    img.onerror = () => {
      resetPublishBtnState();
    };
    img.src = compressed;
  } catch {
    resetPublishBtnState();
  }
});

clearImageBtn.addEventListener("click", () => {
  postFilePicker.value = "";
  postMediaUrl.value = "";
  setExtraMedia([]);
  stagedVideo = null;
  stagedVideoPoster = null;
  revokePosterUrl();
  imagePreview.src = "";
  imagePreviewContainer.style.display = "none";
  if (moderationStatus) moderationStatus.style.display = "none";
  currentMediaNsfw = false;
  currentMediaNsfwScore = 0;
  if (nsfwManualToggle) nsfwManualToggle.checked = false;
  resetPublishBtnState();
});

const pollNet: PollNet = {
  get: (id) => freenet.appContract(id),
  put: (k, code, params, state) => freenet.putAppContract(k, code, params, state),
  update: (k, delta) => freenet.updateAppContract(k, delta),
};
const pollFields = document.getElementById("poll-fields") as HTMLElement;
const pollOptions = document.getElementById("poll-options") as HTMLTextAreaElement;
const pollMulti = document.getElementById("poll-multi") as HTMLInputElement;
document.getElementById("poll-toggle-btn")!.addEventListener("click", (e) => {
  const on = pollFields.hidden;
  pollFields.hidden = !on;
  (e.currentTarget as HTMLElement).classList.toggle("active", on);
  if (on) pollOptions.focus();
});
document.getElementById("poll-remove-btn")!.addEventListener("click", () => {
  pollOptions.value = "";
  pollMulti.checked = false;
  pollFields.hidden = true;
  document.getElementById("poll-toggle-btn")!.classList.remove("active");
});

// Composer Tab switching
document.querySelectorAll(".composer-tab").forEach((tab) => {
  tab.addEventListener("click", (e) => {
    document.querySelectorAll(".composer-tab").forEach((t) => t.classList.remove("active"));
    const btn = e.currentTarget as HTMLElement;
    btn.classList.add("active");
    activeComposerType = btn.dataset.type as PostCategory;

    momentFields.style.display = activeComposerType === "moment" ? "flex" : "none";
    eventFields.style.display = activeComposerType === "event" ? "flex" : "none";
  });
});

// Category filtering in Sidebar
function setCategory(cat: "all" | "poll" | PostCategory) {
  currentCategory = cat;
  document.querySelectorAll(".cat-btn").forEach((b) => {
    const btn = b as HTMLElement;
    if (btn.dataset.cat === cat) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Feeds & Categories are top-level views: clear community mode so posts are shown
  if (activeCommunity) {
    activeCommunity = null;
    communityHeaderBanner.style.display = "none";
    composerCommunitySelect.value = "";
    document.querySelectorAll(".comm-item").forEach((el) => el.classList.remove("active"));
  }

  // If clicking "All Posts", also clear any active hashtag filter and search query
  if (cat === "all") {
    if (activeTagFilter) {
      activeTagFilter = null;
      activeFilterBanner.style.display = "none";
    }
    if (searchQuery) {
      searchQuery = "";
      feedSearchInput.value = "";
    }
  }

  renderTimeline();
}

document.querySelectorAll(".cat-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const target = e.currentTarget as HTMLElement;
    const cat = target.dataset.cat as "all" | "poll" | PostCategory;
    setCategory(cat);
  });
});

// Clicking brand logo resets all filters to default All Posts timeline
const brandLogo = document.querySelector(".brand") as HTMLElement | null;
if (brandLogo) {
  brandLogo.style.cursor = "pointer";
  brandLogo.addEventListener("click", () => {
    setCategory("all");
  });
}

// Publish Post (optimistic)
publishBtn.addEventListener("click", async () => {
  if (!currentIdentity) return;

  // A poll: the caption is its question; publish the poll first, then the post carries its link
  if (!pollFields.hidden) {
    const question = postCaption.value.trim();
    const options = [...new Set(pollOptions.value.split("\n").map((o) => o.trim()).filter(Boolean))].slice(0, 20);
    if (!question || options.length < 2) return void showToast("A poll needs a question (the post text) and at least two options, one per line.", "warning");
    publishBtn.disabled = true;
    try {
      const link = await createPoll({ question: question.slice(0, 300), options: options.map((o) => o.slice(0, 200)), multi: pollMulti.checked }, pollNet, nodeOrigin());
      postCaption.value = `${question}\n\n${link}`;
      pollOptions.value = "";
      pollMulti.checked = false;
      pollFields.hidden = true;
      document.getElementById("poll-toggle-btn")!.classList.remove("active");
    } catch (e) {
      return void showToast(`Could not create the poll: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      publishBtn.disabled = false;
    }
  }

  // 1. Strict zero-tolerance guard: do not allow publishing NSFW content
  if (currentMediaNsfw || currentMediaNsfwScore >= NSFW_BLOCK) {
    showToast("Publishing Prohibited: Media contains explicit or adult content.", "error");
    return;
  }

  // 1b. Check Community Trust rules if posting in a community
  const commId = composerCommunitySelect.value || (activeCommunity ? activeCommunity.id : undefined);
  if (commId) {
    const targetComm = allCommunities.find((c) => c.id === commId || c.slug === commId) || activeCommunity;
    if (targetComm && targetComm.require_trusted_to_post) {
      const isOwnerOrMod = targetComm.creator === currentIdentity.pubkey || targetComm.moderators.includes(currentIdentity.pubkey);
      const isTrusted = isOwnerOrMod || amVouched();
      if (!isTrusted) {
        showToast("This community lets only vouched members start threads: someone you trust must follow you, or support Radica. You can still comment!", "warning");
        return;
      }
    }
  }

  // 2. Anti-flood cooldown check (proportional: 2s for Trusted, 15s for Newcomer)
  const isTrustedAuthor = amVouched();
  const requiredCooldownMs = isTrustedAuthor ? POST_COOLDOWN_MS : 15000;
  const now = Date.now();
  const timeSinceLast = now - lastPostTime;
  if (lastPostTime > 0 && timeSinceLast < requiredCooldownMs) {
    const waitSec = Math.ceil((requiredCooldownMs - timeSinceLast) / 1000);
    showToast(`Please wait ${waitSec}s before publishing another post. (Anti-spam protection 🌱)`, "warning");
    return;
  }

  // 3. Sliding window rate limit check (max 10 posts per 60 seconds)
  recentPostTimestamps = recentPostTimestamps.filter((t) => now - t < 60000);
  if (recentPostTimestamps.length >= MAX_POSTS_PER_MINUTE) {
    showToast("Rate Limit Exceeded: Maximum 10 posts per minute to protect the network.", "warning");
    return;
  }

  const caption = postCaption.value.trim();
  if (!caption) {
    showToast("Please write something before publishing.", "warning");
    return;
  }

  // 4. Duplicate content check (prevent spamming identical text)
  const normalizedCaption = caption.toLowerCase().replace(/\s+/g, " ");
  if (recentPostContents.includes(normalizedCaption)) {
    showToast("Duplicate Post Detected: You recently published this exact message.", "warning");
    return;
  }

  // 5. Personal data (email, phone…) is asked about; bad words are masked by each reader, if they choose
  if (!okToPublish(caption)) return;
  const finalCaption = withMentionKeys(postCaption, caption); // after the check: a key looks like a phone number to it

  let mediaUri = activeComposerType === "moment" ? [postMediaUrl.value.trim(), ...extraMedia].filter(Boolean).join(" ") : undefined;
  if (activeComposerType === "moment" && stagedVideo) {
    // Published before the post: the post must name a video the network already has.
    const label = publishBtn.textContent;
    publishBtn.disabled = true;
    try {
      mediaUri = await publishVideo(stagedVideo, (b) => freenet.putMedia(b), (done, total) => (publishBtn.textContent = `Uploading video ${done}/${total}…`), stagedVideoPoster);
    } catch (err: any) {
      showToast("Failed to upload video: " + (err?.message || String(err)), "error");
      return;
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = label;
    }
  }
  const location = activeComposerType === "event" ? postLocation.value.trim() : undefined;
  const eventDate = activeComposerType === "event" ? postEventDate.value : undefined;

  // Proof-of-Work computation for Tier 0 (newcomer) personas to protect against Sybil flood
  let powProof: PoWProof | undefined;
  // readers cover newcomers' posts without it, and only the wall and GhostKey make me no newcomer to every reader
  if (!vouchedForAll) {
    const origText = publishBtn.textContent;
    publishBtn.disabled = true;
    publishBtn.textContent = "⏳ Anti-bot PoW...";
    try {
      powProof = await solvePoW(currentIdentity.pubkey, now, POST_POW_BITS, "post", (attempts) => {
        if (attempts % 16384 === 0) {
          publishBtn.textContent = `⏳ PoW (${Math.round(attempts / 1000)}k)...`;
        }
      });
    } catch (e) {
      console.warn("PoW computation error:", e);
    } finally {
      publishBtn.textContent = origText;
    }
  }

  const markSensitive = currentMediaNsfwScore >= NSFW_SENSITIVE && (document.getElementById("nsfw-mark") as HTMLInputElement | null)?.checked !== false;
  // Optimistic post insertion
  const tempId = `post_${now}_${Math.random().toString(36).substring(2, 8)}`;
  const optimisticPost: Post = {
    id: tempId,
    author: currentIdentity.pubkey,
    category: activeComposerType,
    caption: finalCaption,
    community_id: commId,
    media_uri: mediaUri || undefined,
    location: location || undefined,
    event_date: eventDate || undefined,
    is_nsfw: markSensitive,
    timestamp: now,
    sig: "",
    likes: {},
    comments: {},
    nsfw_score: currentMediaNsfwScore,
    cert: currentIdentity.cert,
    pow: powProof,
  };

  // Record anti-flood timestamps & content
  lastPostTime = now;
  recentPostTimestamps.push(lastPostTime);
  recentPostContents.push(normalizedCaption);
  if (recentPostContents.length > 5) recentPostContents.shift();

  const mediaNsfwScore = currentMediaNsfwScore;
  timelinePosts.unshift(optimisticPost);
  postCaption.value = "";
  safeStorage.removeItem(draftKey(currentIdentity.pubkey));
  postMediaUrl.value = "";
  setExtraMedia([]);
  stagedVideo = null;
  stagedVideoPoster = null;
  revokePosterUrl();
  postLocation.value = "";
  imagePreview.src = "";
  imagePreviewContainer.style.display = "none";
  if (moderationStatus) moderationStatus.style.display = "none";
  currentMediaNsfw = false;
  currentMediaNsfwScore = 0;
  if (nsfwManualToggle) nsfwManualToggle.checked = false;
  renderTimeline();

  // Differentiated cooldown: 2s for Trusted personas, 15s for Tier 0
  startPostCooldown(isTrustedAuthor ? 2 : 15);

  // Background publish to Freenet network
  freenet.publishPost(
    currentIdentity,
    activeComposerType,
    finalCaption,
    mediaUri || undefined,
    location || undefined,
    eventDate || undefined,
    commId || undefined,
    markSensitive,
    mediaNsfwScore,
    powProof
  ).then((realPost) => {
    const idx = timelinePosts.findIndex((p) => p.id === tempId);
    if (idx !== -1) {
      timelinePosts[idx] = realPost;
      renderTimeline(); // the card carries the real id: like and comment on it find their post
    }
  }).catch((err) => {
    console.error("Error publishing post in background:", err);
    showToast("Could not publish post to Freenet.", "error");
    timelinePosts = timelinePosts.filter((p) => p.id !== tempId);
    renderTimeline();
    if (!currentMediaNsfw) {
      resetPublishBtnState();
    }
  });
});

// Profile Modal Interactions
editProfileBtn.addEventListener("click", () => {
  modalNameInput.value = currentProfile?.display_name || "";
  modalBioInput.value = currentProfile?.bio || "";
  const me = currentIdentity?.pubkey;
  modalDeltaInput.value = (me && freenet.deltaSiteOf(me)) || "";
  if (me) void freenet.refreshLog(`delta/${me}`).then(() => (modalDeltaInput.value ||= freenet.deltaSiteOf(me) ?? ""));
  if (modalOrtoInput) {
    modalOrtoInput.value = (me && freenet.ortoBlogOf(me)) || "";
    if (me) void freenet.refreshLog(`orto/${me}`).then(() => (modalOrtoInput.value ||= freenet.ortoBlogOf(me) ?? ""));
  }
  if (modalAsocialInput) {
    modalAsocialInput.value = (me && freenet.asocialKeyOf(me)) || "";
    if (me) void freenet.refreshLog(`asocial/${me}`).then(() => (modalAsocialInput.value ||= freenet.asocialKeyOf(me) ?? ""));
  }
  if (modalFreetunesInput) {
    const existing = (me && freenet.freetunesOf(me)) || "";
    if (existing) {
      modalFreetunesInput.value = existing;
    } else {
      const local = localFreetunesArtist();
      const localRels = localFreetunesReleases();
      if (localRels.length > 0) {
        modalFreetunesInput.value = localRels.map((r) => `#/r/${r.id}.${r.params}`).join(" ");
      } else if (local.artistHex) {
        modalFreetunesInput.value = `#/a/${local.artistHex}`;
      }
    }
    if (me) void freenet.refreshLog(`freetunes/${me}`).then(() => (modalFreetunesInput.value ||= freenet.freetunesOf(me) ?? ""));
  }
  if (modalFhInput) {
    modalFhInput.value = (me && freenet.fhOf(me)) || "";
    if (me) void freenet.refreshLog(`fh/${me}`).then(() => (modalFhInput.value ||= freenet.fhOf(me) ?? ""));
  }
  if (modalFreetreeInput) {
    modalFreetreeInput.value = (me && freenet.freetreeOf(me)) || "";
    if (me) void freenet.refreshLog(`freetree/${me}`).then(() => (modalFreetreeInput.value ||= freenet.freetreeOf(me) ?? ""));
  }
  modalAvatarInput.value = currentProfile?.avatar_url || "";
  const currentAvatar = currentProfile?.avatar_url || generateDefaultAvatar(currentIdentity?.pubkey || "radica");
  modalAvatarPreview.src = currentAvatar;
  profileModal.style.display = "flex";
});

modalAvatarFileInput.addEventListener("change", async () => {
  const file = modalAvatarFileInput.files?.[0];
  if (!file) return;
  try {
    const compressed = await compressAvatarFile(file);
    modalAvatarInput.value = compressed;
    modalAvatarPreview.src = compressed;
  } catch (err) {
    console.error("Failed to compress avatar file:", err);
    alert("Could not process avatar image.");
  }
});

modalAvatarResetBtn.addEventListener("click", () => {
  modalAvatarInput.value = "";
  modalAvatarFileInput.value = "";
  modalAvatarPreview.src = generateDefaultAvatar(currentIdentity?.pubkey || "radica");
});

modalAvatarInput.addEventListener("input", () => {
  const val = modalAvatarInput.value.trim();
  modalAvatarPreview.src = val || generateDefaultAvatar(currentIdentity?.pubkey || "radica");
});

modalAvatarPreview.onerror = () => {
  modalAvatarPreview.src = generateDefaultAvatar(currentIdentity?.pubkey || "radica");
};

modalCancelBtn.addEventListener("click", () => {
  profileModal.style.display = "none";
});

/** Show my newly saved profile everywhere, and tell the network. */
function applyProfile(updated: ProfileInfo) {
  if (!currentIdentity) return;
  currentProfile = updated;
  sidebarName.textContent = updated.display_name;
  sidebarBio.textContent = updated.bio || "No bio yet.";
  sidebarAvatar.src = composerAvatar.src = updated.avatar_url || generateDefaultAvatar(currentIdentity.pubkey);
  safeStorage.setItem(`radica_profile_${currentIdentity.pubkey}`, JSON.stringify(updated));
  freenet.knownPeers[currentIdentity.pubkey] = {
    display_name: updated.display_name,
    avatar_url: updated.avatar_url,
  };
  freenet.announceIdentity(currentIdentity, updated);
  renderTimeline();
  renderDiscoveredPeers();
}

modalSaveBtn.addEventListener("click", async () => {
  if (!currentIdentity) return;
  const name = modalNameInput.value.trim() || `Persona @${shortenKey(personaName(currentIdentity.pubkey))}`;
  const bio = modalBioInput.value.trim();
  const avatar = modalAvatarInput.value.trim();
  const deltaRaw = modalDeltaInput.value.trim();
  const delta = deltaRaw ? deltaPrefixOf(deltaRaw) : null;
  if (deltaRaw && !delta) return alert("That is not a Delta site address: paste the address of your site in Delta.");

  modalSaveBtn.disabled = true;
  modalSaveBtn.textContent = "Signing & Saving...";

  try {
    const updated = await freenet.updateProfile(currentIdentity, name, bio, avatar);
    if (delta !== freenet.deltaSiteOf(currentIdentity.pubkey)) await freenet.setDeltaSite(delta);
    const ortoRaw = modalOrtoInput?.value.trim() || "";
    if (ortoRaw !== (freenet.ortoBlogOf(currentIdentity.pubkey) || "")) await freenet.setOrtoBlog(ortoRaw || null);
    const asocialRaw = modalAsocialInput?.value.trim() || "";
    const asocialKey = asocialRaw ? asocialPersonOf(asocialRaw) : null;
    if (asocialRaw && !asocialKey) return alert("That is not a valid Asocial key or profile link.");
    if (asocialKey !== (freenet.asocialKeyOf(currentIdentity.pubkey) || null)) await freenet.setAsocialKey(asocialKey);
    const ftRaw = modalFreetunesInput?.value.trim() || "";
    if (ftRaw !== (freenet.freetunesOf(currentIdentity.pubkey) || "")) {
      await freenet.setFreetunes(ftRaw || null);
      if (userProfileModal.style.display !== "none" && uviewKey.textContent === currentIdentity.pubkey) {
        void renderFreetunes(currentIdentity.pubkey);
      }
    }
    const fhRaw = modalFhInput?.value.trim() || "";
    if (fhRaw !== (freenet.fhOf(currentIdentity.pubkey) || "")) await freenet.setFh(fhRaw || null);
    const freetreeRaw = modalFreetreeInput?.value.trim() || "";
    if (freetreeRaw !== (freenet.freetreeOf(currentIdentity.pubkey) || "")) {
      await freenet.setFreetree(freetreeRaw || null);
      if (userProfileModal.style.display !== "none" && uviewKey.textContent === currentIdentity.pubkey) {
        void renderFreetree(currentIdentity.pubkey);
      }
    }
    applyProfile(updated);
    profileModal.style.display = "none";
  } catch (err) {
    console.error("Error updating profile:", err);
    alert("Could not save profile.");
  } finally {
    modalSaveBtn.disabled = false;
    modalSaveBtn.textContent = "Save Profile";
  }
});

// Follow Persona Form
followForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentIdentity) return;
  const targetKey = followPubkeyInput.value.trim();
  if (!targetKey) return;

  if (targetKey === currentIdentity.pubkey) {
    alert("You cannot follow yourself.");
    return;
  }

  if (followingKeys.includes(targetKey)) {
    alert("You are already following this persona.");
    return;
  }

  await freenet.toggleFollow(currentIdentity, targetKey);
  followingKeys.push(targetKey);
  followPubkeyInput.value = "";
  renderFollowingList();

  timelinePosts = await freenet.getTimeline(currentIdentity);
  renderTimeline();
});

// ---- Dedicated User Profile View ----

const uviewBlog = document.getElementById("uview-blog") as HTMLElement;
const uviewOrtoBlog = document.getElementById("uview-orto-blog") as HTMLElement;
const uviewAsocial = document.getElementById("uview-asocial") as HTMLElement;
const uviewFreetunes = document.getElementById("uview-freetunes") as HTMLElement;
const uviewFh = document.getElementById("uview-fh") as HTMLElement;
const uviewFreetree = document.getElementById("uview-freetree") as HTMLElement;
const uviewNames = document.getElementById("uview-names") as HTMLElement;
const uviewSites = document.getElementById("uview-sites") as HTMLElement;

/** The FreeNames names a persona owns, as links to FreeNames' lookup. */
async function renderNames(pubkey: string) {
  uviewNames.innerHTML = uviewSites.innerHTML = "";
  const [names, sites] = await Promise.all([freenet.freenamesOf(pubkey), freenet.freenameSites(pubkey)]);
  if (uviewKey.textContent !== pubkey) return;
  const origin = nodeOrigin();
  // shown as name/sub when the persona has a registry name, else as the sub-name alone
  const label = (n: string) => (names[0] ? (n === "@" ? names[0] : `${names[0]}/${n}`) : n === "@" ? "home" : n);
  const wasCollapsed = uviewSites.querySelector(".blog-card")?.classList.contains("collapsed");
  uviewSites.innerHTML = sites.length
    ? `<div class="blog-card fn-sites-card${wasCollapsed ? " collapsed" : ""}">` +
        `<div class="blog-card-head">` +
          `<span class="link-card-icon" aria-hidden="true">🌐</span>` +
          `<span class="link-card-text">` +
            `<span class="link-card-host">Sites on Freenet</span>` +
            `<span class="link-card-title">FreeNames Sites</span>` +
            `<span class="blog-card-desc">${sites.length} hosted site${sites.length === 1 ? "" : "s"}</span>` +
          `</span>` +
          `<div class="blog-card-actions">` +
            `<button type="button" class="blog-card-toggle" aria-label="Toggle section" title="Collapse / expand">` +
              `<svg class="blog-card-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
            `</button>` +
          `</div>` +
        `</div>` +
        `<div class="fn-sites blog-card-pages">${sites
          .map((s) => `<a class="fn-site" href="${escapeHtml(`${origin}/v1/contract/web/${s.target}/`)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(s.target)}">${escapeHtml(label(s.name))}</a>`)
          .join("")}</div>` +
      `</div>`
    : "";
  uviewNames.innerHTML = names
    .map((n) => `<a class="fn-name" href="${escapeHtml(nameHref(origin, n))}" target="_blank" rel="noopener noreferrer" title="Name on FreeNames">fn:${escapeHtml(n)}</a>`)
    .join("");
}

/** The Delta blog a persona named (set in Edit Profile): a card with its name and all its pages, opening in Delta. */

/** The Orto blog of a persona (from their Orto vault on Freenet or custom URL): a card with its posts. */
async function renderOrtoBlog(pubkey: string) {
  if (!uviewOrtoBlog) return;
  const stillHere = () => uviewKey.textContent === pubkey;
  const draw = async () => {
    const blog = await freenet.ortoBlog(pubkey);
    if (!stillHere()) return;
    if (!blog || !blog.posts.length) return void (uviewOrtoBlog.innerHTML = "");
    const origin = nodeOrigin();
    const blogUrl = blog.url || `${origin}/v1/contract/web/${ORTO_SITE}/#/`;
    const head = (title: string) =>
      `<div class="blog-card-head">` +
      `<span class="link-card-icon" aria-hidden="true">&#x1F331;</span>` +
      `<span class="link-card-text"><span class="link-card-host">Blog on Orto</span><span class="link-card-title">${escapeHtml(title)}</span>` +
      `</span>` +
      `<div class="blog-card-actions">` +
      `<a class="blog-card-open" href="${escapeHtml(blogUrl)}" target="_blank" rel="noopener noreferrer" title="Open on Orto" aria-label="Open on Orto">\u2197</a>` +
      `<button type="button" class="blog-card-toggle" aria-label="Toggle section" title="Collapse / expand">` +
      `<svg class="blog-card-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
      `</button>` +
      `</div>` +
      `</div>`;
    const pages = blog.posts
      .slice(0, 10)
      .map((p) => {
        const href = ortoPostHref(origin, p);
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.title || "Untitled")}</a>`;
      })
      .join("");
    const wasCollapsed = uviewOrtoBlog.querySelector(".blog-card")?.classList.contains("collapsed");
    uviewOrtoBlog.innerHTML =
      `<div class="blog-card${wasCollapsed ? " collapsed" : ""}">${head(blog.title || `${getAuthorDisplayName(pubkey)}'s Blog`)}` +
      (pages ? `<div class="blog-card-pages">${pages}</div>` : "") +
      `</div>`;
  };
  await draw();
  await freenet.refreshLog(`orto/${pubkey}`);
  if (stillHere()) await draw();
}

/** The Asocial games profile of a persona: a card with their key, nickname, works, and link to Asocial. */
async function renderAsocial(pubkey: string) {
  if (!uviewAsocial) return;
  const stillHere = () => uviewKey.textContent === pubkey;
  const draw = async () => {
    const key = freenet.asocialKeyOf(pubkey);
    if (!key) return void (uviewAsocial.innerHTML = "");
    const wasCollapsed = uviewAsocial.querySelector(".blog-card")?.classList.contains("collapsed");
    const cached = freenet.cachedAsocialProfile(key);
    if (!cached && !uviewAsocial.innerHTML) {
      uviewAsocial.innerHTML = `<div class="blog-card asocial-profile-card"><div class="blog-card-head"><span class="link-card-icon" aria-hidden="true">🎮</span><span class="link-card-text"><span class="link-card-host">Games on Asocial</span><span class="link-card-title">@${escapeHtml(key.slice(0, 6))}…</span><span class="blog-card-desc"><span class="boot-bar" style="width: 50px; height: 3px; display: inline-block; vertical-align: middle; margin-right: 6px;"><span></span></span>Loading games…</span></span></div></div>`;
    } else if (cached) {
      uviewAsocial.innerHTML = asocialProfileCard(pubkey, key, cached, nodeOrigin());
      if (wasCollapsed) uviewAsocial.querySelector(".blog-card")?.classList.add("collapsed");
    }
    const data = await freenet.asocialProfile(key);
    if (stillHere() && data) {
      uviewAsocial.innerHTML = asocialProfileCard(pubkey, key, data, nodeOrigin());
      if (wasCollapsed) uviewAsocial.querySelector(".blog-card")?.classList.add("collapsed");
    }
  };
  await draw();
  await freenet.refreshLog(`asocial/${pubkey}`);
  if (stillHere()) await draw();
}

/** The FreeTunes releases and artist profile of a persona. */
async function renderFreetunes(pubkey: string) {
  if (!uviewFreetunes) return;
  const stillHere = () => uviewKey.textContent === pubkey;
  const draw = async () => {
    const artistData = await freenet.freetunesArtist(pubkey);
    if (!stillHere()) return;
    if (!artistData) {
      uviewFreetunes.innerHTML = "";
      return;
    }
    const wasCollapsed = uviewFreetunes.querySelector(".blog-card")?.classList.contains("collapsed");
    uviewFreetunes.innerHTML = freetunesProfileCard(artistData, nodeOrigin(), getAuthorDisplayName(pubkey));
    if (wasCollapsed) uviewFreetunes.querySelector(".blog-card")?.classList.add("collapsed");
    fillFreetunesProfile(uviewFreetunes, (id) => freenet.appContract(id));
  };
  await draw();
  await freenet.refreshLog(`freetunes/${pubkey}`);
  freenet.clearFreetunesArtistCache(pubkey);
  if (stillHere()) await draw();
}

/** The Fisherman's Horizon bookmarks list of a persona. */
async function renderFh(pubkey: string) {
  if (!uviewFh) return;
  const stillHere = () => uviewKey.textContent === pubkey;
  const draw = async () => {
    const fhData = await freenet.fhList(pubkey);
    if (!stillHere()) return;
    if (!fhData || !fhData.sites.length) {
      uviewFh.innerHTML = "";
      return;
    }
    const wasCollapsed = uviewFh.querySelector(".blog-card")?.classList.contains("collapsed");
    uviewFh.innerHTML = fhProfileCard(getAuthorDisplayName(pubkey), fhData, nodeOrigin());
    if (wasCollapsed) uviewFh.querySelector(".blog-card")?.classList.add("collapsed");
  };
  await draw();
  await freenet.refreshLog(`fh/${pubkey}`);
  if (stillHere()) await draw();
}

/** The Freetree profile hub of a persona. */
async function renderFreetree(pubkey: string) {
  if (!uviewFreetree) return;
  const stillHere = () => uviewKey.textContent === pubkey;
  const draw = async () => {
    const raw = freenet.freetreeOf(pubkey);
    const prefix = raw ? parseFreetreeInput(raw) : null;
    if (!stillHere()) return;
    if (!prefix) {
      uviewFreetree.innerHTML = "";
      return;
    }
    const wasCollapsed = uviewFreetree.querySelector(".blog-card")?.classList.contains("collapsed");
    uviewFreetree.innerHTML = freetreeProfileCard(getAuthorDisplayName(pubkey), prefix, nodeOrigin());
    if (wasCollapsed) uviewFreetree.querySelector(".blog-card")?.classList.add("collapsed");
  };
  await draw();
  await freenet.refreshLog(`freetree/${pubkey}`);
  if (stillHere()) await draw();
}

async function renderBlog(pubkey: string) {
  const stillHere = () => uviewKey.textContent === pubkey;
  const draw = async () => {
    const prefix = freenet.deltaSiteOf(pubkey);
    if (!prefix) return void (uviewBlog.innerHTML = "");
    const origin = nodeOrigin();
    const head = (name: string, sub: string, loading = false) =>
      `<div class="blog-card-head">` +
      `<span class="link-card-icon" aria-hidden="true">${renderIcon("layers", { className: "icon-sm" })}</span>` +
      `<span class="link-card-text"><span class="link-card-host">Blog on Delta</span><span class="link-card-title">${escapeHtml(name)}</span>` +
      (sub ? `<span class="blog-card-desc">${sub}</span>` : "") +
      `</span>` +
      (!loading
        ? `<div class="blog-card-actions">` +
          `<a class="blog-card-open" href="${escapeHtml(pageHref(origin, prefix))}" target="_blank" rel="noopener noreferrer" title="Open on Delta" aria-label="Open on Delta">\u2197</a>` +
          `<button type="button" class="blog-card-toggle" aria-label="Toggle section" title="Collapse / expand">` +
          `<svg class="blog-card-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
          `</button>` +
          `</div>`
        : "") +
      `</div>`;
    if (!uviewBlog.innerHTML) {
      uviewBlog.innerHTML = `<div class="blog-card">${head(prefix, `<span class="boot-bar" style="width: 50px; height: 3px; display: inline-block; vertical-align: middle; margin-right: 6px;"><span></span></span>Loading articles…`, true)}</div>`;
    }
    const site = await freenet.deltaSite(prefix);
    if (!stillHere()) return;
    const pages = (site?.pages ?? [])
      .map((p) => `<a href="${escapeHtml(pageHref(origin, prefix, p.id))}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.title || "Untitled")}</a>`)
      .join("");
    const wasCollapsed = uviewBlog.querySelector(".blog-card")?.classList.contains("collapsed");
    uviewBlog.innerHTML =
      `<div class="blog-card${wasCollapsed ? " collapsed" : ""}">${head(site?.name ?? prefix, site ? escapeHtml(site.description) : "Not found on the network right now.")}` +
      (pages ? `<div class="blog-card-pages">${pages}</div>` : "") +
      `</div>`;
  };
  await draw();
  await freenet.refreshLog(`delta/${pubkey}`);
  if (stillHere()) await draw();
}

async function openUserProfile(pubkey: string) {
  markSeen((n) => n.type === "follow" && n.from === pubkey);
  const isSelf = pubkey === currentIdentity?.pubkey;
  // open at once with what is known; the feed (bio, posts) may take a few seconds to come from the network
  const initialBadge = getWebOfTrust().trustBadge(pubkey);
  uviewName.innerHTML = `${escapeHtml(getAuthorDisplayName(pubkey))} <span class="gram-trust-badge ${initialBadge.badgeClass}" title="${escapeHtml(initialBadge.description)}">${initialBadge.icon} ${escapeHtml(initialBadge.label)}</span>`;
  uviewKey.textContent = pubkey;
  uviewAvatar.src = getAuthorAvatarUrl(pubkey);
  uviewBio.textContent = "";
  uviewPostsGallery.innerHTML = `<div style="grid-column: 1 / -1; font-size: 0.85rem; color: var(--text-muted);">Loading…</div>`;
  uviewBlog.innerHTML = "";
  if (uviewOrtoBlog) uviewOrtoBlog.innerHTML = "";
  if (uviewAsocial) uviewAsocial.innerHTML = "";
  if (uviewFreetunes) uviewFreetunes.innerHTML = "";
  if (uviewFh) uviewFh.innerHTML = "";
  if (uviewFreetree) uviewFreetree.innerHTML = "";

  const uviewEcoLoader = document.getElementById("uview-ecosystem-loader");
  if (uviewEcoLoader) uviewEcoLoader.style.display = "flex";

  const appLoaders = Promise.allSettled([
    renderBlog(pubkey),
    renderOrtoBlog(pubkey),
    renderAsocial(pubkey),
    renderFreetunes(pubkey),
    renderFh(pubkey),
    renderFreetree(pubkey),
    renderNames(pubkey),
  ]);
  void Promise.race([appLoaders, new Promise((r) => setTimeout(r, 6000))]).then(() => {
    if (uviewKey.textContent === pubkey && uviewEcoLoader) {
      uviewEcoLoader.style.display = "none";
    }
  });

  userProfileModal.style.display = "flex";
  uviewFollowBtn.style.display = uviewTalkBtn.style.display = uviewHideBtn.style.display = isSelf ? "none" : "";
  uviewBlockBtn.style.display = uviewTrustBtn.style.display = isSelf ? "none" : "";
  // only the maintainer names global moderators
  const isMod = () => freenet.modsOf(DEFAULT_CURATOR).has(pubkey);
  const paintModBtn = () => (uviewModBtn.textContent = isMod() ? "Remove as Radica moderator" : "Make Radica moderator");
  uviewModBtn.style.display = !isSelf && currentIdentity?.pubkey === DEFAULT_CURATOR ? "" : "none";
  paintModBtn();
  uviewModBtn.onclick = async () => {
    const on = !isMod();
    if (on && !confirm(`Make ${getAuthorDisplayName(pubkey)} a Radica moderator? What they remove or block is hidden for everyone who follows your blocklist.`)) return;
    await freenet.setGlobalMod(pubkey, on);
    paintModBtn();
    refreshTrustedBlocklists();
  };
  const iBlock = () => freenet.blockedBy(currentIdentity!.pubkey).has(pubkey);
  const paintListBtns = () => {
    uviewBlockBtn.textContent = iBlock() ? "Remove from my blocklist" : "Add to my blocklist";
    uviewTrustBtn.textContent = trustedCurators().includes(pubkey) ? "Stop trusting their blocklist" : "Trust their blocklist";
  };
  paintListBtns();
  uviewBlockBtn.onclick = async () => {
    await toggleBlockAuthor(pubkey);
    paintListBtns();
  };
  uviewTrustBtn.onclick = () => {
    setCuratorTrusted(pubkey, !trustedCurators().includes(pubkey));
    paintListBtns();
    refreshTrustedBlocklists();
    renderTimeline();
  };
  uviewHideBtn.innerHTML = hideButtonHtml(hiddenUsers().includes(pubkey));
  uviewHideBtn.onclick = () => {
    const hide = !hiddenUsers().includes(pubkey);
    setUserHidden(pubkey, hide);
    uviewHideBtn.innerHTML = hideButtonHtml(hide);
    renderTimeline();
    if (blocklistsModal.style.display === "flex") renderBlocklists();
  };
  // wait for the network only when there is no local copy to show; otherwise show it now and update in the background
  if (!isSelf) {
    const fetched = freenet.refresh(pubkey, true);
    if (!safeStorage.getItem(`freenet_feed_${pubkey}`)) await Promise.race([fetched, new Promise((r) => setTimeout(r, 4000))]);
  }
  const feed = await freenet.getFeed(pubkey);
  const name = feed.profile?.display_name || getAuthorDisplayName(pubkey);
  const bio = feed.profile?.bio || "No bio available.";
  const avatar = feed.profile?.avatar_url || generateDefaultAvatar(pubkey);

  uviewAvatar.src = avatar;
  uviewAvatar.onerror = () => {
    uviewAvatar.src = generateDefaultAvatar(pubkey);
  };
  const badge = getWebOfTrust().trustBadge(pubkey);
  uviewName.innerHTML = `${escapeHtml(name)} <span class="gram-trust-badge ${badge.badgeClass}" title="${escapeHtml(badge.description)}">${badge.icon} ${escapeHtml(badge.label)}</span>`;
  uviewKey.textContent = pubkey;
  uviewBio.textContent = bio;

  const isFollowing = followingKeys.includes(pubkey);
  uviewFollowBtn.innerHTML = isFollowing
    ? `<span class="btn-icon-text">${renderIcon("userCheck", { className: "icon-xs" })} <span>Following</span></span>`
    : `<span class="btn-icon-text">${renderIcon("userPlus", { className: "icon-xs" })} <span>Follow</span></span>`;
  uviewFollowBtn.onclick = async () => {
    if (!currentIdentity) return;
    const nowFollowing = await freenet.toggleFollow(currentIdentity, pubkey);
    if (nowFollowing) {
      followingKeys.push(pubkey);
      uviewFollowBtn.innerHTML = `<span class="btn-icon-text">${renderIcon("userCheck", { className: "icon-xs" })} <span>Following</span></span>`;
    } else {
      followingKeys = followingKeys.filter((k) => k !== pubkey);
      uviewFollowBtn.innerHTML = `<span class="btn-icon-text">${renderIcon("userPlus", { className: "icon-xs" })} <span>Follow</span></span>`;
    }
    renderFollowingList();
    timelinePosts = await freenet.getTimeline(currentIdentity);
    renderTimeline();
  };

  uviewTalkBtn.onclick = () => {
    userProfileModal.style.display = "none";
    openChatWithPeer(pubkey);
  };

  // their posts, newest first: the text, the picture, likes and comments; a click opens the post in the feed
  const authorPosts = Object.values(feed.posts).sort((a, b) => b.timestamp - a.timestamp);
  if (authorPosts.length === 0) {
    uviewPostsGallery.innerHTML = `<div style="font-size: 0.85rem; color: var(--text-muted);">No posts yet.</div>`;
  } else {
    uviewPostsGallery.innerHTML = authorPosts
      .map((p) => {
        const likes = Object.values(p.likes ?? {}).filter((l) => l.liked).length;
        const comments = Object.values(p.comments ?? {}).filter((c) => c.text !== "").length;
        const edit = freenet.postEdit(pubkey, p.id);
        const caption = edit?.caption ?? p.caption;
        const comm = p.community_id ? ` · r/${escapeHtml(p.community_id.replace(/^c_/, ""))}` : "";
        const editedTag = edit ? ` · <span class="gram-edited" title="Edited ${formatTimeAgo(edit.ts)}">edited</span>` : "";
        return `<div class="uview-post" data-post-id="${escapeHtml(p.id)}" data-author="${escapeHtml(pubkey)}" role="button" tabindex="0" title="Open this post">
          ${p.media_uri && !videoRef(p.media_uri) ? `<div class="uview-post-thumb"><img ${mediaAttr(mediaUris(p.media_uri)[0])} alt="Post" /></div>` : ""}
          <div class="uview-post-body">
            ${caption ? `<div class="uview-post-text">${renderCaption(caption, getAuthorDisplayName)}</div>` : ""}
            <div class="uview-post-meta">${formatTimeAgo(p.timestamp)}${editedTag} · ♥ ${likes} · 💬 ${comments}${comm}</div>
          </div>
        </div>`;
      })
      .join("");
    showMedia(uviewPostsGallery);
  }

  userProfileModal.style.display = "flex";
}

uviewCloseBtn.addEventListener("click", () => {
  userProfileModal.style.display = "none";
});

// Collapsible app connection cards in user profile
userProfileModal.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target) return;
  // If clicked inside an external open link, any link, or FreeTunes play button, let it perform its normal action
  if (target.closest(".blog-card-open") || target.closest("a") || target.closest("[data-ft-play]")) return;

  const head = target.closest<HTMLElement>(".blog-card-head");
  if (head) {
    const card = head.closest<HTMLElement>(".blog-card");
    if (card) {
      const isCollapsed = card.classList.toggle("collapsed");
      const toggleBtn = head.querySelector<HTMLButtonElement>(".blog-card-toggle");
      if (toggleBtn) {
        toggleBtn.setAttribute("aria-expanded", (!isCollapsed).toString());
        toggleBtn.title = isCollapsed ? "Expand" : "Collapse";
      }
      if (isCollapsed) {
        card.querySelector<HTMLAudioElement>("audio")?.pause();
      }
    }
  }
});
// a post in the profile opens in the feed; its links, mentions and picture keep their own click
const openProfilePost = (e: Event) => {
  const t = e.target as HTMLElement;
  const row = t.closest<HTMLElement>(".uview-post");
  if (!row) return;
  if (t.closest("a.post-link")) return openPostLink.call(t.closest("a.post-link") as HTMLAnchorElement, e);
  if (t.closest(".mention")) return void openUserProfile(t.closest<HTMLElement>(".mention")!.dataset.author!);
  if (t.closest(".uview-post-thumb img")) return; // the picture opens full size
  userProfileModal.style.display = "none";
  void showMyPost(row.dataset.postId!, row.dataset.author!);
};
uviewPostsGallery.addEventListener("click", openProfilePost);
uviewPostsGallery.addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter") openProfilePost(e);
});

// ---- P2P Chat & Community Chatrooms ----

const CHAT_LAYOUT_KEY = "radica_chat_layout";
let chatOnlineState = false;

function currentChatLayout(): ChatLayoutMode {
  return safeStorage.getItem(CHAT_LAYOUT_KEY) === "classic" ? "classic" : "messenger";
}

function applyChatLayoutAttr(mode: ChatLayoutMode) {
  chatModal.dataset.chatLayout = mode;
  chatModal.querySelectorAll<HTMLButtonElement>("[data-layout-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.layoutMode === mode);
  });
  syncMiniPlayerSlot();
}

function setChatFullscreen(on: boolean) {
  chatModal.classList.toggle("fullscreen", on);
  const isChatOpen = chatModal.style.display !== "none" && chatModal.style.display !== "";
  document.body.classList.toggle("chat-fullscreen", on && isChatOpen);
  document.getElementById("chat-fullscreen-btn")?.setAttribute("aria-pressed", String(on));
  const rmFs = document.getElementById("rm-btn-fullscreen");
  if (rmFs) {
    rmFs.setAttribute("aria-pressed", String(on));
    rmFs.title = on ? "Exit full screen" : "Full screen";
  }
}

/** Open the chat at once with a loading bar, draw the conversation after the open chat is painted, then drop the bar. */
async function showChat(load: () => Promise<unknown>) {
  applyChatLayoutAttr(currentChatLayout());
  // full screen stays what the reader chose (the button); phones get the whole screen from body.chat-open
  chatModal.classList.add("chat-loading");
  chatModal.style.display = "flex";
  syncMiniPlayerSlot();
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // after the next paint
  try {
    await load();
    messengerChat.showInboxOnMobileIfEmpty();
  } finally {
    chatModal.classList.remove("chat-loading");
    syncMiniPlayerSlot();
  }
}

function openCommunityChat(comm: Community) {
  activeChatCommunity = comm;
  activeChatPeer = null;
  activeChatPrivateRoom = null;
  void showChat(async () => {
    await renderChatSidebar();
    await selectCommunityRoom(comm);
    messengerChat.openThreadOnMobile();
  });
}

/** Chat lists the rooms I joined (plus the one on screen), not every community on the network. */
function joinedCommunities(): Community[] {
  return allCommunities.filter((c) => c.members.includes(currentIdentity?.pubkey ?? "") || c.id === activeChatCommunity?.id);
}

function openChatWithPeer(peerPubkey?: string, focusThread = true, isSecret = false) {
  activeChatCommunity = null;
  if (peerPubkey) {
    activeChatPeer = peerPubkey;
    activeChatPrivateRoom = null;
    activeChatSecret = isSecret;
  }
  void showChat(async () => {
    const isMessenger = currentChatLayout() === "messenger";
    if (!isMessenger) {
      await renderChatSidebar();
    }
    if (activeChatPrivateRoom) await selectPrivateRoom(activeChatPrivateRoom);
    else if (activeChatPeer) await selectChatPeer(activeChatPeer, activeChatSecret);
    else if (allPrivateRooms.length > 0) await selectPrivateRoom(allPrivateRooms[0]);
    else if (joinedCommunities().length > 0) await selectCommunityRoom(joinedCommunities()[0]);
    else messengerChat.renderThread();
    if (focusThread && peerPubkey) messengerChat.openThreadOnMobile();
  });
}

openChatBtn.addEventListener("click", () => {
  if (activeCommunity) {
    openCommunityChat(activeCommunity);
  } else if (activeChatPrivateRoom) {
    messengerChat.showInboxOnMobile(); // phones open on the conversations list, not on the last open room
    void showChat(async () => {
      await renderChatSidebar();
      await selectPrivateRoom(activeChatPrivateRoom!);
    });
  } else {
    const chatPeers = currentIdentity
      ? freenet
          .getChatPeers(currentIdentity.pubkey)
          .filter((pk) => pk !== currentIdentity?.pubkey && !freenet.isChatPeerRemoved(currentIdentity!.pubkey, pk))
      : [];
    const discovered = currentIdentity ? freenet.getDiscoveredPeers(currentIdentity.pubkey).map((p) => p.pubkey) : [];
    const validDiscovered = discovered.filter(
      (pk) => pk !== currentIdentity?.pubkey && !freenet.isChatPeerRemoved(currentIdentity!.pubkey, pk)
    );
    const validFollowed = followingKeys.filter(
      (pk) => pk !== currentIdentity?.pubkey && !freenet.isChatPeerRemoved(currentIdentity!.pubkey, pk)
    );
    messengerChat.showInboxOnMobile(); // phones open on the conversations list, not on the last or first chat
    // the last conversation reopens as it was: a Secret Chat stays secret, not the plain DM with the same person
    if (activeChatPeer) openChatWithPeer(activeChatPeer, false, activeChatSecret);
    else openChatWithPeer(chatPeers[0] || validFollowed[0] || validDiscovered[0] || undefined, false);
  }
});

// The chat is a page of the main column: open, it takes the place of the feed (and of the right panel on desktop).
// While it is open the feeds are not fetched or redrawn; closing it catches up in one pass.
new MutationObserver(() => {
  const open = chatModal.style.display !== "none" && chatModal.style.display !== "";
  document.body.classList.toggle("chat-open", open);
  document.body.classList.toggle("chat-fullscreen", open && chatModal.classList.contains("fullscreen"));
  syncMiniPlayerSlot();
  if (open === freenet.feedsPaused) return;
  freenet.feedsPaused = open;
  if (!open && currentIdentity) {
    renderFollowingList();
    renderCommunities();
    renderDiscoveredPeers();
    void reloadPosts();
  }
}).observe(chatModal, { attributes: true, attributeFilter: ["style", "class"] });

// full screen: the chat covers the rail and the page, and the conversations list opens with the Chats button
document.getElementById("chat-fullscreen-btn")!.addEventListener("click", () => {
  const on = !chatModal.classList.contains("fullscreen");
  setChatFullscreen(on);
  chatBody?.classList.remove("show-rooms");
});

chatCloseBtn.addEventListener("click", () => {
  chatModal.style.display = "none";
});

// The rail's places are pages of the main column, one at a time: opening one closes the others, and with none open the
// feed (or the profile page) shows again.
const railPages: [HTMLElement, string][] = [
  [chatModal, "open-chat-btn"],
  [notifsModal, "open-notifs-btn"],
  [identityModal, "open-identity-btn"],
  [updatesModal, "updates-open-btn"],
  [guideModal, "guide-open-btn"],
  [greenhouseModal, "greenhouse-open-btn"],
  [welcomeModal, ""], // first steps: no rail button
  [blocklistsModal, "blocklists-open-btn"],
  [userProfileModal, ""], // someone's profile: no rail button
];
const isOpen = (el: HTMLElement) => el.style.display !== "none" && el.style.display !== "";
function closeRailPages(except?: HTMLElement) {
  for (const [el] of railPages) if (el !== except && isOpen(el)) el.style.display = "none";
}
let feedScrollY = 0; // where the feed was when a page covered it: closing the page returns there
// pressing the button of the page that is open closes it again (before the button's own handler would reopen it)
document.querySelector(".rail")?.addEventListener(
  "click",
  (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".rail-btn");
    const page = railPages.find(([, id]) => id && id === btn?.id)?.[0];
    if (page && isOpen(page)) {
      e.stopPropagation();
      if (!closeModal(page)) page.style.display = "none"; // no visible close button (e.g. the messenger layout)
    }
  },
  true
);
for (const [page, btnId] of railPages) {
  new MutationObserver(() => {
    const wasOpen = document.body.classList.contains("page-open");
    if (isOpen(page)) {
      if (!wasOpen) {
        feedScrollY = window.scrollY;
        pushBackStep("page"); // Back (Android gesture) closes the page instead of leaving Radica
      }
      closeRailPages(page);
      window.scrollTo({ top: 0 });
    }
    const open = railPages.some(([el]) => isOpen(el));
    const chatOpen = isOpen(chatModal);
    document.body.classList.toggle("page-open", open);
    document.body.classList.toggle("chat-open", chatOpen);
    document.body.classList.toggle("chat-fullscreen", chatOpen && chatModal.classList.contains("fullscreen"));
    if (wasOpen && !open) requestAnimationFrame(() => window.scrollTo({ top: feedScrollY }));
    document.getElementById(btnId)?.classList.toggle("active", isOpen(page));
    const moreIds = Array.from(document.querySelectorAll("#rail-more-group .rail-btn"), (b) => b.id);
    railMoreBtn?.classList.toggle("active", railPages.some(([el, id]) => moreIds.includes(id) && isOpen(el)));
  }).observe(page, { attributes: true, attributeFilter: ["style"] });
}

// phones: the conversations list is an overlay; picking a conversation closes it
document.getElementById("chat-rooms-btn")?.addEventListener("click", () => chatBody?.classList.toggle("show-rooms"));
document.querySelector(".chat-peers-sidebar")?.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest(".remove-peer-btn") && t.closest("[data-peer], [data-comm-id], [data-privroom-id]")) chatBody?.classList.remove("show-rooms");
});

if (chatParticipantsToggleBtn && chatBody) {
  chatParticipantsToggleBtn.addEventListener("click", () => {
    // on phones the members panel opens over the conversation, so it starts closed there
    chatBody.classList.toggle(matchMedia("(max-width: 768px)").matches ? "show-members" : "hide-participants");
  });
}

if (commChatBtn) {
  commChatBtn.addEventListener("click", () => {
    if (activeCommunity) {
      openCommunityChat(activeCommunity);
    }
  });
}

async function clearActiveChat() {
  if (!currentIdentity) return;
  if (activeChatPrivateRoom) {
    if (!confirm("Clear all messages in this private encrypted room?")) return;
    await freenet.clearChatRoom(activeChatPrivateRoom.id);
    await selectPrivateRoom(activeChatPrivateRoom);
  } else if (activeChatCommunity) {
    const isMod =
      activeChatCommunity.creator === currentIdentity.pubkey ||
      activeChatCommunity.moderators.includes(currentIdentity.pubkey);
    if (!isMod) {
      alert("Only community moderators can clear the community chatroom.");
      return;
    }
    if (!confirm(`Clear all messages in the r/${activeChatCommunity.slug} community chat?`)) return;
    await freenet.clearChatRoom(`comm_${activeChatCommunity.id}`);
    await selectCommunityRoom(activeChatCommunity);
  } else if (activeChatPeer) {
    if (!confirm("Clear this conversation history?")) return;
    const roomId = activeChatSecret
      ? freenet.getSecretRoomId(currentIdentity.pubkey, activeChatPeer)
      : freenet.getRoomId(currentIdentity.pubkey, activeChatPeer);
    await freenet.clearChatRoom(roomId);
    await selectChatPeer(activeChatPeer, activeChatSecret);
  }
}

chatClearBtn.addEventListener("click", () => void clearActiveChat());

chatTtlBtn?.addEventListener("click", () => {
  if (!activeChatSecret || !activeChatPeer || !currentIdentity) return;
  const roomId = freenet.getSecretRoomId(currentIdentity.pubkey, activeChatPeer);
  const next = { seconds: nextTtl(freenet.getSecretChatTTL(roomId)), label: "" };
  next.label = formatTtlLabel(next.seconds);
  freenet.setSecretChatTTL(roomId, next.seconds);
  chatTtlBtn.innerHTML = `<span>⏱️ ${next.label}</span>`;
  chatTtlBtn.title = `Disappearing messages timer: ${next.label}`;
  showToast(`Disappearing timer set to ${next.label}`, "info");
  messengerChat.renderThread();
});

newSecretChatBtn?.addEventListener("click", () => {
  messengerChat.openNewChatModal(true);
});
newDirectChatBtn?.addEventListener("click", () => {
  messengerChat.openNewChatModal(false);
});

// The message I am answering, and the messages on screen (to find it again by id).
let replyingTo: ChatMessage | null = null;
let shownMessages: ChatMessage[] = [];

function setReply(m: ChatMessage | null) {
  replyingTo = m;
  chatReplyBar.style.display = m ? "flex" : "none";
  if (m) chatReplyText.textContent = `Replying to ${m.sender === currentIdentity?.pubkey ? "yourself" : getAuthorDisplayName(m.sender)}: ${chatExcerpt(m.text)}`;
  messengerChat.renderReplyBanner();
}

// Redraws by key: only new, changed or removed children touch the DOM, the rest keep their images, input text and scroll.
// Children listen through delegation on the container. `nodeSrc` keeps the html a child was built from: its live
// outerHTML differs (onerror rewrites src).
const nodeSrc = new WeakMap<Element, string>();
function reconcile(container: HTMLElement, html: string, keyOf: (el: HTMLElement) => string | undefined) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const next = Array.from(tpl.content.children) as HTMLElement[];
  const cur = Array.from(container.children) as HTMLElement[];
  const keyed = (l: HTMLElement[]) => l.length > 0 && l.every((n) => keyOf(n));
  if (!keyed(next) || !keyed(cur)) {
    // empty states and the like: plain redraw
    container.replaceChildren(...Array.from(tpl.content.childNodes));
    for (const n of Array.from(container.children)) nodeSrc.set(n, n.outerHTML);
    return;
  }
  const old = new Map(cur.map((n) => [keyOf(n)!, n]));
  const keep = new Set<Element>();
  let cursor: Element | null = container.firstElementChild;
  for (const n of next) {
    const src = n.outerHTML;
    const ex = old.get(keyOf(n)!);
    const el = ex && nodeSrc.get(ex) === src ? ex : n;
    nodeSrc.set(el, src);
    keep.add(el);
    if (el === cursor) cursor = cursor.nextElementSibling;
    else {
      const nextCur = cursor && cursor === ex ? cursor.nextElementSibling : cursor;
      container.insertBefore(el, cursor);
      cursor = nextCur;
    }
  }
  for (const n of cur) if (!keep.has(n)) n.remove();
}

/** Same as `reconcile`, from html already split per child: an unchanged child is neither parsed nor serialized again. */
function reconcileItems(container: HTMLElement, items: { key: string; html: string }[], keyOf: (el: HTMLElement) => string | undefined) {
  const old = new Map<string, Element>();
  for (const n of Array.from(container.children) as HTMLElement[]) {
    const k = keyOf(n);
    if (k) old.set(k, n);
    else n.remove(); // an empty state drawn before
  }
  const keep = new Set<Element>();
  let cursor: Element | null = container.firstElementChild;
  for (const { key, html } of items) {
    let el = old.get(key);
    if (!el || nodeSrc.get(el) !== html) {
      const tpl = document.createElement("template");
      tpl.innerHTML = html;
      el = tpl.content.firstElementChild!;
      nodeSrc.set(el, html);
    }
    keep.add(el);
    if (el === cursor) cursor = cursor.nextElementSibling;
    else {
      const ex = old.get(key);
      const nextCur = cursor && cursor === ex ? cursor.nextElementSibling : cursor;
      container.insertBefore(el, cursor);
      cursor = nextCur;
    }
  }
  for (const n of old.values()) if (!keep.has(n)) n.remove();
}

// For small lists whose rows get listeners after each draw: an identical draw is skipped (the DOM and its listeners stay).
const lastHtml = new WeakMap<Element, string>();
function setHtmlIfChanged(el: Element, html: string): boolean {
  if (lastHtml.get(el) === html) return false;
  lastHtml.set(el, html);
  el.innerHTML = html;
  return true;
}

function paintChat(html: string | (() => string)) {
  if (currentChatLayout() !== "classic") return;
  reconcile(chatMessagesList, typeof html === "function" ? html() : html, (el) => el.dataset.msgId);
  fillChatMedia(chatMessagesList, (h) => freenet.getMedia(h));
  fillFreepolls(chatMessagesList, pollNet);
  fillFreetunes(chatMessagesList, (id) => freenet.appContract(id), nodeOrigin(), (pk) => freenet.freetunesArtist(pk));
  fillFreenames(chatMessagesList, freenet);
  fillDelta(chatMessagesList, freenet);
  fillOrto(chatMessagesList);
  fillAsocial(chatMessagesList);
  fillFh(chatMessagesList, freenet, nodeOrigin());
  fillWormhole(chatMessagesList);
}

/** Draw the open conversation again, keeping the reader's place. */
async function rerenderChat() {
  const top = chatMessagesList.scrollTop;
  if (activeChatPrivateRoom) await selectPrivateRoom(activeChatPrivateRoom);
  else if (activeChatCommunity) await selectCommunityRoom(activeChatCommunity);
  else if (activeChatPeer) await selectChatPeer(activeChatPeer, activeChatSecret);
  chatMessagesList.scrollTop = top;
}

let classicReactPicker: HTMLElement | null = null;
const closeClassicReactPicker = () => {
  classicReactPicker?.remove();
  classicReactPicker = null;
};

function openClassicReactPicker(msgId: string, roomId: string, anchorEl: HTMLElement) {
  if (classicReactPicker && classicReactPicker.dataset.forMsg === msgId) {
    closeClassicReactPicker();
    return;
  }
  closeClassicReactPicker();
  const picker = document.createElement("div");
  picker.className = "rv-react-picker";
  picker.dataset.forMsg = msgId;
  picker.setAttribute("role", "dialog");
  picker.setAttribute("aria-label", "Reactions");
  picker.innerHTML = `
    <div class="rv-react-grid">
      ${CHAT_REACTIONS.map((emoji) => `<button type="button" class="rv-react-opt" data-react-opt="${emoji}" title="${emoji}">${emoji}</button>`).join("")}
    </div>
  `;
  document.body.appendChild(picker);
  classicReactPicker = picker;

  const rect = anchorEl.getBoundingClientRect();
  const pWidth = 168;
  const pHeight = 176;

  let left = rect.left;
  if (left + pWidth > window.innerWidth - 12) {
    left = window.innerWidth - pWidth - 12;
  }
  if (left < 12) left = 12;

  let top = rect.top - pHeight - 6;
  if (top < 10) {
    top = rect.bottom + 6;
  }
  picker.style.left = `${Math.round(left)}px`;
  picker.style.top = `${Math.round(top)}px`;

  picker.addEventListener("click", async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-react-opt]");
    if (!btn) return;
    const emoji = btn.dataset.reactOpt;
    if (!emoji) return;
    closeClassicReactPicker();
    try {
      await freenet.reactToChatMessage(
        roomId,
        msgId,
        emoji,
        activeChatCommunity || activeChatPrivateRoom ? undefined : activeChatPeer ?? undefined
      );
    } catch (err: any) {
      alert(`Could not react: ${err.message || err}`);
    }
    await rerenderChat();
  });
}

document.addEventListener("pointerdown", (e) => {
  if (!(e.target as HTMLElement).closest(".rv-react-picker, .rv-open-react-btn")) {
    closeClassicReactPicker();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeClassicReactPicker();
});
chatMessagesList.addEventListener("scroll", closeClassicReactPicker, { passive: true });

chatReplyCancel.addEventListener("click", () => setReply(null));

chatMessagesList.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  const openReact = t.closest<HTMLElement>(".rv-open-react-btn");
  if (openReact) {
    e.stopPropagation();
    openClassicReactPicker(openReact.dataset.msgId!, openReact.dataset.roomId!, openReact);
    return;
  }
  const react = t.closest<HTMLElement>("[data-react]");
  if (react) {
    try {
      await freenet.reactToChatMessage(react.dataset.roomId!, react.dataset.msgId!, react.dataset.react!, activeChatCommunity || activeChatPrivateRoom ? undefined : activeChatPeer ?? undefined);
    } catch (err: any) {
      alert(`Could not react: ${err.message || err}`);
    }
    await rerenderChat();
    return;
  }
  const delBtn = t.closest<HTMLElement>(".chat-bubble-del");
  if (delBtn) {
    e.stopPropagation();
    const roomId = delBtn.dataset.roomId!;
    const msgId = delBtn.dataset.msgId!;
    if (confirm("Delete this message?")) {
      shownMessages = shownMessages.filter((m) => m.id !== msgId);
      const bubble = chatMessagesList.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`);
      bubble?.remove();
      messengerChat.renderThread();
      void messengerChat.refreshInbox();
      freenet.deleteChatMessage(roomId, msgId).catch((err) => {
        showToast(`Could not delete: ${err.message || err}`, "error");
        void rerenderChat();
      });
    }
    return;
  }
  const reply = t.closest<HTMLElement>(".rv-reply-btn");
  if (reply) {
    setReply(shownMessages.find((m) => m.id === reply.dataset.msgId) ?? null);
    chatMessageInput.focus();
    return;
  }
  const jump = t.closest<HTMLElement>(".rv-quote");
  if (jump) chatMessagesList.querySelector(`[data-msg-id="${CSS.escape(jump.dataset.jump!)}"]`)?.scrollIntoView({ block: "center" });
});

function attachBubbleDeleteListeners() {
  // Delegated to chatMessagesList click listener for maximum performance
}

function openRoomId(): string | null {
  if (!currentIdentity) return null;
  if (activeChatPrivateRoom) return activeChatPrivateRoom.id;
  if (activeChatCommunity) return `comm_${activeChatCommunity.id}`;
  if (activeChatPeer) {
    return activeChatSecret
      ? freenet.getSecretRoomId(currentIdentity.pubkey, activeChatPeer)
      : freenet.getRoomId(currentIdentity.pubkey, activeChatPeer);
  }
  return null;
}

function switchChatLayout(mode: ChatLayoutMode) {
  safeStorage.setItem(CHAT_LAYOUT_KEY, mode);
  applyChatLayoutAttr(mode);
  if (mode === "messenger") {
    void messengerChat.refreshInbox();
    messengerChat.renderThread();
    messengerChat.refreshDrawer();
    messengerChat.showInboxOnMobileIfEmpty();
  } else {
    void renderChatSidebar();
    renderChatParticipants();
    if (activeChatPrivateRoom || activeChatCommunity || activeChatPeer) {
      void rerenderChat();
    }
  }
}

const conversation = createConversationState({
  me: () => currentIdentity?.pubkey,
  secretRooms: () => {
    const me = currentIdentity?.pubkey;
    if (!me) return [];
    return freenet.storedSecretChatPeers(me).map((peer) => {
      const roomId = freenet.getSecretRoomId(me, peer);
      return { roomId, messages: freenet.visibleChat(roomId) };
    });
  },
  burn: async (roomId, msgId) => {
    shownMessages = shownMessages.filter((m) => m.id !== msgId);
    const row = chatModal.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`) as HTMLElement | null;
    if (row && !row.dataset.burning) {
      triggerRowBurnAnimation(row);
    }
    await freenet.burnSecretMessage(roomId, msgId, dmPeerOf(roomId, currentIdentity?.pubkey ?? "") ?? undefined);
    void messengerChat.refreshInbox();
  },
  sendTyping: (roomId) => freenet.sendTyping(roomId),
  readStore: safeStorage,
  logReadMarks: () => freenet.readMarks(),
  countSince: (roomId, since) => freenet.unreadCount(roomId, currentIdentity?.pubkey ?? "", since),
  publishRead: (roomId, upto) => void freenet.markRoomRead(roomId, upto),
});

const messengerChat = createMessengerChat({
  conversation,
  rootEl: document.getElementById("rm-messenger-card") as HTMLElement,
  pollNet,
  isVisible: () => chatModal.style.display !== "none" && currentChatLayout() === "messenger",
  getIdentity: () => currentIdentity,
  getAllPrivateRooms: () => allPrivateRooms,
  getJoinedCommunities: joinedCommunities,
  getAllCommunities: () => allCommunities,
  getFollowingKeys: () => followingKeys,
  getActiveState: () => ({
    peer: activeChatPeer,
    isSecret: activeChatSecret,
    privateRoom: activeChatPrivateRoom,
    community: activeChatCommunity,
    shownMessages,
    replyingTo,
    online: chatOnlineState,
  }),
  openRoomId,
  getAuthorDisplayName,
  getAuthorAvatarUrl,
  onSelectPeer: selectChatPeer,
  onSelectPrivateRoom: selectPrivateRoom,
  onSelectCommunity: selectCommunityRoom,
  onSendMessage: sendActiveChatText,
  onSetReply: setReply,
  onReactMessage: async (roomId, msgId, emoji, peer) => {
    try {
      await freenet.reactToChatMessage(roomId, msgId, emoji, peer);
    } catch (err: any) {
      showToast(`Could not react: ${err.message || err}`, "error");
    }
    await rerenderChat();
  },
  onDeleteMessage: async (roomId, msgId) => {
    if (!confirm("Delete this message?")) return;
    shownMessages = shownMessages.filter((m) => m.id !== msgId);
    chatMessagesList.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`)?.remove();
    messengerChat.renderThread();
    void messengerChat.refreshInbox();
    const deleteAction = freenet.isSecretRoomId(roomId)
      ? freenet.burnSecretMessage(roomId, msgId, activeChatPeer ?? undefined)
      : freenet.deleteChatMessage(roomId, msgId);
    deleteAction.catch((err) => {
      showToast(`Could not delete: ${err.message || err}`, "error");
      void rerenderChat();
    });
  },
  onEditMessage: async (roomId, msgId, newText) => {
    try {
      await freenet.editChatMessage(roomId, msgId, newText);
      await rerenderChat();
      showToast("Message edited", "info");
    } catch (err: any) {
      showToast(`Could not edit message: ${err.message || err}`, "error");
    }
  },
  onPinMessage: async (roomId, msgId) => {
    if (!currentIdentity) return;
    try {
      await freenet.setRoomPinnedMessage(currentIdentity, roomId, msgId);
      await rerenderChat();
      showToast(msgId ? "Message pinned 📌" : "Message unpinned", "info");
    } catch (err: any) {
      showToast(`Could not pin message: ${err.message || err}`, "error");
    }
  },
  onClearActiveChat: clearActiveChat,
  onRemovePeer: (peer, secret) => removePeerFromRecent(peer, secret ?? (activeChatSecret && activeChatPeer === peer)),
  isPeerBlocked: (pk) => isHiddenAuthor(pk),
  onToggleBlockPeer: (pk) => toggleBlockAuthor(pk).then(() => {}),
  onLeavePrivateRoom: leaveActivePrivateRoom,
  onOpenCreateRoomModal: () => newPrivateRoomBtn?.click(),
  onOpenCreateChannelModal: () => newChannelBtn?.click(),
  onOpenJoinRoomModal: () => joinPrivateRoomBtn?.click(),
  onOpenInviteRoomModal: () => chatInviteBtn?.click(),
  onGetInviteLink: inviteLinkOf,
  onOpenUserProfile: (pk) => void openUserProfile(pk),
  onOpenPostLink: (e, anchor) => openPostLink.call(anchor, e),
  onCreatePollLink: (question, options, multi) =>
    createPoll(
      { question: question.slice(0, 300), options: options.map((o) => o.slice(0, 200)), multi },
      pollNet,
      nodeOrigin()
    ),
  onSwitchLayout: switchChatLayout,
  onToggleFullscreen: () => document.getElementById("chat-fullscreen-btn")?.click(),
  onCloseChat: () => {
    chatModal.style.display = "none";
  },
  isPickingFile: () => isPickingFile(),
  markPickingFile: (ms?: number) => markPickingFile(ms),
  clearPickingFile: (delayMs?: number) => clearPickingFile(delayMs),
  showToast: (msg, type = "info") => showToast(msg, type),
});

// Back, one step at a time: popup -> chat drawer/thread -> chat/rail page -> feed.
// Also works when Android's Back gesture exits HTML fullscreen (where browsers suppress popstate) or inside sandboxed iframes.
function stepBackInRadica(): boolean {
  if (isPickingFile()) return false;
  const overlays = Array.from(document.querySelectorAll<HTMLElement>(".modal-overlay")).filter(isOpen);
  const topOverlay = overlays.pop();
  if (topOverlay && closeModal(topOverlay)) return true;
  if (isOpen(chatModal)) {
    if (currentChatLayout() === "messenger" && messengerChat.stepBackOnMobile()) return true;
    if (currentChatLayout() === "classic" && chatBody?.classList.contains("show-rooms")) {
      chatBody.classList.remove("show-rooms");
      return true;
    }
  }
  if (railPages.some(([el]) => isOpen(el))) {
    closeRailPages();
    return true;
  }
  return false;
}
new MutationObserver(() => {
  if (messengerChat.isThreadOpenOnMobile() && history.state?.radica !== "thread") pushBackStep("thread");
}).observe(document.getElementById("rm-workspace")!, { attributes: true, attributeFilter: ["class"] });
const rmInfoDrawer = document.getElementById("rm-info-drawer");
if (rmInfoDrawer) {
  new MutationObserver(() => {
    if (rmInfoDrawer.classList.contains("open") && history.state?.radica !== "drawer") pushBackStep("drawer");
  }).observe(rmInfoDrawer, { attributes: true, attributeFilter: ["class"] });
}
let pendingFullscreenBack = false;
handleFullscreenBackExit = () => {
  if (isPickingFile()) return;
  if (history.state?.radica) {
    pendingFullscreenBack = true;
    history.back();
    setTimeout(() => {
      if (pendingFullscreenBack) {
        pendingFullscreenBack = false;
        stepBackInRadica();
      }
    }, 50);
  } else {
    stepBackInRadica();
  }
};
window.addEventListener("popstate", () => {
  if (isPickingFile()) return;
  pendingFullscreenBack = false;
  stepBackInRadica();
});

// Keep #chat-modal sized to the visible area above the soft keyboard on phones via visualViewport / virtualKeyboard.
const virtualKb = (
  navigator as Navigator & {
    virtualKeyboard?: {
      overlaysContent: boolean;
      boundingRect?: DOMRect;
      addEventListener?: (type: string, listener: () => void) => void;
    };
  }
).virtualKeyboard;
if (virtualKb) {
  try {
    virtualKb.overlaysContent = true;
  } catch {}
  virtualKb.addEventListener?.("geometrychange", syncMobileViewport);
}

function syncMobileViewport() {
  const vv = window.visualViewport;
  if (!vv || (vv.scale && Math.abs(vv.scale - 1) >= 0.05)) {
    document.documentElement.style.removeProperty("--rm-vvh");
    document.documentElement.style.removeProperty("--rm-vvt");
    return;
  }
  const kbH = virtualKb?.boundingRect ? Math.round(virtualKb.boundingRect.height || 0) : 0;
  let rawH = vv ? vv.height : window.innerHeight;
  const fsActive = !!document.fullscreenElement;
  const textFocused = isMobileTextEntry(document.activeElement);
  if (fsActive && textFocused && rawH >= window.innerHeight - 50) {
    const isLandscape = window.innerWidth > window.innerHeight;
    const ratio = isLandscape ? 0.50 : 0.42;
    const est = Math.min(460, Math.max(280, Math.round(window.innerHeight * ratio)));
    rawH = Math.max(180, window.innerHeight - est);
  }
  const h = Math.max(180, Math.round(kbH > 0 ? Math.min(rawH, window.innerHeight - kbH) : rawH));
  const t = Math.max(0, Math.round(vv.offsetTop));
  document.documentElement.style.setProperty("--rm-vvh", `${h}px`);
  document.documentElement.style.setProperty("--rm-vvt", `${t}px`);
  if (isOpen(chatModal) && window.scrollY !== 0) window.scrollTo(0, 0);
  messengerChat.onViewportResize(h);
}
window.visualViewport?.addEventListener("resize", syncMobileViewport);
window.visualViewport?.addEventListener("scroll", syncMobileViewport);
window.addEventListener("resize", syncMobileViewport);
document.addEventListener("fullscreenchange", () => {
  syncMobileViewport();
  setTimeout(syncMobileViewport, 80);
  setTimeout(syncMobileViewport, 220);
});
new MutationObserver(syncMobileViewport).observe(chatModal, { attributes: true, attributeFilter: ["style", "class"] });
document.addEventListener("focusin", (e) => {
  const t = e.target as HTMLElement | null;
  if (!isMobileTextEntry(t)) return;
  requestAnimationFrame(() => {
    syncMobileViewport();
    if (!t.closest("#chat-modal")) {
      t.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
  setTimeout(syncMobileViewport, 80);
  setTimeout(syncMobileViewport, 180);
  setTimeout(syncMobileViewport, 340);
});
document.addEventListener("focusout", (e) => {
  const t = e.target as HTMLElement | null;
  if (isMobileTextEntry(t)) {
    setTimeout(syncMobileViewport, 60);
    setTimeout(syncMobileViewport, 140);
  }
});
syncMobileViewport();


freenet.onTyping((roomId, sender) => conversation.remoteTyping(roomId, sender));
conversation.onTypingChange((roomId) => {
  if (roomId !== openRoomId() || !chatClassicTypingBar || !chatClassicTypingText) return;
  const typers = conversation.typersIn(roomId);
  chatClassicTypingText.textContent = typers.length ? `${typers.map((s) => getAuthorDisplayName(s)).join(", ")} is typing...` : "";
  chatClassicTypingBar.style.display = typers.length ? "flex" : "none";
});

// one countdown for both chat views; burning the messages themselves is conversation.sweepBurns()'s job
setInterval(() => {
  if (chatModal && chatModal.style.display !== "none" && !document.hidden) {
    tickBurnCountdowns(chatModal);
  }
}, 500);
startVersionCheck();

applyChatLayoutAttr(currentChatLayout());
document.querySelector(".chat-header")?.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-layout-mode]");
  if (!btn?.dataset.layoutMode) return;
  switchChatLayout(btn.dataset.layoutMode as ChatLayoutMode);
});
function unreadBadge(roomId: string, read: Record<string, number>): string {
  const n = conversation.unread(roomId, read);
  return n ? `<span class="chat-unread-badge" title="${n} unread">${n > 99 ? "99+" : n}</span>` : "";
}

async function renderChatSidebar() {
  if (!currentIdentity) return;

  // the conversation on screen is read as of now
  const open = openRoomId();
  if (open) {
    conversation.markRead(open);
    updateChatBadge();
  }
  const read = conversation.readMarks();

  // 0. Render Private Rooms & Broadcast Channels
  allPrivateRooms = await freenet.getPrivateRooms(currentIdentity);
  if (currentChatLayout() === "messenger") {
    void messengerChat.refreshInbox();
    return;
  }

  const pins = getPinnedSet();

  const channelRooms = allPrivateRooms.filter((r) => r.is_channel);
  channelRooms.sort((a, b) => {
    const aPin = pins.has(`priv:${a.id}`);
    const bPin = pins.has(`priv:${b.id}`);
    if (aPin !== bPin) return Number(bPin) - Number(aPin);
    return (b.created_at || 0) - (a.created_at || 0);
  });

  const groupRooms = allPrivateRooms.filter((r) => !r.is_channel);
  groupRooms.sort((a, b) => {
    const aPin = pins.has(`priv:${a.id}`);
    const bPin = pins.has(`priv:${b.id}`);
    if (aPin !== bPin) return Number(bPin) - Number(aPin);
    return (b.created_at || 0) - (a.created_at || 0);
  });

  // 0a. Render Broadcast Channels
  if (chatChannelsList) {
    if (channelRooms.length === 0) {
      setHtmlIfChanged(chatChannelsList, `<div style="font-size: 0.72rem; color: var(--text-muted); padding: 4px;">No broadcast channels yet.<br/>Click <strong>+</strong> above to start a channel.</div>`);
    } else {
      const channelItems = await Promise.all(
        channelRooms.map(async (r) => {
          const isActive = activeChatPrivateRoom?.id === r.id;
          const isPinned = pins.has(`priv:${r.id}`);
          const name = await freenet.getPrivateRoomDecryptedName(currentIdentity!, r).catch(() => `Channel (${r.id.slice(9, 15)})`);
          return `
            <div class="chat-privroom-item ${isActive ? "active" : ""}" data-privroom-id="${escapeHtml(r.id)}" title="Enter ${escapeHtml(name)}">
              <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
                <span>${isPinned ? "📌 " : ""}📢</span>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(name)}</span>
              </div>
              <span>${unreadBadge(r.id, read)}<span class="chat-privroom-badge">${r.members.length}</span></span>
            </div>
          `;
        })
      );
      const paintedChannels = setHtmlIfChanged(chatChannelsList, channelItems.join(""));
      if (paintedChannels) chatChannelsList.querySelectorAll(".chat-privroom-item").forEach((el) => {
        el.addEventListener("click", () => {
          const rId = (el as HTMLElement).dataset.privroomId!;
          const found = allPrivateRooms.find((r) => r.id === rId);
          if (found) selectPrivateRoom(found);
        });
      });
    }
  }

  // 0b. Render Private Groups
  if (chatPrivateRoomsList) {
    if (groupRooms.length === 0) {
      setHtmlIfChanged(chatPrivateRoomsList, `<div style="font-size: 0.72rem; color: var(--text-muted); padding: 4px;">No private groups yet.<br/>Click <strong>+</strong> to start an E2EE group.</div>`);
    } else {
      const roomItems = await Promise.all(
        groupRooms.map(async (r) => {
          const isActive = activeChatPrivateRoom?.id === r.id;
          const isPinned = pins.has(`priv:${r.id}`);
          // one room that cannot be read must not leave the whole list (and the ones below it) empty
          const name = await freenet.getPrivateRoomDecryptedName(currentIdentity!, r).catch(() => `Private Room (${r.id.slice(9, 15)})`);
          return `
            <div class="chat-privroom-item ${isActive ? "active" : ""}" data-privroom-id="${escapeHtml(r.id)}" title="Enter ${escapeHtml(name)}">
              <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
                <span>${isPinned ? "📌 " : ""}${renderIcon("lock", { className: "icon-xs" })}</span>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(name)}</span>
              </div>
              <span>${unreadBadge(r.id, read)}<span class="chat-privroom-badge">${r.members.length}</span></span>
            </div>
          `;
        })
      );
      const paintedRooms = setHtmlIfChanged(chatPrivateRoomsList, roomItems.join(""));

      if (paintedRooms) chatPrivateRoomsList.querySelectorAll(".chat-privroom-item").forEach((el) => {
        el.addEventListener("click", () => {
          const rId = (el as HTMLElement).dataset.privroomId!;
          const found = allPrivateRooms.find((r) => r.id === rId);
          if (found) selectPrivateRoom(found);
        });
      });
    }
  }

  // 1. Render Communities Chatrooms
  if (chatCommunitiesList) {
    const joined = joinedCommunities();
    joined.sort((a, b) => {
      const aPin = pins.has(`comm:${a.id}`);
      const bPin = pins.has(`comm:${b.id}`);
      if (aPin !== bPin) return Number(bPin) - Number(aPin);
      return a.slug.localeCompare(b.slug);
    });
    if (joined.length === 0) {
      setHtmlIfChanged(chatCommunitiesList, `<div style="font-size: 0.75rem; color: var(--text-muted); padding: 4px;">No joined communities yet. Join one from the sidebar to chat here.</div>`);
    } else {
      const paintedComms = setHtmlIfChanged(chatCommunitiesList, joined
        .map((c) => {
          const isActive = activeChatCommunity?.id === c.id;
          const isPinned = pins.has(`comm:${c.id}`);
          return `
            <div class="chat-comm-item ${isActive ? "active" : ""}" data-comm-id="${escapeHtml(c.id)}" title="Enter r/${escapeHtml(c.slug)} chatroom">
              <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
                <span>${isPinned ? "📌 " : ""}${renderIcon("hash", { className: "icon-xs" })}</span>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">r/${escapeHtml(c.slug)}</span>
              </div>
              <span>${unreadBadge(`comm_${c.id}`, read)}<span class="chat-comm-badge">${c.members.length}</span></span>
            </div>
          `;
        })
        .join(""));

      if (paintedComms) chatCommunitiesList.querySelectorAll(".chat-comm-item").forEach((el) => {
        el.addEventListener("click", () => {
          const cId = (el as HTMLElement).dataset.commId!;
          const found = allCommunities.find((c) => c.id === cId);
          if (found) selectCommunityRoom(found);
        });
      });
    }
  }

  const me = currentIdentity!.pubkey;
  const myBlocked = freenet.blockedBy(me);
  const localHidden = new Set(hiddenUsers());

  // 1b. Render Secret Chats (PFS)
  if (chatSecretList) {
    const secretPeers = freenet.getSecretChatPeers(currentIdentity.pubkey)
      .filter((pk) => pk && pk !== me && !myBlocked.has(pk) && !localHidden.has(pk));

    if (secretPeers.length === 0) {
      setHtmlIfChanged(chatSecretList, `<div style="font-size: 0.72rem; color: var(--text-muted); padding: 4px;">No secret chats yet.<br/>Click <strong>+</strong> to start an ephemeral PFS chat.</div>`);
    } else {
      secretPeers.sort((a, b) => {
        const aPin = pins.has(`secret:${a}`);
        const bPin = pins.has(`secret:${b}`);
        if (aPin !== bPin) return Number(bPin) - Number(aPin);
        return getAuthorDisplayName(a).localeCompare(getAuthorDisplayName(b));
      });

      setHtmlIfChanged(
        chatSecretList,
        secretPeers
          .map((pk) => {
            const displayName = getAuthorDisplayName(pk);
            const secretRoomId = freenet.getSecretRoomId(me, pk);
            const isActive = activeChatPeer === pk && activeChatSecret && !activeChatCommunity && !activeChatPrivateRoom;
            const isPinned = pins.has(`secret:${pk}`);
            return `
              <div class="chat-secret-item ${isActive ? "active" : ""}" data-secret-peer="${escapeHtml(pk)}" title="Secret Chat with ${escapeHtml(displayName)} (PFS)">
                <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; flex: 1;">
                  <img src="${safeUrl(getAuthorAvatarUrl(pk))}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" onerror="this.onerror=null; this.src='${generateDefaultAvatar(pk)}'" />
                  <span style="overflow: hidden; min-width: 0;">
                    <span style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${isPinned ? "📌 " : ""}${escapeHtml(displayName)}</span>
                  </span>
                </div>
                ${unreadBadge(secretRoomId, read)}
                <span class="chat-secret-badge">🔐</span>
                <button class="remove-secret-peer-btn" data-secret-peer="${escapeHtml(pk)}" title="Remove secret chat from list" style="background: transparent; border: none; cursor: pointer; color: var(--rv-muted); padding: 2px 4px;">${renderIcon("x", { className: "icon-xs" })}</button>
              </div>
            `;
          })
          .join("")
      );

      if (!chatSecretList.dataset.bound) {
        chatSecretList.dataset.bound = "1";
        chatSecretList.addEventListener("click", (e) => {
          const target = e.target as HTMLElement;
          const rm = target.closest<HTMLElement>(".remove-secret-peer-btn");
          const peer = (rm ?? target.closest<HTMLElement>("[data-secret-peer]"))?.dataset.secretPeer;
          if (!peer) return;
          if (!rm) return void selectChatPeer(peer, true);
          e.stopPropagation();
          freenet.removeSecretChatPeer(me, peer);
          renderChatSidebar();
        });
      }
    }
  }

  // 2. Render Direct Message contacts (excluding self!)
  const rawPeers = Array.from(
    new Set([
      ...freenet.getChatPeers(currentIdentity.pubkey),
      ...followingKeys,
      ...(activeChatPeer && !activeChatSecret ? [activeChatPeer] : []), // an open Secret Chat does not list the plain DM
    ])
  );
  // a conversation I removed stays out of the list (followed or discovered people too) until I open it again
  freenet.warmPeers(rawPeers);
  const knownPeers = rawPeers.filter(
    (pk) => pk && pk !== me && !myBlocked.has(pk) && !localHidden.has(pk) && ((pk === activeChatPeer && !activeChatSecret) || !freenet.isChatPeerRemoved(me, pk))
  );

  if (knownPeers.length === 0) {
    setHtmlIfChanged(chatPeersList, `<div style="font-size: 0.75rem; color: var(--text-muted); padding: 4px;">No direct messages yet.</div>`);
    void messengerChat.refreshInbox();
    return;
  }

  // two contacts can share a name (a Radica one, a River one): tell them apart by key
  const nameCount = new Map<string, number>();
  for (const pk of knownPeers) nameCount.set(getAuthorDisplayName(pk), (nameCount.get(getAuthorDisplayName(pk)) ?? 0) + 1);

  knownPeers.sort((a, b) => {
    const aPin = pins.has(`dm:${a}`);
    const bPin = pins.has(`dm:${b}`);
    if (aPin !== bPin) return Number(bPin) - Number(aPin);
    return getAuthorDisplayName(a).localeCompare(getAuthorDisplayName(b));
  });

  setHtmlIfChanged(chatPeersList, knownPeers
    .map((pk) => {
      const displayName = getAuthorDisplayName(pk);
      const riverRooms = Object.values(freenet.riverOnly.get(pk) ?? {});
      const fromRiver = freenet.riverOnly.has(pk);
      const inRooms = riverRooms.length ? `<span class="peer-from" title="${escapeHtml(riverRooms.join(", "))}">in ${escapeHtml(riverRooms.join(", "))}</span>` : "";
      const dup = (nameCount.get(displayName) ?? 0) > 1 ? ` <span class="peer-key">${escapeHtml(pk.slice(0, 4))}</span>` : "";
      const riverTag = fromRiver ? ` <span class="peer-origin" title="Contact from River">River</span>` : "";
      const isActive = activeChatPeer === pk && !activeChatCommunity && !activeChatPrivateRoom;
      const isPinned = pins.has(`dm:${pk}`);
      return `
    <div class="chat-peer-item ${isActive ? "active" : ""}" data-peer="${escapeHtml(pk)}" title="${escapeHtml(pk)}">
      <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; flex: 1;">
        <img src="${safeUrl(getAuthorAvatarUrl(pk))}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" onerror="this.onerror=null; this.src='${generateDefaultAvatar(pk)}'" />
        <span style="overflow: hidden; min-width: 0;">
          <span style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${isPinned ? "📌 " : ""}${escapeHtml(displayName)}${dup}${riverTag}</span>${inRooms}
        </span>
      </div>
      ${unreadBadge(freenet.getRoomId(currentIdentity!.pubkey, pk), read)}
      <button class="remove-peer-btn" data-peer="${escapeHtml(pk)}" title="Remove conversation from list">${renderIcon("x", { className: "icon-xs" })}</button>
    </div>
  `;
    })
    .join(""));

  // one delegated listener, bound once, instead of two per row on every render
  if (!chatPeersList.dataset.bound) {
    chatPeersList.dataset.bound = "1";
    chatPeersList.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const rm = target.closest<HTMLElement>(".remove-peer-btn");
      const peer = (rm ?? target.closest<HTMLElement>(".chat-peer-item"))?.dataset.peer;
      if (!peer) return;
      if (!rm) return void selectChatPeer(peer);
      e.stopPropagation();
      removePeerFromRecent(peer);
    });
  }

  void messengerChat.refreshInbox();
}

function removePeerFromRecent(peer: string, secret = false) {
  if (!currentIdentity || !confirm(`Remove ${secret ? "the Secret Chat with " : ""}@${shortenKey(peer)} from recent chats list?`)) return;
  if (secret) freenet.removeSecretChatPeer(currentIdentity.pubkey, peer);
  else freenet.removeChatPeer(currentIdentity.pubkey, peer);
  if (activeChatPeer === peer) {
    activeChatPeer = null;
    shownMessages = [];
    setReply(null);
    chatPeerInfo.textContent = "Select conversation";
    chatClearBtn.style.display = "none";
    paintChat(`<div class="empty-state" style="padding: 20px;">Conversation removed. Select another room or peer.</div>`);
    messengerChat.renderThread();
    messengerChat.refreshDrawer();
  }
  void renderChatSidebar();
}

async function toggleBlockAuthor(peer: string): Promise<boolean> {
  if (!currentIdentity) return false;
  const me = currentIdentity.pubkey;
  const isBlocked = freenet.blockedBy(me).has(peer);
  const willBlock = !isBlocked;
  if (willBlock) {
    const name = getAuthorDisplayName(peer);
    if (!confirm(`Block @${name} (${shortenKey(peer)})?\n\nThey will be added to your blocklist: their feed posts and comments will be hidden, and direct messages & notifications will be blocked.`)) return false;
  }
  await freenet.setBlocked(peer, willBlock);
  if (willBlock) {
    freenet.removeChatPeer(me, peer);
    if (activeChatPeer === peer) {
      activeChatPeer = null;
      shownMessages = [];
      setReply(null);
      chatPeerInfo.textContent = "Select conversation";
      chatClearBtn.style.display = "none";
      paintChat(`<div class="empty-state" style="padding: 20px;">Contact blocked. Select another room or peer.</div>`);
      messengerChat.renderThread();
      messengerChat.refreshDrawer();
    }
  }
  refreshTrustedBlocklists();
  renderTimeline();
  void renderChatSidebar();
  messengerChat.renderThread();
  messengerChat.refreshDrawer();
  void messengerChat.refreshInbox();
  showToast(willBlock ? `Contact blocked and added to blocklist 🚫` : `Contact removed from blocklist`, "info");
  return willBlock;
}

function renderChatParticipants() {
  if (!chatParticipantsList || !chatParticipantsTitle || !chatParticipantsCount || !currentIdentity) return;
  if (currentChatLayout() === "messenger") {
    messengerChat.refreshDrawer();
    return;
  }
  messengerChat.refreshDrawer();

  if (activeChatPrivateRoom) {
    const room = activeChatPrivateRoom;
    // a River room's members are the contract's (who joined from River too), once the room has been read
    const roster = room.river ? freenet.riverRoster(room.id) : undefined;
    const members = [...new Set(roster?.members ?? room.members)];
    const creator = roster?.creator ?? room.creator;
    chatParticipantsTitle.innerHTML = `<span class="btn-icon-text">${renderIcon("lock", { className: "icon-sm" })} <span>Room Members</span></span>`;
    chatParticipantsCount.textContent = members.length.toString();
    if (chatParticipantsHeaderCount) {
      chatParticipantsHeaderCount.textContent = members.length.toString();
    }

    const isRoomCreator = currentIdentity.pubkey === creator;
    const roomMods = roster?.moderators ?? room.moderators ?? [];
    const iAmRoomMod = roomMods.includes(currentIdentity.pubkey);

    // River's deputies: say who named them (the owner, you, or someone above you in the invite chain)
    const modTitle = (pk: string) => {
      const by = roster?.deputyOf[pk];
      if (!by?.length) return "Moderator of this room";
      const who = by.map((a) => (a === creator ? "the room owner" : a === currentIdentity!.pubkey ? "you" : freenet.knownPeers[a]?.display_name || personaName(a)));
      return `Can remove members, named by ${who.join(", ")}`;
    };
    const items = members.map((memberPk) => {
      const isCreator = memberPk === creator;
      const isYou = memberPk === currentIdentity!.pubkey;
      const isRoomMod = roomMods.includes(memberPk);
      const canKick = !isYou && !isCreator && (isRoomCreator || (iAmRoomMod && !isRoomMod));
      const peerProfile = freenet.knownPeers[memberPk];
      const displayName = peerProfile?.display_name || personaName(memberPk);
      const shortPk = shortenKey(memberPk);
      const avatarUrl =
        peerProfile?.avatar_url || generateDefaultAvatar(memberPk);

      return `
        <div class="chat-participant-item" data-pubkey="${escapeHtml(memberPk)}" title="Public Key: ${escapeHtml(memberPk)}">
          <img src="${safeUrl(avatarUrl)}" class="chat-participant-avatar" onerror="this.onerror=null; this.src='${generateDefaultAvatar(memberPk)}'" />
          <div class="chat-participant-details">
            <div class="chat-participant-name">
              <span>${escapeHtml(displayName)}</span>
              ${isCreator ? `<span class="chat-participant-tag creator btn-icon-text">${renderIcon("crown", { className: "icon-xs" })} <span>Creator</span></span>` : ""}
              ${isRoomMod ? `<span class="chat-participant-tag mod btn-icon-text" title="${escapeHtml(modTitle(memberPk))}"><span>🛡 Moderator</span></span>` : ""}
              ${isYou ? `<span class="chat-participant-tag you">You</span>` : ""}
            </div>
            <div class="chat-participant-key">@${shortPk}</div>
          </div>
          <div class="chat-participant-actions">
            ${!isYou ? `<button type="button" class="btn-secondary btn-sm chat-part-dm-btn" data-pubkey="${escapeHtml(memberPk)}" title="Send Direct Message" style="padding: 2px 6px; font-size: 0.7rem;">${renderIcon("chat", { className: "icon-xs" })}</button>` : ""}
            <button type="button" class="btn-secondary btn-sm chat-part-copy-btn" data-pubkey="${escapeHtml(memberPk)}" title="Copy Public Key" style="padding: 2px 6px; font-size: 0.7rem;">${renderIcon("copy", { className: "icon-xs" })}</button>
            ${isRoomCreator && !isYou && !isCreator ? `<button type="button" class="btn-secondary btn-sm chat-part-mod-btn" data-pubkey="${escapeHtml(memberPk)}" data-on="${isRoomMod ? "0" : "1"}" title="${isRoomMod ? "Remove moderator" : "Let this member kick others"}" style="padding: 2px 6px; font-size: 0.7rem;">${isRoomMod ? "Unmod" : "Make mod"}</button>` : ""}
            ${canKick ? `<button type="button" class="btn-secondary btn-sm chat-part-kick-btn btn-icon-text" data-pubkey="${escapeHtml(memberPk)}" title="Kick member from private room" style="padding: 2px 6px; font-size: 0.7rem; color: var(--danger);">${renderIcon("userX", { className: "icon-xs" })} <span>Kick</span></button>` : ""}
          </div>
        </div>
      `;
    });

    const bottomActions = `
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px;">
        <button type="button" class="btn-primary btn-sm btn-icon-text" id="part-invite-btn" style="width: 100%; font-size: 0.75rem; justify-content: center;">
          ${renderIcon("plus", { className: "icon-xs" })}
          <span>Invite to Room</span>
        </button>
        <button type="button" class="btn-secondary btn-sm btn-icon-text" id="part-copy-link-btn" style="width: 100%; font-size: 0.75rem; justify-content: center;">
          ${renderIcon("share2", { className: "icon-xs" })}
          <span>Share Invite Link</span>
        </button>
        ${room.river ? `<button type="button" class="btn-secondary btn-sm btn-icon-text" id="part-export-id-btn" title="Your identity in this room, for River's UI or riverctl: the same member there" style="width: 100%; font-size: 0.75rem; justify-content: center;">${renderIcon("copy", { className: "icon-xs" })}<span>Export ID</span></button>` : ""}
        <button type="button" class="btn-secondary btn-sm btn-icon-text" id="part-leave-btn" style="width: 100%; font-size: 0.75rem; justify-content: center; color: var(--danger);">${renderIcon("userX", { className: "icon-xs" })}<span>${isRoomCreator ? "Remove Room" : "Leave Room"}</span></button>
      </div>
    `;

    if (!setHtmlIfChanged(chatParticipantsList, items.join("") + bottomActions)) return; // nothing changed: the rows and their listeners stay

    // Attach listeners for member actions
    chatParticipantsList.querySelectorAll(".chat-part-dm-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pk = (btn as HTMLElement).dataset.pubkey;
        if (pk) selectChatPeer(pk);
      });
    });

    chatParticipantsList.querySelectorAll(".chat-part-copy-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pk = (btn as HTMLElement).dataset.pubkey;
        if (pk) {
          navigator.clipboard.writeText(pk);
          alert(`Public key for member copied to clipboard:\n${pk}`);
        }
      });
    });

    chatParticipantsList.querySelectorAll(".chat-part-mod-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const el = btn as HTMLElement;
        const pk = el.dataset.pubkey;
        if (!pk || !currentIdentity || !activeChatPrivateRoom) return;
        try {
          const updated = await freenet.setPrivateRoomModerator(currentIdentity, activeChatPrivateRoom.id, pk, el.dataset.on === "1");
          await selectPrivateRoom(updated);
        } catch (err: any) {
          alert(`Could not change moderators: ${err.message || err}`);
        }
      });
    });

    chatParticipantsList.querySelectorAll(".chat-part-kick-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const pk = (btn as HTMLElement).dataset.pubkey;
        if (!pk || !currentIdentity || !activeChatPrivateRoom) return;
        const p = freenet.knownPeers[pk];
        const name = p?.display_name || `@${shortenKey(pk)}`;
        if (
          !confirm(
            `Are you sure you want to kick ${name} from this private room?\n\nThey will be removed, the room encryption key will be rotated for remaining members, and they will lose access.`
          )
        ) {
          return;
        }
        try {
          const updated = await freenet.kickMemberFromPrivateRoom(
            currentIdentity,
            activeChatPrivateRoom.id,
            pk
          );
          await selectPrivateRoom(updated);
          alert(`User ${name} was kicked from the private room.`);
        } catch (err: any) {
          alert(`Could not kick member: ${err.message || err}`);
        }
      });
    });

    const partInviteBtn = chatParticipantsList.querySelector("#part-invite-btn");
    if (partInviteBtn && chatInviteBtn) {
      partInviteBtn.addEventListener("click", () => {
        chatInviteBtn.click();
      });
    }

    chatParticipantsList.querySelector("#part-leave-btn")?.addEventListener("click", () => {
      if (activeChatPrivateRoom) void leaveActivePrivateRoom(activeChatPrivateRoom);
    });

    chatParticipantsList.querySelector("#part-export-id-btn")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(await freenet.exportRiverIdentity(currentIdentity!, room));
        alert("Your River identity for this room is copied.\n\nImport it in River (Import ID) or riverctl to be the same member there.\n\nIt holds your private key in this room: treat it like a password, do not share it.");
      } catch (e: any) {
        alert(`Could not export: ${e.message || e}`);
      }
    });

    const partCopyLinkBtn = chatParticipantsList.querySelector("#part-copy-link-btn");
    if (partCopyLinkBtn) {
      partCopyLinkBtn.addEventListener("click", async () => {
        const roomName = await freenet.getPrivateRoomDecryptedName(currentIdentity!, room);
        const link = await inviteLinkOf(room);
        if (link) {
          await navigator.clipboard.writeText(link);
          alert(`Zero-knowledge invite link copied to clipboard!\n\nAnyone opening this link can decrypt and join "${roomName}".`);
        }
      });
    }
  } else if (activeChatCommunity) {
    const comm = activeChatCommunity;
    const isUserMod =
      currentIdentity.pubkey === comm.creator || comm.moderators.includes(currentIdentity.pubkey);

    chatParticipantsTitle.innerHTML = `<span class="btn-icon-text">${renderIcon("users", { className: "icon-sm" })} <span>Community Members</span></span>`;
    const commPks = freenet.getCommunityParticipants(comm);
    chatParticipantsCount.textContent = commPks.length.toString();
    if (chatParticipantsHeaderCount) {
      chatParticipantsHeaderCount.textContent = commPks.length.toString();
    }

    const allDisplayPks = Array.from(new Set([...commPks, ...(isUserMod ? comm.banned_members || [] : [])]));

    const items = allDisplayPks.map((memberPk) => {
      const isCreator = memberPk === comm.creator;
      const isMod = comm.moderators.includes(memberPk);
      const isYou = memberPk === currentIdentity!.pubkey;
      const isBanned = !!(comm.banned_members && comm.banned_members.includes(memberPk));
      const peerProfile = freenet.knownPeers[memberPk];
      const displayName = peerProfile?.display_name || (memberPk === "system" ? "Radica Genesis" : personaName(memberPk));
      const shortPk = shortenKey(memberPk);
      const avatarUrl =
        peerProfile?.avatar_url || generateDefaultAvatar(memberPk);

      return `
        <div class="chat-participant-item ${isBanned ? "banned" : ""}" data-pubkey="${escapeHtml(memberPk)}" title="Public Key: ${escapeHtml(memberPk)}">
          <img src="${safeUrl(avatarUrl)}" class="chat-participant-avatar" onerror="this.onerror=null; this.src='${generateDefaultAvatar(memberPk)}'" />
          <div class="chat-participant-details">
            <div class="chat-participant-name">
              <span>${escapeHtml(displayName)}</span>
              ${isCreator ? `<span class="chat-participant-tag creator btn-icon-text">${renderIcon("crown", { className: "icon-xs" })} <span>Founder</span></span>` : ""}
              ${!isCreator && isMod ? `<span class="chat-participant-tag mod btn-icon-text">${renderIcon("shield", { className: "icon-xs" })} <span>Mod</span></span>` : ""}
              ${isBanned ? `<span class="chat-participant-tag btn-icon-text" style="background:#fee2e2; color:#b91c1c;">${renderIcon("ban", { className: "icon-xs" })} <span>Banned</span></span>` : ""}
              ${isYou ? `<span class="chat-participant-tag you">You</span>` : ""}
            </div>
            <div class="chat-participant-key">@${shortPk}</div>
          </div>
          <div class="chat-participant-actions">
            ${!isYou && memberPk !== "system" && !isBanned ? `<button type="button" class="btn-secondary btn-sm chat-part-dm-btn" data-pubkey="${escapeHtml(memberPk)}" title="Send Direct Message" style="padding: 2px 6px; font-size: 0.7rem;">${renderIcon("chat", { className: "icon-xs" })}</button>` : ""}
            ${memberPk !== "system" ? `<button type="button" class="btn-secondary btn-sm chat-part-copy-btn" data-pubkey="${escapeHtml(memberPk)}" title="Copy Public Key" style="padding: 2px 6px; font-size: 0.7rem;">${renderIcon("copy", { className: "icon-xs" })}</button>` : ""}
            ${isUserMod && !isYou && !isCreator && memberPk !== "system" ? (
              isBanned
                ? `<button type="button" class="btn-secondary btn-sm chat-part-unban-btn" data-pubkey="${escapeHtml(memberPk)}" title="Unban member" style="padding: 2px 6px; font-size: 0.7rem; color: #10b981;">Unban</button>`
                : `<button type="button" class="btn-secondary btn-sm chat-part-ban-btn btn-icon-text" data-pubkey="${escapeHtml(memberPk)}" title="Ban member from community" style="padding: 2px 6px; font-size: 0.7rem; color: var(--danger);">${renderIcon("ban", { className: "icon-xs" })} <span>Ban</span></button>`
            ) : ""}
          </div>
        </div>
      `;
    });

    if (!setHtmlIfChanged(chatParticipantsList, items.join(""))) return; // nothing changed: the rows and their listeners stay

    chatParticipantsList.querySelectorAll(".chat-part-dm-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pk = (btn as HTMLElement).dataset.pubkey;
        if (pk) selectChatPeer(pk);
      });
    });

    chatParticipantsList.querySelectorAll(".chat-part-copy-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pk = (btn as HTMLElement).dataset.pubkey;
        if (pk) {
          navigator.clipboard.writeText(pk);
          alert(`Public key copied to clipboard:\n${pk}`);
        }
      });
    });

    chatParticipantsList.querySelectorAll(".chat-part-ban-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const pk = (btn as HTMLElement).dataset.pubkey;
        if (!pk || !currentIdentity || !activeChatCommunity) return;
        const p = freenet.knownPeers[pk];
        const name = p?.display_name || `@${shortenKey(pk)}`;
        if (
          !confirm(
            `Are you sure you want to ban ${name} from r/${activeChatCommunity.slug}?\n\nThey will be removed from members and barred from sending messages in this community.`
          )
        ) {
          return;
        }
        try {
          const res = await freenet.banMemberFromCommunity(
            currentIdentity,
            activeChatCommunity.id,
            pk
          );
          if (res.success && res.community) {
            await selectCommunityRoom(res.community);
            alert(`User ${name} has been banned from the community.`);
          } else {
            alert(res.msg);
          }
        } catch (err: any) {
          alert(`Could not ban member: ${err.message || err}`);
        }
      });
    });

    chatParticipantsList.querySelectorAll(".chat-part-unban-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const pk = (btn as HTMLElement).dataset.pubkey;
        if (!pk || !currentIdentity || !activeChatCommunity) return;
        try {
          const res = await freenet.unbanMemberFromCommunity(
            currentIdentity,
            activeChatCommunity.id,
            pk
          );
          if (res.success && res.community) {
            await selectCommunityRoom(res.community);
            alert(`User unbanned.`);
          }
        } catch (err: any) {
          alert(`Could not unban member: ${err.message || err}`);
        }
      });
    });
  } else if (activeChatPeer) {
    const peerPk = activeChatPeer;
    chatParticipantsTitle.innerHTML = `<span class="btn-icon-text">${renderIcon("lock", { className: "icon-sm" })} <span>Direct Chat</span></span>`;
    chatParticipantsCount.textContent = "2";
    if (chatParticipantsHeaderCount) {
      chatParticipantsHeaderCount.textContent = "2";
    }

    const participants = [currentIdentity.pubkey, peerPk];
    const items = participants.map((pk) => {
      const isYou = pk === currentIdentity!.pubkey;
      const peerProfile = freenet.knownPeers[pk];
      const displayName = peerProfile?.display_name || personaName(pk);
      const shortPk = shortenKey(pk);
      const avatarUrl =
        peerProfile?.avatar_url || generateDefaultAvatar(pk);

      return `
        <div class="chat-participant-item" data-pubkey="${escapeHtml(pk)}" title="Public Key: ${escapeHtml(pk)}">
          <img src="${safeUrl(avatarUrl)}" class="chat-participant-avatar" onerror="this.onerror=null; this.src='${generateDefaultAvatar(pk)}'" />
          <div class="chat-participant-details">
            <div class="chat-participant-name">
              <span>${escapeHtml(displayName)}</span>
              ${isYou ? `<span class="chat-participant-tag you">You</span>` : ""}
            </div>
            <div class="chat-participant-key">@${shortPk}</div>
          </div>
          <div class="chat-participant-actions">
            <button type="button" class="btn-secondary btn-sm chat-part-copy-btn" data-pubkey="${escapeHtml(pk)}" title="Copy Public Key" style="padding: 2px 6px; font-size: 0.7rem;">${renderIcon("copy", { className: "icon-xs" })}</button>
          </div>
        </div>
      `;
    });

    if (!setHtmlIfChanged(chatParticipantsList, items.join(""))) return; // nothing changed: the rows and their listeners stay

    chatParticipantsList.querySelectorAll(".chat-part-copy-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pk = (btn as HTMLElement).dataset.pubkey;
        if (pk) {
          navigator.clipboard.writeText(pk);
          alert(`Public key copied to clipboard:\n${pk}`);
        }
      });
    });
  } else {
    chatParticipantsTitle.innerHTML = `<span class="btn-icon-text">${renderIcon("users", { className: "icon-sm" })} <span>Participants</span></span>`;
    chatParticipantsCount.textContent = "0";
    if (chatParticipantsHeaderCount) {
      chatParticipantsHeaderCount.textContent = "0";
    }
    setHtmlIfChanged(chatParticipantsList, `<div style="font-size: 0.75rem; color: var(--text-muted); padding: 8px;">Select a conversation to view members.</div>`);
  }
}

async function leaveActivePrivateRoom(room: PrivateRoom) {
  if (!currentIdentity) return;
  const roomName = await freenet.getPrivateRoomDecryptedName(currentIdentity, room);
  const mine = room.creator === currentIdentity.pubkey;
  const text = mine
    ? `Remove "${roomName}" from your list?\n\nYou made it, so it cannot be deleted from the network: its members keep it and can still chat, but nobody can invite new people. It disappears from your list on all your devices. An invite link brings it back.`
    : `Leave "${roomName}"?\n\nIt disappears from your list. You can join again with an invite link. Messages you already read stay readable on this device.`;
  if (!confirm(text)) return;
  try {
    await freenet.leavePrivateRoom(currentIdentity, room.id);
  } catch (err: any) {
    alert(`Could not leave the room: ${err.message || err}`);
    return;
  }
  activeChatPrivateRoom = null;
  shownMessages = [];
  setReply(null);
  chatPeerInfo.textContent = "Select conversation";
  chatClearBtn.style.display = "none";
  if (chatInviteBtn) chatInviteBtn.style.display = "none";
  paintChat(`<div class="empty-state" style="padding: 20px;">The room is gone from your list. Select another room or peer.</div>`);
  if (chatParticipantsList) setHtmlIfChanged(chatParticipantsList, "");
  messengerChat.renderThread();
  messengerChat.refreshDrawer();
  void renderChatSidebar();
}

let classicThreadQuery = "";
function filterClassicMessages(msgs: ChatMessage[]): ChatMessage[] {
  if (!classicThreadQuery) return msgs;
  const q = classicThreadQuery.toLowerCase();
  return msgs.filter((m) => {
    return m.text.toLowerCase().includes(q) || getAuthorDisplayName(m.sender).toLowerCase().includes(q);
  });
}

async function selectPrivateRoom(room: PrivateRoom, preserveScroll = false) {
  if (!currentIdentity) return;
  markChatSeen((n) => n.linkRoomId === room.id);
  activeChatPrivateRoom = room;
  activeChatCommunity = null;
  activeChatPeer = null;
  updateChatPinBtnUI();

  const decryptedName = await freenet.getPrivateRoomDecryptedName(currentIdentity, room);
  const isChannel = !!room.is_channel;
  const memberCount = () => (room.river ? freenet.riverRoster(room.id)?.members.length : undefined) ?? room.members.length;
  const badgeHtml = isChannel
    ? `<span class="chat-security-badge e2ee btn-icon-text" title="Broadcast Channel (Read-Only for Subscribers)"><span>📢</span> <span>Broadcast Channel</span></span>`
    : `<span class="chat-security-badge e2ee btn-icon-text" title="On-device AES-256-GCM + X25519 ECIES">${renderIcon("lock", { className: "icon-xs" })} <span>E2EE Group</span></span>`;
  let linkedBtnHtml = "";
  if (room.linked_room_id) {
    linkedBtnHtml = ` <button type="button" class="btn-secondary btn-sm" id="chat-linked-comments-btn" style="padding: 2px 8px; font-size: 0.72rem; margin-left: 6px; cursor: pointer;">${isChannel ? "💬 Comments Room" : "📢 Main Channel"}</button>`;
  }
  chatPeerInfo.innerHTML = `<strong>${escapeHtml(decryptedName)}</strong> (${memberCount()} ${isChannel ? "subscribers" : "members"}) ${badgeHtml}${linkedBtnHtml}`;

  const me = currentIdentity.pubkey;
  const isOwner = me === (freenet.riverRoster(room.id)?.creator ?? room.creator);
  const isMod = (freenet.riverRoster(room.id)?.moderators ?? room.moderators ?? []).includes(me);
  const canPost = !isChannel || isOwner || isMod;
  if (chatTtlBtn) chatTtlBtn.style.display = "none";
  chatMessageInput.disabled = !canPost;
  chatMessageInput.placeholder = canPost
    ? (isChannel ? "Broadcast a message to subscribers… (Shift+Enter: new line)" : "Type a message… (Shift+Enter: new line)")
    : "Broadcast channel: only administrators can post messages";
  const chatSendBtn = document.getElementById("chat-send-btn") as HTMLButtonElement | null;
  if (chatSendBtn) chatSendBtn.disabled = !canPost;
  if (chatBtnAttach) chatBtnAttach.disabled = !canPost;
  const chatSendForm = document.getElementById("chat-send-form") as HTMLFormElement | null;
  if (chatSendForm) chatSendForm.style.display = canPost ? "flex" : "none";
  if (chatSafetyBtn) chatSafetyBtn.style.display = "inline-flex";
  
  if (chatInviteBtn) {
    chatInviteBtn.style.display = "inline-block";
  }
  chatClearBtn.style.display = "inline-block";
  chatClearBtn.title = "Delete entire room conversation history";

  const isMessenger = currentChatLayout() === "messenger";
  if (!isMessenger) {
    renderChatSidebar();
    renderChatParticipants();
  }

  const roomId = room.id;
  conversation.markRead(roomId);
  updateChatBadge();

  // River rooms are River's: Radica cannot drop a sender there, but hides what my blocks (and the blocklists I follow) cover
  const messages = (await freenet.getPrivateRoomChatMessages(currentIdentity, room)).filter((m) => m.sender === me || !isHiddenAuthor(m.sender));
  shownMessages = messages;

  if (!isMessenger) {
    const wasNearBottom = chatMessagesList.scrollHeight - chatMessagesList.scrollTop - chatMessagesList.clientHeight < 90;
    if (room.river) {
      // reading the room told us who is in it
      renderChatParticipants();
      const count = chatPeerInfo.querySelector("strong")?.nextSibling;
      if (count) count.textContent = ` (${memberCount()} ${isChannel ? "subscribers" : "members"}) `;
    }

    const visibleMessages = filterClassicMessages(messages);
    if (visibleMessages.length === 0) {
      paintChat(classicThreadQuery ? `<div class="empty-state" style="padding: 20px;">No messages matching "${escapeHtml(classicThreadQuery)}".</div>` : `<div class="empty-state" style="padding: 20px;">Welcome to <strong>${escapeHtml(decryptedName)}</strong>!<br/>This room is end-to-end encrypted with an on-device symmetric AES key. Only authorized members can decrypt messages.</div>`);
    } else {
      paintChat(() => visibleMessages
        .map((msg, i) =>
          renderChatMessage({
            msg,
            prev: visibleMessages[i - 1],
            all: visibleMessages,
            roomId,
            isMine: msg.sender === currentIdentity!.pubkey,
            senderName: getAuthorDisplayName(msg.sender),
            badge: msg.sender === (freenet.riverRoster(room.id)?.creator ?? room.creator) ? `<span class="rv-badge">${renderIcon("crown", { className: "icon-xs" })}</span>` : "",
            canDelete: !room.river || msg.sender === currentIdentity!.pubkey, // River deletes only one's own messages, for everyone
          })
        )
        .join(""));
    }
    attachBubbleDeleteListeners();
    if (!preserveScroll || wasNearBottom) chatMessagesList.scrollTop = chatMessagesList.scrollHeight;
  }

  if (replyingTo && replyingTo.room_id !== roomId) setReply(null); // another conversation
  if (room.linked_room_id) {
    document.getElementById("chat-linked-comments-btn")?.addEventListener("click", () => {
      const targetRoom = allPrivateRooms.find((r) => r.id === room.linked_room_id);
      if (targetRoom) void selectPrivateRoom(targetRoom);
      else showToast("Linked discussion room not found locally.", "warning");
    });
  }

  if (isMessenger) {
    messengerChat.renderThread(!preserveScroll);
    messengerChat.refreshDrawer();
    void messengerChat.refreshInbox(!preserveScroll);
  }

  freenet.warmPeers([...new Set(messages.map((x) => x.sender))]);
}

function setChatStatus(online: boolean) {
  chatOnlineState = online;
  document.getElementById("chat-status-pill")?.classList.toggle("online", online);
  const t = document.getElementById("chat-status-text");
  if (t) t.textContent = online ? "Connected" : "Offline";
  messengerChat.updateStatusBanner();
}

chatMessagesList.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(".post-link");
  if (a) openPostLink.call(a, e);
});
commBannerDesc.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(".post-link");
  if (a) openPostLink.call(a, e);
});

document.getElementById("chat-join-code-btn")?.addEventListener("click", () => document.getElementById("join-private-room-btn")?.click());

/** Time of a chat message the way River shows it: the clock for today, the date for older ones. */
function chatTime(ts: number): string {
  const d = new Date(ts);
  const clock = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? clock : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${clock}`;
}

const chatExcerpt = (t: string) => (t.length > 80 ? t.slice(0, 80) + "\u2026" : t).replace(/\s+/g, " ");

/** One chat message: author and time above a rounded bubble; the author is left out when the previous message is theirs and close in time.
 * `all` (the room's messages) lets a reply show what it answers; reactions show as chips under the bubble. */
function renderChatMessage(opts: { msg: ChatMessage; prev?: ChatMessage; all?: ChatMessage[]; roomId: string; isMine: boolean; badge?: string; canDelete: boolean; senderName: string }): string {
  const { msg, prev, all, roomId, isMine, badge, canDelete, senderName } = opts;
  const me = currentIdentity?.pubkey ?? "";
  if (msg.system_event === "join") {
    const members = msg.join_members && msg.join_members.length > 0 ? msg.join_members : [msg.sender];
    const names = members.map((pk) => (pk === me ? "You" : getAuthorDisplayName(pk)));
    let joinText = "";
    if (names.length === 1) joinText = `${escapeHtml(names[0])} joined`;
    else if (names.length === 2) joinText = `${escapeHtml(names[0])} and ${escapeHtml(names[1])} joined`;
    else if (names.length <= 4) joinText = `${escapeHtml(names.slice(0, -1).join(", "))} and ${escapeHtml(names[names.length - 1])} joined`;
    else joinText = `${names.length} people joined`;
    return `<div class="rm-system-event-row" data-msg-id="${escapeHtml(msg.id)}"><span class="rm-system-icon">→]</span> <span class="rm-system-text">${joinText}</span> <span class="rm-system-time">· ${escapeHtml(chatTime(msg.timestamp))}</span></div>`;
  }
  const grouped = !!prev && prev.sender === msg.sender && msg.timestamp - prev.timestamp < 5 * 60 * 1000;

  // Read receipt checkmarks (Classic view)
  const peerPk = dmPeerOf(roomId, me);
  const readReceiptHtml = isMine ? checksHtml(deliveryOf(msg, peerPk ? freenet.getPeerReadUpto(roomId, peerPk) : 0), "rv") : "";

  // TTL Disappearing timer badge (Classic view)
  let ttlTagHtml = "";
  const burnAt = burnAtOf(msg);
  if (burnAt) {
    ttlTagHtml = `<span class="rv-ttl-tag" data-burn-at="${burnAt}" data-msg-id="${escapeHtml(msg.id)}" title="Disappearing message">⏱️ <span class="rv-ttl-val"></span></span>`;
  }

  const metaHtml = `<span class="rv-time">${chatTime(msg.timestamp)}${ttlTagHtml}${readReceiptHtml}</span>`;
  const head = grouped
    ? (ttlTagHtml || readReceiptHtml ? `<div class="rv-msg-head grouped">${metaHtml}</div>` : "")
    : `<div class="rv-msg-head"><span class="rv-author">${escapeHtml(isMine ? "You" : senderName)}</span>${badge ?? ""}${metaHtml}</div>`;
  const del = canDelete
    ? `<button class="chat-bubble-del" data-room-id="${escapeHtml(roomId)}" data-msg-id="${escapeHtml(msg.id)}" title="Delete message">${renderIcon("trash2", { className: "icon-xs" })}</button>`
    : "";
  const ids = `data-room-id="${escapeHtml(roomId)}" data-msg-id="${escapeHtml(msg.id)}"`;
  const actions = `<div class="rv-actions"><button type="button" class="rv-reply-btn" ${ids} title="Reply">\u21A9</button><button type="button" class="rv-open-react-btn" ${ids} title="Add reaction">☺</button></div>`;
  const original = msg.reply_to ? all?.find((m) => m.id === msg.reply_to) : undefined;
  const quote = msg.reply_to
    ? `<div class="rv-quote" data-jump="${escapeHtml(msg.reply_to)}"><b>${original ? escapeHtml(original.sender === me ? "You" : getAuthorDisplayName(original.sender)) : "Message"}</b> ${original ? escapeHtml(chatExcerpt(summarizeChatMediaText(original.text))) : "not available"}</div>`
    : "";
  const chips = Object.entries(msg.reactions ?? {})
    .filter(([e, who]) => CHAT_REACTIONS.includes(e) && who.length)
    .map(([e, who]) => `<button type="button" class="rv-chip${who.includes(me) ? " mine" : ""}" data-react="${e}" ${ids} title="${escapeHtml(who.map((w) => (w === me ? "You" : getAuthorDisplayName(w))).join(", "))}">${e} ${who.length}</button>`)
    .join("");
  const face = isMine || grouped ? "" : `<img class="rv-avatar" alt="" src="${safeUrl(getAuthorAvatarUrl(msg.sender))}" onerror="this.onerror=null; this.src='${generateDefaultAvatar(msg.sender)}'" />`;
  const { items: mediaItems, caption: textWithoutMedia } = parseChatMedia(msg.text);
  const mediaCards = chatMediaCardsHtml(mediaItems, textWithoutMedia);
  const embeddedCards = freetunesCard(textWithoutMedia) + freepollsCard(textWithoutMedia) + freenamesCard(textWithoutMedia) + deltaCard(textWithoutMedia) + ortoCard(textWithoutMedia) + asocialCard(textWithoutMedia) + fhCard(textWithoutMedia, nodeOrigin()) + wormholeCard(textWithoutMedia, nodeOrigin()) + freetreeCard(textWithoutMedia, nodeOrigin());
  const bodyText = textWithoutMedia ? renderChatText(textWithoutMedia, getAuthorDisplayName) : "";
  return `<div class="chat-bubble ${isMine ? "mine" : "theirs"}${grouped ? " grouped" : ""}" data-msg-id="${escapeHtml(msg.id)}">${face}${head}<div class="rv-bubble">${del}${actions}${quote}${bodyText}${embeddedCards}${mediaCards}</div>${chips ? `<div class="rv-chips">${chips}</div>` : ""}</div>`;
}

/** Append a single message bubble to the chat view without rebuilding the whole message list. */
function appendChatMessageToView(opts: {
  msg: ChatMessage;
  prev?: ChatMessage;
  all?: ChatMessage[];
  roomId: string;
  isMine: boolean;
  badge?: string;
  canDelete: boolean;
  senderName: string;
}) {
  if (currentChatLayout() === "classic") {
    chatMessagesList.querySelector(".empty-state")?.remove();
    chatMessagesList.insertAdjacentHTML("beforeend", renderChatMessage(opts));
    fillChatMedia(chatMessagesList, (h) => freenet.getMedia(h));
    fillFreepolls(chatMessagesList, pollNet);
    fillFreetunes(chatMessagesList, (id) => freenet.appContract(id), nodeOrigin(), (pk) => freenet.freetunesArtist(pk));
    fillFreenames(chatMessagesList, freenet);
    fillDelta(chatMessagesList, freenet);
    fillOrto(chatMessagesList);
    fillAsocial(chatMessagesList);
    fillFh(chatMessagesList, freenet, nodeOrigin());
    fillWormhole(chatMessagesList);
  }




  shownMessages.push(opts.msg);
  chatMessagesList.scrollTop = chatMessagesList.scrollHeight;
  messengerChat.renderThread(true);
  void messengerChat.refreshInbox();
}

async function selectCommunityRoom(comm: Community, preserveScroll = false) {
  if (!currentIdentity) return;
  activeChatCommunity = comm;
  activeChatPeer = null;
  activeChatPrivateRoom = null;
  updateChatPinBtnUI();
  if (chatInviteBtn) chatInviteBtn.style.display = "none";

  chatPeerInfo.innerHTML = `<strong>#r/${escapeHtml(comm.slug)}</strong> (${freenet.getCommunityParticipants(comm).length} members) — ${escapeHtml(comm.name)} <span class="chat-security-badge public btn-icon-text" title="Public Community Chatroom - Authenticated by Ed25519">${renderIcon("globe", { className: "icon-xs" })} <span>Public Room</span></span>`;
  const isMod =
    comm.creator === currentIdentity.pubkey || comm.moderators.includes(currentIdentity.pubkey);
  chatClearBtn.style.display = isMod ? "inline-block" : "none";
  chatClearBtn.title = "Moderator: Clear community chatroom";
  if (chatSafetyBtn) chatSafetyBtn.style.display = "none";
  if (chatTtlBtn) chatTtlBtn.style.display = "none";
  if (chatBtnAttach) chatBtnAttach.disabled = false;
  const chatSendFormComm = document.getElementById("chat-send-form") as HTMLFormElement | null;
  if (chatSendFormComm) chatSendFormComm.style.display = "flex";

  const isMessenger = currentChatLayout() === "messenger";
  if (!isMessenger) {
    renderChatSidebar();
    renderChatParticipants();
  }

  const roomId = `comm_${comm.id}`;
  conversation.markRead(roomId);
  updateChatBadge();

  // the bans of the lists I follow (Radica's moderators') reach a community's chat too, as they do River groups
  const messages = (await freenet.getCommunityChatMessages(comm.id)).filter((m) => m.sender === currentIdentity!.pubkey || !isHiddenAuthor(m.sender));
  shownMessages = messages;

  if (!isMessenger) {
    const wasNearBottom = chatMessagesList.scrollHeight - chatMessagesList.scrollTop - chatMessagesList.clientHeight < 90;
    const visibleMessages = filterClassicMessages(messages);
    if (visibleMessages.length === 0) {
      paintChat(classicThreadQuery ? `<div class="empty-state" style="padding: 20px;">No messages matching "${escapeHtml(classicThreadQuery)}".</div>` : `<div class="empty-state" style="padding: 20px;">Welcome to #r/${escapeHtml(comm.slug)} community chat! Say hello to fellow members.</div>`);
    } else {
      paintChat(() => visibleMessages
        .map((msg, i) => {
          const isMine = msg.sender === currentIdentity!.pubkey;
          const msgIsMod = comm.creator === msg.sender || comm.moderators.includes(msg.sender);
          return renderChatMessage({
            msg,
            prev: visibleMessages[i - 1],
            all: visibleMessages,
            roomId,
            isMine,
            senderName: getAuthorDisplayName(msg.sender),
            badge: msgIsMod ? `<span class="rv-badge">${renderIcon("shield", { className: "icon-xs" })}</span>` : "",
            canDelete: isMine || isMod,
          });
        })
        .join(""));
    }
    attachBubbleDeleteListeners();
    chatMessageInput.disabled = false;
    chatMessageInput.placeholder = "Type a message… (Shift+Enter: new line)";
    const chatSendBtn = document.getElementById("chat-send-btn") as HTMLButtonElement | null;
    if (chatSendBtn) chatSendBtn.disabled = false;
    if (!preserveScroll || wasNearBottom) chatMessagesList.scrollTop = chatMessagesList.scrollHeight;
  }

  if (replyingTo && replyingTo.room_id !== roomId) setReply(null); // another conversation

  if (isMessenger) {
    messengerChat.renderThread(!preserveScroll);
    messengerChat.refreshDrawer();
    void messengerChat.refreshInbox(!preserveScroll);
  }

  freenet.warmPeers([...new Set(messages.map((x) => x.sender))]);
}

async function selectChatPeer(peerPubkey: string, isSecret = false, preserveScroll = false) {
  if (!currentIdentity) return;
  markChatSeen((n) => n.from === peerPubkey && !!n.isSecret === isSecret && !(n.linkRoomId && !n.linkRoomId.includes(":"))); // a room id without ":" is a private room, not a DM
  activeChatPeer = peerPubkey;
  activeChatSecret = isSecret;
  activeChatCommunity = null;
  activeChatPrivateRoom = null;
  updateChatPinBtnUI();
  if (chatInviteBtn) chatInviteBtn.style.display = "none";
  if (chatSafetyBtn) chatSafetyBtn.style.display = "inline-flex";
  if (chatBtnAttach) chatBtnAttach.disabled = false;
  const chatSendFormPeer = document.getElementById("chat-send-form") as HTMLFormElement | null;
  if (chatSendFormPeer) chatSendFormPeer.style.display = "flex";

  const name = getAuthorDisplayName(peerPubkey);
  const badgeHtml = isSecret
    ? `<span class="chat-security-badge e2ee btn-icon-text" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4);" title="Protected by ephemeral ratchet keys (Forward Secrecy). Stored on this device only.">${renderIcon("lock", { className: "icon-xs" })} <span>🔐 Secret Chat</span></span>`
    : `<span class="chat-security-badge e2ee btn-icon-text" title="End-to-End Encrypted via X25519 ECDH + AES-256-GCM">${renderIcon("lock", { className: "icon-xs" })} <span>E2EE Private</span></span>`;
  chatPeerInfo.innerHTML = `<strong>${escapeHtml(name)}</strong> <span style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">(@${shortenKey(personaName(peerPubkey))})</span> ${badgeHtml}`;
  if (chatTtlBtn) {
    if (isSecret) {
      const curTtl = freenet.getSecretChatTTL(freenet.getSecretRoomId(currentIdentity.pubkey, peerPubkey));
      const ttlLabel = formatTtlLabel(curTtl);
      chatTtlBtn.style.display = "inline-flex";
      chatTtlBtn.innerHTML = `<span>⏱️ ${ttlLabel}</span>`;
      chatTtlBtn.title = `Disappearing messages timer: ${ttlLabel}`;
      chatMessageInput.placeholder = `Secret message to ${name} (ephemeral)… (Shift+Enter: new line)`;
    } else {
      chatTtlBtn.style.display = "none";
      chatMessageInput.placeholder = "Type a message... (Shift+Enter: new line)";
    }
  }
  chatClearBtn.style.display = "inline-block";
  chatClearBtn.title = "Delete entire conversation history";

  const isMessenger = currentChatLayout() === "messenger";
  if (!isMessenger) {
    renderChatSidebar();
    renderChatParticipants();
  }

  const roomId = isSecret
    ? freenet.getSecretRoomId(currentIdentity.pubkey, peerPubkey)
    : freenet.getRoomId(currentIdentity.pubkey, peerPubkey);

  conversation.markRead(roomId);
  updateChatBadge();

  const messages = isSecret
    ? await freenet.getSecretChatMessages(currentIdentity, peerPubkey)
    : await freenet.getChatMessages(currentIdentity, peerPubkey);
  shownMessages = messages;

  if (!isMessenger) {
    const wasNearBottom = chatMessagesList.scrollHeight - chatMessagesList.scrollTop - chatMessagesList.clientHeight < 90;
    const visibleMessages = filterClassicMessages(messages);
    if (visibleMessages.length === 0) {
      paintChat(classicThreadQuery ? `<div class="empty-state" style="padding: 20px;">No messages matching "${escapeHtml(classicThreadQuery)}".</div>` : (isSecret ? `<div class="empty-state" style="padding: 20px;">🔒 Secret Chat started. Messages use ephemeral ratchet keys (Forward Secrecy), exist only on this device, and can auto-destruct.</div>` : `<div class="empty-state" style="padding: 20px;">No messages yet. Direct messages are End-to-End Encrypted (E2EE).</div>`));
    } else {
      paintChat(() => visibleMessages
        .map((msg, i) =>
          renderChatMessage({
            msg,
            prev: visibleMessages[i - 1],
            all: visibleMessages,
            roomId,
            isMine: msg.sender === currentIdentity!.pubkey,
            senderName: getAuthorDisplayName(msg.sender),
            canDelete: true,
          })
        )
        .join(""));
    }
    attachBubbleDeleteListeners();
    chatMessageInput.disabled = false;
    chatMessageInput.placeholder = "Type a message… (Shift+Enter: new line)";
    const chatSendBtn = document.getElementById("chat-send-btn") as HTMLButtonElement | null;
    if (chatSendBtn) chatSendBtn.disabled = false;
    if (!preserveScroll || wasNearBottom) chatMessagesList.scrollTop = chatMessagesList.scrollHeight;
  }

  if (replyingTo && replyingTo.room_id !== roomId) setReply(null); // another conversation

  if (isMessenger) {
    messengerChat.renderThread(!preserveScroll);
    messengerChat.refreshDrawer();
    void messengerChat.refreshInbox(!preserveScroll);
  }

  freenet.warmPeers([...new Set(messages.map((x) => x.sender))]);
}

async function sendActiveChatText(rawText: string, sourceBox?: HTMLElement): Promise<boolean> {
  if (!currentIdentity) return false;
  const text = rawText.trim();
  if (!text) return false;
  if (!activeChatPrivateRoom && !activeChatCommunity && !activeChatPeer) return false;

  if (activeChatPeer && isHiddenAuthor(activeChatPeer)) {
    showToast("Cannot send message: this contact is blocked.", "warning");
    return false;
  }

  // Attachment tokens and 64-hex persona keys are left out of the check: their digit runs look like phone numbers
  if (!okToPublish(maskChatMediaTokens(text).masked.replace(/\b@?[0-9a-f]{64}\b/gi, ""))) return false;

  const now = Date.now();
  if (now - lastChatMessageTime < CHAT_COOLDOWN_MS) {
    return false;
  }
  lastChatMessageTime = now;

  const finalText = sourceBox ? withMentionKeys(sourceBox, text) : text;

  const replyTo = replyingTo && replyingTo.room_id === openRoomId() ? replyingTo.id : undefined;
  setReply(null);

  const resolveOptimistic = (optId: string, sentMsg: ChatMessage, roomKey?: string) => {
    // a Secret Chat message keeps the placeholder's id: storage already holds just the real one
    const sameId = optId === sentMsg.id;
    if (roomKey && !sameId) {
      const current: ChatMessage[] = JSON.parse(safeStorage.getItem(roomKey) || "[]");
      safeStorage.setItem(roomKey, JSON.stringify(current.filter((m) => m.id !== optId)));
    }
    const bubble = chatMessagesList.querySelector(`[data-msg-id="${optId}"]`);
    // a reload while sending may already show the real message: then drop the placeholder instead of showing it twice
    if (!sameId && shownMessages.some((m) => m.id === sentMsg.id)) {
      bubble?.remove();
      shownMessages = shownMessages.filter((m) => m.id !== optId);
    } else {
      bubble?.setAttribute("data-msg-id", sentMsg.id);
      shownMessages = shownMessages.map((m) => (m.id === optId ? { ...sentMsg, text: finalText } : m));
    }
    messengerChat.renderThread();
    void messengerChat.refreshInbox();
  };

  const rejectOptimistic = (optId: string, roomKey?: string) => {
    if (roomKey) {
      const current = JSON.parse(safeStorage.getItem(roomKey) || "[]").filter((m: ChatMessage) => m.id !== optId);
      safeStorage.setItem(roomKey, JSON.stringify(current));
    }
    chatMessagesList.querySelector(`[data-msg-id="${optId}"]`)?.remove();
    shownMessages = shownMessages.filter((m) => m.id !== optId);
    messengerChat.renderThread();
    void messengerChat.refreshInbox();
  };

  if (activeChatPrivateRoom) {
    const room = activeChatPrivateRoom;
    const roomId = room.id;
    const roomKey = `freenet_chat_${roomId}`;
    const optId = `msg_opt_${Date.now()}`;
    const optMsg: ChatMessage = {
      id: optId,
      room_id: roomId,
      private_room_id: roomId,
      sender: currentIdentity.pubkey,
      text: finalText,
      timestamp: Date.now(),
      sig: "",
      ...(replyTo ? { reply_to: replyTo } : {}),
    };
    if (!room.river) {
      const raw = safeStorage.getItem(roomKey);
      const list: ChatMessage[] = raw ? JSON.parse(raw) : [];
      list.push(optMsg);
      safeStorage.setItem(roomKey, JSON.stringify(list));
    }
    appendChatMessageToView({
      msg: optMsg,
      prev: shownMessages[shownMessages.length - 1],
      all: shownMessages,
      roomId,
      isMine: true,
      canDelete: true,
      senderName: "You",
    });
    freenet.sendPrivateRoomChatMessage(currentIdentity, room, finalText, replyTo).then((sentMsg) => {
      if (room.river) {
        if (activeChatPrivateRoom?.id === room.id) void selectPrivateRoom(room);
        else void messengerChat.refreshInbox();
      }
      else resolveOptimistic(optId, sentMsg, roomKey);
    }).catch((err) => {
      console.error("Private room chat error:", err);
      showToast(`Chat error: ${err.message || err}`, "error");
      rejectOptimistic(optId, room.river ? undefined : roomKey);
    });
    return true;
  }

  if (activeChatCommunity) {
    const comm = activeChatCommunity;
    const roomId = `comm_${comm.id}`;
    const roomKey = `freenet_chat_${roomId}`;
    const raw = safeStorage.getItem(roomKey);
    const list: ChatMessage[] = raw ? JSON.parse(raw) : [];
    const optId = `msg_opt_${Date.now()}`;
    const optMsg: ChatMessage = {
      id: optId,
      room_id: roomId,
      sender: currentIdentity.pubkey,
      community_id: comm.id,
      text: finalText,
      timestamp: Date.now(),
      sig: "",
      ...(replyTo ? { reply_to: replyTo } : {}),
    };
    list.push(optMsg);
    safeStorage.setItem(roomKey, JSON.stringify(list));
    appendChatMessageToView({
      msg: optMsg,
      prev: shownMessages[shownMessages.length - 1],
      all: shownMessages,
      roomId,
      isMine: true,
      canDelete: true,
      senderName: "You",
    });

    freenet.sendCommunityChatMessage(currentIdentity, comm.id, finalText, replyTo).then((sentMsg) => {
      resolveOptimistic(optId, sentMsg, roomKey);
    }).catch((err) => {
      console.error("Community chat error:", err);
      showToast(`Chat error: ${err.message || err}`, "error");
      rejectOptimistic(optId, roomKey);
    });
    return true;
  }

  if (activeChatPeer) {
    const peer = activeChatPeer;
    const roomId = activeChatSecret
      ? freenet.getSecretRoomId(currentIdentity.pubkey, peer)
      : freenet.getRoomId(currentIdentity.pubkey, peer);
    const roomKey = `freenet_chat_${roomId}`;
    const raw = safeStorage.getItem(roomKey);
    const list: ChatMessage[] = raw ? JSON.parse(raw) : [];
    // a Secret Chat message is stored before it is delivered: with the placeholder's id it replaces it, not doubles it
    const optId = activeChatSecret ? `scmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : `msg_opt_${Date.now()}`;
    const effectiveTtl = activeChatSecret ? freenet.getSecretChatTTL(roomId) : undefined;
    const burnAt = effectiveTtl && effectiveTtl > 0 ? (Date.now() + effectiveTtl * 1000) : undefined;
    const optMsg: ChatMessage = {
      id: optId,
      room_id: roomId,
      sender: currentIdentity.pubkey,
      recipient: peer,
      text: finalText,
      timestamp: Date.now(),
      sig: "",
      enc_pub: currentIdentity.encPub,
      is_secret: activeChatSecret,
      ttl_seconds: effectiveTtl,
      burn_at: burnAt,
      ...(replyTo ? { reply_to: replyTo } : {}),
    };
    list.push(optMsg);
    safeStorage.setItem(roomKey, JSON.stringify(list));
    appendChatMessageToView({
      msg: optMsg,
      prev: shownMessages[shownMessages.length - 1],
      all: shownMessages,
      roomId,
      isMine: true,
      canDelete: true,
      senderName: "You",
    });

    const sendPromise = activeChatSecret
      ? freenet.sendSecretChatMessage(currentIdentity, peer, finalText, effectiveTtl, replyTo, optId)
      : freenet.sendChatMessage(currentIdentity, peer, finalText, replyTo);

    sendPromise.then((sentMsg) => {
      resolveOptimistic(optId, sentMsg, roomKey);
    }).catch((err) => {
      console.error(activeChatSecret ? "Secret chat error:" : "Direct chat error:", err);
      showToast(`Could not send message: ${err.message || err}`, "error");
      rejectOptimistic(optId, roomKey);
    });
    return true;
  }

  return false;
}

let classicStagedMedia: PreparedChatMedia | null = null;
function setClassicStagedMedia(next: PreparedChatMedia | null) {
  if (classicStagedMedia?.previewUrl && classicStagedMedia.previewUrl !== next?.previewUrl) {
    try {
      URL.revokeObjectURL(classicStagedMedia.previewUrl);
    } catch {}
  }
  classicStagedMedia = next;
  if (!chatMediaStage || !chatMediaStagePreview || !chatMediaStageLabel) return;
  if (!next) {
    chatMediaStage.classList.remove("open");
    chatMediaStage.style.display = "none";
    chatMediaStagePreview.innerHTML = "";
    chatMediaStageLabel.textContent = "";
    return;
  }
  chatMediaStage.classList.add("open");
  chatMediaStage.style.display = "flex";
  if (next.kind === "img" && next.previewUrl) {
    chatMediaStagePreview.innerHTML = `<img src="${next.previewUrl}" alt="" style="max-height: 48px; border-radius: 6px;" />`;
    chatMediaStageLabel.textContent = `🖼️ Photo · ${next.width || "?"}×${next.height || "?"} · ${formatBytes(next.sizeBytes || 0)}`;
  } else if ((next.kind === "audio" || next.kind === "voice") && next.previewUrl) {
    chatMediaStagePreview.innerHTML = `<span style="font-size:1.4rem;">🎵</span>`;
    chatMediaStageLabel.textContent = `🎵 Audio memo · ${formatBytes(next.sizeBytes || 0)}`;
  } else {
    const icon = fileExtensionIcon(next.filename || "");
    chatMediaStagePreview.innerHTML = `<span style="font-size:1.3rem;">${icon}</span>`;
    chatMediaStageLabel.textContent = `📄 ${next.filename || "File"} · ${formatBytes(next.sizeBytes || 0)}`;
  }
}

chatMediaStageCancel?.addEventListener("click", () => setClassicStagedMedia(null));

// File Pickers for Classic Chat
chatFileImage?.addEventListener("change", async () => {
  const f = chatFileImage.files?.[0];
  if (!f) return;
  try {
    showToast("Optimizing photo for Freenet…", "info");
    const prep = await prepareChatImageFile(f);
    setClassicStagedMedia(prep);
    chatMessageInput.focus();
  } catch (err: any) {
    showToast(err.message || String(err), "error");
  }
});

chatFileAudio?.addEventListener("change", async () => {
  const f = chatFileAudio.files?.[0];
  if (!f) return;
  try {
    showToast("Preparing audio file…", "info");
    const prep = await prepareChatAudioFile(f, "audio");
    setClassicStagedMedia(prep);
    chatMessageInput.focus();
  } catch (err: any) {
    showToast(err.message || String(err), "error");
  }
});

chatFileDoc?.addEventListener("change", async () => {
  const f = chatFileDoc.files?.[0];
  if (!f) return;
  try {
    showToast("Preparing document file…", "info");
    const prep = await prepareChatDocFile(f);
    setClassicStagedMedia(prep);
    chatMessageInput.focus();
  } catch (err: any) {
    showToast(err.message || String(err), "error");
  }
});

// Attachment plus button & popover menu for Classic Chat
chatBtnAttach?.addEventListener("click", (e) => {
  e.stopPropagation();
  chatAttachMenu?.classList.toggle("open");
});
document.addEventListener("click", () => chatAttachMenu?.classList.remove("open"));

chatAttachMenu?.addEventListener("click", async (e) => {
  e.stopPropagation();
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-chat-attach]");
  if (!btn) return;
  chatAttachMenu?.classList.remove("open");
  const kind = btn.dataset.chatAttach;
  if (!currentIdentity) return;

  if (kind === "image") {
    if (chatFileImage) {
      chatFileImage.value = "";
      chatFileImage.click();
    }
  } else if (kind === "audio") {
    if (chatFileAudio) {
      chatFileAudio.value = "";
      chatFileAudio.click();
    }
  } else if (kind === "file") {
    if (chatFileDoc) {
      chatFileDoc.value = "";
      chatFileDoc.click();
    }
  } else if (kind === "mention") {
    chatMessageInput.value += (chatMessageInput.value && !chatMessageInput.value.endsWith(" ") ? " " : "") + "@";
    fitChatInput();
    chatMessageInput.focus();
    chatMessageInput.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (kind === "my-key") {
    chatMessageInput.value += (chatMessageInput.value ? "\n" : "") + currentIdentity.pubkey;
    fitChatInput();
    chatMessageInput.focus();
  } else if (kind === "room-link") {
    const room = activeChatPrivateRoom ?? allPrivateRooms[0];
    if (!room) {
      showToast("You don't have any private rooms to share yet.", "warning");
      return;
    }
    const link = await inviteLinkOf(room);
    if (link) {
      const rName = await freenet.getPrivateRoomDecryptedName(currentIdentity, room);
      chatMessageInput.value += (chatMessageInput.value ? "\n" : "") + `Invite to "${rName}": ${link}`;
      fitChatInput();
      chatMessageInput.focus();
    }
  } else if (kind === "poll") {
    if (!openRoomId()) {
      showToast("Select a conversation first.", "warning");
      return;
    }
    messengerChat.openPollModal();
  }
});

// Drag and drop support on Classic Chat composer
const handleClassicDropFiles = async (files: FileList | null) => {
  if (!files || !files.length) return;
  const file = files[0];
  try {
    if (file.type.startsWith("image/")) {
      showToast("Optimizing dropped photo…", "info");
      const prep = await prepareChatImageFile(file);
      setClassicStagedMedia(prep);
      chatMessageInput.focus();
    } else if (file.type.startsWith("audio/")) {
      showToast("Preparing dropped audio…", "info");
      const prep = await prepareChatAudioFile(file, "audio");
      setClassicStagedMedia(prep);
      chatMessageInput.focus();
    } else {
      showToast("Preparing dropped document…", "info");
      const prep = await prepareChatDocFile(file);
      setClassicStagedMedia(prep);
      chatMessageInput.focus();
    }
  } catch (err: any) {
    showToast(err.message || String(err), "error");
  }
};

chatSendForm.addEventListener("dragover", (e) => {
  e.preventDefault();
  chatSendForm.style.borderColor = "var(--rv-accent)";
});
chatSendForm.addEventListener("dragleave", () => {
  chatSendForm.style.borderColor = "var(--border)";
});
chatSendForm.addEventListener("drop", (e) => {
  e.preventDefault();
  chatSendForm.style.borderColor = "var(--border)";
  void handleClassicDropFiles(e.dataTransfer?.files ?? null);
});

chatMessageInput.addEventListener("paste", async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of Array.from(items)) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      try {
        showToast("Processing pasted image…", "info");
        const prep = await prepareChatImageFile(file);
        setClassicStagedMedia(prep);
        chatMessageInput.focus();
      } catch (err: any) {
        showToast(err.message || String(err), "error");
      }
      return;
    }
  }
});

// In-thread Search listeners for Classic Chat
let classicSearchTimer = 0;
chatSearchBtn?.addEventListener("click", () => {
  if (!chatThreadSearchBar) return;
  const isHidden = chatThreadSearchBar.style.display === "none";
  chatThreadSearchBar.style.display = isHidden ? "flex" : "none";
  if (isHidden) {
    chatThreadSearchInput?.focus();
  } else {
    clearTimeout(classicSearchTimer);
    classicThreadQuery = "";
    if (chatThreadSearchInput) chatThreadSearchInput.value = "";
    void rerenderChat();
  }
});

chatThreadSearchInput?.addEventListener("input", () => {
  classicThreadQuery = (chatThreadSearchInput.value || "").trim().toLowerCase();
  clearTimeout(classicSearchTimer);
  classicSearchTimer = window.setTimeout(() => void rerenderChat(), 120);
});

chatThreadSearchClose?.addEventListener("click", () => {
  clearTimeout(classicSearchTimer);
  classicThreadQuery = "";
  if (chatThreadSearchInput) chatThreadSearchInput.value = "";
  if (chatThreadSearchBar) chatThreadSearchBar.style.display = "none";
  void rerenderChat();
});

// Safety Number Verification button for Classic Chat
chatSafetyBtn?.addEventListener("click", () => {
  messengerChat.openSafetyModal();
});

chatSendForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  let text = chatMessageInput.value;
  if (!text.trim() && !classicStagedMedia) return;

  const chatSendBtn = document.getElementById("chat-send-btn") as HTMLButtonElement | null;
  const prevBtnHtml = chatSendBtn ? chatSendBtn.innerHTML : "Send";

  if (classicStagedMedia) {
    if (chatSendBtn) {
      chatSendBtn.disabled = true;
      chatSendBtn.innerHTML = `<span style="font-size:0.75rem;">🔒…</span>`;
    }
    try {
      showToast("Encrypting media for Freenet…", "info");
      const token = await sendChatAttachment(classicStagedMedia, (b) => freenet.putMedia(b), (done, total) => {
        if (chatSendBtn) chatSendBtn.innerHTML = `<span style="font-size:0.75rem;">🔒 ${total > 1 ? `${done}/${total}` : "…"}</span>`;
      });
      text = text ? `${text}\n${token}` : token;
      setClassicStagedMedia(null);
    } catch (err: any) {
      showToast(`Could not send media: ${err.message || err}`, "error");
      if (chatSendBtn) {
        chatSendBtn.disabled = false;
        chatSendBtn.innerHTML = prevBtnHtml;
      }
      return;
    } finally {
      if (chatSendBtn) {
        chatSendBtn.disabled = false;
        chatSendBtn.innerHTML = prevBtnHtml;
      }
    }
  }

  const sent = await sendActiveChatText(text, chatMessageInput);
  if (sent) {
    chatMessageInput.value = "";
    fitChatInput();
  }
});

// Event listeners for Private Rooms & Channels
const updatePrivroomTypeUI = () => {
  const isChannel = !!privroomTypeChannel?.checked;
  privroomTypeGroupLabel?.classList.toggle("active", !isChannel);
  privroomTypeChannelLabel?.classList.toggle("active", isChannel);
  if (privroomChannelOptions) privroomChannelOptions.style.display = isChannel ? "block" : "none";
  if (privroomNameLabel) privroomNameLabel.textContent = isChannel ? "Channel Name" : "Room Name";
  if (privroomNameInput) privroomNameInput.placeholder = isChannel ? "e.g. Radica News, Daily Alpha..." : "e.g. Secret Council, Core Devs...";
  const submitText = createPrivroomSubmitBtn?.querySelector("span");
  if (submitText) submitText.textContent = isChannel ? "Create Broadcast Channel" : "Create Encrypted Room";
};
privroomTypeGroup?.addEventListener("change", updatePrivroomTypeUI);
privroomTypeChannel?.addEventListener("change", updatePrivroomTypeUI);

function resetPrivroomAvatarUI() {
  privroomAvatarData = null;
  if (privroomAvatarInput) privroomAvatarInput.value = "";
  if (privroomAvatarPreview) {
    privroomAvatarPreview.innerHTML = "📷";
    privroomAvatarPreview.style.border = "2px dashed var(--border)";
  }
  if (privroomAvatarRemoveBtn) privroomAvatarRemoveBtn.style.display = "none";
}

if (privroomAvatarPreview && privroomAvatarInput) {
  privroomAvatarPreview.addEventListener("click", () => {
    privroomAvatarInput.click();
  });

  privroomAvatarInput.addEventListener("change", async () => {
    const file = privroomAvatarInput.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressAvatarFile(file, 96, 0.6);
      privroomAvatarData = dataUrl;
      privroomAvatarPreview.innerHTML = `<img src="${safeUrl(dataUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
      privroomAvatarPreview.style.border = "2px solid var(--primary)";
      if (privroomAvatarRemoveBtn) privroomAvatarRemoveBtn.style.display = "inline-block";
    } catch (err: any) {
      alert(`Could not process image: ${err.message || err}`);
    }
  });
}

if (privroomAvatarRemoveBtn) {
  privroomAvatarRemoveBtn.addEventListener("click", () => {
    resetPrivroomAvatarUI();
  });
}

if (newPrivateRoomBtn && createPrivateRoomModal) {
  newPrivateRoomBtn.addEventListener("click", () => {
    if (!currentIdentity) {
      alert("Please sign in or create an identity first.");
      return;
    }
    resetPrivroomAvatarUI();
    if (privroomTypeGroup) privroomTypeGroup.checked = true;
    updatePrivroomTypeUI();
    if (privroomNameInput) privroomNameInput.value = "";
    if (privroomMembersInput) privroomMembersInput.value = "";

    // Quick-pick peers from following and known peers
    if (privroomQuickPick) {
      const candidates = Array.from(
        new Set([...followingKeys, ...freenet.getChatPeers(currentIdentity.pubkey)])
      ).filter((pk) => pk && pk !== currentIdentity!.pubkey);

      if (candidates.length === 0) {
        privroomQuickPick.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted);">No contacts yet. You can paste 64-hex public keys directly.</span>`;
      } else {
        privroomQuickPick.innerHTML = candidates
          .map((pk) => {
            const p = freenet.knownPeers[pk];
            const name = p?.display_name || `@${shortenKey(pk)}`;
            return `<button type="button" class="btn-secondary btn-sm quick-pick-btn" data-key="${escapeHtml(pk)}" style="font-size: 0.7rem; padding: 2px 6px;">+ ${escapeHtml(name)}</button>`;
          })
          .join("");

        privroomQuickPick.querySelectorAll(".quick-pick-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const key = (btn as HTMLElement).dataset.key!;
            const cur = privroomMembersInput ? privroomMembersInput.value.trim() : "";
            if (privroomMembersInput) {
              if (cur.includes(key)) return;
              privroomMembersInput.value = cur ? `${cur}\n${key}` : key;
            }
          });
        });
      }
    }

    createPrivateRoomModal.style.display = "flex";
  });
}

if (newChannelBtn && createPrivateRoomModal) {
  newChannelBtn.addEventListener("click", () => {
    if (!currentIdentity) {
      alert("Please sign in or create an identity first.");
      return;
    }
    resetPrivroomAvatarUI();
    if (privroomTypeChannel) privroomTypeChannel.checked = true;
    updatePrivroomTypeUI();
    if (privroomNameInput) privroomNameInput.value = "";
    if (privroomMembersInput) privroomMembersInput.value = "";
    createPrivateRoomModal.style.display = "flex";
    privroomNameInput?.focus();
  });
}

if (createPrivroomCloseBtn && createPrivateRoomModal) {
  createPrivroomCloseBtn.addEventListener("click", () => {
    createPrivateRoomModal.style.display = "none";
  });
}

if (createPrivroomCancelBtn && createPrivateRoomModal) {
  createPrivroomCancelBtn.addEventListener("click", () => {
    createPrivateRoomModal.style.display = "none";
  });
}

if (createPrivroomSubmitBtn && createPrivateRoomModal) {
  createPrivroomSubmitBtn.addEventListener("click", async () => {
    if (!currentIdentity) return;
    const name = privroomNameInput ? privroomNameInput.value.trim() : "";
    if (!name) {
      alert("Please enter a room name.");
      return;
    }

    const rawMembers = privroomMembersInput ? privroomMembersInput.value : "";
    const memberKeys = rawMembers
      .split(/[\n,; ]+/)
      .map((k) => k.trim())
      .filter((k) => k.length === 64);

    const isChannel = !!privroomTypeChannel?.checked;
    const linkDiscussion = isChannel && !!privroomLinkDiscussionCheck?.checked;
    const isPublic = isChannel && !!privroomPublicCheck?.checked;

    try {
      let discRoom: PrivateRoom | undefined;
      if (linkDiscussion) {
        discRoom = await freenet.createPrivateRoom(currentIdentity, `${name} · Comments`, memberKeys, undefined, { public: isPublic });
      }
      const room = await freenet.createPrivateRoom(
        currentIdentity,
        name,
        memberKeys,
        undefined,
        {
          is_channel: isChannel,
          public: isPublic,
          linked_room_id: discRoom?.id,
          avatar_url: privroomAvatarData || undefined,
        }
      );
      if (discRoom) {
        await freenet.setRoomLinkedDiscussion(currentIdentity, discRoom.id, room.id);
      }
      createPrivateRoomModal.style.display = "none";
      await selectPrivateRoom(room);
      alert(isChannel ? `Broadcast Channel "${name}" created!` : `Private Room "${name}" created with ${room.members.length} member(s)!`);
    } catch (err: any) {
      const what = isChannel ? "channel" : "room";
      // a slow node can still publish it after we stop waiting: trying again at once could make a twin
      alert(/timeout/i.test(String(err?.message ?? err))
        ? `Your Freenet node is slow to publish the new ${what} (few peers yet, or just started). Wait a minute and look for it in your chat list before trying again.`
        : `Could not create ${what}: ${err.message || err}`);
    }
  });
}

if (chatInviteBtn && invitePrivroomModal) {
  chatInviteBtn.addEventListener("click", async () => {
    if (!activeChatPrivateRoom || !currentIdentity) return;
    if (invitePrivroomKeyInput) invitePrivroomKeyInput.value = "";
    if (copyLinkFeedback) copyLinkFeedback.style.display = "none";

    // Generate zero-knowledge invite link with room encryption key in URL fragment
    const link = await inviteLinkOf(activeChatPrivateRoom);
    if (link && invitePrivroomLinkInput) invitePrivroomLinkInput.value = link;

    if (sharePrivroomLinkBtn) {
      sharePrivroomLinkBtn.style.display = typeof navigator !== "undefined" && !!navigator.share ? "inline-block" : "none";
    }

    invitePrivroomModal.style.display = "flex";
  });
}

if (copyPrivroomLinkBtn && invitePrivroomLinkInput) {
  copyPrivroomLinkBtn.addEventListener("click", async () => {
    const link = invitePrivroomLinkInput.value.trim();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      invitePrivroomLinkInput.select();
      document.execCommand("copy");
    }
    if (copyLinkFeedback) {
      copyLinkFeedback.style.display = "block";
      setTimeout(() => {
        if (copyLinkFeedback) copyLinkFeedback.style.display = "none";
      }, 3000);
    }
  });
}

if (sharePrivroomLinkBtn && invitePrivroomLinkInput) {
  sharePrivroomLinkBtn.addEventListener("click", async () => {
    const link = invitePrivroomLinkInput.value.trim();
    if (!link) return;
    const roomName =
      activeChatPrivateRoom && currentIdentity
        ? await freenet.getPrivateRoomDecryptedName(currentIdentity, activeChatPrivateRoom)
        : "Private Room";
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${roomName} on Radica`,
          text: `Join encrypted private room "${roomName}" on Radica:`,
          url: link,
        });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Error sharing invite link:", err);
        }
      }
    }
  });
}

if (joinPrivateRoomBtn && joinPrivroomModal) {
  joinPrivateRoomBtn.addEventListener("click", () => {
    if (!currentIdentity) {
      alert("Please sign in or create an identity first.");
      return;
    }
    if (joinPrivroomInput) joinPrivroomInput.value = "";
    joinPrivroomModal.style.display = "flex";
  });
}

if (joinPrivroomCloseBtn && joinPrivroomModal) {
  joinPrivroomCloseBtn.addEventListener("click", () => {
    joinPrivroomModal.style.display = "none";
  });
}

if (joinPrivroomCancelBtn && joinPrivroomModal) {
  joinPrivroomCancelBtn.addEventListener("click", () => {
    joinPrivroomModal.style.display = "none";
  });
}

if (joinPrivroomSubmitBtn && joinPrivroomModal) {
  joinPrivroomSubmitBtn.addEventListener("click", async () => {
    if (!currentIdentity) return;
    const raw = joinPrivroomInput ? joinPrivroomInput.value.trim() : "";
    if (!raw) {
      alert("Please paste a private room invite link or fragment.");
      return;
    }

    try {
      if (raw.includes("BEGIN RIVER IDENTITY")) {
        // River's "Export ID": be the same member here as in River, not a second one
        const room = await freenet.importRiverIdentity(currentIdentity, raw);
        joinPrivroomModal.style.display = "none";
        await selectPrivateRoom(room);
        alert(`You are now the same member in "${await freenet.getPrivateRoomDecryptedName(currentIdentity, room)}" as in River.`);
        return;
      }
      const code = riverCodeIn(raw); // a River invitation, from Radica, River's UI or riverctl
      if (code) {
        const frag = raw.includes("#") ? raw.split("#")[1] : (raw.includes("?") ? raw.split("?")[1] : "");
        const params = new URLSearchParams(frag);
        const isChannel = params.get("chan") === "1" || params.get("is_channel") === "true";
        const linkedRoomId = params.get("lr") || params.get("linked_room_id") || undefined;
        const roomIdParam = params.get("room_id") || undefined;
        const creatorParam = params.get("creator") || undefined;
        const nameParam = params.get("name") || undefined;
        const room = await freenet.joinRiverInvitation(currentIdentity, code, {
          roomId: roomIdParam,
          creator: creatorParam,
          name: nameParam,
          is_channel: isChannel,
          linked_room_id: linkedRoomId,
        });
        joinPrivroomModal.style.display = "none";
        await selectPrivateRoom(room);
        alert(`Joined "${await freenet.getPrivateRoomDecryptedName(currentIdentity, room)}"!`);
        return;
      }
      let fragment = raw;
      if (raw.includes("#")) {
        fragment = raw.split("#")[1];
      } else if (raw.includes("?")) {
        fragment = raw.split("?")[1];
      }

      const invite = inviteFromParams(new URLSearchParams(fragment));
      if (!invite) {
        alert("Invalid invite link format. Missing join_room or valid 64-hex encryption key.");
        return;
      }
      const { name } = invite;
      const room = await freenet.joinPrivateRoomFromInvite(currentIdentity, invite);

      joinPrivroomModal.style.display = "none";
      await selectPrivateRoom(room);
      alert(`Successfully joined private room "${name}"!`);
    } catch (err: any) {
      alert(`Could not join private room: ${err.message || err}`);
    }
  });
}

if (invitePrivroomCloseBtn && invitePrivroomModal) {
  invitePrivroomCloseBtn.addEventListener("click", () => {
    invitePrivroomModal.style.display = "none";
  });
}

if (invitePrivroomCancelBtn && invitePrivroomModal) {
  invitePrivroomCancelBtn.addEventListener("click", () => {
    invitePrivroomModal.style.display = "none";
  });
}

if (invitePrivroomSubmitBtn && invitePrivroomModal) {
  invitePrivroomSubmitBtn.addEventListener("click", async () => {
    if (!currentIdentity || !activeChatPrivateRoom) return;
    const key = invitePrivroomKeyInput ? invitePrivroomKeyInput.value.trim() : "";
    if (!key || key.length !== 64) {
      alert("Please enter a valid 64-character hex public key.");
      return;
    }

    try {
      const updated = await freenet.inviteMemberToPrivateRoom(
        currentIdentity,
        activeChatPrivateRoom.id,
        key
      );
      invitePrivroomModal.style.display = "none";
      await selectPrivateRoom(updated);
      alert(`Peer invited! The room key has been encrypted and shared with @${shortenKey(key)}.`);
    } catch (err: any) {
      alert(`Could not invite member: ${err.message || err}`);
    }
  });
}

// ---- Activity / Notifications Modal ----

const NOTIFS_SHOWN = 15;
let shownNotifs: NotificationItem[] = [];

/** Whose notifications count: me, my network (roots, friends of friends, supporters, GhostKeys) and the moderators I follow. */
function isKnownSender(pubkey: string): boolean {
  return pubkey === currentIdentity?.pubkey || getWebOfTrust().isTrusted(pubkey) || moderationCurators().includes(pubkey);
}

/** Which notifications count: a known sender's, or a stranger's that points to a real comment the feed shows. A claim with
 *  no comment behind it (what a script can write into my inbox) stays under "Others". */
async function notifCounts(): Promise<(n: NotificationItem) => boolean> {
  const mine = (await freenet.getFeed(currentIdentity!.pubkey)).posts;
  const wot = getWebOfTrust();
  return (n) => {
    if (isKnownSender(n.from)) return true;
    if (n.type === "report") return true;
    if (n.type !== "comment" || !n.linkPostId) return false;
    const post = mine[n.linkPostId] ?? freenet.peerCache[n.linkPostId] ?? timelinePosts.find((p) => p.id === n.linkPostId);
    return Object.values(post?.comments ?? {}).some((c) => c.author === n.from && c.text !== "" && !(isWotModerationEnabled() && unprovenComment(c, wot)));
  };
}

openNotifsBtn.addEventListener("click", async () => {
  if (!currentIdentity) return;
  // a click is the gesture the browser wants before it asks for permission to notify
  if (!toShell({ type: "notification_enable_prompt" })) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    } catch {}
  }
  notifsModal.style.display = "flex"; // open at once on what was drawn last, then draw the current list
  // storage keeps 50; the panel shows the newest few
  const { main, others } = splitNotifs(await freenet.getNotifications(currentIdentity), await notifCounts());
  const notifs = [...main.slice(0, NOTIFS_SHOWN), ...others.slice(0, NOTIFS_SHOWN)];
  await renderNotifs(notifs);
  // only senders with no known name or avatar are fetched (at most every 10 min, parsed in a worker); redraw once they are
  void freenet.warmPeers(notifs.map((n) => n.from)).then(() => { if (notifsModal.style.display !== "none") void renderNotifs(notifs); });
});

async function renderNotifs(notifs: NotificationItem[]) {
  shownNotifs = notifs;
  const myPosts = (await freenet.getFeed(currentIdentity!.pubkey)).posts;
  // which of my posts a like or comment is about: its first words, or "photo" for a post with only a picture
  const aboutPost = (id?: string): string => {
    const p = id ? (myPosts[id] || freenet.peerCache[id] || timelinePosts.find((x) => x.id === id)) : undefined;
    if (!p) return "";
    const postCaption = freenet.postEdit(p.author, p.id)?.caption ?? p.caption;
    const words = postCaption.trim().replace(/\s+/g, " ");
    const label = words ? `\u201c${words.length > 60 ? words.slice(0, 60) + "\u2026" : words}\u201d` : p.media_uri ? (p.author === currentIdentity?.pubkey ? "your photo" : "a photo") : "";
    return label ? `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">on ${escapeHtml(label)}</div>` : "";
  };

  const icon = (paths: string) => `<svg viewBox="0 0 24 24" class="svg-icon icon-md" aria-hidden="true">${paths}</svg>`;
  const row = (n: NotificationItem) => `
      <div class="notif-item ${n.read ? "" : "unread"}" data-notif-id="${escapeHtml(n.id)}">
        <div class="notif-text">
          <span style="font-weight: 700;" title="${escapeHtml(n.from)}">${escapeHtml(getAuthorDisplayName(n.from))}</span>
          <span>${escapeHtml(n.text)}</span>
          ${aboutPost(n.linkPostId)}
        </div>
        <span class="notif-time">${formatTimeAgo(n.timestamp)}</span>
        <div class="notif-actions">
          ${notificationHasTarget(n) ? `<button type="button" class="notif-act" data-notif-act="open" title="Open" aria-label="Open">${icon('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>')}</button>` : ""}
          ${n.read ? "" : `<button type="button" class="notif-act" data-notif-act="read" title="Mark as read" aria-label="Mark as read">${icon('<path d="M20 6 9 17l-5-5"/>')}</button>`}
          <button type="button" class="notif-act" data-notif-act="delete" title="Delete" aria-label="Delete">${icon('<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>')}</button>
        </div>
      </div>
    `;
  const { main, others } = splitNotifs(notifs, await notifCounts());
  if (notifs.length === 0) {
    notifsList.innerHTML = `<div class="empty-state">No notifications yet.</div>`;
  } else {
    notifsList.innerHTML =
      (main.length ? main.map(row).join("") : `<div class="empty-state">Nothing from your network.</div>`) +
      (others.length
        ? `<details class="notif-others"><summary>Others (${others.length}): from people outside your network, they do not count as unread</summary>${others.map(row).join("")}</details>`
        : "");
  }
}

// Share Post & Freenet Details Modal logic
async function openSharePostModal(postId: string, authorPubkey: string) {
  if (!sharePostModal) return;
  const post = timelinePosts.find((p) => p.id === postId) || (await freenet.getFeed(authorPubkey).catch(() => null))?.posts?.[postId];
  const loc = window.location;
  const baseUrl = `${loc.protocol}//${loc.host}${loc.pathname}`;
  const permalink = `${baseUrl}#post=${encodeURIComponent(postId)}&author=${encodeURIComponent(authorPubkey)}`;

  if (sharePostSnippet) {
    const postCaption = post ? (freenet.postEdit(authorPubkey, postId)?.caption ?? post.caption) : "";
    const previewText = postCaption ? (postCaption.length > 140 ? postCaption.slice(0, 140) + "…" : postCaption) : "(No text caption)";
    sharePostSnippet.innerHTML = `<strong>${escapeHtml(getAuthorDisplayName(authorPubkey))}</strong>: <span>${escapeHtml(previewText)}</span>`;
  }

  if (sharePostLinkInput) {
    sharePostLinkInput.value = permalink;
  }

  if (sharePostAuthor) {
    sharePostAuthor.textContent = authorPubkey;
  }

  if (sharePostFeedId) {
    sharePostFeedId.textContent = `feed:${authorPubkey}`;
  }

  if (sharePostFreenetUri) {
    sharePostFreenetUri.textContent = "Deriving ContractKey…";
    freenet.getContractUri(`feed:${authorPubkey}`)
      .then((uri) => {
        if (sharePostFreenetUri) sharePostFreenetUri.textContent = uri;
      })
      .catch(() => {
        if (sharePostFreenetUri) sharePostFreenetUri.textContent = `freenet:feed:${shortenKey(authorPubkey)}`;
      });
  }

  if (sharePostMediaRow && sharePostMediaUri) {
    if (post?.media_uri) {
      sharePostMediaRow.style.display = "block";
      sharePostMediaUri.textContent = post.media_uri;
    } else {
      sharePostMediaRow.style.display = "none";
    }
  }

  if (sharePostNativeBtn) {
    sharePostNativeBtn.style.display = typeof navigator !== "undefined" && !!navigator.share ? "inline-block" : "none";
  }

  // Auto-copy permalink to clipboard for immediate convenience
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(permalink);
      showToast("Post link copied to clipboard!", "info");
    }
  } catch {}

  sharePostModal.style.display = "flex";
}

if (sharePostCloseBtn && sharePostModal) {
  sharePostCloseBtn.addEventListener("click", () => (sharePostModal.style.display = "none"));
}
if (sharePostDoneBtn && sharePostModal) {
  sharePostDoneBtn.addEventListener("click", () => (sharePostModal.style.display = "none"));
}
if (sharePostCopyBtn && sharePostLinkInput) {
  sharePostCopyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(sharePostLinkInput.value);
      showToast("Permalink copied to clipboard!", "info");
    } catch {
      showToast("Could not copy link to clipboard.", "error");
    }
  });
}
if (sharePostCopyAuthor && sharePostAuthor) {
  sharePostCopyAuthor.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(sharePostAuthor.textContent || "");
      showToast("Author pubkey copied!", "info");
    } catch {}
  });
}
if (sharePostCopyFreenetUri && sharePostFreenetUri) {
  sharePostCopyFreenetUri.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(sharePostFreenetUri.textContent || "");
      showToast("Freenet URI copied!", "info");
    } catch {}
  });
}
if (sharePostCopyMedia && sharePostMediaUri) {
  sharePostCopyMedia.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(sharePostMediaUri.textContent || "");
      showToast("Media URI copied!", "info");
    } catch {}
  });
}
if (sharePostNativeBtn && sharePostLinkInput) {
  sharePostNativeBtn.addEventListener("click", async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Radica Post",
          text: "Check out this post on Radica (Freenet)",
          url: sharePostLinkInput.value,
        });
      } catch {}
    }
  });
}

// Permalink post opening from URL hash: #post=<postId>&author=<pubkey>
async function checkUrlPostHash(fromHash = window.location.hash) {
  const hash = fromHash ? fromHash.replace(/^#/, "") : "";
  if (!hash || !hash.includes("post=")) return;
  const params = new URLSearchParams(hash);
  const postId = params.get("post");
  const author = params.get("author") || undefined;
  if (!postId) return;

  try {
    if (author) {
      // someone else's feed is often not cached yet: getFeed answers empty at once, so wait for the network copy
      const cached = await freenet.getFeed(author).catch(() => null);
      if (!cached?.posts?.[postId]) await freenet.refresh(author, true, true);
    }
    chatModal.style.display = "none";
    await showMyPost(postId, author);
  } catch (err) {
    console.warn("Could not navigate to post from hash:", err);
  }
}
window.addEventListener("hashchange", () => void checkUrlPostHash());

/** Show a post in the feed: its author's posts (mine by default), no filter, the page that holds it, scrolled to and flashed. */
async function showMyPost(postId: string, author = currentIdentity?.pubkey) {
  markSeen((n) => n.linkPostId === postId);
  showProfilePage(false);
  chatModal.style.display = "none";
  currentFeedScope = "myposts";
  updateScopeBtnActive(scopeMyPostsBtn);
  feedAuthor = author === currentIdentity?.pubkey ? null : author ?? null;
  if (feedAuthor) scopeMyPostsBtn.classList.remove("active"); // someone else's posts: not "my posts"
  activeCommunity = null;
  communityHeaderBanner.style.display = "none";
  activeTagFilter = null;
  activeFilterBanner.style.display = "none";
  searchQuery = "";
  feedSearchInput.value = "";
  currentCategory = "all";
  document.querySelectorAll(".cat-btn").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.cat === "all"));
  await reloadPosts();
  const index = timelinePosts.findIndex((p) => p.id === postId);
  if (index >= visiblePosts) {
    visiblePosts = index + 1; // the post is on a later page
    renderTimeline();
  }
  const card = document.getElementById(`card-${postId}`);
  if (!card) {
    const owner = author ?? currentIdentity?.pubkey ?? "";
    const stored = localStorage.getItem(`freenet_feed_${owner}`) !== null; // no stored feed: the author's feed has not reached this device
    return showToast(GONE_MESSAGE[whyGone(stored ? await freenet.getFeed(owner) : null, postId)], "info");
  }
  card.scrollIntoView({ block: "center", behavior: "smooth" });
  card.classList.add("notif-flash");
  setTimeout(() => card.classList.remove("notif-flash"), 2500);
}

/** Whether a notification points anywhere: a post, a profile or a chat. */
function notificationHasTarget(n: NotificationItem): boolean {
  return !!(n.linkPostId || n.type === "follow" || n.type === "chat" || n.linkRoomId);
}

/** Go to what a notification is about; opening it also marks it read. */
async function openNotification(n: NotificationItem) {
  if (!currentIdentity) return;
  freenet.markNotificationRead(currentIdentity, n.id);
  notifsModal.style.display = "none";
  void updateNotificationsBadge();
  if (n.type === "report") {
    if (amGlobalMod()) {
      paintModButton();
      showBlocklistTab("moderation");
      blocklistsModal.style.display = "flex";
      renderModDashboard();
      void freenet.refreshLog("reports", true).then(() => {
        if (isOpen(blocklistsModal) && paneModeration?.style.display !== "none") renderModDashboard();
      });
    } else if (n.linkPostId) {
      await showMyPost(n.linkPostId, n.linkPostOwner);
      const repName = getAuthorDisplayName(n.from);
      showToast(`Report from @${repName}: ${n.text}`, "info");
    }
  } else if (n.linkPostId) {
    await showMyPost(n.linkPostId, n.linkPostOwner);
  } else if (n.type === "follow") {
    await openUserProfile(n.from);
  } else if (n.type === "chat" || n.linkRoomId) {
    const isSecret = !!(
      n.isSecret ||
      (n.linkRoomId && freenet.isSecretRoomId(n.linkRoomId)) ||
      n.text.toLowerCase().includes("secret chat")
    );
    if (isSecret) {
      openChatWithPeer(n.from, true, true);
    } else if (n.linkRoomId && !n.linkRoomId.includes(":")) {
      // Named private room or community room
      activeChatCommunity = null;
      activeChatPeer = null;
      void showChat(async () => {
        allPrivateRooms = await freenet.getPrivateRooms(currentIdentity!);
        const room = allPrivateRooms.find((r) => r.id === n.linkRoomId);
        if (room) await selectPrivateRoom(room);
        else openChatWithPeer(n.from, true, false);
      });
    } else {
      openChatWithPeer(n.from, true, false);
    }
  }
}

notifsList.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>("[data-notif-act]");
  const item = button?.closest<HTMLElement>("[data-notif-id]");
  const n = item && shownNotifs.find((x) => x.id === item.dataset.notifId);
  if (!button || !n || !currentIdentity) return;
  const act = button.dataset.notifAct;
  if (act === "open") return void openNotification(n);
  if (act === "read") freenet.markNotificationRead(currentIdentity, n.id), (n.read = true);
  if (act === "delete") {
    freenet.dismissNotification(currentIdentity, n.id);
    shownNotifs = shownNotifs.filter((x) => x.id !== n.id);
  }
  void renderNotifs(shownNotifs);
  void updateNotificationsBadge();
});

notifsCloseBtn.addEventListener("click", () => {
  notifsModal.style.display = "none";
});

document.getElementById("notifs-clear-btn")!.addEventListener("click", async () => {
  if (!currentIdentity || !confirm("Remove all notifications? This holds on your other devices too.")) return;
  notifsModal.style.display = "none"; // close first: the log write below goes over the network
  await freenet.clearNotifications(currentIdentity);
  updateNotificationsBadge();
});

notifsMarkReadBtn.addEventListener("click", async () => {
  if (!currentIdentity) return;
  const written = freenet.markNotificationsAsRead(currentIdentity); // the local copy is marked at once, the log write goes over the network
  for (const n of shownNotifs) n.read = true;
  void renderNotifs(shownNotifs);
  await written;
  updateNotificationsBadge();
});

function updateNotifsSoundBtn() {
  if (!notifsSoundBtn) return;
  const enabled = isSoundEnabled();
  notifsSoundBtn.textContent = enabled ? "🔔 Sound on" : "🔕 Sound off";
  notifsSoundBtn.title = enabled ? "Notification sound enabled (click to mute)" : "Notification sound muted (click to enable)";
}
updateNotifsSoundBtn();

if (notifsSoundBtn) {
  notifsSoundBtn.addEventListener("click", () => {
    toggleSoundEnabled();
    updateNotifsSoundBtn();
  });
}

const BASE_TITLE = document.title;
const startedAt = Date.now(); // only what arrives after the page opened is worth an alert
const alerted = new Set<string>();

/** Ask Freenet's shell page to do something for the sandboxed app (it is the one allowed to notify and to set the tab title). */
function toShell(msg: Record<string, unknown>): boolean {
  if (window.parent === window) return false; // not in the gateway's shell (Electron, dev server)
  window.parent.postMessage({ __freenet_shell__: true, ...msg }, "*");
  return true;
}

// the gateway's shell shows Freenet's rabbit in the tab: hand it Radica's own icon (it takes https: and data: URLs)
const ownIcon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute("href");
if (ownIcon) toShell({ type: "favicon", href: ownIcon });

/** Unread count in the tab title (the shell mirrors document.title) and, while the tab is hidden, a system
 *  notification per new item. The shell gates it on the browser permission and the user's consent for this app. */
function alertUnread(notifs: NotificationItem[], unreadCount: number) {
  document.title = unreadCount ? `(${unreadCount}) ${BASE_TITLE}` : BASE_TITLE;
  let hasNew = false;
  for (const n of notifs) {
    if (n.read || n.timestamp < startedAt || alerted.has(n.id)) continue;
    alerted.add(n.id);
    hasNew = true;
    if (document.hidden) {
      const [title, body] = [getAuthorDisplayName(n.from), n.text];
      if (toShell({ type: "notification", title, body, tag: n.id })) continue;
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const sysNotif = new Notification(title, { body, tag: n.id });
          sysNotif.onclick = () => {
            window.focus();
            void openNotification(n);
          };
        }
      } catch {}
    }
  }
  if (hasNew) {
    playPopSound();
  }
}

const chatBadge = document.getElementById("chat-badge") as HTMLElement;
let prevChatUnread = -1;
/** Unread messages on the Chat button: every DM conversation (one never opened counts from its start) and the rooms
 *  already opened once (a room I never read would count its whole history). */
function updateChatBadge() {
  if (!currentIdentity) return;
  const me = currentIdentity.pubkey;
  const read = conversation.readMarks();
  let n = 0;
  // count only what the chat list shows, so every badge unit has a pill to clear (blocked/removed peers are hidden there; secret chats are listed)
  for (const peer of freenet.getChatPeers(me)) {
    if (peer !== me && !isHiddenAuthor(peer) && !freenet.isChatPeerRemoved(me, peer)) n += conversation.unread(freenet.getRoomId(me, peer), read);
  }
  for (const peer of freenet.getSecretChatPeers(me)) if (peer && peer !== me) n += conversation.unread(freenet.getSecretRoomId(me, peer), read);
  for (const r of allPrivateRooms) n += conversation.unread(r.id, read);
  for (const c of joinedCommunities()) n += conversation.unread(`comm_${c.id}`, read);
  chatBadge.textContent = n > 99 ? "99+" : String(n);
  chatBadge.style.display = n ? "inline-block" : "none";
  if (prevChatUnread !== -1 && n > prevChatUnread) {
    playPopSound();
  }
  prevChatUnread = n;
}

/** Opening what a notification is about reads it: mark the unread ones that match, and redraw the bell and the list. */
function markSeen(matches: (n: NotificationItem) => boolean): void {
  if (!currentIdentity) return;
  if (!freenet.markNotificationsReadWhere(currentIdentity, matches)) return;
  void updateNotificationsBadge();
  for (const n of shownNotifs) if (!n.read && matches(n)) n.read = true;
  if (notifsModal.style.display !== "none") void renderNotifs(shownNotifs);
}

/** The same for a conversation, only while the chat is on screen: a background sync that reselects a room has not shown it. */
function markChatSeen(matches: (n: NotificationItem) => boolean): void {
  if (chatModal.style.display !== "none" && !document.hidden) markSeen((n) => n.type === "chat" && matches(n));
}

async function updateNotificationsBadge() {
  updateChatBadge();
  updateBlocklistsBadge();
  if (!currentIdentity) return;
  const notifs = splitNotifs(await freenet.getNotifications(currentIdentity), await notifCounts()).main; // strangers' are under "Others"
  const unreadCount = notifs.filter((n) => !n.read).length;
  alertUnread(notifs, unreadCount);

  if (unreadCount > 0) {
    notifBadge.textContent = unreadCount.toString();
    notifBadge.style.display = "inline-block";
  } else {
    notifBadge.style.display = "none";
  }
}

// ---- Hashtags & Search ----

// Trending hashtags of the Explore feed: one click filters by one
const trendingEl = document.getElementById("trending-tags") as HTMLElement;
function renderTrending() {
  const tags =
    currentFeedScope === "explore" && !activeCommunity
      ? trendingTags(
          timelinePosts.map((p) => ({
            author: p.author,
            caption: freenet.postEdit(p.author, p.id)?.caption ?? p.caption,
            timestamp: p.timestamp,
          }))
        )
      : [];
  trendingEl.hidden = tags.length === 0;
  setHtmlIfChanged(trendingEl, tags.length ? `<span>Trending</span>` + tags.map((t) => `<button type="button" class="trend-chip${t.toLowerCase() === activeTagFilter?.toLowerCase() ? " active" : ""}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join("") : "");
}
trendingEl.addEventListener("click", (e) => {
  const tag = (e.target as HTMLElement).closest<HTMLElement>(".trend-chip")?.dataset.tag;
  if (tag) setTagFilter(tag.toLowerCase() === activeTagFilter?.toLowerCase() ? null : tag);
});

function setTagFilter(tag: string | null) {
  activeTagFilter = tag;
  if (activeTagFilter) {
    activeFilterTag.textContent = `#${activeTagFilter}`;
    activeFilterBanner.style.display = "flex";
  } else {
    activeFilterBanner.style.display = "none";
  }
  renderTimeline();
  renderTrending();
}

clearFilterBtn.addEventListener("click", () => {
  setTagFilter(null);
});

let feedSearchTimer = 0;
feedSearchInput.addEventListener("input", () => {
  searchQuery = feedSearchInput.value.trim();
  clearTimeout(feedSearchTimer);
  feedSearchTimer = window.setTimeout(() => renderTimeline(), 120);
});

// ---- Communities Logic & Moderation ----

function selectCommunity(comm: Community | null, preserveFilter = false) {
  if (!preserveFilter) document.body.classList.remove("panel-open"); // phones: back from the panel to the community's feed
  activeCommunity = comm;
  if (activeCommunity) {
    communityHeaderBanner.style.display = "block";
    commBannerSlug.textContent = `r/${activeCommunity.slug}`;
    // links in the description are clickable (linkify escapes the text first)
    if (activeCommunity.description) commBannerDesc.innerHTML = linkify(activeCommunity.description);
    else commBannerDesc.textContent = "No description provided.";
    commBannerName.textContent = activeCommunity.name;
    commBannerName.style.display = activeCommunity.name ? "block" : "none";
    commMembersCount.textContent = activeCommunity.members.length.toString();
    commModsCount.textContent = activeCommunity.moderators.length.toString();

    const isOwner = currentIdentity && activeCommunity.creator === currentIdentity.pubkey;
    const isMod = currentIdentity && activeCommunity.moderators.includes(currentIdentity.pubkey);
    const isMember = currentIdentity && activeCommunity.members.includes(currentIdentity.pubkey);

    if (isOwner) {
      commRoleBadge.textContent = "Founder / Owner";
      commRoleBadge.style.display = "inline-block";
      commModBtn.style.display = "inline-block";
    } else if (isMod) {
      commRoleBadge.textContent = "Moderator";
      commRoleBadge.style.display = "inline-block";
      commModBtn.style.display = "inline-block";
    } else {
      commRoleBadge.style.display = "none";
      commModBtn.style.display = "none";
    }

    commEditBtn.style.display = isOwner ? "inline-block" : "none"; // only the creator's edits count (see foldCommunities)
    commHideBtn.style.display = amGlobalMod() && activeCommunity.id !== "c_radica" ? "inline-block" : "none"; // Radica's own home cannot be hidden
    commJoinBtn.textContent = isMember ? "Joined" : "Join Community";
    commJoinBtn.className = isMember ? "btn-secondary btn-sm" : "btn-primary btn-sm";

    composerCommunitySelect.value = activeCommunity.id;
  } else {
    communityHeaderBanner.style.display = "none";
    composerCommunitySelect.value = "";
  }

  // Update active styling in sidebar
  document.querySelectorAll(".comm-item").forEach((el) => {
    const item = el as HTMLElement;
    if (activeCommunity && item.dataset.id === activeCommunity.id) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  if (!preserveFilter) {
    // Reset category filter and ensure All Posts button is active
    currentCategory = "all";
    document.querySelectorAll(".cat-btn").forEach((b) => {
      const btn = b as HTMLElement;
      if (btn.dataset.cat === "all") {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    renderTimeline();
  }
}

/** Tiles drawn at once; "Show more" adds this many. Typing narrows the list long before a few hundred communities matter. */
const COMMUNITIES_PER_PAGE = 8;
let communityTiles = COMMUNITIES_PER_PAGE;

/** When the communities list was last fetched from the network on purpose (a name nobody seems to have was typed). */
let commsCheckedAt = 0;
let commsChecking: Promise<void> | null = null;
function checkCommunitiesOnNetwork(): Promise<void> {
  return (commsChecking ??= freenet.refreshLog("communities", true).then(async () => {
    allCommunities = await loadCommunities();
  }).finally(() => {
    commsCheckedAt = Date.now();
    commsChecking = null;
    renderCommunities();
  }));
}

function renderCommunities() {
  if (!communitiesList) return;

  // joined ones (and the one on screen) first, then the rest; both in the chosen order
  const postsIn = new Map<string, number>();
  for (const p of timelinePosts) if (p.community_id) postsIn.set(p.community_id, (postsIn.get(p.community_id) ?? 0) + 1);
  const found = findCommunities({
    communities: allCommunities,
    query: findCommInput.value,
    sort: commSortSelect.value as CommunitySort,
    pinned: (c) => isJoined(c) || c.id === activeCommunity?.id,
    postsIn,
    limit: communityTiles,
  });
  const item = (c: Community) => `
    <div class="comm-item ${activeCommunity?.id === c.id ? "active" : ""}" data-id="${escapeHtml(c.id)}" title="${escapeHtml(c.name)}">
      <span class="comm-item-title">r/${escapeHtml(c.slug)}</span>
      <span class="comm-item-badge" title="Members">${c.members.length}</span>
    </div>`;
  const joined = found.shown.slice(0, found.pinnedCount);
  const others = found.shown.slice(found.pinnedCount);
  // before offering to create a name, ask the network for the list: on a device that just opened Radica it may not be in yet
  const checking = !!found.create && Date.now() - commsCheckedAt > 60_000;
  if (checking) void checkCommunitiesOnNetwork();
  const createTile = checking
    ? `<div class="comm-section">Looking for r/${escapeHtml(found.create!)} on the network…</div>`
    : found.create
    ? `<button type="button" class="comm-item comm-item-new" data-create="${escapeHtml(found.create)}">
         <span class="comm-item-title">+ r/${escapeHtml(found.create)}</span><span class="comm-item-badge">new</span>
       </button>`
    : "";
  const painted = setHtmlIfChanged(communitiesList,
    createTile + // a name nobody has comes first, before everything else
    (joined.length ? `<div class="comm-section">Joined</div>${joined.map(item).join("")}` : "") +
    (others.length ? `<div class="comm-section">${findCommInput.value.trim() ? "Found" : "More"}</div>${others.map(item).join("")}` : "") +
    (found.more > 0 ? `<button type="button" class="comm-more" id="comm-more-btn">Show more (${found.more})</button>` : "") +
    (!found.shown.length && !createTile ? `<div class="comm-section">No communities yet</div>` : ""));

  if (painted) {
    communitiesList.querySelectorAll<HTMLElement>(".comm-item[data-id]").forEach((el) => {
      el.addEventListener("click", () => {
        // the community on screen, pressed again: the filter goes and the standard feed shows
        selectCommunity(activeCommunity?.id === el.dataset.id ? null : allCommunities.find((c) => c.id === el.dataset.id) || null);
      });
    });
    communitiesList.querySelector("#comm-more-btn")?.addEventListener("click", () => {
      communityTiles += COMMUNITIES_PER_PAGE;
      renderCommunities();
    });
    // a name nobody has: the create dialog opens with it filled in
    communitiesList.querySelector<HTMLElement>("[data-create]")?.addEventListener("click", (e) => {
      const slug = (e.currentTarget as HTMLElement).dataset.create!;
      openCreateCommunityDialog(findCommInput.value.trim().replace(/^r\//i, "") || slug, slug);
    });
  }

  const shown = allCommunities.filter((c) => isJoined(c) || c.id === activeCommunity?.id);

  setHtmlIfChanged(composerCommunitySelect, `
    <option value="">Everyone (public)</option>
    ${shown
      .map(
        (c) => `
      <option value="${escapeHtml(c.id)}" ${activeCommunity?.id === c.id ? "selected" : ""}>
        r/${escapeHtml(c.slug)} - ${escapeHtml(c.name)}
      </option>
    `
      )
      .join("")}
  `);
}

function openModerationPanel(comm: Community) {
  if (!currentIdentity) return;
  modModalCommTitle.textContent = `r/${comm.slug} - ${comm.name}`;
  modDeletedCount.textContent = comm.deleted_post_ids.length.toString();

  commModsList.innerHTML = comm.moderators
    .map((modPk) => {
      const isOwner = modPk === comm.creator;
      const canRemove = currentIdentity!.pubkey === comm.creator && !isOwner;
      const isSystem = modPk === "system";
      const displayName = isSystem ? "Radica Genesis" : getAuthorDisplayName(modPk);
      const avatarUrl = isSystem ? generateDefaultAvatar("system") : getAuthorAvatarUrl(modPk);
      const isClickable = !isSystem;

      return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--card-footer-bg, rgba(0,0,0,0.03)); border: 1px solid var(--border); border-radius: 8px; font-size: 0.85rem; gap: 10px;">
        <div ${isClickable ? `class="author-clickable" data-author="${escapeHtml(modPk)}"` : ""} style="display: flex; align-items: center; gap: 10px; ${isClickable ? "cursor: pointer;" : ""} flex: 1; min-width: 0;" title="${isClickable ? `View Profile: ${escapeHtml(modPk)}` : "System Root"}">
          <img src="${safeUrl(avatarUrl)}" class="following-img" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" onerror="this.onerror=null; this.src='${generateDefaultAvatar(modPk)}'" />
          <div style="display: flex; flex-direction: column; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="font-weight: 700; color: var(--text-main); ${isClickable ? "text-decoration: underline; text-underline-offset: 2px;" : ""}">${escapeHtml(displayName)}</span>
              ${isOwner ? '<span style="color: var(--primary); font-weight: 700; font-size: 0.75rem;">(Founder / Root)</span>' : '<span style="color: var(--text-muted); font-size: 0.75rem;">(Moderator)</span>'}
            </div>
            <span style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(modPk)}">@${shortenKey(modPk)}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          ${
            isClickable
              ? `<button type="button" class="btn-secondary btn-sm mod-view-profile-btn" data-author="${escapeHtml(modPk)}" title="View Profile" style="font-size: 0.75rem; padding: 3px 8px;">Profile</button>`
              : ""
          }
          ${
            canRemove
              ? `<button type="button" class="remove-mod-btn btn-secondary btn-sm" data-mod="${escapeHtml(modPk)}" style="color: var(--danger); font-size: 0.75rem; padding: 3px 8px;">Remove</button>`
              : ""
          }
        </div>
      </div>
    `;
    })
    .join("");

  commModsList.querySelectorAll(".author-clickable, .mod-view-profile-btn").forEach((el) => {
    el.addEventListener("click", () => {
      const pk = (el as HTMLElement).dataset.author;
      if (pk && pk !== "system") {
        commModModal.style.display = "none";
        openUserProfile(pk);
      }
    });
  });

  commModsList.querySelectorAll(".remove-mod-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const modPk = (e.currentTarget as HTMLElement).dataset.mod!;
      if (!confirm(`Remove @${shortenKey(modPk)} from moderators?`)) return;
      const res = await freenet.removeCommunityModerator(currentIdentity!, comm.id, modPk);
      alert(res.msg);
      if (res.success) {
        allCommunities = await loadCommunities();
        const updated = allCommunities.find((c) => c.id === comm.id)!;
        activeCommunity = updated;
        openModerationPanel(updated);
        renderCommunities();
      }
    });
  });

  if (comm.deleted_post_ids.length === 0) {
    commDeletedPostsList.innerHTML = "No posts removed by moderation yet.";
  } else {
    commDeletedPostsList.innerHTML = comm.deleted_post_ids
      .map(
        (pid) => `
      <div style="padding: 4px 0; border-bottom: 1px solid var(--border); font-family: monospace; display: flex; align-items: center; gap: 6px;">
        ${renderIcon("trash2", { className: "icon-xs" })}
        <span>Post ID: ${escapeHtml(pid)}</span>
      </div>
    `
      )
      .join("");
  }

  commModModal.style.display = "flex";
}

// Search as you type: matching communities are tiles, a name nobody has becomes a "create" tile
let findCommTimer = 0;
findCommInput.addEventListener("input", () => {
  communityTiles = COMMUNITIES_PER_PAGE;
  clearTimeout(findCommTimer);
  findCommTimer = window.setTimeout(() => renderCommunities(), 120);
});
findCommInput.addEventListener("keydown", (e) => {
  const q = findCommInput.value.trim().toLowerCase().replace(/^r\//, "");
  if (e.key !== "Enter" || !q) return;
  if (findCommTimer) {
    clearTimeout(findCommTimer);
    findCommTimer = 0;
    renderCommunities();
  }
  // the exact name wins over the sort order ("art" opens r/art, not a busier r/party)
  const exact = allCommunities.find((c) => c.slug.toLowerCase() === q || c.id.toLowerCase() === q || c.name.toLowerCase() === q);
  if (exact) return selectCommunity(exact);
  (communitiesList.querySelector<HTMLElement>(".comm-item[data-id]") ?? communitiesList.querySelector<HTMLElement>("[data-create]"))?.click(); // else the first match, or the new name when nothing matches
});
commSortSelect.value = safeStorage.getItem("radica_comm_sort") || "popular";
commSortSelect.addEventListener("change", () => {
  safeStorage.setItem("radica_comm_sort", commSortSelect.value);
  communityTiles = COMMUNITIES_PER_PAGE;
  renderCommunities();
});

// Exit community banner
commExitBtn.addEventListener("click", () => {
  selectCommunity(null);
});

// Join community button
commJoinBtn.addEventListener("click", async () => {
  if (!currentIdentity || !activeCommunity) return;
  await freenet.toggleJoinCommunity(currentIdentity, activeCommunity.id);
  allCommunities = await loadCommunities();
  activeCommunity = allCommunities.find((c) => c.id === activeCommunity!.id) || null;
  selectCommunity(activeCommunity);
  renderCommunities();
});

// Open moderation modal button
commModBtn.addEventListener("click", () => {
  if (activeCommunity) {
    openModerationPanel(activeCommunity);
  }
});

commModCloseBtn.addEventListener("click", () => {
  commModModal.style.display = "none";
});

// Add moderator form
addModForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentIdentity || !activeCommunity) return;
  const modPk = addModPubkeyInput.value.trim();
  if (!modPk) return;

  const res = await freenet.addCommunityModerator(currentIdentity, activeCommunity.id, modPk);
  alert(res.msg);
  if (res.success) {
    addModPubkeyInput.value = "";
    allCommunities = await loadCommunities();
    const updated = allCommunities.find((c) => c.id === activeCommunity!.id)!;
    activeCommunity = updated;
    openModerationPanel(updated);
    renderCommunities();
  }
});

// Create Community Modal triggers; the same dialog edits a community (editingCommunityId set).
// The slug is never typed here: it was chosen in the search (so it is known to be free) or belongs to the community being edited.
let editingCommunityId: string | null = null;
let dialogSlug = "";
function openCreateCommunityDialog(name = "", slug = "", edit?: Community) {
  editingCommunityId = edit?.id ?? null;
  dialogSlug = edit ? edit.slug : slug;
  commNameInput.value = edit ? edit.name : name;
  commDescInput.value = edit ? edit.description : "";
  if (commRequireTrustedInput) {
    commRequireTrustedInput.checked = edit ? !!edit.require_trusted_to_post : false;
  }
  document.getElementById("create-comm-title")!.textContent = `${edit ? "Edit" : "Create"} r/${dialogSlug}`;
  document.getElementById("create-comm-intro")!.textContent = edit
    ? "Only you, the founder, can change the title and description."
    : "As the creator, you become the founder and primary moderator with powers to manage mods and remove posts.";
  createCommSaveBtn.textContent = edit ? "Save" : "Create Community";
  createCommModal.style.display = "flex";
  commNameInput.focus();
}
commEditBtn.addEventListener("click", () => {
  if (activeCommunity) openCreateCommunityDialog("", "", activeCommunity);
});

createCommCancelBtn.addEventListener("click", () => {
  createCommModal.style.display = "none";
});

createCommSaveBtn.addEventListener("click", async () => {
  if (!currentIdentity) return;
  const name = commNameInput.value.trim();
  const slug = dialogSlug;
  const desc = commDescInput.value.trim();

  if (!name) {
    alert("Please provide a title.");
    return;
  }

  const editing = editingCommunityId;
  const idle = editing ? "Save" : "Create Community";
  createCommSaveBtn.disabled = true;
  createCommSaveBtn.textContent = editing ? "Saving..." : "Creating...";

  const reqTrusted = commRequireTrustedInput ? commRequireTrustedInput.checked : false;

  try {
    const comm = editing
      ? await freenet.updateCommunity(currentIdentity, editing, name, desc, reqTrusted)
      : await freenet.createCommunity(currentIdentity, name, slug, desc, undefined, reqTrusted);
    allCommunities = await loadCommunities();
    createCommModal.style.display = "none";
    renderCommunities();
    selectCommunity(allCommunities.find((c) => c.id === comm.id) ?? comm);
  } catch (err) {
    console.error("Error saving community:", err);
    alert(editing ? "Could not save the community." : "Could not create community on Freenet.");
  } finally {
    createCommSaveBtn.disabled = false;
    createCommSaveBtn.textContent = idle;
  }
});

// Scope Switcher buttons
function updateScopeBtnActive(activeBtn: HTMLButtonElement) {
  feedAuthor = null; // a scope button shows my own posts again; showMyPost sets it back after this when needed
  scopeExploreBtn.classList.remove("active");
  scopeFollowingBtn.classList.remove("active");
  scopeMyPostsBtn.classList.remove("active");
  scopeSavedBtn.classList.remove("active");
  activeBtn.classList.add("active");
}

// The rail opens pages of the main column. The profile page opens from my picture, the logo (or the back button) returns to the feed.
const feedView = document.getElementById("feed-view") as HTMLElement;
const profilePage = document.getElementById("profile-page") as HTMLElement;
const headAvatar = document.getElementById("head-avatar") as HTMLImageElement;
// the pictures in the feed header and the post box follow the one in the sidebar (set from several places)
const syncHeadAvatar = () => (headAvatar.src = composerAvatar.src = sidebarAvatar.src);
new MutationObserver(syncHeadAvatar).observe(sidebarAvatar, { attributes: true, attributeFilter: ["src"] });
syncHeadAvatar();
function showProfilePage(show: boolean) {
  closeRailPages(); // the feed and the profile page replace the chat and the other rail pages
  feedView.hidden = show;
  profilePage.hidden = !show;
  if (show) {
    (document.getElementById("pp-avatar") as HTMLImageElement).src = sidebarAvatar.src;
    document.getElementById("pp-name")!.textContent = sidebarName.textContent;
    document.getElementById("pp-meta")!.textContent = `${sidebarHandle?.textContent ?? ""} · ${sidebarBio.textContent}`;
    renderRoots();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function showFeed() {
  document.body.classList.remove("panel-open");
  showProfilePage(false);
  // Close open modals / overlays if any
  document.querySelectorAll<HTMLElement>(".chat-page, .rail-page, .modal-overlay").forEach((m) => {
    if (m.id !== "boot-screen" && m.style.display !== "none") {
      m.style.display = "none";
    }
  });
  // Clear any active community filter
  selectCommunity(null);
  // Clear any active hashtag filter
  setTagFilter(null);
  // Clear any active search query
  if (feedSearchInput) {
    feedSearchInput.value = "";
    searchQuery = "";
  }
  // Reset category to "all" and update active tab
  currentCategory = "all";
  document.querySelectorAll(".cat-btn").forEach((b) => {
    const btn = b as HTMLElement;
    btn.classList.toggle("active", btn.dataset.cat === "all");
  });
  // Switch scope to full global explore timeline
  currentFeedScope = "explore";
  updateScopeBtnActive(scopeExploreBtn);
  window.scrollTo({ top: 0, behavior: "smooth" });
  await reloadPosts();
}
document.getElementById("rail-home-btn")!.addEventListener("click", () => void showFeed());
// phones: the right panel in place of the feed; picking a community or a person in it goes back to the feed
const showPanel = (open: boolean) => {
  if (open) feedScrollY = window.scrollY;
  document.body.classList.toggle("panel-open", open);
  window.scrollTo({ top: open ? 0 : feedScrollY });
};
document.getElementById("head-panel-btn")!.addEventListener("click", () => showPanel(true));
document.getElementById("panel-back-btn")!.addEventListener("click", () => showPanel(false));
document.getElementById("pp-back-btn")!.addEventListener("click", () => showProfilePage(false));
document.getElementById("head-profile-btn")!.addEventListener("click", () => showProfilePage(true));
const openMyPublicProfile = () => {
  if (currentIdentity?.pubkey) void openUserProfile(currentIdentity.pubkey);
};
document.getElementById("pp-avatar")?.addEventListener("click", openMyPublicProfile);
document.getElementById("pp-name")?.addEventListener("click", openMyPublicProfile);
document.getElementById("pp-view-public-btn")?.addEventListener("click", openMyPublicProfile);
document.getElementById("pp-edit-btn")!.addEventListener("click", () => document.getElementById("edit-profile-btn")?.click());
document.getElementById("pp-backup-btn")!.addEventListener("click", () => document.getElementById("open-identity-btn")?.click());
// anything picked in the right panel (a community, my posts) shows up in the feed; my picture, name and handle open the profile
document.querySelector(".sidebar")?.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("#sidebar-avatar, #sidebar-name, #sidebar-handle")) return;
  if (feedView.hidden) showProfilePage(false);
}, true);

// Feed order buttons: Recent / Top
document.querySelectorAll<HTMLButtonElement>(".sort-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    currentFeedSort = btn.dataset.sort as FeedSort;
    document.querySelectorAll(".sort-btn").forEach((b) => b.classList.toggle("active", b === btn));
    renderTimeline();
  }),
);

scopeExploreBtn.addEventListener("click", async () => {
  currentFeedScope = "explore";
  updateScopeBtnActive(scopeExploreBtn);
  await reloadPosts();
});

scopeFollowingBtn.addEventListener("click", async () => {
  currentFeedScope = "following";
  updateScopeBtnActive(scopeFollowingBtn);
  await reloadPosts();
});

function switchToMyPostsScope() {
  currentFeedScope = "myposts";
  updateScopeBtnActive(scopeMyPostsBtn);
  activeCommunity = null;
  if (communityHeaderBanner) communityHeaderBanner.style.display = "none";
  activeTagFilter = null;
  if (activeFilterBanner) activeFilterBanner.style.display = "none";
  reloadPosts();
}

scopeMyPostsBtn.addEventListener("click", switchToMyPostsScope);

scopeSavedBtn.addEventListener("click", async () => {
  currentFeedScope = "saved";
  updateScopeBtnActive(scopeSavedBtn);
  await reloadPosts();
});

// Clicking a stat or the badge filters to My Posts; my picture, name and handle (sidebar) open the profile page
myPubkeyBadge.addEventListener("click", switchToMyPostsScope);
for (const el of [sidebarAvatar, sidebarName, sidebarHandle]) el?.addEventListener("click", () => showProfilePage(!feedView.hidden)); // again: back to the feed
if (sidebarStatMyPosts) sidebarStatMyPosts.addEventListener("click", switchToMyPostsScope);

// ---- Theme Management (Dark / Light Mode) ----

function initTheme() {
  const saved = safeStorage.getItem("radica_theme") || safeStorage.getItem("spruce_theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
  // the sandboxed page storage does not outlive a session: the choice is kept on the node too
  if (!saved)
    void import("./delegate.ts")
      .then((m) => m.nodeGet("theme"))
      .then((t) => (t === "dark" || t === "light") && applyTheme(t), () => {});
}

function applyTheme(theme: string) {
  document.documentElement.setAttribute("data-theme", theme);
  if (themeIcon) {
    themeIcon.innerHTML = theme === "dark"
      ? renderIcon("sun", { className: "icon-md" })
      : renderIcon("moon", { className: "icon-md" });
  }
  if (themeToggleBtn) {
    themeToggleBtn.title = theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
  }
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    safeStorage.setItem("radica_theme", next); // only a choice is kept: the system default is not
    void import("./delegate.ts").then((m) => m.nodePut("theme", next), () => {});
  });
}

// ---- Colour theme (Identity page): the accent, on top of light / dark ----

const accentSelect = document.getElementById("accent-select") as HTMLSelectElement | null;
function applyAccent(accent: string) {
  if (!accentSelect || !Array.from(accentSelect.options).some((o) => o.value === accent)) accent = ""; // a stored value this version does not know
  if (accent) document.documentElement.setAttribute("data-accent", accent);
  else document.documentElement.removeAttribute("data-accent");
  if (accentSelect) accentSelect.value = accent;
}
if (accentSelect) {
  const savedAccent = safeStorage.getItem("radica_accent");
  applyAccent(savedAccent || "");
  accentSelect.addEventListener("change", () => {
    applyAccent(accentSelect.value);
    safeStorage.setItem("radica_accent", accentSelect.value);
    void import("./delegate.ts").then((m) => m.nodePut("accent", accentSelect.value), () => {});
  });
  // like the theme, the choice is kept on the node too
  if (savedAccent === null)
    void import("./delegate.ts")
      .then((m) => m.nodeGet("accent"))
      .then((a) => a && applyAccent(a), () => {});
}

// ---- Translation language (Identity page) ----

const langSelect = document.getElementById("translate-lang-select") as HTMLSelectElement | null;
function setReaderLang(lang: string) {
  safeStorage.setItem(READER_LANG_KEY, lang);
  if (langSelect) langSelect.value = readerLang();
  cardCache.clear(); // Translate buttons depend on it
  renderTimeline();
}
if (langSelect) {
  langSelect.innerHTML = availableLangs().map((l) => `<option value="${l}">${escapeHtml(LANGS[l])}</option>`).join("");
  langSelect.value = readerLang();
  langSelect.addEventListener("change", () => {
    setReaderLang(langSelect.value);
    void import("./delegate.ts").then((m) => m.nodePut("lang", langSelect.value), () => {});
  });
  // like the theme, the choice is kept on the node too: the sandboxed page storage does not outlive a session
  if (!safeStorage.getItem(READER_LANG_KEY))
    void import("./delegate.ts")
      .then((m) => m.nodeGet("lang"))
      .then((l) => l && LANGS[l] && setReaderLang(l), () => {});
}

// ---- Offensive words (Identity page): masked when reading, the reader's choice ----

const MASK_BAD_WORDS_KEY = "radica_mask_bad_words";
const maskToggle = document.getElementById("mask-bad-words-toggle") as HTMLInputElement | null;
function applyMaskBadWords(on: boolean) {
  safeStorage.setItem(MASK_BAD_WORDS_KEY, on ? "1" : "0");
  setMaskBadWords(on);
  if (maskToggle) maskToggle.checked = on;
  cardCache.clear();
  renderTimeline();
  void rerenderChat();
}
setMaskBadWords(safeStorage.getItem(MASK_BAD_WORDS_KEY) !== "0");
if (maskToggle) {
  maskToggle.checked = safeStorage.getItem(MASK_BAD_WORDS_KEY) !== "0";
  maskToggle.addEventListener("change", () => {
    applyMaskBadWords(maskToggle.checked);
    void import("./delegate.ts").then((m) => m.nodePut("mask-bad-words", maskToggle.checked ? "1" : "0"), () => {});
  });
  // kept on the node too: the sandboxed page storage does not outlive a session
  if (safeStorage.getItem(MASK_BAD_WORDS_KEY) === null)
    void import("./delegate.ts")
      .then((m) => m.nodeGet("mask-bad-words"))
      .then((v) => v === "0" && applyMaskBadWords(false), () => {});
}

// ---- Identity & Key Management Modal ----

function renderIdentityModal() {
  identityCloseBtn.style.display = currentIdentity ? "" : "none"; // nothing to go back to before signing in
  if (!currentIdentity) {
    identityPersonaName.textContent = "Not signed in";
    identityPubkeyVal.textContent = "Choose how to sign in below.";
    identityTypeBadge.className = "identity-badge";
    identityTypeBadge.textContent = "● No identity";
    identityBackupActions.style.display = "none";
    identityVisoActions.style.display = "none";
  } else if (currentIdentity.type === "viso") {
    identityPersonaName.textContent = currentIdentity.personaName || personaName(currentIdentity.pubkey);
    identityPubkeyVal.textContent = currentIdentity.pubkey;
    identityTypeBadge.className = "identity-badge viso";
    identityTypeBadge.textContent = "● Viso Persona";
    identityBackupActions.style.display = "none";
    identityVisoActions.style.display = "flex";
  } else {
    identityPersonaName.textContent = currentIdentity.personaName || personaName(currentIdentity.pubkey);
    identityPubkeyVal.textContent = currentIdentity.pubkey;
    identityTypeBadge.className = "identity-badge local";
    identityTypeBadge.textContent = "● Local Keypair";
    identityBackupActions.style.display = "flex";
    identityVisoActions.style.display = "none";
    idSecretKeyDisplay.style.display = "none";
    idSecretKeyDisplay.textContent = localIdentityKey() || "";
    idShowKeyBtn.innerHTML = `<span class="btn-icon-text">${renderIcon("eye", { className: "icon-sm" })} <span>Show Secret Key</span></span>`;
  }

  visoUrlInput.value = safeStorage.getItem("radica_viso_url") || safeStorage.getItem("spruce_viso_url") || officialViso();
  visoStatusMsg.textContent = "";
  localCreateMsg.textContent = "";
  localImportMsg.textContent = "";
  renderSupporterStatus();
}

function openIdentityModal() {
  renderIdentityModal();
  identityModal.style.display = "flex";
}

if (openIdentityBtn) {
  openIdentityBtn.addEventListener("click", openIdentityModal);
}

identityCloseBtn.addEventListener("click", () => {
  identityModal.style.display = "none";
});

idShowKeyBtn.addEventListener("click", () => {
  if (idSecretKeyDisplay.style.display === "none") {
    idSecretKeyDisplay.style.display = "block";
    idShowKeyBtn.innerHTML = `<span class="btn-icon-text">${renderIcon("eye", { className: "icon-sm" })} <span>Hide Secret Key</span></span>`;
  } else {
    idSecretKeyDisplay.style.display = "none";
    idShowKeyBtn.innerHTML = `<span class="btn-icon-text">${renderIcon("eye", { className: "icon-sm" })} <span>Show Secret Key</span></span>`;
  }
});

idDownloadKeyBtn.addEventListener("click", () => {
  const sk = localIdentityKey();
  if (!sk || !currentIdentity) return;
  const shortName = (currentIdentity.personaName || currentIdentity.pubkey).slice(0, 8);
  const blob = new Blob(
    [`Radica Decentralized Identity Private Key (keep it secret):\n${sk}\n`],
    { type: "text/plain" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `radica-identity-${shortName}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
});

const handleSignOut = async () => {
  const isLocal = currentIdentity?.type === "local";
  if (
    isLocal &&
    !confirm(
      "Signing out deletes this key from this browser. Without your backup file or key, this identity cannot be recovered. Are you sure you want to sign out?"
    )
  ) {
    return;
  }
  await signOut();
  restart();
};

idSignoutBtn.addEventListener("click", handleSignOut);
idVisoSignoutBtn.addEventListener("click", handleSignOut);

visoUseOfficialBtn.addEventListener("click", () => {
  visoUrlInput.value = officialViso();
});

visoSigninBtn.addEventListener("click", async () => {
  try {
    visoStatusMsg.textContent = "Opening Viso...";
    const targetUrl = visoUrlInput.value.trim() || officialViso();
    const connectUrl = await startSignIn(targetUrl);
    goTo(connectUrl);
  } catch (err) {
    console.error("Viso sign-in start failed:", err);
    visoStatusMsg.textContent = (err as Error).message || "Failed to start Viso sign-in.";
  }
});

createNewKeyBtn.addEventListener("click", async () => {
  try {
    if (
      currentIdentity?.type === "local" &&
      !confirm("Generate a new identity keypair? Make sure your current key is backed up first.")
    ) {
      return;
    }
    localCreateMsg.textContent = "Generating...";
    await createLocalIdentity();
    restart();
  } catch (err) {
    localCreateMsg.textContent = (err as Error).message || "Error generating identity.";
  }
});

importKeyBtn.addEventListener("click", async () => {
  try {
    const rawKey = importKeyInput.value.trim();
    if (!rawKey) {
      localImportMsg.textContent = "Please enter 64 hex characters.";
      return;
    }
    localImportMsg.textContent = "Importing...";
    await createLocalIdentity(rawKey);
    restart();
  } catch (err) {
    localImportMsg.textContent = (err as Error).message || "Invalid key format.";
  }
});

// Copy public key to clipboard when clicking on identity pubkey box
identityPubkeyVal.addEventListener("click", () => {
  if (currentIdentity) {
    navigator.clipboard.writeText(currentIdentity.pubkey);
    alert("Public key copied to clipboard!");
  }
});

initGreenhouse({ whoAmI: () => currentIdentity?.pubkey ?? null, displayName: getAuthorDisplayName });

initSupporterPanel({
  whoAmI: () => currentIdentity?.pubkey ?? null,
  displayName: getAuthorDisplayName,
  openLink: openPostLink,
  onBadgeChange: () => {
    lastWotKey = ""; // my own GhostKey proof counts at once
    void refreshSupporters();
  },
});

/** The invite link to a private room: a River room mints one (its owner only), an older room carries its key. */
async function inviteLinkOf(room: PrivateRoom): Promise<string | null> {
  const name = await freenet.getPrivateRoomDecryptedName(currentIdentity!, room);
  if (room.river) return freenet.getRiverInviteLink(currentIdentity!, room).catch((e) => (alert(e.message || e), null));
  const key = await freenet.getPrivateRoomKey(currentIdentity!, room);
  return key ? freenet.getPrivateRoomInviteLink(room, key, name) : null;
}

/** A River invitation code in what was pasted: a bare code, River's `?invitation=` link, or Radica's `#river_invite=`. */
function riverCodeIn(raw: string): string | null {
  const m = /(?:[?#&]invitation=|[#&]river_invite=)([1-9A-HJ-NP-Za-km-z]+)/.exec(raw) ?? /^\s*([1-9A-HJ-NP-Za-km-z]{60,})\s*$/.exec(raw);
  return m ? m[1] : null;
}

/** What an invite link (its fragment) asks to join, or null if it is not one. */
function inviteFromParams(params: URLSearchParams) {
  const roomId = params.get("join_room");
  const name = params.get("name") || "Private Room";
  const creator = params.get("creator") || "";
  const isChannel = params.get("chan") === "1" || params.get("is_channel") === "true";
  const linkedRoomId = params.get("lr") || params.get("linked_room_id") || undefined;
  const owner = params.get("river_owner");
  if (roomId && owner)
    return { roomId, name, creator, keyHex: "", is_channel: isChannel, linked_room_id: linkedRoomId, river: { owner, k: params.get("k") ?? "", member: params.get("m") ?? "", secret: params.get("s") || undefined } };
  const keyHex = params.get("key");
  return roomId && keyHex && keyHex.length === 64 ? { roomId, name, keyHex, creator, is_channel: isChannel, linked_room_id: linkedRoomId } : null;
}
const INVITE_PARAMS = ["join_room", "key", "name", "creator", "river_owner", "k", "m", "s", "river_invite", "room_id", "chan", "is_channel", "lr", "linked_room_id"];

/** Auto-join a private room or broadcast channel from an invite URL string without opening extra tabs. */
async function handleJoinFromInviteUrl(urlStr: string): Promise<boolean> {
  if (!currentIdentity) return false;
  try {
    const raw = urlStr.includes("#")
      ? urlStr.slice(urlStr.indexOf("#") + 1)
      : urlStr.includes("?")
      ? urlStr.slice(urlStr.indexOf("?") + 1)
      : urlStr;
    const params = new URLSearchParams(raw);
    const code = riverCodeIn(urlStr);
    const isChannel = params.get("chan") === "1" || params.get("is_channel") === "true";
    const linkedRoomId = params.get("lr") || params.get("linked_room_id") || undefined;
    const roomIdParam = params.get("room_id") || undefined;
    const creatorParam = params.get("creator") || undefined;
    const nameParam = params.get("name") || undefined;

    const invite = code ? null : inviteFromParams(params);
    if (!code && !invite) return false;

    const room = code
      ? await freenet.joinRiverInvitation(currentIdentity, code, {
          roomId: roomIdParam,
          creator: creatorParam,
          name: nameParam,
          is_channel: isChannel,
          linked_room_id: linkedRoomId,
        })
      : await freenet.joinPrivateRoomFromInvite(currentIdentity, invite!);
    const name = invite?.name ?? (await freenet.getPrivateRoomDecryptedName(currentIdentity, room));

    // Clear the invite fragment parameters from the URL while preserving auth_state if present
    const currentHash = window.location.hash ? window.location.hash.substring(1) : "";
    if (currentHash && (currentHash.includes("join_room=") || currentHash.includes("river_invite="))) {
      const remainingParts = currentHash
        .split("&")
        .filter((p) => p && !INVITE_PARAMS.includes(p.split("=")[0]));
      const cleanHash = remainingParts.length > 0 ? "#" + remainingParts.join("&") : "";
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ __freenet_shell__: true, type: "hash", hash: cleanHash || "#" }, "*");
        }
      } catch {}
      try {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + cleanHash);
      } catch {}
    }
    safeStorage.flush();

    // Open the chat dialog and select the newly joined room
    chatModal.style.display = "flex";
    await selectPrivateRoom(room);
    await renderChatSidebar();
    await messengerChat.refreshInbox();
    showToast(`Successfully joined ${room.is_channel ? "broadcast channel" : "private room"} "${name}"!`, "info");
    return true;
  } catch (err) {
    console.error("Failed to auto-join private room from URL:", err);
    showToast("Failed to join room: " + ((err as Error).message || err), "error");
    return false;
  }
}

// Check URL fragment for private room invite link
async function checkUrlInviteHash() {
  if (!currentIdentity) return;
  const hash = window.location.hash ? window.location.hash.substring(1) : "";
  if (!hash || !(hash.includes("join_room=") || hash.includes("river_invite="))) return;
  await handleJoinFromInviteUrl(window.location.href);
}

// ---- Initialize App ----

// Startup screen: shown until initial local/node setup and first feed paint complete (at most BOOT_MAX_MS)
const BOOT_MAX_MS = 8000;
const bootStep = (msg: string) => {
  const p = document.getElementById("boot-msg");
  if (p) p.textContent = msg;
};
function hideBoot() {
  const el = document.getElementById("boot-screen");
  if (!el || el.classList.contains("done")) return;
  el.classList.add("done");
  setTimeout(() => el.remove(), 400);
}
setTimeout(hideBoot, BOOT_MAX_MS); // never stuck behind it, whatever init does

async function init() {
  initTheme();

  // Check Viso callback in URL query parameters
  const queryParams = new URLSearchParams(window.location.search);
  if (
    queryParams.has("viso") ||
    queryParams.has("whoiam") ||
    (queryParams.has("pk") && queryParams.has("sig"))
  ) {
    try {
      const { persona, replayed } = await finishSignIn(queryParams);
      try {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState(window.history.state, "", cleanUrl);
      } catch {}
      if (!replayed) alert(`Successfully signed in with Viso persona: ${personaName(persona)}!`);
    } catch (err) {
      console.error("Viso sign-in verification error:", err);
      alert("Viso sign-in failed: " + ((err as Error).message || err));
      try {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState(window.history.state, "", cleanUrl);
      } catch {}
    }
  }

  let identity = await getIdentity();
  if (!identity) {
    // page storage was lost (new tab, cleared data): take the key the node kept for a local identity, or the Viso sign-in
    const { nodeGet } = await import("./delegate.ts");
    // the Viso sign-in first: making a local identity clears it, while a local seed stays after signing in with Viso
    const viso = await nodeGet("viso-session");
    const seed = viso ? null : await nodeGet("local-seed");
    if (viso) {
      safeStorage.setItem("radica_session", viso);
      identity = await getIdentity(); // checks the sign-in still names this device's app key
    } else if (seed) {
      try {
        await createLocalIdentity(seed);
        identity = await getIdentity();
      } catch {}
    }
  }
  if (!identity) {
    // first visit: let the visitor choose (Viso, new key, imported key) instead of making an identity for them
    hideBoot();
    openIdentityModal();
    return;
  }
  currentIdentity = identity;
  freenet.setIdentity(currentIdentity);
  conversation.sweepBurns(); // TTL messages burn on time even in chats that stay closed
  freenet.onSyncUpdate(() => conversation.sweepBurns());
  void listsFromNode.then(() => {
    refreshTrustedBlocklists();
    renderTimeline();
  });
  if (certShowsHost(identity.cert))
    showToast("Your Viso sign-in carries your node's address, and it is published with what you post. Sign out and sign in with Viso again to replace it with a generic one.", "warning", 15000);

  // Check if user followed an invite link hash or post permalink hash
  await checkUrlInviteHash();
  window.addEventListener("hashchange", () => checkUrlInviteHash());
  const postLink = window.location.hash; // opened after the node connects: the post may have to come from the network

  // Load Feed to check profile and following
  const myFeed = await freenet.getFeed(currentIdentity.pubkey);
  let savedProfile = myFeed.profile || null;
  if (!savedProfile) {
    const rawSaved = safeStorage.getItem(`radica_profile_${currentIdentity.pubkey}`);
    if (rawSaved) {
      try {
        savedProfile = JSON.parse(rawSaved);
      } catch {}
    }
  }
  currentProfile = savedProfile;
  if (currentProfile) {
    freenet.knownPeers[currentIdentity.pubkey] = {
      display_name: currentProfile.display_name,
      avatar_url: currentProfile.avatar_url,
    };
  }
  followingKeys = myFeed.following || [];

  // Populate UI with identity (Base58 Persona name + shortened pubkey)
  const personaBase58 = currentIdentity.personaName || personaName(currentIdentity.pubkey);
  const shortPersona = personaBase58.length > 10 ? `${personaBase58.slice(0, 10)}...` : personaBase58;
  myPubkeyBadge.textContent = `@${shortPersona}`;
  myPubkeyBadge.title = `Persona: ${personaBase58}\nPubkey: ${currentIdentity.pubkey}\nClick to manage identity`;
  sidebarName.textContent = currentProfile?.display_name || `Persona @${shortPersona}`;
  sidebarBio.textContent = currentProfile?.bio || "No bio yet.";
  if (sidebarHandle) {
    sidebarHandle.textContent = `@${shortPersona}`;
    sidebarHandle.title = `Persona: ${personaBase58}\nClick to open my profile`;
  }
  sidebarAvatar.src = composerAvatar.src = currentProfile?.avatar_url || generateDefaultAvatar(currentIdentity.pubkey);
  sidebarAvatar.onerror = composerAvatar.onerror = function (this: HTMLImageElement) {
    this.src = generateDefaultAvatar(currentIdentity?.pubkey || "radica");
  };

  await updateMyPostsAndScopeCounts();
  renderIdentityModal();
  renderFollowingList();
  renderDiscoveredPeers();
  updateNotificationsBadge();
  void maybeShowWelcome();
  void refreshSupporters();
  // a post I was writing when the page closed
  const draft = safeStorage.getItem(draftKey(currentIdentity.pubkey));
  if (draft && !postCaption.value) postCaption.value = draft;

  // Announce persona to peer network and subscribe to real-time events
  freenet.announceIdentity(currentIdentity, currentProfile);
  let syncBusy = false, syncAgain = false; // passes never overlap: a slow one (decrypt + redraw) queues one rerun instead of piling up
  freenet.onSyncUpdate(async function syncPass() {
    if (syncBusy) { syncAgain = true; return; }
    syncBusy = true;
    try { await syncBody(); } finally { syncBusy = false; if (syncAgain) { syncAgain = false; void syncPass(); } }
  });
  async function syncBody() {
    // my feed can arrive from the network after startup (fresh sandbox, empty local cache): take profile and follows from it
    const mine = await freenet.getFeed(currentIdentity!.pubkey);
    if (mine.profile && (mine.profile.updated_at ?? 0) > (currentProfile?.updated_at ?? 0)) {
      currentProfile = mine.profile;
      sidebarName.textContent = mine.profile.display_name;
      sidebarBio.textContent = mine.profile.bio || "No bio yet.";
      if (mine.profile.avatar_url) sidebarAvatar.src = mine.profile.avatar_url;
      freenet.knownPeers[currentIdentity!.pubkey] = { display_name: mine.profile.display_name, avatar_url: mine.profile.avatar_url };
      void freenet.announceIdentity(currentIdentity!, mine.profile);
      if (welcomeModal.style.display !== "none" && !hasDefaultName()) finishWelcome(); // a returning user: their name came late
    }
    void refreshSupporters(); // the supporters wall may have changed
    if (mine.following?.length && mine.following.length !== followingKeys.length) {
      followingKeys = [...new Set([...followingKeys, ...mine.following])];
    }
    const chatOpen = chatModal.style.display !== "none"; // feed, lists and posts sit behind the chat: redrawn when it closes
    if (!chatOpen) renderFollowingList(); // names and avatars of the people I follow arrive with their feeds
    await yieldToMain(); // a sync pass is many draws: let a click in between be handled and painted first
    [allCommunities, allPrivateRooms] = await Promise.all([
      loadCommunities(),
      freenet.getPrivateRooms(currentIdentity!),
    ]);
    // the chats of my communities, even unopened, so their new messages count as unread (each log is fetched at most
    // once a minute, then followed by its subscription)
    for (const c of joinedCommunities()) void freenet.refreshLog(`community-chat/${c.id}`);
    if (activeCommunity) {
      const refreshed = allCommunities.find((c) => c.id === activeCommunity!.id);
      if (refreshed) {
        activeCommunity = refreshed;
        selectCommunity(activeCommunity, true);
      }
    }
    if (!chatOpen) {
      renderCommunities();
      renderDiscoveredPeers();
    }
    await yieldToMain();
    await freenet.syncCommentedPosts(currentIdentity!);
    const activeRoom = chatModal.style.display !== "none" ? openRoomId() : null;
    const roomsFresh = await freenet.syncRiverRooms(currentIdentity!, activeRoom);
    const dmsFresh = await freenet.syncRiverDms(currentIdentity!);
    const riverFresh = roomsFresh || dmsFresh;
    if (amGlobalMod()) {
      void freenet.refreshLog("reports").then(() => updateBlocklistsBadge());
    }
    await updateNotificationsBadge();
    await yieldToMain();

    // Live update open chat dialog
    if (chatModal.style.display !== "none") {
      if (!activeChatPrivateRoom && !activeChatCommunity && !activeChatPeer) renderChatSidebar(); // the select* below draws it itself
      if (activeChatPrivateRoom) {
        await selectPrivateRoom(activeChatPrivateRoom, true);
      } else if (activeChatCommunity) {
        await selectCommunityRoom(activeChatCommunity, true);
      } else if (activeChatPeer && currentIdentity) {
        await selectChatPeer(activeChatPeer, activeChatSecret, true); // a sync must not turn an open Secret Chat into the plain DM
      }
    }

    if (!chatOpen) await reloadPosts();
  }

  // Load Communities & Private Rooms in parallel
  const [comms, rooms] = await Promise.all([
    loadCommunities(),
    currentIdentity ? freenet.getPrivateRooms(currentIdentity) : Promise.resolve([]),
  ]);
  allCommunities = comms;
  allPrivateRooms = rooms;
  renderCommunities();
  if (currentIdentity) {
    updateChatBadge();
  }
  const ecoFooter = document.getElementById("sidebar-ecosystem-footer");
  if (ecoFooter) ecoFooter.innerHTML = ecosystemFooter(nodeOrigin());

  // Connect to Freenet Node
  bootStep("Connecting to your Freenet node…");
  const connected = await freenet.connect();
  if (connected) {
    void freenet.syncOwnFeed(currentIdentity!); // in background: publish my feed, pick up what my other devices wrote
    freenetDot.classList.add("online");
    freenetStatusLabel.textContent = "Your node is online";
    setChatStatus(true);
  } else {
    freenetDot.classList.remove("online");
    setChatStatus(false);
    freenetStatusLabel.textContent = "Local-First Storage";
    freenetStatusLabel.title = `Freenet node unreachable: ${freenet.connectError}`;
  }
  if (postLink.includes("post=")) void checkUrlPostHash(postLink);

  // Load Timeline (Explore by default so all posts on network are immediately visible)
  bootStep("Loading posts…");
  await reloadPosts();
  if (!timelinePosts.length && connected) {
    bootStep("Fetching new posts from the network…");
    const t0 = Date.now();
    while (!timelinePosts.length && Date.now() - t0 < 3500) await new Promise((r) => setTimeout(r, 150));
  }
  hideBoot();

  if (safeStorage.getItem("radica_open_chat_on_boot") === "1" || queryParams.get("chat") === "messenger") {
    safeStorage.removeItem("radica_open_chat_on_boot");
    safeStorage.setItem(CHAT_LAYOUT_KEY, "messenger");
    openChatBtn.click();
  }
}

init();

