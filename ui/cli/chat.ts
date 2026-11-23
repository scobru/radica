// Radica chat for the terminal: DMs and Secret Chats over your Freenet node, and over the local network when Freenet
// is not there (LAN mesh, Nearby). It is Radica's own client code (src/freenet.ts) run in Node: identity, keys,
// sealing and logs are exactly the app's. Build: `npm run cli:build`; run: `npm run chat`.
import { HOME, lanMeshUp, shutdown } from "./node-bridge.ts"; // first: the native bridge must exist before the client loads
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { freenet } from "../src/freenet.ts";
import { getIdentity, personaName } from "../src/crypto.ts";
import { safeStorage } from "../src/storage.ts";
import { contactCardText, parseContactCard } from "../src/contactCard.ts";
import { fromBase58 } from "../src/base58.ts";
import { maskProfanity } from "../src/moderation.ts";
import type { ChatMessage, UserIdentity } from "../src/types.ts";
import { startTui, type TuiState } from "./tui.ts";

const HELP = `Commands:
  /me                      your key, contact card and QR code
  /new                     create a new identity on this computer
  /import <seed>           use an existing local identity (64-hex seed)
  /list                    your conversations
  /open <who>              open a DM          (who: number from /list, @handle, key or contact card)
  /secret <who>            open a Secret Chat
  /nearby                  Radica users on this Wi-Fi
  /visible on|off          let people on this Wi-Fi find you
  /clear                   empty the open conversation (on your devices; theirs keep it)
  /delete                  remove the open conversation from your list
  /block                   block the person in the open conversation
  /help, /quit
Anything else is sent to the open conversation.`;

// full screen in a real terminal; line by line when piped (scripts, tests) or with RADICA_PLAIN=1
const fullScreen = !!process.stdin.isTTY && !!process.stdout.isTTY && !process.env.RADICA_PLAIN;
const rl = fullScreen ? null : createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
let me: UserIdentity | null = null;
let open: { peer: string; secret: boolean } | null = null;
const shown = new Set<string>();
let lastList: string[] = [];
let online = false;

const view: TuiState = { header: "Radica", convs: [], open: -1, lines: [], panel: null, status: "" };
let convs: { pk: string; secret: boolean }[] = [];
const tui = fullScreen
  ? startTui(view, {
      submit: (t) => void run(t),
      openAt: (i) => void command(`/${convs[i].secret ? "secret" : "open"} ${convs[i].pk}`).catch(fail),
      deleteAt: (i) => void removeConversation(convs[i].pk, convs[i].secret).catch(fail),
      quit: () => void quit(),
    })
  : null;

const say = (line: string) => {
  if (tui) {
    // one line: the status bar; more (help, /me): the right pane until Esc
    if (line.includes("\n")) view.panel = line;
    else view.status = line;
    return tui.render();
  }
  process.stdout.write(`\r\x1b[K${line}\n`);
  rl!.prompt(true);
};
const fail = (e: unknown) => say(`Error: ${(e as Error)?.message ?? e}`);
const nameOf = (pk: string): string =>
  pk === me?.pubkey ? "you" : freenet.knownPeers[pk]?.display_name || freenet.contactCard(pk)?.name || personaName(pk).slice(0, 14);
const clock = (ts: number) => new Date(ts).toTimeString().slice(0, 5);

async function messagesOf(peer: string, secret: boolean): Promise<ChatMessage[]> {
  if (!me) return [];
  const list = secret ? await freenet.getSecretChatMessages(me, peer) : await freenet.getChatMessages(me, peer);
  const blocked = freenet.blockedBy(me.pubkey);
  return list.filter((m) => !blocked.has(m.sender)).sort((a, z) => a.timestamp - z.timestamp);
}

// the app masks bad words by default (caption.ts); so does the terminal
const formatted = (m: ChatMessage) => `[${clock(m.timestamp)}] ${nameOf(m.sender)}: ${maskProfanity(m.text)}${m.via_lan ? "  (local network)" : ""}`;

function printMessage(m: ChatMessage): void {
  if (shown.has(m.id)) return;
  shown.add(m.id);
  if (!tui) say(formatted(m));
}

async function showOpen(): Promise<void> {
  if (!open) return;
  const list = await messagesOf(open.peer, open.secret);
  if (!tui) return list.forEach(printMessage);
  view.lines = list.map(formatted);
  tui.render();
}

/** The conversation list as the left pane shows it. */
function refreshConvs(): void {
  if (!me || !tui) return;
  // one row per person, by name so the list stays put: Enter opens the DM, or the Secret Chat when that is all there is
  // (🔒 marks one; /secret opens it); the peer lists can repeat a key
  const secret = new Set(freenet.getSecretChatPeers(me.pubkey));
  const dm = new Set(freenet.getChatPeers(me.pubkey));
  convs = [...new Set([...dm, ...secret])]
    .map((pk) => ({ pk, secret: !dm.has(pk) }))
    .sort((a, z) => nameOf(a.pk).localeCompare(nameOf(z.pk)));
  view.convs = convs.map((c) => ({ key: c.pk, label: nameOf(c.pk), secret: secret.has(c.pk) }));
  view.open = open ? convs.findIndex((c) => c.pk === open!.peer) : -1;
  view.header = `Radica · ${me ? nameOf(me.pubkey) === "you" ? `${me.pubkey.slice(0, 10)}…` : nameOf(me.pubkey) : ""} · ${online ? "Freenet connected" : lanMeshUp() ? "local network only" : "offline"}${open ? ` · ${open.secret ? "Secret Chat" : "DM"} with ${nameOf(open.peer)}` : ""}`;
  tui.render();
}

const roomOf = (peer: string, secret: boolean) => (secret ? freenet.getSecretRoomId(me!.pubkey, peer) : [me!.pubkey, peer].sort().join(":"));

/** As the app's "Remove from recent chats": gone from my list until they write again. */
async function removeConversation(peer: string, secret: boolean): Promise<void> {
  if (secret) freenet.removeSecretChatPeer(me!.pubkey, peer);
  else freenet.removeChatPeer(me!.pubkey, peer);
  if (open?.peer === peer && open.secret === secret) {
    open = null;
    view.lines = [];
  }
  say(`Removed ${secret ? "the Secret Chat with " : ""}${nameOf(peer)} from your list.`);
  refreshConvs();
}

/** A person from what was typed: a /list number, a contact card, a key, or an @handle. */
function resolvePeer(raw: string): string | null {
  const t = raw.trim();
  if (/^\d+$/.test(t)) return lastList[Number(t) - 1] ?? null;
  const card = parseContactCard(t);
  if (card) {
    freenet.saveContactCard(card);
    return card.pubkey;
  }
  if (/^[0-9a-f]{64}$/i.test(t)) return t.toLowerCase();
  try {
    const bytes = fromBase58(t);
    if (bytes.length === 32) return Buffer.from(bytes).toString("hex");
  } catch {}
  return freenet.resolveHandle(t);
}

async function signIn(): Promise<void> {
  me = await getIdentity();
  if (!me) {
    say("No identity on this computer yet: /new to create one, or /import <seed>.");
    return;
  }
  freenet.setIdentity(me);
  say(`Signed in as ${nameOf(me.pubkey)} (${me.pubkey.slice(0, 12)}…). Connecting to your Freenet node…`);
  online = await freenet.connect({ chatOnly: true });
  say(
    online
      ? "Freenet node connected."
      : `No Freenet node at 127.0.0.1:7509: ${lanMeshUp() ? "chatting over the local network only." : "local network unavailable too."}`
  );
  if (online) {
    // as the app does on sign-in: my profile names this device's key, the one people seal their messages to
    void freenet.syncOwnFeed(me).catch(() => {});
    // no announceIdentity: the directory (Explore's phone book) is not loaded yet at start, so it would grind a 20-bit
    // proof of work on the main thread (no Worker in Node) and append a duplicate hello on every run; chat needs neither
  }
  say("Type /help for commands.");
}

async function command(line: string): Promise<void> {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  const arg = line.trim().slice(cmd.length).trim();
  if (cmd !== "/new" && cmd !== "/import" && cmd !== "/help" && cmd !== "/quit" && !me) return say("Sign in first: /new or /import <seed>.");
  switch (cmd) {
    case "/help":
      return say(HELP);
    case "/quit":
      return quit();
    case "/new":
    case "/import": {
      if (me) return say("This computer already has an identity.");
      const seed = cmd === "/new" ? randomBytes(32).toString("hex") : arg.toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(seed)) return say("A seed is 64 hex characters.");
      safeStorage.setItem("radica_ed25519_seed", seed);
      if (cmd === "/new") say(`New identity. Back up this seed somewhere safe, it is the only way to recover it:\n  ${seed}`);
      return signIn();
    }
    case "/me": {
      const card = contactCardText({ pubkey: me!.pubkey, encPub: me!.encPub, name: freenet.knownPeers[me!.pubkey]?.display_name ?? "" });
      const { renderUnicodeCompact } = await import("uqr");
      return say(`Key: ${me!.pubkey}\nContact card (paste it in Radica's New Conversation, or scan):\n  ${card}\n${renderUnicodeCompact(card)}`);
    }
    case "/list": {
      lastList = [...new Set([...freenet.getChatPeers(me!.pubkey), ...freenet.getSecretChatPeers(me!.pubkey)])];
      if (!lastList.length) return say("No conversations yet: /open <who> or /nearby.");
      const secret = new Set(freenet.getSecretChatPeers(me!.pubkey));
      return say(lastList.map((pk, i) => `  ${i + 1}. ${nameOf(pk)}${secret.has(pk) ? "  [secret]" : ""}`).join("\n"));
    }
    case "/open":
    case "/secret": {
      const peer = resolvePeer(arg);
      if (!peer || peer === me!.pubkey) return say("Who? A /list number, @handle, key or contact card.");
      if (freenet.blockedBy(me!.pubkey).has(peer)) return say("You blocked this person.");
      open = { peer, secret: cmd === "/secret" };
      shown.clear();
      view.lines = [];
      view.panel = null;
      say(`— ${open.secret ? "Secret Chat" : "DM"} with ${nameOf(peer)} —`);
      refreshConvs();
      return showOpen();
    }
    case "/nearby": {
      const blocked = freenet.blockedBy(me!.pubkey);
      const peers = freenet.nearbyPeers().filter((c) => !blocked.has(c.pubkey));
      if (!lanMeshUp()) return say("The local network is not available (port 47509 taken or no network).");
      if (!peers.length) return say("Nobody nearby has made themselves visible yet.");
      lastList = peers.map((c) => c.pubkey);
      for (const c of peers) freenet.saveContactCard(c);
      return say(peers.map((c, i) => `  ${i + 1}. ${c.name || "No name"} (${c.pubkey.slice(0, 10)}…) nearby, not verified`).join("\n") + "\n/open <number> to chat.");
    }
    case "/visible": {
      if (rest[0] !== "on" && rest[0] !== "off") return say(`Visible on this Wi-Fi: ${freenet.isNearbyVisible() ? "on" : "off"}. /visible on|off`);
      freenet.setNearbyVisible(rest[0] === "on");
      return say(rest[0] === "on" ? "Visible: everyone on this network can see you use Radica." : "Hidden from people nearby.");
    }
    case "/clear": {
      if (!open) return say("Open a conversation first.");
      await freenet.clearChatRoom(roomOf(open.peer, open.secret));
      shown.clear();
      view.lines = [];
      say(`Emptied the conversation with ${nameOf(open.peer)} (on your devices; theirs keep it).`);
      return showOpen();
    }
    case "/delete": {
      if (!open) return say("Open a conversation first.");
      return removeConversation(open.peer, open.secret);
    }
    case "/block": {
      if (!open) return say("Open a conversation first.");
      await freenet.setBlocked(open.peer, true);
      say(`Blocked ${nameOf(open.peer)}.`);
      open = null;
      return;
    }
    default:
      return say(`Unknown command ${cmd}. /help`);
  }
}

async function send(text: string): Promise<void> {
  if (!me || !open) return say("Open a conversation first: /list, then /open <number>.");
  const { peer, secret } = open;
  // shown at once: sealing waits on the peer's profile, which a slow network can take seconds to bring
  const pending = `[${clock(Date.now())}] you: ${text}  (sending…)`;
  if (tui) view.lines = [...view.lines, pending];
  say(tui ? "Sending…" : pending);
  const m = secret ? await freenet.sendSecretChatMessage(me, peer, text) : await freenet.sendChatMessage(me, peer, text);
  shown.add(m.id);
  say(`${tui ? "Sent" : "  sent"} to ${nameOf(peer)}${online ? "" : " over the local network only"}.`);
  await showOpen();
}

/** A typed line: a command or a message to the open conversation. */
async function run(t: string): Promise<void> {
  await (t.startsWith("/") ? command(t) : send(t)).catch(fail);
  refreshConvs();
}

async function quit(): Promise<never> {
  if (tui) process.stdout.write("\x1b[?25h\x1b[?1049l");
  const profile = await shutdown();
  if (profile) process.stdout.write(`\n${profile}\n`);
  process.exit(0);
}

say(`Radica chat for the terminal. Data: ${HOME}`);
await signIn();
const refresh = () => {
  refreshConvs();
  void showOpen().catch(() => {});
};
freenet.onSyncUpdate(refresh);
// the inbox is fetched on each read; a slow poll keeps the open conversation fresh between pushes
setInterval(refresh, 5000);
refreshConvs();
if (rl) {
  rl.prompt();
  rl.on("line", (line) => {
    const t = line.trim();
    if (!t) return rl.prompt();
    void run(t).finally(() => rl.prompt());
  });
  rl.on("close", () => void quit());
}
