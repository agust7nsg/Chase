# Chase legal drafts — publication review

These are English drafting materials for **BluePeak Global LLC, based in Wyoming, United States**, as identified by the operator. They are not published terms, do not establish a legal compliance certification, and have not been approved by jurisdiction-specific counsel. The app's legal URLs remain null. Nothing was posted externally or represented to users as an effective policy.

## Decisions and information needed

- [ ] Confirm the precise legal entity name, business mailing address, and jurisdictional contact requirements. Do not substitute a guessed address or an assumed registered-agent address.
- [ ] Supply a monitored public support/privacy email (the operator confirmed this has not yet been created). One address can serve both roles if the operator chooses. Configure a working request process before publishing.
- [ ] Set the effective date only after review and publication; remove the draft banner at that time.
- [ ] Decide the minimum age, intended audience, and distribution countries. The drafts intentionally leave `[MINIMUM_AGE]` open. Pokémon-related subject matter needs an actual audience/COPPA assessment; a 13+ sentence or store age rating alone does not determine child-directed status or supply parental consent. No age gate is claimed by these drafts.
- [ ] Review the proposed Wyoming governing-law/venue clause and the proposed liability cap (greater of US$100 or 12 months of fees) with appropriate counsel. These are draft commercial terms, not decisions already approved by the operator. No mandatory arbitration/class-action waiver was added.
- [ ] Confirm CardSight's image handling, retention, training rights, contractual role, subprocessors, privacy notice, and deletion process. Do not add “no AI training,” “zero retention,” or “deleted immediately everywhere” without evidence.
- [ ] Confirm Supabase hosting region, Auth/Edge log retention, database backups, deletion recovery and applicable data processing/transfer arrangements. A checked-in migration does not verify deployed provider settings.
- [ ] Decide and implement retention schedules for guest Auth users, scanner receipts, collection operation history, support records and logs. The drafts describe the existing lack of scheduled expiry instead of inventing a deletion deadline. Expiring an anti-abuse receipt must not inadvertently refill quotas or break replay safety.
- [ ] Confirm that the no-sale/no-advertising statements accurately describe business practices and all provider agreements. The current source has no advertising or product-analytics SDK; source review cannot prove every downstream provider practice.
- [ ] Verify the actual deployed account-deletion endpoint and define manual support for guest data requests, access/correction/export and interrupted deletion. No in-app CSV export or guest deletion button is promised.
- [ ] Verify where in the real app users see the legal documents and the CardSight/image-transfer explanation, and obtain any required agreement or separate consent before relevant processing. Existing camera disclosure is not automatically sufficient consent for every legal/platform requirement.
- [ ] Reconcile App Store privacy disclosures and Google Play Data Safety with the deployed service and applicable store definitions. Guest IDs and account-linked image hashes must not be casually classified as anonymous data. Complete any required public deletion-request page/process; no such page is created by these Markdown files.
- [ ] Decide whether distribution uses the standard Apple license agreement or a custom EULA. These service drafts are not a reviewed custom Apple EULA; check platform-specific requirements before choosing that route.
- [ ] Before paid rollout, confirm actual products, billing/renewal terms, refund/support handling, verified entitlements and applicable store agreement requirements. Billing clauses are conditional; they do not implement purchases or imply RevenueCat is active.
- [ ] Apple sign-in, the deferred paid pricing API and any future analytics need fresh data-flow review before activation. No monthly pricing subscription was started.
- [ ] Choose real public HTTPS hosting for Privacy Policy, Terms and Support; replace local cross-links with the resulting URLs and update `src/config/links.ts` only after review. Do not link unfinished drafts as effective policies. The current Account privacy placeholder describes local storage too narrowly for account sync; revise that UI copy during publication integration.

These documents apply to Chase, not automatically to future creator-branded apps. A different publisher/controller or provider licensing arrangement requires its own review.

## Source review supporting the drafts

| Topic | Checked-in evidence |
| --- | --- |
| Google profile and sessions | `src/services/auth/accountService.ts`, `client.ts`, `scannerSession.ts`, `oauth.ts` |
| Scanning permissions and temporary image cleanup | `src/features/scanner/LiveScannerCamera.tsx`, `src/services/scannerImages.ts` |
| Third-party image transfer and stored scan metadata | `supabase/functions/_shared/cardsightTransport.ts`, `hostedScanner.ts`, `supabaseScannerStore.ts`; scanner migrations |
| Local pending scans and confirmed catalog links | `src/services/scanSessionStore.ts`, `src/services/cardsight/links.ts` |
| Explicit guest import and cloud collection | `src/services/collections/model.ts`, `store.ts`, `supabase.ts`; `202611010001_collection_sync.sql` |
| Account deletion and proof retention | `src/services/auth/deletion.ts`, `supabase/functions/_shared/accountDeletion.ts`; `202611010002_account_deletion.sql` |
| Direct catalog/artwork requests and preloading | `src/services/tcgdex/index.ts`, `artwork.ts`, `src/features/app/CatalogPreload.tsx` |
| Provisional pricing/history and display currency | `src/services/catalog.ts`, `priceHistory.ts`, `currency.ts`, `CardDetailScreen.tsx` |
| Current purchases/telemetry boundary | `package.json`, `src/features/account/AccountScreen.tsx`, `src/services/scannerDiagnostics.ts` |

This is a code-and-document review, not an inspection of production logs, provider contracts, hosting regions or legal obligations in every location. The drafts avoid relying on stale implementation notes that still call account deletion pending or describe all collections as local-only. No app behavior or store listing was changed by writing them.
