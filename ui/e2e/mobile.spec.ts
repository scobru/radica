import { test, expect, type Page } from "@playwright/test";

// Run on a phone (playwright.config.ts: the "mobile" project).

async function signIn(page: Page) {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Keypair" }).click();
  await expect(page.locator("#identity-modal")).toBeHidden();
  await page.click("#welcome-skip-btn");
  await expect(page.locator("#welcome-modal")).toBeHidden();
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

test("on a phone, Enter in the Messenger box starts a new line and the box holds only the text", async ({ page }) => {
  await signIn(page);
  const sender = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  await page.evaluate(async (sender) => {
    const { freenet } = await import("/src/freenet.ts");
    const f = freenet as unknown as { me: string; getRoomId(a: string, b: string): string; handlePeerEvent(d: unknown): void };
    f.handlePeerEvent({ type: "chat", message: { id: `m_${Date.now()}`, room_id: f.getRoomId(f.me, sender), sender, recipient: f.me, text: "hello there", timestamp: Date.now(), sig: "" } });
  }, sender);
  await page.click("#open-chat-btn");
  await page.locator(".rm-conv-item", { hasText: "hello there" }).first().click();
  await expect(page.locator(".rm-msg-row", { hasText: "hello there" }).first()).toBeVisible({ timeout: 20_000 });
  const input = page.locator("#rm-composer-input");

  // only the textarea in the pill, and the default placeholder fits on one line at 412 px
  await expect(page.locator("#rm-btn-quick-emoji")).toHaveCount(0);
  await expect(page.locator(".rm-input-pill select.draft-translate")).toHaveCount(0);
  const fit = await input.evaluate((el: HTMLTextAreaElement) => {
    const s = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const room = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    return { text: el.placeholder, width: ctx.measureText(el.placeholder).width, room };
  });
  expect(fit.width, `"${fit.text}" fits`).toBeLessThanOrEqual(fit.room);

  await input.fill("line one");
  await input.press("Enter");
  await expect(input).toHaveValue("line one\n");
  await expect(page.locator(".rm-msg-row", { hasText: "line one" })).toHaveCount(0);
});
