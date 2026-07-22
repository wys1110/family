# Growth Floating Actions Safe Zone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the two global floating actions while the visible growth AI assistant occupies the viewport so its form and answers remain unobstructed.

**Architecture:** `refresh-button.js` already owns both direct-body floating actions, so it will also own one `IntersectionObserver` for `#babyAiAssistant`. The observer exposes a single body state class; `refresh-button.css` converts that state into non-visible, non-interactive actions without changing any page or data logic.

**Tech Stack:** Vanilla JavaScript, CSS, Vitest, authenticated in-app browser verification

## Global Constraints

- Keep self-hosted SUIT Variable as the only text font.
- Do not modify authentication, Supabase, family data, AI answer content, persistence, or zoom policy.
- Do not modify or commit `HANDOFF.md` or `.superpowers/`.
- Verify night and forest themes at 390×844, 430×932, 768×1024, and 1440×900.
- Complete this P1 as one tested commit before starting the next audit item.

---

### Task 1: Suppress floating actions over the growth AI assistant

**Files:**
- Modify: `refresh-button.js`
- Modify: `refresh-button.css`
- Modify: `config.js`
- Test: `test/floating-actions-safe-zone.test.js`

**Interfaces:**
- Consumes: `#babyAiAssistant`, `#addEventButton`, `.refresh-button`, `document.body`
- Produces: `body.floating-actions-safe-zone-active`

- [ ] **Step 1: Write the failing contract test**

```js
expect(script).toContain("document.querySelector('#babyAiAssistant')");
expect(script).toContain('new IntersectionObserver');
expect(css).toContain('body.floating-actions-safe-zone-active > #addEventButton.fab');
expect(css).toContain('visibility: hidden;');
expect(css).toContain('pointer-events: none;');
expect(config).toContain('{ name: "refresh-button", version: "20260722-growth-safe-zone-v1" }');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- test/floating-actions-safe-zone.test.js`

Expected: FAIL because the observer and safe-zone CSS do not exist.

- [ ] **Step 3: Add the minimal observer and CSS state**

```js
const aiAssistant = document.querySelector('#babyAiAssistant');
if (aiAssistant && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(([entry]) => {
    pageBody.classList.toggle('floating-actions-safe-zone-active', entry.isIntersecting);
  });
  observer.observe(aiAssistant);
}
```

```css
body.floating-actions-safe-zone-active > #addEventButton.fab,
body.floating-actions-safe-zone-active > .refresh-button {
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}
```

- [ ] **Step 4: Run focused and full automated verification**

Run: `npm test -- test/floating-actions-safe-zone.test.js && npm test && npm run check && git diff --check`

Expected: focused tests pass, all 108 existing tests plus the three new regression tests pass, syntax/type checks pass, and diff check is clean.

- [ ] **Step 5: Verify the authenticated browser**

At all four required viewports in night and forest themes, scroll the growth page so `#babyAiAssistant` enters and leaves the viewport. Confirm computed `visibility`, `opacity`, and `pointer-events` for both floating actions, no document horizontal overflow, and restored accessibility names outside the safe zone.

- [ ] **Step 6: Commit only this P1**

```bash
git add refresh-button.js refresh-button.css config.js test/floating-actions-safe-zone.test.js \
  docs/superpowers/specs/2026-07-22-growth-floating-actions-safe-zone-design.md \
  docs/superpowers/plans/2026-07-22-growth-floating-actions-safe-zone.md
git commit -m "fix: keep growth AI content clear of floating actions"
```
