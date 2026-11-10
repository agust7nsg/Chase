# Installed catalog artwork

The original English TCGdex assets are downloaded from https://assets.tcgdex.net without resizing, re-encoding or quality changes. `manifest.json` records exact source-to-file mapping, source revision, included sets, bytes and unavailable source images. `scripts/catalog/bundle-artwork.mjs` validates file signatures and bundles the three newest sets with advertised artwork, plus available set logos/symbols. At this revision these are 30th Celebration, Pitch Black and Chaos Rising; Delta Reign and 30th Classic have no advertised English card pictures in the upstream image index. Missing provider images are not replaced with another printing.

The complete base dataset is generated from https://github.com/tcgdex/cards-database at revision `00d5de7fc75917545f348fdc282540ff5a1d44bc`. The data's MIT license is reproduced in `TCGDEX_LICENSE.txt`. Pokémon TCG artwork and marks belong to their respective owners; the database software license does not transfer artwork ownership.

Regenerate after reviewing upstream changes:

```
git clone --depth 1 https://github.com/tcgdex/cards-database.git /tmp/tcgdex-source
curl -fsSL https://assets.tcgdex.net/datas.json -o /tmp/tcgdex-images.json
node scripts/catalog/build-base.mjs /tmp/tcgdex-source /tmp/tcgdex-images.json
node scripts/catalog/bundle-artwork.mjs 3
```

These generators are maintenance commands, not install-time or startup downloads. EAS/Cloudflare builds use the reviewed checked-in files. The app keeps the provider's public canonical image URL in saved card references, while rendering the identical installed asset when available.
