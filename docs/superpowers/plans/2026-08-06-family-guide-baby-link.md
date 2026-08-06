# 아기 연동 준비·육아 가이드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성장 탭의 현재 선택 아기와 준비·육아 가이드를 연결해 아기별 단계·추천·체크리스트 상태를 분리한다.

**Architecture:** `family-guide.js`가 기존 `activeBaby()`와 `familybabychange` 이벤트를 사용한다. 저장값은 기존 가이드 저장 키 안에서 `profiles[아기ID]`로 격리하고, 아기 출생일을 우선 기준으로 사용한다. 가이드 데이터·공식 출처·지역 필터는 정적 데이터 모듈을 그대로 재사용한다.

**Tech Stack:** Vanilla JavaScript, localStorage, Vitest.

## Global Constraints

- 아기별 완료·숨김 상태는 서로 섞이지 않는다.
- 기존 공식 출처·지역 필터·가이드 카드 내용은 유지한다.
- 새 라이브러리·DB 스키마·중복 아기 선택 UI를 추가하지 않는다.
- 저장 실패 시 현재 화면만 유지하고 기존 데이터를 덮어쓰지 않는다.

---

### Task 1: Add failing tests for baby-scoped guide state

**Files:**
- Modify: `/Users/yongseokwon/dev/family/test/family-guide.test.js`
- Modify: `/Users/yongseokwon/dev/family/test/family-guide-data.test.js`

**Interfaces:**
- Tests assert the source contract used by the guide module and the data helper contract used by rendering.

- [ ] **Step 1: Write the failing tests**

Add these assertions:

```js
test('가이드는 현재 아기 프로필과 아기별 상태를 사용한다', () => {
  expect(source).toContain('activeBaby()');
  expect(source).toContain('familybabychange');
  expect(source).toContain('profiles');
  expect(source).toContain('data-guide-baby-name');
});

test('아기 출생일을 가이드 기준일로 우선 사용한다', () => {
  expect(source).toContain('baby.birthDate');
  expect(source).toContain('birthDate: babyBirthDate || profile.birthDate');
});
```

Add a data helper test:

```js
test('profilePhaseInput은 프로필 출생일보다 아기 출생일을 우선한다', () => {
  expect(api.profilePhaseInput({ birthDate: '2026-08-01', dueDate: '2026-08-20' }, { birthDate: '2026-07-01' }))
    .toEqual({ birthDate: '2026-07-01', dueDate: '2026-08-20' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run test/family-guide.test.js test/family-guide-data.test.js
```

Expected: FAIL because the current guide source has no baby-scoped profile contract and the data API has no `profilePhaseInput`.

### Task 2: Implement baby-scoped guide settings and rendering

**Files:**
- Modify: `/Users/yongseokwon/dev/family/family-guide.js`
- Modify: `/Users/yongseokwon/dev/family/family-guide-data.js`

**Interfaces:**
- `FAMILY_GUIDE_DATA_API.profilePhaseInput(profile, baby)` returns `{ birthDate, dueDate }`, preferring a valid `baby.birthDate`.
- `family-guide.js` stores `{ profiles: { [babyId]: profile } }` under the existing scoped storage key.
- `family-guide.js` listens for `familybabychange` and rerenders the selected profile.

- [ ] **Step 1: Add the smallest data helper**

Before exporting the data API, add:

```js
const profilePhaseInput = (profile = {}, baby = {}) => ({
  birthDate: toDate(baby.birthDate) ? String(baby.birthDate) : String(profile.birthDate || ''),
  dueDate: String(profile.dueDate || ''),
});
```

Export it with `window.FAMILY_GUIDE_DATA_API`.

- [ ] **Step 2: Replace flat guide settings with profile-scoped settings**

In `family-guide.js`, introduce `defaultProfileSettings`, `cleanProfileSettings`, `currentBaby`, `currentBabyId`, `currentProfile`, and `updateProfile`. Store each profile under its baby ID; use `unlinked` only when no active baby exists. When reading old flat settings, move them once into the current profile.

The current profile must be the only source passed to `setSettings`, completion, hide, restore, and region updates.

- [ ] **Step 3: Bind the guide to the active baby in the UI**

Add a compact label beside the guide heading:

```html
<span data-guide-baby-name>아기 프로필 미선택</span>
```

Render the current baby name. Use `dataApi.profilePhaseInput(currentProfile(), baby)` for phase calculation. If the baby has a profile birth date, render the birth-date input disabled and show it as profile-derived; otherwise keep the per-profile input editable. Keep due-date, region, filters, source links, and checklist controls unchanged.

- [ ] **Step 4: Subscribe to baby changes**

Add:

```js
window.addEventListener('familybabychange', () => {
  settings = readSettings();
  render();
});
```

When a new active baby appears and only legacy `unlinked` settings exist, migrate them to that baby once, then persist.

- [ ] **Step 5: Run focused tests to verify they pass**

Run:

```bash
npx vitest run test/family-guide.test.js test/family-guide-data.test.js
```

Expected: PASS.

### Task 3: Verify isolation and integration

**Files:**
- Modify: `/Users/yongseokwon/dev/family/test/family-guide.test.js` only if an uncovered source contract needs a regression assertion.

- [ ] **Step 1: Run related tests**

```bash
npx vitest run test/family-guide.test.js test/family-guide-data.test.js test/growth-inline-history.test.js test/family-profile-child-label.test.js
```

Expected: all selected tests pass.

- [ ] **Step 2: Run syntax and diff checks**

```bash
node --check family-guide.js
node --check family-guide-data.js
git diff --check
```

Expected: exit code 0.

- [ ] **Step 3: Commit implementation**

```bash
git add family-guide.js family-guide-data.js test/family-guide.test.js test/family-guide-data.test.js
git commit -m "feat: personalize guide by baby profile"
```

