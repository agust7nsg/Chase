# Android preview restoration after Organize

The reported Samsung S24 FE / Expo Go failure shows a camera image occupying only the upper portion of the scanner, with black space below. It occurs after opening Organize and returning. CardSight/catalog matching is independent of the preview's native layout.

## Verified implementation defects

The scanner previously created its native camera as soon as `useIsFocused()` became true. Native-stack focus precedes `transitionEnd`, so CameraX could acquire its preview while the restored screen was still being attached/transformed. Every transient size change also replaced the camera immediately. The short release interval used for initial picture-size discovery was skipped on cached re-entry.

Installed `expo-camera` 57.0.6 Android source (`ExpoCameraView.kt`) exposes mechanisms relevant to this failure:

- `onLayout` forwards full dimensions to its inner CameraX `PreviewView` only when width/height differ from remembered dimensions (lines 260–267).
- Preview-child creation has its own native measure/layout callback (lines 834–842). Correct React/outer bounds do not prove correct internal preview rendering.
- `onCameraReady` is emitted from `CameraState.OPEN` (lines 654–659), before it establishes measured/streaming preview readiness.
- Both binding and destruction invoke the shared provider's `unbindAll()` (lines 533–534, 863–866), making overlapping mount ownership undesirable.

These are verified source paths and a concrete app-side lifecycle gap. The exact event ordering on the user's hardware cannot be reproduced here; this is not a claim of captured Android pixel evidence.

## Correction

`useScannerCameraFocus` gates acquisition on the route transition finishing plus two animation frames. Initial/web/missed-start paths have a 500 ms quiet fallback; a known active transition is not overridden by a timer. Inactive activations cancel queued work. Each foreground/focus activation has its own identity, so frozen-route readiness cannot authorize another mount.

`LiveScannerCamera` removes a prior surface and waits for 100 ms of stable final bounds before assigning a fresh mount owner. Bounds, restart and configuration changes invalidate an owner before another can acquire. Old ready/error/configuration callbacks cannot alter a replacement. Expo does not expose an Android destruction acknowledgement; the scheduling gap does not claim to be one.

Each configured `CameraSurface` waits for camera-open and its own measured bounds. On Android, `CameraPreviewLayout` then requires two native layout acknowledgements: height +1 logical pixel followed by the original height. This deliberately executes Expo's cached-dimension layout branch and restores the inner preview to the final scanner bounds. The temporary excess is clipped by the unchanged container. Only after restoration and two more frames can captures begin. Crop calculations always use the original final bounds.

The scanner retains centered cover scaling. Do not add `ratio="4:3"` or `"16:9"` as a workaround: this installed Android version selects FIT_CENTER for those values, while Chase's crop expects cover/FILL. Picture size is discovered/cached as a camera configuration, never as preview readiness or native-view identity.

A neutral camera-opening cover remains until the handshake completes. A seven-second preview-opening watchdog invokes the existing reconnect path. Native mount errors cancel pending readiness callbacks, and stale capture completions cannot unlock a different gate. Passive effect cleanup is replay-safe for React StrictMode; it does not permanently retire a reused layout service. Torch resets and preview-only native state belong to each mount. Pending ScanSession, accepted-presentation locks and permanent Collection are untouched.

Development diagnostics include the current mount, layout phase, target/outer measured dimensions and capture readiness. These scalars do not measure Android's inner rendered pixels and contain no photos, credentials or raw recognition responses.

## Verification

- Deterministic layout tests cover both event orders, wrong/stale dimensions, every Android expand/restore acknowledgement, rounding, retirement and fresh repeated mounts.
- A browser regression performs twelve Organize round trips while thumbnail callbacks are pending, changes hidden viewport size, preserves held-card locks, then scans a new card after every return and saves thirteen pending cards exactly once.
- Existing slow asynchronous capture (>2.2 s) and twenty-presentation continuity regressions remain required.
- Browser video bounds, fake camera tracks and domain tests cannot establish Android SurfaceView pixel coverage. JavaScript exports are not native hardware tests.

## Physical check: Samsung S24 FE, Expo Go

Use the updated app bundle (`npx expo start --clear`) with the existing hosted settings and enabled Pro testing. No server redeployment/new native dependency is required for this correction.

1. Enable scanning and verify the image fills the scanner behind the floating controls, with the guide over the actual image.
2. Recognize a card, open Organize and return. Repeat at least twelve times, including a quick back action while a sample may still be processing.
3. Check the full visible camera image after each return: no black lower/right panel, stretching or stale frame. Verify that presenting another card still works and the held card is not counted again.
4. Repeat after rotating the phone and backgrounding/foregrounding. Torch must reset and pending cards must remain.
5. If pixel coverage is still wrong, open the existing development scanner diagnostics from its status control and record the preview-layout line, app version and screenshot. Correct outer dimensions alone must not be reported as proof that native rendering is fixed.

Local validation: TypeScript/lint passed; all 260 Node tests passed, including six new layout-handshake cases. Browser runs each passed seven scenarios for navigation, slow capture and actual-art continuity (the six shared gate/account cases are repeated, not 21 unique cases). Navigation includes twelve return cycles and thirteen saved cards; the slow path exceeds 2.2 seconds; the twenty-presentation run includes a recoverable failure and Organize round trips. Recognition/Auth responses are fixtures, not live vendor calls.

Android and iOS JavaScript exports also passed after the final changes. No native dependency, server function, schema or API credential changed.
