// New release check: every build writes version.json (its build id and the Updates list) next to index.html. The open
// page fetches it now and then; a different build id means a newer Radica was published, and the page offers a reload.

import { UPDATES } from "./updates.ts";
import { escapeHtml } from "./html.ts";
import { restart } from "./whoiam.ts";

declare const __RADICA_BUILD__: string;

const CHECK_EVERY_MS = 5 * 60_000;
const MAX_NOTES = 5;
let dismissedBuild = ""; // "Later" on this build: do not ask again until the page reloads or a newer one ships

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
  setInterval(() => void check(), CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void check());
}
