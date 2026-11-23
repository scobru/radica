import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeChatMediaToken,
  parseChatMedia,
  maskChatMediaTokens,
  summarizeChatMediaText,
  sealChatMedia,
  openChatMedia,
  normalizeAudioMime,
  formatMediaDuration,
  formatBytes,
  fileExtensionIcon,
  defaultWaveform,
  normalizePeaksToBars,
  chatMediaCardsHtml,
  MAX_CHAT_MEDIA_PLAIN,
  MAX_CHAT_MEDIA_SEALED,
  sealChatMediaChunked,
  fetchChatMedia,
  uploadChatMedia,
  sendChatAttachment,
  syncMiniPlayerSlot,
  normalizeVideoMime,
  videoNotePlan,
  canUseLiveMediaCapture,
  canRecordVoice,
  canCaptureVideoNote,
  hasNativeVoiceBridge,
  startVideoNoteRecording,
  startVoiceRecording,
} from "../src/chatMedia.ts";
import { mediaHashOf } from "../src/media.ts";

test("chatMedia: formatMediaDuration formats seconds properly", () => {
  assert.equal(formatMediaDuration(0), "0:00");
  assert.equal(formatMediaDuration(5), "0:05");
  assert.equal(formatMediaDuration(65), "1:05");
  assert.equal(formatMediaDuration(120), "2:00");
  assert.equal(formatMediaDuration(365), "6:05");
});

test("chatMedia: normalizeAudioMime maps audio formats to safe MIME strings", () => {
  assert.equal(normalizeAudioMime("audio/webm"), "audio/webm");
  assert.equal(normalizeAudioMime("audio/ogg"), "audio/ogg");
  assert.equal(normalizeAudioMime("audio/mp3", "track.mp3"), "audio/mpeg");
  assert.equal(normalizeAudioMime("", "speech.opus"), "audio/ogg");
  assert.equal(normalizeAudioMime("audio/x-wav"), "audio/wav");
  assert.equal(normalizeAudioMime("application/octet-stream", "note.m4a"), "audio/mp4");
  assert.equal(normalizeAudioMime("application/pdf"), null);
});

test("chatMedia: defaultWaveform and normalizePeaksToBars generate valid heights", () => {
  const wf = defaultWaveform("deadbeef12345678", 28);
  assert.equal(wf.length, 28);
  assert.ok(wf.every((v) => v >= 2 && v <= 15));

  const sampled = normalizePeaksToBars([0.1, 0.5, 0.9, 0.2, 0.8, 0.4], 6);
  assert.equal(sampled.length, 6);
  assert.ok(sampled.every((v) => v >= 2 && v <= 15));
});

test("chatMedia: image token encoding, parsing, and caption separation", () => {
  const hash = "a".repeat(64);
  const keyHex = "b".repeat(64);
  const token = encodeChatMediaToken({
    kind: "img",
    mime: "image/webp",
    hash,
    keyHex,
    width: 800,
    height: 600,
  });

  assert.equal(token, `[radica-cm1:img:image/webp:${hash}:${keyHex}:800x600]`);

  const fullMsg = `Look at this sunset!\n${token}\nWhat do you think?`;
  const { items, caption } = parseChatMedia(fullMsg);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "img");
  assert.equal(items[0].mime, "image/webp");
  assert.equal(items[0].hash, hash);
  assert.equal(items[0].keyHex, keyHex);
  assert.equal(items[0].width, 800);
  assert.equal(items[0].height, 600);
  assert.equal(caption, "Look at this sunset!\n\nWhat do you think?");
});

test("chatMedia: voice and audio token encoding, parsing with waveform", () => {
  const hash = "c".repeat(64);
  const keyHex = "d".repeat(64);
  const waveform = [3, 8, 12, 15, 6, 4];
  const token = encodeChatMediaToken({
    kind: "voice",
    mime: "audio/webm",
    hash,
    keyHex,
    durationSec: 14.5,
    waveform,
  });

  assert.equal(token, `[radica-cm1:voice:audio/webm:${hash}:${keyHex}:14.5:38cf64]`);

  const { items, caption } = parseChatMedia(`Here is my voice memo:\n${token}`);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "voice");
  assert.equal(items[0].durationSec, 14.5);
  assert.deepEqual(items[0].waveform, waveform);
  assert.equal(caption, "Here is my voice memo:");
});

test("chatMedia: maskChatMediaTokens protects tokens during regex passes", () => {
  const hash = "e".repeat(64);
  const keyHex = "f".repeat(64);
  const token = `[radica-cm1:img:image/jpeg:${hash}:${keyHex}:640x480]`;
  const text = `Hey call 123-456-7890 ${token}`;

  const { masked, restore } = maskChatMediaTokens(text);
  assert.ok(!masked.includes(token));
  assert.ok(masked.includes("\uE0200\uE021"));

  const censored = masked.replace(/123-456-7890/, "[PHONE]");
  const restored = restore(censored);
  assert.equal(restored, `Hey call [PHONE] ${token}`);
});

test("chatMedia: summarizeChatMediaText creates crisp human preview labels", () => {
  const hash = "1".repeat(64);
  const keyHex = "2".repeat(64);
  const imgToken = `[radica-cm1:img:image/webp:${hash}:${keyHex}:400x300]`;
  const voiceToken = `[radica-cm1:voice:audio/webm:${hash}:${keyHex}:42]`;

  assert.equal(summarizeChatMediaText(imgToken), "📷 Photo");
  assert.equal(summarizeChatMediaText(`Check this out\n${imgToken}`), "📷 Check this out");
  assert.equal(summarizeChatMediaText(voiceToken), "🎙️ Voice message (0:42)");
  assert.equal(summarizeChatMediaText(`Listen to this\n${voiceToken}`), "🎙️ (0:42) Listen to this");
});

test("chatMedia: sealChatMedia and openChatMedia encrypt & decrypt with BLAKE3 verification", async () => {
  const plainText = "Hello Freenet decentralization audio test!";
  const plainBytes = new TextEncoder().encode(plainText);

  const { sealed, hash, keyHex } = await sealChatMedia(plainBytes);
  assert.ok(sealed.byteLength > plainBytes.byteLength);
  assert.equal(hash.length, 64);
  assert.equal(keyHex.length, 64);

  // Successful decryption
  const decrypted = await openChatMedia(sealed, hash, keyHex);
  assert.ok(decrypted);
  assert.equal(new TextDecoder().decode(decrypted!), plainText);

  // Tampered ciphertext fails
  const tampered = new Uint8Array(sealed);
  tampered[15] ^= 0x42;
  const failTamper = await openChatMedia(tampered, hash, keyHex);
  assert.equal(failTamper, null);

  // Wrong key fails
  const wrongKey = "0".repeat(64);
  const failKey = await openChatMedia(sealed, hash, wrongKey);
  assert.equal(failKey, null);
});

test("chatMedia: chatMediaCardsHtml renders valid markup", () => {
  const hash = "9".repeat(64);
  const keyHex = "8".repeat(64);
  const imgHtml = chatMediaCardsHtml([
    {
      raw: "",
      kind: "img",
      mime: "image/webp",
      hash,
      keyHex,
      width: 600,
      height: 400,
    },
  ]);
  assert.ok(imgHtml.includes('class="cm-card cm-img-card"'));
  assert.ok(imgHtml.includes(`data-cm-hash="${hash}"`));

  const audioHtml = chatMediaCardsHtml([
    {
      raw: "",
      kind: "voice",
      mime: "audio/webm",
      hash,
      keyHex,
      durationSec: 18,
      waveform: [5, 10, 15],
    },
  ]);
  assert.ok(audioHtml.includes('class="cm-card cm-audio-card"'));
  // the player bar names the clip by its message's first line, escaped
  const titled = chatMediaCardsHtml([{ raw: "", kind: "audio", mime: "audio/mpeg", hash, keyHex, durationSec: 3 }], "\nSoulwax <NY> Excuse\n#electro");
  assert.ok(titled.includes('data-cm-title="Soulwax &#60;NY&#62; Excuse"'));
  assert.ok(audioHtml.includes('class="cm-waveform"'));
  assert.ok(audioHtml.includes("0:18"));
});

test("chatMedia: formatBytes and fileExtensionIcon", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(1500000), "1.4 MB");

  assert.equal(fileExtensionIcon("document.pdf"), "📕");
  assert.equal(fileExtensionIcon("archive.zip"), "📦");
  assert.equal(fileExtensionIcon("contract.docx"), "📝");
  assert.equal(fileExtensionIcon("report.xlsx"), "📊");
  assert.equal(fileExtensionIcon("song.mp3"), "🎵");
  assert.equal(fileExtensionIcon("notes.txt"), "📄");
  assert.equal(fileExtensionIcon("unknown.bin"), "📎");
});

test("chatMedia: file token encoding, parsing, card html, and summary", () => {
  const hash = "7".repeat(64);
  const keyHex = "6".repeat(64);
  const token = encodeChatMediaToken({
    kind: "file",
    mime: "application/pdf",
    hash,
    keyHex,
    sizeBytes: 45200,
    filename: "whitepaper.pdf",
  });

  assert.ok(token.startsWith("[radica-cm1:file:application/pdf:"));
  assert.ok(token.includes(":45200:"));

  const parsed = parseChatMedia(`Here is the roadmap:\n${token}\nRead carefully.`);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].kind, "file");
  assert.equal(parsed.items[0].mime, "application/pdf");
  assert.equal(parsed.items[0].hash, hash);
  assert.equal(parsed.items[0].keyHex, keyHex);
  assert.equal(parsed.items[0].sizeBytes, 45200);
  assert.equal(parsed.items[0].filename, "whitepaper.pdf");
  assert.equal(parsed.caption, "Here is the roadmap:\n\nRead carefully.");

  const summary = summarizeChatMediaText(token);
  assert.equal(summary, "📄 whitepaper.pdf (44 KB)");

  const fileHtml = chatMediaCardsHtml(parsed.items);
  assert.ok(fileHtml.includes('class="cm-card cm-file-card"'));
  assert.ok(fileHtml.includes("whitepaper.pdf"));
  assert.ok(fileHtml.includes("44 KB"));
  assert.ok(fileHtml.includes("📕"));
  assert.ok(fileHtml.includes("cm-file-download"));
});


test("chatMedia: files over one media contract are chunked and joined back", async () => {
  const big = crypto.getRandomValues(new Uint8Array(65536));
  const plain = new Uint8Array(2 * 1024 * 1024 + 123);
  for (let i = 0; i < plain.length; i += big.length) plain.set(big.subarray(0, Math.min(big.length, plain.length - i)), i);

  const { blobs, hash, keyHex } = await sealChatMediaChunked(plain);
  assert.equal(blobs.length, 6); // 3 data shards + 2 parity shards + manifest
  assert.ok(blobs.every((b) => b.byteLength <= MAX_CHAT_MEDIA_SEALED));

  const store = new Map(blobs.map((b) => [mediaHashOf(b), b]));
  const get = async (h: string) => store.get(h) ?? null;
  assert.deepEqual(await fetchChatMedia(hash, keyHex, get), plain);

  // FEC test: deleting 1 shard (or up to M=2 shards) still successfully reconstructs the exact original file!
  store.delete(mediaHashOf(blobs[1]));
  assert.deepEqual(await fetchChatMedia(hash, keyHex, get), plain);

  // Exceeding parity limit: deleting 3 shards (remaining 2 < K=3) causes recovery to fail
  store.delete(mediaHashOf(blobs[0]));
  store.delete(mediaHashOf(blobs[2]));
  assert.equal(await fetchChatMedia(hash, keyHex, get), null);

  const small = new Uint8Array([1, 2, 3]);
  const one = await sealChatMediaChunked(small);
  assert.equal(one.blobs.length, 1);
  assert.deepEqual(await fetchChatMedia(one.hash, one.keyHex, async () => one.blobs[0]), small);
});

test("chatMedia: uploadChatMedia publishes every blob, retries one failure, reports progress", async () => {
  const blobs = [1, 2, 3, 4, 5].map((n) => new Uint8Array([n]));
  const put: number[] = [];
  let failedOnce = false;
  const progress: string[] = [];
  await uploadChatMedia(
    blobs,
    async (b) => {
      if (b[0] === 3 && !failedOnce) {
        failedOnce = true;
        throw new Error("timeout");
      }
      put.push(b[0]);
    },
    (done, total) => progress.push(`${done}/${total}`)
  );
  assert.deepEqual(put.sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(progress, ["0/5", "1/5", "2/5", "3/5", "4/5", "5/5"]);

  await assert.rejects(uploadChatMedia([new Uint8Array([9])], async () => { throw new Error("down"); }));
});

test("chatMedia: sendChatAttachment publishes the pieces and returns a token that opens them", async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(65536));
  const store = new Map<string, Uint8Array>();
  const token = await sendChatAttachment(
    { kind: "file", bytes, mime: "application/pdf", label: "", previewUrl: "", sizeBytes: bytes.length, filename: "a.pdf" },
    async (b) => void store.set(mediaHashOf(b), b)
  );
  const [item] = parseChatMedia(token).items;
  assert.equal(item.filename, "a.pdf");
  assert.deepEqual(await fetchChatMedia(item.hash, item.keyHex, async (h) => store.get(h) ?? null), bytes);
});

test("fetchChatMedia reports progress, retries a piece once, counts the missing ones", async () => {
  const plain = new Uint8Array(MAX_CHAT_MEDIA_PLAIN * 2 + 10).map((_, i) => i % 251);
  const { blobs, hash, keyHex } = await sealChatMediaChunked(plain);
  const store = new Map(blobs.map((b) => [mediaHashOf(b), b]));
  const flaky = mediaHashOf(blobs[0]);
  let flakyAsks = 0;
  const get = async (h: string) => (h === flaky && flakyAsks++ === 0 ? null : store.get(h) ?? null); // first ask fails
  const seen: number[][] = [];
  assert.deepEqual(await fetchChatMedia(hash, keyHex, get, (d, t, m) => seen.push([d, t, m])), plain);
  assert.equal(flakyAsks, 2);
  assert.deepEqual(seen.at(-1), [5, 5, 0]);

  // FEC tolerates missing shards, but if we delete enough shards to drop below K, it fails
  store.delete(mediaHashOf(blobs[0]));
  store.delete(mediaHashOf(blobs[1]));
  store.delete(mediaHashOf(blobs[2]));
  seen.length = 0;
  assert.equal(await fetchChatMedia(hash, keyHex, async (h) => store.get(h) ?? null, (d, t, m) => seen.push([d, t, m])), null);
  assert.deepEqual(seen.at(-1), [5, 5, 3]);
});

test("fetchChatMedia hands the chunks over in order, whatever order they arrive in", async () => {
  const plain = new Uint8Array(MAX_CHAT_MEDIA_PLAIN * 3 + 5).map((_, i) => i % 249);
  const { blobs, hash, keyHex } = await sealChatMediaChunked(plain);
  const store = new Map(blobs.map((b) => [mediaHashOf(b), b]));
  const first = mediaHashOf(blobs[0]);
  const get = async (h: string) => {
    if (h === first) await new Promise((r) => setTimeout(r, 30)); // the first chunk comes last
    return store.get(h) ?? null;
  };
  const order: number[] = [];
  const joined: number[] = [];
  assert.deepEqual(await fetchChatMedia(hash, keyHex, get, undefined, (part, i) => (order.push(i), joined.push(part.byteLength))), plain);
  assert.deepEqual(order, [0, 1, 2, 3]);
  assert.equal(joined.reduce((a, b) => a + b, 0), plain.byteLength);
});

test("chatMedia: syncMiniPlayerSlot docks player bar under active header and never covers navigation", () => {
  const bar = { id: "cm-mini-player", parentElement: null as any };
  const playerSlot = { id: "rm-player-slot", appendChild(el: any) { el.parentElement = this; } };
  const inboxSlot = { id: "rm-inbox-player-slot", appendChild(el: any) { el.parentElement = this; } };
  const feedSlot = { id: "feed-player-slot", appendChild(el: any) { el.parentElement = this; } };
  const chatModal = { id: "chat-modal", style: { display: "flex" }, dataset: { chatLayout: "messenger" } };
  const workspace = { id: "rm-workspace", classList: { contains: (c: string) => c === "mobile-thread-open" }, querySelector: () => null };

  const prevDoc = (globalThis as any).document;
  const prevWin = (globalThis as any).window;

  try {
    (globalThis as any).document = {
      getElementById(id: string) {
        if (id === "cm-mini-player") return bar;
        if (id === "rm-player-slot") return playerSlot;
        if (id === "rm-inbox-player-slot") return inboxSlot;
        if (id === "feed-player-slot") return feedSlot;
        if (id === "chat-modal") return chatModal;
        if (id === "rm-workspace") return workspace;
        return null;
      },
    };
    (globalThis as any).window = { innerWidth: 400 };

    // Case 1: Thread open in chat modal -> docks under chat header (#rm-player-slot)
    syncMiniPlayerSlot();
    assert.equal(bar.parentElement, playerSlot);

    // Case 2: Mobile inbox in chat modal -> docks under filter chips (#rm-inbox-player-slot)
    workspace.classList.contains = () => false;
    syncMiniPlayerSlot();
    assert.equal(bar.parentElement, inboxSlot);

    // Case 3: Chat closed -> docks under feed nav (#feed-player-slot)
    chatModal.style.display = "none";
    syncMiniPlayerSlot();
    assert.equal(bar.parentElement, feedSlot);
  } finally {
    (globalThis as any).document = prevDoc;
    (globalThis as any).window = prevWin;
  }
});

test("chatMedia: circular video notes (vnote) normalization, planning, tokens, cards, and poster E2EE", async () => {
  assert.equal(normalizeVideoMime("video/mp4;codecs=avc1"), "video/mp4");
  assert.equal(normalizeVideoMime("video/quicktime", "clip.mov"), "video/mp4");
  assert.equal(normalizeVideoMime("", "bubble.webm"), "video/webm");
  assert.equal(normalizeVideoMime("application/pdf", "doc.pdf"), null);

  const shortPlan = videoNotePlan(12, 720, 1280);
  assert.ok(shortPlan);
  assert.equal(shortPlan!.size, 360);
  assert.equal(shortPlan!.bitrate, 550_000);
  assert.equal(videoNotePlan(65, 360, 360), null); // exceeds 60s cap

  const videoHash = "a".repeat(64);
  const posterHash = "b".repeat(64);
  const keyHex = "c".repeat(64);
  const tokWithPoster = encodeChatMediaToken({
    kind: "vnote",
    mime: "video/mp4",
    hash: videoHash,
    keyHex,
    durationSec: 18.4,
    posterHash,
  });
  assert.equal(tokWithPoster, `[radica-cm1:vnote:video/mp4:${videoHash}:${keyHex}:18.4:${posterHash}]`);

  const tokNoPoster = encodeChatMediaToken({
    kind: "vnote",
    mime: "video/webm",
    hash: videoHash,
    keyHex,
    durationSec: 5,
  });
  assert.equal(tokNoPoster, `[radica-cm1:vnote:video/webm:${videoHash}:${keyHex}:5]`);

  const parsed = parseChatMedia(`Quick update:\n${tokWithPoster}`);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].kind, "vnote");
  assert.equal(parsed.items[0].posterHash, posterHash);
  assert.equal(parsed.items[0].durationSec, 18.4);
  assert.equal(parsed.caption, "Quick update:");

  const { masked, restore } = maskChatMediaTokens(`Number 555-0199 ${tokWithPoster}`);
  assert.ok(!masked.includes(tokWithPoster));
  assert.equal(restore(masked.replace("555-0199", "[REDACTED]")), `Number [REDACTED] ${tokWithPoster}`);

  assert.equal(summarizeChatMediaText(tokWithPoster), "🎥 Video message (0:18)");
  assert.equal(summarizeChatMediaText(`Walkie\n${tokWithPoster}`), "🎥 (0:18) Walkie");

  const html = chatMediaCardsHtml(parsed.items);
  assert.ok(html.includes('class="cm-card cm-vnote-card"'));
  assert.ok(html.includes(`data-cm-poster="${posterHash}"`));
  assert.ok(html.includes('<progress class="cm-vnote-ring"'));
  assert.ok(html.includes('width="208" height="208"'));
  assert.ok(html.includes('preload="none" loading="lazy"'));
  // Ensure no button is nested inside another button
  assert.doesNotMatch(html, /<button\b(?:(?!<\/button>)[\s\S])*<button\b/i);

  // sendChatAttachment seals both video bytes and posterBlob using same keyHex
  const videoBytes = crypto.getRandomValues(new Uint8Array(1024));
  const posterBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
  const store = new Map<string, Uint8Array>();
  const emitted = await sendChatAttachment(
    {
      kind: "vnote",
      bytes: videoBytes,
      mime: "video/mp4",
      label: "Video message",
      previewUrl: "",
      durationSec: 6,
      sizeBytes: videoBytes.byteLength,
      posterBlob,
    },
    async (b) => void store.set(mediaHashOf(b), b)
  );
  const [emittedItem] = parseChatMedia(emitted).items;
  assert.equal(emittedItem.kind, "vnote");
  assert.ok(emittedItem.posterHash);
  assert.deepEqual(await fetchChatMedia(emittedItem.hash, emittedItem.keyHex, async (h) => store.get(h) ?? null), videoBytes);
  assert.deepEqual(
    await fetchChatMedia(emittedItem.posterHash!, emittedItem.keyHex, async (h) => store.get(h) ?? null),
    new Uint8Array([1, 2, 3, 4])
  );
});

test("chatMedia: canUseLiveMediaCapture & sandbox DOMException capture fallback do not throw TypeError", async () => {
  const prevWin = (globalThis as any).window;
  const prevNavDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const prevMR = (globalThis as any).MediaRecorder;
  const setNav = (val: any) =>
    Object.defineProperty(globalThis, "navigator", { value: val, configurable: true, writable: true });
  try {
    // 1. Opaque origin (Freenet shell.html sandbox iframe) -> false
    (globalThis as any).window = { isSecureContext: false, origin: "null" };
    setNav({ mediaDevices: { getUserMedia: async () => ({}) } });
    (globalThis as any).MediaRecorder = function () {};
    assert.equal(canUseLiveMediaCapture(), false);

    // 2. Secure non-opaque origin with MediaRecorder + getUserMedia -> true
    (globalThis as any).window = { isSecureContext: true, origin: "http://localhost:5173" };
    assert.equal(canUseLiveMediaCapture(), true);

    // 3. DOMException (which has a read-only getter for .code) must map cleanly to FALLBACK_CAPTURE
    setNav({
      mediaDevices: {
        getUserMedia: async () => {
          throw new DOMException("Permission denied due to SecurityError", "NotAllowedError");
        },
      },
    });
    await assert.rejects(
      () => startVideoNoteRecording({}),
      (err: any) => err instanceof Error && err.code === "FALLBACK_CAPTURE"
    );
    await assert.rejects(
      () => startVoiceRecording({}),
      (err: any) => err instanceof Error && err.code === "FALLBACK_CAPTURE"
    );
  } finally {
    (globalThis as any).window = prevWin;
    if (prevNavDesc) Object.defineProperty(globalThis, "navigator", prevNavDesc);
    else delete (globalThis as any).navigator;
    (globalThis as any).MediaRecorder = prevMR;
  }
});

test("chatMedia: native __radicaNative voice bridge records, streams ticks, and hides capture on plain sandboxed desktop", async () => {
  const prevWin = (globalThis as any).window;
  const prevNavDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const prevNative = (globalThis as any).__radicaNative;
  const setNav = (val: any) =>
    Object.defineProperty(globalThis, "navigator", { value: val, configurable: true, writable: true });
  const listeners = new Set<(ev: any) => void>();

  try {
    // Plain desktop browser inside Freenet shell.html sandbox -> both buttons stay hidden
    (globalThis as any).window = {
      isSecureContext: false,
      origin: "null",
      matchMedia: () => ({ matches: false }),
      addEventListener: (t: string, cb: (ev: any) => void) => t === "message" && listeners.add(cb),
      removeEventListener: (t: string, cb: (ev: any) => void) => t === "message" && listeners.delete(cb),
    };
    setNav({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    delete (globalThis as any).__radicaNative;

    assert.equal(hasNativeVoiceBridge(), false);
    assert.equal(canRecordVoice(), false);
    assert.equal(canCaptureVideoNote(), false);

    // Desktop native wrapper enables PTT voice even inside sandbox
    let startedMax = 0;
    const emit = (data: any) => {
      for (const cb of listeners) cb({ data });
    };
    (globalThis as any).__radicaNative = {
      canRecordVoice: () => true,
      startVoiceRec: (maxSec: number) => {
        startedMax = maxSec;
        queueMicrotask(() => {
          emit({ type: "radica_native_voice", event: "started" });
          emit({ type: "radica_native_voice", event: "tick", elapsedSec: 0.4, level: 9, approxBytes: 12000, maxSec });
          emit({ type: "radica_native_voice", event: "tick", elapsedSec: 0.8, level: 13, approxBytes: 24000, maxSec });
          emit({ type: "radica_native_voice", event: "tick", elapsedSec: 1.2, level: 6, approxBytes: 36000, maxSec });
          emit({ type: "radica_native_voice", event: "tick", elapsedSec: 1.6, level: 10, approxBytes: 48000, maxSec });
        });
      },
      stopVoiceRec: () => {
        const fakeWavB64 = Buffer.from("RIFF$\x00\x00\x00WAVEfmt ").toString("base64");
        queueMicrotask(() => {
          emit({
            type: "radica_native_voice",
            event: "done",
            mime: "audio/wav",
            base64: fakeWavB64,
            durationSec: 1.6,
          });
        });
      },
      cancelVoiceRec: () => {},
    };

    assert.equal(hasNativeVoiceBridge(), true);
    assert.equal(canRecordVoice(), true);
    assert.equal(canCaptureVideoNote(), false);

    const ticks: number[] = [];
    const session = await startVoiceRecording({
      maxSec: 10,
      onTick: (_sec, level) => ticks.push(level),
    });
    assert.equal(startedMax, 10);
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(ticks.length, 4);

    const prep = await session.stop();
    assert.ok(prep);
    assert.equal(prep!.kind, "voice");
    assert.equal(prep!.mime, "audio/wav");
    assert.equal(prep!.durationSec, 1.6);
    assert.equal(prep!.waveform?.length, 28);
  } finally {
    (globalThis as any).window = prevWin;
    if (prevNavDesc) Object.defineProperty(globalThis, "navigator", prevNavDesc);
    else delete (globalThis as any).navigator;
    if (prevNative !== undefined) (globalThis as any).__radicaNative = prevNative;
    else delete (globalThis as any).__radicaNative;
  }
});
