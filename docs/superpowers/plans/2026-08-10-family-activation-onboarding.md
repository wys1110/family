# Family 3분 시작 체크리스트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 가족이 아기 등록, 첫 기록, 실제 보호자 연결을 정확한 데이터 기반의 짧은 체크리스트로 끝내게 한다.

**Architecture:** 새 브라우저 IIFE 모듈은 전역 `state`의 현재 아기·성장 기록과 현재 `household_id`만 읽어 진행 상태를 계산한다. 원격 가족일 때만 기존 RLS가 적용된 `household_members`의 count 질의를 수행하며, 기존 대화상자와 계정 초대 화면을 재사용한다.

**Tech Stack:** 정적 HTML, 브라우저 JavaScript IIFE, CSS custom properties, Supabase JavaScript client, Vitest.

## Global Constraints

- 새 데이터베이스 테이블·마이그레이션·분석 이벤트를 추가하지 않는다.
- 현재 `state.household.id`와 일치하는 구성원 수만 요청하며, 다른 가족 데이터는 읽거나 표시하지 않는다.
- 초대 링크를 보낸 것만으로 연결을 완료 처리하지 않는다.
- 소유자만 초대 화면으로 이동할 수 있고, 일반 구성원에게는 대기 안내만 보인다.
- 모든 새 색상은 기존 테마 토큰만 사용하며, 행동 버튼은 최소 44px 높이로 한다.

---

### Task 1: 실제 데이터 기반 진행 상태를 만든다

**Files:**
- Create: `family-onboarding.js`
- Test: `test/family-onboarding.test.js`

**Interfaces:**
- Consumes: `state.babies`, `state.activeBabyId`, `state.growthEntries`, `state.household`, `state.householdRole`, `state.supabase`, `state.session`.
- Produces: `window.FAMILY_ONBOARDING_API.getSnapshot(): { hasBaby, hasFirstCare, memberCount, isOwner, complete }`.

- [ ] **Step 1: Write the failing test**

```js
test('현재 아기 기록과 실제 가족 구성원 수로 시작 단계를 계산한다', () => {
  expect(source).toContain('const hasFirstCare = (current) =>');
  expect(source).toContain("from('household_members')");
  expect(source).toContain(".eq('household_id', householdId)");
  expect(source).toContain('window.FAMILY_ONBOARDING_API = { getSnapshot }');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/family-onboarding.test.js`

Expected: FAIL because `family-onboarding.js` does not exist.

- [ ] **Step 3: Write the minimal implementation**

```js
const hasFirstCare = (current) => Boolean((current?.growthEntries || []).some((entry) => entry.babyId === current?.activeBabyId));
const getSnapshot = () => {
  const current = currentState();
  const hasBaby = Boolean(current?.activeBabyId && (current?.babies || []).some((baby) => baby.id === current.activeBabyId));
  return { hasBaby, hasFirstCare: hasBaby && hasFirstCare(current), memberCount, isOwner: current?.householdRole === 'owner', complete: hasBaby && hasFirstCare(current) && memberCount >= 2 };
};
```

The membership loader must capture `householdId`, increment a request counter, and only use the count if `state.household?.id === householdId` after the request resolves.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run test/family-onboarding.test.js && node --check family-onboarding.js`

Expected: PASS and syntax check exits 0.

### Task 2: 체크리스트 UI와 기존 행동을 연결한다

**Files:**
- Modify: `family-onboarding.js`
- Modify: `app.js`
- Test: `test/family-onboarding.test.js`

**Interfaces:**
- Consumes: Task 1 `getSnapshot()`.
- Produces: `family:baby-saved` event and a `[data-family-onboarding-action]` button.

- [ ] **Step 1: Extend the failing test**

```js
test('카드는 기존 아기, 첫 기록, 계정 초대 흐름만 연다', () => {
  expect(source).toContain('data-family-onboarding-action');
  expect(source).toContain("if (action === 'baby') return openBabyDialog()");
  expect(source).toContain("if (action === 'care') return openGrowthQuick('수유·이유식')");
  expect(source).toContain("if (action === 'invite') return openAccountDialog()");
  expect(appSource).toContain("new CustomEvent(\"family:baby-saved\"");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/family-onboarding.test.js`

Expected: FAIL because the action UI and baby-saved event are absent.

- [ ] **Step 3: Add minimal renderer and behavior**

```js
const nextStep = (snapshot) => {
  if (!snapshot.hasBaby) return { key: 'baby', label: '아기 등록하기' };
  if (!snapshot.hasFirstCare) return { key: 'care', label: '첫 기록 남기기' };
  if (snapshot.memberCount < 2 && snapshot.isOwner) return { key: 'invite', label: '보호자 초대하기' };
  return null;
};
```

Render all three rows as complete/incomplete. Hide the card when `snapshot.complete` is true. The member-only final row must use `가족 초대를 기다리는 중` and no active button.

After a successful `saveBaby`, dispatch:

```js
window.dispatchEvent(new CustomEvent('family:baby-saved', { detail: { babyId: baby.id, savedAt: new Date().toISOString() } }));
```

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run test/family-onboarding.test.js test/family-handoff.test.js && node --check app.js && node --check family-onboarding.js`

Expected: PASS and both syntax checks exit 0.

### Task 3: 테마·모듈 등록·반응형 검증을 완료한다

**Files:**
- Create: `family-onboarding.css`
- Modify: `family-onboarding.js`
- Modify: `config.js`
- Modify: `test/family-onboarding.test.js`

**Interfaces:**
- Consumes: `familycontextchange`, `familybabychange`, `family:growth-entry-saved`, `family:baby-saved`.
- Produces: semantic `family-onboarding-card` and versioned module registration.

- [ ] **Step 1: Extend the failing test**

```js
test('체크리스트는 컨텍스트 변경을 구독하고 버전 모듈로 로드한다', () => {
  expect(source).toContain("'familycontextchange'");
  expect(source).toContain("'familybabychange'");
  expect(source).toContain("'family:growth-entry-saved'");
  expect(source).toContain("'family:baby-saved'");
  expect(css).toContain('min-height: 44px');
  expect(config).toContain('{ name: "family-onboarding", version: "20260810-v1" }');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/family-onboarding.test.js`

Expected: FAIL because the stylesheet and module registration are absent.

- [ ] **Step 3: Add semantic CSS and refresh listeners**

```css
.family-onboarding-card { border: 1px solid var(--separator); background: var(--surface); color: var(--label); }
.family-onboarding-action { min-height: 44px; color: var(--label); background: var(--surface-2); }
```

Append `{ name: "family-onboarding", version: "20260810-v1" }` directly before `family-handoff` in `config.js`. Insert the card after the calendar hero and before the handoff card.

- [ ] **Step 4: Run full verification and mobile check**

Run: `npm test -- --run && npm run check && git diff --check`

Expected: all tests pass and no direct-color violation.

At `?demo=1`, check 390×844 and 430×932:

1. demo’s completed family does not show a redundant onboarding card;
2. forced incomplete snapshot shows the card after the hero and before handoff;
3. action button has a 44px touch target without global FAB overlap;
4. no horizontal overflow exists in white and dark mode.

- [ ] **Step 5: Commit and deploy**

```bash
git add -- app.js config.js family-onboarding.js family-onboarding.css test/family-onboarding.test.js
git commit -m "feat: add family activation onboarding"
git push origin main
```

Verify the GitHub Actions validation and Pages deployment for the merge commit, then confirm `https://wys1110.github.io/family/?demo=1` serves the module.

## Self-review

- The plan covers all three actual-data completion states, owner/member behavior, and household request scoping.
- It introduces no placeholder, migration, or derived state persistence.
- The module, test, stylesheet, app event, and config names are consistent across all tasks.
