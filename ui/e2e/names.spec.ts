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

test("a person whose feed is already stored shows their name in chat, not their key", async ({ page }) => {
  await signIn(page);
  const stranger = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  await page.evaluate(async (stranger) => {
    // their feed, kept from an earlier visit; nothing in memory knows them yet and no node answers
    localStorage.setItem(`freenet_feed_${stranger}`, JSON.stringify({ owner: stranger, posts: {}, following: [], profile: { display_name: "Agent.69", bio: "", avatar_url: "", enc_pub: "", updated_at: 1, sig: "" } }));
    const { getIdentity } = await import("/src/crypto.ts");
    const { freenet } = await import("/src/freenet.ts");
    const room = await freenet.createPrivateRoom((await getIdentity())!, "lobby", []);
    const f = freenet as unknown as { handlePeerEvent(d: unknown): void };
    f.handlePeerEvent({ type: "chat", message: { id: `m_${Date.now()}`, room_id: room.id, sender: stranger, recipient: "", text: "hello from the community", timestamp: Date.now(), sig: "" } });
  }, stranger);
  await page.locator("#open-chat-btn").click();
  await page.locator(".rm-conv-item", { hasText: "lobby" }).first().click();
  const row = page.locator(".rm-msg-row.theirs", { hasText: "hello from the community" }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("Agent.69", { timeout: 20_000 });
});

test("my directory announcement carries the proof of work readers weigh it by", async ({ page }) => {
  await signIn(page);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { freenet } = await import("/src/freenet.ts");
          const { directoryWeights } = await import("/src/logfold.ts");
          const f = freenet as unknown as { me: string; logEntries(n: string): never[] };
          return directoryWeights(f.logEntries("directory")).get(f.me) ?? 0;
        }),
      { timeout: 60_000, intervals: [1000] },
    )
    .toBeGreaterThanOrEqual(1);
});
