import test from "node:test";
import assert from "node:assert/strict";
import { repostBody, repostCaption, repostCard, repostLink, repostRef, repostText, repostCountsOf, hasUserReposted } from "../src/repost.ts";
import { renderCaption } from "../src/caption.ts";

const AUTHOR = "ab".repeat(32);
const APP = "/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/";
const ref = { id: "post_1730000000_abc123", author: AUTHOR };

test("a repost link round-trips, with or without the reposter's words", () => {
  const link = repostLink(APP, ref);
  assert.equal(link.startsWith("/v1/contract/web/"), true); // relative: the reposter's node address is not published
  assert.deepEqual(repostRef(repostCaption("", link)), ref);
  const quoted = repostCaption("  worth reading #freenet ", link);
  assert.deepEqual(repostRef(quoted), ref);
  assert.equal(repostText(quoted), "worth reading #freenet");
  assert.equal(repostText(repostCaption("", link)), "");
});

test("the permalink of the Share dialog (a full node address) is a repost too", () => {
  const shared = `look\nhttp://127.0.0.1:7509${APP}#post=${ref.id}&author=${AUTHOR} and more`;
  assert.deepEqual(repostRef(shared), ref);
  assert.equal(repostText(shared), "look\n and more");
});

test("text that is no permalink is no repost", () => {
  for (const c of ["", "plain #post", `#post=${ref.id}`, `x#post=${ref.id}&author=${"ab".repeat(31)}`, `x#post=${ref.id}&author=${AUTHOR}ff`, `x#post=bad id&author=${AUTHOR}`])
    assert.equal(repostRef(c), null, c);
  assert.equal(repostCard("just words"), "");
});

test("an older app still shows the repost as a link to the post", () => {
  const html = renderCaption(repostCaption("", repostLink(APP, ref)), () => "Ada");
  assert.match(html, /post by Ada/);
});

test("the card names its post, and what it shows is escaped", () => {
  const card = repostCard(repostCaption("hi", repostLink(APP, ref)));
  assert.match(card, new RegExp(`data-repost-id="${ref.id}" data-repost-author="${AUTHOR}"`));
  assert.doesNotMatch(repostBody("<gone>"), /<gone>/);
  const body = repostBody({ name: "<b>Ada</b>", avatar: "data:image/svg+xml,x", time: "2h", textHtml: "<em>ok</em>", mediaHtml: "" });
  assert.doesNotMatch(body, /<b>Ada/);
  assert.match(body, /Ada/);
  assert.match(body, /<em>ok<\/em>/);
  assert.doesNotMatch(body, /repost-media/);
});

test("repostCountsOf and hasUserReposted correctly count and detect reposts", () => {
  const postA = { id: "pA", author: AUTHOR };
  const postB = { id: "pB", author: "cd".repeat(32) };
  const user1 = "11".repeat(32);
  const user2 = "22".repeat(32);

  const posts = [
    { author: user1, caption: repostCaption("reposting A", repostLink(APP, postA)) },
    { author: user2, caption: repostCaption("also sharing A", repostLink(APP, postA)) },
    { author: user1, caption: repostCaption("sharing B", repostLink(APP, postB)) },
    { author: user2, caption: "just a normal post with no link" },
  ];

  const counts = repostCountsOf(posts);
  assert.equal(counts.get(`${postA.author}:${postA.id}`), 2);
  assert.equal(counts.get(`${postB.author}:${postB.id}`), 1);
  assert.equal(counts.get("unknown:none"), undefined);

  assert.equal(hasUserReposted(posts, user1, postA.id, postA.author), true);
  assert.equal(hasUserReposted(posts, user2, postA.id, postA.author), true);
  assert.equal(hasUserReposted(posts, user2, postB.id, postB.author), false);
  assert.equal(hasUserReposted(posts, "33".repeat(32), postA.id, postA.author), false);
});
