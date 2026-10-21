# Scanner continuity diagnosis after the p15 phone test

The reported screen remained at **Present the next card**. That state follows a completed recognition; it indicates that a new eligible local presentation has not reached the recognition request. It does not, by itself, prove a CardSight outage. No device trace from that failed session was captured. The following independent defects were reproduced in the actual application logic and repaired.

## Reproduced causes

1. **Slow captures could never become stable.** The old tracker compared photo completion times against a 2,200 ms gap. Native photography, image manipulation and the extra 650 ms scheduling delay could exceed that gap on every sample. Each new sample then reset its own candidate. The initial recognition could work on a cold/fast device while subsequent samples never passed stability. The tracker now measures idle time before capture separately from time spent producing the image; explicit navigation and capture failures still reset unconfirmed candidates.

2. **Similar commons could remain locked as the previous card indefinitely.** Actual Ivysaur (Base Set 30) followed by Metapod (Base Set 54), occupying 62% of the crop, had a whole-card distance of 0.1277. That was below the old 0.16 same-card threshold. Their backgrounds and text dominated the comparison. Focused artwork distance was 0.2129. The tracker now compares artwork as well as the overall card, requires extra stable evidence for less distinct changes and checks that successive candidate illustrations agree.

3. **The outline gate rejected valid sizes and some full-art cards.** The searched border locations excluded smaller cards and some cropped illustrations. The geometric search is wider; a weak outline needs three stable samples rather than being silently rejected forever. Static textured backgrounds still do not become recognition requests merely because time passes.

4. **Local observation stopped during identification.** The old screen skipped all camera sampling during IDENTIFYING. A card removed and another copy presented while the provider/catalog was busy was invisible to local deduplication. `LiveScannerPipeline` continues small local observations while allowing only one recognition request. Actual absence can therefore rearm another physical copy.

5. **Every observation unnecessarily prepared an upload image.** Even a stationary, already recognized card produced a 768px JPEG and base64 string before deduplication. Sampling now analyzes a 64×88 thumbnail first. Only a stable, eligible presentation prepares the full image. Sampling is scheduled from the start of the previous sample rather than always adding another 650 ms after expensive work.

6. **The catalog could hold recognition busy without an overall limit.** The provider response ended the HTTP timeout, but matching and optional storage were still awaited. Automatic matching now has a 5-second budget; unresolved normalized metadata stays in Organize. Optional link operations and catalog-cache I/O are bounded. A hung optional native cache is quarantined instead of blocking new lookups or allowing old writes to overwrite new ones. Collection and pending-session durable writes are not converted into optional cache writes.

## Duplicate and session safeguards

An appearance change is a reason to verify a card, not proof that another physical copy exists. A verification of the same canonical printing must not add another copy or silently replace a finish. Confirmed removal and re-presentation still allow another copy. A successfully persisted scan is acknowledged even if navigation occurs while its native storage write finishes; an aborted uncommitted recognition receives no such acknowledgement.

The scanner still uses the separately persisted ScanSession. Only explicit Organize saves change Collection. Free entitlement checks, missing-price handling and exact printing/finish identity remain enforced. No existing collection or session is migrated.

## Device diagnostics and validation limits

In development mode, tap the scanner's status/info control to open **Scanner diagnostics**. The report contains a bounded volatile history of capture/analysis/upload times, lifecycle states and scalar detector reasons/distances. Text can be selected and copied. It contains no photos, pixel signatures, API keys, pairing tokens or server URLs, and is not saved with the collection. The status distinguishes recognition, catalog matching and session saving.

Regression fixtures now include 20 actual card illustrations and 1,900 ordered transitions across five crop sizes, including similar green commons. Browser recognition fixtures omit canonical TCGdex IDs by default, exercising the real set/name/collector-number lookup instead of bypassing it. Slow asynchronous capture, delayed catalog responses and removal during an in-flight request are covered. These fixtures establish the repaired code paths; they do not establish physical-device accuracy.

The current Expo implementation samples native photos rather than a 30fps native frame processor. Real capture/focus cost, glare, networking and CardSight accuracy still affect response time. Validate this version on the phone, use the diagnostic report for any remaining stall, and do not infer universal card/device support from synthetic test counts.

## Final validation — October 21, 2026

- TypeScript, lint and all 219 unit tests passed. This includes actual-image detector transitions, slow captures, catalog/cache stalls, finish evidence and navigation during a real delayed ScanSessionStore write. Deadline assertions use a controlled clock rather than fragile short wall-clock sleeps.
- All 26 live-camera browser scenarios passed together. The final sequence accumulated and saved 20 copies after 21 fixture requests (one intentional failure), including repeated Organize returns. The slow-capture case recognizes four different printings after delaying thumbnail callbacks beyond 2.2 seconds; the in-flight-removal case accepts a deliberately re-presented second copy.
- The 14 existing demo/session and 12 catalog browser scenarios passed: 52 browser scenarios total. Browser tests observe brief feedback in-page so automation round trips cannot miss the 1.8-second reveal. Preview assertions allow its bounded recovery interval while still requiring a full-screen live surface.
- Android and iOS JavaScript/Hermes exports passed. No dependencies or native modules were added, no saved identities were migrated, and no authenticated CardSight calls or vendor credits were used.

These checks were run with controlled camera imagery and provider/catalog responses. Physical Android retesting remains necessary: scan 20 distinct cards (including similar commons), hold one stationary, remove/re-present another copy, and return from Organize several times. For any remaining stall, copy the development **Scanner diagnostics** report; it separates capture recovery, local presentation rejection, recognition, catalog matching and durable saving without retaining photos or secrets.
