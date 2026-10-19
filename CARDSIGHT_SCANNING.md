# CardSight scanning integration status

The camera-to-session integration and local development proxy are implemented. The actual CardSight HTTP transport is **not connected** until its official OpenAPI contract can be retrieved and verified. This distinction is intentional: Chase's normalized proxy protocol is not a guessed representation of the vendor API.

The user supplied the official OpenAPI URL: https://api.cardsight.ai/documentation/json. In this execution environment requests to that host failed with proxy HTTP 403, including an escalated attempt. The screenshot verifies the public REST base `https://api.cardsight.ai/v1/` and `X-API-Key` authentication, but not a recognition path, upload fields or response schema. `CARDSIGHT_API_KEY` was absent in the running environment; a domain-scoped secret requirement has been saved in the environment draft. Its saved value and runtime activation still need to be supplied/applied by the user.

## What works

- Explicit real-camera mode alongside the retained demo mode. Home/Collection/Profile/onboarding design and routes remain intact.
- Expo Camera captures bounded images only while the scanner is focused and foregrounded. Local crop/thumbnail analysis estimates card presence and stability before a network request. This is a conservative heuristic, not a trained card detector or a claimed provider confidence score.
- Perceptual presentation tokens suppress stationary-card repeats. A sustained different card or genuine absence followed by the same printing rearms recognition. Capture failures and uncertain frames do not count as absence. Accepted locks survive opening Organize/paywalls and temporary backgrounding.
- One external request at a time; existing stability/cooldown/error/retry controller remains in use. Recognition keeps the camera view open. Results stage into ScanSession; only Organize's explicit saves affect Collection.
- Exact English printing resolution against TCGdex using set, collector number and name. Provider IDs never become TCGdex or legacy IDs. Low-confidence printing candidates need user selection before staging. An unresolved finish requires review in Organize, contributes no estimated value and cannot be saved until confirmed.
- Camera/manipulator cache files are deleted after processing, and images/base64 are not stored in session/collection records or application logs. Native captures already underway cannot be aborted; their late outputs are discarded on pause/exit and their temporary files are cleaned up.
- Local authenticated proxy boundary, body/JPEG limits, one in-flight request, minimum request interval, expiring pairing token, capped per-run use, digest-based idempotency and sanitized errors. Test transports are explicitly injected in automated tests only.

## Current provider gate

The default server has no provider transport. `/health` reports `ready: false`, and `/recognize` reports `provider_contract_pending` without contacting CardSight or consuming the per-run quota. A key alone does not enable it. There is no mock substitution for a failed real request.

To finish the provider adapter, verify the OpenAPI recognition path, request MIME/body, response identification/confidence/printing identifiers, no-match and rate-limit schemas. Implement a server-only transport that emits the Chase protocol defined in `src/services/cardsight/types.ts`; add fixtures drawn from that verified schema. Then validate a small authorized real recognition sample with the secret through the supported HTTPS route. Do not publish images or the key to inspect them.

## Local development setup

These commands prepare the development boundary. Until the provider gate above is completed, they do not enable actual CardSight identification.

Use Node24 and the existing extracted Chase folder. Install the updated dependencies once:

```cmd
npm ci
copy .env.scanner.example .env.scanner
```

Edit `.env.scanner` locally, putting the CardSight key only in `CARDSIGHT_API_KEY`. This ignored file is loaded only by the server command, not Expo:

```cmd
npm run scanner:proxy
```

The server binds to the local network on port8787 and prints its LAN address and a short-lived pairing token. It never prints the vendor key. Keep this prototype server on a trusted local network. It rejects production startup and is not a deployed production authentication/quota system.

In a separate terminal, create `.env.local` in Chase using `.env.example`. Set only these mobile development values:

```dotenv
EXPO_PUBLIC_SCANNER_URL=http://192.168.1.10:8787
EXPO_PUBLIC_SCANNER_TOKEN=the-local-pairing-token-from-the-server
```

Replace the example LAN address with the printed address of the computer hosting the proxy. `localhost` on a phone means the phone itself. The phone and computer must share a reachable network. The public pairing token is a temporary development control, not a vendor secret or production user credential. Production builds disable this development connection.

```cmd
npx expo start --clear
```

Both terminals must remain running. Changing folders or opening another terminal does not require another dependency installation. Start real scanning using the camera control in the scanner; the app requests permission after the user opts into uploading card photos. The demo remains available through its flask control.

The added `expo-image-manipulator` and `expo-file-system` versions match Expo57. Use a compatible Expo Go, or rebuild an existing native development build to include newly declared modules and updated permission text. JavaScript exports are not signed native builds or physical-device validation.

## Data flow and privacy work

The intended flow is: local camera → local crop/stability analysis → Chase's proxy → CardSight → normalized candidate metadata → TCGdex identity/finish → pending ScanSession → explicit Organize save → Collection.

This code does not persist photos in the proxy, session or collection. It does not establish CardSight's own retention, training-use or deletion policy; those must be checked in the provider's terms/privacy/DPA and reflected in Chase's reviewed Privacy Policy before release. Do not promise vendor-side deletion based on local cleanup.

Supabase authentication, durable server entitlements, production quotas and RevenueCat purchase verification remain separate work. Local Free/Pro logic still protects the prototype workflow, but a development pairing token does not enforce production paid access.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run test:scanner
npm run test:catalog
npm run test:smoke
npm run export:mobile
```

Browser tests intercept proxy/catalog responses. Synthetic camera fixtures and pixel tests demonstrate the capture/controller/session interaction without calling the vendor or spending credits. These do not prove CardSight accuracy. Real devices must still verify sleeves/glare, focus/orientation, memory/battery impact, permission denial, background/restore, actual same-card re-presentation and correct printing resolution.

To run the new live-mode browser fixtures, keep the normal demo Metro on8081 and start a separate development process with dummy pairing values (these are not vendor credentials):

```bash
EXPO_OFFLINE=1 EXPO_PUBLIC_SCANNER_URL=http://localhost:8787 EXPO_PUBLIC_SCANNER_TOKEN=chase-browser-fixture-pairing-only-1234 npm run web -- --localhost --port 8083
# In another terminal:
npm run test:live-scanner
```

The script generates a synthetic YUV camera file using Node alone, intercepts all scanner/vendor/catalog network boundaries, and cleans up its temporary file. It needs Chromium, not ffmpeg or Python image tools. Do not run these fixture pairing settings when testing real cards on a phone.

Executed in this change: TypeScript and lint passed; 129 unit tests passed; 14 scanner, 12 catalog, 22 general and 11 live-camera browser scenarios passed (59 total), with no runtime errors. Final Android/iOS JavaScript/Hermes exports passed. The Node entrypoint was started and stopped successfully: health correctly reported not ready and recognition returned503 while the provider gate was closed. Live-camera browser checks used a synthetic video source and intercepted normalized proxy responses; no CardSight calls or credits were used. Physical phone and actual vendor recognition have not been validated.
