# Chase design system

## Philosophy

Chase is a practical mobile card collection application. Give artwork and the next useful action the strongest emphasis. Use a light theme, a blue accent, native navigation, restrained surfaces, and clear typography. Home is a compact entry point to scanning and search; Collection is an inventory wallet rather than a trading dashboard.

The UI UX Pro Max mobile guidance informs touch targets, contrast, system text scaling, safe areas, feedback, and predictable escape routes. The product requirements take precedence over decorative defaults. Avoid gradients, glass effects, neon, oversized decorative panels, analytics charts, and unnecessary animation.

## Color tokens

The source of truth is `src/theme/tokens.ts`.

| Token | Value | Use |
| --- | --- | --- |
| `background` / `white` | `#FFFFFF` | Main canvas and text on primary actions |
| `surface` | `#F5F7FA` | Secondary panels and input backgrounds |
| `primary` | `#2563EB` | Primary action and active navigation |
| `primarySoft` | `#EFF6FF` | Quiet blue emphasis |
| `text` | `#111827` | Main content |
| `muted` | `#596579` | Supporting content; slightly darker than the initial gray for contrast |
| `border` | `#E2E8F0` | Subtle separators |
| `success` | `#166534` | Success messages paired with text |
| `danger` | `#B91C1C` | Error and destructive action text |
| `scanner` | `#14213A` | Dedicated scanner frame, within the light application |
| `scannerMuted` | `#B8C7DD` | Supporting scanner text |

Do not rely on color alone to communicate status or access. Pair it with words and icons. Body text needs at least 4.5:1 contrast; large text needs 3:1.

## Typography

Use the native system typeface with system font scaling enabled. Avoid a remote font dependency. Text styles are centralized in shared UI components:

| Style | Size / line height | Weight |
| --- | --- | --- |
| Screen title | 32 / 39 | 700 |
| Section heading | 20 / 28 | 600 |
| Body | 16 / 24 | Regular |
| Caption | 13 / 19 | Regular |
| Eyebrow | 12 / 18 | 700, restrained tracking |
| Large price | 36 / 44 | 700, tabular numbers |

Allow long names, descriptions, and action labels to wrap. Use captions for supporting content rather than shrinking primary text. Monetary values display an explicit USD context and retain the estimate disclaimer.

## Spacing and shape

Use the spacing scale `4, 8, 12, 16, 24, 32, 48`. Typical screen padding is 24; content stacks use 16–24. Shared screen containers scroll on small screens, respect safe areas, and cap readable width on larger displays.

Use radii `6` for badges, `12` for controls, and `16` for secondary panels. Borders are 1px and subtle. Avoid adding shadows as decoration. Card artwork retains its aspect ratio and reserved layout space.

## Component standards

- One primary action per screen context. Secondary actions use soft blue or a quiet text treatment.
- Touch targets are at least 48 logical pixels wherever custom controls are used. Keep neighboring targets separated. Buttons use a minimum height of 52.
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
