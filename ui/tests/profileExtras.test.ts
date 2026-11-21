import test from "node:test";
import assert from "node:assert/strict";
import {
  backupOwnProfileExtras,
  isProfileExtraLog,
  latestOwnLogEntry,
  mergeLoadedWalletInputs,
  PROFILE_EXTRA_LOGS,
  PROFILE_EXTRAS_BACKUP_PREFIX,
  profileExtraLogNames,
  restoreOwnProfileExtras,
  shouldPersistProfileField,
} from "../src/profileExtras.ts";
import type { LogEntry } from "../src/logfold.ts";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

function makeEntry(author: string, id: string, ts: number, bodyObj: object, sig = `sig_${ts}`): LogEntry {
  return { author, id, ts, body: JSON.stringify(bodyObj), sig };
}

test("profileExtras: enumerates all 7 personal logs and detects extra log names", () => {
  const names = profileExtraLogNames(ALICE);
  assert.equal(names.length, PROFILE_EXTRA_LOGS.length);
  assert.ok(names.includes(`wallets/${ALICE}`));
  assert.ok(names.includes(`delta/${ALICE}`));
  assert.ok(names.includes(`fh/${ALICE}`));
  assert.equal(isProfileExtraLog(`wallets/${ALICE}`), true);
  assert.equal(isProfileExtraLog(`freetree/${BOB}`), true);
  assert.equal(isProfileExtraLog(`inbox/${ALICE}`), false);
  assert.equal(isProfileExtraLog("communities"), false);
});

test("profileExtras: latestOwnLogEntry ignores non-owners, matches case-insensitively, and breaks ts ties by sig", () => {
  const older = makeEntry(ALICE, "1", 1000, { btc: "bc1qold" }, "sig_a");
  const forged = makeEntry(BOB, "2", 9999, { btc: "bc1qforged" }, "sig_z");
  const newerUpper = makeEntry(ALICE.toUpperCase(), "3", 2000, { btc: "bc1qnew" }, "sig_b");
  const tieWinner = makeEntry(ALICE, "4", 2000, { btc: "bc1qtie" }, "sig_z");

  assert.equal(latestOwnLogEntry([older, forged, newerUpper], ALICE)?.id, "3");
  assert.equal(latestOwnLogEntry([older, forged, newerUpper, tieWinner], ALICE)?.id, "4");
});

test("profileExtras: backupOwnProfileExtras & restoreOwnProfileExtras round-trip and do not overwrite newer local entries", () => {
  const storeMap = new Map<string, string>();
  const store = {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => void storeMap.set(k, v),
  };

  const wEntry = makeEntry(ALICE, "w1", 5000, { type: "wallets", btc: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" });
  const dEntry = makeEntry(ALICE, "d1", 4000, { type: "site", prefix: "myblog" });
  const logs: Record<string, LogEntry[]> = {
    [`wallets/${ALICE}`]: [wEntry, makeEntry(BOB, "evil", 99999, { type: "wallets", btc: "1Evil" })],
    [`delta/${ALICE}`]: [dEntry],
  };

  backupOwnProfileExtras(store, ALICE, (name) => logs[name] ?? []);
  const backupRaw = store.getItem(`${PROFILE_EXTRAS_BACKUP_PREFIX}${ALICE}`);
  assert.ok(backupRaw);

  // Simulate fresh reload where freenet_log_* was wiped, only durable backup survived
  const freshMap = new Map<string, string>([[`${PROFILE_EXTRAS_BACKUP_PREFIX}${ALICE}`, backupRaw]]);
  const freshStore = {
    getItem: (k: string) => freshMap.get(k) ?? null,
    setItem: (k: string, v: string) => void freshMap.set(k, v),
  };

  assert.equal(restoreOwnProfileExtras(freshStore, ALICE), true);
  assert.equal(restoreOwnProfileExtras(freshStore, ALICE), false, "second restore is an idempotent no-op");

  const restoredWallets = JSON.parse(freshStore.getItem(`freenet_log_wallets/${ALICE}`)!);
  assert.equal(restoredWallets[`${ALICE}:w1`].body, wEntry.body);
  assert.equal(restoredWallets[`${BOB}:evil`], undefined, "foreign entries are never restored");

  // Newer local entry with same id is preserved
  const newerSameId = makeEntry(ALICE, "w1", 9000, { type: "wallets", ln: "alice@breez.tips" });
  freshStore.setItem(`freenet_log_wallets/${ALICE}`, JSON.stringify({ [`${ALICE}:w1`]: newerSameId }));
  assert.equal(restoreOwnProfileExtras(freshStore, ALICE), false);
  const kept = JSON.parse(freshStore.getItem(`freenet_log_wallets/${ALICE}`)!);
  assert.equal(kept[`${ALICE}:w1`].ts, 9000);
});

test("profileExtras: mergeLoadedWalletInputs hydrates untouched inputs while preserving user edits", () => {
  const current = { ln: "custom@alby.com", xmr: "", btc: "", evm: "" };
  const touched = new Set(["ln"]);
  const loaded = {
    ln: "old@breez.tips",
    btc: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    evm: "0x" + "ab".repeat(20),
  };
  const merged = mergeLoadedWalletInputs(current, touched, loaded);
  assert.equal(merged.ln, "custom@alby.com", "user-edited field must stay untouched");
  assert.equal(merged.btc, loaded.btc, "untouched field receives newly loaded value");
  assert.equal(merged.evm, loaded.evm);
  assert.equal(merged.xmr, "");
});

test("profileExtras: shouldPersistProfileField refuses clearing an unloaded field unless user edited it", () => {
  assert.equal(
    shouldPersistProfileField({ dirty: false, loaded: false, nextValue: "", currentValue: "" }),
    false
  );
  assert.equal(
    shouldPersistProfileField({ dirty: false, loaded: false, nextValue: "", currentValue: "savedblog" }),
    false,
    "untouched input must never overwrite unloaded or newly arrived remote state"
  );
  assert.equal(
    shouldPersistProfileField({ dirty: true, loaded: false, nextValue: "", currentValue: "savedblog" }),
    true,
    "explicit user edit is persisted"
  );
  assert.equal(
    shouldPersistProfileField({ dirty: false, loaded: true, nextValue: "", currentValue: "savedblog" }),
    true,
    "confirmed loaded state allows clearing"
  );
});
