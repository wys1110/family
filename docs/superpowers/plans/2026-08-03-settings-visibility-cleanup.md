# Settings Visibility Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide only the redundant refresh card and operational activity disclosure from the Settings UI while retaining their code paths and behavior.

**Architecture:** Add a narrowly scoped CSS visibility policy under `#settingsView`, keep both dynamic modules intact, and bump the Settings stylesheet cache version. Add a source-level regression test for the policy and module preservation.

**Tech Stack:** Static HTML/CSS/JS, Vitest, TypeScript checks, GitHub Pages.

## Global Constraints

- Keep functionality code intact; this is a Settings-only visibility change.
- Keep white/dark theme, calendar font size, family schedule notifications, and feeding reminder visible.
- Work only in the isolated `codex/settings-cleanup` worktree; preserve unrelated changes in the main checkout.
- Verify locally and in the deployed browser before integration.

## Task 1: Add the failing visibility contract

**Files:** `test/settings-visibility-cleanup.test.js`

- [x] Add a focused test that reads `settings.css`, `settings-refresh.js`, and `activity-log.js`.
- [x] Assert `#settingsView > [data-settings-refresh-module]` and `#settingsView > [data-activity-disclosure]` are explicitly hidden with `display: none` and `!important`.
- [x] Assert the refresh card creator and activity disclosure creator remain present, proving this is a visibility change rather than code deletion.
- [x] Run `npm test -- --run test/settings-visibility-cleanup.test.js` and confirm it fails before implementation.

## Task 2: Implement the minimal Settings-only hide

**Files:** `settings.css`, `config.js`, `test/demo-theme-settings.test.js`, `test/global-design-harmony.test.js`

- [x] Add the two direct-child selectors to `settings.css` with `display: none !important` and `pointer-events: none`.
- [x] Bump the Settings module version from `20260803-production-two-themes-v1` to `20260803-settings-visibility-v1` so clients fetch the new stylesheet.
- [x] Update only the cache-contract assertions that intentionally track this version.
- [x] Re-run the focused test and confirm it passes.

## Task 3: Verify the repository and UI

- [x] Run `npm test -- --run`.
- [x] Run `npm run check` and `git diff --check`.
- [x] Start a local server from this worktree, open Settings in the browser, and verify the two cards are hidden while theme/font/notification cards remain visible.
- [x] Stop the local server after browser verification.

## Task 4: Integrate safely

- [ ] Commit the isolated change with a focused message.
- [ ] Push `codex/settings-cleanup`, open a PR, and wait for CI.
- [ ] Request a code review and resolve any actionable findings.
- [ ] Merge only after CI and review pass, then verify the public Settings UI.
- [ ] Fast-forward the main checkout to `origin/main` while preserving its pre-existing dirty files and stashes.
