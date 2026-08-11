# 개인·가족 할 일 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가족 공유 할 일과 로그인 사용자만 볼 수 있는 개인 할 일을 정확한 RLS로 분리한다.

**Architecture:** `family_todos.visibility`는 `family`와 `private`을 구분하고, 정책은 가족 항목 또는 행 작성자만 허용한다. `family-todo.js`는 한 번에 RLS가 허용한 항목을 받아 선택한 범위만 렌더링하며, 캘린더·인수인계에는 가족 스냅샷만 노출한다.

**Tech Stack:** PostgreSQL RLS, Supabase JS, 정적 JavaScript IIFE, CSS custom properties, Vitest.

## Global Constraints

- 기존 할 일은 모두 `family`로 유지한다.
- 개인 행은 다른 가족 구성원의 SELECT, UPDATE, DELETE 응답과 플랫폼 관리자 내보내기에 포함되지 않는다.
- 새 테이블·비공개 데이터의 가족 검색·개인 데이터를 포함한 가족 인수인계는 추가하지 않는다.
- 새 UI 동작은 44px 터치 영역과 기존 테마 토큰을 사용한다.

---

### Task 1: 개인 범위 RLS 마이그레이션을 만든다

**Files:**
- Create: `supabase/migrations/20260811000000_private_family_todos.sql`
- Modify: `supabase/schema.sql`
- Test: `test/private-family-todos.test.js`

**Interfaces:**
- Produces: `family_todos.visibility text not null default 'family'` and owner-only personal rows.

- [ ] **Step 1: Write the failing migration contract test**

```js
expect(migration).toContain("add column if not exists visibility text not null default 'family'");
expect(migration).toContain("visibility in ('family', 'private')");
expect(migration).toContain("created_by = (select auth.uid())");
expect(migration).toContain('prevent_family_todo_creator_change');
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npx vitest run test/private-family-todos.test.js`

Expected: FAIL because migration and scope policy do not exist.

- [ ] **Step 3: Implement the migration and canonical schema**

Add the column, scope index, immutable `created_by` trigger, and replace all four `family_todos` policies. Every policy must require current household membership; private rows also require `(select auth.uid()) = created_by`.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run test/private-family-todos.test.js && git diff --check`

Expected: PASS.

### Task 2: 범위 선택과 원격 매핑을 구현한다

**Files:**
- Modify: `family-todo.js`
- Modify: `family-todo.css`
- Test: `test/private-family-todos.test.js`

**Interfaces:**
- Consumes: `visibility` from Task 1.
- Produces: `FAMILY_TODO_API.getFamilySnapshot()` and selected `moduleState.scope`.

- [ ] **Step 1: Extend failing UI contract test**

```js
expect(todoSource).toContain("const VALID_SCOPES = new Set(['family', 'private'])");
expect(todoSource).toContain('data-todo-scope');
expect(todoSource).toContain('visibility: todo.visibility || \'family\'');
expect(todoSource).toContain('getFamilySnapshot');
```

- [ ] **Step 2: Run focused test and confirm failure**

Run: `npx vitest run test/private-family-todos.test.js`

Expected: FAIL because scope controls and mapper are absent.

- [ ] **Step 3: Implement minimal UI and mappings**

Keep the existing filter controls. Add one scope selector, selected-scope copy, `visibility` to normalize/remote mapping/select lists, and filter rows/stats/calendar by selected or family scope as appropriate.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run test/private-family-todos.test.js test/family-handoff.test.js && node --check family-todo.js`

Expected: PASS.

### Task 3: 가족 표면에서 개인 항목을 제외하고 배포한다

**Files:**
- Modify: `family-handoff.js`
- Modify: `notification-center.js`
- Create: `supabase/migrations/20260811000001_platform_admin_export_private_todos.sql`
- Test: `test/private-family-todos.test.js`

**Interfaces:**
- Consumes: Task 2 `getFamilySnapshot()`.
- Produces: family-only handoff, calendar decoration, and due notifications.

- [ ] **Step 1: Extend failing contract test**

```js
expect(handoff).toContain('getFamilySnapshot');
expect(notificationCenter).toContain(".eq('visibility', 'family')");
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npx vitest run test/private-family-todos.test.js`

Expected: FAIL because shared surfaces can still read private rows.

- [ ] **Step 3: Implement family-only consumers**

Use `getFamilySnapshot()` in handoff, add the visibility filter to direct notification queries and local fallback, and replace the privileged admin export function so it selects only `visibility = 'family'`.

- [ ] **Step 4: Verify and apply live migration**

Run: `npm test -- --run && npm run check && git diff --check`

Apply the same reviewed migration SQL to project `ljutcgmgtqfkwkxdbiyb`, then query `information_schema.columns` and `pg_policies` to confirm visibility and RLS policy replacement.

- [ ] **Step 5: Commit, merge, deploy, and verify Pages**

Stage only feature files, push main, and verify GitHub validation, Pages deployment, and the public module response.

## Self-review

- Scope, RLS, client mapping, and family-only derived surfaces use the same `visibility` names.
- Existing rows are explicitly preserved as `family`.
- Private read protection is enforced by RLS rather than client filtering.
