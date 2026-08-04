# 관리자 운영 도구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 탭에 운영 상태, 데이터 정합성, 관리자 감사, JSON/CSV 내보내기를 압축된 읽기 전용 운영 카드로 추가한다.

**Architecture:** `admin-ops.js`가 기존 `family-admin.js`가 생성한 관리자 뷰에 하나의 접힌 카드를 주입한다. Supabase migration은 관리자 재검증 RPC, 정합성 검사 RPC, 감사 로그 RPC, export RPC를 제공하며 클라이언트는 이를 호출해 요약과 다운로드만 담당한다.

**Tech Stack:** 정적 HTML/CSS/ES module-free browser JavaScript, Supabase Postgres PL/pgSQL, Vitest.

## Global Constraints

- 기존 미커밋 사용자 파일은 staging하지 않는다.
- private_entries와 인증 원문은 export에서 제외한다.
- 관리자 RPC는 `is_platform_admin()` 재검증, 고정 `search_path`, authenticated 실행 권한만 사용한다.
- 상세 운영 내용은 기본 접고 모든 주요 컨트롤은 최소 44px로 유지한다.

---

### Task 1: 운영 도구 계약 테스트

**Files:**
- Create: `test/admin-operations.test.js`
- Test: `admin-ops.js`, `family-admin.js`, `supabase/migrations/20260804_platform_admin_operations.sql`

- [ ] **Step 1: Write the failing test**

  테스트에서 새 운영 모듈의 접힘 계약, 네 요약 영역, JSON/CSV 다운로드, RPC 이름, 감사 action allowlist, 모듈 로더 연결을 검사한다.

- [ ] **Step 2: Run test to verify it fails**

  Run: `npm test -- test/admin-operations.test.js`
  Expected: `admin-ops.js`와 migration이 없어 실패한다.

- [ ] **Step 3: Commit**

  테스트만 별도 commit하지 않고 Task 2 구현과 함께 검증한다.

### Task 2: Supabase 운영 migration

**Files:**
- Create: `supabase/migrations/20260804_platform_admin_operations.sql`
- Create: `supabase/migrations/20260804_platform_admin_operations_acl.sql`
- Create: `supabase/migrations/20260804_platform_admin_operations_rls.sql`
- Test: `test/admin-operations.test.js`

- [ ] **Step 1: Create the migration with the Supabase CLI**

  Run: `supabase migration new platform_admin_operations`
  Rename the generated file to `supabase/migrations/20260804_platform_admin_operations.sql` before editing.

- [ ] **Step 2: Add bounded audit table and protected RPCs**

  Add `platform_admin_audit_logs`, `log_platform_admin_action`, `list_platform_admin_audit_logs`, `get_platform_admin_operations`, and `get_platform_admin_export`. Each function begins with `if not public.is_platform_admin() then raise exception 'platform administrator access required' using errcode = '42501'; end if;` and grants execute only to `authenticated`.

- [ ] **Step 3: Run contract test**

  Run: `npm test -- test/admin-operations.test.js`
  Expected: SQL contract assertions pass once the client module is present in Task 3; until then the client assertions remain the only expected failure.

### Task 3: Compressed admin operations card

**Files:**
- Create: `admin-ops.js`
- Modify: `family-admin.js`
- Modify: `service-worker.js`
- Test: `test/admin-operations.test.js`

- [ ] **Step 1: Add module loading from the existing admin module**

  `family-admin.js` appends `admin-ops.js?v=20260804-operations-v1` once after creating the admin view. The new module waits for `#adminView` and the authenticated context before revealing its card.

- [ ] **Step 2: Render the collapsed card**

  Render three summary tiles, a refresh button, a shared collapse button, warning list, audit list, and two download buttons. Use textContent/escaped HTML for all server values and `Blob` plus an object URL for downloads.

- [ ] **Step 3: Wire operations**

  Call `get_platform_admin_operations`, `list_platform_admin_audit_logs`, and `log_platform_admin_action`. Log `admin_view`, `operations_check`, `export_json`, `export_csv`, and `feature_request_status` only after the corresponding action succeeds. Do not log private content.

- [ ] **Step 4: Add cache invalidation**

  Add `/admin-ops.js` to the service worker force-network allowlist.

- [ ] **Step 5: Run contract tests and syntax checks**

  Run: `npm test -- test/admin-operations.test.js && node --check admin-ops.js && node --check family-admin.js && node --check service-worker.js`
  Expected: all focused tests pass and all checks exit 0.

### Task 4: Audit feature-request status changes

**Files:**
- Modify: `platform-request-admin.js`
- Test: `test/admin-operations.test.js`

- [ ] **Step 1: Add the failing contract**

  Assert that a successful `update_platform_feature_request_status` call is followed by `log_platform_admin_action` with action `feature_request_status` and no request body in metadata.

- [ ] **Step 2: Implement minimal logging**

  After a successful status RPC, call the audit RPC with only `{target_type: 'feature_request', target_id: requestId, next_status: status}`.

- [ ] **Step 3: Verify focused tests**

  Run: `npm test -- test/admin-operations.test.js test/platform-feature-request-admin.test.js`
  Expected: all tests pass.

### Task 5: Apply and verify Supabase schema

**Files:**
- Modify: `supabase/migrations/20260804_platform_admin_operations.sql`

- [ ] **Step 1: Apply migration to the linked project**

  Use the configured Supabase project ref `ljutcgmgtqfkwkxdbiyb` and the Supabase migration tool. Do not expose credentials in logs.

- [ ] **Step 2: Verify protected RPCs and advisors**

  Run an authenticated admin RPC smoke test through the app context, then run Supabase security and performance advisors. Confirm no table grants to anon/authenticated and no advisor finding caused by this migration.

### Task 6: Full verification and delivery

**Files:**
- No additional source files.

- [ ] **Step 1: Run focused and full tests**

  Run: `npm test -- test/admin-operations.test.js test/admin-dashboard-compression.test.js test/admin-recent-activity-graph.test.js test/platform-feature-request-admin.test.js`
  Then run: `npm test`

- [ ] **Step 2: Run static checks**

  Run: `node --check admin-ops.js && node --check family-admin.js && node --check service-worker.js && git diff --check`

- [ ] **Step 3: Commit only feature files**

  Stage only `admin-ops.js`, `family-admin.js`, `platform-request-admin.js`, `service-worker.js`, `supabase/migrations/20260804_platform_admin_operations.sql`, `test/admin-operations.test.js`, and the two docs. Preserve all unrelated dirty files.

- [ ] **Step 4: Push and verify deployment**

  Push `main`, wait until the Pages HTML references `admin-ops.js?v=20260804-operations-v1`, then verify the live administrator tab without claiming data access unless the authenticated browser returns it.
