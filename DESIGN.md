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

The interface uses authentic TCG printing images as its main visual material. Fourteen local WebP prints serve fifteen catalog variants. Original vector landscapes extend across the screen: lunar towers for Umbreon, open sky/water contours for Lugia and Rayquaza, warm terrain for vintage Charizard, botanical contours for the Base Set starters, and cosmic contours for Giratina, Gengar and Mew. These art palettes belong to one light interface, not selectable themes. Shapes use solid fills and fine strokes, with no gradients or decorative motion.

- **Onboarding:** full-width three-card compositions introduce vintage and modern chases; Lugia previews recognition, Giratina/Gengar/Magikarp show the range of collecting, and Dragonite illustrates the complimentary-scan introduction. Every printing stays entire. No example adds an owned card or consumes a scan.
- **Home:** a lunar fan of Umbreon, Lugia and Rayquaza flows into the primary scanner action. An open wallet row and two fixed editorial card-art features replace generic boxed modules. Editorial links open the real local card details; they are not personalized recommendations or live-market listings.
- **Collection:** a botanical cover displays up to three owned printings. Empty collections display illustrative classics with zero counts and no seeded ownership. A border-separated wallet summary, copy capacity and recent rows retain their original meaning.
- **My Cards and catalog:** full printing images with concise metadata beneath, no redundant artificial card frame. Images retain 600:825 proportions. The catalog opens with a fixed chase-art selection while the recognition mock preserves its original order. Search, layout toggles, sorting and quantity overlays remain functional. Full-width illustrated mastheads scroll within the FlatList; the list owns the gutters so edge artwork is not clipped. Large text switches the grid to one column.
- **Details:** the printing sits in its matching landscape with a small edition/art label. Price, quantity controls and removal confirmation remain separate and readable. Charizard explicitly discloses the first-edition reference versus a generic mock estimate; Reverse holo Pikachu discloses its representative standard-print image.
- **Profile, account information and Pro:** matching illustrated mastheads and a cosmic card fan carry the collector identity into secondary routes. Guest access, informational account states, a closeable paywall and development-only controls remain unchanged.
- **Scanner:** Ash-Greninja illustrates the inactive camera area with an explicit example label. Results show the actual bundled print within its landscape, while recognition remains a confirmed local simulation.

`src/data/cardVisuals.ts` owns presentation metadata and bundled image references. `CardPrint`, `CollectorScene`, `CollectorBackdrop` and `CollectorMasthead` share the image and landscape system. Assets, exact identities, edition limitations, source URLs and checksums are documented in `assets/chases/SOURCES.md`. Art for a printing never substitutes for proof of an owned edition, condition or market valuation.

All prices remain **illustrative USD**. Compact cards no longer say “Sample artwork” because they show actual TCG scans; simulated recognition and sample pricing remain explicitly labeled. No runtime image download, font dependency, new UI library, animation or camera permission was introduced. Native headers, safe areas, system text scaling, minimum touch targets and the existing three tabs remain intact.

The development-only Profile action **Preview onboarding** allows reviewing the introduction without deleting saved copies or resetting the scanner trial.
