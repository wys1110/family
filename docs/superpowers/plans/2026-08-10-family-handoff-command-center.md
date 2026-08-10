# Family 인수인계 커맨드 센터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가족이 앱을 열면 현재 아기의 마지막 돌봄, 가장 급한 할 일, 다음 일정을 보고 한 번의 탭으로 이어서 처리하게 한다.

**Architecture:** 새 `family-handoff.js`는 기존 전역 `state`, `FAMILY_TODO_API`, `familycontextchange` 이벤트를 읽기 전용으로 조합해 히어로 카드 바로 아래에 카드 하나를 만든다. 원본 일정·성장 기록·할 일 저장 로직은 바꾸지 않고, 동작 버튼은 기존 성장 빠른 기록·할 일 완료·일정 탭으로만 연결한다.

**Tech Stack:** 정적 HTML, 브라우저 JavaScript IIFE 모듈, CSS custom properties, Supabase가 이미 동기화한 `state`, Vitest.

## Global Constraints

- 새 데이터베이스 테이블, AI 판단, 의료·수유 시간 예측을 추가하지 않는다.
- 현재 가족의 `state`와 `FAMILY_TODO_API.getSnapshot()`만 읽고 다른 `household_id`를 요청하지 않는다.
- 카드 문구는 데이터가 없을 때 추측하지 않고 `오늘 첫 기록을 남겨보세요`를 표시한다.
- 버튼은 최소 44px 터치 영역을 보장하고, 390px에서 가로 넘침이 없어야 한다.
- 새 CSS 색상은 직접 리터럴이 아닌 기존 `--theme-*`, `--surface`, `--label`, `--secondary`, `--separator` 토큰을 사용한다.

---

### Task 1: 인수인계 상태를 순수 함수로 계산한다

**Files:**
- Create: `family-handoff.js`
- Test: `test/family-handoff.test.js`

**Interfaces:**
- Consumes: `state.events`, `state.growthEntries`, `state.activeBabyId`, `window.FAMILY_TODO_API.getSnapshot()`.
- Produces: `window.FAMILY_HANDOFF_API.getSnapshot(): { latestCare, priorityTodo, nextEvent, action }`.

- [ ] **Step 1: Write the failing test**

```js
test('현재 아기 기록과 오늘 마감 미완료 할 일을 인수인계 우선순위로 사용한다', () => {
  expect(source).toContain("const activeBabyEntries = () =>");
  expect(source).toContain("todo => !todo.completed && todo.dueDate && todo.dueDate <= today");
  expect(source).toContain("window.FAMILY_HANDOFF_API = { getSnapshot");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/family-handoff.test.js`

Expected: FAIL because `family-handoff.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
const activeBabyEntries = () => (state?.growthEntries || [])
  .filter((entry) => !state?.activeBabyId || entry.babyId === state.activeBabyId)
  .sort((a, b) => `${b.date}T${b.time || '00:00'}T${b.createdAt || ''}`.localeCompare(`${a.date}T${a.time || '00:00'}T${a.createdAt || ''}`));

const getSnapshot = () => {
  const today = dateKey();
  const todos = window.FAMILY_TODO_API?.getSnapshot?.() || [];
  const priorityTodo = todos.find((todo) => !todo.completed && todo.dueDate && todo.dueDate <= today) || null;
  const nextEvent = (state?.events || []).filter((event) => event.date >= today)
    .sort((a, b) => `${a.date}T${a.time || '99:99'}`.localeCompare(`${b.date}T${b.time || '99:99'}`))[0] || null;
  return { latestCare: activeBabyEntries()[0] || null, priorityTodo, nextEvent };
};

window.FAMILY_HANDOFF_API = { getSnapshot };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/family-handoff.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- family-handoff.js test/family-handoff.test.js
git commit -m "feat: derive family handoff priority"
```

### Task 2: 카드와 기존 동작 연결을 추가한다

**Files:**
- Modify: `family-handoff.js`
- Modify: `family-todo.js`
- Test: `test/family-handoff.test.js`

**Interfaces:**
- Consumes: Task 1 `getSnapshot()`.
- Produces: `FAMILY_TODO_API.toggle(id)` and visible `[data-family-handoff-action]` control.

- [ ] **Step 1: Extend the failing test**

```js
test('인수인계 카드가 기존 기록·할 일·일정 동작만 재사용한다', () => {
  expect(source).toContain('data-family-handoff-action');
  expect(source).toContain("window.FAMILY_TODO_API?.toggle?.(snapshot.priorityTodo.id)");
  expect(todoSource).toContain('toggle: (id) => toggleTodo(moduleState.todos.find((todo) => todo.id === id))');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/family-handoff.test.js`

Expected: FAIL because the card, click handler, and todo API method are absent.

- [ ] **Step 3: Add the minimal UI and actions**

```js
card.innerHTML = `
  <p class="eyebrow">FAMILY HANDOFF</p>
  <h2>지금 이어서 할 일</h2>
  <p data-family-handoff-summary></p>
  <small data-family-handoff-detail></small>
  <button type="button" data-family-handoff-action></button>`;

const action = () => {
  const snapshot = getSnapshot();
  if (snapshot.priorityTodo) return window.FAMILY_TODO_API?.toggle?.(snapshot.priorityTodo.id);
  if (snapshot.latestCare) return document.querySelector('[data-view="growth"]')?.click();
  return document.querySelector('[data-view="growth"]')?.click();
};

window.FAMILY_TODO_API = {
  getSnapshot: () => moduleState.todos.map((todo) => ({ ...todo })),
  open: (todo) => openTodoDialog(todo),
  toggle: (id) => toggleTodo(moduleState.todos.find((todo) => todo.id === id)),
};
```

The renderer must set one deterministic state only:

- `priorityTodo`: title, due label, `할 일 완료` button.
- `latestCare`: latest category/title/time, `돌봄 기록 보기` button.
- `nextEvent`: next event title/time/member, `일정 보기` button.
- no data: `오늘 첫 기록을 남겨보세요`, `성장 기록하기` button.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run test/family-handoff.test.js test/today-overview.test.js && node --check family-handoff.js && node --check family-todo.js`

Expected: PASS and both syntax checks exit 0.

- [ ] **Step 5: Commit**

```bash
git add -- family-handoff.js family-todo.js test/family-handoff.test.js
git commit -m "feat: add family handoff actions"
```

### Task 3: 모바일 카드 스타일과 재렌더 연결을 완성한다

**Files:**
- Create: `family-handoff.css`
- Modify: `family-handoff.js`
- Modify: `config.js`
- Modify: `test/family-handoff.test.js`

**Interfaces:**
- Consumes: Task 2 card and `family:todo-snapshot-changed`, `family:growth-entry-saved`, `familycontextchange` events.
- Produces: responsive `family-handoff-card` and module registration.

- [ ] **Step 1: Extend the failing test**

```js
test('카드는 현재 데이터 변경을 구독하고 버전 모듈로 로드한다', () => {
  expect(source).toContain("'family:todo-snapshot-changed'");
  expect(source).toContain("'family:growth-entry-saved'");
  expect(source).toContain("'familycontextchange'");
  expect(css).toContain('min-height: 44px');
  expect(config).toContain('{ name: "family-handoff", version: "20260810-v1" }');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/family-handoff.test.js`

Expected: FAIL because the stylesheet and registered module do not exist.

- [ ] **Step 3: Add semantic, responsive CSS and refresh listeners**

```css
.family-handoff-card { padding: 16px; border: 1px solid var(--separator); border-radius: 20px; background: var(--surface); }
.family-handoff-card [data-family-handoff-action] { width: 100%; min-height: 44px; color: var(--label); background: var(--surface-2); }
@media (max-width: 520px) { .family-handoff-card { padding: 14px; } }
```

```js
['familycontextchange', 'family:growth-entry-saved', 'family:todo-snapshot-changed'].forEach((eventName) => {
  window.addEventListener(eventName, render);
});
```

Append `{ name: "family-handoff", version: "20260810-v1" }` after `today-overview` in `config.js`, so it loads after the existing overview module while rendering above it.

- [ ] **Step 4: Run full verification and mobile check**

Run: `npm test -- --run && npm run check && git diff --check`

Expected: all tests pass and no new direct-color violation.

At `?demo=1`, check 390×844 and 430×932:

1. the card appears directly below the family hero card, before `오늘 한눈에 보기`;
2. action button is visible without horizontal scrolling;
3. completing the most urgent todo updates the card;
4. adding a growth entry updates the latest-care line;
5. no image, note, or another household's data is displayed.

- [ ] **Step 5: Commit and deploy**

```bash
git add -- family-handoff.js family-handoff.css family-todo.js config.js test/family-handoff.test.js
git commit -m "feat: ship family handoff command center"
git push origin main
```

Verify the GitHub Actions validation and Pages deployment for the commit, then load `https://wys1110.github.io/family/?demo=1` and verify the mobile card again.

## Self-review

- Coverage: the plan implements only the first 0~30-day feature, not speculative AI, health advice, new data collection, or native packaging.
- Data safety: the card derives only current in-memory household data; no new cross-household query or database mutation exists.
- Type consistency: `FAMILY_HANDOFF_API.getSnapshot`, `FAMILY_TODO_API.toggle(id)`, and all custom event names are defined before being consumed.
- Placeholder scan: unknown-content state has explicit copy and action.
