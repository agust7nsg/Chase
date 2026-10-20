This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Chase permanent product rules

- Maintain a focused iOS/Android React Native application. Do not substitute a web-only app or Capacitor. The current project uses Expo SDK 57; read `package.json` each session rather than assuming that remains current.
- Each cloud task already runs in an isolated environment. Use the existing checkout; do not propose or create a Git worktree unless the user explicitly requests one. Preserve user changes. During environment-only onboarding, keep tracked application files, dependencies, tests, and lockfiles unchanged unless the user also authorizes a coding task.
- Use `npm ci` for reproducible installation and the existing `package-lock.json`. Keep package signatures, artifact checksums, and TLS verification enabled. Add only small, necessary Expo-compatible dependencies.
- Read `README.md`, `DESIGN.md`, and `ARCHITECTURE.md` before extending the product. Consult `.agents/skills/ui-ux-pro-max/SKILL.md` before making UI design changes. The skill was installed through `npx ui-ux-pro-max-cli@2.15.0 init --ai codex`; Python 3.x is needed for its local search scripts.
- Preserve the light, white/off-white and blue visual identity, centralized tokens, shared components, consistent Ionicons, safe areas, native navigation, and text scaling. Avoid decorative gradients, glass effects, neon, oversized panels, unnecessary animations, and generic analytics dashboards.
- User design preference: retain expressive Pokémon card/character artwork and intentional color contrast, especially Dragonite and Mew. Keep onboarding visual-led: one short title, at most one short supporting line, and a feature illustration. Do not repeat explanatory paragraphs, numbered tutorials or motivational copy. Use concise Demo / Sample USD labels once and put detailed methodology or image limitations behind accessible information controls. Preserve wallet functionality when changing visual presentation.
- Keep the three bottom tabs Home, Collection, and Profile. Use `src/app` consistently for routes; keep screens and logic in feature directories. Home has an explicit scanner entry point rather than a permanently active camera.
- Guest use must remain possible. Accounts must never be required to complete onboarding. Skipping the complimentary scan preserves eligibility. Completing onboarding is saved locally.
- The demo scanner retains deterministic recognition and optional camera preview. The separate development CardSight path captures photos after explicit opt-in, performs bounded local heuristic detection/stability checks, and uses a local server proxy. Its server-only vendor transport uses the supplied official OpenAPI contract (POST /v1/identify/card, binary JPEG, X-API-Key). Schema fixtures and local proxy tests do not prove authenticated CardSight accuracy or physical-device behavior; check CARDSIGHT_SCANNING.md for the latest validation status. Preserve confidence tiers, explicit language/printing review, and conservative finish handling. See CARDSIGHT_SCANNING.md. Request camera permission only in the scanner after the user opts into preview or identification uploads. Keep results as brief overlays and accumulate them automatically in the separately persisted ScanSession. Only explicit Organize selected/all saves change Collection. Preserve pending rows through navigation, errors, paywalls and partial saves; keep durable collection receipts for replay safety. Label simulated recognition and sample artwork; do not claim live card detection.
- Record the Free trial only after a valid recognition result. Errors, opening the scanner, and canceled attempts do not consume it. Save a result only after the user confirms it; prevent accidental duplicate actions.
- The real scanner uses a full-screen preview with floating close/flashlight controls and a persistent Organize action. Torch defaults off and releases with the preview. Resolved scans show a brief catalog-artwork reveal; respect Reduced Motion and never tie recognition/saving to animation completion. Recoverable errors clear after about two seconds without Pause/Retry scan buttons; held failed presentations stay locked.
- Recoverable scan errors must permit a new physical card without repeated requests for a held failed card. Preserve presentation locks across Organize/backgrounding; native camera refs/readiness/busy state belong to each preview mount. Capture deadlines must release the UI and discard/clean late results. Keep sole known catalog finishes automatic when no conflicting parallel evidence exists; retain independent printing/language review. Unmatched provider identifications live only in optional `ScanSession.unresolved`, are unpriced and cannot save to Collection before explicit canonical linking. Never discard them on navigation or partial save. Retry their catalog lookup without uploading another image; preserve sanitized matching diagnostics and device-local user-confirmed ID links.
- Entitlements belong in the typed domain/service boundary. Free limits are **50 total card copies** and one complimentary successful recognition, not 50 unique entries. Catalog browsing, manual search and available ungraded prices remain Free. Pro simulation is guarded by `__DEV__` and explicitly labeled **Development only · simulate Pro**.
- Mock subscription state is not purchase verification. Do not initiate real purchases, restoration, or authentication during this prototype stage. Never claim that an account was deleted, a purchase succeeded, or data was synchronized unless an actual service completed the operation. Production paid recognition requires secure backend enforcement.
- Keep canonical TCGdex card identity separate from collectible finish identity. New keys use `tcgdex:<language>:<canonical-id>:<variant-key>`; legacy raw sample IDs are reserved and must not be silently remapped, overwritten or merged. Validate and persist optional real-card snapshots alongside Collection and ScanSession rows so owned/pending references survive catalog outages. Quantity edits validate positive whole numbers.
- Never substitute another printing/finish's price. Keep nullable provider quotes with source, native USD/EUR currency, exact variant and update timestamp; missing data says **Price unavailable**. Count unpriced ownership separately rather than inventing a value. Format visible prices, chart amounts and monetary accessibility labels with `useCurrency().formatMoney(amount, sourceCurrency)`. USD/EUR is one shared persisted display preference with the disclosed fixed sample FX rate; do not claim live FX or guaranteed resale prices. Do not generate sample history for real cards or mixed portfolios.
- Keep UI independent of external providers using service contracts for catalog, recognition, pricing, collections, and subscriptions. The real public English TCGdex adapter is implemented; preserve its cache, request deduplication, variant mapping and recoverable network states. Do not replace a failed live request with mock catalog results. Supabase, RevenueCat and SQLite remain separate future tasks. CardSight camera/proxy/client and verified-contract vendor transport are implemented; authenticated vendor and real-device validation remain pending as documented in CARDSIGHT_SCANNING.md. No API key is required for this public catalog; never embed private credentials in the app. See `TCGDEX_INTEGRATION.md` before extending provider behavior.
- Keep legal/support destinations in `src/config/links.ts`, initially `null`. Use real reviewed HTTPS URLs when supplied; do not fabricate documents or destinations. Explain unfinished account, restore, support, and legal workflows clearly.
- Destructive collection removal must require confirmation. A future authenticated account deletion flow must explain consequences and require explicit confirmation. Do not invent a signed-in state to demonstrate logout/deletion.
- Every visible interactive control must navigate, perform a real local action, or clearly explain its unfinished workflow. Do not add buttons with no effect or falsely operational placeholders.
- Do not add marketplaces, trading, social features, messaging, auctions, recommendations, price prediction, advanced charts, push notifications, achievements, multiple themes, or unrelated features. Collection/card value tracking with simple interactive historical line charts is explicitly authorized by the user. Keep mock history honestly labeled and do not present current-holdings revaluation as profit or actual ownership history.
- Run `npm run typecheck` and `npm run lint` before declaring implementation complete. Use `npm run test` for domain/service validation and `npm run export:mobile` for iOS/Android bundle validation when those areas change. Report what actually ran and its result. A JavaScript export is not a signed native build or device test.
- Linux cannot run an iOS simulator. An Android emulator/adb is not provided in this cloud environment. Report platform and network limitations plainly rather than marking unexecuted or blocked checks as passed.

## Expo documentation access

During initial setup, `docs.expo.dev` requests were blocked by the cloud proxy. Official repository sources were consulted as a fallback, including `https://raw.githubusercontent.com/expo/expo/main/docs/pages/router/advanced/tabs.mdx` and `https://raw.githubusercontent.com/expo/expo/main/docs/pages/router/reference/url-parameters.mdx`. These are moving upstream sources rather than version-pinned documentation. Prefer the matching versioned Expo docs when access is available and confirm APIs against the installed SDK. Do not disable verification to work around network failures.
