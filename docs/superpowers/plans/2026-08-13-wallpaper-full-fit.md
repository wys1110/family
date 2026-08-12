# Wallpaper Full Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일정·성장 카드의 가족 월페이퍼를 모바일에서 잘리지 않게 전체 표시한다.

**Architecture:** 기존 CSS 다중 배경 구조와 저장 로직은 유지한다. 첫 번째 그라데이션 레이어는 카드 전체 크기, 두 번째 사진 레이어는 `contain`과 오른쪽 중앙 정렬을 사용하며 자산 버전만 갱신한다.

**Tech Stack:** Static HTML, CSS, JavaScript, Vitest

## Global Constraints

- 일정·성장 카드 모두 동일하게 사진 전체를 표시한다.
- 기존 가독성 그라데이션과 성장 카드 대비 보정을 유지한다.
- 카드 레이아웃과 데이터 저장·격리 로직은 변경하지 않는다.
- 새 의존성을 추가하지 않는다.

---

### Task 1: 월페이퍼 전체 표시 규칙

**Files:**
- Modify: `test/household-wallpapers.test.js`
- Modify: `family-wallpapers.css`
- Modify: `config.js`

**Interfaces:**
- Consumes: `--wallpaper-image`, `--theme-wallpaper-scrim-*`, `[data-wallpaper-surface]`
- Produces: 그라데이션 `100% 100%`와 사진 `contain`으로 구성된 두 레이어 렌더링

- [ ] **Step 1: 사진 전체 표시를 요구하는 실패 테스트 작성**

```js
test('shows the full calendar and growth wallpaper without cropping', () => {
  expect(css).toContain('background-position: center, right center;');
  expect(css).toContain('background-size: 100% 100%, contain;');
  expect(css).toContain('background-repeat: no-repeat;');
  expect(config).toContain('{ name: "family-wallpapers", version: "20260813-full-fit-v1", script: false }');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/household-wallpapers.test.js`

Expected: 기존 `background-size: cover`와 이전 자산 버전 때문에 FAIL.

- [ ] **Step 3: 최소 CSS 수정과 자산 버전 갱신**

```css
background-position: center, right center;
background-size: 100% 100%, contain;
background-repeat: no-repeat;
```

성장 카드의 단일 `background-position` 재정의도 같은 두 레이어 값으로 바꾼다. `config.js`의 `family-wallpapers` 버전을 `20260813-full-fit-v1`로 변경한다.

- [ ] **Step 4: 집중·전체 검증**

Run: `npx vitest run test/household-wallpapers.test.js && npm test -- --run && npm run check && git diff --check`

Expected: 모든 명령이 exit code 0.

- [ ] **Step 5: 커밋**

```bash
git add family-wallpapers.css config.js test/household-wallpapers.test.js docs/superpowers/specs/2026-08-13-wallpaper-full-fit-design.md docs/superpowers/plans/2026-08-13-wallpaper-full-fit.md
git commit -m "fix: show full family wallpapers"
```
