# CardSight hosted scanner

## What this change does

`supabase/functions/cardsight-scanner` is a real server implementation for Supabase Edge Functions. It reuses the same verified binary-JPEG CardSight adapter as the local proxy and preserves Chase's continuous camera, catalog matching, artwork reveals, Organize and explicit collection saves. It can run without `npm run scanner:proxy` on a computer once deployed and configured.

**Implementation is not deployment.** The files and local tests do not create a remote function, apply SQL, provision a vendor secret or authorize a test account. The public project reference/publishable key are sufficient for the mobile client; they do not grant administrative deployment access. This environment currently has no authenticated Supabase CLI/management connection or server-side CardSight key. No remote schema, user, access grant, secret or endpoint was changed by these tests. Follow the deployment steps below to activate it.

Expo Go still obtains the development app bundle from Metro. Hosting recognition removes the computer dependency for the scanner server; using the entire app without Metro additionally requires an installed Android/iOS development or release build.

## Access for this stage

Online recognition requires a **confirmed Supabase email account** and an explicit, expiring server-side **beta grant**. Unauthenticated/anonymous users can still use the guest app, onboarding, catalog and demo scanner. The existing local Free limit of one successful recognition and Collection capacity are unchanged. A beta grant limits upstream **attempts**, including rejected/time-out photos, separately from successful Free recognitions. Failed catalog matching does not mark the local Free scan as used.

No paid Pro access is inferred from `user_metadata`, app plan flags or the development Pro switch. To test a full booster pack, authorize the account on the server and enable the existing local development Pro simulation. The server grant is the actual beta authorization; the app switch alone cannot obtain vendor calls. This is a restricted test backend, not the final public Free/RevenueCat entitlement rollout. Server-enforced product trial accounting and verified RevenueCat entitlements must be added before opening paid/public recognition. Do not treat beta request budgets as verified purchases.

## Deploy to the existing project

Project: `vzjekkgyrdxzlhaupnrw`.

1. Review and execute [the additive migration](supabase/migrations/202610210001_hosted_scanner.sql) in this project's Supabase SQL Editor. It creates scanner-only tables/RPCs and no collection tables. If the project is already managed with CLI migrations, instead use `supabase link --project-ref vzjekkgyrdxzlhaupnrw` and review `supabase db push --dry-run` before `supabase db push`. Use one migration route, not both. Do not expose the database password or administrative credentials in chat, source or client variables.
2. Under Edge Functions → Secrets, set **`CARDSIGHT_API_KEY`** to the existing vendor key. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to its function runtime. None belongs in `EXPO_PUBLIC_*`. The network secret stored in the Codex environment is not automatically copied into Supabase. Optional `SCANNER_ALLOWED_ORIGINS` is a comma-separated list of exact web origins; leave it empty for native-only testing. CORS is not the authentication boundary.
3. Deploy the function with an authorized Supabase CLI session:

   ```bash
   npx supabase login
   npx supabase functions deploy cardsight-scanner --project-ref vzjekkgyrdxzlhaupnrw
   ```

   Or add an administrative `SUPABASE_ACCESS_TOKEN` to GitHub Actions **Secrets** and manually run **Deploy hosted CardSight scanner**. This workflow is `workflow_dispatch` only; it does not deploy on push. Any separate Supabase/GitHub integration settings must be reviewed in that service. It deploys the function after checks and intentionally does not execute SQL or copy the vendor key. Do not paste an access token into chat or commit it.

4. Sign in to Chase with a confirmed test account. Find its UUID under Supabase Authentication → Users. Grant a deliberately bounded beta allowance in SQL Editor (replace only the UUID):

   ```sql
   insert into public.scanner_access_grants
     (user_id, enabled, expires_at, remaining_requests, daily_request_limit)
   values
     ('REPLACE_WITH_CONFIRMED_TEST_USER_UUID'::uuid, true, now() + interval '7 days', 100, 100);
   ```

   No account is automatically authorized by deployment. Revoke with `update public.scanner_access_grants set enabled = false where user_id = '<UUID>';`. Updating grants is an administrative operation; ordinary app users cannot do it.

5. In the phone app's `.env.local` or EAS environment, keep the existing public Supabase values and select the hosted backend:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://vzjekkgyrdxzlhaupnrw.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<the existing public publishable key>
   EXPO_PUBLIC_SCANNER_BACKEND=supabase
   ```

   Local `EXPO_PUBLIC_SCANNER_URL` and `EXPO_PUBLIC_SCANNER_TOKEN` are not used in this mode. Restart Metro (`npx expo start --clear`) or create a new native build with the updated public configuration. No new native dependency is added by the hosting change. The default remains local/demo until this flag is explicitly selected, preserving existing tests and setup.

## HTTP and security boundary

The app derives `https://vzjekkgyrdxzlhaupnrw.supabase.co/functions/v1/cardsight-scanner` from the validated project URL. Every request uses the current user's bearer JWT and public `apikey`; tokens refresh through Supabase Auth. Credentials are resolved per recognition, not retained in a scanner instance. `GET /health` verifies configuration and that account's beta access without calling CardSight. `POST /recognize` uses the existing `{requestId,image:{base64,mimeType}}` protocol. Neither endpoint is a public recognition relay.

The function has `verify_jwt = false` because the legacy platform gate can reject newer signing-key JWTs. **Its own handler always validates the bearer with this project's Auth `/user` endpoint**, requires an authenticated, non-anonymous confirmed user, and derives the user ID from that verified response. A publishable key, forged JWT payload or user-supplied ID never authorizes recognition. Private service credentials are sent only to the fixed project origin. Ordinary `anon`/`authenticated` roles have no table/RPC permissions; RLS is enabled on every scanner table. Only the server can reserve or settle usage.

The PostgreSQL reservation is atomic across Edge instances. It enforces one active request per account, a per-account interval/daily/lifetime budget, an expiration date, a global daily budget (default 100 attempts) and a global concurrency cap (default 5). A kill switch lives in `scanner_service_limits.enabled`. These are conservative beta budgets; review CardSight's upstream trial limit before raising them. Provider failures consume an attempted vendor request budget because a failed response does not prove the provider did not bill the attempt.

Receipts are scoped by verified user ID and request ID, bound to the JPEG SHA-256 and reserved before a vendor call. Repeating that same request ID/image returns the persisted result, in-progress status or an indeterminate timeout; it never launches another upstream attempt. Reusing an ID with different bytes conflicts. A new physical card gets a new request ID. Expired process leases never trigger an automatic upstream retry. Completion requires the reservation's lease token; success is returned only after receipt persistence. An ambiguous database/network failure fails closed, preserving the receipt and avoiding a false success. The mobile client performs no automatic photo re-upload on transport failure.

Requests accept bounded JPEG JSON only (2 MiB JPEG limit). Request body, Auth, database and provider operations have deadlines; raw responses and keys are never forwarded. After a reservation is accepted the function settles independently of the phone disconnecting where the runtime permits; if the Edge instance is terminated, its lease expires and the receipt becomes indeterminate on retry. Existing camera consent still applies. Recognition does not insert cards into Collection, and missing/ambiguous finishes retain their existing review and pricing behavior.

## Data and retention

Photographs/base64 remain transient in function memory and are sent to CardSight for identification. They are never written to scanner SQL tables, Supabase Storage or application logs by this code. SQL stores the account ID, request ID, SHA-256 fingerprint, timestamps, lease, bounded normalized candidate metadata/error and usage counters. Platform/provider logs and retention are separate operational settings; review them before publishing the Privacy Policy. No arbitrary vendor body, password or bearer token is stored in receipts.

Receipts currently remain until administrative removal or account deletion (foreign keys cascade). A reviewed retention job is still needed before a public rollout; do not delete active receipts or refill budgets by deleting them. Deleting an old receipt ends its replay guarantee. Supabase Auth account deletion is not implemented by this change. Collection and pending scans remain device-local and are never uploaded by the hosted scanner.

## Validation and phone checklist

Automated tests use real handler/adapter code with intercepted provider/Auth/database responses. `tests/hostedScanner.test.ts` covers authentication, origins, input validation, quotas, replica replay/concurrency, timeout/late results, settlement failures, per-request JWTs and exact catalog identity. The SQL script executes the actual migration/functions in embedded PostgreSQL and checks roles, grants, receipt isolation, expiry, budgets, concurrency reservations, throttles and revocation. The embedded engine serializes connections; it does not establish real multi-connection performance or Supabase Edge lifecycle behavior.

```bash
npm run typecheck
npm run lint
npm test
npm run export:mobile
deno check supabase/functions/cardsight-scanner/index.ts
deno test --no-remote supabase/tests/hosted_scanner_test.ts
# Optional isolated PostgreSQL test tool, not an application dependency:
npm install --prefix /tmp/chase-hosted-tools --no-package-lock --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.3.15
CHASE_PGLITE_MODULE=/tmp/chase-hosted-tools/node_modules/@electric-sql/pglite/dist/index.js npm run test:hosted-sql
```

Validation on October 21, 2026: TypeScript and lint passed; all 246 Node unit tests passed, including 14 new hosted-scanner cases. The actual migration and RPCs passed 9 embedded-PostgreSQL scenarios. Deno 2.5.4 checked the function imports and passed its portable runtime test without network/vendor access. Android and iOS JavaScript exports passed. The hosted-browser fixture passed three scenarios: sign-in gating, server access denial despite local Pro simulation, and a 20-card continuous session across a failure, Organize navigation and final collection save. The original local backend also passed its slow-capture continuity regression. These are controlled fixtures, not a deployed Supabase or physical-device recognition test.

After deployment, turn off the computer's local scanner proxy, sign in on the phone, check access, scan nine distinct cards, test another physical copy, open/close Organize, background/foreground, save and retry without duplicate inventory. Confirm a revoked/ungranted account cannot upload a photo, and test an expired login and exhausted allowance. Verify vendor usage increases once per new accepted request. Native camera/torch behavior and real CardSight accuracy require physical-device tests. A JavaScript export is not a native build; fixtures are not an authenticated vendor test. GitHub linkage alone does not prove the function or migration is deployed.
