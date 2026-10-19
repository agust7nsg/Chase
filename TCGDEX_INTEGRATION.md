# TCGdex catalog integration

Chase now uses the public English Pokémon TCG catalog from [TCGdex](https://tcgdex.dev/). This integration covers catalog identity, artwork and available ungraded market estimates. It does not recognize cards from camera pixels, add authentication, configure purchases or create cloud synchronization.

## Runtime boundary

The replaceable adapter is under `src/services/tcgdex`, with application wiring in `src/services/catalog.ts`. UI consumes normalized `Card` records through the service boundary rather than parsing TCGdex payloads. The public REST base is `https://api.tcgdex.net/v2/en`:

| Resource | Use |
| --- | --- |
| `GET /sets` | Expansion listing/filter choices |
| `GET /sets/{id}` | Complete expansion metadata and its cards |
| `GET /cards` | Card browsing, name search and collector-number filtering |
| `GET /cards/{id}` | Full printing metadata, finishes, artwork and available pricing |

The catalog starts with all expansions ordered by release date, newest first, with API logos and a separate Cards search tab. Search supports a name or collector number and an optional expansion. The adapter asks `/sets?sort:field=releaseDate&sort:order=DESC` to order complete records before the provider removes dates from its brief response. Home and the directory preserve that order. Opening a set hydrates the entire matching printing index in batches of up to six, then sorts by available price before pagination. One representative per printing uses its most valuable supported finish and that exact finish’s quote; USD/EUR comparisons use the existing disclosed sample FX conversion. Missing prices sort last and natural collector numbers break ties. Loading shows progress and cancellation stops subsequent batches. A complete-set price snapshot is cached locally for the existing TTL, using the oldest detail-cache timestamp so aggregation does not extend price freshness. It survives individual-card LRU eviction and avoids re-fetching the whole set for each page or revisit. A failed complete crawl does not display a falsely complete ranking; it offers retry or an explicitly stale previously complete snapshot. Set counts distinguish loaded cards from the actual matching index total. Global search starts only with an input, and partial results never label a loaded page as the entire catalog. Results load incrementally; the UI cancels obsolete searches and keeps request results from replacing a newer query. Loading, empty results, request failure/retry and cached results are distinct states. Failed requests do not substitute legacy sample cards. Available cached references support offline use; a first uncached search or image cannot work without internet access.

Responses use an in-memory and AsyncStorage cache, defaulting to 24 hours. Entries are versioned under `chase.tcgdex.v1:<language>:<request-path>` with `{ version: 1, savedAt, value }`. Matching requests share one pending fetch; card-detail hydration and query streams run in batches of at most six. The memory cache and indexed disk cache retain up to 250 resources per language. Provider pagination uses fixed-size pages and reuses cached earlier pages while merging name/set matches. A 12-second timeout covers both fetching and reading the response body. There are no automatic retry loops; retry is a user action. Cache write failures do not hide successful network results.

Queries may return an older cached response after refresh failure, marked as stale so Search can explain the saved results. Detail/variant refresh instead reports failure when only an expired response is available; the error includes cached normalized details, so the UI retains a registered/persisted or previously browsed snapshot and offers retry. Cache timestamps track fetch freshness separately from the provider's price update date. The cache is not a complete synchronized catalog, and no background full-catalog download is performed.

English is configured initially. Provider language is included in normalized identity so Japanese and other language catalogs can be added later without collapsing distinct printings. This task does not add a language picker or claim complete non-English coverage.

## Card and variant identity

There are two identities:

- `card.catalogIdentity.id`: the stable canonical TCGdex card ID, such as `base1-4`.
- `card.id`: Chase's collectible identity, such as `tcgdex:en:base1-4:holo`. The language and exact finish key are included.

`Normal`, `Holo`, `Reverse holo`, `First edition`, `W promo` and `Unspecified` are distinct supported labels. The adapter exposes only variants supported by the provider response. An unspecified finish is not an assertion that a card is Normal. UI variant choices use full collectible IDs, while price metadata stores the exact finish key separately.

Changing a variant selects another collectible reference, never relabels a quote from the previous variant. Different finishes use different Collection and Organize rows. Matching printing/finish entries may merge quantities under the existing domain rules.

## Pricing safeguards

`MarketPrice` retains amount, native currency, source, update timestamp, variant and valuation metric. Supported sources are TCGplayer (USD) and Cardmarket (EUR); legacy editorial/demo prices remain explicitly `mock`. Prices are estimates and do not guarantee a resale amount.

Only a valid quote for the requested printing and supported finish is selected. Ambiguous aggregate prices are not used to invent separate Normal/Holo prices, and a missing Reverse holo quote cannot borrow the Holo quote. Invalid/missing price amounts or unsupported mappings produce `marketPrice: null` and **Price unavailable**, while the card can still be browsed and owned. Provider metadata determines the update date; the request date is not presented as a provider market update.

The initial mapping accepts TCGplayer `marketPrice` for `normal`, `holofoil` and `reverse-holofoil` (plus the explicit `reverse` alias in the official example) only when unit/currency and provider update data are valid. Cardmarket's documented non-foil `trend`/`avg` fields can price Normal; its `trend-holo`/`avg-holo` fields can price a foil only when the catalog declares exactly one of Holo or Reverse holo. Both foil finishes present, First edition or W promo flags leave that aggregate unmapped. Metrics are retained, and TCGplayer is preferred when both sources provide a valid quote. First edition/W promo prices are not inferred from Holo quotes. This conservative mapping can leave a card unpriced even when a provider page shows ambiguous values.

The model leaves room for graded valuations, but no PSA 10 or other graded price integration is implemented. TCGdex's current quotes do not supply a historical series to Chase. Live catalog cards and mixed real/sample portfolios therefore receive no generated sample chart or fictitious movement.

USD/EUR remains one device-wide display preference shared by Collection and Profile. Original source quotes are not rewritten. Display/aggregate conversion still uses the disclosed fixed **sample** rate **1 USD = 0.92 EUR**, including the reciprocal for EUR-to-USD. This is not a live FX service. Selecting a display currency does not select a different printing, finish or market source.

## Saved data and compatibility

Collection remains under `chase.prototype.v1` and pending scans under `chase.scan-session.v1`. New real-card rows additionally contain a validated `card` snapshot with the matching full identity, artwork reference and available quote. Snapshots protect local ownership and pending references across restarts and provider outages. They are reference data, not proof of a current price or an offline copy of every remote image.

The original bundled sample IDs remain reserved. This matters because some legacy keys resemble provider IDs but contain corrected editorial metadata: `base2-68` represents the bundled Eevee 51/130 image, while `swshp-053` represents Wizards promo Mew 9. Automatically resolving these raw keys against TCGdex could silently change the user's saved printing. The adapter's new namespaced references avoid that collision.

No automatic ownership migration or overwrite runs. Existing IDs, quantities, trial state and save receipts stay intact. The same visual printing may consequently appear as separate legacy and live entries until a deliberate reviewed migration is designed. A malformed remote ownership snapshot produces a recoverable load error rather than silently dropping the row. Do not clear application storage to resolve such a case without first preserving the data.

The catalog registry can refresh display references without changing saved ownership IDs. Cache and snapshot validation do not make AsyncStorage a secure store or a cloud database. Device data removal still deletes local ownership and pending sessions.

## Continuous scanner compatibility

The camera-first scanner, brief overlays, **Organize (N)**, quantity/variant edits and explicit selected/all saves remain intact. Organize is staging, not Collection, and pending cards do not change portfolio totals. Durable collection receipts still prevent duplicate saves after interrupted cleanup. Missing prices do not remove pending cards.

Recognition remains a deterministic, visibly labeled demonstration with several cards. A supported real camera preview can be enabled, but no card photographs are captured or uploaded. The public catalog integration must not make demo recognition appear to be real visual identification. Free still permits one successful recognition and 50 saved total copies; a development-only local Pro switch is not purchase verification.

Real recognition is a separate next step requiring a confirmed provider and a real frame/detection adapter. No paid recognition provider, API key, proprietary ML model, Supabase instance or RevenueCat integration was added here.

## Validation commands

From the project directory:

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run export:mobile
```

For browser integration/regression checks, start `npm run web -- --localhost --port 8081`, then in a second terminal run:

```bash
npm run test:smoke
npm run test:scanner
npm run test:catalog
```

Automated provider tests and browser fixtures cover controlled payloads and failure cases. They do not prove that a particular phone/network can currently reach TCGdex. A JavaScript export does not establish real-device camera behavior or store readiness. Actual execution outcomes are reported with the implementation, separately from these reproducible instructions.

In this cloud environment, direct requests to `api.tcgdex.net` failed before reaching the service: the proxy rejected the CONNECT tunnel with HTTP 403 (`curl` error 56, upstream HTTP status 000). Retrying outside the sandbox produced the same result. Deterministic HTTP fixtures therefore validate the adapter and UI here; an actual provider request still needs validation from an Android device or another network with access. This is a network verification limitation, not a mock fallback in the shipped catalog service.

## Test on Android

Install dependencies once in the existing extracted project folder, then start Metro:

```bash
npm ci
npx expo start --go
```

Open a compatible Expo Go version on Android and scan Metro's QR code, with phone and computer on the same reachable network. If Expo requests authentication, sign in to the same Expo account on the phone and with `npx expo login` in another terminal in this project folder. Starting a new terminal does not require reinstalling dependencies. An existing development build is also suitable if it includes this project's installed native modules. No new native module is required by the catalog adapter.

Verify these flows with internet access:

1. Open **Browse by set → See all** on Home to view all expansions in newest-first order. Check 30th Celebration and Classic Collection branding. Open a set and check that the highest available prices appear first (including printings beyond the old first page by number), with unpriced cards last. Check its loaded/total counter while loading another page. Open **Search Cards** from Home. Search a Pokémon name, choose an expansion and search a collector number. Load another page, open a printing and check its image, set/number and finish choices. Confirm that a finish with no quote shows **Price unavailable**.
2. Check the source/update date of an available quote. Switch USD/EUR from Collection and from Profile; both must share the selection. Prices must convert without changing printing or finish.
3. Add a real card from Details, change its quantity, then fully restart the app. The same collectible identity and quantity must persist. Confirm that real holdings do not receive sample historical movement.
4. After loading a query/card, temporarily disable connectivity and revisit it. Available cached/saved references should remain readable; uncached requests should show a recoverable unavailable state. Re-enable connectivity and retry. Uncached images may remain unavailable offline.
5. Open the scanner, run a labeled demo recognition, enter Organize, change quantity/variant, inspect Details, return and save explicitly. Pending items must not affect the collection before saving. Repeat with **Development only · simulate Pro** for multiple consecutive cards; turn it off afterward to check Free limits.
6. Dismiss the paywall, background/restore the app and reopen Organize. Pending cards must survive. Retry a previously completed save and verify that it does not add duplicate copies.

Also check native camera permission denial/approval, camera cleanup on backgrounding, safe areas, large text and accessibility. These require physical-device validation; the Linux cloud environment does not include an Android emulator/`adb` or an iOS simulator.

## Implementation files

| Area | Files |
| --- | --- |
| Adapter and runtime | `src/services/tcgdex/{index,normalize,types}.ts`, `src/services/catalog.ts`, `src/services/index.ts`, `src/services/mocks.ts` |
| Identity and ownership | `src/data/catalogRegistry.ts`, `src/data/mocks/catalog.ts`, `src/types/{domain,scanner}.ts`, `src/services/{domain,scanSession}.ts`, `src/features/app/ChaseProvider.tsx` |
| Set organization | `src/features/cards/{CatalogTabs,SetLogo,SetsDirectory}.tsx`, `src/features/cards/useCatalogSets.ts`, `src/features/home/HomeSetsShelf.tsx`, `src/services/tcgdex/organization.ts` |
| Artwork and catalog screens | `src/data/cardVisuals.ts`, `src/components/{CardPrint,CardRow}.tsx`, `src/features/cards/{SearchScreen,CardDetailScreen,CardTile}.tsx` |
| Existing integrations | `src/features/collection/{CollectionScreen,MyCardsScreen}.tsx`, `src/services/{currency,priceHistory}.ts`, `src/features/currency/CurrencyProvider.tsx`, `src/features/home/HomeScreen.tsx`, `src/features/onboarding/{OnboardingArtwork,PriceCarousel}.tsx`, `src/features/scanner/{ScanSessionProvider,OrganizeScreen,ScannerScreen}.tsx` |
| Validation | `tests/{tcgdex,catalogCompatibility,liveHistory,currency,scanner}.test.ts`, `scripts/{catalog-smoke,scanner-smoke,smoke}.mjs`, `scripts/fixtures/tcgdex.mjs`, `package.json` test command |
| Documentation | `README.md`, `ARCHITECTURE.md`, `SCANNER_WORKFLOW.md`, `AGENTS.md`, this file |

## Official schema sources consulted

- [Card reference and pricing schema](https://github.com/tcgdex/documentation/blob/master/src/content/docs/reference/card.mdx)
- [Filtering, sorting and pagination](https://github.com/tcgdex/documentation/blob/master/src/content/docs/rest/filtering-sorting-pagination.mdx)
- [Card endpoint](https://github.com/tcgdex/documentation/blob/master/src/content/docs/rest/card.mdx), [card list](https://github.com/tcgdex/documentation/blob/master/src/content/docs/rest/cards.mdx), [sets](https://github.com/tcgdex/documentation/blob/master/src/content/docs/rest/sets.mdx), [set details](https://github.com/tcgdex/documentation/blob/master/src/content/docs/rest/set.mdx)

These upstream sources were accessible through raw GitHub URLs when the public API was blocked. The pricing table's timestamp/unit types conflict with its concrete example; the adapter accepts the example's ISO timestamp and USD/EUR strings and rejects unknown representations. The official SDK 2.9.0 package independently confirms the colon-prefixed pagination parameter names; the SDK is not installed as an application dependency.

## Executed validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 85 tests passed, including catalog parsing, real query parameters, exact variants/pricing, offline failures, persistence and Phase A compatibility.
- `npm run test:smoke`: 22 browser scenarios passed.
- `npm run test:scanner`: 14 browser scenarios passed.
- `npm run test:catalog`: 11 browser scenarios passed after the final integration changes.
- `npm run export:mobile`: iOS and Android JavaScript/Hermes exports passed; these are not native device tests or signed builds.
- Browser suites used intercepted provider HTTP responses and images, with no JavaScript runtime errors. Phone-size and landscape UI checks retained the existing design.
- Actual public API connectivity remains blocked by the cloud proxy as described above. Physical Android/iOS camera and network validation were not performed.

The set-organization update also passed the 22 general browser scenarios and 11 catalog scenarios, including directory logo URLs, exact loaded/total counters, natural collector-number pagination, missing artwork/logo fallback, back-navigation state and cold offline references. Set/card visual review used actual official logos and matching bundled printing art at phone widths (320/390) and landscape. These are browser checks; physical-device testing is still needed.

## Chronological sets and price-ranked browsing

Set ordering uses the documented REST sorting parameters; no dates are guessed from IDs and no per-set metadata crawl is needed. The 30th Celebration asset was verified at `https://assets.tcgdex.net/en/me/30th/logo.png`; its WebP is unavailable. Extensionless branding tries WebP then PNG before the symbol. A bundled official anniversary mark protects `30th` and `30th-c` when their remote logos fail; Classic is captioned, rather than inventing a separate official logo. See `assets/sets/SOURCES.md`.

The first uncached opening of a large expansion needs one detail request per matching printing to compare all prices accurately. Requests are bounded to six at a time and report progress. Subsequent pages/revisits use the complete cached ranking. Only supported, exact-finish raw quotes affect rank; RGB Mew or any other printing without a valid provider quote remains unpriced, not assigned an invented valuation. This changes neither saved identities nor Collection/ScanSession quantities and requires no migration.

Validation for this update: TypeScript and lint passed; 90 unit tests, 12 catalog browser scenarios and 22 general browser scenarios passed. Android/iOS JavaScript/Hermes exports passed. Browser checks cover chronological set order in both entry points, PNG fallback and bundled Classic branding, full-set price ranking before pagination, offline replay and unchanged ownership. Visual checks at 320/390 widths used the verified anniversary PNG. API behavior was exercised with intercepted REST fixtures because this cloud network still returns HTTP 403 for the public API; physical-device testing remains necessary.
