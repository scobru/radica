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
import { maskProfanity, personalDataIn } from "../src/moderation.ts";
import { buildModerationPolicy, resolveModerationCurators, setHiddenUser } from "../src/moderationPolicy.ts";
import { solvePoW, POST_POW_BITS } from "../src/pow.ts";
import { UNREADABLE } from "../src/secretChatTransport.ts";
import { type ChatMessage, type Post, type UserIdentity } from "../src/types.ts";
import { startTui, type TuiMsg, type TuiState } from "./tui.ts";
import { postDetail, postItem, postLine, visiblePosts, type FeedFilter } from "./feed.ts";

const HELP = `Commands:
  /me                      your key, contact card and QR code
  /new                     create a new identity on this computer
  /import <seed>           use an existing local identity (64-hex seed)
  /list                    your conversations
  /open <who>              open a DM          (who: number from /list, @handle, key or contact card)
  /secret <who>            open a Secret Chat
  /nearby                  Radica users on this Wi-Fi
  /visible on|off          let people on this Wi-Fi find you
  /devices                 your devices' keys and when each was last heard from
  /revoke <n> confirm      stop sending to device n of /devices, for good
  /feed [following|explore|me|<who>]   posts, text only (numbered; Esc closes)
  /post <text>             publish a post (/post! <text> to publish one with personal data)
  /more                    show 30 more (older) posts of the last /feed
  /report [n] [reason]     report post n of the last /feed (or the chosen one)
  /hide [n], /unhide <who> hide an author's posts here / show them again
  /clear                   empty the open conversation (on your devices; theirs keep it)
  /delete                  remove the open conversation from your list
  /block                   block the person in the open conversation
  /help, /quit
Anything else is sent to the open conversation.`;

// full screen in a real terminal; line by line when piped (scripts, tests) or with RADICA_PLAIN=1
const fullScreen = !!process.stdin.isTTY && !!process.stdout.isTTY && !process.env.RADICA_PLAIN;
const rl = fullScreen ? null : createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
const pendingLines: string[] = [];
let inputReady = false;
let inputClosed = false;
let cmdChain = Promise.resolve();
let me: UserIdentity | null = null;
let open: { peer: string; secret: boolean } | null = null;
const shown = new Set<string>();
let lastList: string[] = [];
let lastPosts: Post[] = [];
let allPosts: Post[] = []; // every post the last /feed found (visible ones), lastPosts the part shown
let lastFilter: FeedFilter | null = null;
let feedLimit = 30;
let socialLoaded = false;
let lastPostAt = 0;
const recentPosts: string[] = [];
let lastDevices: { key: string; seen: number; current: boolean }[] = [];
let online = false;

const view: TuiState = { header: "Radica", convs: [], open: -1, lines: [], panel: null, feed: null, feedSel: 0, status: "" };
let convs: { pk: string; secret: boolean }[] = [];
const tui = fullScreen
  ? startTui(view, {
      submit: (t) => void run(t),
      openAt: (i) => void command(`/${convs[i].secret ? "secret" : "open"} ${convs[i].pk}`).catch(fail),
      deleteAt: (i) => void removeConversation(convs[i].pk, convs[i].secret).catch(fail),
      openFeedItem: (i) => openPost(i),
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

const toMsg = (m: ChatMessage): TuiMsg => ({
  time: clock(m.timestamp),
  who: nameOf(m.sender),
  mine: m.sender === me?.pubkey,
  text: maskProfanity(m.text),
  note: m.via_lan ? "local network" : undefined,
});

const UNREAD_TEXT = "Secret Chat not readable here (opened on another device, or its key was already used)";

/** The open conversation for the screen: a run of unreadable messages from one person becomes one row with a count. */
function toMsgs(list: ChatMessage[]): TuiMsg[] {
  const out: TuiMsg[] = [];
  let run = 0;
  for (const m of list) {
    const t = toMsg(m);
    if (m.text === UNREADABLE) {
      const prev = out[out.length - 1];
      if (prev?.text.startsWith(UNREAD_TEXT) && prev.who === t.who) {
        prev.text = `${UNREAD_TEXT} ×${++run}`;
        prev.time = t.time;
        continue;
      }
      run = 1;
      t.text = UNREAD_TEXT;
    }
    out.push(t);
  }
  return out;
}

function printMessage(m: ChatMessage): void {
  if (shown.has(m.id)) return;
  shown.add(m.id);
  if (!tui) say(formatted(m));
}

async function showOpen(): Promise<void> {
  if (!open) return;
  const list = await messagesOf(open.peer, open.secret);
  if (!tui) return list.forEach(printMessage);
  view.lines = toMsgs(list);
  tui.render();
}

/** The conversation list as the left pane shows it. */
function refreshConvs(): void {
  if (!me || !tui) return;
  // one row per (person, kind): a DM and a Secret Chat with the same person are separate rows (🔒 marks the secret one)
  convs = [
    ...freenet.getChatPeers(me.pubkey).map((pk) => ({ pk, secret: false })),
    ...freenet.getSecretChatPeers(me.pubkey).map((pk) => ({ pk, secret: true })),
  ]
    .filter((c, i, all) => all.findIndex((d) => d.pk === c.pk && d.secret === c.secret) === i)
    .sort((a, z) => nameOf(a.pk).localeCompare(nameOf(z.pk)) || Number(a.secret) - Number(z.secret));
  view.convs = convs.map((c) => ({ key: `${c.pk}:${c.secret}`, label: nameOf(c.pk), secret: c.secret }));
  view.open = open ? convs.findIndex((c) => c.pk === open!.peer && c.secret === open!.secret) : -1;
  view.header = `Radica · ${me ? nameOf(me.pubkey) === "you" ? `${me.pubkey.slice(0, 10)}…` : nameOf(me.pubkey) : ""} · ${online ? "Freenet connected" : lanMeshUp() ? "local network only" : "offline"}${open ? ` · ${open.secret ? "Secret Chat" : "DM"} with ${nameOf(open.peer)}` : ""}`;
  tui.render();
}

// ---- the feed (text only). Moderation as the app does: bad words masked, hidden/blocked authors, reported and AI-held
// posts dropped (my own stay), and Report / Hide on every post. ----
async function feedFilter(): Promise<FeedFilter> {
  const initialCurators = [...new Set([...resolveModerationCurators(safeStorage, freenet), me!.pubkey])];
  await Promise.allSettled(initialCurators.map((c) => freenet.refreshLog(`blocklist/${c}`)).concat(freenet.refreshLog("reports")));
  const policy = buildModerationPolicy({ me: me!.pubkey, store: safeStorage, logs: freenet }); // after the refresh: it may name new moderators
  return {
    me: me!.pubkey,
    hidden: policy.hiddenAuthors,
    blocked: (pk) => policy.isAuthorHidden(pk),
    reported: policy.reportedTargets,
  };
}
const settle = (p: Promise<unknown>, ms: number) => Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, ms))]);

async function showFeed(what: string): Promise<void> {
  if (!online) return say("The feed needs your Freenet node.");
  say("Loading the feed… the first time can take a while.");
  if (!socialLoaded) {
    socialLoaded = true;
    await settle(freenet.connectSocial(), 20000);
  }
  const f = await feedFilter();
  const mine = me!;
  let posts: Post[];
  if (what === "me") posts = Object.values((await freenet.getFeed(mine.pubkey)).posts);
  else if (what === "explore") {
    const skip = (pk: string) => f.hidden.has(pk) || f.blocked(pk);
    await freenet.getExploreTimeline(mine, { skip }); // starts fetching the feeds: wait for them, then read again
    await new Promise((r) => setTimeout(r, 6000));
    posts = await freenet.getExploreTimeline(mine, { skip });
  } else if (what === "following") {
    const own = await freenet.getFeed(mine.pubkey);
    await settle(Promise.allSettled(own.following.slice(0, 60).map((pk) => freenet.refresh(pk, false, true))), 15000);
    posts = await freenet.getTimeline(mine);
  } else {
    const pk = resolvePeer(what);
    if (!pk) return say("Whose feed? following, explore, me, an @handle, a key or a contact card.");
    await freenet.refresh(pk, true, true);
    posts = Object.values((await freenet.getFeed(pk)).posts);
  }
  lastFilter = f;
  allPosts = visiblePosts(posts, f);
  feedLimit = 30;
  renderFeed();
}

/** Show the first `feedLimit` posts of the last /feed: in the feed pane (↑ ↓ Enter), or as lines when piped. */
function renderFeed(): void {
  const f = lastFilter!;
  lastPosts = allPosts.slice(0, feedLimit);
  const captionOf = (p: Post) => freenet.postEdit(p.author, p.id)?.caption ?? p.caption;
  if (!lastPosts.length) return say("No posts to show (yet). Follow people in the app, or try /feed explore.\n");
  if (!tui) return say(lastPosts.map((p, i) => postLine(i + 1, p, nameOf(p.author), captionOf(p), maskProfanity, f)).join("\n\n") + "\n\n/post <text> · /report <n> [reason] · /hide <n> · /more");
  view.feed = lastPosts.map((p, i) => postItem(i + 1, p, nameOf(p.author), captionOf(p), maskProfanity, f));
  view.feedSel = Math.min(view.feedSel, lastPosts.length - 1);
  view.panel = null;
  say(`${lastPosts.length} of ${allPosts.length} posts · ↑↓ choose · Enter opens · /more older · Esc closes`);
}

/** One post in full, with its comments, over the feed (Esc goes back). */
function openPost(i: number): void {
  const p = lastPosts[i];
  if (!p || !lastFilter) return;
  view.panel = postDetail(p, nameOf(p.author), freenet.postEdit(p.author, p.id)?.caption ?? p.caption, maskProfanity, lastFilter, nameOf);
  tui?.render();
}

/** The post a command means: its number, or the one chosen in the feed pane. */
const postFor = (n?: string): Post | null => (n ? lastPosts[Number(n) - 1] : view.feed ? lastPosts[view.feedSel] : undefined) ?? null;

async function publish(text: string, force: boolean): Promise<void> {
  if (!online) return say("Posting needs your Freenet node.");
  if (!text) return say("/post <text>");
  const found = personalDataIn(text);
  if (found.length && !force) return say(`This contains: ${found.join(", ")}. Everyone who can read it will see it. /post! <text> publishes it as written.`);
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  if (recentPosts.includes(normalized)) return say("You recently published this exact message.");
  const wait = 15000 - (Date.now() - lastPostAt);
  if (wait > 0) return say(`Wait ${Math.ceil(wait / 1000)} s before the next post.`);
  say("Computing the anti-bot proof…");
  const pow = await solvePoW(me!.pubkey, Date.now(), POST_POW_BITS, "post");
  await freenet.publishPost(me!, "thought", text, undefined, undefined, undefined, undefined, false, 0, pow);
  lastPostAt = Date.now();
  recentPosts.push(normalized);
  if (recentPosts.length > 20) recentPosts.shift();
  say("Posted.");
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
    // say which key this device reads with, so senders seal to it too; the profile and feed are not touched (the app owns them:
    // syncOwnFeed would re-sign and push them from this store, which has no avatar, bio or posts of its own)
    void freenet.announceDevice(me).catch(() => {});
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
      view.feed = null; // a conversation replaces the feed pane
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
    case "/devices": {
      lastDevices = await freenet.ownDevices();
      if (!lastDevices.length) return say("No other device has announced a key yet.");
      return say(lastDevices.map((d, i) => `  ${i + 1}. ${d.key.slice(0, 12)}…  last heard ${new Date(d.seen).toISOString().slice(0, 10)}${d.current ? "  (this device)" : ""}`).join("\n") + "\n/revoke <number> confirm stops others sending to one of them, for good.");
    }
    case "/revoke": {
      const d = lastDevices[Number(rest[0]) - 1];
      if (!d) return say("Which device? Run /devices, then /revoke <number> confirm.");
      if (d.current) return say("That is this device.");
      if (rest[1] !== "confirm") return say(`Revoking ${d.key.slice(0, 12)}… is permanent: that device stops receiving new messages (it keeps what it already has) and can only come back with a new key. /revoke ${rest[0]} confirm to do it.`);
      await freenet.revokeDevice(d.key);
      lastDevices = [];
      return say(`Revoked ${d.key.slice(0, 12)}….`);
    }
    case "/feed":
      return showFeed(arg || "following");
    case "/more":
      if (!allPosts.length) return say("Run /feed first.");
      feedLimit += 30;
      return renderFeed();
    case "/post":
    case "/post!":
      return publish(arg, cmd === "/post!");
    case "/report": {
      const p = postFor(rest[0]);
      if (!p) return say("Which post? Run /feed, then /report <number> [reason].");
      await freenet.reportPost(p.author, p.id, rest.slice(1).join(" ") || "Reported from the terminal", null, !p.community_id); // a public post also goes to Radica's moderators
      allPosts = allPosts.filter((x) => x !== p);
      renderFeed();
      return say(`Reported post by ${nameOf(p.author)}; it is hidden from your feed.`);
    }
    case "/hide":
    case "/unhide": {
      const pk = cmd === "/hide" ? postFor(rest[0])?.author : resolvePeer(arg);
      if (!pk) return say(cmd === "/hide" ? "Which post? Run /feed, then /hide <number>." : "Whose posts? An @handle, a key or a contact card.");
      if (pk === me!.pubkey) return say("That is you.");
      setHiddenUser(safeStorage, pk, cmd === "/hide");
      if (cmd === "/hide") {
        allPosts = allPosts.filter((p) => p.author !== pk);
        if (lastFilter) lastFilter.hidden.add(pk);
        if (lastPosts.length) renderFeed();
      }
      return say(`${cmd === "/hide" ? "Hidden" : "Showing again"}: ${nameOf(pk)}.`);
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
  if (tui) view.lines = [...view.lines, { time: clock(Date.now()), who: "you", mine: true, text, note: "sending…" }];
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

function enqueueLine(t: string): void {
  cmdChain = cmdChain.then(() => run(t)).finally(() => rl?.prompt());
}

if (rl) {
  rl.on("line", (line) => {
    const t = line.trim();
    if (!inputReady) {
      if (t) pendingLines.push(t);
      return;
    }
    if (!t) return rl.prompt();
    enqueueLine(t);
  });
  rl.on("close", () => {
    if (!inputReady) {
      inputClosed = true;
      return;
    }
    void cmdChain.finally(() => void quit());
  });
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
  inputReady = true;
  rl.prompt();
  for (const t of pendingLines.splice(0)) enqueueLine(t);
  if (inputClosed) void cmdChain.finally(() => void quit());
}
