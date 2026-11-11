import { test, expect, type Page } from "@playwright/test";

const chat = (p: Page) => p.locator("#chat-modal");

/** A fresh identity made on the page, so the app leaves the sign-in screen. */
async function signIn(page: Page) {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Keypair" }).click();
  await expect(page.locator("#identity-modal")).toBeHidden();
  await page.click("#welcome-skip-btn"); // a new identity is welcomed first
  await expect(page.locator("#welcome-modal")).toBeHidden();
}

test("signing in with a new key leaves the identity page", async ({ page }) => {
  await signIn(page);
  await expect(page.locator("#post-caption")).toBeVisible();
});

test("chat opens in the page, not full screen, and Escape closes it", async ({ page }) => {
  await signIn(page);
  await page.click("#open-chat-btn");
  await expect(chat(page)).toBeVisible();
  await expect(chat(page)).not.toHaveClass(/\bfullscreen\b/);
  await page.keyboard.press("Escape");
  await expect(chat(page)).toBeHidden();
});

test("Back closes an open page and returns to the feed, without leaving Radica", async ({ page }) => {
  await signIn(page);
  const url = page.url();
  await page.click("#open-chat-btn");
  await expect(chat(page)).toBeVisible();
  await page.goBack();
  await expect(chat(page)).toBeHidden();
  await expect(page.locator("#post-caption")).toBeVisible();
  expect(page.url()).toBe(url);
});

test("a long chat scrolls its messages, not the page", async ({ page }) => {
  await signIn(page);
  await page.click("#open-chat-btn");
  await expect(chat(page)).toBeVisible();
  const r = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>("#chat-modal .rm-messages-scroller")!;
    for (let i = 0; i < 80; i++) scroller.appendChild(Object.assign(document.createElement("div"), { style: "height: 30px; flex-shrink: 0" }));
    return { page: document.documentElement.scrollHeight, view: innerHeight, inside: scroller.scrollHeight > scroller.clientHeight };
  });
  expect(r.page).toBeLessThanOrEqual(r.view);
  expect(r.inside).toBe(true);
});

test("Escape leaves full screen first, then closes the chat", async ({ page }) => {
  await signIn(page);
  await page.click("#open-chat-btn");
  await page.locator("#chat-fullscreen-btn").evaluate((b: HTMLElement) => b.click()); // its button may be hidden in the messenger layout
  await expect(chat(page)).toHaveClass(/\bfullscreen\b/);
  await page.keyboard.press("Escape");
  await expect(chat(page)).toBeVisible();
  await expect(chat(page)).not.toHaveClass(/\bfullscreen\b/);
  await page.keyboard.press("Escape");
  await expect(chat(page)).toBeHidden();
});

test("the moment composer accepts videos", async ({ page }) => {
  await signIn(page);
  await expect(page.locator("#post-file-picker")).toHaveAttribute("accept", /video\/\*/);
});

test("a thought is planted in the feed", async ({ page }) => {
  await signIn(page);
  const text = `e2e thought ${Math.random().toString(36).slice(2, 8).replace(/\d/g, "x")}`; // no long digit runs: the composer masks them as card numbers
  await page.fill("#post-caption", text);
  await page.getByRole("button", { name: "Plant post" }).click();
  await expect(page.locator(".gram-card", { hasText: text }).first()).toBeVisible({ timeout: 30_000 });
});

test("the supporter panel answers a bad receipt", async ({ page }) => {
  await signIn(page);
  await page.click("#open-identity-btn");
  await page.fill("#redeem-receipt-input", "RADICA-RECEIPT-V1:not-a-receipt");
  await page.click("#redeem-receipt-btn");
  await expect(page.locator("#redeem-receipt-msg")).not.toHaveText(/^(|Verifying receipt\.\.\.)$/);
  await expect(page.locator("#supporter-active-badge-card")).toBeHidden();
});

test("my post can be edited, and Cancel leaves it as it was", async ({ page }) => {
  await signIn(page);
  const tag = Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");
  await page.fill("#post-caption", `before ${tag}`);
  await page.getByRole("button", { name: "Plant post" }).click();
  const first = page.locator(".gram-card", { hasText: `before ${tag}` }).first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  const card = page.locator(`#${await first.getAttribute("id")}`); // by id: while editing, the text is in a textarea

  await card.locator(".edit-post-btn").click();
  await card.locator(".edit-post-input").fill("discarded");
  await card.locator(".edit-post-cancel").click();
  await expect(card.locator(".edit-post-input")).toHaveCount(0);
  await expect(card.locator(".gram-caption")).toHaveText(`before ${tag}`);

  await card.locator(".edit-post-btn").click();
  await card.locator(".edit-post-input").fill(`after ${tag}`);
  await card.locator(".edit-post-save").click();
  await expect(card.locator(".gram-caption")).toHaveText(`after ${tag}`);
  await expect(card.locator(".gram-edited")).toBeVisible();
  await expect(page.locator(".gram-card", { hasText: `before ${tag}` })).toHaveCount(0);
});

test("the guide opens from the rail and Escape closes it", async ({ page }) => {
  await signIn(page);
  await page.click("#guide-open-btn");
  await expect(page.locator("#guide-modal")).toBeVisible();
  await page.getByText("🚫 Hide, block and report").click();
  await expect(page.locator("#guide-modal").getByText("goes on your public blocklist")).toBeVisible(); // not the Moderation page's own note
  await page.keyboard.press("Escape");
  await expect(page.locator("#guide-modal")).toBeHidden();
});

test("a post in another language offers Translate", async ({ page }) => {
  await signIn(page);
  const tag = Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");
  await page.fill("#post-caption", `Oggi non sono uscito perché pioveva anche questo pomeriggio ${tag}`);
  await page.getByRole("button", { name: "Plant post" }).click();
  const card = page.locator(".gram-card", { hasText: tag }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator(".translate-btn")).toHaveText("Translate from Italiano");
});

test("a post in my language offers no Translate", async ({ page }) => {
  await signIn(page); // a new identity per post: newcomers wait 15 s between posts
  const tag = Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");
  await page.fill("#post-caption", `The weather is nice and you should come with us ${tag}`);
  await page.getByRole("button", { name: "Plant post" }).click();
  const mine = page.locator(".gram-card", { hasText: tag }).first();
  await expect(mine).toBeVisible({ timeout: 30_000 });
  await expect(mine.locator(".translate-btn")).toHaveCount(0);
});

test("a saved post shows under Saved, and unsaving removes it", async ({ page }) => {
  await signIn(page);
  const tag = Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");
  await page.fill("#post-caption", `keep this ${tag}`);
  await page.getByRole("button", { name: "Plant post" }).click();
  const card = page.locator(".gram-card", { hasText: tag }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.locator(".post-more summary").click(); // Save sits in the post's ⋯ menu
  await card.locator(".save-post-btn").click();
  await expect(card.locator(".save-post-btn")).toHaveAttribute("aria-pressed", "true");
  await page.click("#scope-saved-btn");
  await expect(page.locator("#scope-saved-count")).toHaveText("1");
  const saved = page.locator(".gram-card", { hasText: tag }).first();
  await expect(saved).toBeVisible();
  await saved.locator(".post-more summary").click();
  await saved.locator(".save-post-btn").click();
  await expect(page.locator(".gram-card", { hasText: tag })).toHaveCount(0);
  await expect(page.getByText("Nothing saved yet")).toBeVisible();
});

test("a new identity is welcomed: name, people, first post, and not again", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Keypair" }).click();
  const welcome = page.locator("#welcome-modal");
  await expect(welcome).toBeVisible();
  await page.fill("#welcome-name-input", "Ada");
  await page.click("#welcome-name-btn");
  await expect(page.locator("#welcome-suggestions")).toBeVisible();
  await expect(page.locator("[data-welcome-follow]").first()).toBeVisible(); // Radica's maintainer at least
  await page.click("#welcome-people-btn");
  await page.click("#welcome-post-btn");
  await expect(welcome).toBeHidden();
  await expect(page.locator("#post-caption")).toBeFocused();
  await expect(page.locator("#sidebar-name")).toHaveText("Ada");
  await page.reload();
  await expect(page.locator("#post-caption")).toBeVisible();
  await expect(welcome).toBeHidden();
});

test("an unpublished post survives a reload, and publishing clears it", async ({ page }) => {
  await signIn(page);
  const tag = Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");
  await page.fill("#post-caption", `half written ${tag}`);
  await page.waitForTimeout(700); // the draft is saved shortly after typing stops
  await page.goto("/"); // not reload(): the browser itself would restore the textarea
  await expect(page.locator("#post-caption")).toHaveValue(`half written ${tag}`);
  await page.getByRole("button", { name: "Plant post" }).click();
  await expect(page.locator(".gram-card", { hasText: tag }).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000); // page storage is written shortly after a change
  await page.goto("/"); // not reload(): the browser itself would restore the textarea
  await expect(page.locator("#post-caption")).toHaveValue("");
});

test("a timed chat message shows once as its countdown redraws", async ({ page }) => {
  await page.goto("/");
  const rows = await page.evaluate(async () => {
    const { reconcileRows } = await import("/src/messengerChat.ts");
    const track = document.createElement("div");
    const row = (secs: number) => `<div class="rm-msg-row" data-msg-id="a">hi <span data-burn-at="${Date.now() + secs * 1000}">${secs}s</span></div>`;
    for (const s of [300, 299, 298]) reconcileRows(track, [{ key: "msg:a", html: row(s) }, { key: "msg:b", html: `<div class="rm-msg-row">b</div>` }]);
    return track.querySelectorAll(".rm-msg-row").length;
  });
  expect(rows).toBe(2);
});

test("opening another conversation removes the timed messages at once, without the burn effect", async ({ page }) => {
  await page.goto("/");
  const r = await page.evaluate(async () => {
    const { reconcileRows } = await import("/src/messengerChat.ts");
    const track = document.createElement("div");
    const timed = (id: string, at: number) => `<div class="rm-msg-row" data-msg-id="${id}">x <span data-burn-at="${at}">1s</span></div>`;
    reconcileRows(track, [{ key: "msg:live", html: timed("live", Date.now() + 3600_000) }, { key: "msg:due", html: timed("due", Date.now() - 1000) }]);
    reconcileRows(track, [{ key: "msg:other", html: `<div class="rm-msg-row">other chat</div>` }]);
    const rows = [...track.querySelectorAll<HTMLElement>(".rm-msg-row")];
    return { live: rows.some((n) => n.dataset.msgId === "live"), due: rows.some((n) => n.dataset.msgId === "due") };
  });
  expect(r.live).toBe(false); // gone at once: it was not burning
  expect(r.due).toBe(true); // a burned one stays for its animation
});

test("a comment can span lines: Shift+Enter breaks the line, Enter sends", async ({ page }) => {
  await signIn(page);
  const tag = Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");
  await page.fill("#post-caption", `lines ${tag}`);
  await page.getByRole("button", { name: "Plant post" }).click();
  const card = page.locator(".gram-card", { hasText: tag }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const box = card.locator(".comment-input");
  await box.click();
  await page.keyboard.type("first line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("second line");
  await expect(box).toHaveValue("first line\nsecond line"); // Shift+Enter did not send
  await page.keyboard.press("Enter");
  const text = card.locator(".comment-text", { hasText: "second line" });
  await expect(text).toBeVisible({ timeout: 15_000 });
  expect(await text.evaluate((el) => (el as HTMLElement).innerText)).toContain("first line\nsecond line");
  await expect(box).toHaveValue("");
});

test("beside the feed, the right panel's card is the one way to my profile", async ({ page }) => {
  await signIn(page);
  await expect(page.locator("#head-profile-btn")).toBeHidden();
  await expect(page.locator(".sidebar .profile-preview")).toBeVisible();
});

test("the feed size panel stays hidden while the feed is small", async ({ page }) => {
  await signIn(page);
  await expect(page.locator("#feed-size-panel")).toBeHidden();
});

test("a post can be reposted with my own words, and my profile grows a plant", async ({ page }) => {
  await signIn(page);
  const tag = Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");
  await page.fill("#post-caption", `original ${tag}`);
  await page.getByRole("button", { name: "Plant post" }).click();
  const original = page.locator(".gram-card", { hasText: tag }).first();
  await expect(original).toBeVisible({ timeout: 30_000 });

  await original.locator(".repost-btn").click();
  await expect(page.locator("#composer-repost .repost-card")).toContainText(tag); // the composer shows what is shared
  await page.fill("#post-caption", "worth a second look");
  await page.getByRole("button", { name: "Plant post" }).click(); // waits out the pause between posts
  const repost = page.locator(".gram-card", { hasText: "worth a second look" }).first();
  await expect(repost.locator(".repost-card")).toContainText(tag, { timeout: 30_000 });
  await expect(repost.locator(".gram-caption")).toHaveText("worth a second look"); // the link itself is not shown
  await expect(page.locator("#composer-repost")).toBeHidden();

  await repost.locator(".gram-author-name").click();
  await expect(page.locator("#uview-linfa .linfa-plant")).toBeVisible();
  await expect(page.locator("#uview-linfa .linfa-stage")).toHaveText("Seedling"); // a first post wakes the seed
  await expect(page.locator('#uview-tabs [data-tab="reposts"]')).toHaveText("Reposts (1)", { timeout: 30_000 });
});
