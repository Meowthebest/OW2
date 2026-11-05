# Cosmetics data

Sources for the cosmetics section of the site. `npm run build` joins these into the files the site reads.

- `shop/` is written by the shop recorder. Don't edit it by hand.
- `wiki/` is written by `import-wiki`, and is licensed [CC BY-NC-SA 3.0](wiki/LICENSE.md).
- `curated/` is entered by hand. Every record needs a source, or the build stops.
- `corrections.json` is for admin fixes, which are applied last.

See [docs/COSMETICS_DATA.md](../../docs/COSMETICS_DATA.md) for how it all works.
