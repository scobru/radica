# Folio

A minimal, telegra.ph-style article writer for Freenet: paste a title and your Markdown, hit Publish,
get a token to paste into a post. No account, no [Viso](https://github.com/scobru/viso) persona, no sign-in.

## What it does

- **Write & publish.** One page: title, optional subtitle, tags, a Markdown body (Write/Preview toggle).
  Publishing writes the article straight to [Radica](https://github.com/scobru/radica)'s `media-contract` —
  one immutable blob per content hash, the same contract Radica itself uses for post images. Anyone can
  write to it: validity comes only from the bytes hashing to their own address, nothing else.
- **No identity of its own.** Folio signs nothing and holds no persona. Publishing gives you a
  `radica-article:<hash>` token — paste it into any post you write in Radica, and `parseArticleCaption`
  (already in Radica, not added for this) finds it and renders a full Article card: title, subtitle, tags,
  reading time, rendered body, under *your* real signed identity, with real likes, comments, edit and
  report. Folio needs no Radica-specific setup, URL, or configuration at all — it's a text generator, not
  an integration.
- **Same wire format.** The published JSON is Radica's own `ArticlePayload` shape
  (`radica/ui/src/articles.ts`), so Radica renders it exactly like an article written from its own composer.

## Limitations

- No drafts, no editing, no cover image, no deletion: the media-contract is write-once per hash. Publish
  again (even a one-character change) and you get a new token; the old one still resolves to the old text.
- Needs a Freenet node to publish to (`127.0.0.1:7509` by default, or wherever the page is served from).
- The article is public and permanent on Freenet the moment it's published — there's no way to take it back.
- The token only becomes a real, attributed article once someone pastes it into a signed post; on its own
  it's just a blob nobody has vouched for.

## Development

```bash
npm install
npm test            # pure article-building logic (word count, reading time, tags, payload shape, markdown)
echo VITE_NODE=127.0.0.1:7509 > .env.local   # optional: the node to use under npm run dev
npm run dev          # http://localhost:5173
```

## Publishing

```bash
npm run build
fdev website init folio       # once: creates the signing key. Back it up!
fdev website publish dist --key folio
# later releases:
fdev website update dist --key folio
```

## License

MIT, see [LICENSE](../LICENSE).
