# Account deletion

Implemented in Profile → Delete Account. It is separate from collection sync deployment.

The user reviews the account and consequences, types `DELETE`, and explicitly submits. A recent verified Google OAuth login (10 minutes, signed JWT `amr` checked only after Auth `/user` verification) is required for a new request. A stale session gets instructions to sign in again and retry the explicitly confirmed request. Guests have no registered account to delete. Apple remains unavailable; Apple token revocation must be added when that provider is implemented.

## Deployment

Push this version, then GitHub → Actions → **Deploy account deletion** → Run workflow on `main`. It uses the existing `SUPABASE_ACCESS_TOKEN` repository secret, which needs database-query and Edge Function deployment access to project `vzjekkgyrdxzlhaupnrw`. An expired token must be replaced in GitHub. The migration is additive and repeatable; deploying does not delete any users. Do not rerun the original scanner migration manually.

The workflow checks the Edge runtime, app tests and isolated PostgreSQL permissions/cascades, applies `202611010002_account_deletion.sql`, and deploys `delete-account`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inside the function. No admin key belongs in Expo or a client `.env`. The function has `verify_jwt=false` because it verifies new intents itself and must support recovery after the Auth user is gone; this does not allow unauthenticated new deletion intents.

Native requests have no browser Origin. Localhost web tests are allowed. A deployed website needs its exact origin in the optional server secret `ACCOUNT_DELETE_ALLOWED_ORIGINS` (comma-separated). Unlisted origins fail closed.

## What is deleted / kept

- Admin Auth hard delete removes the Auth user, identities and sessions, and cascades its `collection_items`, `collection_operation_receipts`, `scanner_access_grants` and `scanner_request_receipts` through their existing foreign keys. Admin GET must confirm absence before reporting completion. It does not delete a Google account.
- After confirmed remote deletion, this installation removes only that account's local collection replica/outbox/conflicts and its active local login. A different selected account is never signed out by that cleanup.
- Guest inventory, other cached accounts, pending Organize scans, device preferences, plan/trial state and installation-wide scan-save receipts remain. Account sync pauses during an uncertain deletion; queued pulls/acknowledgements cannot recreate a purged cache.
- Shared scanner limits/aggregate usage remain; they contain no account ownership rows. No photos are stored by this deletion flow. This code does not promise erasure of provider operational logs or database backups; deployed retention/legal policies must describe those separately. Offline caches on another installation cannot be remotely erased by this request.

## Interrupted requests

Before submitting, a random operation UUID and 256-bit recovery proof are durably saved in private auth storage (SecureStore on native, localStorage on web). The server records only SHA-256 proof and owner/operation hashes, never a plaintext proof, bearer, email or raw user UUID. A matching proof can resume an already authorized intent without a live login after the user is gone. Unknown/no receipt always requires verified fresh login. After 15 minutes, resuming an intent requires a fresh verified Google login if the account still exists. An unconfirmed request cannot be canceled by interpreting a later rejection as proof that another in-flight request did not complete. Recovery receipts expire after seven days and are physically purged on subsequent receipt lookups; no scheduled purge is claimed.

The client retains an uncertain job across restarts and offers **Check or retry deletion**, without removing local cards or claiming success. On confirmation it durably marks the job confirmed before cache cleanup. Failed cleanup offers **Finish cleanup**. Do not uninstall/clear app storage while recovering an uncertain request; that discards the recovery proof. After receipt expiry, an unconfirmed completed deletion may require support to reconcile local cached data.

## Verification

`npm test` covers portable handler and transport authorization, proof replay, lost replies, local durability, and late collection sync results. `npm run test:account-deletion` covers cancellation, real UI confirmation, lost-response restart recovery, reauthentication, and cleanup while another account is selected using intercepted fixtures. `npm run test:account-deletion-sql` uses isolated PGlite PostgreSQL and the actual migrations to verify grants, idempotency, expiry and account-specific cascades. Set `CHASE_PGLITE_MODULE` to a temporary installation of `@electric-sql/pglite@0.3.15` when running SQL tests outside CI.

Fixture tests never delete a real Supabase account. After deployment, use a disposable Google test account in an installed Android build to verify actual Auth deletion and preserved guest/Organize data. An export is not a signed APK or a native test.

Implementation validation: TypeScript and lint passed; 319 unit/service tests, 59 browser scenarios (5 deletion, 10 auth, 8 collection sync, 14 scanner, 22 general), six isolated PostgreSQL deletion scenarios, and Android/iOS JavaScript exports passed. Deno execution is configured in the deployment workflow; it was not available in this local environment. No real user was deleted and no signed APK or physical-device verification is claimed.
