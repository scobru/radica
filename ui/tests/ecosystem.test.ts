import test from "node:test";
import assert from "node:assert/strict";
import {
  ECOSYSTEM,
  LAUNCHER_APPS,
  ecosystemFooter,
  ecosystemCard,
  SUPPORT_URL,
  ORTO_SITE,
  hrefOf,
  appId,
  normalizeSiteKey,
  customRecordToApp,
  filterLauncherApps,
} from "../src/ecosystem.ts";

test("ecosystem: includes all requested projects", () => {
  const names = ECOSYSTEM.map((e) => e.name);
  assert.ok(names.includes("River"));
  const river = ECOSYSTEM.find((e) => e.name === "River");
  assert.equal(river?.key, "raAqMhMG7KUpXBU2SxgCQ3Vh4PYjttxdSWd9ftV7RLv");
  assert.equal(hrefOf(river!, "http://127.0.0.1:7509"), "http://127.0.0.1:7509/v1/contract/web/raAqMhMG7KUpXBU2SxgCQ3Vh4PYjttxdSWd9ftV7RLv/#/");
  assert.ok(names.includes("Viso"));
  assert.ok(names.includes("FreeTunes"));
  const freetunes = ECOSYSTEM.find((e) => e.name === "FreeTunes");
  assert.equal(freetunes?.key, "HiAQ4ucHkDKw6ShMa9ipX73h9XxdyGD5cN2DSW78Mqev");
  assert.ok(names.includes("FreePolls"));
  assert.ok(names.includes("FreeNames"));
  assert.ok(names.includes("Delta"));
  assert.ok(names.includes("Orto"));
  assert.ok(names.includes("Asocial"));
  const asocial = ECOSYSTEM.find((e) => e.name === "Asocial");
  assert.equal(asocial?.repo, "https://gitlab.com/porky11/asocial");
  assert.equal(asocial?.key, "BhhLhAiMAcZaSEJ31Zwri59D3F3E112DY6w3J51iLJT9");
  assert.ok(names.includes("Fisherman's Horizon"));
  const fh = ECOSYSTEM.find((e) => e.name === "Fisherman's Horizon");
  assert.equal(fh?.key, "GyMDcXWozt4JNAz7mwPSpt9hjNyvijQRe4JhXzPAXPWm");
  assert.equal(fh?.repo, "https://github.com/scobru/FH");
  const orto = ECOSYSTEM.find((e) => e.name === "Orto");
  assert.equal(orto?.key, "9eBjDkH6ZXA6ehUyWBBjT6Xg4tQE4ALZjSsgXERds4yZ");
  assert.equal(ORTO_SITE, "9eBjDkH6ZXA6ehUyWBBjT6Xg4tQE4ALZjSsgXERds4yZ");

  assert.ok(names.includes("FreeHole"));
  const freehole = ECOSYSTEM.find((e) => e.name === "FreeHole");
  assert.equal(freehole?.key, "6d7GS576m4QBnsHh6fjdYYJfBZbCkR1W7Cu2xaqa78sp");
  assert.equal(freehole?.repo, "https://github.com/scobru/freehole");
  assert.equal(freehole?.author, "by @scobru");

  assert.ok(names.includes("Freetree"));
  const freetree = ECOSYSTEM.find((e) => e.name === "Freetree");
  assert.equal(freetree?.key, "4SC5QCzLzKWH9BSFFybivTynfBRkPw3PtXwegjXbPm8x");
  assert.equal(freetree?.repo, "https://github.com/scobru/freetree");
  assert.equal(freetree?.author, "by @scobru");

  assert.ok(names.includes("Aula"));
  assert.ok(!names.includes("Spore"));
  const aula = ECOSYSTEM.find((e) => e.name === "Aula");
  assert.equal(aula?.key, "GbG8dmva2QsVJMqCnv9iTXwwdbVjKMfZcTRCF94oTUes");
  assert.equal(hrefOf(aula!, "http://127.0.0.1:7509"), "http://127.0.0.1:7509/v1/contract/web/GbG8dmva2QsVJMqCnv9iTXwwdbVjKMfZcTRCF94oTUes/#/");
  assert.equal(aula?.repo, "https://github.com/scobru/aula");
  assert.equal(aula?.author, "by @scobru");
  assert.equal(aula?.category, "affiliated");

  assert.ok(names.includes("Hive"));
  const hive = ECOSYSTEM.find((e) => e.name === "Hive");
  assert.equal(hive?.key, "AqiX61ZEVgTVWudkbTqDv8w57vsQ24ZhjytEGVwzas7A");
  assert.equal(hive?.author, "by @holdmylatte");
  assert.equal(hrefOf(hive!, "http://127.0.0.1:7509"), "http://127.0.0.1:7509/v1/contract/web/AqiX61ZEVgTVWudkbTqDv8w57vsQ24ZhjytEGVwzas7A/#/");

  assert.ok(names.includes("Atlas"));
  const atlas = ECOSYSTEM.find((e) => e.name === "Atlas");
  assert.equal(atlas?.key, "771DvtPMwt2PumPyrFvsz7fpvU1gogcmb5qtS1yYEEH9");
  assert.equal(hrefOf(atlas!, "http://127.0.0.1:7509"), "http://127.0.0.1:7509/v1/contract/web/771DvtPMwt2PumPyrFvsz7fpvU1gogcmb5qtS1yYEEH9/#/");
});

test("ecosystem: links use nodeOrigin for known contracts and repos for others", () => {
  const origin = "http://127.0.0.1:7509";
  const footer = ecosystemFooter(origin);
  assert.ok(footer.includes(`${origin}/v1/contract/web/`));
  assert.ok(footer.includes(`${origin}/v1/contract/web/9eBjDkH6ZXA6ehUyWBBjT6Xg4tQE4ALZjSsgXERds4yZ/#/`));
  assert.ok(footer.includes(SUPPORT_URL));
  assert.ok(footer.includes("Support Radica"));
  assert.ok(footer.includes("Aula"));

  const card = ecosystemCard(origin);
  assert.ok(card.includes("Works with"));
  assert.ok(card.includes("Buy me a coffee"));
  assert.ok(card.includes("9eBjDkH6ZXA6ehUyWBBjT6Xg4tQE4ALZjSsgXERds4yZ"));
  assert.ok(card.includes("by @scobru"));
  assert.ok(card.includes("Freenet core"));
  assert.ok(card.includes("by porky11"));
  assert.ok(card.includes("by @holdmylatte"));
  assert.ok(card.includes("Affiliated App"));
  assert.ok(card.includes("GbG8dmva2QsVJMqCnv9iTXwwdbVjKMfZcTRCF94oTUes"));
  assert.ok(card.includes("AqiX61ZEVgTVWudkbTqDv8w57vsQ24ZhjytEGVwzas7A"));
});

test("ecosystem launcher: normalizeSiteKey validates bare keys and contract URLs", () => {
  const sampleKey = "9eBjDkH6ZXA6ehUyWBBjT6Xg4tQE4ALZjSsgXERds4yZ";
  assert.equal(normalizeSiteKey(sampleKey), sampleKey);
  assert.equal(normalizeSiteKey(`http://127.0.0.1:7509/v1/contract/web/${sampleKey}/#/`), sampleKey);
  assert.equal(normalizeSiteKey("too-short"), "");
  assert.equal(normalizeSiteKey("invalid 0OIl spaces"), "");
});

test("ecosystem launcher: filterLauncherApps filters by tab/query, sorts pinned first, and converts custom records", () => {
  const origin = "http://127.0.0.1:7509";
  const custom = customRecordToApp({
    id: "CustomKey123456789ABCDEFGHJKLMNPQR",
    name: "Delta Mirror",
    what: "Custom Freenet wiki",
    key: "CustomKey123456789ABCDEFGHJKLMNPQR",
  });
  assert.equal(hrefOf(custom, origin), `${origin}/v1/contract/web/CustomKey123456789ABCDEFGHJKLMNPQR/#/`);
  assert.equal(custom.custom, true);

  const combined = [...ECOSYSTEM, custom];
  const pinned = new Set([appId(custom)]);
  const allPinnedFirst = filterLauncherApps(combined, { filter: "all", pinned });
  assert.equal(allPinnedFirst[0].name, "Delta Mirror");

  const onlyPinned = filterLauncherApps(combined, { filter: "pinned", pinned });
  assert.deepEqual(onlyPinned.map((a) => a.name), ["Delta Mirror"]);

  const builtIns = filterLauncherApps(LAUNCHER_APPS, { filter: "builtin" });
  assert.ok(builtIns.some((a) => a.name === "Articles"));
  assert.ok(builtIns.some((a) => a.name === "River"));
  assert.ok(builtIns.some((a) => a.name === "Freenet Mail"));
  assert.ok(builtIns.some((a) => a.name === "FreeTunes"));

  const onNode = filterLauncherApps(combined, { filter: "node", query: "freehole" });
  assert.deepEqual(onNode.map((a) => a.name), ["FreeHole"]);
});
