import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeChatMediaToken } from "../src/chatMedia.ts";
import {
  createFragmentedMp4Streamer,
  frameBlockReason,
  isFragmentedMp4,
  isFrameBlocked,
} from "../src/mediaStream.ts";
import {
  createChatVoiceController,
  formatWalkieStatusText,
  type ChatVoiceElements,
} from "../src/chatVoiceController.ts";

function asciiBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function makeFakeElement() {
  const classes = new Set<string>();
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    title: "",
    style: {} as Record<string, string>,
    classList: {
      toggle(name: string, force?: boolean) {
        const next = force ?? !classes.has(name);
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      },
      add(name: string) {
        classes.add(name);
      },
      remove(name: string) {
        classes.delete(name);
      },
      contains(name: string) {
        return classes.has(name);
      },
    },
    addEventListener() {},
    setAttribute() {},
  } as unknown as HTMLElement;
}

function makeFakeElements(): ChatVoiceElements {
  return {
    walkieBtn: makeFakeElement(),
    walkieBar: makeFakeElement(),
    walkieText: makeFakeElement(),
    walkieResumeBtn: makeFakeElement(),
    walkieOffBtn: makeFakeElement(),
    pttBtn: makeFakeElement(),
    pttBar: makeFakeElement(),
    pttTimer: makeFakeElement(),
    pttHint: makeFakeElement(),
    pttSendBtn: makeFakeElement(),
    pttCancelBtn: makeFakeElement(),
    pttMeterBars: [makeFakeElement(), makeFakeElement()],
  };
}

describe("mediaStream frame moderation & fMP4 helpers", () => {
  it("blocks unverified, flagged NSFW, and above-threshold frames consistently", () => {
    const clean = { isNSFW: false, score: 0.05, label: "safe", unverified: false };
    assert.equal(isFrameBlocked(clean, 0.45), false);
    assert.equal(frameBlockReason(clean, 0.45), null);

    const unverified = { isNSFW: false, score: 0, label: "", unverified: true };
    assert.equal(isFrameBlocked(unverified, 0.45), true);
    assert.match(frameBlockReason(unverified, 0.45) ?? "", /Unverified/);

    const nsfw = { isNSFW: false, score: 0.5, label: "Explicit", unverified: false };
    assert.equal(isFrameBlocked(nsfw, 0.45), true);
    assert.equal(frameBlockReason(nsfw, 0.45), "Explicit");

    const flagged = { isNSFW: true, score: 0.2, label: "Adult", unverified: false };
    assert.equal(isFrameBlocked(flagged, 0.45), true);
    assert.equal(frameBlockReason(flagged, 0.45), "Adult");
  });

  it("detects fragmented MP4 headers when mvex atom is present", () => {
    assert.equal(isFragmentedMp4(asciiBytes("....ftypisom....moov....mvex....")), true);
    assert.equal(isFragmentedMp4(asciiBytes("....ftypisom....moov....mdat....")), false);
    assert.equal(isFragmentedMp4(asciiBytes("webm-header-without-atoms")), false);
  });

  it("falls back cleanly in createFragmentedMp4Streamer when MediaSource is unavailable", async () => {
    let fallbackUrl = "";
    const fakeVideo = {
      src: "",
      addEventListener() {},
      removeEventListener() {},
    } as unknown as HTMLVideoElement;

    const streamer = createFragmentedMp4Streamer(fakeVideo, {
      onFallback: (url) => {
        fallbackUrl = url;
      },
    });
    streamer.onPart(asciiBytes("non-fmp4-part"), 0);
    const assigned = await streamer.finish("blob:fallback-video");
    assert.equal(assigned, true);
    assert.equal(fakeVideo.src, "blob:fallback-video");
    assert.equal(fallbackUrl, "blob:fallback-video");

    const empty = await streamer.finish(null);
    assert.equal(empty, false);
  });
});

describe("chatVoiceController", () => {
  it("formats Walkie-Talkie status text for autoplay, queued, and live states", () => {
    assert.match(formatWalkieStatusText({ needsGesture: true, pendingCount: 2 }), /blocked autoplay/i);
    assert.match(formatWalkieStatusText({ needsGesture: false, pendingCount: 1 }), /1 voice message queued/);
    assert.match(formatWalkieStatusText({ needsGesture: false, pendingCount: 3 }), /3 voice messages queued/);
    assert.match(formatWalkieStatusText({ needsGesture: false, pendingCount: 0 }), /Auto-playing incoming voice/);
  });

  it("manages Walkie-Talkie state, UI sync, and room ingestion", () => {
    const storageMap = new Map<string, string>();
    const store = {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storageMap.set(k, v);
      },
    };
    const elements = makeFakeElements();
    const messagesContainer = makeFakeElement();
    // Keep isVisible false during ingestion so drainWalkieQueue does not dequeue immediately.
    const visible = false;
    const ctrl = createChatVoiceController({
      store,
      elements,
      isVisible: () => visible,
      hasConversation: () => true,
      isComposerDisabled: () => false,
      openRoomId: () => "room-1",
      getShownMessages: () => [],
      getDraftText: () => "",
      focusComposer: () => {},
      getMessagesContainer: () => messagesContainer,
      onStagePrepared: () => {},
      onSendPrepared: async () => {},
      onFallbackAudioPicker: () => {},
      showToast: () => {},
    });

    assert.equal(ctrl.isEnabled(), false);
    assert.equal(ctrl.isRecordingVoice(), false);
    ctrl.syncWalkieUi();
    assert.equal(elements.walkieBar?.hidden, true);

    ctrl.toggleWalkie();
    assert.equal(ctrl.isEnabled(), true);
    assert.equal(elements.walkieBar?.hidden, false);
    assert.match(elements.walkieText?.textContent ?? "", /Auto-playing incoming voice/);

    const me = "a".repeat(64);
    const peer = "b".repeat(64);
    const peerVoiceToken = encodeChatMediaToken({
      kind: "voice",
      mime: "audio/webm",
      hash: "1".repeat(64),
      keyHex: "f".repeat(64),
      durationSec: 4,
    });
    const myVoiceToken = encodeChatMediaToken({
      kind: "voice",
      mime: "audio/webm",
      hash: "2".repeat(64),
      keyHex: "e".repeat(64),
      durationSec: 3,
    });

    ctrl.ingestRoomMessages(
      "room-1",
      [
        { id: "m1", sender: peer, text: peerVoiceToken, createdAt: 100 } as any,
        { id: "m2", sender: me, text: myVoiceToken, createdAt: 101 } as any,
      ],
      me,
      () => false,
      (sender) => sender,
    );
    assert.match(elements.walkieText?.textContent ?? "", /1 voice message queued/);

    ctrl.cancelVoiceRec();
    ctrl.turnOffWalkie();
    assert.equal(ctrl.isEnabled(), false);
    assert.equal(elements.walkieBar?.hidden, true);
  });
});
