# Travel history map preview

Screenshots use synthetic local demo records, never authenticated family data. Production demo seeds remain unchanged.

- `mobile-390.jpg`: 390×844, 제주 dot selected; two trips including one archived record.
- `desktop-1440.jpg`: 1440×900, 부산 dot selected.
- Also checked 375×812: all history pins inside map bounds, no horizontal overflow after resizing.

Local smoke fixture: 제주 twice (33.4, 126.5), 부산 (35.15, 129.16), 도쿄 (35.68, 139.76), 강릉 without coordinates. All five synthetic trips span 2026-09-01–2026-09-03, giving five past trips, ten nights and four destinations. Existing future 오키나와 demo is excluded from history. Fixture is supplied only by an ephemeral local server; it is not included in app assets.

Updated on 2026-10-03 to show only 14px dots (18px when selected), with no marker text or hover title. The 44px interactive target, accessible destination labels, and details below the map remain.

Confirmed loaded OSM tiles, selected trip names/dates, simultaneous history/itinerary maps, missing-location notice, and history-only resize refit. Unmodified demo on a separate local origin confirms empty-history text with no fake pins while the itinerary map remains usable.

Validation: 476 tests in 95 files, `npm run check`, and `git diff --check` passed. Read-only code review found a detached error-status regression; wrapper-replacement test failed before the fix and passed afterward. Final review found no blockers. Physical iOS/Android and authenticated family UI were not tested.
