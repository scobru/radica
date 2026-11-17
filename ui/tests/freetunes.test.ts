import test from "node:test";
import assert from "node:assert/strict";
import {
  freetunesCard,
  freetunesLink,
  parseRelease,
  parseFreetunesDirectory,
  freetunesReleasesForArtist,
  parseFreetunesProfileInput,
  freetunesProfileCard,
  freetunesArtistLink,
  freetunesDirKey,
  freetunesAllReleaseRefs,
} from "../src/freetunes.ts";

const REL = "FhT3HnNwsKk7aa5MaGh9dtLFMcAHD8KdwYV2Sw7RVezY";
const CH = "9eBjDkH6ZXA6ehUyWBBjT6Xg4tQE4ALZjSsgXERds4yZ";
const link = (t = "") => `listen freenet:HiAQ4uXyz1234567Mqev/#/r/${REL}.${"ab".repeat(60)}${t} #music`;
const state = (meta: object) => new TextEncoder().encode(JSON.stringify({ meta_json: JSON.stringify(meta), sig: "x" }));

test("freetunes: the release and track of a link in a caption", () => {
  assert.deepEqual(freetunesLink(link()), { release: REL, track: 0 });
  assert.deepEqual(freetunesLink(link("/3")), { release: REL, track: 3 });
  assert.equal(freetunesLink("no music here #/r/short.abc"), null);
  assert.match(freetunesCard(link("/2")), new RegExp(`data-release="${REL}".*data-track="2"`));
  assert.equal(freetunesCard("plain text"), "");
});

test("freetunes: a release state is checked before use", () => {
  const rel = parseRelease(state({ title: "Ship", artist: "Scobru", creator: "ScobruCreator", cover: { addr: CH }, tracks: [{ title: "One", chunks: [{ a: CH, ms: 1500 }, { a: CH, ms: 500 }] }] }))!;
  assert.equal(rel.tracks[0].ms, 2000);
  assert.equal(rel.cover, CH);
  assert.equal(rel.creator, "ScobruCreator");
  // a chunk address that is not an id drops its track; a removed release is nothing
  assert.equal(parseRelease(state({ title: "x", artist: "y", tracks: [{ title: "bad", chunks: [{ a: "../../x", ms: 1 }] }] }))!.tracks.length, 0);
  assert.equal(parseRelease(state({ deleted: true, tracks: [] })), null);
  assert.equal(parseRelease(new TextEncoder().encode("not json")), null);
});

test("freetunes: directory contract parsing, artist filtering, and profile input", () => {
  const pk = "464b576da4cc5bcf31febd41a863ac251d04024c19f1786b24ca6620a0cce53b";
  const params = pk + "11".repeat(16) + "2f";
  const dirBytes = new TextEncoder().encode(JSON.stringify({
    entries: {
      [REL]: {
        params,
        title: "Test Album",
        artist: "Homologo",
        cover: CH,
        ts: 1000,
      },
      "BlockedRel11111111111111111111111111111111111": {
        params,
        title: "Bad Album",
        artist: "Homologo",
        ts: 900,
      },
    },
    blocked: {
      list: ["BlockedRel11111111111111111111111111111111111"],
    },
  }));

  const entries = parseFreetunesDirectory(dirBytes);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Test Album");
  assert.equal(entries[0].artist, "Homologo");

  const byArtist = freetunesReleasesForArtist(entries, pk);
  assert.equal(byArtist.length, 1);
  assert.equal(freetunesReleasesForArtist(entries, "00".repeat(32)).length, 0);

  // Profile input parsing
  const parsed1 = parseFreetunesProfileInput(link());
  assert.equal(parsed1?.releases.length, 1);
  assert.equal(parsed1?.releases[0].id, REL);

  const parsed2 = parseFreetunesProfileInput(`https://127.0.0.1:7509/v1/contract/web/HiAQ4ucHkDKw6ShMa9ipX73h9XxdyGD5cN2DSW78Mqev/#/a/${pk}`);
  assert.equal(parsed2?.artistHex, pk);

  // Profile card rendering
  const cardHtml = freetunesProfileCard({
    artistHex: pk,
    artistName: "Homologo",
    releases: entries,
  });
  assert.match(cardHtml, /Music on FreeTunes/);
  assert.match(cardHtml, /Homologo/);
  assert.match(cardHtml, /Test Album/);

  // Profile card rendering with creatorName
  const creatorCardHtml = freetunesProfileCard({
    artistHex: pk,
    artistName: "Homologo",
    creatorName: "Scobru",
    releases: entries,
  });
  assert.match(creatorCardHtml, /Music on FreeTunes/);
  assert.match(creatorCardHtml, /Scobru/);

  // Profile card rendering with authorDisplayName fallback
  const authorCardHtml = freetunesProfileCard(
    {
      artistHex: pk,
      artistName: "FreeTunes Artist",
      releases: entries,
    },
    undefined,
    "ScobruAuthor"
  );
  assert.match(authorCardHtml, /ScobruAuthor/);

  // artistName that is just the persona's base58 key (several artist names) must not hide the nickname
  const keyCard = freetunesProfileCard(
    { artistHex: pk, artistName: CH, releases: entries },
    undefined,
    "ScobruNick"
  );
  assert.match(keyCard, /ScobruNick/);
  assert.doesNotMatch(keyCard, new RegExp(`link-card-title">${CH}`));

  // Profile card rendering with 0 listed releases still renders artist card & link
  const emptyCardHtml = freetunesProfileCard({
    artistHex: pk,
    artistName: "xdanae",
    releases: [],
  });
  assert.match(emptyCardHtml, /Music on FreeTunes/);
  assert.match(emptyCardHtml, /xdanae/);
  assert.match(emptyCardHtml, /Open artist profile on FreeTunes/);

  // Artist link in caption
  const artistCaption = `Check out this artist: http://127.0.0.1:7509/v1/contract/web/HiAQ4ucHkDKw6ShMa9ipX73h9XxdyGD5cN2DSW78Mqev/#/a/${pk}`;
  assert.equal(freetunesArtistLink(artistCaption), pk);
  assert.match(freetunesCard(artistCaption), /ft-artist-card/);

  // Directory key derivation
  const key = freetunesDirKey();
  assert.ok(key.codePart());
});
