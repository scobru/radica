// Translate what I am writing before I publish it (post, comment, chat), on this device like the reading side.
// A small 🌐 menu next to each box: pick a language, the box's text is replaced by the translation, "Undo" brings it back.
import { LANGS, availableLangs, detectLang, readerLang, translateText } from "./translate.ts";

// kept as written: code, attachments, Markdown and raw links, mentions (Radica's @Name, River's), #tags, line breaks
const KEEP_RE = /```[\s\S]*?```|`[^`\n]+`|\[radica-cm1:[^\]]+\]|@\[[^\]\n]{1,64}\]\(rv:[0-9A-Za-z]+\)|\[[^\]\n]*\]\([^)\s]+\)|(?:https?:\/\/|www\.)[^\s<>"']+|@\S+|#[\p{L}\p{N}_]+|\n/gu;

/** The text translated piece by piece between what is kept, so links, mentions and tags come out unchanged. */
export async function translateKeeping(
  text: string,
  from: string,
  to: string,
  tr: (t: string, from: string, to: string) => Promise<string> = translateText
): Promise<string> {
  const piece = async (s: string) => {
    const core = s.trim();
    if (!/\p{L}/u.test(core)) return s; // spaces, punctuation, numbers: nothing to translate
    const at = s.indexOf(core);
    return s.slice(0, at) + (await tr(core, from, to)) + s.slice(at + core.length);
  };
  let out = "";
  let last = 0;
  for (const m of text.matchAll(KEEP_RE)) {
    out += (await piece(text.slice(last, m.index))) + m[0];
    last = m.index! + m[0].length;
  }
  return out + (await piece(text.slice(last)));
}

/** The 🌐 menu for the box with id `forId`. */
export function draftTranslateHtml(forId: string): string {
  const langs = availableLangs().map((l) => `<option value="${l}">→ ${LANGS[l]}</option>`).join("");
  return `<select class="draft-translate" data-for="${forId}" title="Translate what you wrote" aria-label="Translate what you wrote"><option value="">🌐</option>${langs}<option value="undo">↩ Undo</option></select>`;
}

type Box = { value: string; dispatchEvent?: (e: Event) => boolean };
const before = new WeakMap<object, { original: string; translated: string; to: string }>();

/** Remember a translation done in `box`, so Undo and `draftTranslatedTo` know about it. */
export function noteDraftTranslate(box: Box, original: string, translated: string, to: string): void {
  before.set(box, { original, translated, to });
}

/** The language the box's text was translated to, while it still holds that translation untouched; else null. */
export function draftTranslatedTo(box: Box): string | null {
  const b = before.get(box);
  return b && box.value === b.translated ? b.to : null;
}

/** Bring back what I wrote before the last translation; false when there is nothing to undo (box edited since). */
export function undoDraftTranslate(box: Box): boolean {
  const b = before.get(box);
  if (!b || box.value !== b.translated) return false;
  box.value = b.original;
  box.dispatchEvent?.(new Event("input", { bubbles: true })); // the box's own handlers: resize, draft, chip
  return true;
}

/** One listener for every 🌐 menu on the page, wherever and whenever it is drawn. */
export function initDraftTranslate(toast: (msg: string, type?: "info" | "warning" | "error") => void): void {
  document.addEventListener("change", async (e) => {
    const sel = (e.target as HTMLElement).closest?.<HTMLSelectElement>("select.draft-translate");
    if (!sel) return;
    const to = sel.value;
    sel.value = "";
    const box = document.getElementById(sel.dataset.for ?? "") as HTMLTextAreaElement | HTMLInputElement | null;
    if (!box || !to) return;
    const set = (v: string) => {
      box.value = v;
      box.dispatchEvent(new Event("input", { bubbles: true })); // the box's own handlers: resize, draft
    };
    if (to === "undo") {
      if (!undoDraftTranslate(box)) toast("Nothing to undo.", "info");
      return;
    }
    const text = box.value;
    if (!text.trim()) return;
    // too short to tell: I am most likely writing in my own language
    const from = detectLang(text) ?? readerLang();
    if (from === to) return toast(`This already reads as ${LANGS[to]}.`, "info");
    sel.disabled = true;
    sel.options[0].textContent = "⏳";
    try {
      const translated = await translateKeeping(text, from, to);
      if (box.value !== text) return; // I kept typing meanwhile: my words win
      noteDraftTranslate(box, text, translated, to);
      set(translated);
    } catch (err) {
      toast(`Could not translate: ${(err as Error)?.message || err}`, "error");
    } finally {
      sel.disabled = false;
      sel.options[0].textContent = "🌐";
    }
  });
}
