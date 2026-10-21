# Scanner image fixtures

`card-thumbnails.json` contains losslessly zlib-compressed, base64-encoded 64×88 RGBA thumbnails for local detector regressions. It is test data only and is not imported by the application bundle. It contains no user photographs or recognition-provider responses.

Sixteen images derive from the bundled printing illustrations in `assets/chases`; see `assets/chases/SOURCES.md`. Four additional similar common-card references were downloaded from the public TCGdex artwork service:

- Ivysaur, Base Set 30: https://assets.tcgdex.net/en/base/base1/30/low.webp
- Bulbasaur, Base Set 44: https://assets.tcgdex.net/en/base/base1/44/low.webp
- Caterpie, Base Set 45: https://assets.tcgdex.net/en/base/base1/45/low.webp
- Metapod, Base Set 54: https://assets.tcgdex.net/en/base/base1/54/low.webp

These references exercise similar colors/layouts as well as full-art cards; they do not seed ownership, prices or market history. Pokémon/card artwork remains the property of its respective rights holders.
