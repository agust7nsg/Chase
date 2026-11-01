# Supabase authentication

## Current account methods

Chase offers **Continue with Google**, **Continue with Apple** and guest access. Google is implemented with Supabase OAuth/PKCE. Apple remains an explicit placeholder until its developer/provider configuration and native implementation are ready.

At the user's request, email/password authentication was removed from the application: no email or password forms, signup/verification requests, password sign-in, reset emails or password updates. Those operations were removed from the account service, context and contracts as well as the UI. Legacy `/account?section=forgot` and `section=reset` destinations now show social sign-in. Old email verification/recovery callbacks without `provider=google` are rejected before any code exchange and offer social sign-in or a return to Chase.

Existing Supabase accounts and persisted sessions are not deleted or silently migrated. A stored session still requires server verification; logout preserves the local collection and pending scans. A Google provider may supply an email address displayed in Profile; that is not email/password authentication. This client change does not alter Supabase's provider settings. To also disallow direct email registration at the server, disable the Email provider separately in the dashboard, while retaining anonymous Auth for guest scanning.

Account collection sync is now implemented separately with explicit guest import, offline queues and isolated account replicas; see [COLLECTION_SYNC.md](COLLECTION_SYNC.md) for required SQL deployment. Authentication alone never imports guest cards, verifies purchases or deletes accounts. Hosted recognition is a separate deployment described in [HOSTED_SCANNER.md](HOSTED_SCANNER.md).

## Public client configuration

Keep `.env.local` in the project root, or configure the build environment:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://vzjekkgyrdxzlhaupnrw.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<project publishable key beginning sb_publishable_>
```

These two values are public client configuration. Secret/service_role, Google client secrets, CardSight credentials and deployment tokens never belong in `EXPO_PUBLIC_*` values. `.env.local` is ignored by Git. Restart Metro with `npx expo start --clear` after changing public configuration. Missing or invalid configuration leaves guest use available and shows a connection message.

## Google configuration

1. The Google Cloud **Web application** client must allow `https://vzjekkgyrdxzlhaupnrw.supabase.co/auth/v1/callback`. This is the Google → Supabase callback.
2. Supabase Authentication → Sign In / Providers → Google must be enabled with that client's ID and secret. No additional Google credentials are needed in the app. If Google's consent screen is in Testing, add your Google accounts under Audience → Test users.
3. Supabase Authentication → URL Configuration → Redirect URLs must allow **`chase://auth/callback?provider=google`** for installed builds. For local web testing also allow **`http://localhost:8085/auth/callback?provider=google`**, or the actual HTTPS/localhost origin and port used. This is the separate Supabase → Chase callback. The old plain email callback is no longer used. Do not substitute a changing Expo tunnel address for the installed app's custom scheme.
4. **Allow manual linking** must be enabled in Supabase Auth settings for anonymous scanner users. The hosted-scanner setup workflow already enables this setting. Google calls `linkIdentity` for an existing guest, retaining the same UUID and scanner usage. If the identity belongs to an existing account, Chase offers **Use existing Google account** as an explicit alternative. It never silently switches identities after a linking failure.

Native OAuth opens the system authentication browser with `expo-web-browser`; web uses a full-page redirect back to the same origin, avoiding popup blockers. PKCE requests only `openid email profile`. Supabase handles the provider exchange and consent; Chase no longer manages user passwords or email verification flows.

## Device and browser testing

- Preserve `.env.local` when downloading updated code and run `npm ci` when dependencies change.
- **Expo Go is not a supported OAuth runtime in SDK 58.** Chase explains this before starting OAuth and retains guest access. Android testing needs an installed/development Chase build with the `chase` scheme and `expo-web-browser`; it does not need an Apple membership. Existing SDK 58 builds containing this module need only the JS update for the removal of email forms.
- With Android Studio/SDK installed, `npx expo run:android` creates a local development build. Expo's [development build guide](https://docs.expo.dev/develop/development-builds/create-a-build/) describes cloud builds. Native builds remain distinct from JavaScript exports.
- For web, use `npm run web -- --localhost --port 8085` and the browser URL. Google returns to the same allowlisted origin/port that initiated OAuth.
- Open Profile → Sign In or Create Account: only Google and Apple should appear, with an explicit guest return. Google should return a server-verified identity. Test guest linking, account reuse, cancellation/denial, expired callbacks, offline errors, restart/session restore and logout. Test backgrounding and a callback opened with the installed app closed.
- Seed Collection and Organize before testing. Quantities, pending scans, currency and Free/Pro access must not change during authentication or logout. Also check 320px layouts, large system text and native accessibility.

The cloud environment does not supply an Android emulator or iOS simulator. Automated provider responses are fixtures, not a real Google login. The earlier attempt to inspect live Supabase Auth settings failed on host resolution; dashboard configuration and real consent/deep-link delivery require device/browser testing. No actual accounts or emails are created by automated checks.

## State, security and compatibility

`AuthProvider` is separate from `ChaseProvider` and `ScanSessionProvider`. Sessions use the existing `chase.auth.<project>.v1` storage key. Native tokens and PKCE verifiers remain in serialized chunked SecureStore; browser sessions use localStorage. Passwords are neither collected nor persisted by Chase. Identity always comes from server `getUser()` verification, not cached metadata alone.

Successful OAuth codes are exchanged once even when native Linking and the browser deliver the same callback. The callback only accepts the supported Google marker and code/optional flow ID, never bearer tokens in URLs. Provider error descriptions, tokens and secrets are not shown in the UI. Network deadlines cover headers and bodies. Errors and cancellations do not clear pending scans, spend recognition allowance or change collections.

Guest scanning still creates/reuses a persisted anonymous Supabase session only on real-scanner entry. Profile keeps the Guest collector label. The hosted deployment enables anonymous Auth and manual identity linking; registering with Google retains the guest UUID instead of refilling its scanner quota. This anonymous session is independent of the removed email signup feature and must stay enabled.

Collection card identities, pending ScanSession schemas, Free/Pro simulation and server scanner budgets are preserved. The device store now has additive isolated account replicas and a durable outbox; the original top-level inventory remains the guest collection. Successful cloud backup requires deploying the collection schema and completing sync; pending local edits are not yet backed up. A separate local-owner hint selects only cached offline data when session refresh fails; it never authorizes a cloud call.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run export:mobile
# With a local web server and public Supabase configuration:
npm run test:auth
npm run test:smoke
npm run test:scanner
```

`tests/auth.test.ts` covers public configuration, bounded networking, secure storage, existing-session verification/logout and PKCE flow handling. `tests/oauth.test.ts` covers Google requests, guest linking, callback validation/deduplication, old email-link rejection, runtime restrictions and recoverable errors using the actual Supabase SDK with controlled transports. `tests/scannerGuest.test.ts` preserves anonymous scanner access and Google upgrade identity. Browser tests cover social-only UI, old route handling, Google completion/cancellation/errors, narrow layouts and unchanged Collection/Organize data. No test grants a real purchase or proves native/provider delivery.

Social-only validation passed TypeScript, lint, all 280 unit tests, 10 account browser scenarios, 22 general browser scenarios and 14 Scanner/Organize scenarios. Android/iOS JavaScript exports passed. Google provider responses in these tests are simulated; no real Google login or physical-device verification was performed for this change.

## Remaining account work

Configure and implement Apple, verify real Google consent and native redirects, deploy and verify collection synchronization, connect verified RevenueCat entitlements, and implement authenticated account deletion/retention. Legal documents must describe the actual deployed services. Guest use remains available independently of these integrations.
