# Chase Privacy Policy

**Draft for review — not yet effective or published.**

Draft prepared: November 4, 2026  
Effective date: **[EFFECTIVE_DATE]**

**BluePeak Global LLC, based in Wyoming, United States** (“BluePeak,” “we,” “us,” or “our”) provides Chase. This Privacy Policy explains how we handle information when you use the app and related services. Where applicable data protection law uses that term, BluePeak is the controller for the processing described here.

Contact for privacy requests: **[PRIVACY_EMAIL]**. Our mailing address is **[BUSINESS_MAILING_ADDRESS]**.

## 1. Overview

Chase helps identify trading cards, show available estimated prices, and organize card information. You can use supported features as a guest. Online scanning still uses a technical authentication session and sends card images to a recognition provider; it is not an entirely offline feature.

Pending cards in Organize and the guest collection stay on the device unless you explicitly save or import them into an account collection. Registered account collection data can synchronize through our hosting provider. Our scanner database stores usage and identification metadata, not a photo library.

## 2. Information we handle

### Account and authentication information

If you use Google sign-in, we receive account information supplied through that sign-in, including an identifier, email address, display name, and other profile information made available by the provider. Authentication systems also process identity-linking information and session credentials. We do not receive your Google password.

If you scan online without a registered account, the service creates or reuses a guest authentication identifier and session. That identifier is used to authorize requests and enforce allowances. “Guest” does not mean that technical records cannot be associated with a session, device, or person.

### Camera images and identification results

When you enable camera identification, Chase captures and processes card images. Local processing prepares eligible images for upload. The app sends selected images through our Supabase-hosted service to **CardSight** for recognition. Camera permission alone does not make recognition local to your phone.

Images may contain background information. Frame only the card and avoid faces, addresses, payment details, or other sensitive information. Cropping cannot be assumed to remove every unwanted detail. Chase is not designed to recognize or identify people.

We receive identification results such as card, set, language, printing, confidence, and matching information when available. These results may be displayed, held as pending scans on the device, or saved as card metadata. Recognition does not establish authenticity or condition.

### Collection and local app information

Chase stores card identifiers, finishes, quantities, catalog snapshots and artwork references, dates, and related collection metadata. Local storage also holds pending scans, manually confirmed catalog matches, preferences, onboarding state, usage flags, and save-operation records used to prevent duplicates.

For a signed-in account, cloud synchronization includes its saved collection, revisions, deletion markers, and operation records needed to apply edits reliably. Signing in does not automatically upload the guest collection; importing it is a separate action. Pending Organize scans are not themselves backed up as a cloud scan session.

### Usage, security, and network information

Our services process authentication identifiers, request identifiers, timestamps, image hashes, service allowances, test-access flags, and bounded identification or error metadata. An image hash is not an image file, but a hash or request record linked to an account can still be personal information.

Requests also expose information needed to deliver and secure internet services, such as IP addresses and request headers. Hosting, authentication, recognition, and catalog providers may keep operational or security logs under their applicable arrangements. Limited scanner diagnostics available in test builds contain timing and state information; the current app does not automatically upload that diagnostic report to a separate analytics service.

The current app does not include an advertising or third-party product analytics SDK, request precise device location, or request microphone access. App stores and operating systems may independently process installation, device, or diagnostic information under their own settings and notices.

### Communications and purchases

If you contact us, we receive the information you choose to send, such as your email, message, and attachments. Do not send passwords, access tokens, or private API keys.

A development “Simulate Pro” control does not collect payment information or create a paid subscription. We will explain any new purchase-related processing before enabling it. App stores handle their payment accounts; Chase does not ask for your full payment card number to display card estimates.

## 3. Why we use information

We use information to:

- Provide sign-in, online recognition, catalog lookup, card estimates, and the collection functions you use.
- Save local changes, synchronize eligible account data, resolve conflicts, and avoid duplicate processing or saves.
- Maintain access allowances, detect misuse, and protect the service and provider budgets.
- Troubleshoot failures, maintain reliability, and respond to support and privacy requests.
- Complete verified account-deletion requests and recover from interrupted deletion operations.
- Meet applicable legal obligations and establish, exercise, or defend legal claims where necessary.

We do not sell personal information or disclose it for cross-context behavioral advertising. We do not use your collection information to provide targeted advertising in the current service.

## 4. Providers and other disclosures

The principal services used by the current app are:

| Provider or recipient | Purpose and information involved |
| --- | --- |
| **Supabase** | Authentication, technical guest sessions, hosted recognition processing, account collection storage, scanner usage records, and deletion processing. Relevant information includes identifiers, account information, uploaded images while being processed, and the stored metadata described above. |
| **CardSight** | Recognizing cards from uploaded images. Our recognition request sends the card image using our service credentials; the app's recognition transport does not intentionally attach your Google email, name, or Chase account identifier to that vendor request. |
| **TCGdex and its asset delivery services** | Catalog information, artwork, and available provisional quotes. Direct requests expose your network address and requested catalog or image resources; they do not intentionally include your Chase authentication credentials or complete collection. Catalog preloading can request resources before you open a particular set. |
| **Google** | Optional Google authentication. Google handles its sign-in process and shares authorized profile information with the authentication service. |
| **Apple, Google Play, and your operating system** | App distribution, installation, platform permissions, and any store services you use, under the relevant platform's own rules and privacy practices. |

Information sent to another provider is also subject to the applicable provider arrangements and its own processing practices. Provider operational logs, backups, image handling, and any use of images for model improvement must be considered separately from the records held in our scanner database. Contact us for information about the arrangements applicable to your use.

We may disclose information when reasonably necessary to comply with law, respond to lawful process, protect rights or safety, or investigate misuse. If the business is involved in a merger, acquisition, or similar transaction, information may transfer subject to applicable law and appropriate notice. This paragraph does not authorize selling personal information for advertising.

## 5. Camera permission and your choices

The app requests camera access for scanning. You can decline or revoke it in your device settings and continue using available non-camera functions. Leaving the scanning screen stops new camera sampling; a request already sent can still finish processing and create a usage record. The torch control uses the camera's light and does not require microphone access.

You can browse supported features as a guest. Online functions still require internet and technical service access. You can choose whether to create a registered account, import guest cards, save pending scans, or use available account synchronization functions. Revoking a sign-in provider's permission does not automatically delete all information already stored by Chase.

## 6. Storage and retention

Information is kept according to its purpose, the features you use, and applicable obligations. The following describes the current implementation, not a promise of immediate deletion from every provider system:

| Category | Current handling |
| --- | --- |
| **Camera files on the device** | Temporary capture and processing files are used for scanning. The app attempts to remove them after processing, including failed or canceled work; operating-system cache cleanup may finish later. Pending cards use identification metadata and catalog artwork rather than saved camera photos. |
| **Images in hosted scanning** | Images pass through the hosted service for recognition. The application does not intentionally archive them in its scanner database, Supabase Storage, or application logs. Provider-side handling, logs, and backups require separate consideration. |
| **Local collections, Organize, and preferences** | Remain on the installation until changed or removed through available controls, local account cleanup, or platform storage management. Logging out preserves local account caches. Platform backups and secure credential storage can follow different deletion rules. |
| **Registered cloud account and collection** | Retained for the account and synchronization, including conflict/version and operation records, until account deletion or applicable administrative removal. Removing an individual card can leave a deletion marker and operation history to prevent an older offline edit from restoring it. |
| **Scanner identity and usage records** | Include guest or registered identifiers, usage counters, image hashes, and normalized request results. Registered account deletion removes its associated active scanner records. Guest scanner identities and usage records do not currently have an automatic expiry schedule; they remain until applicable administrative removal. Contact us to request review or deletion of information associated with guest scanning. Clearing app data alone does not delete those cloud records. |
| **Deletion recovery records** | The service keeps an operation identifier and hashed recovery information so it can confirm an interrupted deletion after the account is gone. The record does not store the plaintext recovery proof, email, or raw user identifier. These records expire after seven days and are purged on later recovery-record lookups; a scheduled immediate purge at day seven is not currently implemented. The device retains its private recovery state until cleanup completes or platform storage is removed. |
| **Aggregate usage, provider logs, and backups** | Shared service usage counts may remain after an account is deleted. Operational logs, provider backups, legal preservation, and support correspondence may have separate retention periods; account deletion is not a representation that all such copies disappear at once. |

Retention can differ between our active records and providers' operational systems. You may contact us for retention information and requests concerning your data. Any exception to deletion must have a valid purpose and comply with applicable law.

## 7. Account deletion and privacy requests

Registered users can request deletion in **Profile → Delete Account**. The app explains the consequences and requires explicit confirmation. It may require a recent Google sign-in. Successful remote deletion removes the registered authentication account, its active cloud collection, and associated account scanner records. The app then removes that account's local collection cache on the requesting installation.

Deletion does not delete your Google account, guest collection, pending Organize cards, installation-wide save records, or all cached copies on other offline devices. A request that cannot be confirmed is retained for recovery rather than presented as completed. Keep the installation available while resolving an interrupted request.

You can also contact **[PRIVACY_EMAIL]** about access, correction, deletion, or other privacy concerns. Depending on applicable law, you may have rights to receive a copy of personal information, request portability, object to or restrict certain processing, withdraw consent, or appeal a decision concerning a request. You may also have a right to complain to an appropriate supervisory authority. Not every right applies in every jurisdiction or to every record.

We may need reasonable information to locate records and verify that a request is yours, particularly for a guest session. Do not send authentication tokens or private credentials. We will respond in accordance with applicable law, explain any valid exception, and will not unlawfully discriminate against you for exercising your rights. A manual request process is separate from any future in-app export feature.

## 8. Security

We use measures designed to protect information, including encrypted transport, server-verified authentication, account-specific database access controls, and operating-system secure storage for native authentication credentials. Browser versions use browser storage for session persistence. Ordinary app data and caches do not all have the same protections as secure credential storage.

No system is completely secure. Protect your device, review account access, and contact us if you suspect a security issue. We do not ask you to send passwords or private tokens to support.

## 9. International processing and legal bases

BluePeak is based in the United States. Service providers may process information in the United States or other countries, which may have different privacy laws from your location. The actual hosting region and provider arrangements determine where processing occurs. Contact us for details applicable to your information. We will use safeguards required by applicable law for covered international transfers. You can contact us for information about applicable safeguards.

Where laws such as the GDPR or UK GDPR apply, the relevant bases may include performing the service contract for requested functions; legitimate interests in security, abuse prevention, reliability, and support where those interests are not overridden by your rights; consent where legally required; and compliance with legal obligations. Device permission and a legal basis for processing are related but distinct matters. Where processing relies on consent, you can withdraw it without affecting processing lawfully carried out before withdrawal.

## 10. Children

Chase is intended for people age **[MINIMUM_AGE]** and older. We do not knowingly collect personal information from children under 13, or below a higher age where applicable law requires it, without any legally required parental consent. If you believe a child has provided personal information inappropriately, contact **[PRIVACY_EMAIL]** so we can investigate and take appropriate action.

An app store age rating or a statement in this notice does not replace any consent or child-protection measure required by law.

## 11. Changes and contact

We may update this notice as features, providers, or practices change. We will identify the effective date and provide additional notice or obtain consent where required for a material change. Before introducing a new sign-in provider, paid data service, purchase flow, analytics tool, or materially different use of images, we will explain any relevant change to how your information is handled.

**BluePeak Global LLC**  
Wyoming, United States  
Mailing address: **[BUSINESS_MAILING_ADDRESS]**  
Privacy: **[PRIVACY_EMAIL]**  
Support: **[SUPPORT_EMAIL]**
