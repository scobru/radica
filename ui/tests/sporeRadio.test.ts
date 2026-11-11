import test from "node:test";
import assert from "node:assert/strict";
import {
  sporeRadioLink,
  sporeRadioCard,
  recordSporeRadioHeartbeat,
  isSporeRadioLive,
  SPORE_REPO,
} from "../src/sporeRadio.ts";

test("sporeRadio: detects plain URI format spore:radio:<key>", () => {
  const caption = "Tune into my broadcast at spore:radio:5HqW7b9mDkH6ZXA6ehUyWBBjT6Xg4tQE4ALZjSsgXERd !";
  const ref = sporeRadioLink(caption);
  assert.ok(ref);
  assert.equal(ref.djKey, "5HqW7b9mDkH6ZXA6ehUyWBBjT6Xg4tQE4ALZjSsgXERd");
});

test("sporeRadio: detects protocol format spore://radio/<key>", () => {
  const caption = "Listen live: spore://radio/dj_scobru_ambient";
  const ref = sporeRadioLink(caption);
  assert.ok(ref);
  assert.equal(ref.djKey, "dj_scobru_ambient");
});

test("sporeRadio: detects markdown format [Station Name](spore:radio:<key>)", () => {
  const caption = "Check out [📻 Scobru's Chillout Lounge](spore:radio:5HqW7b9mDkH6ZXA6) live now!";
  const ref = sporeRadioLink(caption);
  assert.ok(ref);
  assert.equal(ref.djKey, "5HqW7b9mDkH6ZXA6");
  assert.equal(ref.stationName, "Scobru's Chillout Lounge");
});

test("sporeRadio: returns null when no spore link is in text", () => {
  assert.equal(sporeRadioLink("Just talking about music and vinyl rips"), null);
  assert.equal(sporeRadioLink(""), null);
});

test("sporeRadio: heartbeat tracking and live detection", () => {
  const key = "test_live_dj_key_123";
  assert.equal(isSporeRadioLive(key), false);

  // Record fresh heartbeat
  recordSporeRadioHeartbeat(key, "Test FM", "Aphex Twin - Xtal", Date.now());
  assert.equal(isSporeRadioLive(key), true);

  // Record expired heartbeat (90s ago)
  recordSporeRadioHeartbeat(key, "Test FM", "Aphex Twin - Xtal", Date.now() - 90_000);
  assert.equal(isSporeRadioLive(key), false);
});

test("sporeRadioCard: generates rich markup with live and offline states", () => {
  const djKey = "live_station_dj_456";

  // 1. Fresh broadcast
  recordSporeRadioHeartbeat(djKey, "Late Night Dub", "Basic Channel - Phylyps", Date.now());
  const liveCard = sporeRadioCard(`spore:radio:${djKey}`);
  assert.ok(liveCard.includes("Spore Radio"));
  assert.ok(liveCard.includes("LIVE NOW"));
  assert.ok(liveCard.includes("Late Night Dub"));
  assert.ok(liveCard.includes("Basic Channel - Phylyps"));
  assert.ok(liveCard.includes(`spore:radio:${djKey}`));
  assert.ok(liveCard.includes("4-Slot Ring Buffer"));
  assert.ok(liveCard.includes(SPORE_REPO));

  // 2. Offline broadcast
  recordSporeRadioHeartbeat(djKey, "Late Night Dub", "Basic Channel - Phylyps", Date.now() - 120_000);
  const offlineCard = sporeRadioCard(`spore:radio:${djKey}`);
  assert.ok(offlineCard.includes("OFFLINE"));
});
