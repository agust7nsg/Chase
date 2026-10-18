# Chase design system

## Philosophy

Chase is a practical mobile card collection application. Give artwork and the next useful action the strongest emphasis. Use a light theme, a blue accent, native navigation, restrained surfaces, and clear typography. Home is a compact entry point to scanning and search; Collection combines an inventory wallet with the value-tracking display explicitly requested for the product.

The UI UX Pro Max mobile guidance informs touch targets, contrast, system text scaling, safe areas, feedback, and predictable escape routes. The product requirements take precedence over decorative defaults. Avoid gradients, glass effects, neon, oversized decorative panels, unrelated analytics, and unnecessary animation. One focused historical value curve is useful to the collection workflow.

## Color tokens

The source of truth is `src/theme/tokens.ts`.

| Token | Value | Use |
| --- | --- | --- |
| `background` | `#F6F7F9` | Soft neutral canvas |
| `surface` / `white` | `#FFFFFF` | Panels, search fields, and text on blue actions |
| `primary` | `#245DE8` | Primary action and active navigation |
| `primarySoft` | `#EAF1FF` | Quiet blue emphasis |
| `primaryDeep` | `#1845B8` | Contrast within the blue scan hero |
| `onPrimaryMuted` | `#E2EBFF` | Supporting text on the blue scan hero |
| `tintBorder` | `#D4E2FF` | Borders and capacity tracks on tinted surfaces |
| `warm` / `warmText` | `#FFF5DF` / `#805B16` | Restrained variant and Pro badges |
| `subtle` | `#F0F4FA` | Neutral status badges |
| `text` | `#172139` | Main content |
| `muted` | `#596579` | Supporting slate text with readable contrast |
| `border` | `#E1E5EC` | Subtle separators |
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

## Product composition

The Mobbin references provided by the user establish a standard of purposeful composition: Fitbit isolates the product, Mindtrip organizes discovery around content, Ro uses restraint, and Shopify prioritizes information and tasks. They are reference principles, not copied screens. Function determines the layout. Reusable controls do not imply a repeated page template.

- **Brand:** the lowercase `chase` wordmark and scanning-frame symbol are shared by introduction and Home. The stable identity comes from type, proportions, control treatment, contrast and terminology.
- **Prices introduction:** a horizontal carousel of Moonbreon, Charizard, Twilight Masquerade Greninja ex, Rayquaza and Giratina. Charizard starts centered with both neighbors visible. Native snapping and scroll-driven scale/rotation identify the centered printing; its name, set/number and sample USD quote sit centered below. The named selector buttons are removed. Quiet previous/next chevrons, keyboard arrows and native accessibility adjustment offer alternatives to swiping. There is no autoplay. Short screens retain prominent artwork and allow the whole page to scroll.
- **Scan introduction:** an upright print inside a dark viewfinder, with a compact name-and-price result. The visual communicates the operation instead of a motivational slogan.
- **Collection introduction:** Rayquaza VMAX over a soft green circle, an illustrative portfolio value and a rising monthly timeline with a positive change. The old two-printing price strip is removed. Values are explicitly examples, independent of catalog prices and owned cards; the actual wallet remains driven by its existing history service. USD/EUR formatting follows the global preference.
- **Home:** explicit scan and search actions, a digest of the actual collection, recent cards and working set-filter shortcuts. A blue Dragonite composition leads into scanning without a recurring scene template.
- **Wallet:** open typography-led valuation and native line chart, range controls, exact-value inspection, holding positions and allocation. It represents card copies and printings, not cash or trading orders. Empty wallets prioritize Browse/Preview instead of a blank graph. The sample preview is visually identified and reversible without changing saved data.
- **Catalog and inventory:** visible search labels, compact titles and useful controls above actual full-print images. No large promotional header. Inventory footer actions scroll with the list on short screens. Grids adapt to system text scaling.
- **Card detail:** a straight, isolated card on a cool surface; printing metadata, estimate, functional historical range controls and copy management. Edition/reference limitations remain visible.
- **Scanner:** a persistent camera-first dark surface with subtle alignment corners, brief compact card/result overlays, an explicit Demo recognition label and a fixed blue Organize counter. The optional real camera preview is independent of simulated detection. Results never replace the camera screen. Organize uses light compact rows, variant review, quantity controls, selection and explicit selected/all saves; it is temporary staging, not the portfolio.
- **Profile and Pro:** guest identity with Fusion Strike Mew VMAX 269/264 on lilac, Account, grouped settings, then a Chase Pro section with matching Explore/Restore rows. No membership capacity or scan-status summary in Profile. The Pro screen compares actual Free/simulated Pro access and distinguishes planned capabilities. Disconnected account actions remain secondary.

The native line chart supports touch/click inspection, previous/next date buttons, screen-reader adjustment, and keyboard arrow/Home/End navigation on web. Every selected point exposes date and USD value. Year-long axes include years. History uses one blue curve, with signed movement text/icons; color alone never carries the change. No candles, order book, forecasts or irrelevant analytics were added.

## Value-tracking honesty

Every estimate/history is explicitly simulated USD. The fixed sample date is October 1, 2026. Historical portfolio values apply current quantities to earlier sample prices; they are not realized gains, cost basis or actual past ownership. The calculation note explains that changing quantities recalculates the curve. Price/quantity changes preserve the same underlying domain rules and storage key. A sample preview must never change inventory or trial use.

## Contrast and responsive behavior

Artwork uses neutral/cool separation instead of matching every background to a Pokémon’s dominant color. Actual printing colors remain intact. Text/action contrast is evaluated against the composed background. Dark viewfinders use white and pale text; the rest of the interface remains light. No decorative gradients, glass, neon, remote fonts or animation are required.

Tall onboarding screens reserve safe space for actions while allowing explanatory content to scroll. Below 740px height, or with large system text, the whole page scrolls so fixed controls cannot reduce the body to a sliver. Each new step starts at the top. Native bottom insets protect the action area. Existing top/bottom native navigation and the three tabs remain intact.

Full-print images remain 600:825 references, with sources and limitations in `assets/chases/SOURCES.md`. The old `CollectorScene`, `CollectorMasthead` and landscape assets are retained historical components and are not used in active screens. Development Profile still provides **Preview onboarding** without resetting collection or scanner state.

## Visual emphasis and concise copy

Following the user's review, art and color regain prominence while wallet behavior remains intact. Onboarding uses a short function title and at most one brief supporting line; images, prices, controls and numbers carry the explanation. Remove step lists, repeated descriptions of intuitive actions and motivational copy. A concise Demo or Sample USD label preserves prototype honesty without becoming paragraphs of repeated caveats. Detailed methodology and edition/reference limitations remain available through information controls.

Dragonite is prominent in the Home scan composition and onboarding viewfinder. Profile displays the alternate-art Mew VMAX 269/264 card on lilac, clearly separated from the blue Home hero. Cards keep their original colors and full aspect ratio; cool and deep-blue backgrounds provide separation. These are distinct compositions, not a repeated fan or shared landscape applied to every screen. Functional catalog and wallet screens prioritize actual cards, values and actions over instructions.

Collection’s existing currency badge is an actionable blue shortcut with unchanged visual size and position. It and the Profile currency row open the same compact USD/EUR modal, with radio selection, a close control and a single sample-rate caption. Currency labels and all monetary displays follow the saved choice; percentages and card artwork do not change.
