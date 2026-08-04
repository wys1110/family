# Settings Notification Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide unused notification and operational cards from the Settings UI while preserving notification functionality outside that UI.

**Architecture:** Extend the existing `#settingsView` CSS visibility policy to the two dynamically-created notification cards. Keep all notification modules loaded and bump only the Settings asset version so clients fetch the new stylesheet.

**Tech Stack:** Static HTML/CSS/JS, Vitest, TypeScript checks, GitHub Pages.

## Global Constraints

- Settings UI only: do not delete notification modules, storage, service-worker behavior, or the top notification center.
- Hide exactly four cards: refresh, activity disclosure, family schedule notifications, and feeding reminders.
- Keep family profile, white/dark theme, and calendar font-size settings visible.
- Preserve unrelated dirty changes in the main checkout by working in this feature worktree.

## Task 1: Extend the failing visibility contract

**Files:** `test/settings-visibility-cleanup.test.js`

- [x] Add `daily-briefing.js` and `feeding-reminder.js` source reads.
- [x] Change the visibility test name and assertions to require `#settingsView > #dailyBriefingSettings` and `#settingsView > #feedingReminderSettings` hidden with `display: none !important`.
- [x] Assert both notification card creators remain present (`card.id = "dailyBriefingSettings"`, `card.id = "feedingReminderSettings"`, and `settingsView.appendChild(card)`).
- [x] Run `npm test -- --run test/settings-visibility-cleanup.test.js` and confirm RED because the new CSS selectors do not exist yet.

## Task 2: Add the minimal Settings-only CSS policy

**Files:** `settings.css`, `config.js`, `test/demo-theme-settings.test.js`, `test/global-design-harmony.test.js`

- [x] Add the two notification IDs to the existing selector group:

```css
#settingsView > #dailyBriefingSettings,
#settingsView > #feedingReminderSettings {
  display: none !important;
  pointer-events: none !important;
}
```

- [x] Bump `{ name: "settings", version: "20260803-settings-visibility-v1" }` to `20260804-settings-notification-cards-v1`.
- [x] Update only the two cache-contract tests that assert the Settings module version.
- [x] Run the focused test and confirm GREEN.

## Task 3: Verify behavior

- [x] Run `npm test -- --run`.
- [x] Run `npm run check` and `git diff --check`.
- [x] Open the demo Settings view and verify the four cards are absent/hidden while family profile, theme, and calendar font settings remain visible.
- [x] Confirm the top notification button remains available outside Settings.

## Task 4: Integrate

- [ ] Commit and push the feature branch.
- [ ] Open a PR, wait for CI, request code review, and merge after approval.
- [ ] Verify Pages deployment and the public Settings view.
- [ ] Fast-forward/sync main while preserving its pre-existing dirty changes.
