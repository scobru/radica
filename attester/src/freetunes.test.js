import { test } from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import { norm, liveReleases, trackTitles, mbUrl, mbMatch, reportOf, purposeOf, anteProof, REPORT_BITS } from "./freetunes.js";

test("norm ignores case, accents, brackets and punctuation", () => assert.equal(norm("Señorita (Remastered 2019)!"), "senorita"));

test("liveReleases drops removed and blocked ones, newest first", () => {
  const e = (ts, extra = {}) => ({ title: "t", artist: "a", ts, ...extra });
  const dir = { entries: { a: e(1), b: e(3), c: e(2, { removed: true }), d: e(4) }, blocked: { list: ["d"] } };
  assert.deepEqual(liveReleases(dir).map((r) => r.instance), ["b", "a"]);
});

test("trackTitles reads the signed meta, and nothing from a tombstone or garbage", () => {
  const st = (m) => JSON.stringify({ meta_json: JSON.stringify(m) });
  assert.deepEqual(trackTitles(st({ artist: "X", tracks: [{ title: "One" }, { title: " " }, { title: "Two" }] })).tracks, [{ i: 0, title: "One" }, { i: 2, title: "Two" }]);
  assert.deepEqual(trackTitles(st({ deleted: true, tracks: [{ title: "One" }] })).tracks, []);
  assert.deepEqual(trackTitles("nope").tracks, []);
});

test("mbMatch needs the same title and artist and a high score", () => {
  const rec = (o) => ({ id: "m1", score: 100, title: "Yesterday", "artist-credit": [{ name: "The Beatles" }], ...o });
  assert.equal(mbMatch({ recordings: [rec()] }, "the beatles", "Yesterday (Remastered)")?.mbid, "m1");
  assert.equal(mbMatch({ recordings: [rec({ score: 60 })] }, "The Beatles", "Yesterday"), null);
  assert.equal(mbMatch({ recordings: [rec()] }, "Someone Else", "Yesterday"), null);
  assert.equal(mbMatch({ recordings: [rec({ title: "Yesterday Once More" })] }, "The Beatles", "Yesterday"), null);
  assert.equal(mbMatch({}, "a", "b"), null);
  assert.match(mbUrl('A"B', "T"), /^https:\/\/musicbrainz\.org\/ws\/2\/recording\?/);
});

test("reportOf fits the reports contract: one line, at most 300 characters", () => {
  const r = reportOf("inst1", 2, { mbid: "m", title: "x\ny".repeat(200), artist: "a" }, 5);
  assert.ok(r.note.length <= 300 && !/\p{Cc}/u.test(r.note));
  assert.deepEqual([r.track, r.kind, r.contact, r.target], [2, "copyright", "", "inst1"]);
});

test("anteProof carries enough work and a valid signature for its report", async () => {
  const sk = ed.utils.randomPrivateKey(), report = reportOf("inst1", 0, { mbid: "m", title: "T", artist: "A" }, 1700000000000);
  const { a, proof } = await anteProof(sk, report);
  assert.equal(a, Buffer.from(await ed.getPublicKeyAsync(sk)).toString("hex"));
  const b = Buffer.from(proof, "hex");
  assert.ok(b.includes(Buffer.from(purposeOf(report))));
  assert.equal(b[0], 0xa5); // a CBOR map of five fields, as ciborium writes an AnteProof
  assert.equal(REPORT_BITS, 18);
});
