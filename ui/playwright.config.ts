// UI smoke tests in a real browser, against the dev server and no Freenet node: the app runs offline (an identity made
// on the page, posts kept locally), which is enough to catch layout and keyboard regressions.
import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:5199", trace: "retain-on-failure", locale: "en-US" },
  projects: [
    { name: "desktop", testIgnore: /mobile\.spec/ },
    { name: "mobile", testMatch: /mobile\.spec/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx vite --port 5199 --strictPort",
    cwd: fs.realpathSync.native(import.meta.dirname),
    url: "http://localhost:5199",
    reuseExistingServer: !process.env.CI,
  },
});
