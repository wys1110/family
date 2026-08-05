# 가족 앱 실사용 유틸리티 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가족별 데이터 경계를 유지하면서 오늘 요약, 통합 검색, 기존 역할 기반 관리 컨트롤, 앱 내 알림 상태 보강을 추가한다.

**Architecture:** `family-utility.js`가 순수 집계·검색 함수를 제공하고, `today-overview.js`와 `family-search.js`가 각각 화면을 담당한다. 할 일·알림 모듈은 기존 데이터를 외부로 복제하지 않고 읽기 전용 snapshot API와 상태 이벤트만 노출한다. 권한은 기존 `household_members.role`을 앱 컨텍스트에 연결해 owner 전용 관리 컨트롤을 숨기며, 새 역할이나 전체 RLS 재설계는 하지 않는다.

**Tech Stack:** 기존 정적 HTML/JavaScript/CSS, Vitest, Supabase JS v2, 기존 Service Worker/모듈 manifest

## Global Constraints

- 현재 household 컨텍스트의 데이터만 집계·검색한다.
- household ID, 사용자 ID, access token, 비공개 사진 URL을 검색 인덱스나 DOM 결과에 넣지 않는다.
- 검색어와 검색 결과는 저장하지 않는다.
- owner 정보가 없으면 관리 컨트롤을 숨긴다.
- 다크/화이트 테마 토큰만 사용하고 고정 색상을 추가하지 않는다.
- 검색 버튼, 결과 행, 요약 항목은 최소 44px 터치 영역을 갖는다.
- VAPID 키, Edge Function, Cron 배포와 실제 백그라운드 푸시 검증은 범위에서 제외한다.
- 기존 dirty 파일 중 `refresh-button.*`와 기존 테스트는 변경하거나 stage하지 않는다. `config.js`는 새 모듈 manifest 항목만 추가·수정하고, 현재 dirty인 다른 hunks는 보존하며 stage하지 않는다.

---

### Task 1: 공유 집계·검색 유틸리티

**Files:**
- Create: `family-utility.js`
- Test: `test/family-utility.test.js`

**Interfaces:**
- Produces `window.FAMILY_UTILITY_API.todaySummary({ events, growthEntries, todos, unreadNotifications, todayKey })` returning `{ eventCount, nextEvent, todoCount, feedingMl, feedingMinutes, sleepMinutes, diaperCount, unreadNotifications }`.
- Produces `window.FAMILY_UTILITY_API.searchRecords({ events, growthEntries, todos, query, filter })` returning records shaped as `{ type, id, title, date, subtitle, source }`.
- `filter` accepts only `all`, `event`, `growth`, `todo`; malformed values resolve to `all`.

- [ ] **Step 1: Write the failing pure-function tests**

```js
test('오늘 요약은 현재 날짜의 일정·돌봄·미완료 할 일만 집계한다', () => {
  const result = api.todaySummary({
    todayKey: '2026-08-05',
    events: [
      { id: 'e1', title: '소아과', date: '2026-08-05', time: '14:30' },
      { id: 'e2', title: '지난 일정', date: '2026-08-04', time: '09:00' },
    ],
    growthEntries: [
      { category: '수유·이유식', date: '2026-08-05', feedingMl: 120 },
      { category: '수면', date: '2026-08-05', sleepMinutes: 80 },
      { category: '기저귀', date: '2026-08-05' },
    ],
    todos: [
      { id: 't1', dueDate: '2026-08-05', completed: false },
      { id: 't2', dueDate: '2026-08-05', completed: true },
    ],
    unreadNotifications: 2,
  });

  expect(result).toMatchObject({ eventCount: 1, todoCount: 1, feedingMl: 120, sleepMinutes: 80, diaperCount: 1, unreadNotifications: 2 });
  expect(result.nextEvent).toMatchObject({ id: 'e1', title: '소아과' });
});

test('검색은 제목·메모·담당자에서 찾고 유형 필터를 적용한다', () => {
  const records = api.searchRecords({
    query: '예방',
    filter: 'event',
    events: [{ id: 'e1', title: '예방접종', note: '아기수첩', date: '2026-08-05', member: '가족' }],
    growthEntries: [{ id: 'g1', title: '예방 기록', date: '2026-08-05', category: '건강·병원' }],
    todos: [],
  });

  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ type: 'event', id: 'e1', source: 'event' });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run test/family-utility.test.js`

Expected: FAIL because `family-utility.js` does not expose `FAMILY_UTILITY_API`.

- [ ] **Step 3: Implement the minimal utility module**

Implement `dateKey`-safe comparisons, null-safe numeric totals, next-event sorting by date/time, and case-insensitive Korean/Unicode matching. Normalize records without copying household/user/private fields into results. Export exactly:

```js
window.FAMILY_UTILITY_API = { todaySummary, searchRecords };
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run test/family-utility.test.js`

Expected: 2 tests passed.

- [ ] **Step 5: Commit the utility boundary**

```bash
git add family-utility.js test/family-utility.test.js
git commit -m "feat: add family utility aggregation helpers"
```

### Task 2: 오늘 한눈에 보기 카드

**Files:**
- Create: `today-overview.js`
- Create: `today-overview.css`
- Modify: `config.js: modules manifest only, add today-overview entry after family-utility`
- Test: `test/today-overview.test.js`

**Interfaces:**
- Consumes `FAMILY_UTILITY_API.todaySummary`, `state.events`, `state.growthEntries`, `FAMILY_TODO_API.getSnapshot()`, and `FAMILY_NOTIFICATION_API.getUnreadCount()`.
- Produces `#todayOverviewCard` under `#calendarView`, with buttons carrying `data-today-overview-target` values `calendar`, `growth`, `todo`, and `notifications`.
- Dispatches no new persistence event; listens to `familycontextchange`, `family:growth-entry-saved`, `family:todo-snapshot-changed`, and `family:notification-count-changed`.

- [ ] **Step 1: Write the failing DOM contract tests**

```js
test('오늘 요약 카드는 네 가지 요약 항목과 접근 가능한 이름을 가진다', () => {
  expect(source).toContain('id="todayOverviewCard"');
  expect(source).toContain('data-today-overview-target="calendar"');
  expect(source).toContain('data-today-overview-target="todo"');
  expect(source).toContain('data-today-overview-target="notifications"');
  expect(css).toContain('min-height: 44px');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run test/today-overview.test.js`

Expected: FAIL because the module and card do not exist.

- [ ] **Step 3: Implement the card and isolated fallback states**

Create the card once after the hero section, render zero/empty labels when optional modules are unavailable, and route clicks through existing `setView`, the family-todo mode button, and `#notificationCenterButton`. Use CSS variables (`--surface`, `--label`, `--secondary`, `--separator`) and a two-column mobile grid with 44px buttons.

Add the following manifest entries without changing unrelated versions:

```js
{ name: "family-utility", version: "20260805-family-utility-v1", style: false },
{ name: "today-overview", version: "20260805-today-overview-v1" },
```

- [ ] **Step 4: Export existing snapshots needed by the card**

In `family-todo.js`, expose `window.FAMILY_TODO_API.getSnapshot = () => [...moduleState.todos]` and dispatch `family:todo-snapshot-changed` after each successful load/render. In `notification-center.js`, expose `window.FAMILY_NOTIFICATION_API.getUnreadCount = () => newItems().length` and dispatch `family:notification-count-changed` after `render()` updates the badge. Do not expose raw Supabase rows or credentials.

- [ ] **Step 5: Run focused tests and syntax checks**

Run: `npx vitest run test/family-utility.test.js test/today-overview.test.js && node --check family-utility.js && node --check today-overview.js`

Expected: all focused tests pass and both syntax checks exit 0.

- [ ] **Step 6: Commit the first vertical slice**

```bash
git add family-utility.js family-todo.js notification-center.js today-overview.js today-overview.css config.js test/family-utility.test.js test/today-overview.test.js
git commit -m "feat: add today family overview"
```

### Task 3: 통합 검색 시트

**Files:**
- Create: `family-search.js`
- Create: `family-search.css`
- Modify: `config.js: add family-search manifest entry`
- Test: `test/family-search.test.js`

**Interfaces:**
- Consumes `FAMILY_UTILITY_API.searchRecords`, current household `state.events`/`state.growthEntries`, and `FAMILY_TODO_API.getSnapshot()`.
- Produces `#familySearchDialog`, `#familySearchButton`, and `data-family-search-result` rows.
- Calls existing `openEventDialog(event)`, `openGrowthDialog(entry)`, and a `FAMILY_TODO_API.open(todo)` adapter when a result is selected.

- [ ] **Step 1: Write failing search tests**

```js
test('검색 시트는 저장하지 않고 유형 필터와 결과 접근 이름을 제공한다', () => {
  expect(source).toContain('id="familySearchDialog"');
  expect(source).toContain('data-family-search-filter="all"');
  expect(source).toContain('data-family-search-result');
  expect(source).not.toContain('localStorage.setItem');
  expect(css).toContain('min-height: 44px');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run test/family-search.test.js`

Expected: FAIL because the search module does not exist.

- [ ] **Step 3: Implement search UI and result routing**

Use an in-memory `query` and `filter`, render a short empty state, debounce input by 120ms, and close the dialog before opening an existing editor. Clear the query on close. Do not write query text to storage; the contract test rejects a direct `localStorage.setItem` persistence call.

- [ ] **Step 4: Add the todo adapter and manifest entry**

Expose `FAMILY_TODO_API.open(todo)` from `family-todo.js` by calling the existing `openTodoDialog(todo)`. Add:

```js
{ name: "family-search", version: "20260805-family-search-v1" },
```

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run test/family-utility.test.js test/family-search.test.js && node --check family-search.js`

Expected: all focused tests pass.

- [ ] **Step 6: Commit the search slice**

```bash
git add family-search.js family-search.css family-todo.js config.js test/family-search.test.js
git commit -m "feat: add household-wide family search"
```

### Task 4: owner/member 최소 권한 컨텍스트

**Files:**
- Modify: `app.js: bootstrapData membership select and state context event`
- Modify: `config.js: add family-permissions manifest entry before settings modules`
- Modify: `settings-family-management.js: render member/backup/export controls`
- Modify: `settings-data-export.js: disable export for non-owner`
- Test: `test/family-permissions.test.js`

**Interfaces:**
- Adds `state.householdRole`, with values `owner`, `member`, or `null`.
- Adds `window.FAMILY_PERMISSIONS_API.canManage(role)`, which returns true only for `owner`.
- `familycontextchange.detail.householdRole` carries the current role without exposing user identifiers.

- [ ] **Step 1: Write failing permission tests**

```js
test('관리 권한은 owner만 허용하고 role 누락은 거부한다', () => {
  expect(canManage('owner')).toBe(true);
  expect(canManage('member')).toBe(false);
  expect(canManage(null)).toBe(false);
});

test('owner 전용 문구와 컨트롤 계약이 소스에 존재한다', () => {
  expect(settingsSource).toContain('가족 관리자만 사용할 수 있어요');
  expect(exportSource).toContain('canManage');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run test/family-permissions.test.js`

Expected: FAIL because role state and permission API do not exist.

- [ ] **Step 3: Load the existing role and publish it**

Change the membership query to select `household_id, role, households(id,name,invite_code)`, set `state.householdRole = memberships?.[0]?.role || null`, reset it to null during sign-out/household switching, and include it in `familycontextchange.detail`. Keep demo/local mode as `owner` only for the existing test-mode controls.

- [ ] **Step 4: Add the minimal permission API and guards**

Create a small `family-permissions.js` module exposing `canManage`. In settings family management, settings data export, JSON restore, member archive/edit, and export buttons, render a disabled owner-required status for non-owners instead of binding mutation handlers. Do not alter existing daily event/growth/todo write policies or claim a new database security boundary.

Add this manifest entry before the settings modules so the guard is available when settings render:

```js
{ name: "family-permissions", version: "20260805-family-permissions-v1" },
```

- [ ] **Step 5: Run focused tests and syntax checks**

Run: `npx vitest run test/family-permissions.test.js test/settings-family-management.test.js test/settings-data-export.test.js && node --check app.js && node --check family-permissions.js`

Expected: all permission/settings tests pass.

- [ ] **Step 6: Commit the permission slice**

```bash
git add app.js family-permissions.js settings-family-management.js settings-data-export.js test/family-permissions.test.js config.js
git commit -m "feat: gate family management controls by role"
```

### Task 5: 알림 상태와 오늘 카드 연결

**Files:**
- Modify: `notification-center.js: public count adapter and status helper`
- Modify: `daily-briefing.js: explicit unsupported/not-configured status`
- Modify: `settings.js: render notification status card in existing settings area`
- Test: `test/family-notification-status.test.js`

**Interfaces:**
- `FAMILY_NOTIFICATION_API.getUnreadCount()` returns a number and never throws.
- `FAMILY_NOTIFICATION_API.getDeliveryStatus()` returns `{ permission, serviceWorker, pushReady, mode }`, where `mode` is `in-app`, `push-ready`, or `not-configured`.

- [ ] **Step 1: Write failing notification status tests**

```js
test('푸시 설정이 없을 때 성공으로 표시하지 않는다', () => {
  expect(source).toContain('not-configured');
  expect(source).toContain('VAPID');
  expect(source).toContain('알림 연결 상태');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run test/family-notification-status.test.js`

Expected: FAIL because the explicit delivery status API and copy do not exist.

- [ ] **Step 3: Implement status-only behavior**

Keep existing reminder scheduling and notification center filters. Report browser permission and service-worker availability, use `pushReady` only after a real subscription sync succeeds, and show `실제 푸시 설정 필요` when the Edge Function/public key is absent. Never request notification permission during page load.

- [ ] **Step 4: Connect the count event to today overview**

After notification render updates the badge, dispatch `family:notification-count-changed`; `today-overview.js` re-renders only its count and does not reload family rows.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run test/family-notification-status.test.js test/today-overview.test.js && node --check notification-center.js && node --check daily-briefing.js`

Expected: all focused tests pass.

- [ ] **Step 6: Commit the notification slice**

```bash
git add notification-center.js daily-briefing.js settings.js test/family-notification-status.test.js
git commit -m "feat: clarify family notification delivery status"
```

### Task 6: 통합 검증·배포

**Files:**
- Modify: only version strings in `config.js` for the new modules if a cache bump is required
- Test: existing relevant suites plus new utility suites

- [ ] **Step 1: Run syntax and focused suites**

```bash
node --check app.js
node --check family-utility.js
node --check today-overview.js
node --check family-search.js
node --check family-permissions.js
node --check notification-center.js
npx vitest run test/family-utility.test.js test/today-overview.test.js test/family-search.test.js test/family-permissions.test.js test/family-notification-status.test.js test/settings-family-management.test.js test/settings-data-export.test.js
git diff --check
```

- [ ] **Step 2: Run the full suite and record unrelated failures**

Run: `npm test`

Expected: new suites pass. Any failures from the pre-existing dirty theme/refresh files are reported without changing those files.

- [ ] **Step 3: Verify the deployed static surface**

After pushing, confirm the Pages workflow succeeds, fetch each new versioned module from `https://wys1110.github.io/family/`, and verify the response contains its module marker. In the demo page, verify the overview, search sheet, and notification status without making an authenticated claim.

- [ ] **Step 4: Commit and push only requested files**

```bash
git status --short
git diff --check
git push origin main
git ls-remote origin refs/heads/main
```

Do not stage `config.js` hunks unrelated to the new module entries or any existing dirty tests/styles.
