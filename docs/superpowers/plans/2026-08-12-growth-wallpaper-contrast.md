# Growth Wallpaper Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성장 프로필 월페이퍼의 사진 색을 살리면서 모바일에서 모든 프로필 텍스트를 명확히 읽게 한다.

**Architecture:** 기존 월페이퍼 모듈의 사진/토큰 흐름은 유지하고 CSS 우선순위만 고친다. `has-wallpaper`와 `data-wallpaper-surface="growth"`가 동시에 있는 카드에만 한정하여 다른 카드와 일정 화면의 회귀를 막는다.

**Tech Stack:** Static CSS, Vitest source-contract tests, browser mobile smoke test

## Global Constraints

- DB, Supabase Storage, 업로드 및 크롭 로직을 변경하지 않는다.
- 사진이 없는 카드와 일정 월페이퍼를 변경하지 않는다.
- 색상 리터럴은 추가하지 않고 `theme-critical.css`의 기존 월페이퍼 토큰만 사용한다.

---

### Task 1: 성장 월페이퍼 대비 계약

**Files:**
- Modify: `test/household-wallpapers.test.js`
- Modify: `family-wallpapers.css`

**Interfaces:**
- Consumes: `.wallpaper-surface.has-wallpaper`, `[data-wallpaper-surface="growth"]`, 기존 `--theme-wallpaper-*` 토큰
- Produces: 성장 사진 카드 전용 그라데이션과 텍스트 대비 계약

- [ ] **Step 1: Write the failing test**

```js
test('keeps growth wallpaper photo neutral and profile text legible in white mode', () => {
  expect(css).toContain('.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"]');
  expect(css).toContain('linear-gradient(90deg');
  expect(css).toContain('color: var(--theme-wallpaper-text) !important');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/household-wallpapers.test.js`

Expected: FAIL because the growth-specific selector and priority rule do not exist.

- [ ] **Step 3: Write minimal implementation**

Add a growth-only selector after the generic wallpaper rules. Use a left-to-right neutral scrim and force the profile title, date, D-day and edit button text to the existing wallpaper text token.

- [ ] **Step 4: Run focused and full verification**

Run: `npx vitest run test/household-wallpapers.test.js && npm test -- --run && npm run check && git diff --check`

Expected: all commands pass.

- [ ] **Step 5: Verify rendered mobile UI**

Open demo mode at 390×844, apply a representative bright photo to the growth card, and verify white/dark modes plus zero console errors.

- [ ] **Step 6: Commit**

```bash
git add family-wallpapers.css test/household-wallpapers.test.js docs/superpowers
git commit -m "fix: restore growth wallpaper contrast"
```
