# Chase design system

## Philosophy

Chase is a practical mobile card collection application. Give artwork and the next useful action the strongest emphasis. Use a light theme, a blue accent, native navigation, restrained surfaces, and clear typography. Home is a compact entry point to scanning and search; Collection is an inventory wallet rather than a trading dashboard.

The UI UX Pro Max mobile guidance informs touch targets, contrast, system text scaling, safe areas, feedback, and predictable escape routes. The product requirements take precedence over decorative defaults. Avoid gradients, glass effects, neon, oversized decorative panels, analytics charts, and unnecessary animation.

## Color tokens

The source of truth is `src/theme/tokens.ts`.

| Token | Value | Use |
| --- | --- | --- |
| `background` | `#F7F9FC` | Soft neutral canvas |
| `surface` / `white` | `#FFFFFF` | Panels, search fields, and text on blue actions |
| `primary` | `#245DE8` | Primary action and active navigation |
| `primarySoft` | `#EAF1FF` | Quiet blue emphasis |
| `primaryDeep` | `#1845B8` | Contrast within the blue scan hero |
| `onPrimaryMuted` | `#E2EBFF` | Supporting text on the blue scan hero |
| `tintBorder` | `#D4E2FF` | Borders and capacity tracks on tinted surfaces |
| `warm` / `warmText` | `#FFF5DF` / `#805B16` | Restrained variant and Pro badges |
| `subtle` | `#F0F4FA` | Neutral status badges |
| `text` | `#142440` | Main content |
| `muted` | `#586982` | Supporting slate text with readable contrast |
| `border` | `#E3E9F2` | Subtle separators |
| `success` | `#166534` | Success messages paired with text |
| `danger` | `#B91C1C` | Error and destructive action text |
| `scanner` | `#14213A` | Dedicated scanner frame, within the light application |
| `scannerMuted` | `#B8C7DD` | Supporting scanner text |

Do not rely on color alone to communicate status or access. Pair it with words and icons. Body text needs at least 4.5:1 contrast; large text needs 3:1.

## Typography

Use the native system typeface with system font scaling enabled. Avoid a remote font dependency. Text styles are centralized in shared UI components:

| Style | Size / line height | Weight |
| --- | --- | --- |
| Screen title | 32 / 38 | 700 |
| Section heading | 20 / 28 | 600 |
| Body | 16 / 24 | Regular |
| Caption | 13 / 19 | Regular |
| Eyebrow | 12 / 18 | 700, restrained tracking |
| Large price | 40 / 48 | 700, tabular numbers |

Allow long names, descriptions, and action labels to wrap. Use captions for supporting content rather than shrinking primary text. Monetary values display an explicit USD context and retain the estimate disclaimer.

## Spacing and shape

Use the spacing scale `4, 8, 12, 16, 24, 32, 48`. Typical screen padding is 24; content stacks use 16–24. Shared screen containers scroll on small screens, respect safe areas, and cap readable width on larger displays.

Use radii `8` for badges, `14` for controls, and `20` for panels. Card stages and the scanner hero use `24` selectively. Borders are 1px and subtle. Only layered card stages use a restrained shadow to suggest physical cards. Card artwork retains its aspect ratio and reserved layout space.

## Component standards

- One primary action per screen context. Secondary actions use soft blue or a quiet text treatment.
- Touch targets are at least 48 logical pixels wherever custom controls are used. Keep neighboring targets separated. Buttons use a minimum height of 54.
- Use one icon family: Expo-compatible Ionicons. Icons accompanying visible text are decorative; standalone controls need accessible labels.
- Disable repeated submissions while an operation is pending. Confirm additions visibly so accidental repeated taps do not silently add copies.
- Inputs need a visible label or accessible name, an appropriate keyboard, and nearby errors. Placeholder text alone is insufficient.
- Inventory grids adapt to available width and remain usable with long card names. Quantity updates validate positive whole numbers and total-copy limits.
- Destructive collection removal requires confirmation. Real account deletion must also require explicit confirmation when implemented; a guest prototype must not claim to delete an account.

## Navigation

Use three labeled bottom tabs: Home, Collection, Profile. Secondary screens use the root stack and a visible back action. The dedicated scanner opens from Home; it is not a permanently active camera preview.

Onboarding offers a clear skip route. The Pro paywall always has an accessible close control that takes the user to Home. Account creation is never required to finish onboarding. Manual card search remains available to Free users.

## Accessibility and feedback

Use accessible roles, labels, selected/disabled/busy state, and meaningful image labels. Preserve native back behavior and system gestures. Check VoiceOver and TalkBack, large text, narrow screens, keyboard behavior, safe areas, and focus order on devices before release.

| State | Behavior |
| --- | --- |
| Empty | Explain the state and offer a relevant scan/search action |
| Loading | Display a progress indicator and disable duplicate operations |
| Success | Show the result or a clear local confirmation; do not invent a remote success |
| Error | Explain the failed operation beside the affected flow and provide a retry where appropriate |
| Storage failure | Explain that session changes may not be saved; avoid silently discarding saved data |
| Unfinished workflow | Clearly state what is not connected and allow a predictable return |
| Sample data | Label recognition, prices, artwork, and membership simulation explicitly |

Do not use motion as decoration. Any future animation must respect reduced-motion settings and communicate a real state change.

## Collector presentation

The visual pass preserves every route, the domain models, local storage, and the Free/Pro boundaries. It uses bundled artwork and adds no font, UI library, runtime image-download, or animation dependency.

- **Onboarding:** real Charizard Base Set Holo and English Ash-Greninja EX XY133 card scans in a layered showcase, a framed recognition preview, and a compact card-wallet composition. The price belongs to Charizard and is explicitly illustrative USD, never a live first-edition quote. A small progress marker, short introduction copy, and a quiet “Skip” action preserve the original flow. Static composition gives the cards presence without decorative animation.
- **Home:** a blue scanner hero with an inverse white action. Manual search stays secondary. The membership label is a quiet rectangular badge; there is no floating settings control.
- **Collection:** white value card, a blue top border, tabular totals, two clear inventory counts, and a compact Free capacity banner. Capacity counts copies and never hides owned copies after a downgrade.
- **My Cards and catalog:** compact tinted artwork without duplicated card names or variant footers inside the image; names, printing/variant details, and a single price live beneath the art. Quantities appear in a small overlay. Search and sorting share reusable controls.
- **Details:** a layered illustration stage, concise printing metadata, a focused price block, and unchanged copy-editing/removal confirmations.

Artwork hues are centralized in `CardArtwork`: peach for Charizard, amber for Pikachu, blue for Blastoise, green for Venusaur, sand for Eevee, and lilac for Mew. These identify illustrations visually without carrying essential product state. Artwork preserves its square aspect ratio. Full frames say “Sample artwork”; compact tiles say “SAMPLE”. Rows omit the tiny overlay and rely on the section's sample-data note and accessible image name.

Sample disclosure is concise rather than repeated in every module: scanner results remain explicitly simulated, prices are labeled Sample USD, and inventory sections disclose sample artwork/prices once. Account and payment screens remain honest about disconnected services. No disclaimer is replaced by a claim of real recognition, live prices, or successful purchases.

Native stack headers keep a back action and omit duplicate titles on inventory, search, and details. Those screens respect bottom safe areas without adding the status inset twice. Inventory and catalog headers scroll within the existing FlatList, leaving cards reachable on short landscape screens and with larger text. Large system text switches grids to one column, and information rows wrap rather than overflow. Sort selection remains available to native accessibility APIs and web ARIA.

System fonts remain intentional: no remote font request, native rendering, and text scaling enabled. Subtle tinted illustration backgrounds provide visual richness; larger panels remain neutral, and blue has a clear action hierarchy.

## Onboarding card showcase

`src/features/onboarding/OnboardingArtwork.tsx` owns the presentation-only featured card metadata and image compositions. Assets are bundled in `assets/onboarding`, retain their 600:825 aspect ratio, and show the entire printing without cropping. Source URLs, hashes, identities, and the distinction between English XY133 and the Japanese promo featuring Ash are documented in `assets/onboarding/SOURCES.md`.

Screen one pairs two authentic card images with a short Charizard price example. Screen two uses a static scan frame with a clearly labeled demo result. Screen three presents the pair above an example wallet row. The complimentary-scan screen uses the Charizard image with the existing simulation disclosure. All image descriptions include the card name and printing. No camera permission, catalog mutation, seeded collection, or trial consumption is introduced by these illustrations.

The existing development-only Profile panel includes **Preview onboarding**, so visual review does not require deleting local collection data. Closing the preview follows the original paywall-to-Home path and never resets the trial.
