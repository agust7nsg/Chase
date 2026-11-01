# Account collection synchronization

## Implemented behavior

Google sign-in now selects a separate account collection. The original `chase.prototype.v1.items` remains the guest inventory. Nothing imports or uploads guest cards automatically. Profile → Collection backup offers **Import guest cards** or **Keep guest cards separate**. Import adds the guest quantities to that account once per installation/account and preserves the guest originals. A Free import exceeding 50 copies is rejected whole; guest rows stay intact. A declined import can be requested later from Profile; an already imported source is not added a second time.

Account edits are saved locally first with a durable operation queue. The same atomic device write contains inventory, pending operations and installation-wide Organize save receipts. Only then does the UI acknowledge saving and remove pending scans. Organize itself, photos, onboarding, currency, trial flags and simulated purchase state are never uploaded to collection tables.

Logout restores the guest collection; switching accounts selects another isolated local replica. Existing owned cards, exact variant IDs and validated TCGdex snapshots are preserved. Offline edits remain available after restart and are retried on reconnect/foreground, on the 20-second retry timer or with **Sync now**. A cached local-owner hint helps select the previous replica if an expired token cannot refresh offline; it never grants cloud access or a verified Profile identity. Cloud methods still require server verification and SQL owner checks.

One logical collection per account is implemented. Multiple named collections, CSV, cloud ScanSession backup, historical market prices, live FX and RevenueCat entitlement verification are not part of this change.

## Conflict and replay rules

Each collectible ID (including its printing and finish) has a server revision. Each local change has a secure UUID, expected revision and desired item or deletion. Pending edits to one card form a dependency chain, so local offline corrections do not conflict with their own earlier writes. Distinct card edits from different devices combine automatically.

Two devices editing the same revision create an explicit quantity conflict. Profile shows the local/cloud quantities and offers **Keep my quantity** or **Use cloud quantity**. Applying the cloud choice requires confirmation; no side silently adds together edits that may represent the same physical copies. Keeping local sends a new operation against the reviewed cloud revision. Changing cloud data again can produce another review, preserving later writes.

The server serializes writers per owner, stores immutable per-owner operation receipts and rejects reuse of an ID with changed payload. A lost network reply or failed local acknowledgement replays that receipt rather than applying the change twice. Deletions remain versioned tombstones, so an older offline device cannot resurrect a removed card without resolving the conflict. New pulls ignore older revisions. Reads use small keyset pages and retain tombstones; they never interpret a failed/partial read as an empty collection. Periodic sync provides eventual convergence; this is not realtime subscription delivery.

## Supabase activation

The app code and SQL files do not prove the remote migration is deployed. No administrative Supabase token is present in this workspace and its GitHub CLI token does not authenticate. A manual deployment workflow is provided using the repository's existing deployment secret.

1. Open GitHub → agust7nsg/Chase → Actions → **Deploy collection sync**.
2. Choose **Run workflow** on `main`.
3. The workflow runs TypeScript/lint/unit tests, tests role isolation on embedded PostgreSQL, then applies `supabase/migrations/202611010001_collection_sync.sql` to project `vzjekkgyrdxzlhaupnrw`.
4. It uses the existing Actions secret **SUPABASE_ACCESS_TOKEN**, which needs database-query access to this project. No database password, Google secret or service_role belongs in the app.
5. Wait for the workflow to succeed, then use the updated app → Profile → Collection backup → Sync now. A real Google login uses an installed/development build, not Expo Go. Google must already be enabled as documented in [SUPABASE_INTEGRATION.md](SUPABASE_INTEGRATION.md).

Alternatively, run the complete new SQL migration once in Supabase SQL Editor. It is safe to reapply and does not modify scanner tables, Auth settings or existing collection quantities. Do not rerun historical scanner migrations to activate collection sync.

Until the collection schema is installed, sync failures are recoverable and all acknowledged local changes remain queued. **Up to date** is shown only after a successful cloud cycle with no pending operations/conflicts. Do not consider locally queued cards backed up remotely.

## Storage and access

The additive `collectionSync.version = 1` metadata inside the existing device file holds a separate account replica per UUID: exact inventory snapshots, remote revisions/tombstones, pending operations, conflict rows, import decision and last successful pull. Onboarding, plan, trial and save receipts remain installation-wide. Legacy guest rows retain their original IDs and shape. Invalid account metadata or snapshots stop recovery instead of silently dropping cards or rewriting storage. This change adds no new native dependency.

Use the updated app consistently after migrating: older app versions do not understand account replica metadata and must not write the same installation's store. Export/back up device data before a deliberate downgrade. Cloud-synced ownership can be restored by signing in; unsynced changes require the current local replica. Imports are one-time copies; subsequent guest edits are not automatically reimported into an account that already completed import.

`collection_items` is keyed by `(user_id, card_id)` with RLS read access only to the owner. Anonymous scanner sessions cannot read account collections. App roles cannot directly insert, update or delete rows or read receipts. The security-definer `collection_apply` RPC checks `auth.uid()` against the explicit intended owner and the Auth user's non-anonymous status, validates bounded payloads, checks revisions and writes a receipt atomically. Passing another owner's UUID cannot redirect an outbox into the wrong account even if authentication changes while a request is in flight.

The new tables store inventory quantities, catalog metadata/artwork URLs, dates, revisions and operation receipts associated with the Supabase user UUID. There are no camera images, raw CardSight responses, access tokens, Google secrets or scan-session rows in these tables. Auth account deletion would cascade these tables, but the app's account-deletion endpoint is still pending. No automatic history/receipt purging is configured; retention and account deletion must be finalized before publication.

Storage sync does not trust a client plan as paid verification. Existing client Free/Pro collection rules and server scanner quotas remain unchanged; restored ownership is never deleted because a local plan is Free. Verified RevenueCat-backed collection limits/production storage quotas remain future work. Restoring a larger existing collection never grants Pro.

## Validation and phone test

```sh
npm run typecheck
npm run lint
npm test
npm run export:mobile
# Local web server with public Supabase configuration; provider responses are fixtures:
npm run test:collection-sync
npm run test:auth
npm run test:scanner
npm run test:smoke
# Isolated PostgreSQL test engine, not a production dependency:
CHASE_PGLITE_MODULE=/path/to/pglite/dist/index.js npm run test:collection-sql
```

The tests cover legacy migration/guest consent, per-account isolation, offline/restart replay, quantity conflicts, deletion tombstones, lost replies, local-write failures, scan-save receipts and snapshot validation. Adapter tests use the real Supabase SDK with fixtures, including multiple read pages and rejected identities. SQL tests execute the actual migration in embedded PostgreSQL as authenticated/anonymous roles and verify RLS and denied direct writes. Browser tests use two independent device contexts against a shared mock backend.

Validation completed: TypeScript and lint passed; all **299 unit tests**, **54 browser scenarios** (8 collection-sync, 10 account, 22 general and 14 Scanner/Organize) and **8 embedded PostgreSQL scenarios** passed. Android/iOS JavaScript exports passed. Collection requests have explicit deadlines, including a stalled SDK identity lookup; the offline-expired-session browser scenario confirms that cached account inventory stays separate from guest rows.

These tests do not prove remote deployment, real Google consent, real-device secure storage or physical camera behavior. After deployment, test with two installations signed into the same Google account: import on one device, restore on the other, edit different cards, edit the same card offline on both, resolve the resulting conflict, remove a card, restart and retry sync. Sign out and use a different Google account to verify inventory isolation. Confirm Organize remains separate until Save and that Free/trial/development Pro behavior is unchanged. Verify available exact-variant prices and the Collection chart on the restored cards. Finalize Privacy Policy/Terms for this new stored inventory before release.
