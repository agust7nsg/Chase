# CardSight scanning integration

This document covers the original local development proxy. An authenticated Supabase-hosted beta alternative is now implemented; see [HOSTED_SCANNER.md](HOSTED_SCANNER.md) for deployment, secrets and server-side access grants. It is not enabled by a repository push alone.

The local development server now uses the real CardSight HTTP transport. The adapter was implemented from the official OpenAPI JSON supplied by the user on October 19, 2026 (OpenAPI 3.1.0, API version 1.0.0). It posts direct binary JPEGs to `https://api.cardsight.ai/v1/identify/card` with server-only `X-API-Key` authentication. There are no automatic billable retries, catalog-enrichment calls or commercial dependencies added by this change.

Schema source: https://api.cardsight.ai/documentation/json. SHA-256 of the supplied file: `a14b6efa11e1619c6771d73a4fc6bde617125b866866153e985c191a210d4a58`. Automated vendor payloads are synthetic fixtures following that schema, not recorded successful CardSight responses.

## What works

- Explicit real-camera mode alongside the retained deterministic demo. Existing screens, navigation, entitlements and separately persisted ScanSession remain intact.
- Focused/foreground Expo Camera captures, crop/thumbnail analysis, local presence/stability heuristics, one recognition request at a time and presentation locks. A stationary card is not submitted on every frame; removing and presenting another copy rearms the scanner. Capture failures are not treated as card removal.
- The server sends JPEG bytes to the fixed HTTPS CardSight endpoint. Requests have abort/timeout handling, bounded response reads, no redirects, sanitized errors, a short-lived local pairing token, a minimum request interval, a per-run cap and digest-based request receipts. Replaying the same request ID and image does not call the provider twice.
- CardSight `detections` represent physical cards, while `card.suggestions` represent alternative identifications. Multiple physical cards produce a recoverable one-card-at-a-time error. Set-only/slab-only matches never invent a printing.
- Exact English TCGdex resolution by name, collector number and the vendor's set/release names. CardSight UUIDs never become TCGdex IDs. A collector denominator must match if supplied; `numberedTo` is a print run, not a denominator. Unknown expansion aliases are not guessed.
- High/Medium/Low tiers remain tiers; no fabricated exact confidence percentage. Medium/Low results require printing selection. Explicit non-English cards are not silently translated; absent/conflicting language evidence requires deliberate English printing confirmation.
- Finish evidence must be one supported High-confidence parallel (Normal, Holo/Holofoil or Reverse Holo/Reverse Holofoil). Missing, unsupported, numbered, low-confidence or multiple parallel suggestions leave the finish unresolved. Ranking does not override ambiguity. The pending row remains unpriced and cannot save until its variant is explicitly confirmed in Organize. No alternative-finish price is borrowed.
- Recognition keeps the live camera screen open and stages into ScanSession. Only explicit Organize saves affect Collection. Pending rows survive navigation, paywalls and local restoration; durable save receipts preserve retry safety.
- Local camera/manipulator temporary files are removed; photos/base64 are not persisted in ScanSession/Collection or application logs. Native captures already underway cannot be aborted; late outputs are discarded on pause/exit and cleaned up.

## Local setup on Windows and a phone

Use Node24 and the updated extracted Chase folder. This requires a server running on the computer, as well as Expo. A cloud environment secret does not automatically configure the downloaded Windows project.

In CMD, inside Chase, install dependencies once if this is a new download, then create the server-only settings file. Do not overwrite an existing configured file:

```cmd
npm ci
if not exist .env.scanner copy .env.scanner.example .env.scanner
notepad .env.scanner
```

Put the CardSight key only in `CARDSIGHT_API_KEY` in that ignored file. Leave `SCANNER_DEV_TOKEN` blank to generate a short-lived local token, or use a local URL-safe token with 24–256 characters. Then:

```cmd
npm run scanner:proxy
```

Keep this terminal open. Copy the printed **Phone server URL** and **Local pairing token**. The CardSight key is never printed. A browser on the computer can check `/health` on port8787: `ready:true` means the adapter/key are configured and the local token has not expired. **Health does not verify the key with CardSight or prove recognition accuracy.** Missing credentials return `ready:false`. The adapter is now wired into the runner; there is no pending-contract gate in normal startup.

In a second CMD window, enter the same Chase folder and create/edit `.env.local`:

```cmd
if not exist .env.local copy .env.example .env.local
notepad .env.local
```

Set these values using the address and local token printed by the server, never the vendor key:

```dotenv
EXPO_PUBLIC_SCANNER_URL=http://192.168.1.10:8787
EXPO_PUBLIC_SCANNER_TOKEN=the-local-pairing-token-from-the-server
```

Then start Expo from that second terminal:

```cmd
npx expo start --clear
```

Keep both terminals open. The phone and computer must share a reachable trusted Wi-Fi network. `localhost` on the phone means the phone itself. Windows Firewall must permit this Node server on the private network. An Expo tunnel alone does not tunnel the separate scanner proxy. After restarting the proxy, copy its newly generated token and restart Expo to load changed public settings. There is no need to reinstall npm dependencies each time.

Open Home → scanner and consent to photo upload. With valid development settings, live mode is selected; the flask control still opens the demo. Use **Development only · simulate Pro** in Profile for multi-card testing; Free retains its single successful recognition. Confirm the English printing if asked; open Organize to confirm an unresolved finish and explicitly save cards. Invalid credentials, no match, multiple cards, unsupported printing, provider rate limits and network errors remain recoverable without consuming a successful Free recognition.

Expo Camera/file-system/manipulator versions match SDK57. Use compatible Expo Go or rebuild a native development build if its native modules/permission text predate those dependencies. No native dependency was added by the transport change.

## Cloud setup and remaining provider validation

During this implementation, the actual `CARDSIGHT_API_KEY` environment variable was absent and the saved requirement reported no bound value. Earlier attempts to reach the CardSight documentation were blocked with proxy HTTP403; the supplied JSON resolved the documentation blocker. No authenticated CardSight recognition or free provider-auth probe could be run without the active key. Securely bind `CARDSIGHT_API_KEY` to `api.cardsight.ai` in environment settings and apply/publish the configuration to enable testing from this cloud runtime. Never paste its value into chat, Expo public settings or GitHub. A supported proxy binding may be a placeholder resolved only on its allowed HTTPS destination.

A real phone needs a reachable computer-hosted server. This development server binds to the LAN, rejects production startup and is not a deployed production authentication/entitlement service. Supabase authentication, durable server quotas and RevenueCat verification remain separate work.

## Privacy and data flow

Camera → local crop/stability analysis → Chase proxy → CardSight → normalized candidate metadata → exact TCGdex printing/finish → pending ScanSession → explicit Organize save → Collection.

Local photo cleanup does not establish CardSight's retention, training-use or deletion policy. Check provider terms/privacy/DPA and reflect the confirmed practices in Chase's reviewed Privacy Policy before release. Do not promise vendor-side deletion based on local cleanup.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run test:scanner
npm run test:live-scanner
EXPO_OFFLINE=1 npm run export:mobile -- --max-workers 4
```

Unit tests exercise the actual server adapter against schema-based fixtures, authenticated proxy/client integration, TCGdex identity, uncertainty/finish safeguards, Organize staging and replay-safe Collection persistence. Tests never contact CardSight or spend credits. Browser tests use intercepted proxy/catalog responses and a synthetic camera. A passing fixture does not establish CardSight accuracy or physical-device behavior.

For the separate live-mode browser server:

```bash
EXPO_OFFLINE=1 EXPO_PUBLIC_SCANNER_URL=http://localhost:8787 EXPO_PUBLIC_SCANNER_TOKEN=chase-browser-fixture-pairing-only-1234 npm run web -- --localhost --port 8083
# In another terminal:
npm run test:live-scanner
```

This generates a synthetic YUV source using Node (no ffmpeg/Python dependency) and uses Chromium. Do not use fixture settings for a real phone.

Validation in this change: TypeScript and lint passed; 143 unit tests passed; 14 continuous-scanner and 13 live-camera browser scenarios passed without runtime errors. Android/iOS JavaScript/Hermes exports passed. The actual Node entrypoint started with an explicitly fake in-memory key and reported configured health; it was stopped without calling CardSight. These checks used no vendor quota. Optional standalone React Native DevTools could not launch its bundled Chromium under this Linux sandbox; Metro and browser tests still ran successfully. No authenticated vendor identification or physical-device test was performed.

Real devices must still verify CardSight acceptance of camera JPEGs, actual release/set metadata naming, English/language confirmation, focus/orientation/sleeves/glare, heuristics and deduplication, background/restore, memory/battery use and correct variant pricing. Japanese catalog resolution and graded pricing are not implemented. Existing saved Collection/ScanSession identities are not migrated or overwritten.

## Continuous-scanning fixes after Android feedback

The user's Android tests confirmed CardSight could identify cards, but exposed a session stall, a malformed preview after returning from Organize, unnecessary single-finish review and unresolved anniversary printings. The changes below address those paths; they are not a claim of completed Android regression testing.

- Recoverable recognition errors lock only that physical presentation. A genuinely different card or confirmed removal rearms scanning; holding the failed card does not repeat requests. Authentication/account-limit errors still require deliberate recovery. Removing a photographed card does not cancel its submitted result; leaving/backgrounding the scanner still cancels work.
- The local tracker handles sustained textured surroundings and sustained artwork changes between similarly coloured cards. The controller trusts its multi-frame stability/absence evidence without adding a second delay. Conservative thresholds still need tuning against real glare, sleeves and backgrounds.
- Native preview instances have explicit measured dimensions and separate readiness/capture gates. A pending capture from an old view cannot occupy a new camera after navigation. Picture resolution is selected before captures begin, with a full release before reconfiguration; there is no asynchronous picture-size change during scanning. Capture/manipulation has a deadline and automatic preview recovery with a bounded backoff (2–8 seconds between reopen attempts). Only the preview is recreated; accepted presentation locks and pending scans remain.
- A unique, known catalog finish is inferred when the provider has supplied no conflicting parallel evidence. Multiple finishes, unspecified catalog flags and conflicting/unsupported parallels still withhold pricing pending review. English printing/language confirmation remains independent of finish inference. Previously marked review rows retain their uncertainty and can be explicitly confirmed; saved ownership is never reinterpreted.
- A catalog miss refreshes the expansion index and relevant set data at most once per minute. Empty cached searches expire after a minute. A bounded name/collector-number lookup accommodates different provider set labels and leading zeroes, with explicit printing confirmation. No fuzzy name-only automatic match, alternate-denominator substitution or cross-language price borrowing is introduced.
- Explicit matching records a bounded device-local CardSight→TCGdex printing link. It applies only to future lookups of that provider card/set identity, does not migrate saved cards, and never eliminates independent language/finish uncertainty. Link-cache failures do not invalidate a recognized printing.

### Pending catalog matches

`ScanSession.unresolved` is an optional extension of the existing v1 local format. Legacy sessions remain readable. Unmatched entries keep only whitelisted provider candidates, matching-stage diagnostics, timestamp, stable local ID and quantity. They have no collectible ID, quote or portfolio value. No photo, arbitrary vendor response or credential is persisted.

A catalog failure can therefore add a **pending catalog match** to Organize while the scanner continues. A held card still produces one entry; deliberate additional presentations merge matching candidate/finish groups. Pending quantities count in Organize and remain unpriced. They cannot be selected/saved as Collection ownership.

- **Retry catalog match** uses the retained metadata, never a second CardSight/image request.
- **Match printing** opens an English catalog picker with a removable scanned-number filter. The user checks set/number, selects an actual finish when alternatives exist and explicitly links the printing into ordinary staging. Linking alone does not save Collection ownership.
- **Scan details** exposes copyable, sanitized identification metadata and the failed resolution stage locally. This is the evidence needed for a provider naming/numbering discrepancy; it does not include API keys or images.
- Quantity edits, deletion, reload and confirmed session discard cover both staged cards and unresolved entries. Partial saves keep unresolved entries. Existing Collection save receipts still prevent replayed copies.
- An unresolved catalog/network error does not consume the complimentary successful recognition. Resolving to a valid canonical printing consumes it once; another Free resolution is blocked after that marker. Collection copy limits remain unchanged.

### Android regression checklist

Use the updated app and proxy in two CMD windows as above; no new dependency or native module is required. Keep the same saved API-key/pairing setup. For a multi-card session, use the existing development Pro simulation.

1. Scan at least 20 presentations, including normal cards, illustration rares and similarly coloured artwork. Hold each successful card briefly and confirm the counter increases once. Remove/re-present an additional copy and confirm another copy is recorded.
2. Try an unreadable/unsupported card, then present a different valid card without pressing Retry. The session should continue. A provider credential/quota error should remain explicit.
3. Open/close Organize several times, inspect Details, background/foreground and return. The preview should fill the guide area, remain focused and continue capturing. Pending counts must survive; a held card must not be duplicated merely by returning.
4. Check Chespin 087/086 with a genuinely single-finish catalog response: no Holo dropdown/confirmation is required on a new scan. Check Froakie with multiple finishes: finish review remains available and quotes follow the selected finish.
5. Scan the reported anniversary Greninja 021/120. If it links automatically or offers verified catalog choices, check the exact printing. If it stays unmatched, open **Scan details** and retain the provider set/release IDs, name, collector number, language and resolution stage. This cloud instance cannot verify its actual CardSight payload or current TCGdex record; do not replace it with another Greninja printing just to show a price.
6. Interrupt catalog connectivity, scan a recognizable card, then restore connectivity and retry its match in Organize. Confirm one CardSight request, pending metadata survival and no Collection change until explicit save.
7. Save selected/all, retry saving, restart the app and check quantities, Free access and copy limits. Canonical IDs and previous ownership must remain intact.

Linux browser fixtures validate controlled camera pixels, navigation, pending matching and persistence. They cannot reproduce an Android CameraX surface or establish recognition accuracy, camera orientation, memory use or thermal performance. Physical Android retesting remains required for the reported preview distortion.

Validation for this update: TypeScript/lint and 172 unit tests passed. Browser suites passed 18 live-camera, 14 scanner, 12 catalog and 22 general scenarios (66 total), including 20 accumulated synthetic captures, one intervening failed presentation, repeated Organize returns, automatic unique-finish selection, catalog downtime, metadata-only retry, explicit manual matching and camera reopen. Pending/matching layouts were checked at 320/390px. Android/iOS JavaScript/Hermes exports passed. Camera APIs were checked against the [Expo 57 camera reference](https://docs.expo.dev/versions/v57.0.0/sdk/camera/) and installed native sources. No CardSight credits were used. The cloud TCGdex request still returned HTTP 403 after an escalated retry, so current provider naming/numbering for the reported Greninja is not verified here; use its locally retained Scan details during Android retesting.


## Camera-first scanner UI

The CardSight scanner preview now fills the entire screen, including behind the status bar. Close, a centered flashlight toggle and the demo control float over the preview inside safe touch areas. Organize remains a persistent blue action above the bottom system inset. There is no separate blue header, Pause scanning button or recognition Retry button.

The flashlight starts off and uses Expo Camera SDK57's `enableTorch` on the back camera. It switches off when the preview is released, the app backgrounds, Organize opens or the scanner closes. The browser preview explains that native flashlight testing requires the Android/iOS app instead of displaying a false on state. Local presentation tracking allows exposure to settle after lighting changes without clearing the accepted-card lock.

A resolved scan slides its catalog artwork up from below the camera, with a compact name/price caption, then clears automatically. Reduced Motion shows the same feedback without travel. Recognition, staging and saving do not depend on animation completion. The previous result popup remains only in the separate deterministic demo; it is replaced in the real scanner. Unmatched provider rows still show a short Organize matching notice, with no invented artwork or price.

Recoverable identification errors show their explanation for about two seconds and automatically return to searching. The same uninterrupted failed presentation remains locked; remove/re-present it deliberately or show another card. Authentication, expired tokens and account quotas retain their specific blocker and do not trigger repeated billable requests; fix the server/configuration and reopen the scanner. Camera captures recover automatically with backoff while preserving the scan session. Preview mount interruptions also reopen automatically with backoff; permission denial keeps the explicit camera enable/settings action.

Android/iOS device checks still required: actual torch illumination and off-on-exit, exposure/glare deduplication, native edge-to-edge preview and orientation, 20 consecutive cards, repeated Organize returns, and background/foreground recovery. Synthetic browser tests cannot validate native flashlight hardware or the previously reported Android distortion.


Validation of the camera-first UI: TypeScript/lint and 179 unit tests passed, including transient-error deadlines, lighting changes and late pre-toggle photo rejection. Browser checks passed 20 live-camera scenarios and 14 demo/session scenarios, with no runtime errors or real CardSight calls. The live stress test saved 20 copies after 21 intercepted requests (one intentional failure), with repeated Organize returns and forced capture/preview mount interruption recovery. Full-screen controls/artwork were checked at 320×568, 390×844 and 844×390, including Reduced Motion. Android/iOS JavaScript/Hermes exports passed. Native torch illumination, VoiceOver and Android preview behavior still require a phone test; browser fixtures and exports do not prove them.


## p15 continuity follow-up

The physical-device report still stalled at **Present the next card**. The previous fixture results did not establish that this was repaired. See [the reproduced causes and updated validation limits](SCANNER_CONTINUITY_DIAGNOSIS.md). The new local pipeline observes while recognition is running, separates cheap thumbnails from selected upload encoding, distinguishes slow capture from idle gaps, and compares focused artwork for similar commons. Automatic catalog work has a five-second budget and optional caches cannot hold the scan mutex indefinitely. Tap the status/info control in development mode for a selectable, volatile scalar diagnostic report; no images or credentials are logged.

Final validation on October 21, 2026: TypeScript, lint, 219 unit tests, all 26 live-camera browser scenarios, 14 demo/session scenarios and 12 catalog scenarios passed (52 browser scenarios total). Android/iOS JavaScript/Hermes exports passed. The final controlled camera sequence saved 20 copies after 21 intercepted requests, including one intentional failure and repeated Organize returns. No vendor credits were spent. Native capture performance and CardSight accuracy still require phone testing; the regression fixtures do not establish those results. See the diagnosis report for details and the phone checklist.

Hosted-access update: the Supabase workflow now prepares scanner SQL and anonymous Auth automatically. Guests reuse a persisted technical session, registered accounts receive Free without manual activation, and guest signup links the same UUID. Hosted Free has a server-enforced positive-recognition allowance plus separate attempt limits; unresolved candidates can be rematched in Organize without re-uploading. See HOSTED_SCANNER.md for the current deployment flow and pending RevenueCat verification.

For the Samsung S24 FE / Expo Go partially rendered preview after returning from Organize, see [SCANNER_CAMERA_RENDERING.md](SCANNER_CAMERA_RENDERING.md). The app now waits for navigation/layout restoration rather than treating camera-open as a rendered preview. This is an app-bundle correction; it changes no hosted server configuration.
