# Wallpaper Brightness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brighten calendar and growth wallpapers in white and dark themes while preserving text contrast, crop behavior, and the existing wallpaper layout.

**Architecture:** Keep the current wallpaper renderer and gradient shapes unchanged. Reduce the six shared scrim alpha values in both first-paint sources, then rotate only the affected CSS/config cache keys so mobile and PWA clients load the revised theme consistently.

**Tech Stack:** Static HTML/CSS/JavaScript, Vitest, GitHub Pages

## Global Constraints

- White scrim values must be exactly `.46`, `.24`, and `.05` for start, middle, and end.
- Dark scrim values must be exactly `.58`, `.32`, and `.08` for start, middle, and end.
- `index.html` inline critical variables and `theme-critical.css` must contain matching values.
- Preserve the calendar 105-degree gradient and the growth right-side fade to transparent.
- Preserve wallpaper text, shadow, controls, crop, upload, deletion, persistence, one-image rendering, and decoration cleanup.
- Do not change application runtime logic, Supabase schema/storage/data, layout, typography, or animation.
- Preserve unrelated user-owned files and local changes.

---

### Task 1: Add Wallpaper Brightness Regression Coverage

**Files:**
- Modify: `test/theme-bootstrap.test.js`
- Modify: `test/household-wallpapers.test.js`

**Interfaces:**
- Consumes: `index.html`, `theme-critical.css`, `family-wallpapers.css`, and `config.js` as test strings.
- Produces: Exact-value coverage for both themes and cache-delivery coverage for the affected stylesheets.

- [ ] **Step 1: Add a failing first-paint consistency test**

In `test/theme-bootstrap.test.js`, add a test that asserts all six approved CSS declarations occur in both `index.html` and `theme-critical.css`. Use whitespace-tolerant regular expressions so inline minification does not alter the contract:

```js
test('keeps wallpaper scrims brighter and identical across first-paint sources', () => {
  const values = [
    ['8', '8', '8', '.46'],
    ['8', '8', '8', '.24'],
    ['8', '8', '8', '.05'],
    ['4', '4', '4', '.58'],
    ['4', '4', '4', '.32'],
    ['4', '4', '4', '.08'],
  ];

  values.forEach(([red, green, blue, alpha]) => {
    const declaration = new RegExp(`rgba\\(${red},\\s*${green},\\s*${blue},\\s*\\${alpha}\\)`);
    expect(index).toMatch(declaration);
    expect(critical).toMatch(declaration);
  });
});
```

- [ ] **Step 2: Add failing delivery assertions**

In `test/household-wallpapers.test.js`, update the delivery test to require:

```js
expect(html).toContain('theme-critical.css?v=20260815-wallpaper-brightness-v1');
expect(html).toContain('config.js?v=20260815-wallpaper-brightness-v1');
expect(config).toContain('{ name: "family-wallpapers", version: "20260815-brightness-v1", script: false }');
```

Retain its existing assertions for the unchanged wallpaper editor and service-worker delivery behavior.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npx vitest run test/theme-bootstrap.test.js test/household-wallpapers.test.js`

Expected: FAIL because the production files still contain the old scrim values and cache keys.

- [ ] **Step 4: Commit the failing regression tests**

```bash
git add test/theme-bootstrap.test.js test/household-wallpapers.test.js
git commit -m "test: cover brighter wallpaper scrims"
```

### Task 2: Brighten Both Wallpaper Surfaces and Rotate CSS Delivery

**Files:**
- Modify: `index.html`
- Modify: `theme-critical.css`
- Modify: `config.js`
- Modify: `test/calendar-font-settings.test.js`
- Modify: `test/calendar-mobile-polish.test.js`
- Modify: `test/calendar-month-typography.test.js`
- Modify: `test/demo-theme-settings.test.js`
- Modify: `test/household-wallpapers.test.js`

**Interfaces:**
- Consumes: The existing shared `--theme-wallpaper-scrim-*` variables used by both wallpaper gradients.
- Produces: Brighter matching values for white/dark first paint and cache keys `20260815-wallpaper-brightness-v1` / `20260815-brightness-v1`.

- [ ] **Step 1: Update the exact white and dark scrim values**

Change both the inline critical theme in `index.html` and the matching declarations in `theme-critical.css`:

```css
/* White */
--theme-wallpaper-scrim-start: rgba(8, 8, 8, .46);
--theme-wallpaper-scrim-middle: rgba(8, 8, 8, .24);
--theme-wallpaper-scrim-end: rgba(8, 8, 8, .05);

/* Dark */
--theme-wallpaper-scrim-start: rgba(4, 4, 4, .58);
--theme-wallpaper-scrim-middle: rgba(4, 4, 4, .32);
--theme-wallpaper-scrim-end: rgba(4, 4, 4, .08);
```

Keep existing whitespace conventions in each file and do not modify other wallpaper variables.

- [ ] **Step 2: Rotate only affected cache keys**

In `index.html`, use:

```html
<link rel="stylesheet" href="theme-critical.css?v=20260815-wallpaper-brightness-v1" />
<script src="config.js?v=20260815-wallpaper-brightness-v1"></script>
```

In `config.js`, use:

```js
{ name: "family-wallpapers", version: "20260815-brightness-v1", script: false },
```

Update every test that asserts the previous exact `config.js` or `family-wallpapers` version. Keep `app.js?v=20260815-wallpaper-editor-v1` and `{ name: "wallpaper-editor", version: "20260815-v1" }` unchanged.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run: `npx vitest run test/theme-bootstrap.test.js test/household-wallpapers.test.js`

Expected: PASS.

- [ ] **Step 4: Run repository verification**

Run: `npm run check && npm test && git diff --check`

Expected: all checks and tests pass; `git diff --check` prints no output.

- [ ] **Step 5: Commit the implementation**

```bash
git add index.html theme-critical.css config.js test/calendar-font-settings.test.js test/calendar-mobile-polish.test.js test/calendar-month-typography.test.js test/demo-theme-settings.test.js test/household-wallpapers.test.js
git commit -m "fix: brighten family wallpapers"
```

### Task 3: Integrate, Deploy, and Verify Public Brightness Delivery

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: The reviewed implementation branch.
- Produces: Updated `main`, successful GitHub validation/Pages deployment, and public evidence of the new scrim values.

- [ ] **Step 1: Review the complete branch**

Generate a branch diff from its merge base and verify that only the approved scrim values, cache keys, tests, and documentation changed.

- [ ] **Step 2: Fast-forward main and verify the merged result**

Run from the primary checkout:

```bash
git merge --ff-only wallpaper-brightness
npm run check
npm test
git diff --check
```

Expected: fast-forward succeeds and all checks/tests pass on `main`.

- [ ] **Step 3: Push and verify GitHub workflows**

```bash
git push origin main
gh run list --commit "$(git rev-parse HEAD)" --limit 10
```

Expected: Validation and GitHub Pages complete successfully for the pushed commit.

- [ ] **Step 4: Verify public assets and mobile rendering**

Confirm the public HTML loads `theme-critical.css` and `config.js` with `20260815-wallpaper-brightness-v1`, public `config.js` loads `family-wallpapers` with `20260815-brightness-v1`, and public `theme-critical.css` contains all six approved scrim values. Inspect white and dark calendar/growth surfaces at 390-pixel width and confirm no new console errors.
