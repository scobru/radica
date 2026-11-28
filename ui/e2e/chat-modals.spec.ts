import { test, expect, type Page } from "@playwright/test";

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

test("the chat's safety-number and new-message windows close with their X", async ({ page }) => {
  await signIn(page);
  const sender = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  await page.evaluate(async (sender) => {
    const { freenet } = await import("/src/freenet.ts");
    const f = freenet as unknown as { me: string; getRoomId(a: string, b: string): string; handlePeerEvent(d: unknown): void };
    f.handlePeerEvent({ type: "chat", message: { id: `m_${Date.now()}`, room_id: f.getRoomId(f.me, sender), sender, recipient: f.me, text: "hello from a stranger", timestamp: Date.now(), sig: "" } });
  }, sender);
  await page.click("#open-chat-btn");
  await page.locator(".rm-conv-item", { hasText: "hello from a stranger" }).first().click();

  await page.click("#rm-inline-verify-btn");
  await expect(page.locator("#rm-safety-modal")).toHaveClass(/\bopen\b/);
  await page.click("#rm-safety-modal-close");
  await expect(page.locator("#rm-safety-modal")).not.toHaveClass(/\bopen\b/);

  await page.click('button[title="New chat, group or channel"]');
  await page.click("#rm-btn-new-chat");
  await expect(page.locator("#rm-new-chat-modal")).toHaveClass(/\bopen\b/);
  await page.click("#rm-new-chat-close");
  await expect(page.locator("#rm-new-chat-modal")).not.toHaveClass(/\bopen\b/);
});

test("a poll can be taken back out of a post before it is planted", async ({ page }) => {
  await signIn(page);
  await page.click("#poll-toggle-btn");
  await page.fill("#poll-options", "yes\nno");
  await page.click("#poll-remove-btn");
  await expect(page.locator("#poll-fields")).toBeHidden();
  await page.click("#poll-toggle-btn");
  await expect(page.locator("#poll-options")).toHaveValue("");
});

test("editing in a room that cannot seal the edit sends nothing in the clear", async ({ page }) => {
  await signIn(page);
  const leaked = await page.evaluate(async () => {
    const { freenet } = await import("/src/freenet.ts");
    const f = freenet as unknown as { me: string; editChatMessage(r: string, m: string, t: string): Promise<void> };
    const secret = "a".repeat(64), other = "b".repeat(64);
    const rooms = [`secret_${[f.me, secret].sort().join("_")}`, `unknown_${other}`];
    for (const r of rooms) await f.editChatMessage(r, "m1", "my private words").catch(() => {});
    return Object.keys(localStorage).filter((k) => k.startsWith("freenet_log_")).some((k) => (localStorage.getItem(k) ?? "").includes("my private words"));
  });
  expect(leaked).toBe(false);
});
