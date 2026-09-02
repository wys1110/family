# 간결한 성장 기록 알림 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성장 기록 알림을 `모유 · 왼쪽 수유 · 20분 · 엄마`처럼 구체적인 내용만 표시하도록 바꾼다.

**Architecture:** 계정 화면에서 Supabase Auth 사용자 metadata의 `family_role`을 저장한다. Edge Function은 인증된 actor의 metadata에서 호칭을 읽고 카테고리별 구체값을 조합해 푸시 제목을 만들며 본문은 비운다. 기존 클라이언트 변경 감지, 수신자 제외, 알림 저장은 유지한다.

**Tech Stack:** Vanilla JavaScript, Supabase Auth, Supabase Edge Functions, Vitest.

## Global Constraints

- 호칭은 `엄마` 또는 `아빠`만 허용한다.
- `user_metadata`는 표시용으로만 사용하고 권한 판단에는 사용하지 않는다.
- 기존 성장·수유·수면·기저귀·건강 변경 감지와 다른 가족 수신자 규칙을 유지한다.
- 푸시 제목에는 실제 기록 내용과 선택된 호칭만 넣고 본문은 빈 문자열로 저장한다.

### Task 1: 알림 payload 계약 테스트

**Files:**
- Modify: `test/growth-change-notifications.test.js`
- Test: `test/growth-change-notifications.test.js`

**Interfaces:**
- Consumes: `supabase/functions/daily-briefing-push/index.ts` source text.
- Produces: regression assertions for actor role and concise title/body rules.

- [ ] **Step 1: Write the failing test**

```js
test("성장 알림은 구체적인 기록 내용과 기록자 호칭만 제목에 표시한다", () => {
  expect(edge).toContain("user.user_metadata?.family_role");
  expect(edge).toContain("모유 · 왼쪽 수유 · 20분 · 엄마");
  expect(edge).toContain("body: ''");
  expect(edge).not.toContain('created: "성장 기록이 추가됐어요"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/growth-change-notifications.test.js`

Expected: FAIL because the current Edge Function uses a generic growth title and sends details in `body` without reading `family_role`.

- [ ] **Step 3: Commit the failing contract test**

```bash
git add test/growth-change-notifications.test.js
git commit -m "test: define concise growth notification copy"
```

### Task 2: 계정별 엄마/아빠 호칭 저장

**Files:**
- Modify: `app.js:2439-2458`
- Modify: `test/account-notification-role.test.js`

**Interfaces:**
- Consumes: `state.supabase.auth.updateUser`, `state.session.user.user_metadata`.
- Produces: account dialog controls that persist `family_role` as `엄마` or `아빠`.

- [ ] **Step 1: Write the failing test**

```js
test("계정 화면은 알림 호칭을 엄마 또는 아빠로 저장한다", () => {
  expect(app).toContain("family_role");
  expect(app).toContain("엄마");
  expect(app).toContain("아빠");
  expect(app).toContain("auth.updateUser");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/account-notification-role.test.js`

Expected: FAIL because `renderAccount` has no role control or `updateUser` call.

- [ ] **Step 3: Implement the smallest account control**

Add a select with `엄마` and `아빠` to the logged-in household account view. On submit call `state.supabase.auth.updateUser({ data: { family_role: role } })`, update `state.session.user` with the returned user, and show a success or failure toast.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/account-notification-role.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.js test/account-notification-role.test.js
git commit -m "feat: save family notification role"
```

### Task 3: 간결한 서버 알림 제목과 본문

**Files:**
- Modify: `supabase/functions/daily-briefing-push/index.ts:421-448,555-588`
- Modify: `test/growth-change-notifications.test.js`

**Interfaces:**
- Consumes: normalized growth change and authenticated `user.user_metadata.family_role`.
- Produces: `buildGrowthChangePayload(change, actorLabel)` with concise `title` and empty `body`.

- [ ] **Step 1: Extend the failing test**

```js
test("수유 알림은 종류·방향·시간·기록자만 포함한다", () => {
  expect(edge).toContain("feedingType");
  expect(edge).toContain("feedingSide");
  expect(edge).toContain("feedingMinutes");
  expect(edge).toContain("actorLabel");
  expect(edge).toContain("title: details.join");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/growth-change-notifications.test.js`

Expected: FAIL because the current formatter uses category/title in `body` and generic action text in `title`.

- [ ] **Step 3: Implement the formatter**

Normalize `family_role` to `엄마` or `아빠`, build category-specific details, append the actor when present, set `title` to the joined details, and set `body` to `''`. Keep URL, tag, source IDs, and `renotify` unchanged.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- test/growth-change-notifications.test.js test/event-change-push.test.js`

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/daily-briefing-push/index.ts test/growth-change-notifications.test.js
git commit -m "feat: show concise growth notification details"
```

### Task 4: 전체 검증 및 배포

**Files:**
- Modify: `docs/superpowers/plans/2026-09-03-concise-growth-notification-copy.md`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all test files and tests pass.

- [ ] **Step 2: Run static checks**

Run: `npm run check && git diff --check`

Expected: syntax, TypeScript, theme guard, and whitespace checks pass.

- [ ] **Step 3: Deploy the Edge Function**

Deploy `daily-briefing-push` from the updated `supabase/functions/daily-briefing-push/index.ts`, preserving its existing JWT configuration and secrets.

- [ ] **Step 4: Push the branch and merge into main**

```bash
git push -u origin feature/concise-growth-notifications
git -C /Users/yongseokwon/dev/family merge --ff-only feature/concise-growth-notifications
git -C /Users/yongseokwon/dev/family push origin main
```

- [ ] **Step 5: Verify**

Confirm Edge Function status is `ACTIVE`, Pages workflow succeeds for the merged commit, and the public app still loads the notification settings screen.
