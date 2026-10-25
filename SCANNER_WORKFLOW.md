# Continuous scanner — Phase A and catalog integration

## What the user does

Open **Scan a Card** on Home. Enable the camera preview if desired; denying permission still leaves a usable demo. On compatible runtimes a previously authorized preview opens automatically. Tap **Start demo** to present Charizard, Umbreon VMAX, Twilight Masquerade Greninja ex and both catalog Pikachu variants in sequence. The preview stays open and each result briefly appears over it. **Present next demo card**, **Remove card** and **Present same card** allow deliberate tests without an automatic sequence.

Free permits one successful recognition. For a multi-card test use the existing Profile **Development only · simulate Pro** switch. No purchase is made. The scanner can still open when Free is exhausted so pending cards remain accessible. Exploring Pro uses a pushed paywall; dismissing it returns to the originating scanner or Organize.

**Organize (N)** counts pending copies. Opening it pauses the frame source and unmounts the camera preview; returning resumes the scanner. Quantity/variant correction, selection and removal affect pending data only. Card details opened from Organize are read-only with respect to ownership. Save selected/all persists successful rows to Collection and removes only those rows from staging. Whole rows that exceed Free capacity or need variant review stay pending with an explanation. Discard requires confirmation.

## Boundaries

| Component | Responsibility |
| --- | --- |
| `ScannerCamera` | Permission handling and optional `expo-camera` preview, no recognition or image capture |
| `CardFrameSource` / `MockCardFrameSource` | Bounded observations; Phase A simulates physical presentations, not pixels |
| `ScannerController` | Stability, cooldown, one in-flight request, deduplication, cancellation and retry |
| `CardRecognitionService` | Cancelable identification; no ownership or quota mutation |
| `CardCatalogService` | Resolve the identified printing and valid variants |
| `MarketPricingService` | Independent nullable quote, cached per exact catalog variant |
| `ScanSessionProvider` / `ScanSessionStore` | Persistent pending rows, metadata, corrections, prices and save orchestration |
| `ChaseProvider` / `saveScanItems` | Permanent inventory limits, durable save receipts and collection valuation |

The recognition lifecycle is SEARCHING → CARD_CANDIDATE → IDENTIFYING → RESULT_READY → WAITING_FOR_CARD_CHANGE. ERROR requires deliberate retry. Stable presence is required for 450 ms; a confirmed absence of 350 ms rearms the same printing. Attempts are at least 1,200 ms apart. The mock supplies observations every 100 ms; these are not recognition requests. A new stable fingerprint also permits another identification without an empty frame. Returning from Organize does not rearm an uninterrupted presentation. The controller and provider independently prevent concurrent recognition.

## Persistence and crash boundaries

- Permanent inventory remains under `chase.prototype.v1`. Its optional `savedScanOperations` receipts are collection bookkeeping, not pending results. Existing stored states remain valid.
- Pending rows live under `chase.scan-session.v1` with a dedicated `ScanSession` model/store. IDs, quantities, selected catalog variants, timestamps, ambiguity and optional confidence are separate from ownership. Real catalog entries additionally retain validated printing/finish snapshots; legacy demo rows keep their existing IDs and shape.
- Recognition stages the row and any consumed-Free marker durably before acknowledging success. The marker survives an empty/discarded session. Canceling before durable staging or failing to write staging does not spend the trial. If staging completes immediately before navigation, the valid result remains recoverable in Organize.
- A save writes collection quantities and operation receipts together in one storage value, before removing pending rows. If collection storage fails, pending rows remain. If cleanup fails or the process dies between writes, receipts suppress replay on recovery. Saved rows are filtered from subsequent pending merges as well as from display.
- Saves process each selected row atomically, allowing successful rows through while retaining failed rows. Quantity/variant changes generate a new operation identity. Pending writes are serialized; malformed stored sessions expose retry and are not silently erased.
- Prices never create ownership. A row can enter pending while pricing loads, then update the overlay/Organize asynchronously. Missing/failed quotes say **Price unavailable**. Changing variant clears the old quote and resolves the exact replacement ID. No fallback to another variant is used. Display uses the shared USD/EUR preference; real quotes preserve native source currency, while scanner demonstration rows retain their explicitly sample prices.
- App background/focus changes stop observations, abort unfinished recognition and unmount CameraView. Pending state is already persisted. Root-level session storage remains available while navigating. Background behavior still needs physical-device validation.

## Reproducible checks

Run `npm run typecheck`, `npm run lint` and `npm run test`. With `npm run web -- --localhost --port 8081` running, use `npm run test:smoke` for existing app regression scenarios, `npm run test:scanner` for the continuous workflow and `npm run test:catalog` for catalog integration. Use `npm run export:mobile` to verify iOS/Android JavaScript bundles.

Developer test controls simulate recognition failure, missing price and required variant review. They are guarded by `__DEV__`. The main demo mode remains available without real recognition credentials and is visibly labeled.

## Limits and Phase B

Phase A performs no actual image detection, OCR or visual matching. Even over a real camera preview, results come from the deterministic mock source. No photos are captured, stored or uploaded; microphone/audio permission is disabled in the camera config plugin. The old one-shot full-screen result and per-card Add flow were removed.

Linux browser tests cannot verify iPhone/Android camera permissions, camera lifecycle, background interruption or native accessibility. The SDK 57 versioned documentation domain was blocked; the official Expo camera source/docs and installed `expo-camera ~57.0.6` types/plugin were checked. Validate the preview with a compatible Expo Go runtime or rebuilt development client; custom native permission/plugin changes require a new native build. Exports are not signed builds or device tests.

The first Phase B step now connects the public English TCGdex catalog and available ungraded prices. Search and details use real provider data; Organize can resolve provider variants without putting pending cards in Collection. Canonical catalog IDs and collectible finish IDs remain separate. Legacy demo recognition resolves to legacy samples deliberately: an old raw key is not reinterpreted as a different real TCGdex printing. See [TCGDEX_INTEGRATION.md](TCGDEX_INTEGRATION.md).

Phase A remains the deterministic demo. The later development CardSight path is described below. Production still needs authenticated server enforcement of RevenueCat-backed entitlements/scan quotas; existing local prototype limits are not tamper-proof billing enforcement. No proprietary ML model was built.

## Development camera and CardSight boundary

The demo described above remains available. The separate development camera path uses bounded snapshots, local RGBA thumbnail heuristics and stable perceptual presentation tokens before calling a local proxy. Capture errors are not card-removal events. Accepted presentation locks survive Organize, details, paywall navigation and app backgrounding. The camera never opens a printing chooser. Low-confidence, unknown-language and multiple-printing catalog matches keep their artwork and exact options in Organize for explicit review, while the scanner reveals the preview and remains ready. Uncertain printings/finishes stay unpriced and unsavable until confirmed in Organize.

The supplied official OpenAPI now defines the implemented server-only CardSight transport: binary JPEG to `POST /v1/identify/card` with `X-API-Key`. Vendor responses normalize physical detections, alternative candidates, language and evidence tiers before exact TCGdex resolution. Unknown/ambiguous finishes remain unpriced pending Organize confirmation; no-match and provider errors are recoverable. Tests use schema-based synthetic responses, not real CardSight results. The active cloud runtime still lacks the vendor key, so authenticated recognition and physical-device validation remain pending. See `CARDSIGHT_SCANNING.md` for local setup, validation evidence and image handling.
