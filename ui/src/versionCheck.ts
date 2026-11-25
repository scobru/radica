// New release check: every build writes version.json (its build id and the Updates list) next to index.html. The open
// page fetches it now and then; a different build id means a newer Radica was published, and the page offers a reload.
// It also checks GitHub Releases for native desktop and Android app updates, offering 1-click downloads.

import { UPDATES } from "./updates.ts";
import { escapeHtml } from "./html.ts";
import { hasNativeBridge, openExternalUrl } from "./platformBridge.ts";
import { restart } from "./whoiam.ts";

declare const __RADICA_BUILD__: string;
declare const __RADICA_VERSION__: string;

const CHECK_EVERY_MS = 5 * 60_000;
const NATIVE_CHECK_EVERY_MS = 30 * 60_000; // Check GitHub releases every 30 minutes
const MAX_NOTES = 5;
let dismissedBuild = ""; // "Later" on this build: do not ask again until the page reloads or a newer one ships
let dismissedNativeVersion = ""; // "Later" on this GitHub release: do not ask again this session
let lastNativeCheckTs = 0;

export const GITHUB_REPO = "scobru/radica";
export const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const GITHUB_RAW_PACKAGE = `https://raw.githubusercontent.com/${GITHUB_REPO}/master/package.json`;

/** Current semantic version of the application. */
export function getAppVersion(): string {
  return typeof __RADICA_VERSION__ !== "undefined" ? __RADICA_VERSION__ : "1.1.1";
}

/** Returns true if remote semantic version is strictly newer than current. */
export function isNewerVersion(remote: string, current = getAppVersion()): boolean {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/, "")
      .split(/[-+]/)[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);

  const [rMaj = 0, rMin = 0, rPatch = 0] = parse(remote);
  const [cMaj = 0, cMin = 0, cPatch = 0] = parse(current);

  if (rMaj !== cMaj) return rMaj > cMaj;
  if (rMin !== cMin) return rMin > cMin;
  return rPatch > cPatch;
}

/** Resolves the proper release binary or APK download URL for the active platform. */
export function getNativeDownloadUrl(
  isMessenger: boolean,
  userAgent: string = typeof navigator !== "undefined" ? navigator.userAgent : ""
): string {
  const isAndroid = /Android/i.test(userAgent);
  const isMac = /Macintosh|Mac OS X/i.test(userAgent);
  const isLinux = /Linux|X11/i.test(userAgent);
  const baseUrl = `https://github.com/${GITHUB_REPO}/releases/latest/download/`;

  if (isAndroid) {
    return `${baseUrl}${isMessenger ? "radica-messenger-android.apk" : "radica-android.apk"}`;
  }
  if (isMac) {
    return `${baseUrl}${isMessenger ? "radica-messenger-macos-arm64.zip" : "radica-macos-arm64.zip"}`;
  }
  if (isLinux) {
    return `${baseUrl}${isMessenger ? "radica-messenger-linux-x86_64.tar.gz" : "radica-linux-x86_64.tar.gz"}`;
  }
  // Windows default
  return `${baseUrl}${isMessenger ? "radica-messenger-windows-x86_64.zip" : "radica-windows-x86_64.zip"}`;
}

/** An Updates entry in a few words: its first sentence, cut at 100 characters. */
export function shortNote(text: string): string {
  const first = text.split(/(?<=[.!?])\s/)[0];
  return first.length > 100 ? `${first.slice(0, 99)}…` : first;
}

/** What the new release adds over this one: its Updates entries this build does not have, in short. */
export function newNotes(remote: { text: string }[], local: { text: string }[] = UPDATES): string[] {
  const known = new Set(local.map((u) => u.text));
  return remote
    .filter((u) => !known.has(u.text))
    .slice(0, MAX_NOTES)
    .map((u) => shortNote(u.text));
}

function showReloadModal(build: string, notes: string[]): void {
  if (document.getElementById("version-modal")) return;
  const el = document.createElement("div");
  el.id = "version-modal";
  el.className = "modal-overlay";
  el.style.zIndex = "10000";
  el.setAttribute("role", "alertdialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "version-modal-title");
  el.innerHTML = `<div class="modal-card" style="max-width: 440px;">
    <h3 id="version-modal-title" style="margin: 0 0 12px;">🌱 New version of Radica</h3>
    ${notes.length ? `<ul style="margin: 0 0 16px; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem;">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : ""}
    <p style="margin: 0 0 16px; font-size: 0.85rem; opacity: 0.8;">Reload when you are ready. Until then some features may not work with the network.</p>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button type="button" class="btn-secondary" id="version-modal-later">Later</button>
      <button type="button" class="btn-primary" id="version-modal-reload">Reload now</button>
    </div>
  </div>`;
  document.body.append(el);
  const later = () => {
    dismissedBuild = build;
    el.remove();
  };
  el.querySelector("#version-modal-later")!.addEventListener("click", later);
  el.addEventListener("keydown", (e) => e.key === "Escape" && later());
  const btn = el.querySelector<HTMLButtonElement>("#version-modal-reload")!;
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Reloading…";
    restart();
  });
  btn.focus();
}

/** Show native update notification modal for Desktop & Android releases. */
export function showNativeUpdateModal(version: string, downloadUrl: string, releaseNotes?: string): void {
  if (document.getElementById("native-update-modal")) return;
  const isMessenger = typeof document !== "undefined" && document.documentElement.getAttribute("data-app-mode") === "messenger";
  const appName = isMessenger ? "Radica Messenger" : "Radica";
  const cleanVer = version.replace(/^v/, "");
  const el = document.createElement("div");
  el.id = "native-update-modal";
  el.className = "modal-overlay";
  el.style.zIndex = "10001";
  el.setAttribute("role", "alertdialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "native-update-title");
  el.innerHTML = `<div class="modal-card" style="max-width: 440px;">
    <h3 id="native-update-title" style="margin: 0 0 12px; display: flex; align-items: center; gap: 8px;">
      <span>🌱 New ${escapeHtml(appName)} Release: v${escapeHtml(cleanVer)}</span>
    </h3>
    <p style="margin: 0 0 12px; font-size: 0.9rem; line-height: 1.5;">
      A newer release of <b>${escapeHtml(appName)}</b> is available on GitHub. You can download and install the update directly.
    </p>
    ${releaseNotes ? `<p style="margin: 0 0 14px; font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(shortNote(releaseNotes))}</p>` : ""}
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button type="button" class="btn-secondary" id="native-update-later">Later</button>
      <button type="button" class="btn-primary" id="native-update-download">Download &amp; Update</button>
    </div>
  </div>`;
  document.body.append(el);
  const later = () => {
    dismissedNativeVersion = version;
    el.remove();
  };
  el.querySelector("#native-update-later")!.addEventListener("click", later);
  el.addEventListener("keydown", (e) => e.key === "Escape" && later());
  const btn = el.querySelector<HTMLButtonElement>("#native-update-download")!;
  btn.addEventListener("click", () => {
    openExternalUrl(downloadUrl, { fallbackWindowOpen: true });
    el.remove();
  });
  btn.focus();
}

/** Queries GitHub Releases API (falling back to raw package.json) for the newest tagged release. */
export async function fetchLatestReleaseVersion(): Promise<{ version: string; notes?: string } | null> {
  try {
    const res = await fetch(GITHUB_RELEASES_API, {
      headers: { Accept: "application/vnd.github.v3+json" },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.tag_name === "string") {
        return { version: data.tag_name, notes: typeof data?.body === "string" ? data.body : undefined };
      }
    }
  } catch {}

  try {
    const rawRes = await fetch(GITHUB_RAW_PACKAGE, { cache: "no-store" });
    if (rawRes.ok) {
      const pkg = await rawRes.json();
      if (typeof pkg?.version === "string") {
        return { version: pkg.version };
      }
    }
  } catch {}

  return null;
}

/** Checks for native Desktop & Android application updates. */
export async function checkNativeAppUpdate(options?: {
  force?: boolean;
  onResult?: (res: { hasUpdate: boolean; version?: string }) => void;
}): Promise<void> {
  if (!options?.force && !hasNativeBridge()) {
    options?.onResult?.({ hasUpdate: false });
    return;
  }
  const now = Date.now();
  if (!options?.force && now - lastNativeCheckTs < NATIVE_CHECK_EVERY_MS) {
    options?.onResult?.({ hasUpdate: false });
    return;
  }
  lastNativeCheckTs = now;

  const latest = await fetchLatestReleaseVersion();
  if (!latest) {
    options?.onResult?.({ hasUpdate: false });
    return;
  }

  const current = getAppVersion();
  const hasUpdate = isNewerVersion(latest.version, current);
  options?.onResult?.({ hasUpdate, version: latest.version });

  if (hasUpdate && latest.version !== dismissedNativeVersion) {
    const isMessenger = typeof document !== "undefined" && document.documentElement.getAttribute("data-app-mode") === "messenger";
    const downloadUrl = getNativeDownloadUrl(isMessenger);
    showNativeUpdateModal(latest.version, downloadUrl, latest.notes);
  }
}

async function check(): Promise<void> {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const remote = await res.json();
    if (typeof remote?.build === "string" && remote.build !== __RADICA_BUILD__ && remote.build !== dismissedBuild)
      showReloadModal(remote.build, newNotes(Array.isArray(remote.updates) ? remote.updates : []));
  } catch {} // offline or no version.json (dev server): try again later
}

/** Look for a newer release now, every few minutes, and whenever the tab comes back into view. */
export function startVersionCheck(): void {
  if (typeof __RADICA_BUILD__ === "undefined") return; // not built by Vite (tests)
  void check();
  void checkNativeAppUpdate();
  setInterval(() => {
    void check();
    void checkNativeAppUpdate();
  }, CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void check();
      void checkNativeAppUpdate();
    }
  });
}
