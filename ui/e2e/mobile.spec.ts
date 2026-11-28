import { test, expect, type Page } from "@playwright/test";

// Run on a phone (playwright.config.ts: the "mobile" project).

async function signIn(page: Page) {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  const guestSignIn = page.locator("#guest-signin-btn");
  const createKey = page.getByRole("button", { name: "Create New Keypair" });
  await expect(guestSignIn.or(createKey)).toBeVisible();
  if (await guestSignIn.isVisible()) await guestSignIn.click();
  await createKey.click();
  await expect(page.locator("#identity-modal")).toBeHidden({ timeout: 20_000 });
  await page.click("#welcome-skip-btn");
  await expect(page.locator("#welcome-modal")).toBeHidden({ timeout: 15_000 });
}

test("on a phone, my picture opens my profile and Communities does not repeat it", async ({ page }) => {
  await signIn(page);
  await page.click("#head-panel-btn");
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".sidebar .profile-preview")).toBeHidden();
  await expect(page.locator(".sidebar .roots-card")).toBeHidden();
  await page.click("#panel-back-btn");
  await page.click("#head-profile-btn");
  await expect(page.locator("#profile-page")).toBeVisible();
});

test("swiping someone's chat message to the right mentions them", async ({ page }) => {
  await signIn(page);
  const sender = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  await page.evaluate(async (sender) => {
    const { freenet } = await import("/src/freenet.ts");
    const f = freenet as unknown as { me: string; getRoomId(a: string, b: string): string };
    const message = { id: `m_${Date.now()}`, room_id: f.getRoomId(f.me, sender), sender, recipient: f.me, text: "hello from a stranger", timestamp: Date.now(), sig: "" };
    (freenet as unknown as { handlePeerEvent(d: unknown): void }).handlePeerEvent({ type: "chat", message });
  }, sender);
  await page.click("#open-chat-btn");
  await page.locator(".rm-conv-item", { hasText: "hello from a stranger" }).first().click();
  const row = page.locator(".rm-msg-row.theirs", { hasText: "hello from a stranger" }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + 40;
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)!;
    const touch = (cx: number) => [new Touch({ identifier: 1, target: el, clientX: cx, clientY: y })];
    el.dispatchEvent(new TouchEvent("touchstart", { touches: touch(x), bubbles: true }));
    el.dispatchEvent(new TouchEvent("touchmove", { touches: touch(x + 90), bubbles: true }));
    el.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
  }, { x, y });
  await expect(page.locator("#rm-composer-input")).toHaveValue(/^@\S.* $/);
});

test("swiping a post to the left mentions its author in its comment box", async ({ page }) => {
  await signIn(page);
  const tag = Math.random().toString(36).slice(2, 8).replace(/\d/g, "x");
  await page.fill("#post-caption", `swipe me ${tag}`);
  await page.getByRole("button", { name: "Plant post" }).click();
  const card = page.locator(".gram-card", { hasText: tag }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const box = (await card.locator(".gram-card-header").boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width - 60;
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)!;
    const touch = (cx: number) => [new Touch({ identifier: 1, target: el, clientX: cx, clientY: y })];
    el.dispatchEvent(new TouchEvent("touchstart", { touches: touch(x), bubbles: true }));
    el.dispatchEvent(new TouchEvent("touchmove", { touches: touch(x - 90), bubbles: true }));
    el.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
  }, { x, y });
  await expect(card.locator("textarea.comment-input")).toHaveValue(/^@\S.* $/);
});

test("on a phone, Enter inserts a newline without sending and the composer pill stays clean", async ({ page }) => {
  await signIn(page);
  const sender = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  await page.evaluate(async (sender) => {
    const { freenet } = await import("/src/freenet.ts");
    const f = freenet as unknown as { me: string; getRoomId(a: string, b: string): string };
    const message = { id: `m_${Date.now()}`, room_id: f.getRoomId(f.me, sender), sender, recipient: f.me, text: "hello mobile composer", timestamp: Date.now(), sig: "" };
    (freenet as unknown as { handlePeerEvent(d: unknown): void }).handlePeerEvent({ type: "chat", message });
  }, sender);
  await page.click("#open-chat-btn");
  await page.locator(".rm-conv-item", { hasText: "hello mobile composer" }).first().click();
  const input = page.locator("#rm-composer-input");
  await expect(input).toBeVisible({ timeout: 20_000 });
  await expect(input).toBeEnabled();

  const metrics = await input.evaluate((el: HTMLTextAreaElement) => ({
    placeholder: el.placeholder,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));

  await input.focus();
  await page.keyboard.type("line one");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("line one\n");

  await expect(page.locator("#rm-btn-quick-emoji")).toHaveCount(0);
  await expect(page.locator(".rm-input-pill select.draft-translate")).toHaveCount(0);
  await expect(page.locator("#rm-attach-translate select.draft-translate")).toHaveCount(1);

  expect(
    metrics.scrollWidth,
    `placeholder "${metrics.placeholder}" overflows #rm-composer-input (scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth})`,
  ).toBeLessThanOrEqual(metrics.clientWidth);
});

test("on a phone, Back out of Reels restores the bottom rail", async ({ page }) => {
  await signIn(page);
  const openMedia = page.locator("#open-media-btn");
  if (!(await openMedia.isVisible())) {
    await page.click("#rail-more-btn");
  }
  await openMedia.click();
  await expect(page.locator("#media-modal")).toBeVisible();

  await page.locator('.moments-filter-btn[data-mfilter="reels"]').click();
  await expect(page.locator("body")).toHaveClass(/\breels-fullscreen-mobile\b/);
  await expect(page.locator(".rail")).toBeHidden();

  await page.goBack();
  await expect(page.locator("body")).not.toHaveClass(/\breels-fullscreen-mobile\b/);
  await expect(page.locator(".rail")).toBeVisible();
});
