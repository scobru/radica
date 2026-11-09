import { test, expect, type Page } from "@playwright/test";

// Posts and comments from other people, handed to the page as if a peer had sent them (no Freenet node here).

async function signIn(page: Page) {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Keypair" }).click();
  await expect(page.locator("#identity-modal")).toBeHidden();
  await page.click("#welcome-skip-btn");
  await expect(page.locator("#welcome-modal")).toBeHidden();
}

const hex = () => Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const tagOf = () => Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");

function post(id: string, author: string, timestamp: number, caption: string, comments: Record<string, object> = {}) {
  return { id, author, category: "thought", caption, timestamp, sig: "", is_nsfw: false, likes: {}, comments };
}

/** The post as a peer's live event: the same module instance the app runs (Vite serves /src). */
async function receive(page: Page, p: object) {
  await page.evaluate(async (p) => {
    const { freenet } = await import("/src/freenet.ts");
    (freenet as unknown as { handlePeerEvent(d: unknown): void }).handlePeerEvent({ type: "post", post: p });
  }, p);
}

test("a stranger's post without the anti-bot proof is shielded, one with it is not", async ({ page }) => {
  const ts = Date.UTC(2026, 10, 8, 12); // once readers check the proof (POST_POW_SINCE)
  await page.clock.setFixedTime(ts + 60_000); // the page's clock is past it too: a later-dated post would not be shown
  await signIn(page);
  const [bad, good] = [tagOf(), tagOf()];
  // the proof binds the author: ground in the page for a fixed stranger
  const stranger = hex();
  const provenId = await page.evaluate(async ({ author, ts }) => {
    const { solvePoW, postIdWithPow, POST_POW_BITS } = await import("/src/pow.ts");
    return postIdWithPow(ts, await solvePoW(author, ts, POST_POW_BITS));
  }, { author: stranger, ts });
  await receive(page, post(`post_${ts}_abcdef`, hex(), ts, `no proof here ${bad}`));
  await receive(page, post(provenId, stranger, ts, `proof paid ${good}`));

  const badCard = page.locator(".gram-card", { hasText: bad }).first();
  await expect(badCard).toHaveClass(/wot-shielded/, { timeout: 20_000 });
  await expect(badCard.locator(".wot-shield-title")).toHaveText("Newcomer post without the anti-bot proof");
  const goodCard = page.locator(".gram-card", { hasText: good }).first();
  await expect(goodCard).toBeVisible();
  await expect(goodCard).not.toHaveClass(/wot-shielded/);
});

test("a Radica moderator removes a stranger's post and comment for everyone following the maintainer", async ({ page }) => {
  const ts = Date.UTC(2026, 10, 1); // before readers check the proof (POST_POW_SINCE): only moderation decides here
  await page.clock.setFixedTime(ts + 60_000); // pinned, so the test does not depend on today's date
  await signIn(page);
  // the maintainer names me a moderator on their blocklist (a log entry as the node would have given it)
  await page.evaluate(async () => {
    const { freenet } = await import("/src/freenet.ts");
    const { RADICA_MAINTAINER } = await import("/src/types.ts");
    const me = (freenet as unknown as { me: string }).me;
    const e = { author: RADICA_MAINTAINER, id: "mod1", ts: Date.now(), body: JSON.stringify({ type: "mod", target: me, on: true }), sig: "" };
    localStorage.setItem(`freenet_log_blocklist/${RADICA_MAINTAINER}`, JSON.stringify({ [`${e.author}:${e.id}`]: e }));
  });
  const [spam, other, keep] = [tagOf(), tagOf(), tagOf()];
  const commenter = hex();
  await receive(page, post(`post_${ts}_aaaaaa`, hex(), ts, `buy now ${spam}`));
  await receive(page, post(`post_${ts}_bbbbbb`, hex(), ts + 1, `a fine post ${other}`, {
    [`${commenter}:comm_${ts}_cc`]: { id: `comm_${ts}_cc`, post_id: `post_${ts}_bbbbbb`, author: commenter, text: `spam comment ${keep}`, timestamp: ts + 2, sig: "" },
  }));

  const spamCard = page.locator(".gram-card", { hasText: spam }).first();
  await spamCard.locator(".global-remove-btn").click({ timeout: 20_000 });
  await expect(page.locator(".gram-card", { hasText: spam })).toHaveCount(0);

  const card = page.locator(".gram-card", { hasText: other }).first();
  const comment = card.locator(".comment-item", { hasText: keep });
  await expect(comment).toBeVisible();
  await comment.locator(".comment-remove-btn").click();
  await expect(card.locator(".comment-item", { hasText: keep })).toHaveCount(0);
  await expect(card).toBeVisible(); // the post itself stays
});

test("Top ignores strangers' likes and a post dated in the future is not shown", async ({ page }) => {
  await signIn(page);
  const now = Date.now();
  const [farmed, future, plain] = [tagOf(), tagOf(), tagOf()];
  const bots = Object.fromEntries(Array.from({ length: 5 }, () => [hex(), { liked: true }]));
  await receive(page, { ...post(`post_${now - 60_000}_aaaaaa`, hex(), now - 60_000, `farmed likes ${farmed}`), likes: bots });
  await receive(page, post(`post_${now - 30_000}_bbbbbb`, hex(), now - 30_000, `just a post ${plain}`));
  await receive(page, post(`post_${Date.UTC(2100, 0, 1)}_cccccc`, hex(), Date.UTC(2100, 0, 1), `from the year 2100 ${future}`));

  await expect(page.locator(".gram-card", { hasText: plain }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".gram-card", { hasText: future })).toHaveCount(0);
  await page.click('.sort-btn[data-sort="top24h"]');
  await expect(page.locator(".gram-card", { hasText: farmed })).toHaveCount(0); // five bots liked it: none is in my network
});

test("a stranger's notifications sit under Others and do not light the bell", async ({ page }) => {
  await signIn(page);
  await page.evaluate(async () => {
    const { freenet } = await import("/src/freenet.ts");
    const me = (freenet as unknown as { me: string }).me;
    const stranger = "ab".repeat(32);
    const item = { id: "n_spam1", type: "comment", from: stranger, text: 'commented: "buy now"', timestamp: Date.now() - 1000, read: false };
    localStorage.setItem(`freenet_notifs_${me}`, JSON.stringify([item]));
  });
  await page.reload();
  await expect(page.locator("#post-caption")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#notif-badge")).toBeHidden();
  await page.click("#open-notifs-btn");
  await expect(page.locator(".notif-others")).toBeVisible();
  await expect(page.locator(".notif-others .notif-item")).toHaveCount(1);
});

test("a newcomer's comment without the anti-bot proof waits behind a show button instead of vanishing", async ({ page }) => {
  const ts = Date.UTC(2026, 10, 8, 12); // the proof is checked from here
  await page.clock.setFixedTime(ts + 60_000);
  await signIn(page);
  const stranger = hex();
  const text = `a comment ${tagOf()}`;
  await page.evaluate(async ({ stranger, ts, text }) => {
    const { freenet } = await import("/src/freenet.ts");
    const me = (freenet as unknown as { me: string }).me;
    const cid = `comm_${ts}_abcdef`;
    const post = { id: `post_${ts}_mine00`, author: me, category: "thought", caption: "my post here", timestamp: ts, sig: "", is_nsfw: false, likes: {}, comments: { [`${stranger}:${cid}`]: { id: cid, post_id: `post_${ts}_mine00`, author: stranger, text, timestamp: ts + 1, sig: "" } } };
    (freenet as unknown as { handlePeerEvent(d: unknown): void }).handlePeerEvent({ type: "post", post });
  }, { stranger, ts, text });
  const card = page.locator(".gram-card", { hasText: "my post here" }).first();
  await expect(card.locator(".show-unproven-comments")).toBeVisible({ timeout: 20_000 });
  await expect(card.locator(".comment-item", { hasText: text })).toHaveCount(0);
  await card.locator(".show-unproven-comments").click();
  await expect(card.locator(".comment-item", { hasText: text })).toBeVisible();
});

test("a stranger's notification counts when a real comment is behind it, and waits under Others when none is", async ({ page }) => {
  const ts = Date.UTC(2026, 10, 8, 12);
  await page.clock.setFixedTime(ts + 60_000);
  await signIn(page);
  const [real, fake] = [hex(), hex()];
  await page.evaluate(async ({ real, fake, ts }) => {
    const { freenet } = await import("/src/freenet.ts");
    const { solvePoW, postIdWithPow, COMMENT_POW_BITS } = await import("/src/pow.ts");
    const me = (freenet as unknown as { me: string }).me;
    const cid = postIdWithPow(ts, await solvePoW(real, ts, COMMENT_POW_BITS, "comment"), "comment"); // a comment that paid its proof
    const postId = `post_${ts}_mine01`;
    const post = { id: postId, author: me, category: "thought", caption: "my notified post", timestamp: ts, sig: "", is_nsfw: false, likes: {}, comments: { [`${real}:${cid}`]: { id: cid, post_id: postId, author: real, text: "hello", timestamp: ts, sig: "" } } };
    (freenet as unknown as { handlePeerEvent(d: unknown): void }).handlePeerEvent({ type: "post", post });
    const n = (id: string, from: string) => ({ id, type: "comment", from, text: 'commented: "hello"', linkPostId: postId, linkPostOwner: me, timestamp: ts + 1000, read: false });
    localStorage.setItem(`freenet_notifs_${me}`, JSON.stringify([n("n_real", real), n("n_fake", fake)]));
  }, { real, fake, ts });
  await page.click("#open-notifs-btn");
  await expect(page.locator("#notifs-list > .notif-item")).toHaveCount(1);
  await expect(page.locator(".notif-others .notif-item")).toHaveCount(1);
});

test("the moderation queue puts a trusted person's report first and a swarm of fresh keys behind a fold", async ({ page }) => {
  await signIn(page);
  await page.evaluate(async () => {
    const { freenet } = await import("/src/freenet.ts");
    const { RADICA_MAINTAINER } = await import("/src/types.ts");
    const me = (freenet as unknown as { me: string }).me;
    const hex = (c: string) => c.repeat(64);
    // the maintainer names me a moderator
    const mod = { author: RADICA_MAINTAINER, id: "mod1", ts: Date.now(), body: JSON.stringify({ type: "mod", target: me, on: true }), sig: "" };
    localStorage.setItem(`freenet_log_blocklist/${RADICA_MAINTAINER}`, JSON.stringify({ [`${mod.author}:${mod.id}`]: mod }));
    // twenty fresh keys report one post; I report another
    const reports: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) {
      const author = i.toString(16).padStart(2, "0").repeat(32);
      reports[`${author}:r`] = { author, id: "r", ts: Date.now() - i, body: JSON.stringify({ type: "report", target: `${hex("1")}:swarmed`, reason: "spam" }), sig: "" };
    }
    reports[`${me}:r`] = { author: me, id: "r", ts: Date.now(), body: JSON.stringify({ type: "report", target: `${hex("2")}:mine`, reason: "abuse" }), sig: "" };
    localStorage.setItem("freenet_log_reports", JSON.stringify(reports));
  });
  await page.reload();
  await openModeration(page);
  const first = page.locator("#mod-queue > div").first();
  await expect(first).toContainText("from people you trust");
  await expect(first).toContainText("abuse");
  const fold = page.locator("#mod-queue details");
  await expect(fold).toContainText("Reported only by people outside your network (1)");
  await expect(fold).toContainText("20 reports");
});

async function makeMeAModerator(page: Page) {
  await page.evaluate(async () => {
    const { freenet } = await import("/src/freenet.ts");
    const { RADICA_MAINTAINER } = await import("/src/types.ts");
    const me = (freenet as unknown as { me: string }).me;
    const mod = { author: RADICA_MAINTAINER, id: "mod1", ts: Date.now(), body: JSON.stringify({ type: "mod", target: me, on: true }), sig: "" };
    localStorage.setItem(`freenet_log_blocklist/${RADICA_MAINTAINER}`, JSON.stringify({ [`${mod.author}:${mod.id}`]: mod }));
  });
  await page.reload();
}

/** Moderation lives in a tab of the Blocklists page, shown to Radica's moderators only. */
async function openModeration(page: Page) {
  await expect(async () => {
    await page.click("#blocklists-open-btn");
    await expect(page.locator("#tab-btn-moderation")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.click("#tab-btn-moderation");
}

test("a Radica moderator hides a community from the lists, and shows it again", async ({ page }) => {
  await signIn(page);
  await makeMeAModerator(page);
  await expect(page.locator("#communities-list")).toContainText("r/tech");
  await openModeration(page);
  await page.fill("#mod-comm-input", "r/tech");
  await page.fill("#mod-comm-reason", "offensive");
  await page.click('#mod-comm-form button[type="submit"]');
  await expect(page.locator("#mod-comm-list")).toContainText("r/tech");
  await expect(page.locator("#mod-comm-list")).toContainText("offensive");
  await page.click("#blocklists-close-btn");
  await expect(page.locator("#communities-list")).not.toContainText("r/tech");
  await openModeration(page);
  await page.click('#mod-comm-list [data-act="unhide-comm"]');
  await page.click("#blocklists-close-btn");
  await expect(page.locator("#communities-list")).toContainText("r/tech");
});

test("a person Radica's moderators banned does not show in a community's chat", async ({ page }) => {
  await signIn(page);
  const [banned, fine] = [hex(), hex()];
  await page.evaluate(async ({ banned, fine }) => {
    const { RADICA_MAINTAINER } = await import("/src/types.ts");
    const { freenet } = await import("/src/freenet.ts");
    const f = freenet as unknown as { handlePeerEvent(d: unknown): void };
    const ban = { author: RADICA_MAINTAINER, id: "ban1", ts: Date.now(), body: JSON.stringify({ type: "block", target: banned, on: true }), sig: "" };
    localStorage.setItem(`freenet_log_blocklist/${RADICA_MAINTAINER}`, JSON.stringify({ [`${ban.author}:${ban.id}`]: ban }));
    const say = (sender: string, text: string, id: string) =>
      f.handlePeerEvent({ type: "chat", message: { id, room_id: "comm_c_radica", sender, recipient: "community", community_id: "c_radica", text, timestamp: Date.now(), sig: "" } });
    say(banned, "buy my coins", "m_spam");
    say(fine, "hello everyone", "m_fine");
  }, { banned, fine });
  await page.locator("#communities-list").getByText("r/radica").first().click();
  await page.getByRole("button", { name: "Community Chat" }).click();
  await expect(page.locator(".rm-msg-row", { hasText: "hello everyone" }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".rm-msg-row", { hasText: "buy my coins" })).toHaveCount(0);
});
