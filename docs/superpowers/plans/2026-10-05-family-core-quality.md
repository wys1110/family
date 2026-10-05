# Family Core Quality Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent tasks and review the integrated branch.

**Goal:** Make all five tabs support the essential find, edit, and return-to-work flows of established consumer apps.

**Architecture:** Extend existing renderers and native controls. Keep current data saving, access checks, and design tokens. No new dependencies, database changes, compatibility layers, or private data fixtures.

**Tech Stack:** Vanilla JavaScript, native HTML controls, existing CSS, Vitest, browser verification.

## Global constraints

- Preserve unrelated `.superpowers/` and `HANDOFF.md` files.
- Verify demo separately from authenticated family persistence.
- Root owns app.js, index.html, travel.js, shared navigation/styles and versions; story and settings workers have non-overlapping files.
- No worker commits; root reviews and integrates through GitHub PR.

## 1. Calendar and growth (root)

Files: app.js, index.html, nova-family.css, test/core-record-filters.test.js.

- [x] Add a failing VM check for month-overlapping events and inclusive growth date/category filters; run `npx vitest run test/core-record-filters.test.js`.
- [x] Add calendar month/list buttons and member select. Feed the same member-filtered events into the grid, selected day and month list; list all month-overlapping records sorted by date/time and reuse existing edit dialogs.
- [x] Add native growth category and start/end dates. Combine with all/today/photo chips, reject reversed dates visibly, reset pagination when filters change and reset dates on baby/family change.
- [x] Run focused tests and inspect add/edit, empty result, member/date filters in browser.

## 2. Story continuation (story worker)

Files: english-stories.js, english-stories.css, test/english-story-progress.test.js.

- [x] Write and run a failing speech-mock check for interrupted continuation, completed story restart, stale callbacks, and account/demo storage isolation.
- [x] Store sentence progress per story/account/device in existing preferences. Add explicit continuation/restart controls and accessible progress status, never autoplay on tab entry. Preserve interrupted sentence and resume it. Fix speed change restarting at sentence zero and current-story completion label.
- [x] Run focused checks, node syntax check and report changes with unresolved limits.

## 3. Settings discovery (settings worker)

Files: settings.js, settings.css, settings-family-management.js, test/settings-search.test.js.

- [x] Write and run a failing DOM/VM check for search matching, clearing, and permission-hidden cards staying hidden.
- [x] Add search and heading-derived jump buttons for currently available cards. Use a separate search-hidden class, preserve existing hidden/access states; refresh discovery on tab open/context updates. Add empty result/reset and status count. Correct backup copy that advertises a hidden Excel card in demo.
- [x] Run focused checks, syntax checks and report results.

## 4. Travel and navigation (root)

Files: travel.js, travel.css, deferred-tabs.js or existing navigation owner, test/travel-itinerary-filter.test.js.

- [x] Write and run a failing behavior check for title/address/note search plus visited/unvisited filtering (notes only in all); same result drives map/list/bulk-visible selection.
- [x] Add itinerary search and visit select. Preserve typing focus, selected IDs, original reorder positions, clear filters when changing trip/family and show reset for no results.
- [x] Verify current tab ARIA/focus ownership; add only missing shared keyboard basics and correct travel selected state.
- [x] Run focused checks and browser search/status/no-result/select cases.

## 5. Delivery and evidence (root)

Files: config.js, index.html asset versions, docs/quality/2026-10-05-commercial-baseline.md.

- [x] Request independent spec and code review; resolve material findings.
- [x] Run `npm test`, `npm run check`, `git diff --check`.
- [x] Verify all five tabs in light/dark at mobile 390x844 and desktop 1440x1000, scrolling from top through bottom; record overflow, headings and bottom metrics. Test dialogs and continuation; save screenshots.
- [x] Document official comparisons, verified results and authenticated/server limitations; update changed asset cache versions.
- Delivery route: commit, push, create/attach PR, wait for CI, merge, verify published assets and public demo, then sync local main. Record final evidence in the PR and task report.
