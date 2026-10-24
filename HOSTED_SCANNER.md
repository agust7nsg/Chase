# CardSight hosted scanner

`supabase/functions/cardsight-scanner` reuses Chase's CardSight binary-JPEG adapter. It preserves the continuous camera, artwork reveals, catalog matching, pending Organize session and explicit collection saves. Once deployed, it replaces the computer's `npm run scanner:proxy`. Expo Go still needs Metro for its app bundle; an installed development/release build is needed to use the whole app independently of Metro.

## Automatic guest and account access

Opening the real scanner automatically creates a Supabase anonymous Auth session when no session exists. Overlapping requests share one sign-in, and the encrypted/native or browser Auth store restores it on subsequent launches. Profile still shows **Guest collector**. Creating an email/password account from this guest links the same UUID with `updateUser` and sends an email-verification link before asking for a password, as required by Supabase. Passwords are never persisted while waiting for verification. The callback opens the existing New password screen; a UI-only metadata flag is cleared after setup and never authorizes scanning. It never creates a new allowance just for registering, uploads ownership or changes Collection/ScanSession storage.

The server validates guests and registered accounts with Auth `/user`, then automatically provisions Free on the first health/recognition call. **No User UID, manual grant, allowlist entry or account activation is needed for Free.** Anonymous Auth is different from unauthenticated access: a public publishable key alone can never call the vendor.

Automatic Free permits one positive CardSight identification. Empty detections and provider errors do not spend this success allowance. Separately, each identity has a bounded 20-request lifetime/20-request daily attempt budget to limit repeated failures and upstream costs. The existing local Free rule still records its trial only after durable staging and still allows 50 saved copies. Server accounting is based on positive vendor candidates, before client catalog resolution: an unresolved printing may have used the hosted allowance, but retrying its matching in Organize uses saved metadata and does not require a second upload. Server-accepted calls can complete after phone cancellation; reopening/reinstalling client state cannot reset an existing server identity's usage.

Existing explicit beta grants are preserved as optional administrative test overrides, including their expiry, budgets and revocation. They are no longer an onboarding requirement. A revoked identity is not automatically re-enabled. The local **Development only · simulate Pro** switch requests the temporary server testing mode described below; user-editable metadata never authorizes paid Pro. Verified RevenueCat subscriptions are still pending; do not describe this change as paid Pro verification. Development Pro testing is temporary access rather than a subscription.

## Test real continuous scanning with the Profile switch

1. Run **Deploy hosted CardSight scanner** on the updated `main`, leaving **Enable Profile Pro simulation for real scanning for 7 days** selected (the prototype default).
2. Open the updated app with the existing hosted `.env.local` configuration. No new key, token, account activation or SQL copying is needed.
3. Turn on **Development only · simulate Pro** in Profile. Scanner health and each recognition request now use this mode, even after a previous Free scan or an already-created scanner instance. Scan a pack, open Organize, edit and save normally.
4. Turning the switch off restores ordinary Free rules and keeps all pending/saved cards. It does not refill the used Free recognition. Simulated scans themselves do not spend an unused Free trial or its attempt balance.

The server test window lasts seven days from deployment and can be renewed by another explicit test deployment. Per-user testing allows up to 100 upstream attempts per UTC day, with the existing shared global default of 100 attempts/day across all users and modes. The global budget, concurrency, spacing, authentication, revocation and duplicate-request protections stay active. These caps are provider-cost limits, not the one-recognition Free restriction.

**Before release:** run the workflow with the Pro-simulation checkbox unchecked. This immediately closes the server window. The switch and simulation requests are also guarded by `__DEV__`; production hydration restores Free. A header cannot prove that a request came from a development binary: the deliberately opened test window is the actual server permission, not the client flag. Do not leave this testing mode enabled for a paid public rollout. No client contains a private bypass key, and RevenueCat verification remains separate.

## Activation on the existing project

Project: `vzjekkgyrdxzlhaupnrw`.

1. Keep `CARDSIGHT_API_KEY` in Supabase **Edge Functions → Secrets**. Supabase supplies its own server URL/service-role credential; never copy either private key into `EXPO_PUBLIC_*`.
2. Keep the existing `SUPABASE_ACCESS_TOKEN` in repository **Actions secrets**. It must have access to this project for function deployment, database queries and Auth configuration.
3. Run GitHub Actions **Deploy hosted CardSight scanner** on the updated `main` branch. The manually triggered workflow validates the code, calls the official Management API to prepare scanner SQL and enable anonymous sign-ins and identity linking, applies the test-mode migration and selected window, then deploys the function. It does not run on every push. The administrative token is exposed only to setup/deployment steps, not dependency installation, tests or the app.
4. Keep these public client settings in ignored `.env.local` or the EAS build environment:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://vzjekkgyrdxzlhaupnrw.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<existing public publishable key>
   EXPO_PUBLIC_SCANNER_BACKEND=supabase
   ```

5. Restart Metro with `npx expo start --clear` and open the updated app. No new native dependency is added by this change. Local scanner URL/pairing token settings are ignored in hosted mode.

No SQL copying or per-account setup is part of the ordinary user journey. `scripts/configure-hosted-scanner.mjs` checks whether the original scanner schema exists, applies `202610210001` only when needed, applies `202610210002_automatic_scanner_access.sql` only if automatic access is missing, and applies repeatable `202610240001_scanner_pro_simulation.sql`. The migrations add success accounting, test-mode receipts and scanner-only RPCs while preserving existing grants, consumed budgets, receipts and local collections. Do not reapply migration 002 after 003: its older historical backfill does not distinguish simulation receipts; the deployment script prevents this. Repeating the workflow does not refill allowances. This targeted bootstrap does not register Supabase CLI migration-history entries; if the project also uses CLI migrations, reconcile the history before a future `supabase db push` instead of blindly reapplying the original CREATE TABLE migration.

For an administrator applying SQL without the workflow, run migration 001 once, then 002 and 003; enable **Authentication → Sign In / Providers → Anonymous Sign-Ins** and **Manual Linking** (allows the guest to link their own verified email; it does not require administrator account activation). This is an alternative deployment route, not a step required per account. Do not rerun migration 001 against an existing schema. If a project-scoped access token lacks the new setup permissions, the workflow fails with the endpoint/status and a permissions instruction without printing upstream bodies or secrets. The Management API contract was checked against the official Supabase repository's `apps/docs/spec/api_v1_openapi.json`; live administrative execution still requires authorized project access.

## Server boundary

Every request uses the current session JWT and public `apikey`. `GET /health` validates access without calling CardSight. `POST /recognize` uses `{requestId,image:{base64,mimeType}}`. The function's `verify_jwt=false` avoids the legacy platform signing-key gate, but its own handler always validates the bearer with this fixed project's Auth `/user` endpoint. A guest must be an actual anonymous Auth user with role `authenticated`; a normal user must have a confirmed email. Forged claims, public keys and caller-supplied user IDs are rejected before a vendor request. A Pro simulation request is accepted only within the explicit server test window; it never establishes a paid plan.

RLS is enabled; ordinary `anon`/`authenticated` roles cannot read/write scanner tables or invoke the privileged RPCs. Only the server can provision Free, reserve requests and settle usage. The v2 RPCs require an unexpired server test window for simulation; legacy RPC signatures retain ordinary access. Auto-provisioning uses the verified Auth UUID with a foreign key to `auth.users`; it never trusts email or plan metadata. Guests upgrading to accounts retain their UUID/quota. Anonymous sign-in rate limits are Supabase settings; anonymous Auth is not a permanent physical-device identity, so clearing credentials can create a new user. The global budget bounds total requests even then. Review abuse controls/CAPTCHA and retention before a public release.

Atomic PostgreSQL claims enforce one active request per identity, minimum intervals, attempt/success limits, global daily budget (default 100 upstream attempts) and global concurrency (default 5). `scanner_service_limits.enabled` is a kill switch. Receipts are scoped by identity/request ID and JPEG SHA-256. Replaying identical requests returns the recorded result or in-progress/indeterminate status without another vendor call or success debit. Expired leases never automatically retry upstream. Settlement and success accounting are atomic and use the same lock order as claims. Provider failures consume attempt budgets, not successful-recognition quotas. Existing beta overrides never establish paid entitlements.

Native requests do not need an Origin header. Web origins must be explicitly allowed by server secret `SCANNER_ALLOWED_ORIGINS` (comma-separated exact origins); default is native-only. CORS is not authentication. Bodies accept JPEGs up to 2 MiB, with bounded body/Auth/DB/vendor requests and no automatic paid retries. Successful outcomes are returned only after durable settlement. A phone disconnect does not undo a server-accepted attempt; a terminated function leaves a replay-protected lease.

## Data and retention

Photographs/base64 remain transient and are sent to CardSight. They are never written to scanner SQL tables, Supabase Storage or application logs by this code. Receipts store verified UUID, request ID, image digest, timestamps, lease and bounded normalized identification/error metadata. No bearer token, password, raw vendor body or admin/vendor credential is saved. Provider/platform retention must be reviewed separately for the Privacy Policy. Collections and pending scans remain local.

Receipts remain until administrative removal/account deletion (cascade). A retention job and authenticated account deletion are still pending. Deleting receipts ends their replay guarantee; it must not be used to reset quotas. The success counter survives receipt pruning and repeat deployments.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run export:mobile
deno check supabase/functions/cardsight-scanner/index.ts
deno test --no-remote supabase/tests/hosted_scanner_test.ts
# Isolated PostgreSQL engine; not an app dependency:
CHASE_PGLITE_MODULE=/tmp/chase-hosted-tools/node_modules/@electric-sql/pglite/dist/index.js npm run test:hosted-sql
```

Validation for the automatic-access update: TypeScript and lint passed, 251 Node tests passed, 14 PostgreSQL scenarios passed, and Deno import checking/runtime test passed. Hosted browser fixtures passed 5 scenarios (including the 20-presentation continuity regression); account browser fixtures passed 6. Android/iOS JavaScript exports passed. These runs used fixtures and an isolated PostgreSQL engine, not this project’s remote deployment.

Tests cover guest session reuse, upgrade with the same UUID, Profile guest identity, server-verified guest acceptance, automatic enrollment, trial replay, empty/error allowances, role isolation, migration repeatability, preserved revocations/budgets and deployment requests/errors. Existing continuous-scanner tests retain coverage of slow captures, Organize round-trips and explicit Collection saves. These fixtures do not establish physical camera behavior, live CardSight accuracy or remote deployment success.

After deployment, test guest entry/consent, Free recognition, pending preservation across Organize and app restart, guest registration/confirmation and server trial enforcement. For multi-card tests, enable the deployment test window and the Profile switch as described above; verified RevenueCat remains pending. The computer's local proxy should be off. Test actual Android/iOS camera/torch/backgrounding and compare upstream usage for duplicate calls. A JavaScript export is not a signed native build or phone test.

Pro-simulation validation includes the actual Profile toggle after a server-spent Free trial, nine consecutive catalog-artwork scans, Organize round-trips, toggling back to Free and saving, plus an independent 20-presentation continuity regression. SQL tests cover expiry, server shutdown, revocation, replay, global budgets, unchanged Free balances and restricted v2 RPC access. These are local fixtures/embedded PostgreSQL, not a physical-phone or live-provider performance guarantee.

Validation of the Pro-test update (October 24, 2026): TypeScript and lint passed; 253 Node tests, 20 embedded-PostgreSQL scenarios, the Deno check/runtime test and 7 hosted browser scenarios passed, including the real Profile-switch/nine-card flow and the 20-presentation regression. Android/iOS JavaScript exports passed. No real vendor call, physical-device test or remote deployment was performed by these checks.
