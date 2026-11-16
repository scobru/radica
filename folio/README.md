# Folio

A minimal, telegra.ph-style article writer for Freenet: paste a title and your Markdown, hit Publish,
get a link. No account, no [Viso](https://github.com/scobru/viso) persona, no sign-in.

## What it does

- **Write & publish.** One page: title, optional subtitle, tags, a Markdown body. Publishing writes the
  article straight to [Radica](https://github.com/scobru/radica)'s `media-contract` — one immutable blob
  per content hash, the same contract Radica itself uses for post images. Anyone can write to it: validity
  comes only from the bytes hashing to their own address, nothing else.
- **Anonymous by design.** Folio signs nothing and holds no identity, so there is no way to prove who wrote
  an article published here — and it doesn't pretend otherwise. Radica opens a Folio link
  (`#article=hash:<id>`) in its Articles Reader marked plainly **"Anonymous · published outside Radica"**,
  with none of the post-backed actions (likes, comments, edit, report) that need a real signed post behind
  them. Want a verified byline instead? Write it from Radica's own Articles composer.
- **Same wire format.** The published JSON is Radica's own `ArticlePayload` shape
  (`radica/ui/src/articles.ts`), so Radica's Reader renders it exactly like one of its own articles —
  title, subtitle, tags, reading time, rendered Markdown.

## Limitations

- No drafts, no editing, no cover image, no deletion: the media-contract is write-once per hash. Publish
  again (even a one-character change) and you get a new link; the old one still resolves to the old text.
- Needs a Freenet node to publish to (`127.0.0.1:7509` by default, or wherever the page is served from).
- The article is public and permanent on Freenet the moment it's published — there's no way to take it back.

## Development

```bash
npm install
npm test            # pure article-building logic (word count, reading time, tags, payload shape)
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

Set `VITE_RADICA_URL` (default: wherever Folio itself is served from) to the Radica deployment permalinks should point at,
before building.

## License

MIT, see [LICENSE](../LICENSE).
