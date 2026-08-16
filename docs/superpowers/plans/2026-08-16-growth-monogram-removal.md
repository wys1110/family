# Growth Monogram Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the baby's initial tile from every growth profile state while preserving an uncovered photo zone when a growth wallpaper is active.

**Architecture:** Delete the obsolete monogram markup, renderer assignment, and CSS rather than hiding them. Convert the profile header to two columns, use normal content-edge alignment without a wallpaper, and add a wallpaper-only left safe zone through the existing `.has-wallpaper` state.

**Tech Stack:** Static HTML/CSS/JavaScript, Vitest, GitHub Pages

## Global Constraints

- The `babyMonogram` element and `.baby-monogram` styles must not remain anywhere in production markup, runtime code, or stylesheets.
- The base profile header must use two columns: `minmax(0, 1fr) auto`.
- Without a wallpaper, profile copy and edit controls must use the normal card content edge with no artificial monogram slot.
- With a growth wallpaper, preserve a `72px` desktop and `63px` mobile image-only safe zone in addition to the card's normal left content padding.
- Keep D-day, birth date, name, age, photo actions, scrim, text shadow, controls, crop, upload, deletion, persistence, and wallpaper failure behavior unchanged.
- Do not change the calendar wallpaper, Supabase schema/storage/data, typography, animation, or growth records.
- Preserve unrelated user-owned files and local changes.

---

### Task 1: Add Monogram Removal and Photo-Safe Layout Coverage

**Files:**
- Modify: `test/household-wallpapers.test.js`

**Interfaces:**
- Consumes: `index.html`, `app.js`, `styles.css`, `responsive-layout.css`, `typography-system.css`, and `family-wallpapers.css` as source strings.
- Produces: Regression assertions for full monogram removal, two-column base layout, and wallpaper-only safe-zone layout.

- [ ] **Step 1: Load the affected base and responsive styles in the test**

Add these source strings beside the existing `css` constant:

```js
const baseCss = read('styles.css');
const responsiveCss = read('responsive-layout.css');
const typographyCss = read('typography-system.css');
```

- [ ] **Step 2: Add a failing removal and layout test**

Add this test near the existing growth wallpaper visual tests:

```js
test('removes the baby monogram and reserves photo space only for active growth wallpapers', () => {
  expect(html).not.toContain('id="babyMonogram"');
  expect(html).not.toContain('class="baby-monogram"');
  expect(app).not.toContain('$("#babyMonogram")');
  expect(baseCss).not.toContain('.baby-monogram');
  expect(responsiveCss).not.toContain('.baby-monogram');
  expect(typographyCss).not.toContain('.baby-monogram');
  expect(baseCss).toMatch(/\.baby-profile-main\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) auto;/s);
  expect(baseCss).toContain('.baby-care-card .baby-edit-button { margin:12px 0 0 22px; }');
  expect(css).toContain('.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-profile-main { padding-left: calc(22px + 72px); }');
  expect(css).toContain('.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-edit-button { margin-left: calc(22px + 72px); }');
  const mobileWallpaperCss = css.slice(css.indexOf('@media (max-width: 520px)'));
  expect(mobileWallpaperCss).toContain('.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-profile-main { padding-left: calc(18px + 63px); }');
  expect(mobileWallpaperCss).toContain('.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-edit-button { margin-left: calc(18px + 63px); }');
});
```

- [ ] **Step 3: Run the focused suite and verify RED**

Run: `npx vitest run test/household-wallpapers.test.js`

Expected: FAIL because the monogram still exists and the two-column/safe-zone rules are absent.

- [ ] **Step 4: Commit the failing regression test**

```bash
git add test/household-wallpapers.test.js
git commit -m "test: cover growth monogram removal"
```

### Task 2: Remove the Monogram and Preserve the Wallpaper Photo Zone

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `responsive-layout.css`
- Modify: `typography-system.css`
- Modify: `growth-layout.css`
- Modify: `family-wallpapers.css`
- Modify: `config.js`
- Modify: `test/calendar-font-settings.test.js`
- Modify: `test/calendar-mobile-polish.test.js`
- Modify: `test/calendar-month-typography.test.js`
- Modify: `test/demo-theme-settings.test.js`
- Modify: `test/global-design-harmony.test.js`
- Modify: `test/household-wallpapers.test.js`
- Modify: `test/storybook-typography-emoji.test.js`
- Modify: `test/upcoming-events.test.js`

**Interfaces:**
- Consumes: `.has-wallpaper[data-wallpaper-surface="growth"]` maintained by the existing wallpaper renderer.
- Produces: A monogram-free two-column profile and wallpaper-only safe-zone rules delivered with cache key `20260816-growth-monogram-v1`.

- [ ] **Step 1: Remove the obsolete element and runtime assignment**

Delete this markup from `index.html`:

```html
<span class="baby-monogram" id="babyMonogram" aria-hidden="true">B</span>
```

Delete this line from `renderBabyProfile` in `app.js`:

```js
$("#babyMonogram").textContent = baby.name.charAt(0);
```

- [ ] **Step 2: Convert base and responsive profile layouts to two columns**

In `styles.css`:

- Change every `.baby-profile-main` grid declaration from a monogram column plus copy and D-day to `grid-template-columns:minmax(0,1fr) auto`.
- Delete both `.baby-monogram` rules and the mobile monogram sizing rule.
- Change the base `.baby-edit-button` margin to `margin:14px 0 0`.
- Change `.baby-care-card .baby-edit-button` to `margin:12px 0 0 22px` and its mobile override to `margin-left:18px`.

In `responsive-layout.css`, change the wide `.baby-profile-main` declaration to:

```css
.baby-profile-main {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
}
```

Delete the wide `.baby-monogram` block entirely.

In `typography-system.css`, remove `.baby-monogram` from the shared selector so the remaining rule targets only `.baby-empty-mark`:

```css
#growthView .baby-empty-mark {
  font-size: 31px;
  font-weight: var(--type-weight-regular);
  line-height: 1.5;
}
```

In `growth-layout.css`, remove the later-loaded monogram-era offsets so the final cascade preserves normal content-edge alignment:

```css
.baby-care-card .baby-edit-button { min-height: 32px; margin: 12px 0 0 22px; padding: 0 10px; }

@media (max-width: 520px) {
  .baby-care-card .baby-profile-main { padding: 19px 18px 0; }
  .baby-care-card .baby-edit-button { margin-left: 18px; }
}
```

- [ ] **Step 3: Add wallpaper-only photo-safe offsets**

In `family-wallpapers.css`, add:

```css
.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-profile-main { padding-left: calc(22px + 72px); }
.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-edit-button { margin-left: calc(22px + 72px); }
```

Inside its existing `@media (max-width: 520px)` block, add:

```css
.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-profile-main { padding-left: calc(18px + 63px); }
.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-edit-button { margin-left: calc(18px + 63px); }
```

- [ ] **Step 4: Rotate affected mobile/PWA cache keys**

Use `20260816-growth-monogram-v1` for:

- `styles.css`, `config.js`, and `app.js` URLs in `index.html`.
- `responsive-layout`, `growth-layout`, `typography-system`, and `family-wallpapers` module versions in `config.js`.
- Every test that asserts the previous exact versions.

Keep all unrelated module and wallpaper-editor versions unchanged.

Extend the household wallpaper regression test to load `growth-layout.css`, assert that `94px` and `79px` monogram-era edit offsets are absent, assert the final desktop/mobile normal alignments above, and require the `growth-layout` config version to equal `20260816-growth-monogram-v1`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run test/household-wallpapers.test.js test/global-design-harmony.test.js test/upcoming-events.test.js`

Expected: PASS.

- [ ] **Step 6: Run repository verification**

Run: `npm run check && npm test && git diff --check`

Expected: all checks and tests pass; `git diff --check` prints no output.

- [ ] **Step 7: Commit the implementation**

```bash
git add index.html app.js styles.css responsive-layout.css typography-system.css growth-layout.css family-wallpapers.css config.js test/calendar-font-settings.test.js test/calendar-mobile-polish.test.js test/calendar-month-typography.test.js test/demo-theme-settings.test.js test/global-design-harmony.test.js test/household-wallpapers.test.js test/storybook-typography-emoji.test.js test/upcoming-events.test.js
git commit -m "fix: remove growth profile monogram"
```

### Task 3: Integrate, Deploy, and Verify the Growth Profile

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: The reviewed implementation branch.
- Produces: Updated `main`, successful GitHub Validation/Pages deployment, and public mobile evidence for the monogram-free profile.

- [ ] **Step 1: Review the complete implementation branch**

Generate a diff from the branch merge base and verify that only approved markup/runtime/CSS cleanup, cache keys, tests, and documentation changed.

- [ ] **Step 2: Fast-forward main and verify the merged result**

```bash
git merge --ff-only growth-monogram-removal
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

- [ ] **Step 4: Verify public mobile rendering**

Confirm public HTML, `config.js`, and affected styles expose `20260816-growth-monogram-v1`. At 390-pixel width, inspect white and dark growth cards with and without a wallpaper: the monogram must be absent, default content must align to the normal left padding, wallpaper content must retain the 63px photo-safe zone, crop and photo actions must remain usable, and the console must have no new errors.
