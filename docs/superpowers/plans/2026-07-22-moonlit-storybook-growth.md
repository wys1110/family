# Moonlit Storybook Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the complete app on self-hosted SUIT Variable and give the night-theme growth view a strong moonlit storybook surface without changing behavior or data.

**Architecture:** Keep typography ownership in `typography-system.css` and place the night-only visual layer in the existing `night-theme-polish.css`. Protect delivery with module version bumps in `config.js` and source-contract tests; no new runtime JavaScript or page-specific stylesheet is introduced.

**Tech Stack:** Static HTML/CSS/JavaScript, Vitest, TypeScript checks, Codex in-app browser

## Global Constraints

- Use `SUIT Variable` as the only Korean text font across headings, body, controls, dates and numbers.
- Remove MaruBuri runtime declarations and repository assets.
- Scope strong moonlit surfaces to `html[data-family-theme="night"] #growthView`.
- Do not change Supabase, authentication, baby data, AI content, form structure or control behavior.
- Preserve accessible names, focus-visible styling, touch sizes and the intentional zoom policy.
- Add no animation, external image, new JavaScript module or new page-specific stylesheet.

---

### Task 1: Single SUIT Font Contract

**Files:**
- Modify: `test/storybook-typography-emoji.test.js`
- Modify: `typography-system.css`
- Delete: `assets/fonts/MaruBuri-SemiBold.woff2`
- Delete: `assets/fonts/LICENSE-MaruBuri.md`

**Interfaces:**
- Consumes: existing `--font-family-sans` token and self-hosted `SUIT-Variable.woff2`
- Produces: `--font-family-display` as an alias of the SUIT stack so existing heading selectors remain compatible

- [ ] **Step 1: Write the failing single-font contract**

Update the font asset and role tests to require only SUIT:

```js
expect(existsSync(new URL('../assets/fonts/MaruBuri-SemiBold.woff2', import.meta.url))).toBe(false);
expect(existsSync(new URL('../assets/fonts/LICENSE-MaruBuri.md', import.meta.url))).toBe(false);
expect(existsSync(new URL('../assets/fonts/SUIT-Variable.woff2', import.meta.url))).toBe(true);
expect(css).not.toContain('font-family: "Family Story Display"');
expect(css).toContain('--font-family-display: var(--font-family-sans)');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run test/storybook-typography-emoji.test.js`

Expected: FAIL because MaruBuri assets and `Family Story Display` still exist.

- [ ] **Step 3: Implement the SUIT-only stack**

Remove the MaruBuri `@font-face`, delete its two files, and make the root variables:

```css
:root {
  --font-family-sans: "Family UI", -apple-system, BlinkMacSystemFont,
    "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  --font-family-display: var(--font-family-sans);
}
```

Keep existing heading selectors but set their weight to `700` so they consume the same SUIT family.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npx vitest run test/storybook-typography-emoji.test.js
git diff --check
git add typography-system.css test/storybook-typography-emoji.test.js assets/fonts
git commit -m "style: unify family app typography on SUIT"
```

Expected: focused tests pass and no whitespace errors.

---

### Task 2: Moonlit Growth Surface

**Files:**
- Create: `test/moonlit-storybook-growth.test.js`
- Modify: `night-theme-polish.css`

**Interfaces:**
- Consumes: current night theme variables and existing growth selectors
- Produces: `--moonlit-gold`, `--moonlit-teal`, `--moonlit-paper`, and night-only card/button surface rules

- [ ] **Step 1: Write the failing CSS scope contract**

Create a source-contract test that checks night scoping and essential surface tokens:

```js
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../night-theme-polish.css', import.meta.url), 'utf8');

describe('moonlit storybook growth surface', () => {
  it('defines a night-only growth palette', () => {
    expect(css).toContain('html[data-family-theme="night"] #growthView {');
    expect(css).toContain('--moonlit-gold: #e8c77a');
    expect(css).toContain('--moonlit-teal: #78b7b2');
    expect(css).toContain('--moonlit-paper: rgba(14, 34, 57, .88)');
  });

  it('styles the core growth cards and quick actions', () => {
    expect(css).toContain('html[data-family-theme="night"] #growthView .baby-care-card');
    expect(css).toContain('html[data-family-theme="night"] #growthView .baby-ai-assistant');
    expect(css).toContain('html[data-family-theme="night"] #growthView .growth-quick-grid button');
    expect(css).toContain('html[data-family-theme="night"] #babyJournalContent > section::before');
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npx vitest run test/moonlit-storybook-growth.test.js`

Expected: FAIL because the palette and surface rules do not exist.

- [ ] **Step 3: Add the night-only palette and background**

Append a consolidated section to `night-theme-polish.css`:

```css
html[data-family-theme="night"] #growthView {
  --moonlit-gold: #e8c77a;
  --moonlit-teal: #78b7b2;
  --moonlit-paper: rgba(14, 34, 57, .88);
  --moonlit-border: color-mix(in srgb, var(--moonlit-gold) 28%, rgba(138, 180, 222, .18));
  background:
    radial-gradient(circle at 92% 4%, rgba(232, 199, 122, .10) 0 2px, transparent 3px),
    radial-gradient(ellipse at 8% 18%, rgba(120, 183, 178, .10), transparent 34%);
}
```

- [ ] **Step 4: Add parchment cards, sticker actions and dividers**

Use existing elements and pseudo-elements only:

```css
html[data-family-theme="night"] #growthView :is(.baby-care-card, .care-timer-card, .growth-quick-section, .care-pattern-section, .baby-ai-assistant, .recent-photo-featured) {
  border-color: var(--moonlit-border);
  background: linear-gradient(145deg, rgba(24, 52, 83, .92), var(--moonlit-paper));
  box-shadow: 0 20px 48px rgba(0, 0, 0, .30), inset 0 1px 0 rgba(255, 245, 216, .08);
}

html[data-family-theme="night"] #growthView .growth-quick-grid button {
  border-color: color-mix(in srgb, var(--moonlit-teal) 30%, transparent);
  box-shadow: 3px 4px 0 rgba(4, 14, 27, .34), inset 0 1px 0 rgba(255, 255, 255, .08);
}

html[data-family-theme="night"] #babyJournalContent > section::before {
  content: "✦";
  display: block;
  height: 1px;
  margin: -9px 18% 16px;
  background: linear-gradient(90deg, transparent, var(--moonlit-gold), transparent);
}
```

Represent dividers with existing section pseudo-elements rather than adding HTML nodes.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
npx vitest run test/moonlit-storybook-growth.test.js
git diff --check
git add night-theme-polish.css test/moonlit-storybook-growth.test.js
git commit -m "style: add moonlit storybook growth surfaces"
```

Expected: new focused tests pass.

---

### Task 3: Cache Delivery and Browser QA

**Files:**
- Modify: `config.js`
- Modify: `test/storybook-typography-emoji.test.js`

**Interfaces:**
- Consumes: module loader `{ name, version, script }` entries
- Produces: fresh URLs for `typography-system.css` and `night-theme-polish.css`

- [ ] **Step 1: Update the failing cache contract**

Require these exact version strings:

```js
expect(config).toContain('{ name: "typography-system", version: "20260722-suit-only-v1", script: false }');
expect(config).toContain('{ name: "night-theme-polish", version: "20260722-moonlit-v1" }');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run test/storybook-typography-emoji.test.js`

Expected: FAIL on the old module versions.

- [ ] **Step 3: Bump both module versions**

Change only the two matching entries in `config.js` to the exact strings from Step 1.

- [ ] **Step 4: Run the full automated verification**

Run:

```bash
npm test
npm run check
git diff --check
```

Expected: all tests and checks pass with zero failures.

- [ ] **Step 5: Verify the authenticated browser**

Reload with a cache-busting query and verify night plus forest themes at 390×844, 430×932, 768×1024 and 1440×900:

```js
document.fonts.check('700 24px "Family UI"') === true
getComputedStyle(document.querySelector('.growth-page-header h2')).fontFamily.includes('Family UI')
getComputedStyle(document.querySelector('.baby-ai-profile-form')).fontFamily.includes('Family UI')
document.documentElement.scrollWidth <= window.innerWidth
```

Visually inspect the profile card, quick actions, care pattern and AI surface. Restore the user's original night theme and viewport after QA.

- [ ] **Step 6: Commit delivery changes**

Run:

```bash
git add config.js test/storybook-typography-emoji.test.js
git commit -m "fix: deliver moonlit growth design assets"
```

Expected: working tree contains only user-owned or brainstorming artifacts.
