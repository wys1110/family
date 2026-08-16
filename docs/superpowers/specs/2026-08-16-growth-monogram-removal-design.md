# Growth Monogram Removal Design

## Problem

The growth profile card still renders a rounded initial tile such as `도` over the selected wallpaper. The tile repeats the baby's name, blocks a meaningful part of the photograph, and makes the wallpaper feel like a background behind UI rather than the main visual.

## Design

- Remove the baby monogram element from the growth profile markup in every state.
- Remove the runtime assignment that writes the first character of the baby's name into that element.
- Remove the obsolete `.baby-monogram` base and mobile CSS instead of retaining hidden compatibility code.
- Change the base profile header from three columns to two columns: profile copy and D-day.
- Without a wallpaper, allow the profile copy and edit button to align naturally from the card's left content edge.
- With a growth wallpaper, preserve the former monogram footprint as an image-only safe zone:
  - Desktop: `72px`, matching the removed `58px` tile plus `14px` gap.
  - Mobile: `63px`, matching the removed `52px` tile plus `11px` gap.
- Apply the same wallpaper-only safe-zone offset to the profile header and profile edit button so the text does not slide over the part of the photograph that has just been uncovered.
- Keep the D-day, birth date, name, age, photo actions, contrast scrim, text shadow, and translucent controls unchanged.

## Behavior

- The monogram is never rendered, whether a wallpaper exists or not.
- Adding, changing, removing, or failing to load a wallpaper continues to use the existing `.has-wallpaper` state.
- When `.has-wallpaper` is absent, the default card uses the compact two-column layout without an artificial empty slot.
- When `.has-wallpaper` is present on the growth card, the left safe zone reveals the photograph while metadata remains at its current visual starting position.
- The existing wallpaper editor remains the only mechanism for crop, zoom, and positioning.

## Delivery

- Rotate the affected base stylesheet, wallpaper stylesheet, `config.js`, and `app.js` cache keys so mobile and installed PWA clients receive both the markup/runtime cleanup and the layout update together.
- Do not change Supabase schema, storage objects, wallpaper records, crop metadata, or upload/delete behavior.

## Verification

- Add regression coverage proving `babyMonogram` and `.baby-monogram` no longer exist in markup, runtime code, or styles.
- Add layout coverage for the two-column base header and the wallpaper-only desktop/mobile safe-zone values.
- Preserve existing wallpaper tests for one sharp image, saved crop, scrim, pseudo-element cleanup, and photo actions.
- Run focused growth/wallpaper tests, repository checks, and the full test suite.
- After deployment, inspect the growth card at 390-pixel width with and without a wallpaper in white and dark themes, verifying that the photo is uncovered and no console errors are introduced.

## Non-Goals

- No automatic face detection or crop changes.
- No new profile-photo field or replacement avatar.
- No change to the calendar wallpaper.
- No typography, animation, database, or growth-record changes.
