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
- Home provides a dedicated scanner entry point, manual search, recent cards and set shortcuts. On each cold app launch, its artwork is drawn randomly from Dragonite V 192/203, Greninja ex 214/167 (Twilight Masquerade) and Umbreon VMAX 215/203. The locally saved cycle shows all three before repeating and prevents consecutive repeats across cycles. Tab navigation and returning from other screens preserve the session artwork. This does not save cards or spend scans. The removed scan-status caption retains its original blank space so the panel keeps its size.
- The scanner simulates recognition and never requests camera access. A successful result consumes the Free trial; opening the scanner or a failed recognition does not. Saving a result requires an explicit action.
- Collection provides an interactive value timeline (7D / 1M / 3M / 1Y), exact date inspection, position movement sorting and allocation by printing/set. Current value includes every saved copy. Empty collections offer search and an explicitly separate sample-wallet preview. Inventory search/sort, quantity changes and confirmed removal remain available.
- Profile supports guest navigation, account and settings information, subscription information, and clearly labeled unfinished workflows.
- In development builds, Profile offers **Preview onboarding** to revisit the introduction without resetting collection data or trial use, and **Development only · simulate Pro**. It changes prototype access locally and never makes a purchase.

Free access includes manual search, sample prices, one collection, up to **50 total card copies**, and one complimentary successful sample recognition. The centralized mock entitlement model represents unlimited Pro scans and saved copies, plus future multiple collections, graded prices, and CSV export. Those future features are not implemented.

## What is simulated

The catalog, recognition service, market prices, and subscription access are mocks. No camera identification, authentication, purchase, restoration, account deletion, or cloud synchronization is connected. No API key is needed. All sample prices are USD estimates, not guaranteed resale prices.

The interface features **15 real Pokémon TCG printing images across 16 catalog entries**, from Base Set Charizard to Umbreon VMAX, Rayquaza VMAX, Giratina V, Lugia V, Gengar VMAX, Dragonite V, Magikarp, Ash-Greninja EX and Twilight Masquerade Greninja ex. Each screen has a distinct composition: card-led price examples, a rotating scan illustration, an open collection timeline, a searchable inventory and a Mew Profile illustration. A consistent wordmark, type, vibrant blue and cool/lilac art surfaces connect them; the previous repeated landscapes and card fans are no longer used by screens. Images are bundled for offline use; no live card pricing or recognition service is connected. See [card image sources and printing notes](assets/chases/SOURCES.md), including the first-edition Charizard reference, the shared Pikachu variant image, and corrected legacy Eevee/Mew printing metadata. Profile also uses the official Mew character illustration distributed through PokeAPI; see [character sources](assets/cards/SOURCES.md). Existing saved IDs and quantities are preserved.

Price history is generated locally by `src/services/priceHistory.ts` and ends at the sample catalog date, **October 1, 2026**. It is not downloaded, current market data or a forecast. The wallet revalues **today’s quantities** at those simulated earlier prices: adding or removing copies recalculates the whole curve. Changes indicate sample price movement, **not profit or actual past account balances**. No cost basis, trades or ownership history are inferred from `addedAt`. The in-app calculation note explains the method. The sample-wallet preview never seeds ownership or spends a scan.

Onboarding, trial use, collection copies, and the prototype plan are persisted with AsyncStorage on the current device. Production builds restore the plan as Free; development Pro simulation never grants a production subscription. Existing copies are preserved when returning to Free, including collections over the limit; reducing quantities remains possible. Removing app data clears this local prototype state. AsyncStorage is not secure storage and must not hold private credentials.

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
```

The cloud environment provides `/usr/bin/chromium`. On another machine, set `CHASE_BROWSER_EXECUTABLE` to a Chromium executable and optionally `CHASE_SMOKE_URL` to the development server address. No browser download is performed by the test.

For the restricted cloud network and writable caches, use:

```bash
EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 DOTSLASH_CACHE=/workspace/.cache/dotslash npm_config_cache=/workspace/.cache/npm npm run web -- --localhost --port 8081
```

Offline Expo mode uses bundled SDK metadata; npm still downloads dependencies with normal TLS and lockfile integrity checks. It does not validate remote Expo/React Native Directory compatibility.

Before release, test navigation, text scaling, safe areas, persistence across app restarts, and every Free/Pro boundary on real iOS and Android devices. Remote Expo compatibility diagnostics also require access to Expo's API and React Native Directory; a blocked remote check does not confirm compatibility.

## Project structure and decisions

Routes live in `src/app`; screen implementations live in `src/features`. Shared UI and tokens are in `src/components` and `src/theme`. Domain types, service contracts, and replaceable mocks are separated from the UI.

See [DESIGN.md](DESIGN.md) for visual and accessibility rules, [ARCHITECTURE.md](ARCHITECTURE.md) for service and state boundaries, and [AGENTS.md](AGENTS.md) for future development instructions.

The foundation was initialized from the official `create-expo-app@5.0.0` `default@57.0.30` template. UI UX Pro Max was installed with its official installer:

```bash
npx ui-ux-pro-max-cli@2.15.0 init --ai codex
```

Its guidance is available at `.agents/skills/ui-ux-pro-max/SKILL.md`; its local search scripts require Python 3.x (Python 3.12 is available in this environment). This developer tool is separate from application runtime dependencies.
