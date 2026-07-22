# Feature Request Layout Harmony Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make the authenticated request tab feel balanced at mobile and desktop widths while preserving its data and interaction behavior.

**Architecture:** Keep the existing markup and JavaScript unchanged. Add narrowly scoped, higher-specificity rules to the existing request styles so they override generic form and responsive-module rules without affecting other pages. Keep night-theme color refinements in the existing night request stylesheet and update module versions for cache invalidation.

**Tech Stack:** Vanilla CSS, Vitest, authenticated in-app browser inspection.

## Global Constraints

- Keep SUIT Variable as the only text font; the decorative accent must contain no text.
- Do not change authentication, Supabase, family data, request persistence, or status-update logic.
- Do not modify `HANDOFF.md` or `.superpowers/`.
- Do not add another temporary stylesheet.
- Validate both `night` and `forest` themes at 390×844, 430×932, 768×1024, and 1440×900.

---

### Task 1: Lock the approved layout into a failing contract test

**Files:**
- Create: `test/feature-request-layout-harmony.test.js`

**Step 1: Add assertions for the centered content rail and bottom spacing**

Assert that `#featureRequestView.feature-request-view` has `width: 100%`, `max-width: 880px`, centered inline margins, and `padding-bottom: 0`.

**Step 2: Add assertions for the stacked request form**

Assert that the form remains block layout, the textarea is full-width and at least 120px tall, the counter and action remain in one row, and the submit button is at least 112×48px.

**Step 3: Add assertions for admin request rows**

Assert that the status label uses a two-column grid, the select is capped at 220px with a 44px touch target, the refresh button reaches 44px, and request copy is capped at 68 characters.

**Step 4: Add assertions for decoration, night surfaces, and cache versions**

Assert that the literal question mark and Georgia font are gone, the decorative layer is a textless gradient, night outer surfaces match, the night textarea uses the same input surface as the select, and both CSS module versions are updated to `20260722-layout-harmony-v1`.

**Step 5: Run the focused test and confirm RED**

Run: `npx vitest run test/feature-request-layout-harmony.test.js`

Expected: FAIL because the new scoped selectors and module versions do not yet exist.

### Task 2: Implement the responsive request-tab layout

**Files:**
- Modify: `feature-request.css`
- Modify: `night-feature-request-polish.css`
- Modify: `config.js`

**Step 1: Center and cap the request view**

Add an ID-scoped rule with a full-width 880px cap, automatic inline margins, and no local bottom padding so the app shell owns the safe-area spacing.

**Step 2: Keep the form stacked at every breakpoint**

Override the 640px two-column form rule with block layout. Set the textarea minimum height to 120px, then 132px from 768px upward. Keep the counter left and submit action right, with a 112×48px minimum button.

**Step 3: Repair admin control sizing**

Use `grid-template-columns: auto minmax(0, 220px)` for each status row, prevent the label from wrapping, cap the select at 220px, and give select and refresh controls 44px minimum height. Limit request body measure to 68ch.

**Step 4: Replace the decorative glyph**

Change the card pseudo-element to an empty string and render only a subtle radial gradient. Remove the Georgia declaration.

**Step 5: Harmonize night-theme surfaces**

Apply the same deep-navy gradient to the request form and admin outer cards. Give the textarea the same `#182b42` input surface and focus treatment as the status select while keeping the inner request cards one step lighter.

**Step 6: Bust the two affected stylesheet caches**

Update the `feature-request` and `night-feature-request-polish` versions in `config.js` to `20260722-layout-harmony-v1`.

**Step 7: Run the focused test and confirm GREEN**

Run: `npx vitest run test/feature-request-layout-harmony.test.js`

Expected: PASS.

### Task 3: Verify the authenticated result and repository health

**Files:**
- Verify only; no new files expected.

**Step 1: Inspect the live authenticated request tab**

At each target viewport and in both themes, confirm computed width, font family, textarea and button sizes, status label/select geometry, no horizontal overflow, and no duplicated bottom spacing.

**Step 2: Run project checks**

Run:

```bash
npm test
npm run check
git diff --check
```

Expected: all commands pass.

**Step 3: Review and commit only relevant changes**

Stage the plan, test, two CSS files, and `config.js`. Leave `HANDOFF.md` and `.superpowers/` untouched.

**Step 4: Push and prove synchronization**

Push the current upstream branch, fetch `origin --prune`, and report clean tracked status plus ahead/behind counts.
