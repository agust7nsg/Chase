# CardSight scanning integration

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
