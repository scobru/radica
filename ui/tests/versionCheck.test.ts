import test from "node:test";
import assert from "node:assert/strict";
import { newNotes, shortNote, isNewerVersion, getNativeDownloadUrl } from "../src/versionCheck.ts";

test("versionCheck: notes are the new release's entries this build lacks, first sentence only", () => {
  assert.equal(shortNote("Fixed: chats. More words here."), "Fixed: chats.");
  assert.equal(shortNote("x".repeat(150)).length, 100);
  const local = [{ text: "Old one." }];
  assert.deepEqual(newNotes([{ text: "New thing. Details." }, { text: "Old one." }], local), ["New thing."]);
  assert.deepEqual(newNotes([{ text: "Old one." }], local), []);
});

test("versionCheck: isNewerVersion accurately compares semantic version strings", () => {
  assert.equal(isNewerVersion("v1.0.11", "1.0.10"), true);
  assert.equal(isNewerVersion("v1.1.0", "1.0.10"), true);
  assert.equal(isNewerVersion("2.0.0", "1.0.10"), true);
  assert.equal(isNewerVersion("1.0.10", "1.0.10"), false);
  assert.equal(isNewerVersion("v1.0.9", "1.0.10"), false);
  assert.equal(isNewerVersion("1.0.10-beta", "1.0.10"), false);
  assert.equal(isNewerVersion("v1.0.10+build123", "1.0.10"), false);
});

test("versionCheck: getNativeDownloadUrl selects correct platform assets and app modes", () => {
  const androidUa = "Mozilla/5.0 (Linux; Android 14; Pixel 8)";
  const macUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
  const linuxUa = "Mozilla/5.0 (X11; Linux x86_64)";
  const windowsUa = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

  // Full app
  assert.equal(
    getNativeDownloadUrl(false, androidUa),
    "https://github.com/scobru/radica/releases/latest/download/radica-android.apk"
  );
  assert.equal(
    getNativeDownloadUrl(false, windowsUa),
    "https://github.com/scobru/radica/releases/latest/download/radica-windows-x86_64.zip"
  );
  assert.equal(
    getNativeDownloadUrl(false, linuxUa),
    "https://github.com/scobru/radica/releases/latest/download/radica-linux-x86_64.tar.gz"
  );
  assert.equal(
    getNativeDownloadUrl(false, macUa),
    "https://github.com/scobru/radica/releases/latest/download/radica-macos-arm64.zip"
  );

  // Messenger app
  assert.equal(
    getNativeDownloadUrl(true, androidUa),
    "https://github.com/scobru/radica/releases/latest/download/radica-messenger-android.apk"
  );
  assert.equal(
    getNativeDownloadUrl(true, windowsUa),
    "https://github.com/scobru/radica/releases/latest/download/radica-messenger-windows-x86_64.zip"
  );
  assert.equal(
    getNativeDownloadUrl(true, linuxUa),
    "https://github.com/scobru/radica/releases/latest/download/radica-messenger-linux-x86_64.tar.gz"
  );
  assert.equal(
    getNativeDownloadUrl(true, macUa),
    "https://github.com/scobru/radica/releases/latest/download/radica-messenger-macos-arm64.zip"
  );
});
