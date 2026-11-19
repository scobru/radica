import type { Moderator, Moderation } from "@desert-ant-labs/moderator";
import { heavyUrl } from "./heavyAssets.ts";
import { filterWasmResponse } from "./filterWasm.ts";

// The package instantiates its 46 MB wasm core at import time (top-level await): a static import would download and
// compile it on every page load, so it is imported only when an image is first scanned.

let moderatorInstance: Moderator | null = null;
let loadPromise: Promise<Moderator | null> | null = null;

/**
 * Lazily loads the on-device Desert Ant Moderator model via WebAssembly & LiteRT.
 * Cached in browser cache after first load (~9-10 MB).
 */
export async function getModerator(): Promise<Moderator | null> {
  if (moderatorInstance) return moderatorInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      console.log("[Moderation] Loading Desert Ant on-device model...");
      // Self-hosted first (the Freenet gateway's CSP blocks jsDelivr and Hugging Face); the model file
      // ui/public/moderation/model/moderator.tflite is optional, without it the default download is used.
      const here = (p: string) => new URL(heavyUrl(p), document.baseURI).href;
      // the build swaps the package's own wasm fetch for this (vite.config.ts, moderatorWasmPlugin)
      (globalThis as { __radicaFilterWasm?: () => Promise<Response> }).__radicaFilterWasm = () => filterWasmResponse(here("moderation/filter/ModeratorWeb.gz.bin"));
      const { Moderator } = await import("@desert-ant-labs/moderator");
      moderatorInstance = await Moderator.load({
        litertWasmDir: here("moderation/litert/"),
        modelBaseUrl: here("moderation/model/"),
      }).catch(() => Moderator.load());
      console.log("[Moderation] Desert Ant Moderator loaded successfully on-device.");
      return moderatorInstance;
    } catch (err) {
      console.warn("[Moderation] Could not initialize @desert-ant-labs/moderator:", err);
      return null;
    }
  })();

  return loadPromise;
}

export interface ImageModerationResult {
  isNSFW: boolean;
  score: number;
  label: string;
  /** The scan did not run (model missing or errored): the image is NOT verified safe. */
  unverified?: boolean;
  details?: Record<string, number>;
}

/**
 * Scans an image on-device using Desert Ant Moderator.
 * Accepts File, Blob, HTMLImageElement or a canvas (a video frame).
 */
export async function analyzeImageFile(
  fileOrBlob: Blob | File | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas
): Promise<ImageModerationResult> {
  let bitmap: ImageBitmap | null = null;
  try {
    const mod = await getModerator();
    if (!mod) {
      return { isNSFW: false, score: 0, label: "Unmoderated", unverified: true };
    }

    let target: ImageBitmapSource = fileOrBlob;
    if (typeof createImageBitmap !== "undefined" && (fileOrBlob instanceof Blob || fileOrBlob instanceof File)) {
      bitmap = await createImageBitmap(fileOrBlob);
      target = bitmap;
    }

    const res: Moderation = await mod.analyze(target, {
      threshold: 0.5,
      policy: "standard",
      quality: "balanced",
    });

    let topRegion = "";
    let maxRegionScore = 0;
    if (res.regions) {
      for (const [key, val] of Object.entries(res.regions)) {
        if (typeof val === "number" && val > maxRegionScore) {
          maxRegionScore = val;
          topRegion = key;
        }
      }
    }

    return {
      isNSFW: res.isNSFW,
      score: Math.round(res.score * 100) / 100,
      label: res.isNSFW ? `NSFW (${topRegion || "Explicit"})` : "Safe",
      details: res.regions as unknown as Record<string, number>,
    };
  } catch (err) {
    console.warn("[Moderation] Image analysis failed:", err);
    return { isNSFW: false, score: 0, label: "Check failed", unverified: true };
  } finally {
    bitmap?.close();
  }
}

export interface TextCensorshipResult {
  censoredText: string;
  hasCensoredPII: boolean;
  hasCensoredProfanity: boolean;
  details: string[];
}

export interface TextModerationResult {
  isToxic: boolean;
  containsPII: boolean;
  warnings: string[];
}

// ponytail: pre-compile regexes once at module load instead of 57 RegExp allocations + double .test/.replace passes per call
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const CC_RE = /\b(?:\d[ -]*?){13,19}\b/g;
const IBAN_RE = /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\b/gi;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const CF_RE = /\b[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]\b/gi;
const PHONE_RE = /(?:\+?39[\s.-]?)?(?:3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}|0\d{1,4}[\s.-]?\d{5,8}|\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b)/g;

const BAD_WORDS = [
  // Italiano
  "cazzo", "cazzi", "cazzata", "cazzate", "incazzare", "incazzato", "incazzata", "incazzati",
  "merda", "merde", "merdoso", "merdosa", "stronzo", "stronza", "stronzi", "stronze",
  "vaffanculo", "fanculo", "puttana", "puttane", "troia", "troie", "mignotta", "zoccola", "zoccole",
  "bastardo", "bastardi", "bastarda", "bastarde", "frocio", "froci", "finocchio", "negro", "negri",
  "coglione", "coglioni", "cogliona", "deficiente", "deficienti", "cretino", "cretina", "cretini",
  "idiota", "idioti", "porco dio", "porca madonna", "dio cane", "dio porco",
  // English
  "fuck", "fucking", "fucked", "fucker", "fuckers", "shit", "shitty", "bitch", "bitches",
  "asshole", "assholes", "bastard", "bastards", "nigger", "nigga", "faggot", "fag",
  "cunt", "dick", "pussy", "whore", "whores", "slut", "sluts", "nazi", "hitler",
  "kill yourself", "kys", "motherfucker",
];
const BAD_WORDS_RE = new RegExp(`\\b(?:${BAD_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");

const PROFANITY_DETAIL = "Inappropriate language / profanity";

/** Bad words as asterisks: applied when reading (the reader's choice), never to what the author publishes. */
const URL_OR_BAD_RE = new RegExp(`${URL_RE.source}|${BAD_WORDS_RE.source}`, "gi");
export const maskProfanity = (text: string): string =>
  text.replace(URL_OR_BAD_RE, (m) => (/^(?:https?:\/\/|www\.)/i.test(m) ? m : "*".repeat(m.length))); // a link stays whole

/** The kinds of personal data in a text (email, phone, card…), to ask the author before it is published. */
export const personalDataIn = (text: string): string[] => censorTextAndPII(text).details.filter((d) => d !== PROFANITY_DETAIL);

/**
 * Automatically censors sensitive personal data (PII) like emails, phone numbers,
 * credit cards, IBANs, tax IDs, and bad words/profanities (Italian & English).
 */
export function censorTextAndPII(text: string): TextCensorshipResult {
  // Links are set aside while the patterns run: ids and dates in a URL look like phone or card numbers.
  // shortcut: a phone number written inside a URL's query string is left alone
  const urls: string[] = [];
  let censored = text.replace(URL_RE, (u) => `\uE000${urls.push(u) - 1}\uE001`);
  const details: string[] = [];
  let hasCensoredPII = false;
  let hasCensoredProfanity = false;

  // 1. Credit Card numbers (13 to 19 digits)
  let prev = censored;
  censored = censored.replace(CC_RE, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19) {
      hasCensoredPII = true;
      return "[💳 CARD DATA REDACTED]";
    }
    return match;
  });
  if (censored !== prev) details.push("Credit card / payment details");

  // 2. IBAN numbers (IT + European formats)
  prev = censored;
  censored = censored.replace(IBAN_RE, "[🏦 IBAN REDACTED]");
  if (censored !== prev) {
    hasCensoredPII = true;
    details.push("Bank IBAN number");
  }

  // 3. Email addresses
  prev = censored;
  censored = censored.replace(EMAIL_RE, "[📧 EMAIL REDACTED]");
  if (censored !== prev) {
    hasCensoredPII = true;
    details.push("Email address");
  }

  // 4. Italian Codice Fiscale / Tax IDs (16 characters)
  prev = censored;
  censored = censored.replace(CF_RE, "[🪪 TAX ID REDACTED]");
  if (censored !== prev) {
    hasCensoredPII = true;
    details.push("Tax ID / Codice Fiscale");
  }

  // 5. Phone numbers (Italian + international)
  prev = censored;
  censored = censored.replace(PHONE_RE, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) {
      hasCensoredPII = true;
      return "[📱 PHONE NUMBER REDACTED]";
    }
    return match;
  });
  if (censored !== prev) details.push("Phone number");

  // 6. Bad words / profanities / hate speech (Italian + English)
  prev = censored;
  censored = maskProfanity(censored);
  if (censored !== prev) {
    hasCensoredProfanity = true;
    details.push(PROFANITY_DETAIL);
  }

  return {
    censoredText: urls.length ? censored.replace(/\uE000(\d+)\uE001/g, (_, i) => urls[Number(i)]) : censored,
    hasCensoredPII,
    hasCensoredProfanity,
    details,
  };
}

/**
 * Fast on-device check for Personally Identifiable Information (PII)
 * and severe toxic / abusive language.
 */
export function analyzeTextContent(text: string): TextModerationResult {
  const result = censorTextAndPII(text);
  return {
    isToxic: result.hasCensoredProfanity,
    containsPII: result.hasCensoredPII,
    warnings: result.details,
  };
}
