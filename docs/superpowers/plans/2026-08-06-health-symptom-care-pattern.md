# 건강·증상 돌봄 패턴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아기의 건강·증상 기록을 성장일기에 추가하고 돌봄 패턴의 세 보기에서 표시한다.

**Architecture:** 기존 `건강·병원` 카테고리와 제목·체온·메모 필드를 재사용한다. `app.js`의 기본 패턴과 `feeding-pattern-split.js`의 분리 패턴 모두 `health` 유형을 인식하고 같은 `babyId` 필터 흐름을 사용한다.

**Tech Stack:** Vanilla JavaScript, existing localStorage/Supabase growth entries, Vitest.

## Global Constraints

- 새 DB 컬럼·라이브러리·의학적 판정 로직을 추가하지 않는다.
- 관찰 기록만 저장하고 진단을 표시하지 않는다.
- 현재 선택 아기의 성장 기록만 돌봄 패턴에 표시한다.
- 기존 수유·수면·기저귀 패턴을 변경하지 않는다.

---

### Task 1: Lock the regression contract

**Files:**
- Modify: `/Users/yongseokwon/dev/family/test/growth-care-pattern.test.js` (create if absent)
- Modify: `/Users/yongseokwon/dev/family/test/growth-health-record.test.js` (create)

- [ ] **Step 1: Write failing source-contract tests**

```js
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.js', 'utf8');
const split = readFileSync('feeding-pattern-split.js', 'utf8');
const index = readFileSync('index.html', 'utf8');

describe('health symptom growth records', () => {
  test('health record controls exist', () => {
    expect(index).toContain('growthSymptom');
    expect(app).toContain('구토 기록');
    expect(app).toContain('아픈 기록을 바로 남겨요');
  });
});

describe('health care pattern', () => {
  test('health appears in base and split care patterns', () => {
    expect(app).toContain('return "health"');
    expect(app).toContain('data-pattern-category="health"');
    expect(split).toContain('"health"');
  });
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
npx vitest run test/growth-care-pattern.test.js test/growth-health-record.test.js
```

Expected: FAIL because health symptom controls and care pattern type are absent.

### Task 2: Add health record input and quick presets

**Files:**
- Modify: `/Users/yongseokwon/dev/family/index.html`
- Modify: `/Users/yongseokwon/dev/family/app.js`

- [ ] **Step 1: Add the symptom select and safety copy**

Inside the existing `data-growth-fields="건강·병원"` group add a select with id `growthSymptom`, options `아픔·보챔`, `구토`, `설사`, `기침·콧물`, `발진`, `발열`, `약 복용`, `병원 방문`, `기타`, plus the observation-only copy.

- [ ] **Step 2: Add quick symptom presets**

Extend `quickPresets("건강·병원")` with symptom titles such as `구토 기록`, `아픔·보챔 기록`, `설사 기록`, `기침·콧물 기록`, `발진 기록`, `약 복용 기록`, and retain the existing temperature presets. Update `openGrowthQuick` title/copy for the health category.

- [ ] **Step 3: Bind the select to editing and save**

Set `#growthSymptom` from a matching title when opening an existing entry. For health records, use the selected symptom to create the default title `${symptom} 기록`; do not add a new persisted field. Existing title, temperature, note, date, and time remain unchanged.

- [ ] **Step 4: Run health record tests**

```bash
npx vitest run test/growth-health-record.test.js
```

Expected: PASS.

### Task 3: Show health in all care-pattern views

**Files:**
- Modify: `/Users/yongseokwon/dev/family/app.js`
- Modify: `/Users/yongseokwon/dev/family/feeding-pattern-split.js`
- Modify: `/Users/yongseokwon/dev/family/styles.css`
- Modify: `/Users/yongseokwon/dev/family/care-color-separation.css`
- Modify: `/Users/yongseokwon/dev/family/night-care-pattern-polish.css`

- [ ] **Step 1: Add health to type mapping and controls**

Map `건강·병원` to `health`; include `health` in `carePatternCategories`; add health legend/filter buttons. In the split module add health to `CARE_TYPES`, `splitCareType`, controls, daily/weekly/interval labels and calculations.

- [ ] **Step 2: Add health colors**

Use the existing health accent family (`#9b5b58`/theme tokens) for category chips, clock marks/dots, weekly bars, interval cards, and dark-theme overrides.

- [ ] **Step 3: Verify every view contains health data**

```bash
npx vitest run test/growth-care-pattern.test.js
node --check app.js
node --check feeding-pattern-split.js
```

Expected: PASS and exit code 0.

### Task 4: Integration verification and commit

- [ ] **Step 1: Run related tests and diff check**

```bash
npx vitest run test/growth-care-pattern.test.js test/growth-health-record.test.js test/growth-inline-history.test.js test/family-profile-child-label.test.js
git diff --check
```

- [ ] **Step 2: Bump module cache versions and commit**

Set `index.html` core script to `app.js?v=20260806-health-pattern-v1` and `config.js` split module to `{ name: "feeding-pattern-split", version: "20260806-health-pattern-v1" }`, then commit:

```bash
git add app.js index.html feeding-pattern-split.js styles.css care-color-separation.css night-care-pattern-polish.css test/growth-care-pattern.test.js test/growth-health-record.test.js config.js
git commit -m "feat: track health symptoms in care patterns"
```
