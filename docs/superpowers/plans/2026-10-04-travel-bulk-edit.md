# Travel bulk place editing implementation plan

> For agentic workers: execute this focused plan inline with executing-plans. User selected the proposed multiple-place date move and visited status feature.

**Goal:** Select several places and move their date or set their visited status together.

**Architecture:** Add two explicit data operations that each use one existing revision-checked trip commit. Keep selection in the travel screen, separate from persisted trip records. Render native checkboxes and a compact bulk action form above the itinerary.

**Tech Stack:** Existing vanilla JavaScript, native HTML controls, Vitest, Leaflet map controller and family sharing save API.

## Global constraints

- Only places are selectable; notes remain unchanged.
- One mutation increments the trip revision once and saves once. Invalid/stale selections and failed saves leave original data intact.
- Moving places appends them after existing destination records in their original itinerary order. Places already on the chosen day retain their order.
- Selection can span day tabs. “현재 목록 선택” selects the visible places; “선택 해제” clears all.
- Applying an operation retains selection for a follow-up operation. “선택 끝내기”, changing the trip, returning to the catalog, or changing family clears selection.
- The bulk date selector includes the undated inbox. Explicit visited / unvisited operations replace per-place toggling for bulk actions.
- Preserve dot-only history map, existing edit dialogs and user-owned untracked files. No schema or permission changes.

### Task 1: Atomic place mutations

Files: `travel-data.js`, `test/travel-bulk-edit.test.js`.

Interfaces: `movePlaces(tripId, itemIds, dayIndex)` and `setPlacesVisited(tripId, itemIds, visited)` return the updated trip. `dayIndex` is an integer within the trip duration or null. `visited` is a boolean.

- [x] Write failing tests for destination ordering, inbox moves, explicit visited state, unchanged notes, invalid selections, reload persistence and rejected shared saves.
- [x] Run `npx vitest run test/travel-bulk-edit.test.js`, verify failures are missing APIs.
- [x] Validate selections inside `updateLocal`, update selected places in one updater, and use the existing `commit` path.
- [x] Re-run focused tests and confirm one revision/save per operation.

### Task 2: Selection and bulk action UI

Files: `travel.js`, `travel.css`, `config.js`, `index.html`, cache-version contract tests.

- [x] Add screen-only selection set, start/end buttons, labeled native checkboxes, selected count, visible-list selection and clear selection controls.
- [x] Add a native form with a target date selector and separate move/visited/unvisited buttons. Disable actions when no places are selected and during save. Show success/errors inline while retaining selection for retry or the next operation.
- [x] Keep selection across day tabs, reconcile selected IDs on refresh, and clear it when leaving the trip or family.
- [x] Update asset revisions. Run focused travel tests, `npm test`, `npm run check`, and `git diff --check`.
- [x] In generic demo browser data, select places across days, set visited, move to one date/inbox, reload and verify notes unchanged. Check 390/375px and desktop layouts, keyboard selection, map/card synchronization, catalog filters and summary navigation.
- [x] Request a fresh code review. No actionable findings; focused travel tests passed.
- [ ] Commit/push, attach PR, merge after checks, and verify deployment assets and live demo interaction.

## Verification evidence

- Full suite: 484 tests in 97 files passed. `npm run check` and `git diff --check` passed.
- Generic demo UI: cross-day selection, explicit visited/unvisited, day and inbox moves, reload persistence, unchanged note, keyboard Space selection and 375/390/1440px layouts verified.
- Summary map still renders text-free dots. Selection resets when returning to the catalog.
- Fixed explicit null day normalization after a failing regression exposed inbox records reverting to their old date.
