# Chase brand assets

The user-approved concept is a white tilted C formed from overlapping card shapes on blue, with a pale-blue rear card. It represents Chase; no Pokémon character, logo or price is built into the mark. The product focus is revealing a pulled card's estimated value. The scanner's existing card/price animation is intentionally unchanged.

- `icon.png`: 1024 × 1024 opaque RGB PNG of the approved icon; no baked-in OS corner mask. Used by Expo's icon configuration and web favicon generation.
- `mark.png`: transparent 1024 × 1024 extraction of the approved symbol, used by both native and animated startup. Its transparent padding is intentional.
- `adaptive-foreground.png`: transparent 1024 × 1024 Android foreground, with extra padding so the visible symbol fits inside the central 66/108 safe circle. Android applies the final circle/squircle mask over `#245DE8`.

The approved source was generated in this conversation (`exec-470009f5-af27-4b7f-8b39-100b3cd5eab3.png`); the transparent mark was extracted with the image-generation tool (`exec-78ea647b-7b7c-4e04-a0fd-eebb4ce65d3f.png`). Final PNG dimensions/encoding were exported for Expo. The unused extraction experiments are not part of the application.

Rebuild/install the APK or iOS app to see the launcher and native splash changes. Expo Go retains its own native launcher/startup. `npm run test:splash` covers normal/reduced motion, offline startup, navigation/reload, storage recovery and an unavailable local mark without changing saved data. Native Android/iOS launcher masks and launch handoff still need physical-device verification.
