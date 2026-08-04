# 관리자 탭 시각·반응형 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 탭의 테마 잔재, 조작 높이, 하위 카드 폭 불일치를 최소 CSS 변경으로 정리한다.

**Architecture:** 기존 `family-admin.css`를 관리자 공통 토큰·그리드의 단일 진입점으로 유지한다. 동적으로 주입되는 최근 활동/전체 요청 스타일은 해당 모듈의 기존 문자열만 조정해 인증과 데이터 로직을 건드리지 않는다.

**Tech Stack:** Vanilla JavaScript, CSS custom properties, Vitest, GitHub Pages.

## Global Constraints

- 관리자 인증 조건과 Supabase RPC는 변경하지 않는다.
- 화이트/다크 공통 의미 토큰(`--surface`, `--surface-2`, `--label`, `--separator`)을 우선 사용한다.
- 기존 사용자 변경 파일은 stage하지 않는다.
- 코드 수정 전 실패 테스트를 확인하고, 완료 전 focused tests와 `git diff --check`를 실행한다.

---

### Task 1: 관리자 레이아웃 계약 추가

**Files:**
- Modify: `test/admin-layout-alignment.test.js`

- [ ] **Step 1: Write the failing tests**

  `family-admin.css`의 관리자 아바타 semantic token, 44px 전환/새로고침 높이, 관리자 하위 카드 전체 폭을 검증하고, `admin-recent-activity.js`와 `platform-request-admin.js`의 모바일 새로고침 확장 및 최근 활동 컨트롤 높이를 검증한다.

- [ ] **Step 2: Run the focused test**

  Run: `npm test -- test/admin-layout-alignment.test.js`
  Expected: FAIL because the current avatar uses `#fff`/`--theme-hero-*`, mode buttons use 38px, and dynamic module rules do not contain the shared mobile width contract.

### Task 2: 공통 관리자 스타일 구현

**Files:**
- Modify: `family-admin.css`

- [ ] **Step 1: Replace the avatar with semantic theme tokens**

  Set `.global-admin-avatar` foreground to `var(--label)` and its gradient to `linear-gradient(145deg, var(--surface), var(--surface-2))`.

- [ ] **Step 2: Normalize interaction and card sizing**

  Set `.admin-refresh-button` and `.global-admin-modes button` to `min-height: 44px`, and add `.admin-view > .settings-card` to the existing full-width, box-sizing contract.

### Task 3: 동적 관리자 카드 모바일 규칙 정렬

**Files:**
- Modify: `admin-recent-activity.js`
- Modify: `platform-request-admin.js`

- [ ] **Step 1: Normalize recent-activity controls**

  Change the two recent-activity input/select controls from 42px to 44px.

- [ ] **Step 2: Normalize mobile refresh buttons**

  Add `width: 100%; max-width: 100%; box-sizing: border-box;` to the existing mobile refresh-button rules in both dynamic modules.

### Task 4: 검증 및 통합

**Files:**
- No unrelated files staged.

- [ ] **Step 1: Run focused admin tests**

  Run: `npm test -- test/admin-layout-alignment.test.js test/admin-tab-persistence.test.js test/admin-recent-activity-graph.test.js`

- [ ] **Step 2: Run hygiene checks**

  Run: `git diff --check`.

- [ ] **Step 3: Verify deployed assets**

  Fetch `https://wys1110.github.io/family/family-admin.css` and the two JavaScript assets with a cache-busting query; confirm HTTP 200 and the semantic avatar/mobile tokens.

- [ ] **Step 4: Commit only scoped files**

  Commit `family-admin.css`, the two admin module files, the focused test, and the two superpowers docs with message `fix: polish admin tab theme and mobile layout`.
