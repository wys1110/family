# 관리자 대시보드 압축 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 탭의 핵심 통계를 한눈에 노출하고, 다섯 관리자 카드의 상세 영역을 접기/펼치기로 압축한다.

**Architecture:** 기존 관리자 카드의 헤더/요약/본문 구조를 유지하되 공통 `data-admin-card-body`와 `data-admin-collapse` 계약을 추가한다. `family-admin.js`가 관리자 뷰 안의 토글 버튼을 위임 처리하고, 각 카드 모듈은 본문을 해당 속성으로 감싼다. RPC와 데이터 권한 경계는 변경하지 않는다.

**Tech Stack:** Vanilla JavaScript, CSS custom properties, Vitest, Node syntax checks.

## Global Constraints

- 기존 사용자 변경사항(`calendar-font-settings.js`, `config.js`, `refresh-button*`, `settings-layout-polish.css`, 관련 테스트/미추적 파일)은 수정하거나 스테이징하지 않는다.
- 관리자 권한 검증과 Supabase RPC 호출은 변경하지 않는다.
- 모든 상세 기능은 삭제하지 않고 본문 접힘으로만 숨긴다.
- 화이트/다크 모드는 기존 semantic theme token을 사용한다.
- TDD 순서로 실패 테스트를 먼저 확인한다.

### Task 1: 관리자 카드 접기 계약

**Files:**
- Create: `test/admin-dashboard-compression.test.js`
- Modify: `family-admin.js`
- Modify: `family-admin.css`

**Interfaces:**
- Produces `data-admin-collapse`, `data-admin-card-body`, `data-admin-collapsed`, `aria-expanded`, `aria-controls` contracts for all admin cards.

- [ ] **Step 1: Write the failing test**

  Add tests that read `family-admin.js`, `admin-resource-usage.js`, `platform-request-admin.js`, and `admin-recent-activity.js`, then assert each card has a collapse control, an identified body, and an `aria-expanded` contract. Assert the shared CSS hides only `[data-admin-collapsed="true"] [data-admin-card-body]`.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `npm test -- test/admin-dashboard-compression.test.js`.
  Expected: FAIL because the current cards have no shared collapse attributes.

- [ ] **Step 3: Implement the shared collapse behavior**

  Add a `data-admin-collapse` button and `data-admin-card-body` wrapper to the base global card. Add delegated click handling in `family-admin.js` that toggles the closest `.settings-card`, sets `data-admin-collapsed`, updates `aria-expanded`, `aria-controls`, and button text (`접기`/`펼치기`). Add semantic shared CSS for compact header actions and hidden bodies.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Run `npm test -- test/admin-dashboard-compression.test.js`.
  Expected: PASS.

### Task 2: 동적 카드 요약/본문 분리

**Files:**
- Modify: `admin-resource-usage.js`
- Modify: `platform-request-admin.js`
- Modify: `admin-recent-activity.js`

**Interfaces:**
- Each module keeps its existing selectors and RPC behavior while adding the shared collapse attributes.

- [ ] **Step 1: Extend the failing test**

  Assert the three dynamic modules create a `.settings-card` with `data-admin-collapse`, a unique `aria-controls`, and a `data-admin-card-body` wrapper around controls/details.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `npm test -- test/admin-dashboard-compression.test.js`.
  Expected: FAIL for the three dynamic modules.

- [ ] **Step 3: Wrap each dynamic module body**

  Add the same compact header action markup, keep each summary outside the body, and wrap controls, graph/gauges, lists, and notes inside `data-admin-card-body`. Default the body to collapsed by setting `data-admin-collapsed="true"` on creation.

- [ ] **Step 4: Run the focused and existing admin tests**

  Run `npm test -- test/admin-dashboard-compression.test.js test/admin-layout-alignment.test.js test/admin-tab-persistence.test.js test/admin-recent-activity-graph.test.js test/platform-feature-request-admin.test.js`.
  Expected: all tests PASS.

### Task 3: Compact responsive styling and verification

**Files:**
- Modify: `family-admin.css`
- Modify: inline style templates in `admin-resource-usage.js`, `platform-request-admin.js`, `admin-recent-activity.js`

- [ ] **Step 1: Add layout contract assertions**

  Assert the shared card body uses `display: grid`/existing flow only when expanded, the mobile heading action row remains full width, and collapsed cards do not create horizontal overflow.

- [ ] **Step 2: Run RED, then implement compact styles**

  Run the focused test to verify the new style contract fails, then reduce card margins/padding, add a shared action wrapper, preserve 44px touch targets, and keep semantic colors.

- [ ] **Step 3: Run full verification**

  Run `npm test -- test/admin-dashboard-compression.test.js test/admin-layout-alignment.test.js test/admin-tab-persistence.test.js test/admin-recent-activity-graph.test.js test/platform-feature-request-admin.test.js`, `node --check family-admin.js`, `node --check admin-resource-usage.js`, `node --check admin-recent-activity.js`, `node --check platform-request-admin.js`, and `git diff --check`.

- [ ] **Step 4: Commit only scoped files**

  Stage the design/plan docs, the three admin modules, `family-admin.js`, `family-admin.css`, and the new test. Commit with `feat: compress admin dashboard overview` without staging unrelated user changes.
