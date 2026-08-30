# 가족 앱 인증 세션 복구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supabase 요청이 만료 토큰으로 `401`을 반환해도 세션을 한 번 갱신하고 원래 요청을 재시도하며, 복구 불가 시 로그인 상태로 명확히 전환한다.

**Architecture:** `family-auth.js`가 인증 오류 판별과 single-flight `refreshSession()`을 제공한다. `app.js`는 세션 갱신/만료 이벤트를 앱 상태와 연결하고, 초기 가족 데이터 요청은 공통 복구 함수를 사용한다. 할 일·알림·활동 로그는 같은 API를 사용해 초기 병렬 요청의 401 폭주를 막는다.

**Tech Stack:** Vanilla JavaScript, Supabase JS v2, Vitest, GitHub Pages service worker.

## Global Constraints

- 기존 Supabase RLS와 브라우저의 publishable key 경계를 변경하지 않는다.
- 인증 오류만 갱신·재시도하고 다른 DB 오류의 기존 처리와 메시지는 유지한다.
- 요청별 재시도는 최대 1회이며 동시 갱신은 하나만 허용한다.
- 기존 미추적 파일 `.superpowers/`, `HANDOFF.md`, `supabase/.temp/`는 스테이징하지 않는다.

---

### Task 1: 인증 복구 계약

**Files:**
- Create: `family-auth.js`
- Create: `test/family-auth.test.js`
- Modify: `index.html`
- Modify: `service-worker.js`
- Modify: `config.js`

**Interfaces:**
- Produces `window.FAMILY_AUTH_API.isAuthError(error)` and `window.FAMILY_AUTH_API.withRecovery(operation, options)`.
- `withRecovery` accepts an async operation returning a Supabase-like `{ data, error }` result and options `{ supabase, userId }`.

- [ ] **Step 1: Write the failing test**

  Test `isAuthError`, successful retry, concurrent refresh coalescing, and failed-refresh expiration event in `test/family-auth.test.js`.

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx vitest run test/family-auth.test.js`
  Expected: FAIL because `family-auth.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

  Add the browser module with a private `refreshPromise`, one retry per operation, and `family:auth-session-refreshed` / `family:auth-expired` events.

- [ ] **Step 4: Wire delivery**

  Load `family-auth.js` before `app.js`, add it to the runtime manifest, bump the `config.js` and `app.js` cache keys, and mark the asset network-first in the service worker.

- [ ] **Step 5: Run focused tests**

  Run: `npx vitest run test/family-auth.test.js`
  Expected: PASS.

- [ ] **Step 6: Commit**

  Run: `git add family-auth.js test/family-auth.test.js index.html service-worker.js config.js && git commit -m "fix: recover expired family auth sessions"`

### Task 2: 앱 초기 데이터와 모듈 연결

**Files:**
- Modify: `app.js`
- Modify: `activity-log.js`
- Modify: `family-todo.js`
- Modify: `notification-center.js`
- Modify: `test/family-auth.test.js`

**Interfaces:**
- Consumes `window.FAMILY_AUTH_API.withRecovery`.
- Produces login-gate recovery on `family:auth-expired` and automatic retry for initial family data, todos, notifications, and activity logging.

- [ ] **Step 1: Extend failing source-contract tests**

  Assert each affected module calls `FAMILY_AUTH_API.withRecovery`, app listens for both auth events, and the initial membership/data queries are wrapped.

- [ ] **Step 2: Run focused tests to verify failure**

  Run: `npx vitest run test/family-auth.test.js`
  Expected: FAIL on missing source contracts.

- [ ] **Step 3: Implement the smallest wiring**

  Add one app adapter for the shared API, update the current session when refresh succeeds, clear it and bootstrap the signed-out state when refresh fails, and wrap the existing queries without changing their selects or RLS filters.

- [ ] **Step 4: Run focused tests**

  Run: `npx vitest run test/family-auth.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**

  Run: `git add app.js activity-log.js family-todo.js notification-center.js test/family-auth.test.js && git commit -m "fix: retry family data after auth refresh"`

### Task 3: Full verification and delivery

**Files:**
- Modify: exact-version assertions in affected tests only.

- [ ] **Step 1: Run the full test suite**

  Run: `npm test`
  Expected: all tests pass.

- [ ] **Step 2: Run static checks**

  Run: `npm run check && git diff --check`
  Expected: exit code 0.

- [ ] **Step 3: Verify the deployed assets**

  Confirm the public HTML loads the new `family-auth.js` before `app.js`, the public config contains the new manifest version, and a fresh authenticated page no longer leaves the generic network-error state after a recoverable token rejection.

- [ ] **Step 4: Review and deliver**

  Run: `git status --short --branch && git log --oneline -3`
  Report local/remote sync separately and leave unrelated untracked files untouched.
