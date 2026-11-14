import { clearResolvedFreenames, setResolvedFreename } from "../src/freenames.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { linkCard, linkify, md, renderCaption, renderChatText, renderPost, renderComment, mentionsIn, plainMentions, setMaskBadWords, trendingTags } from "../src/caption.ts";
import { namesToKeys } from "../src/mentionPicker.ts";

test("caption: links become anchors, hashtags filters, everything else is escaped", () => {
  assert.equal(
    renderCaption("https://google.com"),
    '<a class="post-link" href="https://google.com" target="_blank" rel="noopener noreferrer nofollow">google.com</a>'
  );
  const html = renderCaption("read http://a.org/x#frag, then #p2p <b>");
  assert.match(html, /href="http:\/\/a\.org\/x#frag"/); // a # inside a link is not a hashtag
  assert.match(html, /<\/a>, then <span class="hashtag clickable-hashtag" data-tag="p2p"/);
  assert.match(html, /&#60;b&#62;$/);
});

test("caption: punctuation after a link stays outside it and markup cannot break out of the href", () => {
  assert.match(renderCaption("(see https://x.org/a)."), />x\.org\/a<\/a>\)\.$/);
  const evil = renderCaption('https://x.org/"onmouseover="alert(1)');
  assert.ok(!evil.includes('"onmouseover'));
  assert.equal(renderCaption("javascript:alert(1) no link"), "javascript:alert(1) no link");
});

test("caption: chat text gets links but no hashtag filters", () => {
  assert.equal(linkify("a #tag <b>"), "a #tag &#60;b&#62;");
  assert.match(linkify("see https://x.org/a."), /<a class="post-link" href="https:\/\/x\.org\/a"[^>]*>x\.org\/a<\/a>\.$/);
});

test("caption: freenet: links open on the reader's node", () => {
  assert.match(
    linkify("see freenet:Hzr1Gh39ab/llms.txt."),
    /href="http:\/\/127\.0\.0\.1:7509\/v1\/contract\/web\/Hzr1Gh39ab\/llms\.txt"[^>]*>freenet:Hzr1Gh39ab\/llms\.txt<\/a>\.$/
  );
  assert.equal(linkify("freenet:short"), "freenet:short"); // too short for a contract id
});

test("caption: a node URL is shortened and re-pointed at the reader's node", () => {
  const html = linkify("try http://10.0.0.5:8080/v1/contract/web/9eBjDkH6ZXA6ehUyWBBjT6Xg4tQE4ALZjSsgXERds4yZ/");
  assert.match(html, /href="http:\/\/127\.0\.0\.1:7509\/v1\/contract\/web\/9eBjDkH6ZXA6ehUyWBBjT6Xg4tQE4ALZjSsgXERds4yZ\/"/);
  assert.match(html, />freenet:9eBjDk\u2026s4yZ<\/a>$/);
});

test("caption: web links show a short label, and a post gets a card for its first web link", () => {
  const long = "https://www.youtube.com/watch?v=2XqdW4A5w2M&list=RD2XqdW4A5w2M&start_radio=1";
  assert.match(linkify(long), />www\.youtube\.com\/watch\?v=2XqdW4A5w2M&#38;list=\u2026<\/a>$/);
  const card = linkCard(`UH YEAAH! ${long}`);
  assert.match(card, /class="link-card" href="https:\/\/www\.youtube\.com\/watch/);
  assert.match(card, />youtube\.com<.*Watch on YouTube/);
  assert.match(linkCard("see https://x.org/a."), /href="https:\/\/x\.org\/a"/);
  assert.equal(linkCard("freenet:Hzr1Gh39ab/llms.txt and no web link"), "");
  assert.ok(!linkCard('https://x.org/"onmouseover="alert(1)').includes('"onmouseover'));
});

test("caption: in a post the carded link leaves the text, other links stay", () => {
  const { html, card } = renderPost("UH YEAAH!\n\nhttps://www.youtube.com/watch?v=a&list=b");
  assert.equal(html, "UH YEAAH!");
  assert.match(card, /href="https:\/\/www\.youtube\.com\/watch\?v=a&#38;list=b"/);
  const two = renderPost("a https://x.org/1 and https://y.org/2");
  assert.ok(!two.html.includes("x.org/1"));
  assert.match(two.html, /y\.org\/2/);
  assert.deepEqual(renderPost("no links #tag").card, "");
});

test("mentions: stored as @key, shown as @Name that opens the profile, escaped", () => {
  const a = "a".repeat(64);
  const b = "0123456789abcdef".repeat(4);
  const names: Record<string, string> = { [a]: "Pi <Chi>", [b]: "Ivvor" };
  const nameOf = (pk: string) => names[pk];
  const html = renderCaption(`hi @${a} and @${b}, #p2p`, nameOf);
  assert.match(html, new RegExp(`class="mention author-clickable" data-author="${a}"[^>]*>@Pi &#60;Chi&#62;</span>`));
  assert.match(html, />@Ivvor<\/span>, /);
  assert.match(html, /data-tag="p2p"/);
  assert.equal(renderComment(`<b> @${b}!`, nameOf), `&#60;b&#62; <span class="mention author-clickable" data-author="${b}" title="Persona: ${b}">@Ivvor</span>!`);
  assert.deepEqual(mentionsIn(`@${a} @${b} @${a} @${a}f`), [a, b]); // a longer hex run is no mention
  assert.equal(plainMentions(`hey @${b}`, nameOf), "hey @Ivvor");
  assert.equal(renderCaption("mail@" + "a".repeat(10)), "mail@" + "a".repeat(10));
});

test("mentions: picked names become keys, the longer name first", () => {
  const picks = new Map([["Ann", "k1"], ["Ann Lee", "k2"]]);
  assert.equal(namesToKeys("@Ann Lee and @Ann, not Ann", picks), "@k2 and @k1, not Ann");
});

test("inline Markdown: bold, italic, strike, code; snake_case and code stay as typed", () => {
  assert.equal(md("I wonder if **Markdown** works"), "I wonder if <strong>Markdown</strong> works");
  assert.equal(md("*a* and _b_ ~~c~~"), "<em>a</em> and <em>b</em> <del>c</del>");
  assert.equal(md("snake_case_name 2*3*4"), "snake_case_name 2*3*4");
  assert.equal(md("`**x**`"), "<code>**x**</code>");
  assert.equal(renderComment("**<b>**"), "<strong>&#60;b&#62;</strong>");
  assert.match(renderCaption("**#p2p** https://x.org/a_b_c"), /href="https:\/\/x\.org\/a_b_c"/);
});

test("chat: a River mention shows as @Name", () => {
  assert.equal(linkify("@[Scobru](rv:7D63B74P) potresti?"), `<span class="mention">@Scobru</span> potresti?`);
  assert.equal(linkify("@[<b>](rv:X1)"), `<span class="mention">@&#60;b&#62;</span>`);
});

test("caption: long contract paths get a short label, FreeTunes releases and tracks a named one", () => {
  const rel = "#/r/FhT3HnNwsKk7aa5MaGh9dtLFMcAHD8KdwYV2Sw7RVezY." + "ab".repeat(60);
  const id = "HiAQ4uXyz1234567Mqev";
  assert.match(linkify(`freenet:${id}/${rel}`), />freenet:HiAQ4u…Mqev\/♪ release<\/a>$/);
  assert.match(linkify(`freenet:${id}/${rel}/2`), />freenet:HiAQ4u…Mqev\/♪ track 3<\/a>$/);
  assert.match(linkify(`freenet:${id}/${rel}`), new RegExp(`href="[^"]+/${id}/#/r/FhT3`)); // the link itself is untouched
  assert.match(linkify(`freenet:${id}/some/very/long/path/to/a/file.txt`), />freenet:HiAQ4u…Mqev\/some\/very\/long\/path\/…<\/a>$/);
});

test("messenger chat: River and Radica mentions show as @Name, no hashtag filters, Markdown kept", () => {
  const pk = "ab".repeat(32);
  const nameOf = (k: string) => (k === pk ? "Ivvor" : k.slice(0, 8));
  assert.equal(renderChatText("@[Scobru](rv:7D63B74P) potresti?", nameOf), `<span class="mention">@Scobru</span> potresti?`);
  assert.equal(renderChatText("@[<b>](rv:X1)", nameOf), `<span class="mention">@&#60;b&#62;</span>`);
  assert.match(renderChatText(`ciao @${pk} **ok** #tag`, nameOf), /^ciao <span class="mention author-clickable" data-author="(?:ab)+"[^>]*>@Ivvor<\/span> <strong>ok<\/strong> #tag$/);
  assert.equal(plainMentions("@[Scobru](rv:7D63B74P) hi"), "@Scobru hi");
});

test("comment media: embeds GIF and image attachments (markdown syntax and standalone URLs)", () => {
  const hash = "1".repeat(64);
  const mediaRef = `radica-media:${hash}`;
  const gifUrl = "https://media.giphy.com/media/gl0mkIZOW6Nwc/giphy.gif";

  // Standalone markdown image
  const onlyMedia = renderComment(`![My photo](${mediaRef})`);
  assert.equal(onlyMedia, `<div class="comment-media"><img data-media="${hash}" alt="My photo" loading="lazy" class="comment-img" /></div>`);

  // Text + markdown GIF
  const textAndGif = renderComment(`So true! 😂 ![popcorn](${gifUrl})`);
  assert.equal(textAndGif, `So true! 😂 <div class="comment-media"><img src="${gifUrl}" alt="popcorn" loading="lazy" class="comment-img" /></div>`);

  // Standalone GIF URL
  const rawGif = renderComment(gifUrl);
  assert.equal(rawGif, `<div class="comment-media"><img src="${gifUrl}" alt="Media" loading="lazy" class="comment-img" /></div>`);

  // Text + standalone GIF URL
  const textAndRaw = renderComment(`Look at this ${gifUrl}`);
  assert.equal(textAndRaw, `Look at this <div class="comment-media"><img src="${gifUrl}" alt="Media" loading="lazy" class="comment-img" /></div>`);

  // Local vendored GIF path (Freenet sandbox friendly)
  const localGif = renderComment("![popcorn](./gifs/popcorn-eating.gif)");
  assert.equal(localGif, '<div class="comment-media"><img src="./gifs/popcorn-eating.gif" alt="popcorn" loading="lazy" class="comment-img" /></div>');

  // Unsafe protocol is not parsed as media, remains plain escaped text
  const unsafe = renderComment("![bad](javascript:alert(1))");
  assert.equal(unsafe, "![bad](javascript:alert(1))");
});

test("markdown links: [label](url) with relative contract paths, web URLs, newlines, and safe targets", () => {
  const contractId = "DkG6JqkcpVV2qDe7rdK5zU3WiyPzUny7PeYJEgGDra2r";
  // Ivvor's exact message with newline between bracket and parenthesis
  const ivvorMsg = `link is [FreeTube]\n(/v1/contract/web/${contractId}/)`;
  const renderedIvvor = renderChatText(ivvorMsg);
  assert.equal(
    renderedIvvor,
    `link is <a class="post-link" href="http://127.0.0.1:7509/v1/contract/web/${contractId}/" target="_blank" rel="noopener noreferrer nofollow" title="http://127.0.0.1:7509/v1/contract/web/${contractId}/">FreeTube</a>`
  );

  // Single-line markdown link with relative contract path
  assert.equal(
    renderChatText(`link is [FreeTube](/v1/contract/web/${contractId}/)`),
    `link is <a class="post-link" href="http://127.0.0.1:7509/v1/contract/web/${contractId}/" target="_blank" rel="noopener noreferrer nofollow" title="http://127.0.0.1:7509/v1/contract/web/${contractId}/">FreeTube</a>`
  );

  // Markdown link with web URL
  assert.equal(
    renderChatText("check [FreeTube](https://freetubeapp.io) out"),
    'check <a class="post-link" href="https://freetubeapp.io" target="_blank" rel="noopener noreferrer nofollow" title="https://freetubeapp.io">FreeTube</a> out'
  );

  // Markdown link with bold label
  assert.equal(
    renderChatText(`[**FreeTube**](/v1/contract/web/${contractId}/)`),
    `<a class="post-link" href="http://127.0.0.1:7509/v1/contract/web/${contractId}/" target="_blank" rel="noopener noreferrer nofollow" title="http://127.0.0.1:7509/v1/contract/web/${contractId}/"><strong>FreeTube</strong></a>`
  );

  // River mentions must NOT be matched as markdown links
  assert.equal(renderChatText("@[Scobru](rv:7D63B74P) potresti?"), '<span class="mention">@Scobru</span> potresti?');

  // Unsafe link protocols remain unlinked text
  assert.equal(renderChatText("[click me](javascript:alert(1))"), "[click me](javascript:alert(1))");

  // plainMentions strips markdown link syntax to plain label
  assert.equal(plainMentions(`link is [FreeTube]\n(/v1/contract/web/${contractId}/)`), "link is FreeTube");
});

test("chat markdown: code blocks and blockquotes", () => {
  // Multiline code block
  const codeBlock = md("```ts\nconst x = 1;\nconsole.log(x);\n```");
  assert.equal(codeBlock, '<pre class="chat-pre"><code>const x = 1;\nconsole.log(x);</code></pre>');

  // Blockquote
  const quote = md("&#62; this is a quote\nreply text");
  assert.equal(quote, '<blockquote class="chat-quote">this is a quote</blockquote>\nreply text');
});

test("trendingTags counts distinct authors in the last week, needs two of them", () => {
  const now = 10 * 86_400_000;
  const p = (author: string, caption: string, daysAgo = 0) => ({ author, caption, timestamp: now - daysAgo * 86_400_000 });
  const posts = [
    p("a", "#Freenet rocks"), p("b", "#freenet yes"), p("c", "love #freenet and #radica"),
    p("a", "#spam #spam"), p("a", "#spam again"),
    p("b", "#radica"), p("d", "#old", 9), p("e", "#old", 8),
  ];
  assert.deepEqual(trendingTags(posts, now), ["Freenet", "radica"]);
});

test("caption: a Radica permalink shows who wrote the post, not the contract id", () => {
  const pk = "a".repeat(64);
  const html = renderCaption(`freenet:Ex88TLxyzAbcL2Sw/#post=post_1793661020&author=${pk}`, (k) => (k === pk ? "Ivvor" : k));
  assert.match(html, />↪ post by Ivvor<\/a>$/);
  assert.match(html, /href="[^"]+\/v1\/contract\/web\/Ex88TLxyzAbcL2Sw\/#post=post_1793661020&#38;author=a{64}"/);
  assert.match(renderCaption("freenet:Ex88TLxyzAbcL2Sw/#post=post_1"), />↪ Radica post<\/a>$/);
});

test("caption: user and wall permalinks format cleanly with display name", () => {
  const pk = "b".repeat(64);
  const byUser = renderCaption(`freenet:Ex88TLxyzAbcL2Sw/#user=${pk}`, (k) => (k === pk ? "holdmylatte" : k));
  assert.match(byUser, />↪ holdmylatte&#39;s Wall<\/a>$/);
  assert.match(byUser, /href="[^"]+\/v1\/contract\/web\/Ex88TLxyzAbcL2Sw\/#user=b{64}"/);

  const byWall = renderCaption(`freenet:Ex88TLxyzAbcL2Sw/#wall=${pk}`, (k) => (k === pk ? "holdmylatte" : k));
  assert.match(byWall, />↪ holdmylatte&#39;s Wall<\/a>$/);

  const byWebUrl = renderCaption(`https://radica.example/#user=${pk}`, (k) => (k === pk ? "holdmylatte" : k));
  assert.match(byWebUrl, />↪ holdmylatte&#39;s Wall<\/a>$/);
});

test("caption: # headings at the start of a line, while #tags stay tags", () => {
  const html = renderCaption("# Pasta and Breadcrumbs\n\n**PRESENTATION**\n### Step one\nlove #italy");
  assert.match(html, /<strong class="md-h md-h1">Pasta and Breadcrumbs<\/strong>/);
  assert.match(html, /<strong class="md-h md-h3">Step one<\/strong>/);
  assert.match(html, /<strong>PRESENTATION<\/strong>/);
  assert.match(html, /data-tag="italy"/);
  assert.doesNotMatch(renderCaption("#italy rocks"), /md-h/);
});

test("offensive words are masked when reading, and shown when the reader turns it off", () => {
  assert.equal(renderChatText("what the fuck"), "what the ****");
  assert.ok(renderComment("merda https://example.org/fuck").includes("https://example.org/fuck")); // links untouched
  setMaskBadWords(false);
  try {
    assert.equal(renderChatText("what the fuck"), "what the fuck");
  } finally {
    setMaskBadWords(true);
  }
});

test("caption: freenet:scobru/fh and fn:scobru resolve to FreeNames links with target record", () => {
  clearResolvedFreenames();
  // 1. Unresolved initially points to FreeNames lookup page
  const html1 = linkify("look at freenet:scobru/fh and fn:alice!");
  assert.match(html1, /class="post-link fn-link" data-freenames="scobru\/fh"[^>]*href="http:\/\/127\.0\.0\.1:7509\/v1\/contract\/web\/CDC7PTxNxfaNnJ3RJs8UrNHTScpT2NTujhvUiwirVejE\/#\/go\/scobru%2Ffh"[^>]*>freenet:scobru\/fh<\/a>/);
  assert.match(html1, /class="post-link fn-link" data-freenames="alice"[^>]*href="http:\/\/127\.0\.0\.1:7509\/v1\/contract\/web\/CDC7PTxNxfaNnJ3RJs8UrNHTScpT2NTujhvUiwirVejE\/#\/go\/alice"[^>]*>fn:alice<\/a>/);

  // 2. Markdown link with custom label
  const mdHtml = linkify("play [FH Game](freenet:scobru/fh#play)");
  assert.match(mdHtml, /class="post-link fn-link" data-freenames="scobru\/fh" data-subpath="#play"[^>]*>FH Game<\/a>/);

  // 3. When record is resolved in cache, points directly to exact target contract web URL
  const TARGET = "HiAQ4ucHkDKw6ShMa9ipX73h9XxdyGD5cN2DSW78Mqev";
  setResolvedFreename("scobru/fh", { owner: "aa".repeat(32), target: TARGET });

  const html2 = linkify("see freenet:scobru/fh here.");
  assert.match(html2, new RegExp(`href="http://127\\.0\\.0\\.1:7509/v1/contract/web/${TARGET}/"`));
  assert.match(html2, /data-resolved="true"/);
  assert.match(html2, new RegExp(`title="FreeNames: scobru/fh → ${TARGET}"`));
});

test("caption: River and room invite links format into channel and room pills", () => {
  // 1. Raw River invite link in a caption/bio
  const rawInvite = "Follow my channel: http://localhost:7509/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/#river_invite=QCYLRbLKZHCci4q4nMVlaFNXaHU1MH3CCvdDF42QP74pCurtTtZE";
  const html1 = renderCaption(rawInvite);
  assert.match(html1, /class="post-link channel-invite-pill"/);
  assert.match(html1, /📢 Broadcast Channel<\/a>/);

  // 2. Chat room invite link with name parameter
  const roomInvite = "Join our room: freenet:Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/#join_room=room_123&key=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef&name=Secret+Club";
  const html2 = renderCaption(roomInvite);
  assert.match(html2, /class="post-link channel-invite-pill"/);
  assert.match(html2, /💬 Secret Club<\/a>/);

  // 3. Markdown link override
  const mdInvite = "[Click here to join](http://localhost:7509/#river_invite=abc123456789&chan=1)";
  const html3 = renderCaption(mdInvite);
  assert.match(html3, /class="post-link channel-invite-pill"/);
  assert.match(html3, />Click here to join<\/a>/);
});
