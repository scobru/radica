import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getNativeAppMode,
  getNativeAppVersion,
  getNativeBridge,
  getNativeVoiceBridge,
  hasNativeBridge,
  openExternalUrl,
  type RadicaNativeBridge,
} from "../src/platformBridge.ts";
import {
  FORBIDDEN_PROTO_KEYS,
  STORAGE_KEY_RULES,
  isDurableStorageKey,
  isHashSafeStorageKey,
  isSensitiveStorageKey,
} from "../src/storageKeys.ts";

function withMockBridge(bridge: RadicaNativeBridge | undefined, fn: () => void) {
  const g = globalThis as { __radicaNative?: RadicaNativeBridge };
  const prev = g.__radicaNative;
  try {
    if (bridge === undefined) delete g.__radicaNative;
    else g.__radicaNative = bridge;
    fn();
  } finally {
    if (prev === undefined) delete g.__radicaNative;
    else g.__radicaNative = prev;
  }
}

test("platformBridge: getNativeBridge, hasNativeBridge, and getNativeAppMode", () => {
  withMockBridge(undefined, () => {
    assert.equal(getNativeBridge(), undefined);
    assert.equal(hasNativeBridge(), false);
    assert.equal(getNativeAppMode(), null);
  });

  withMockBridge({ getAppMode: () => "messenger" }, () => {
    assert.equal(hasNativeBridge(), true);
    assert.equal(getNativeAppMode(), "messenger");
  });

  withMockBridge({ getAppMode: () => "full" }, () => {
    assert.equal(getNativeAppMode(), "full");
  });

  withMockBridge({ isMessenger: () => true }, () => {
    assert.equal(getNativeAppMode(), "messenger");
  });

  withMockBridge(
    {
      getAppMode: () => {
        throw new Error("boom");
      },
      isMessenger: () => true,
    },
    () => {
      assert.equal(getNativeAppMode(), "messenger");
    },
  );
});

test("platformBridge: getNativeAppVersion reads the installed app's version, null when absent or bad", () => {
  withMockBridge(undefined, () => assert.equal(getNativeAppVersion(), null));
  withMockBridge({ getAppMode: () => "full" }, () => assert.equal(getNativeAppVersion(), null)); // an app too old to say
  withMockBridge({ getAppVersion: () => "1.1.1" }, () => assert.equal(getNativeAppVersion(), "1.1.1"));
  withMockBridge({ getAppVersion: () => "<b>" }, () => assert.equal(getNativeAppVersion(), null));
  withMockBridge({ getAppVersion: () => { throw new Error("gone"); } }, () => assert.equal(getNativeAppVersion(), null));
});

test("platformBridge: getNativeVoiceBridge validates required methods and canRecordVoice", () => {
  withMockBridge(undefined, () => {
    assert.equal(getNativeVoiceBridge(), null);
  });

  withMockBridge({ startVoiceRec: () => {} }, () => {
    assert.equal(getNativeVoiceBridge(), null);
  });

  withMockBridge({ startVoiceRec: () => {}, stopVoiceRec: () => {}, canRecordVoice: () => false }, () => {
    assert.equal(getNativeVoiceBridge(), null);
  });

  withMockBridge({ startVoiceRec: () => {}, stopVoiceRec: () => {}, canRecordVoice: () => true }, () => {
    assert.ok(getNativeVoiceBridge());
  });
});

test("platformBridge: openExternalUrl validates schemes, calls native bridge, and optionally falls back to window.open", () => {
  const opened: string[] = [];
  withMockBridge({ openExternal: (u) => opened.push(u) }, () => {
    assert.equal(openExternalUrl("https://freenet.org/"), true);
    assert.equal(openExternalUrl("spore:radio:station1"), true);
    assert.equal(openExternalUrl("/v1/contract/web/abc/", { baseHref: "http://127.0.0.1:7509/" }), true);
    assert.equal(openExternalUrl("javascript:alert(1)"), false);
    assert.equal(openExternalUrl("data:text/html,hi"), false);
    assert.equal(openExternalUrl(""), false);
  });
  assert.deepEqual(opened, [
    "https://freenet.org/",
    "spore:radio:station1",
    "http://127.0.0.1:7509/v1/contract/web/abc/",
  ]);

  const g = globalThis as { window?: { open?: (...args: unknown[]) => void; location?: { href: string } } };
  const prevWin = g.window;
  const winOpened: unknown[][] = [];
  try {
    g.window = {
      location: { href: "https://radica.localhost/" },
      open: (...args) => winOpened.push(args),
    };
    withMockBridge(undefined, () => {
      assert.equal(openExternalUrl("https://example.com"), false);
      assert.equal(openExternalUrl("https://example.com", { fallbackWindowOpen: true }), true);
    });
    assert.deepEqual(winOpened, [["https://example.com/", "_blank", "noopener,noreferrer"]]);
  } finally {
    if (prevWin === undefined) delete g.window;
    else g.window = prevWin;
  }
});

test("storageKeys: registry invariants keep sensitive keys out of window.name and #auth_state=", () => {
  for (const rule of STORAGE_KEY_RULES) {
    assert.ok(!(rule.sensitive && rule.hashSafe), `Rule ${rule.prefix} cannot be both sensitive and hashSafe`);
  }

  for (const k of FORBIDDEN_PROTO_KEYS) {
    assert.equal(isSensitiveStorageKey(k), true);
    assert.equal(isHashSafeStorageKey(k), false);
  }

  // Freenet Mail & room key drift fixes: sensitive AND durable, never hash-safe
  for (const k of [
    "radica_fmail_contacts_me",
    "radica_fmail_deleted_me",
    "radica_fmail_aft_assignments_me",
    "radica_mail_blocked_me",
    "freenet_room_key_r1",
  ]) {
    assert.equal(isSensitiveStorageKey(k), true, `${k} must be sensitive`);
    assert.equal(isDurableStorageKey(k), true, `${k} must be durable`);
    assert.equal(isHashSafeStorageKey(k), false, `${k} must never be hash-safe`);
  }

  assert.equal(isHashSafeStorageKey("radica_profile_me"), true);
  assert.equal(isHashSafeStorageKey("radica_pinned_chats_me"), true);
  assert.equal(isDurableStorageKey("radica_pinned_chats_me"), true);
});
