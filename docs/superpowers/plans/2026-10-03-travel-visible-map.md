# Visible family travel map

Goal: Finish the previously approved real-map request on latest main.
Architecture: Replace the SVG projection with pinned, self-hosted Leaflet 1.9.4. Render OpenStreetMap tiles with visible attribution, on demand in the travel view only. Keep existing private trip storage and place search unchanged.

- [x] Add a runnable regression for numbered place markers (including missing coordinates), per-day routes without inbox connections, selection, instance reuse, and tile-error retry.
- [x] Replace travel-map.js render/project with render/mount/destroy. Preserve the Leaflet container across travel renders, refit only when trip/date/coordinates change, and connect marker selection to card highlighting/scroll. Keep dates separate and do not infer missing coordinates.
- [x] Make the mobile default show map above itinerary. Keep list-only toggle, native Leaflet zoom/pan and accessible 44px numbered markers. Lazy-load vendor JS/CSS; errors show retry while itinerary stays editable.
- [x] Update asset versions, run travel tests, full npm test, npm run check, diff check, and desktop/mobile light/dark browser checks with generic demo data.
- [x] Review the diff, commit and push a feature branch and open a PR. Main publication is a separate concrete approval step per the existing travel handoff.

Reference: docs/travel-planner-v1-handoff.md. Tile source uses the standard OSM endpoint with attribution, browser referrer/cache defaults, no tile prefetch or service-worker caching: https://operations.osmfoundation.org/policies/tiles/ . Leaflet API: https://leafletjs.com/reference.html . No paid service or database changes.
