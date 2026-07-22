# Global Design Harmony Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove viewport-covering actions, compact the repeated verse header outside the calendar, and simplify copy, decoration, and motion without changing app data behavior.

**Architecture:** Keep the existing button IDs and event listeners, but reparent the refresh button into `.topbar-account-actions` and the calendar/growth action after `.view-tabs`. Add scoped layout rules to existing stylesheets, update text literals and cache versions, and protect the visual contract with source tests plus authenticated browser geometry checks.

**Tech Stack:** Vanilla JavaScript, CSS, Vitest, authenticated in-app browser.

## Global Constraints

- Keep self-hosted SUIT Variable as the only text font.
- Preserve authentication, Supabase, family data, AI content, and persistence logic.
- Preserve the existing deep-reload and service-worker update behavior.
- Do not change zoom prevention policy.
- Do not add a stylesheet.
- Do not modify or commit `HANDOFF.md` or `.superpowers/`.
- Verify `night` and `forest` at 390×844, 430×932, 768×1024, and 1440×900.

---

### Task 1: Move global and contextual actions out of the viewport layer

**Files:**

- Modify: `refresh-button.js`
- Modify: `refresh-button.css`
- Modify: `config.js`
- Modify: `test/floating-actions-safe-zone.test.js`
- Modify: `test/refresh-button-scroll.test.js`
- Create: `test/global-design-harmony.test.js`

**Interfaces:**

- Consumes: `#refreshButton`, `#addEventButton`, `.topbar-account-actions`, `.view-tabs`, `#accountButton`.
- Produces: refresh as a topbar utility and add/record as an inline contextual action.

- [ ] **Step 1: Write failing placement and geometry assertions**

```js
expect(script).toContain("const topbarActions = document.querySelector('.topbar-account-actions')");
expect(script).toContain("topbarActions.insertBefore(button, accountButton)");
expect(script).toContain("viewTabs.insertAdjacentElement('afterend', addEventButton)");
expect(css).toContain('.topbar-account-actions > .refresh-button');
expect(css).toContain('main > #addEventButton.fab');
expect(css).not.toContain('body > #addEventButton.fab');
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npx vitest run test/global-design-harmony.test.js test/floating-actions-safe-zone.test.js test/refresh-button-scroll.test.js`

Expected: new placement assertions fail because both actions are still body-fixed.

- [ ] **Step 3: Reparent the existing buttons without replacing behavior**

```js
const topbarActions = document.querySelector('.topbar-account-actions');
const accountButton = topbarActions?.querySelector('#accountButton');
const viewTabs = document.querySelector('.view-tabs');

if (addEventButton && viewTabs) {
  viewTabs.insertAdjacentElement('afterend', addEventButton);
}

if (topbarActions && accountButton && button.parentElement !== topbarActions) {
  topbarActions.insertBefore(button, accountButton);
}
```

The synchronous fallback in `config.js` uses the same topbar host when present, otherwise `body`.

- [ ] **Step 4: Replace fixed geometry with utility and inline geometry**

```css
.topbar-account-actions > .refresh-button {
  position: relative;
  width: 42px;
  height: 42px;
}

main > #addEventButton.fab {
  position: relative;
  left: auto;
  min-height: 48px;
  margin: -8px 0 14px auto;
  transform: none;
}
```

At 768px the refresh utility becomes 46×46px. Remove refresh from the AI safe-zone selector because it no longer overlaps content.

- [ ] **Step 5: Update the refresh cache version and confirm GREEN**

Set `refresh-button` to `20260722-topbar-actions-v3`, then rerun the three focused tests.

### Task 2: Add the compact verse bookmark and visual restraint

**Files:**

- Modify: `page-header-spacing.css`
- Modify: `night-theme-polish.css`
- Modify: `styles.css`
- Modify: `index.html`
- Modify: `feature-request.js`
- Modify: `settings.js`
- Modify: `config.js`
- Test: `test/global-design-harmony.test.js`

**Interfaces:**

- Consumes: `#calendarView[hidden]`, `.daily-verse-card`, `#babyJournalContent`, and existing eyebrow markup.
- Produces: compact non-calendar bookmark, no cross divider, shorter motion, Korean copy.

- [ ] **Step 1: Add failing assertions for bookmark, decoration, motion, and copy**

```js
expect(headerCss).toContain('body:has(#calendarView[hidden]) .daily-verse-card');
expect(headerCss).toContain('min-height: 68px');
expect(nightCss).toContain('content: none');
expect(baseCss).toContain('animation: soft-rise .22s ease both');
expect(index).toContain('<p class="eyebrow">아기 성장 기록</p>');
expect(requestScript).toContain('<p class="eyebrow">가족 기능 제안</p>');
expect(settingsScript).toContain('<p class="eyebrow">화면 꾸미기</p>');
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run test/global-design-harmony.test.js`

Expected: assertions fail on the current full-height header, cross gradient, old motion, and English labels.

- [ ] **Step 3: Implement the compact bookmark in the existing header stylesheet**

```css
body:has(#calendarView[hidden]) .daily-verse-card {
  min-height: 68px;
  padding: 10px 14px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}

body:has(#calendarView[hidden]) .daily-verse-card blockquote {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
```

Keep the full calendar verse unchanged and set compact desktop minimum height to 84px.

- [ ] **Step 4: Remove only the misleading night growth divider**

```css
html[data-family-theme="night"] #growthView #babyJournalContent > section::before {
  content: none;
  display: none;
}
```

- [ ] **Step 5: Shorten entrance motion and translate eyebrow copy**

Use 220ms for verse, tabs, hero, and calendar; 200ms for agenda/growth entries. Replace the four approved English labels while retaining `ENGLISH STORY TIME`.

- [ ] **Step 6: Update cache versions and confirm GREEN**

Set `page-header-spacing` to `20260722-verse-bookmark-v2`, `night-theme-polish` to `20260722-growth-restraint-v1`, and update the direct `styles.css` query to `20260722-motion-v1`. Rerun the focused test.

### Task 3: Verify responsive UI and publish the implementation

**Files:**

- Verify all modified files.

**Interfaces:**

- Consumes: completed Tasks 1–2.
- Produces: browser evidence, passing repository checks, and a synchronized upstream branch.

- [ ] **Step 1: Run automated verification**

```bash
npm test
npm run check
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Verify authenticated browser geometry**

For both themes at every target viewport, confirm:

- `documentElement.scrollWidth === documentElement.clientWidth`
- refresh is inside `.topbar-account-actions` and not fixed
- add/record button is in `main`, not fixed, and at least 48px high
- compact verse is 68px mobile and 84px desktop on non-calendar pages
- calendar keeps the full verse
- no cross divider is visible in growth

- [ ] **Step 3: Restore browser state**

Return to `night`, select request, reset viewport, and hand off the authenticated tab.

- [ ] **Step 4: Commit and push only relevant files**

```bash
git add config.js feature-request.js index.html night-theme-polish.css page-header-spacing.css refresh-button.css refresh-button.js settings.js styles.css test/floating-actions-safe-zone.test.js test/global-design-harmony.test.js test/refresh-button-scroll.test.js docs/superpowers/plans/2026-07-22-global-design-harmony.md
git commit -m "fix: harmonize global family app layout"
git push
```

- [ ] **Step 5: Prove remote synchronization**

Fetch origin and verify ahead/behind `0/0`, identical HEAD/upstream commits, identical tree hashes, and only the pre-existing untracked `HANDOFF.md` and `.superpowers/` remain.
