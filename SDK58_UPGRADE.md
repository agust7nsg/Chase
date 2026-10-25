# Expo SDK 58 upgrade

Chase now targets stable Expo 58.0.19, React Native 0.88.0 and React/React DOM 19.3.0. Node 24.19/npm 11.9 remain the tested development tools; the SDK reference requires Node 22.13 or newer.

## Scope

The Expo installer aligned native modules with SDK 58. The dependency tree and lockfile were rebuilt cleanly after the initial mixed 57/58 tree had a Router optional-peer conflict. No `--force`, `--legacy-peer-deps`, disabled TLS/integrity checks or dependency-validation exclusions were used. `npm ci` must reproduce the committed tree.

Critical installed versions: camera 58.0.12, image-manipulator 58.0.15, file-system 58.0.11, image 58.0.17, router 58.0.26, secure-store 58.0.2, crypto 58.0.7, linking 58.0.14, Reanimated 4.7.1 and Worklets 0.13.0.

Application adaptations cover React Native's updated type contracts: ScrollView instance refs, web keyboard events, icon color styles and absent FlatList empty/footer components. Chart and carousel keyboard controls remain functional.

The full regression suite also exposed a shared-image-renderer defect: known bundled artwork can be a numeric native resource or a local web URI object/string. Those trusted bundle sources now go directly to Expo Image instead of through the remote catalog's HTTPS validator. Remote artwork keeps its exact-printing encoding fallbacks and HTTPS validation. Browser tests wait for the destination screen before typing, clicking reused card labels or reloading; this avoids interacting with a retained outgoing route during SDK 58 navigation transitions.

## Scanner and APIs

The scanner's recognition controller, sampling rate, deadlines, deduplication, image cropping, silent capture and temporary session logic remain intact. Organize keeps quantity/variant review, deferred printing choices, artwork and replay-safe explicit collection saves. Preserve the native transition/layout handshake; SDK 58's camera still exposes the Android mechanisms that made it necessary. See SCANNER_CAMERA_RENDERING.md for the source audit.

Supabase JS remains 2.118.0, AsyncStorage 2.2.0 and the URL polyfill 4.0.0. No CardSight, TCGdex or Supabase endpoint, credential, API schema, server deployment or SQL migration changes are required. All local collection, scan-session, currency, cache and chunked-auth storage keys are unchanged; no data is intentionally cleared or migrated. Apple/Google account controls remain placeholders.

SecureStore and Crypto preserve the interfaces Chase uses. SDK 58 Linking can produce an `exps://` callback for HTTPS development servers; Supabase's redirect allowlist must match the actual generated confirmation/recovery URL. Guest use remains available.

## Validation

Completed checks on the final SDK 58 tree:

| Check | Result |
| --- | --- |
| Clean `npm ci` | Passed using the new lockfile |
| `expo install --check` | Dependencies up to date |
| `npm ls --all` | Passed, no invalid dependency tree |
| TypeScript / ESLint | Passed, no errors or warnings |
| Unit/domain/service tests | 270 passed |
| Live scanner browser suite | 37 passed |
| General UI / demo session / catalog / auth browser suites | 22 / 14 / 12 / 6 passed |
| Focused scanner navigation repeat | 7 passed, including twelve Organize returns |
| Native config introspection | Passed, SDK 58, unchanged scheme/package, camera permission retained, microphone absent |
| Android + iOS JavaScript/Hermes exports | Passed with hosted scanning selected |
| Expo Doctor | 18/20 passed; two external-service checks could not complete |

The five full browser suites total 91 scenarios; the additional focused navigation run repeats shared cases and is not added to that total. They exercised more than 2.2-second captures, twenty actual-art presentations, controlled failures, repeated scanner/Organize transitions, deferred printing review, exact variant prices, cold offline snapshots, guest/Free/Pro testing, signup/sign-in/logout/recovery, chart keyboard controls and the onboarding carousel. No JavaScript runtime errors were reported. Browser fixtures exercised service contracts without spending CardSight credits or creating live accounts; they do not prove vendor accuracy, native camera pixels or native SecureStore behavior.

Expo Doctor's remote config-schema check failed to resolve `exp.host`; React Native Directory's metadata request returned an unexpected server response. These are recorded as incomplete external checks, not passed or suppressed. Local native config introspection and the installed SDK's dependency compatibility checks passed. Re-run `npx expo-doctor` on a machine with access to those services.

## Test on the phone

1. Use Expo Go that supports SDK 58. Existing custom APK/development builds need rebuilding with the new SDK. Preserve `.env.local`; keep `EXPO_PUBLIC_SCANNER_BACKEND=supabase` for hosted scanning. Do not uninstall Chase/Expo Go or clear storage to update dependencies: collections and pending scans are local.
2. In the updated project run `npm ci`, then `npx expo start --clear`. For a remote tester use `npx expo start --tunnel --clear`. Reuse the existing public Supabase settings; the CardSight secret stays on the server.
3. Check existing Collection and pending Organize cards, currency preference, guest/signed-in identity and Pro simulation before scanning. Account email confirmation/recovery should return to the intended callback.
4. On the Samsung S24 FE, scan nine distinct cards continuously, remove/re-present a second copy, and verify counts, artwork reveals, green exact-variant prices, absent printing modal and silent capture. Confirm unknown finishes/printings in Organize.
5. Repeat scanner → Organize → scanner at least twelve times. Check full preview coverage and the next recognition after each return; repeat after rotation and backgrounding. Torch must work and reset appropriately.
6. Save selected/all cards, check quantities and no duplicates on retry, then restart the app and verify persistence. Separately check Free's one-recognition limit with Pro simulation off.

Physical-device checks remain necessary even when browser tests and JavaScript exports pass. This Linux environment has no Android emulator/ADB or iOS simulator.

## Official references

- https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/
- https://docs.expo.dev/versions/v58.0.0/
- https://docs.expo.dev/versions/v58.0.0/sdk/camera/
- https://docs.expo.dev/versions/v58.0.0/sdk/imagemanipulator/

The upgrade guide and versioned SDK/camera/image-manipulator docs were accessible. The SDK 58 changelog page returned HTTP 403 from this environment; compatibility was additionally checked against installed package manifests, public types and native source rather than assuming unchanged behavior.
