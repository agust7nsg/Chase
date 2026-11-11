# Installed catalog and public update packages

The installed app now starts from the real English TCGdex structural database: 206 physical TCG sets and 21,432 canonical printings at source revision `00d5de7fc75917545f348fdc282540ff5a1d44bc`. These are provider records, not scanner examples. Metadata, the search index and per-set packages are checked in under `src/data/catalog` (about 8 MB including the search index). Sets and card grids no longer require a cold 170-card provider crawl. JSON modules are loaded per set; a bounded eight-set working cache avoids normalizing the entire catalog at launch.

The existing UI, chronological set order, full-set price sorting, pagination, canonical finish keys, Collection and Organize rules remain. A structural record has no invented quote. Exact saved quotes are retained when displaying the structural base; a real live response may still mark a price unavailable. Prices always keep their original source/date/finish. The immutable base itself contains no live prices. A new install therefore needs a downloaded price-bearing package (or the existing idle public-provider refresh) for current quotes; metadata availability does not imply price availability.

## Artwork

542 original encoded provider files (about 35 MB) include available logos/symbols and the three newest sets with advertised card artwork: 30th Celebration, Pitch Black and Chaos Rising. No image resizing or re-encoding is performed. See `assets/catalog/SOURCES.md` and its manifest, including upstream images that do not exist. Delta Reign/30th Classic have no card pictures in the upstream image index at this revision. Missing images are never replaced by other printings. Old sets retain the exact high-resolution provider URLs and existing disk-only idle prefetch (newest first, bounded concurrency, cancellation and format fallback). OS cache eviction and a first uncached older image still require internet.

## Supabase activation

App changes alone do not publish the bucket. After merging, open GitHub Actions → **Publish catalog packages** → **Run workflow**. Leave `refresh_prices` enabled for price-bearing packages; this can take substantially longer than a web build because the upstream API exposes individual card quotes. The workflow also runs weekly. It uses the existing `SUPABASE_ACCESS_TOKEN` secret; that management token must allow reading this project's server API keys. Server keys exist only in the Actions process, never logs or app files.

The workflow creates only the public-read `chase-catalog` Storage bucket (JSON only, 4 MB/object limit), uploads immutable set packages and then switches a small manifest after complete uploads. It adds no anonymous write policy and changes no Auth/scanner/collection/billing tables, secrets or quotas. Interrupted quote fetches retain the previous dated quote rather than assigning a fresh date or inventing zero. Failed publication preserves prior immutable packages. Supabase storage/egress and GitHub Actions limits still apply.

Public endpoint: `https://vzjekkgyrdxzlhaupnrw.supabase.co/storage/v1/object/public/chase-catalog/manifest.json`. The app checks it during active idle time and downloads changed packages in bounded, cancelable steps, newest first. A failed/missing publisher never blocks startup or prevents browsing the installed base. Packages validate schema, language, unique IDs and exact set membership. Updates use a separate catalog-only device namespace. Writes are serialized and timed-out native storage is quarantined; no inventory migration occurs.

Catalog browsing queues optional quote refreshes; the idle worker can still use the existing public API to refresh viewed printings/sets. It stops on scanner, Organize, foreground catalog/auth screens or background AppState. Cached full-set pricing is reused; incomplete new rankings are never presented as complete.

## Validation

```
npm run typecheck
npm run lint
npm test
EXPO_PUBLIC_ENABLE_PRO_SIMULATION=true npx expo export --platform web --platform ios --platform android --output-dir /tmp/chase-local-catalog-export
python3 -m http.server 8090 --directory /tmp/chase-local-catalog-export
npm run test:local-catalog
```

`test:local-catalog` checks cold browsing and original bundled art with external HTTP blocked, pagination, no provider API calls and unchanged saved ownership, at 320/390 widths. It is a browser test, not a native-device timing guarantee. Existing API-fixture browser suites should start Metro with `EXPO_PUBLIC_CATALOG_MODE=api` to test the REST adapter independently; production/default mode uses the installed base. No new native dependency is required, but an existing APK must be rebuilt to include the dataset and image files. Cloudflare web export includes them automatically after a push; its first browser visit must still download the web bundle and displayed assets.
