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

- Three introductory onboarding screens lead to an optional complimentary sample scan and a closeable Chase Pro paywall. Skipping the sample scan preserves eligibility; onboarding completion is saved locally.
- Home provides a dedicated scanner entry point, manual search, and a compact collection overview.
- The scanner simulates recognition and never requests camera access. A successful result consumes the Free trial; opening the scanner or a failed recognition does not. Saving a result requires an explicit action.
- Collection provides a wallet summary, inventory search/sort, card details, quantity changes, and confirmed removal. Value includes every saved copy.
- Profile supports guest navigation, account and settings information, subscription information, and clearly labeled unfinished workflows.
- In development builds, Profile offers **Preview onboarding** to revisit the introduction without resetting collection data or trial use, and **Development only · simulate Pro**. It changes prototype access locally and never makes a purchase.

Free access includes manual search, sample prices, one collection, up to **50 total card copies**, and one complimentary successful sample recognition. The centralized mock entitlement model represents unlimited Pro scans and saved copies, plus future multiple collections, graded prices, and CSV export. Those future features are not implemented.

## What is simulated

The catalog, recognition service, market prices, and subscription access are mocks. No camera identification, authentication, purchase, restoration, account deletion, or cloud synchronization is connected. No API key is needed. All sample prices are USD estimates, not guaranteed resale prices.

The onboarding showcases actual Charizard Base Set Holo and English Ash-Greninja EX XY133 card images, with clearly illustrative prices; see [onboarding image sources](assets/onboarding/SOURCES.md). The mock catalog and recognition result still use Pokémon character illustrations distributed through PokeAPI, labeled **Sample artwork**; see [catalog illustration sources](assets/cards/SOURCES.md). No live card pricing or recognition service is connected.

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
