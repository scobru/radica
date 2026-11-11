// Radica Mail: Built-in decentralized email client powered by Freenet Mail post-quantum cryptography.
// Manages local mailbox state (Inbox, Sent, Drafts), E2EE message records, reply threading,
// address validation, and interoperability with the official Freenet Mail protocol.

import { safeStorage } from "./storage.ts";
import type { FreenetMailIdentity } from "./freenetMail.ts";

export type MailFolder = "inbox" | "sent" | "drafts";

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

/**
 * Validate a Freenet Mail address format.
 * Accepts:
 * - Full address: `alias@<36-chars base58>` (e.g. `scobru@111111111111111111111111111111111111`)
 * - Bare address: `<36-chars base58>`
 * - Special local addresses (e.g. `welcome@freenet`)
 */
export function isValidMailAddress(address: string): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  if (trimmed === "welcome@freenet" || trimmed.endsWith("@official")) return true;

  // Pattern: optional "alias@" followed by 36 alphanumeric characters (Base58)
  const fullMatch = trimmed.match(/^([a-zA-Z0-9_\-\.]+@)?([1-9A-HJ-NP-Za-km-z]{36})$/);
  return !!fullMatch;
}

/**
 * Normalize an address to extract the clean recipient address.
 */
export function normalizeMailAddress(address: string): string {
  const trimmed = address.trim();
  const match = trimmed.match(/<([^>]+)>/);
  return match ? match[1].trim() : trimmed;
}

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

  if (identity) {
    const welcomeMail: MailMessage = {
      id: `welcome_${Date.now()}`,
      from: "Freenet Mail <welcome@official>",
      fromAddress: "welcome@official",
      to: `${identity.alias}@${identity.address}`,
      subject: "🌱 Welcome to Radica Mail — Post-Quantum Decentralized Email",
      content: `Welcome to Radica Mail!

Your mailbox is powered by Freenet Mail post-quantum cryptography (ML-DSA-65 signatures and ML-KEM-768 encryption).

Your public decentralized email address is:
${identity.alias}@${identity.address}

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

/**
 * Count unread messages in the inbox.
 */
export function getUnreadMailCount(messages: MailMessage[]): number {
  return messages.filter((m) => m.folder === "inbox" && !m.read).length;
}

/**
 * Send an email message and store it. If sending to self, also copies to inbox.
 */
export function sendMailMessage(
  pubkey: string,
  identity: FreenetMailIdentity,
  to: string,
  subject: string,
  content: string,
  replyToId?: string
): { success: boolean; message?: MailMessage; error?: string } {
  const cleanTo = normalizeMailAddress(to);
  if (!cleanTo) {
    return { success: false, error: "Recipient address cannot be empty." };
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
  const myFullAddress = `${identity.alias}@${identity.address}`;

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

  // If user sent email to their own address, immediately deliver to Inbox as well!
  const isSelf =
    cleanTo === myFullAddress ||
    cleanTo === identity.address ||
    cleanTo.endsWith(`@${identity.address}`);

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
  return { success: true, message: sentMessage };
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
  const myFullAddress = `${identity.alias}@${identity.address}`;

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
