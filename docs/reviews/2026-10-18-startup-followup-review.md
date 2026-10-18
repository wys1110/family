# Family review follow-up — 2026-10-18

This completes the source review and reproduced-fault fixes following PR #175. It is not a claim that every production/device behavior is tested. The earlier report remains a dated snapshot; this report closes its startup and remaining-module review items.

## Reproduced issues resolved

| Priority | Trigger and consequence | Change and evidence |
| --- | --- | --- |
| P1 | PR #175 generated per-entry backup photo subdirectories, but the existing restore RPC accepts only a single 64-hex filename. Photo-bearing restores failed validation. | Hash entry identity plus photo digest into one stable filename. Execute the actual browser helper output against the current SQL in PGlite; failure reproduced before the fix, success after it. No schema change. |
| P1 | A local todo import awaits an upsert while local edits continue; success can discard those edits when clearing local storage. | Reject mutations while loading/importing, preserve local rows on returned/thrown errors, release loading for retry. Local backup preflights the same guard before mutating any other table. |
| P1 | Household-only local todo keys let different accounts in one browser access each other's fallback private tasks. | Scope keys by user and household. Remove automatic adoption of unscoped keys. Old stored bytes are left untouched but are not displayed or uploaded under an unverifiable owner. |
| P2 | Startup waits for the previously selected travel/settings tab before displaying core data. | Resolve core readiness independently; restore the saved tab after initial context through the regular tab loading/retry flow. Core handlers must be installed before enabling interaction. |
| P2 | Delayed restoration can override a newer user tab choice; a second bootstrap while restoration is pending can leave all views hidden. | Clear initial intent on tab clicks, cancel obsolete requests, and return to calendar if context changes during loading. Test actual render-before-context ordering. |

## Performance evidence

Controlled Chrome viewport 390 × 844, local demo, baseline `a6e5060`, candidate from this change. Both routes imposed a 3,000 ms response delay on `travel-data.js`; all assets used no-store. One paired browser run after correcting MIME types:

| Event | Before | After |
| --- | ---: | ---: |
| First completed bootstrap (`familycontextchange`) | 3,683 ms | 525 ms |
| Travel view visible | 3,692 ms | 3,589 ms |

This removes a dependency from core startup; it does not make the delayed travel resource itself faster. These are controlled local timing observations, not statistically sampled mobile/network or authenticated production latency. During a second after-run (308 ms bootstrap), clicking Growth while travel was still pending kept Growth selected after the delayed resource completed.

The test-only fixture is `/tmp/family-startup-benchmark-20261018/server.py`. It archives the baseline under `/before/`, serves the working checkout under `/after/`, injects the saved-travel preference and visible event-timing output before config, and delays the travel module response. It is not shipped in the app. PR #175's committed travel-data benchmark remains separately reproducible.

## Review coverage

| Area | Source/behavior reviewed | Verification boundary |
| --- | --- | --- |
| Startup/navigation | Core/deferred loading, user intent, auth context, settings/admin restore, failure/retry | Async regressions plus 390px browser timing/navigation |
| Calendar/todos | CRUD, drag serialization, month/week/list/upcoming views, recurrence, import, privacy | Existing suite plus new import/error/scope/backup tests; demo create/complete |
| Growth/photos/travel | Save context guards, shared-photo deletion, draft revisions and mutation retry, normalization | PR #175 regressions and benchmark; browser point selection and three growth series |
| Auth/settings/server | Auth expiry/recovery/logout, backup format/restore, media, SQL validation, admin RPC ACL, places authentication/household guard | Source review and focused tests; browser-helper-to-SQL integration; no live DB writes |
| Stories/search/notifications | Speech lifecycle, search routes, reminder scope/loading, realtime/polling, briefing and event-change hooks | Source review and focused regression suites; device delivery not exercised |
| Album/PWA/Android | Pagination, viewer preloads, share/signed-URL cache, worker fetch/push/click, asset preparation | Source review and automated checks; device rendering/notification behavior untested |

## Validation and limits

- `npm test`: 118 files / 665 tests passed.
- `npm run check`: theme-color guard, JavaScript syntax and TypeScript checks passed. Additional `node --check settings.js` and diff whitespace check passed.
- Independent startup review found the cancellation/blank-screen issue above; the realistic reproduction failed before the fix and passed after it.
- Local demo calendar/todo creation and completion, settings restoration, travel restoration, user navigation and growth point selection were inspected. No captured console errors in checked browser flows.
- Previous browser-only fallback tasks under unverifiable old keys are intentionally not auto-claimed. Remote tasks are unaffected; old bytes remain in browser storage.
- Actual iPhone Safari, Android device use, push/audio behavior, authenticated live saves/restores/deletes and simultaneous production clients remain untested.
- Shared-photo reference lookup and deletion are not one transaction; an older concurrently attaching client can race deletion. Stale upload completion may leave an orphaned object. Both limits from the first report remain.
- Deployment status is recorded after publishing; passing local checks is not deployment evidence.
