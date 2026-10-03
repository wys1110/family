# Travel map verification — 2026-10-03

Generic local demo at `http://127.0.0.1:4173/?demo=1`; no authenticated family-data verification.

- 390×844 dark, 375×812 white, 1440×900 desktop dark: real OSM tiles and numbered markers render, no horizontal overflow.
- Marker → matching card highlight and scroll; card → map center without resetting zoom; list-only → card selection restores map and itinerary.
- Date selection filters pins; all-date pins distinguish days. Date/inbox route separation, missing-coordinate numbering, map reuse, tile retry and destroy covered by `test/travel-map.test.js`.
- CSS computed pin transform is `none`, avoiding a second offset on top of Leaflet's icon anchor.
- Screenshots: `mobile-dark.jpg`, `mobile-light.jpg`, `desktop-dark.jpg`.
- Physical iOS PWA/Android WebView and authenticated two-account flows were not tested in this change.

Pinned third-party source: https://registry.npmjs.org/leaflet/-/leaflet-1.9.4.tgz . License: `assets/vendor/leaflet-1.9.4/LICENSE`.
SHA-256 leaflet.js: `db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a`.
SHA-256 leaflet.css: `a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6`.
Tiles follow https://operations.osmfoundation.org/policies/tiles/ : visible attribution, normal browser referrer/cache, no tile prefetch or offline caching.
