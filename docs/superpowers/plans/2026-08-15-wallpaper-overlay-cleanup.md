# Wallpaper Overlay Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the calendar hero's legacy decorative overlays whenever a user wallpaper is active, without changing the saved crop, scrim, content, actions, or default no-wallpaper design.

**Architecture:** Keep the existing one-image wallpaper stack and solve the overlap entirely in the wallpaper stylesheet. Extend the existing growth-card pseudo-element suppression pattern to the calendar hero, then rotate only the affected stylesheet/config cache keys so mobile clients receive the fix.

**Tech Stack:** Static HTML/CSS/JavaScript, Vitest, GitHub Pages

## Global Constraints

- Preserve the single sharp `object-fit: cover` wallpaper image and the existing crop controls.
- Suppress calendar decorations only while `.has-wallpaper` is present.
- Preserve the default calendar hero decorations when no wallpaper is active.
- Do not change database schema, storage objects, wallpaper records, or runtime rendering logic.
- Preserve unrelated user-owned files and local changes.

---

### Task 1: Add Calendar Overlay Regression Coverage

**Files:**
- Modify: `test/household-wallpapers.test.js`

**Interfaces:**
- Consumes: `family-wallpapers.css` loaded as the test's `css` string.
- Produces: A regression assertion for the exact calendar wallpaper pseudo-element selectors.

- [ ] **Step 1: Write the failing test**

Add this test next to the existing growth wallpaper legibility test:

```js
test('removes legacy hero decorations from active calendar wallpapers', () => {
  const calendarSelector = '.hero-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="calendar"]';
  expect(css).toContain(`${calendarSelector}::before,`);
  expect(css).toContain(`${calendarSelector}::after { content: none; }`);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run test/household-wallpapers.test.js`

Expected: FAIL because `family-wallpapers.css` does not yet suppress the calendar hero's `::before` and `::after` decorations.

- [ ] **Step 3: Commit the failing regression test**

```bash
git add test/household-wallpapers.test.js
git commit -m "test: cover calendar wallpaper overlays"
```

### Task 2: Suppress Active Calendar Decorations and Refresh Assets

**Files:**
- Modify: `family-wallpapers.css`
- Modify: `config.js`
- Modify: `index.html`
- Modify: `test/household-wallpapers.test.js`
- Modify: `test/calendar-font-settings.test.js`
- Modify: `test/calendar-mobile-polish.test.js`
- Modify: `test/calendar-month-typography.test.js`
- Modify: `test/demo-theme-settings.test.js`

**Interfaces:**
- Consumes: `.hero-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="calendar"]` applied by the existing wallpaper renderer.
- Produces: `content: none` for both calendar pseudo-elements and cache keys `20260815-overlay-cleanup-v1` for the changed stylesheet/config delivery path.

- [ ] **Step 1: Add the minimal calendar selector**

Place the calendar selectors directly before the existing growth selectors so both surfaces share one declaration:

```css
.hero-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="calendar"]::before,
.hero-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="calendar"]::after,
.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"]::before,
.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"]::after { content: none; }
```

- [ ] **Step 2: Rotate only the affected cache keys and expectations**

In `config.js`, change the stylesheet asset entry to:

```js
{ name: "family-wallpapers", version: "20260815-overlay-cleanup-v1", script: false },
```

In `index.html`, change the config script URL to:

```html
<script src="config.js?v=20260815-overlay-cleanup-v1"></script>
```

Update tests that assert either old exact string. Keep `app.js?v=20260815-wallpaper-editor-v1` and `wallpaper-editor` version `20260815-v1` unchanged because no application JavaScript changes.

- [ ] **Step 3: Run the focused wallpaper tests**

Run: `npx vitest run test/household-wallpapers.test.js`

Expected: PASS.

- [ ] **Step 4: Run repository verification**

Run: `npm run check && npm test && git diff --check`

Expected: all checks and tests pass; `git diff --check` produces no output.

- [ ] **Step 5: Commit the implementation**

```bash
git add family-wallpapers.css config.js index.html test/household-wallpapers.test.js test/calendar-font-settings.test.js test/calendar-mobile-polish.test.js test/calendar-month-typography.test.js test/demo-theme-settings.test.js
git commit -m "fix: remove calendar wallpaper overlays"
```

### Task 3: Integrate, Deploy, and Verify Public Delivery

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: The verified implementation branch.
- Produces: Updated `main`, GitHub Pages deployment, and public evidence that the new selector and cache key are live.

- [ ] **Step 1: Review the final branch diff**

Run: `git diff main...HEAD --stat && git diff main...HEAD -- family-wallpapers.css config.js index.html test/household-wallpapers.test.js`

Expected: only the regression test, selector, and cache-key rotations described above.

- [ ] **Step 2: Fast-forward `main` and verify again**

Run from the primary checkout:

```bash
git merge --ff-only wallpaper-overlay-cleanup
npm run check
npm test
```

Expected: fast-forward succeeds and all checks/tests pass on `main`.

- [ ] **Step 3: Push and confirm GitHub workflows**

```bash
git push origin main
gh run list --branch main --limit 5
```

Expected: the Validation and GitHub Pages workflows for the pushed commit complete successfully.

- [ ] **Step 4: Verify the public assets**

Run:

```bash
curl -fsSL https://wys1110.github.io/family/ | rg 'config.js\?v=20260815-overlay-cleanup-v1'
curl -fsSL 'https://wys1110.github.io/family/config.js?v=20260815-overlay-cleanup-v1' | rg 'family-wallpapers.*20260815-overlay-cleanup-v1'
curl -fsSL 'https://wys1110.github.io/family/family-wallpapers.css?v=20260815-overlay-cleanup-v1' | rg 'hero-card\.wallpaper-surface\.has-wallpaper'
```

Expected: all three commands print the new public cache key or selector.
