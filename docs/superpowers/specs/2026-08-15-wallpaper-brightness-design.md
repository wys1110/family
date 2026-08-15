# Wallpaper Brightness Design

## Problem

Calendar and growth wallpapers are rendered under a shared contrast scrim. The current scrim is too strong for a photographic wallpaper: white mode reaches 72% black and dark mode reaches 82% black at the text edge. This protects text contrast but makes both cards feel muted and substantially darker than the selected image.

## Design

- Brighten both calendar and growth wallpaper surfaces by reducing the shared theme scrim variables.
- White mode changes:
  - `--theme-wallpaper-scrim-start`: `rgba(8, 8, 8, .46)`
  - `--theme-wallpaper-scrim-middle`: `rgba(8, 8, 8, .24)`
  - `--theme-wallpaper-scrim-end`: `rgba(8, 8, 8, .05)`
- Dark mode changes:
  - `--theme-wallpaper-scrim-start`: `rgba(4, 4, 4, .58)`
  - `--theme-wallpaper-scrim-middle`: `rgba(4, 4, 4, .32)`
  - `--theme-wallpaper-scrim-end`: `rgba(4, 4, 4, .08)`
- Keep the calendar's existing 105-degree left-to-right gradient.
- Keep the growth card's existing right-side fade to transparent so the photograph remains strongest at the image-focused edge.
- Keep white wallpaper text, text shadow, translucent controls, borders, saved crop, one-image rendering, and overlay-decoration cleanup unchanged.
- Apply the same values in the critical inline theme variables and `theme-critical.css` so the first paint and loaded theme cannot disagree or flash between brightness levels.

## Delivery

- Rotate the `theme-critical` and wallpaper stylesheet cache versions, plus the `config.js` query in `index.html`, so mobile and installed PWA clients receive the new values.
- Do not rotate unrelated JavaScript modules because runtime behavior does not change.
- Do not modify Supabase schema, storage, wallpaper records, or crop metadata.

## Verification

- Add regression coverage for the exact white and dark scrim values in both the inline critical theme and `theme-critical.css`.
- Preserve the existing tests for the calendar and growth gradient shapes, single `object-fit: cover` image, and active-wallpaper pseudo-element suppression.
- Run focused wallpaper/theme tests, repository checks, and the full test suite.
- After deployment, verify the public HTML, config, and stylesheets expose the new cache keys and scrim values.
- Inspect both calendar and growth surfaces at a 390-pixel mobile width in white and dark modes, with no new console errors.

## Non-Goals

- No per-card brightness control.
- No user-adjustable scrim slider.
- No change to wallpaper crop, zoom, positioning, upload, deletion, or persistence.
- No layout, typography, animation, or database changes.
