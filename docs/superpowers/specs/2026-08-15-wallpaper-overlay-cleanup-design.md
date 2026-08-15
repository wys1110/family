# Wallpaper Overlay Cleanup Design

## Problem

The calendar wallpaper renders as one sharp cover image, but the calendar hero's original decorative pseudo-elements (`♡ ✦` and the large outlined circle) remain above it. Those decorations make the wallpaper look like two illustrations are overlapping. The growth wallpaper already suppresses its equivalent decorations.

## Design

- Keep the single wallpaper image, saved crop, contrast scrim, text, and wallpaper action buttons unchanged.
- When the calendar surface has both `wallpaper-surface` and `has-wallpaper`, suppress the calendar hero's `::before` and `::after` content.
- Preserve the original decorations whenever no wallpaper is active.
- Match the existing growth-surface behavior instead of adding a new rendering mode or runtime branch.

## Verification

- Add a regression test proving both calendar and growth wallpaper surfaces suppress decorative pseudo-elements only in the wallpaper state.
- Run the focused wallpaper tests, full checks, and full test suite.
- After deployment, verify the public CSS contains the new selector and the calendar card still uses one `object-fit: cover` image.
