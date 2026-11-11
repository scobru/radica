import test from "node:test";
import assert from "node:assert/strict";
import {
  loadMailStore,
  saveMailStore,
  filterMailMessages,
  getUnreadMailCount,
  sendMailMessage,
  saveDraftMessage,
  deleteMailMessage,
  setMailReadStatus,
  formatMailDate,
  buildReplyDraft,
  isValidMailAddress,
  normalizeMailAddress,
  loadMailContacts,
  saveMailContact,
  deleteMailContact,
  resolveRecipientAddress,
  getRecipientSuggestions,
  resolveMailAlias,
  type MailMessage,
} from "../src/mailClient.ts";
import type { FreenetMailIdentity } from "../src/freenetMail.ts";

const mockIdentity: FreenetMailIdentity = {
  alias: "alice",
  address: "111111111111111111111111111111111111",
  recoveryKey: "fmail-key-1:dummy",
  seeds: { mlDsaSeed: new Uint8Array(32), mlKemSeed: new Uint8Array(64) },
  dsaVk: new Uint8Array(32),
  kemEk: new Uint8Array(32),
};

test("isValidMailAddress: checks various address formats", () => {
  assert.equal(isValidMailAddress("welcome@freenet"), true);
  assert.equal(isValidMailAddress("support@official"), true);
  assert.equal(isValidMailAddress("bob@111111111111111111111111111111111111"), true);
  assert.equal(isValidMailAddress("111111111111111111111111111111111111"), true);
  assert.equal(isValidMailAddress("invalid address"), false);
  assert.equal(isValidMailAddress("bob@short"), false);
  assert.equal(isValidMailAddress(""), false);
});

test("normalizeMailAddress: extracts address from angle brackets", () => {
  assert.equal(normalizeMailAddress("Alice <alice@test36chars111111111111111111111111>"), "alice@test36chars111111111111111111111111");
  assert.equal(normalizeMailAddress("  bob@test  "), "bob@test");
});

test("loadMailStore: initializes empty store with welcome message if identity provided", () => {
  const pubkey = "test_user_pubkey_1";
  const store = loadMailStore(pubkey, mockIdentity);

  assert.equal(store.version, 1);
  assert.equal(store.messages.length, 1);
  assert.equal(store.messages[0].folder, "inbox");
  assert.equal(store.messages[0].subject.includes("Welcome to Radica Mail"), true);
  assert.equal(store.messages[0].read, false);
});

test("sendMailMessage: stores in sent folder and handles self-send to inbox", () => {
  const pubkey = "test_user_pubkey_2";
  loadMailStore(pubkey, mockIdentity);

  // Send to someone else (different address)
  const res1 = sendMailMessage(
    pubkey,
    mockIdentity,
    "bob@222222222222222222222222222222222222",
    "Hello Bob",
    "Meeting at noon"
  );
  assert.equal(res1.success, true);
  assert.equal(res1.message?.folder, "sent");

  // Send to self
  const res2 = sendMailMessage(
    pubkey,
    mockIdentity,
    `alice@${mockIdentity.address}`,
    "Note to self",
    "Remember to backup keys"
  );
  assert.equal(res2.success, true);

  const updated = loadMailStore(pubkey);
  const inboxMails = updated.messages.filter((m) => m.folder === "inbox");
  const sentMails = updated.messages.filter((m) => m.folder === "sent");

  // Inbox should have welcome + note to self
  assert.equal(inboxMails.length, 2);
  // Sent should have hello bob + note to self
  assert.equal(sentMails.length, 2);
});

test("saveDraftMessage: creates and updates drafts", () => {
  const pubkey = "test_user_pubkey_3";
  const draft = saveDraftMessage(pubkey, mockIdentity, "charlie@test", "Draft title", "Draft content");
  assert.equal(draft.folder, "drafts");

  // Update existing draft
  const updated = saveDraftMessage(pubkey, mockIdentity, "charlie@test", "Updated title", "Updated content", draft.id);
  assert.equal(updated.id, draft.id);
  assert.equal(updated.subject, "Updated title");

  const store = loadMailStore(pubkey);
  const drafts = store.messages.filter((m) => m.folder === "drafts");
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].subject, "Updated title");
});

test("deleteMailMessage and setMailReadStatus: modify mail state correctly", () => {
  const pubkey = "test_user_pubkey_4";
  const store = loadMailStore(pubkey, mockIdentity);
  const welcomeId = store.messages[0].id;

  assert.equal(getUnreadMailCount(store.messages), 1);

  // Mark as read
  setMailReadStatus(pubkey, welcomeId, true);
  const storeAfterRead = loadMailStore(pubkey);
  assert.equal(storeAfterRead.messages[0].read, true);
  assert.equal(getUnreadMailCount(storeAfterRead.messages), 0);

  // Delete message
  deleteMailMessage(pubkey, welcomeId);
  const storeAfterDelete = loadMailStore(pubkey);
  assert.equal(storeAfterDelete.messages.length, 0);
});

test("filterMailMessages: searches and sorts messages", () => {
  const messages: MailMessage[] = [
    {
      id: "1",
      from: "Alice <alice@test>",
      fromAddress: "alice@test",
      to: "bob@test",
      subject: "Project Update",
      content: "Everything is going well",
      timestamp: 1000,
      read: true,
      folder: "inbox",
    },
    {
      id: "2",
      from: "Charlie <charlie@test>",
      fromAddress: "charlie@test",
      to: "bob@test",
      subject: "Lunch tomorrow",
      content: "Let's grab pizza",
      timestamp: 2000,
      read: false,
      folder: "inbox",
    },
  ];

  const filtered = filterMailMessages(messages, "inbox", "pizza");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "2");

  // Sorted newest first
  const allInbox = filterMailMessages(messages, "inbox");
  assert.equal(allInbox[0].id, "2");
  assert.equal(allInbox[1].id, "1");
});

test("buildReplyDraft: sets up reply headers and quotes body", () => {
  const original: MailMessage = {
    id: "msg_original",
    from: "Alice <alice@test>",
    fromAddress: "alice@test",
    to: "me@test",
    subject: "Greetings",
    content: "Line 1\nLine 2",
    timestamp: 1700000000000,
    read: true,
    folder: "inbox",
  };

  const reply = buildReplyDraft(original);
  assert.equal(reply.to, "alice@test");
  assert.equal(reply.subject, "Re: Greetings");
  assert.equal(reply.content.includes("> Line 1\n> Line 2"), true);
});

test("formatMailDate: formats today and past dates gracefully", () => {
  const now = Date.now();
  const formattedToday = formatMailDate(now);
  assert.equal(typeof formattedToday, "string");
  assert.equal(formattedToday.length > 0, true);

  const past = new Date(2020, 0, 1).getTime();
  const formattedPast = formatMailDate(past);
  assert.equal(formattedPast.includes("2020"), true);
});

test("resolveMailAlias: cleans profile name, rejects raw base58, allows custom handle", () => {
  const pk = "464b576da4cc5bcf31febd41a863ac251d04824c19f1786b24ca6620accc53b";
  const rawBase58 = "5jQAw8QEzaWvC1ZZKnjQwgv7dtCZ9X8vHjTheCRBBygN";

  // From profile display name
  assert.equal(resolveMailAlias(pk, rawBase58, "Scobru"), "scobru");
  assert.equal(resolveMailAlias(pk, rawBase58, "Alice Wonderland"), "alice_wonderland");

  // Fallback when name is default "Persona @..."
  assert.equal(resolveMailAlias(pk, rawBase58, "Persona @5jQAw8"), "user_464b57");
  assert.equal(resolveMailAlias(pk, rawBase58, ""), "user_464b57");
});

test("contacts & address book: saves, loads, deletes, and resolves contacts", () => {
  const pk = "user_contacts_test";
  const aliceAddr = "alice@333333333333333333333333333333333333";

  // Initially empty
  assert.equal(loadMailContacts(pk).length, 0);

  // Save contact
  saveMailContact(pk, {
    name: "Alice",
    address: aliceAddr,
    handle: "@alice",
  });

  const list = loadMailContacts(pk);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "Alice");
  assert.equal(list[0].address, aliceAddr);

  // Resolve by exact address
  const res1 = resolveRecipientAddress(aliceAddr, list);
  assert.equal(res1?.address, aliceAddr);

  // Resolve by name
  const res2 = resolveRecipientAddress("Alice", list);
  assert.equal(res2?.address, aliceAddr);

  // Resolve by @handle
  const res3 = resolveRecipientAddress("@alice", list);
  assert.equal(res3?.address, aliceAddr);

  // Resolve with known peers
  const knownPeers = {
    bob_pk: {
      display_name: "Bob",
      fmail_address: "bob@222222222222222222222222222222222222",
    },
  };
  const res4 = resolveRecipientAddress("Bob", list, knownPeers);
  assert.equal(res4?.address, "bob@222222222222222222222222222222222222");

  // Autocomplete suggestions
  const suggestions = getRecipientSuggestions("al", mockIdentity, list, knownPeers);
  assert.equal(suggestions.some((s) => s.displayName === "Alice"), true);

  // Send mail to contact by name
  const sendRes = sendMailMessage(pk, mockIdentity, "Alice", "Hi Alice", "Test content");
  assert.equal(sendRes.success, true);
  assert.equal(sendRes.message?.to, aliceAddr);

  // Delete contact
  deleteMailContact(pk, aliceAddr);
  assert.equal(loadMailContacts(pk).length, 0);
});
