# Family code and performance review — 2026-10-18

The first batch fixes reproduced data-loss paths and avoids unnecessary startup work. It does not conclude the whole-app audit. Expected load is a family account, including the supported maximum of 500 items in a 365-day travel plan; this is not a large-scale service benchmark.

## Findings and changes

| Priority | Trigger and consequence | Resolution |
| --- | --- | --- |
| P1 | Account, household, baby or editor intent changes while a growth photo upload/save awaits; completion can use a new context or replace its UI. | Capture client, identity, bootstrap generation and form/photo draft; check them across asynchronous boundaries. Stale completions cannot update the new UI. |
| P1 | An old travel draft saves after realtime has updated the sharing cache; the cache's newer revision previously authorized overwriting newer content. | Compare the draft's expected revision, update only the changed trip, retain committed mutation-ID idempotence. |
| P1 | Restored records with identical photos shared one storage object; deleting one record removed the other record's photo. | New restores use stable per-source-entry paths. Removal queries remote references before deleting originals and thumbnails; failed lookups leave objects intact. |
| P2 | Date normalization repeatedly constructs a full trip date array for each item. | Compute the requested UTC date directly and retain bounds validation. |
| P2 | Unopened tabs load styles and admin operations eagerly; deferred scripts are discovered one network round trip at a time. | Reserve stylesheet cascade positions without URLs, prepare a tab's styles and script preloads together, then execute scripts in existing dependency order. Admin operations load with the admin group. |
| P2 | An obsolete growth modal and icon replacement modules still load and observe DOM mutations alongside the inline chart. | Delete five unused assets and three observers; render the same accessible action icon directly. |

## Performance evidence

- Initial requests: four deferred styles plus admin operations postponed; five obsolete assets removed. Ten fewer initial asset requests when no deferred tab is selected.
- Deferred bytes: 95,633 raw CSS bytes and 19,945 raw admin-operation JavaScript bytes. Deleted obsolete assets: 40,395 raw bytes. These are source sizes, not compressed transfer sizes or measured mobile latency.
- Deferred downloads can overlap through preload discovery; execution remains serial. Failure tests prove a failed prerequisite prevents dependent evaluation and allows retry.
- Five-run median, baseline `4addf04` versus this branch: 500-note/365-day initialization **210.79 → 4.50 ms**, one item update **949.29 → 20.63 ms**. Fresh Node VM contexts use identical fixtures and in-memory storage. It measures normalization/local update, not network or authenticated Supabase latency. Reproduce with `node scripts/benchmark-travel-data.mjs`.

## Verification

- `npm test`: 116 files / 652 tests passed.
- `npm run check`: theme guard, JavaScript syntax and TypeScript checks passed.
- `node --check growth-inline-chart.js` and `git diff --check` passed.
- Controlled asynchronous tests cover account/bootstrap/form/photo changes, failed writes, shared-photo retention, retry paths, stale travel drafts and UUID-remapped create/import operations.
- Local 390px demo browser: calendar, growth, travel, stories and settings render; no captured console errors. Growth addition, three simultaneous series and selecting a point's values verified. Public combined chart also inspected. No live family records were changed.

## Remaining scope and limits

- Startup still waits for the full core module chain and saved deferred-tab restoration (bounded by the existing timeout). Core modules patch rendering, navigation and deletion handlers, so removing that wait blindly is unsafe. Next focused change should separate core readiness from saved-tab restoration after bootstrap's context event, while preserving user navigation and cancellation.
- Photo reference lookup and storage deletion are separate operations. A concurrently attaching older client could race cleanup; no schema or transactional storage changes were made.
- An in-flight upload during an account switch can leave an orphaned object. Cleanup intentionally stops after context changes.
- Calendar/todo, settings/admin, authentication/server functions and production multi-client behavior have not received a full behavioral audit in this batch. Passing the existing suite is not proof of all production flows.
- Actual iPhone Safari, authenticated Supabase saves, live restore/delete and Android device behavior remain untested. Deployment checks are reported separately after publishing.
