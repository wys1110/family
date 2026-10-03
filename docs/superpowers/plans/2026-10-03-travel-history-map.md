# Travel history map implementation plan

**Goal:** Show past family destinations together at the top of the travel summary.

**Approved design:** One dot per destination without visible marker text. The user requested dots instead of labeled badges on 2026-10-03. Fit all recorded locations; selecting a dot shows the destination, visit count, trips and dates below the map. Exclude ongoing/future trips. Include archived history; list destinations with missing coordinates separately. Use saved destination coordinates or an actual scheduled place as the representative location; never invent coordinates.

**Architecture:** Enrich the existing past-trip aggregation in `travel-data.js`. Share the Leaflet loader but give history and itinerary separate map controllers in `travel-map.js`; `travel.js` manages their independent lifecycle and selection. Reuse existing theme tokens and bundled Leaflet.

**Tech stack:** Vanilla JavaScript, Leaflet 1.9.4, Vitest, existing PWA.

- [x] Add failing aggregation tests for repeated destinations, archived trips, invalid dates/coordinates, no coordinates, and planned trips.
- [x] Enrich summary with all history destinations and their recorded locations/trips; keep rankings unchanged.
- [x] Add failing map tests for independent controllers and history labels/selection/no route lines.
- [x] Implement separate controllers and history rendering, preserving itinerary behavior and retry.
- [x] Integrate summary map, missing-location text, trip details, and mobile styles; update asset versions.
- [x] Run relevant tests, full tests/check, review, and mobile/desktop demo UI including map selection and empty history.
- [x] Commit/push a reviewable PR. Publication follows the user's existing deployment authorization when applicable; otherwise present concrete validated result for final approval.
