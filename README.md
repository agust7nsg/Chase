# Chase

Chase v0.1 is a navigable Pokémon TCG collection prototype for iOS and Android, built with Expo SDK 57, React Native, TypeScript, and Expo Router. It supports guest use and local storage. It is a frontend foundation, not a production release.

## Run the project

Use Node.js 24.19 and npm 11.9, the versions used in the cloud environment. Dependencies are locked in `package-lock.json`.

```bash
cd Chase
npm ci
npm run start
```

Open the development server with a compatible Expo Go version or a development build on an iOS or Android device. These commands require the corresponding local tools:

```bash
npm run android  # Android emulator/device with Android SDK and adb
npm run ios      # iOS simulator on macOS with Xcode
npm run web      # Browser preview; mobile remains the primary target
```

The cloud machine runs Linux. It cannot run an iOS simulator, and an Android emulator or `adb` is not provided. A successful JavaScript export is useful validation, but does not replace device testing or a signed native build.

## Prototype flows

- Three visual onboarding screens introduce prices, scanning and the collection with short titles and prominent card artwork. A swipeable five-card price carousel keeps the centered printing, name, set and sample quote synchronized without saving ownership. Neighboring cards remain visible, with accessible previous/next controls and keyboard navigation. The optional complimentary scan and closeable Pro preview preserve the original skip and persistence rules.
- Home provides a dedicated scanner entry point, manual search, recent cards and a searchable shelf of all TCGdex sets with their logos. On each cold app launch, its artwork is drawn randomly from Dragonite V 192/203, Greninja ex 214/167 (Twilight Masquerade) and Umbreon VMAX 215/203. The locally saved cycle shows all three before repeating and prevents consecutive repeats across cycles. Tab navigation and returning from other screens preserve the session artwork. This does not save cards or spend scans. The removed scan-status caption retains its original blank space so the panel keeps its size.
- The continuous scanner keeps a camera-first view, compact result overlays and **Organize (N)**. Its deterministic demo presents several cards automatically or one at a time. Recognition stages cards in a separate persistent session; only Organize's explicit selected/all save changes the collection. A supported camera preview can be enabled from the scanner, but actual card detection/recognition remains simulated. See [the Phase A workflow](SCANNER_WORKFLOW.md).
- Card catalog opens a newest-first directory of all English TCGdex sets with their logos. Cards can be searched across all sets or browsed inside an expansion by available price, highest first. Set pages show loaded cards against the exact printing-index total; partial global searches identify loaded results instead of presenting a page size as the whole catalog. Full printing details, remote artwork and available ungraded prices remain connected. Loading, empty, retry and cached/offline states remain explicit. New collectible variants have separate stable identities; a Holo quote is never silently reused for Reverse holo.
- Collection includes every saved copy with an available quote and identifies missing valuations. Existing sample-only holdings retain their interactive sample timeline (7D / 1M / 3M / 1Y). Real catalog holdings do not receive invented history, and mixed portfolios do not display a synthetic combined history. Inventory search/sort, quantity changes and confirmed removal remain available.
- Profile keeps the guest identity on a lilac header with Mew VMAX 269/264, followed by Account and Settings & support. Explore Chase Pro and Restore Purchases share a Chase Pro section below settings. The membership capacity/scan summary was removed from Profile; entitlement enforcement remains in the domain. Account and purchase integrations remain explicitly unfinished.
- In development builds, Profile offers **Preview onboarding** to revisit the introduction without resetting collection data or trial use, and **Development only · simulate Pro**. It changes prototype access locally and never makes a purchase.

Free access includes catalog browsing, manual search, available ungraded prices, one collection, up to **50 total card copies**, and one complimentary successful sample recognition. The centralized mock entitlement model represents unlimited Pro scans and saved copies, plus future multiple collections, graded prices, and CSV export. Those future features are not implemented.

## Real catalog and remaining simulations

Catalog browsing and printing lookup use TCGdex directly, without API keys or a backend. Available TCGplayer USD and Cardmarket EUR quotes retain their source, exact supported finish and update date. Missing/unsupported pricing displays **Price unavailable**. No PSA 10 pricing or historical market feed is integrated. See [TCGdex integration and device checks](TCGDEX_INTEGRATION.md).

Frame detection, recognition and subscription access remain simulated. `expo-camera` provides an optional real preview; the scanner does not capture or upload photographs and does not identify cards from camera pixels. Authentication, purchase, restoration, account deletion, and cloud synchronization are not connected. The public catalog integration adds no Supabase, RevenueCat or paid service.

The editorial illustrations and deterministic scanner retain **16 bundled Pokémon TCG printing images across 17 legacy catalog entries**, from Base Set Charizard to Umbreon VMAX, Rayquaza VMAX, Giratina V, Lugia V, Gengar VMAX, Dragonite V, Magikarp, Ash-Greninja EX and Twilight Masquerade Greninja ex. TCGdex search results use the provider's remote artwork; uncached remote images require a connection. Existing light/blue layouts, Home's launch rotation and Mew VMAX 269/264 Profile composition remain in place. See [bundled image sources and printing notes](assets/chases/SOURCES.md), including the first-edition Charizard reference, the shared Pikachu variant image, and corrected legacy Eevee/Mew printing metadata. Collection onboarding uses Rayquaza VMAX and an independent rising sample portfolio ($1,120 to $1,280, +14.29% over one month before display conversion). It does not seed ownership. The former Mew character asset remains archived; see [character sources](assets/cards/SOURCES.md).

Saved legacy IDs and quantities are preserved without automatic remapping. New TCGdex cards store their canonical provider identity separately from their namespaced collectible/finish ID, with a validated card snapshot alongside saved Collection or pending Organize rows. Existing examples and live entries can coexist; they are not automatically merged. This avoids overwriting legacy IDs that happen to resemble provider IDs but represent different metadata.

Legacy sample price history is generated locally by `src/services/priceHistory.ts` and ends at **October 1, 2026**. It is not downloaded market history or a forecast. For those examples the wallet revalues **today’s quantities** at simulated earlier prices: adding or removing copies recalculates the curve. Changes indicate sample movement, **not profit or actual past account balances**. Real catalog cards and mixed portfolios do not inherit these sample curves. No cost basis, trades or ownership history are inferred from `addedAt`. The sample-wallet preview never seeds ownership or spends a scan.

Onboarding, trial use, collection copies, and the prototype plan are persisted with AsyncStorage on the current device. Production builds restore the plan as Free; development Pro simulation never grants a production subscription. Existing copies are preserved when returning to Free, including collections over the limit; reducing quantities remains possible. Removing app data clears this local prototype state. AsyncStorage is not secure storage and must not hold private credentials.

Pending scan rows use a separate `chase.scan-session.v1` key. They survive navigation/reload and never enter portfolio totals until saved. Collection saves persist operation receipts before pending rows are removed, preventing duplicate copies after interrupted cleanup. Failed/excess-capacity rows remain pending. Discarding a session requires confirmation and never resets the complimentary scan. For multi-card demos, enable **Development only · simulate Pro** in Profile; Free remains limited to one successful recognition.

Display currency can be changed from the blue currency badge in Collection or Currency in Profile. Both open the same USD/EUR selector and share one saved device preference. Source quotes retain their original USD or EUR currency; display conversion and portfolio aggregation use the disclosed fixed sample conversion of **1 USD = 0.92 EUR**, not a live exchange-rate feed. Switching currency does not replace a missing finish quote or silently select a different market source.

Real Privacy Policy, Terms of Service, and Support URLs can be configured in [`src/config/links.ts`](src/config/links.ts). They begin as `null`. The app explains missing configuration and only opens configured HTTPS destinations; it does not fabricate legal documents.

## Development checks

```bash
npm run typecheck
npm run lint
npm run test
npm run export:mobile
```

`test` runs domain/service tests with Node's test runner through `tsx`. `export:mobile` creates iOS and Android JavaScript/assets under ignored `dist/mobile`. These commands are the reusable validation workflow; actual execution results are reported separately from these instructions.

The browser smoke test exercises the React Native web build with Chromium; it complements native bundle exports. With a web development server running:

```bash
npm run web -- --localhost --port 8081
# In a second terminal:
npm run test:smoke
npm run test:scanner
npm run test:catalog
```

The cloud environment provides `/usr/bin/chromium`. On another machine, set `CHASE_BROWSER_EXECUTABLE` to a Chromium executable and optionally `CHASE_SMOKE_URL` to the development server address. No browser download is performed by the test.

For the restricted cloud network and writable caches, use:

```bash
EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 DOTSLASH_CACHE=/workspace/.cache/dotslash npm_config_cache=/workspace/.cache/npm npm run web -- --localhost --port 8081
```

Offline Expo mode uses bundled SDK metadata; npm still downloads dependencies with normal TLS and lockfile integrity checks. It does not validate remote Expo/React Native Directory compatibility.

Before release, test navigation, text scaling, safe areas, persistence across app restarts, and every Free/Pro boundary on real iOS and Android devices. Remote Expo compatibility diagnostics also require access to Expo's API and React Native Directory; a blocked remote check does not confirm compatibility.

## Project structure and decisions

Routes live in `src/app`; screen implementations live in `src/features`. Shared UI and tokens are in `src/components` and `src/theme`. Domain types, service contracts, the replaceable TCGdex adapter and retained scanner mocks are separated from the UI.

See [DESIGN.md](DESIGN.md) for visual and accessibility rules, [ARCHITECTURE.md](ARCHITECTURE.md) for service and state boundaries, and [AGENTS.md](AGENTS.md) for future development instructions.

The foundation was initialized from the official `create-expo-app@5.0.0` `default@57.0.30` template. UI UX Pro Max was installed with its official installer:

```bash
npx ui-ux-pro-max-cli@2.15.0 init --ai codex
```

Its guidance is available at `.agents/skills/ui-ux-pro-max/SKILL.md`; its local search scripts require Python 3.x (Python 3.12 is available in this environment). This developer tool is separate from application runtime dependencies.
