// Radica Mail: Built-in decentralized email client powered by Freenet Mail post-quantum cryptography.
// Manages local mailbox state (Inbox, Sent, Drafts), E2EE message records, reply threading,
// address validation, and interoperability with the official Freenet Mail protocol.

import { safeStorage } from "./storage.ts";
import {
  sanitizeMailAlias,
  encryptFreenetMailV1,
  decryptFreenetMailV1,
  deriveInboxContract,
  deriveInboxContractAddress,
  deriveTokenRecordContractAddress,
  initialInboxState,
  unversionedWasm,
  INBOX_V1_CODE_HASH,
  ADDRESS_CHARS,
  TOKEN_RECORD_V1_CODE_HASH,
  type AftTier,
  type AftTokenAssignment,
  type FreenetMailIdentity,
} from "./freenetMail.ts";
import { fromBase58, toBase58 } from "./whoiam.ts";
import { ContractKey } from "@freenetorg/freenet-stdlib";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

export type MailFolder = "inbox" | "sent" | "drafts" | "contacts";

export interface FmailSendResult {
  success: boolean;
  message?: MailMessage;
  networkDelivered?: boolean;
  networkDetails?: string;
  error?: string;
}

export interface MailContact {
  name: string;        // Friendly display name, e.g. "Alice", "Scobru"
  address: string;     // Full address, e.g. "alice@111111111111111111111111111111111111"
  handle?: string;     // e.g. "@alice" or "alice.fn"
  pubkey?: string;     // Radica persona pubkey if linked
  addedAt: number;
}

export interface RecipientSuggestion {
  displayName: string;
  address: string;
  handle?: string;
  source: "self" | "contact" | "peer";
}

export interface MailMessage {
  id: string;
  from: string; // e.g. "Scobru <scobru@Bx58...>"
  fromAddress: string; // raw address or name@address
  to: string; // recipient address
  subject: string;
  content: string;
  timestamp: number;
  read: boolean;
  folder: MailFolder;
  replyToId?: string;
  threadId?: string;
}

export interface MailStore {
  version: number;
  messages: MailMessage[];
}

const MAIL_STORAGE_PREFIX = "radica_fmail_store_";

export function getMailStorageKey(pubkey: string): string {
  return `${MAIL_STORAGE_PREFIX}${pubkey || "anon"}`;
}

const DELETED_KEY = (pubkey: string) => `radica_fmail_deleted_${pubkey || "anon"}`;

/** Messages deleted locally: a sync must not bring them back from the still-holding network inbox contract. */
function deletedMailIds(pubkey: string): Set<string> {
  try {
    return new Set(JSON.parse(safeStorage.getItem(DELETED_KEY(pubkey)) || "[]"));
  } catch {
    return new Set();
  }
}

function rememberDeletedMailId(pubkey: string, id: string): void {
  const ids = deletedMailIds(pubkey);
  ids.add(id);
  safeStorage.setItem(DELETED_KEY(pubkey), JSON.stringify([...ids].slice(-500)));
  safeStorage.flush();
}

const BLOCKED_KEY = (pubkey: string) => `radica_mail_blocked_${pubkey || "anon"}`;
const INBOX_ID_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * The identity a mail address names: the inbox contract id after the "@". An alias is free text the sender picks,
 * the inbox id is derived from their key, so blocking by it blocks the sender, not one spelling. "" when the
 * address has no inbox id (a local one such as welcome@freenet), which can never be blocked.
 */
export function mailSenderKey(address: string): string {
  const id = (address || "").split("@").pop()!.replace(/[>\s]/g, "");
  return INBOX_ID_RE.test(id) ? id : "";
}

/** Inbox ids of the senders this persona blocked in Radica Mail (local to this persona; never published). */
export function blockedMailSenders(pubkey: string): string[] {
  try {
    const list = JSON.parse(safeStorage.getItem(BLOCKED_KEY(pubkey)) || "[]");
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === "string" && INBOX_ID_RE.test(k)) : [];
  } catch {
    return [];
  }
}

/**
 * Block a sender: their mail is no longer stored, and what is in the inbox now is removed from it. The inbox contract
 * still holds it, so unblocking brings it back on the next sync. Returns how many inbox messages were removed, or
 * null if the address names no inbox (nothing to block).
 */
export function blockMailSender(pubkey: string, address: string): number | null {
  const key = mailSenderKey(address);
  if (!key) return null;
  const blocked = blockedMailSenders(pubkey);
  if (!blocked.includes(key)) {
    safeStorage.setItem(BLOCKED_KEY(pubkey), JSON.stringify([...blocked, key].slice(-500)));
    safeStorage.flush();
  }
  const store = loadMailStore(pubkey);
  const kept = store.messages.filter((m) => !(m.folder === "inbox" && mailSenderKey(m.fromAddress) === key));
  const removed = store.messages.length - kept.length;
  if (removed > 0) saveMailStore(pubkey, { ...store, messages: kept });
  return removed;
}

export function unblockMailSender(pubkey: string, inboxId: string): void {
  safeStorage.setItem(BLOCKED_KEY(pubkey), JSON.stringify(blockedMailSenders(pubkey).filter((k) => k !== inboxId)));
  safeStorage.flush();
}

/**
 * Validate a Freenet Mail address or contact token format.
 * Accepts:
 * - Standard address: `alias@<36-chars base58>` (e.g. `scobru@111111111111111111111111111111111111`)
 * - Bare address: `<36-chars base58>`
 * - Freenet Mail Contact Token: `alias@<32..44-chars base58>` (e.g. `scobru@AceZGzqQkPb5aH4qh6GkUzwh9BSCNcftEiWwd5e3YtGs`)
 * - Bare Contact Token: `<32..44-chars base58>` (e.g. `AceZGzqQkPb5aH4qh6GkUzwh9BSCNcftEiWwd5e3YtGs`)
 * - Raw hex public key: `alias@<64 hex chars>` or bare `<64 hex chars>`
 * - Special local addresses (e.g. `welcome@freenet`, `@official`)
 */
export function isValidMailAddress(address: string): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  if (trimmed === "welcome@freenet" || trimmed.endsWith("@official")) return true;

  // Pattern: optional "alias@" followed by 32..44 Base58 characters OR 64 hex characters
  const fullMatch = trimmed.match(/^([a-zA-Z0-9_\-\.]+@)?([1-9A-HJ-NP-Za-km-z]{32,44}|[0-9a-fA-F]{64})$/);
  return !!fullMatch;
}

/**
 * Normalize an address to extract the clean recipient address.
 * Handles display brackets (`Name <address>`), `fmail:` prefixes, and both
 * multi-line and single-line collapsed Contact Cards (`<inboxAddress> verify: <words>`).
 */
export function normalizeMailAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return "";

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) =>
      l
        .trim()
        .replace(/^fmail:/i, "")
        .replace(/\s*verify:\s*[a-zA-Z\-]+.*$/i, "")
        .trim()
    )
    .filter((l) => l.length > 0 && !l.toLowerCase().startsWith("verify:"));

  for (const line of lines) {
    const bracketMatch = line.match(/<([^>]+)>/);
    const candidate = (bracketMatch ? bracketMatch[1] : line).trim();
    if (isValidMailAddress(candidate)) {
      return candidate;
    }
  }

  const fallback = lines[0] ?? trimmed;
  const match = fallback.match(/<([^>]+)>/);
  return (match ? match[1] : fallback).trim().replace(/^fmail:/i, "");
}

const CONTACTS_STORAGE_PREFIX = "radica_fmail_contacts_";

export function getContactsStorageKey(pubkey: string): string {
  return `${CONTACTS_STORAGE_PREFIX}${pubkey || "anon"}`;
}

export function loadMailContacts(pubkey: string): MailContact[] {
  const key = getContactsStorageKey(pubkey);
  const raw = safeStorage.getItem(key);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveMailContact(
  pubkey: string,
  contact: { name: string; address: string; handle?: string; pubkey?: string }
): MailContact {
  const contacts = loadMailContacts(pubkey);
  const cleanAddr = normalizeMailAddress(contact.address);
  const existingIdx = contacts.findIndex(
    (c) =>
      c.address.toLowerCase() === cleanAddr.toLowerCase() ||
      (contact.pubkey && c.pubkey === contact.pubkey)
  );

  const newContact: MailContact = {
    name: contact.name.trim() || cleanAddr.split("@")[0] || "Contact",
    address: cleanAddr,
    handle: contact.handle?.trim(),
    pubkey: contact.pubkey,
    addedAt: Date.now(),
  };

  if (existingIdx >= 0) {
    contacts[existingIdx] = { ...contacts[existingIdx], ...newContact };
  } else {
    contacts.push(newContact);
  }

  safeStorage.setItem(getContactsStorageKey(pubkey), JSON.stringify(contacts));
  safeStorage.flush();
  return newContact;
}

export function deleteMailContact(pubkey: string, address: string): void {
  const cleanAddr = normalizeMailAddress(address).toLowerCase();
  const contacts = loadMailContacts(pubkey).filter((c) => c.address.toLowerCase() !== cleanAddr);
  safeStorage.setItem(getContactsStorageKey(pubkey), JSON.stringify(contacts));
  safeStorage.flush();
}

/**
 * Resolve an input recipient (address, "@name", contact nickname, token, or peer) to a valid Freenet Mail address.
 */
export function resolveRecipientAddress(
  input: string,
  contacts: MailContact[] = [],
  knownPeers: Record<string, { display_name?: string; fmail_address?: string }> = {}
): { address: string; displayName?: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Direct valid mail address or Freenet Mail contact token format
  const norm = normalizeMailAddress(trimmed);
  if (isValidMailAddress(norm)) {
    const contact = contacts.find((c) => c.address.toLowerCase() === norm.toLowerCase());
    const aliasPart = norm.includes("@") ? norm.split("@")[0] : undefined;
    return { address: norm, displayName: contact?.name || aliasPart };
  }

  // 2. Exact match in saved address book (name or handle)
  const query = trimmed.startsWith("@") ? trimmed.slice(1).toLowerCase() : trimmed.toLowerCase();
  const byContact = contacts.find(
    (c) =>
      c.name.toLowerCase() === query ||
      (c.handle && c.handle.toLowerCase().replace(/^@/, "") === query)
  );
  if (byContact) {
    return { address: byContact.address, displayName: byContact.name };
  }

  // 3. Match in Radica known peers directory
  for (const [pk, peer] of Object.entries(knownPeers)) {
    if (peer.fmail_address && isValidMailAddress(peer.fmail_address)) {
      if (
        peer.display_name?.toLowerCase() === query ||
        pk.toLowerCase() === query
      ) {
        return { address: peer.fmail_address, displayName: peer.display_name };
      }
    }
  }

  return null;
}

/**
 * Parse an imported contact input (which can be a token, alias@token, full address, or Name <address/token>).
 */
export function parseFmailContactInput(
  rawInput: string,
  defaultName?: string
): { name: string; address: string } | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // 1. Check if formatted as "DisplayName <address/token>"
  const bracketMatch = trimmed.match(/^([^<]+)<([^>]+)>/);
  if (bracketMatch) {
    const name = bracketMatch[1].trim();
    const addr = normalizeMailAddress(bracketMatch[2]);
    if (isValidMailAddress(addr)) {
      const aliasPart = addr.includes("@") ? addr.split("@")[0] : undefined;
      return { name: name || defaultName?.trim() || aliasPart || "Contact", address: addr };
    }
  }

  // 2. Direct address or Contact Card token (handles verify: clause & fmail: prefix)
  const norm = normalizeMailAddress(trimmed);
  if (isValidMailAddress(norm)) {
    const aliasPart = norm.includes("@") ? norm.split("@")[0] : undefined;
    return {
      name: defaultName?.trim() || aliasPart || `Contact (${norm.substring(0, 6)}…)`,
      address: norm,
    };
  }

  return null;
}

/**
 * Autocomplete suggestions for recipient input.
 */
export function getRecipientSuggestions(
  query: string,
  myIdentity: FreenetMailIdentity | null,
  contacts: MailContact[] = [],
  knownPeers: Record<string, { display_name?: string; fmail_address?: string }> = {}
): RecipientSuggestion[] {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  const results: RecipientSuggestion[] = [];

  // Suggest self if empty query or matches self
  if (myIdentity) {
    const myFull = `${myIdentity.alias}@${myIdentity.address}`;
    if (!q || "myself me you self test".includes(q) || myIdentity.alias.toLowerCase().includes(q)) {
      results.push({
        displayName: `${myIdentity.alias} (You)`,
        address: myFull,
        handle: `@${myIdentity.alias}`,
        source: "self",
      });
    }
  }

  // Suggest from saved contacts
  const myFull = myIdentity ? `${myIdentity.alias}@${myIdentity.address}`.toLowerCase() : "";
  const myBare = myIdentity ? myIdentity.address.toLowerCase() : "";
  for (const c of contacts) {
    const cAddr = c.address.toLowerCase();
    if (myIdentity && (cAddr === myFull || cAddr === myBare)) continue;
    if (
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      (c.handle && c.handle.toLowerCase().includes(q))
    ) {
      results.push({
        displayName: c.name,
        address: c.address,
        handle: c.handle,
        source: "contact",
      });
    }
  }

  // Suggest from known peers with mail address
  for (const [pk, p] of Object.entries(knownPeers)) {
    if (p.fmail_address && isValidMailAddress(p.fmail_address)) {
      if (
        !q ||
        (p.display_name && p.display_name.toLowerCase().includes(q)) ||
        p.fmail_address.toLowerCase().includes(q)
      ) {
        if (!results.some((r) => r.address.toLowerCase() === p.fmail_address!.toLowerCase())) {
          results.push({
            displayName: p.display_name || "Peer",
            address: p.fmail_address,
            handle: p.display_name ? `@${p.display_name}` : undefined,
            source: "peer",
          });
        }
      }
    }
  }

  return results;
}

/**
 * Cleanly derive a human-readable mail alias/handle.
 * Prevents raw base58 public keys from becoming the alias.
 */
export function resolveMailAlias(
  pubkey: string,
  personaBase58?: string,
  displayName?: string
): string {
  // 1. Explicitly saved alias in localStorage
  const saved = safeStorage.getItem(`radica_mail_alias_${pubkey}`);
  if (saved && saved.trim()) {
    const sanitized = sanitizeMailAlias(saved);
    if (sanitized) return sanitized;
  }

  // 2. Profile display name
  if (displayName) {
    const trimmed = displayName.trim();
    if (!trimmed.toLowerCase().startsWith("persona @") && !trimmed.toLowerCase().startsWith("persona_")) {
      const sanitized = sanitizeMailAlias(trimmed);
      if (sanitized) return sanitized;
    }
  }

  // 3. Fallback: clean short user id
  return `user_${pubkey.substring(0, 6)}`;
}

const WELCOMED_KEY = (pubkey: string) => `radica_mail_welcomed_${pubkey}`;

/**
 * Load the mail store for a given persona, or initialize it with the welcome mail.
 */
export function loadMailStore(pubkey: string, identity?: FreenetMailIdentity | null): MailStore {
  const key = getMailStorageKey(pubkey);
  const raw = safeStorage.getItem(key);

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MailStore;
      if (Array.isArray(parsed?.messages)) {
        if (parsed.messages.some((m) => m.id === "welcome_radica_mail" || m.id.startsWith("welcome_"))) {
          safeStorage.setItem(WELCOMED_KEY(pubkey), "true");
        }
        return parsed;
      }
    } catch (err) {
      console.warn("[MailClient] Failed to parse mail store:", err);
    }
  }

  // First time initialization: inject welcome mail
  const store: MailStore = {
    version: 1,
    messages: [],
  };

  const alreadyWelcomed = safeStorage.getItem(WELCOMED_KEY(pubkey)) === "true";

  if (identity && !alreadyWelcomed) {
    const myAddr = `${identity.alias}@${identity.inboxAddress || identity.address}`;
    const welcomeMail: MailMessage = {
      id: "welcome_radica_mail",
      from: "Freenet Mail <welcome@official>",
      fromAddress: "welcome@official",
      to: myAddr,
      subject: "🌱 Welcome to Radica Mail — Post-Quantum Decentralized Email",
      content: `Welcome to Radica Mail!

Your mailbox is powered by Freenet Mail post-quantum cryptography (ML-DSA-65 signatures and ML-KEM-768 encryption).

Your public decentralized email address is:
${myAddr}

Key Capabilities:
• End-to-End Post-Quantum Security: All communications follow NIST FIPS 203 (ML-KEM-768) and FIPS 204 (ML-DSA-65) standards.
• Zero Vendor Lock-in: You can export your recovery key (fmail-key-1:...) or backup JSON from Identity & Key Management, and open this exact same inbox in the official Freenet Mail app.
• Direct Reading & Replying: Compose messages to any Freenet Mail address, reply to threads, and manage your inbox seamlessly right inside Radica.

Happy decentralized messaging!`,
      timestamp: Date.now(),
      read: false,
      folder: "inbox",
    };
    store.messages.push(welcomeMail);
    safeStorage.setItem(WELCOMED_KEY(pubkey), "true");
    saveMailStore(pubkey, store);
  }

  return store;
}

/**
 * Persist the mail store to local safe storage.
 */
export function saveMailStore(pubkey: string, store: MailStore): void {
  const key = getMailStorageKey(pubkey);
  safeStorage.setItem(key, JSON.stringify(store));
  safeStorage.flush();
}

/**
 * Filter messages by folder and search term.
 */
export function filterMailMessages(messages: MailMessage[], folder: MailFolder, search = ""): MailMessage[] {
  let list = messages.filter((m) => m.folder === folder);

  const q = search.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.from.toLowerCase().includes(q) ||
        m.to.toLowerCase().includes(q)
    );
  }

  // Sort newest first
  return list.sort((a, b) => b.timestamp - a.timestamp);
}

const AFT_ASSIGNMENTS_PREFIX = "radica_fmail_aft_assignments_";

function loadAftAssignments(inboxAddress: string): AftTokenAssignment[] {
  if (!inboxAddress) return [];
  try {
    const parsed = JSON.parse(safeStorage.getItem(`${AFT_ASSIGNMENTS_PREFIX}${inboxAddress}`) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAftAssignments(inboxAddress: string, assignments: AftTokenAssignment[]): void {
  if (!inboxAddress) return;
  const deduped: AftTokenAssignment[] = [];
  const seen = new Set<string>();
  for (const a of assignments) {
    if (!a || !a.tier || !a.time_slot) continue;
    const key = `${a.tier}:${Math.floor(Date.parse(a.time_slot) / 1000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }
  safeStorage.setItem(`${AFT_ASSIGNMENTS_PREFIX}${inboxAddress}`, JSON.stringify(deduped.slice(-200)));
  safeStorage.flush();
}

function bytesEqual(a: unknown, b: Uint8Array): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Resolve a full sender email address (`alias@inboxAddress`) and display string
 * using the decrypted `from` label and the outer message's 1952-byte ML-DSA-65 `sender_vk`.
 * When `sender_vk` is present, its derived inbox address is ALWAYS authoritative so an
 * attacker cannot spoof `admin@official` or bypass sender blocklists via inner `from` text.
 */
export function resolveFreemailSenderAddress(
  rawFrom: string,
  senderVk?: number[] | Uint8Array | null
): { fromAddress: string; fromDisplay: string } {
  const cleanRaw = (rawFrom || "").trim();

  const vkBytes =
    senderVk instanceof Uint8Array
      ? senderVk
      : Array.isArray(senderVk) && senderVk.length === 1952
        ? new Uint8Array(senderVk)
        : null;
  if (vkBytes && vkBytes.length === 1952) {
    const senderInbox = deriveInboxContractAddress(vkBytes);
    const extracted = normalizeMailAddress(cleanRaw);
    const rawLocal = extracted.includes("@") ? extracted.split("@")[0] : cleanRaw;
    const isBareInbox = rawLocal === senderInbox || (!cleanRaw.includes("@") && cleanRaw.length >= 43);
    const alias = isBareInbox ? "user" : (sanitizeMailAlias(rawLocal) || "user");
    const fullAddress = `${alias}@${senderInbox}`;
    return { fromAddress: fullAddress, fromDisplay: fullAddress };
  }

  if (cleanRaw.includes("@")) {
    const candidate = normalizeMailAddress(cleanRaw);
    if (isValidMailAddress(candidate)) {
      return { fromAddress: candidate, fromDisplay: candidate };
    }
  }

  if (!cleanRaw.includes("@") && cleanRaw.length >= 43 && cleanRaw.length <= 44) {
    const fullAddress = `user@${cleanRaw}`;
    return { fromAddress: fullAddress, fromDisplay: fullAddress };
  }

  const fallback = cleanRaw || "unknown";
  return {
    fromAddress: fallback,
    fromDisplay: fallback.includes("@") ? fallback : `${fallback} <${fallback}>`,
  };
}

/**
 * Count unread messages in the inbox.
 */
export function getUnreadMailCount(messages: MailMessage[]): number {
  return messages.filter((m) => m.folder === "inbox" && !m.read).length;
}

/**
 * Make sure the sender's AFT token-allocation-record contract exists on the network, with the token this message
 * spends in it. The inbox contract checks that token against the record, and the node that takes the update fetches
 * that record from the network (`MissingContracts` otherwise: the "missing contracts" error when mailing another
 * node). Freenet Mail's own UI publishes it at identity creation; Radica only derived its address, so a Radica
 * sender's record never existed anywhere and mail left the sending node only by luck. Best effort: a refused
 * publish is returned as a note, never thrown, so the send is still attempted.
 * `freenet` is the Freenet client (`appContract`, `putAppContract`, `updateAppContract`, `tokenRecordCode`); without
 * those (tests, offline) there is nothing to publish to and this does nothing.
 */
export async function ensureTokenRecordPublished(
  freenet: any,
  senderDsaVk: Uint8Array,
  tokenAllocationRecordJson: string
): Promise<string | null> {
  if (!freenet?.appContract || !freenet.putAppContract || !freenet.updateAppContract || !freenet.tokenRecordCode) return null;
  try {
    const rec = deriveTokenRecordContractAddress(senderDsaVk);
    const key = new ContractKey(rec.instanceBytes, fromBase58(TOKEN_RECORD_V1_CODE_HASH));
    const state = new TextEncoder().encode(tokenAllocationRecordJson);
    const held = await freenet.appContract(rec.address);
    if (held) {
      await freenet.updateAppContract(key, state); // the contract merges a whole record sent as an update
    } else {
      await freenet.putAppContract(key, unversionedWasm(await freenet.tokenRecordCode()), rec.paramsBytes, state);
    }
    return null;
  } catch (err: any) {
    console.warn("[MailClient] token record publish:", err);
    return `Could not publish the sender's token record (${err?.message || err}); the recipient's node may report missing contracts.`;
  }
}

/**
 * Make sure this identity's own inbox contract exists on the network. Freenet Mail PUTs it when it creates an
 * identity; Radica only derived its address, so nobody could import a Radica address as a contact (the GET finds no
 * contract) or deliver to it. Called when a sync finds no inbox: PUTs the signed empty inbox. Best effort, like the
 * token record: a refused PUT is returned as a note, never thrown.
 */
export async function ensureInboxPublished(freenet: any, identity: FreenetMailIdentity): Promise<string | null> {
  if (!freenet?.putAppContract || !freenet.inboxCode) return null;
  try {
    const inbox = deriveInboxContract(identity.dsaVk);
    const key = new ContractKey(inbox.instanceBytes, fromBase58(INBOX_V1_CODE_HASH));
    await freenet.putAppContract(key, unversionedWasm(await freenet.inboxCode()), inbox.paramsBytes, initialInboxState(identity));
    return null;
  } catch (err: any) {
    console.warn("[MailClient] inbox publish:", err);
    return `Could not publish your inbox (${err?.message || err}); others cannot add or mail this address yet.`;
  }
}

/**
 * Send an email message, store it, and optionally dispatch real post-quantum E2EE delivery
 * to the recipient's Freenet Mail inbox contract on the Freenet network.
 */
export async function sendMailMessage(
  pubkey: string,
  identity: FreenetMailIdentity,
  to: string,
  subject: string,
  content: string,
  replyToId?: string,
  knownPeers: Record<string, { display_name?: string; fmail_address?: string }> = {},
  freenet?: any
): Promise<FmailSendResult> {
  let cleanTo = normalizeMailAddress(to);
  if (!cleanTo) {
    return { success: false, error: "Recipient address cannot be empty." };
  }

  // Resolve recipient if given as a contact name, handle, or peer name
  const contacts = loadMailContacts(pubkey);
  const resolved = resolveRecipientAddress(cleanTo, contacts, knownPeers);
  if (resolved) {
    cleanTo = resolved.address;
  } else if (!isValidMailAddress(cleanTo)) {
    return {
      success: false,
      error: `Could not resolve recipient "${cleanTo}". Please enter a valid Freenet Mail address or contact token.`,
    };
  }

  // a 36-char address is Freenet Mail's newer (inbox v2) format: Radica delivers only to v1 inboxes (44 chars), so
  // such a mail would never leave this device. Say so instead of filing it in Sent.
  const target = cleanTo.includes("@") ? cleanTo.split("@")[1] : cleanTo;
  if (target.length === ADDRESS_CHARS && target !== identity.address) {
    return {
      success: false,
      error: "That is a 36-character Freenet Mail v2 address, which Radica Mail cannot deliver to yet. Use their Inbox Address instead (alias@ followed by 44 characters, shown in their Mail header and contact card).",
    };
  }

  if (!subject.trim()) {
    return { success: false, error: "Subject cannot be empty." };
  }
  if (!content.trim()) {
    return { success: false, error: "Message content cannot be empty." };
  }

  const store = loadMailStore(pubkey, identity);
  const now = Date.now();
  const msgId = `mail_${now}_${Math.random().toString(36).substring(2, 9)}`;
  const myFullAddress = `${identity.alias}@${identity.inboxAddress || identity.address}`;

  const sentMessage: MailMessage = {
    id: msgId,
    from: `${identity.alias} <${myFullAddress}>`,
    fromAddress: myFullAddress,
    to: cleanTo,
    subject: subject.trim(),
    content: content.trim(),
    timestamp: now,
    read: true,
    folder: "sent",
    replyToId,
    threadId: replyToId ? (store.messages.find((m) => m.id === replyToId)?.threadId || replyToId) : msgId,
  };

  store.messages.push(sentMessage);

  // Auto-learn contact if not already saved
  if (cleanTo.includes("@") && !cleanTo.endsWith("@official") && cleanTo !== myFullAddress) {
    const aliasPart = cleanTo.split("@")[0];
    saveMailContact(pubkey, {
      name: resolved?.displayName || aliasPart,
      address: cleanTo,
    });
  }

  // If user sent email to their own address, immediately deliver to Inbox as well!
  const isSelf =
    cleanTo === myFullAddress ||
    cleanTo === identity.address ||
    cleanTo.endsWith(`@${identity.address}`) ||
    (identity.inboxAddress && (cleanTo === identity.inboxAddress || cleanTo.endsWith(`@${identity.inboxAddress}`)));

  if (isSelf) {
    const inboxCopy: MailMessage = {
      ...sentMessage,
      id: `inbox_${now}_${Math.random().toString(36).substring(2, 9)}`,
      folder: "inbox",
      read: false,
    };
    store.messages.push(inboxCopy);
  }

  saveMailStore(pubkey, store);

  // Attempt real network delivery if sending to a native Freenet Mail contract (32-byte Base58 = 43..44 chars)
  let targetContractId = cleanTo;
  if (targetContractId.includes("@")) {
    targetContractId = targetContractId.split("@")[1];
  }

  let networkDelivered = false;
  let networkDetails = "Stored in local mailbox.";

  const getContractFn = freenet ? (freenet.getByInstance || freenet.appContract) : undefined;
  const updateContractFn = freenet ? (freenet.updateRaw || freenet.updateAppContract) : undefined;
  const updateRelatedFn = freenet
    ? (freenet.updateRawRelatedStateAndDelta || freenet.updateAppContractWithRelated)
    : undefined;

  if (targetContractId.length >= 43 && targetContractId.length <= 44 && getContractFn && (updateRelatedFn || updateContractFn)) {
    try {
      const raw = await getContractFn.call(freenet, targetContractId, true); // fetchCode: this node may never have held the recipient's inbox contract, and an UPDATE needs its WASM cached locally
      if (raw) {
        const inboxObj = JSON.parse(new TextDecoder().decode(raw));
        if (inboxObj && Array.isArray(inboxObj.owner_ek_bytes) && inboxObj.owner_ek_bytes.length > 0) {
          const recipientEk = new Uint8Array(inboxObj.owner_ek_bytes);
          const rawTier = inboxObj?.settings?.minimum_tier;
          const requiredTier: AftTier = typeof rawTier === "string" ? (rawTier as AftTier) : "Min10";

          const cachedAssignments = loadAftAssignments(identity.inboxAddress);
          const existingOnInbox: AftTokenAssignment[] = Array.isArray(inboxObj.messages)
            ? inboxObj.messages
                .filter((m: any) => bytesEqual(m?.sender_vk, identity.dsaVk) && m?.token_assignment)
                .map((m: any) => m.token_assignment as AftTokenAssignment)
            : [];
          const existingAssignments = [...cachedAssignments, ...existingOnInbox];

          // For network delivery to native Freenet Mail inbox contracts, the 'from' field
          // in the plaintext DecryptedMessage MUST be the sender's 44-character native inbox
          // contract address (or contact token). Native Freemail populates the recipient on
          // "Reply" directly from 'message.from'. If it contains only a local persona alias,
          // native Freemail cannot resolve it and replies fail.
          const senderFrom = identity.inboxAddress || identity.alias;
          const encrypted = encryptFreenetMailV1(
            recipientEk,
            identity.dsaSk,
            identity.dsaVk,
            targetContractId,
            subject,
            content,
            senderFrom,
            { tier: requiredTier, existingAssignments }
          );

          if (identity.inboxAddress) {
            saveAftAssignments(identity.inboxAddress, [...existingAssignments, encrypted.tokenAssignment]);
          }

          const key = new ContractKey(fromBase58(targetContractId), fromBase58(INBOX_V1_CODE_HASH));
          const recordNote = await ensureTokenRecordPublished(freenet, identity.dsaVk, encrypted.tokenAllocationRecordJson);
          if (updateRelatedFn) {
            await updateRelatedFn.call(
              freenet,
              key,
              encrypted.tokenRecordInstanceBytes,
              new TextEncoder().encode(encrypted.tokenAllocationRecordJson),
              new TextEncoder().encode(encrypted.deltaJson)
            );
          } else {
            await updateContractFn!.call(freenet, key, new TextEncoder().encode(encrypted.deltaJson));
          }
          networkDelivered = true;
          networkDetails = "Delivered to recipient's Freenet Mail inbox contract on the network." + (recordNote ? ` ${recordNote}` : "");
        } else {
          networkDetails = "Recipient inbox contract found, but has no valid post-quantum encapsulation key.";
        }
      } else {
        networkDetails = "Recipient inbox contract not found on the network (they may need to open Freenet Mail once with their Recovery Key to publish their inbox).";
      }
    } catch (netErr: any) {
      console.warn("[MailClient] Network send attempt:", netErr);
      networkDetails = `Network dispatch note: ${netErr?.message || netErr}`;
    }
  } else if (targetContractId.length >= 43 && targetContractId.length <= 44) {
    networkDetails = "Freenet network client offline or not ready. Message stored locally in Sent.";
  } else if (!isSelf && !cleanTo.endsWith("@official")) {
    networkDetails = "Recipient address is not a 44-char Inbox Address. Ask them for their Inbox Address (Tokens & Keys) to deliver over the network. Stored in local mailbox.";
  }

  return {
    success: true,
    message: sentMessage,
    networkDelivered,
    networkDetails,
  };
}

/**
 * Sync incoming messages from the native Freenet Mail inbox contract on the network.
 */
export async function syncFreenetMailInbox(
  pubkey: string,
  identity: FreenetMailIdentity,
  freenet: any
): Promise<{ newCount: number; error?: string }> {
  const getContractFn = freenet ? (freenet.getByInstance || freenet.appContract) : undefined;
  if (!getContractFn) {
    return { newCount: 0, error: "Freenet network client not available." };
  }
  if (!identity.inboxAddress) {
    return { newCount: 0, error: "Inbox contract address not available." };
  }

  try {
    let rawState: Uint8Array | null;
    try {
      rawState = await getContractFn.call(freenet, identity.inboxAddress);
    } catch (err: any) {
      // a GET for a contract nobody holds can time out instead of answering "not found": publish anyway, since a
      // PUT of an inbox that does exist only merges into it (same owner, no messages)
      const note = await ensureInboxPublished(freenet, identity);
      return { newCount: 0, error: note ?? `Could not read your inbox (${err?.message || err}).` };
    }
    if (!rawState) {
      // no inbox on the network yet: publish it, so this address can be imported and mailed
      const note = await ensureInboxPublished(freenet, identity);
      return note ? { newCount: 0, error: note } : { newCount: 0 };
    }

    const parsedInbox = JSON.parse(new TextDecoder().decode(rawState));
    if (!parsedInbox || !Array.isArray(parsedInbox.messages) || parsedInbox.messages.length === 0) {
      return { newCount: 0 };
    }

    const store = loadMailStore(pubkey, identity);
    const deletedIds = deletedMailIds(pubkey);
    const blocked = new Set(blockedMailSenders(pubkey));
    let newCount = 0;
    let updatedExisting = false;

    for (const msg of parsedInbox.messages) {
      if (!msg.content || !Array.isArray(msg.content)) continue;
      if (!Array.isArray(msg.sender_vk) || msg.sender_vk.length !== 1952) continue;
      if (!Array.isArray(msg.signature) || msg.signature.length === 0) continue;
      const contentBytes = new Uint8Array(msg.content);
      const vkBytes = new Uint8Array(msg.sender_vk);
      const sigBytes = new Uint8Array(msg.signature);
      let sigOk = false;
      try {
        sigOk = ml_dsa65.verify(sigBytes, contentBytes, vkBytes);
      } catch {
        sigOk = false;
      }
      if (!sigOk) continue;

      const dec = decryptFreenetMailV1(identity.kemDk, contentBytes);
      if (!dec) continue;

      const assignHash = msg.token_assignment?.assignment_hash
        ? toBase58(new Uint8Array(msg.token_assignment.assignment_hash))
        : undefined;

      const msgId = assignHash ? `fmail_${assignHash}` : `fmail_${dec.time}_${dec.from}`;
      if (deletedIds.has(msgId)) continue; // deleted locally: the contract still holds it, don't bring it back

      const { fromAddress, fromDisplay } = resolveFreemailSenderAddress(dec.from, msg.sender_vk);
      if (blocked.has(mailSenderKey(fromAddress))) continue; // a blocked sender: not stored, so no badge, no notification

      // Check if already in store (and repair bare sender addresses synced before sender_vk derivation)
      const existing = store.messages.find(
        (m) =>
          m.id === msgId ||
          (m.subject === dec.title &&
            m.content === dec.content &&
            (m.from.includes(dec.from) || m.fromAddress === fromAddress))
      );
      if (existing) {
        if (
          fromAddress.includes("@") &&
          (!existing.fromAddress.includes("@") || !isValidMailAddress(existing.fromAddress))
        ) {
          existing.fromAddress = fromAddress;
          existing.from = fromDisplay;
          updatedExisting = true;
        }
        continue;
      }

      const newMsg: MailMessage = {
        id: msgId,
        from: fromDisplay,
        fromAddress,
        to: `${identity.alias}@${identity.inboxAddress}`,
        subject: dec.title,
        content: dec.content,
        timestamp: new Date(dec.time).getTime() || Date.now(),
        read: false,
        folder: "inbox",
        threadId: dec.thread_id,
        replyToId: dec.in_reply_to,
      };

      store.messages.push(newMsg);
      newCount++;
    }

    if (newCount > 0 || updatedExisting) {
      saveMailStore(pubkey, store);
    }

    return { newCount };
  } catch (err: any) {
    console.warn("[MailClient] syncFreenetMailInbox error:", err);
    return { newCount: 0, error: err?.message || String(err) };
  }
}

/**
 * Save an email draft.
 */
export function saveDraftMessage(
  pubkey: string,
  identity: FreenetMailIdentity,
  to: string,
  subject: string,
  content: string,
  existingDraftId?: string
): MailMessage {
  const store = loadMailStore(pubkey, identity);
  const now = Date.now();
  const myFullAddress = `${identity.alias}@${identity.inboxAddress || identity.address}`;

  if (existingDraftId) {
    const idx = store.messages.findIndex((m) => m.id === existingDraftId && m.folder === "drafts");
    if (idx >= 0) {
      store.messages[idx].to = to;
      store.messages[idx].subject = subject;
      store.messages[idx].content = content;
      store.messages[idx].timestamp = now;
      saveMailStore(pubkey, store);
      return store.messages[idx];
    }
  }

  const draft: MailMessage = {
    id: `draft_${now}_${Math.random().toString(36).substring(2, 9)}`,
    from: `${identity.alias} <${myFullAddress}>`,
    fromAddress: myFullAddress,
    to: to.trim(),
    subject: subject.trim() || "(No subject)",
    content: content.trim(),
    timestamp: now,
    read: true,
    folder: "drafts",
  };

  store.messages.push(draft);
  saveMailStore(pubkey, store);
  return draft;
}

/**
 * Delete a message by ID.
 */
export function deleteMailMessage(pubkey: string, id: string): boolean {
  const store = loadMailStore(pubkey);
  const prevLen = store.messages.length;
  store.messages = store.messages.filter((m) => m.id !== id);
  if (store.messages.length !== prevLen) {
    rememberDeletedMailId(pubkey, id); // a sync must not re-import it from the network inbox contract
    saveMailStore(pubkey, store);
    return true;
  }
  return false;
}

/**
 * Toggle or set the read status of a message.
 */
export function setMailReadStatus(pubkey: string, id: string, read: boolean): boolean {
  const store = loadMailStore(pubkey);
  const msg = store.messages.find((m) => m.id === id);
  if (msg) {
    msg.read = read;
    saveMailStore(pubkey, store);
    return true;
  }
  return false;
}

/**
 * Format a timestamp into a human-readable mail date/time.
 */
export function formatMailDate(timestamp: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();

  // If today: format time "HH:MM"
  if (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  ) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // If this year: format "Month Day" (e.g. "Nov 11")
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  // Otherwise: format "MM/DD/YYYY"
  return date.toLocaleDateString([], { year: "numeric", month: "numeric", day: "numeric" });
}

/**
 * Build a reply template with quote headers.
 */
export function buildReplyDraft(original: MailMessage): { to: string; subject: string; content: string } {
  const cleanSubject = original.subject.startsWith("Re:") ? original.subject : `Re: ${original.subject}`;
  const dateStr = new Date(original.timestamp).toLocaleString();
  const senderStr = original.from || original.fromAddress;

  const quotedLines = original.content
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  const replyBody = `\n\nOn ${dateStr}, ${senderStr} wrote:\n${quotedLines}`;

  return {
    to: original.fromAddress || original.from,
    subject: cleanSubject,
    content: replyBody,
  };
}
