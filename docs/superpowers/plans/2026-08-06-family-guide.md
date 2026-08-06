# 가족 준비·육아 가이드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 예정일/출산일과 선택 지역을 기준으로 출산·육아·건강·여행·보육 정보를 출처와 함께 제공하는 새 `가이드` 탭을 만든다.

**Architecture:** 정적 출처 필수 카드 데이터와 순수 계산 함수를 `family-guide-data.js`에 둔다. `family-guide.js`는 설정 저장, 필터, 완료/숨김 상태, DOM과 `switchView` 연결만 담당한다. 기존 일정·성장 데이터는 읽지 않으며, 가이드 설정은 별도 저장 키로 분리한다.

**Tech Stack:** 기존 브라우저 IIFE 모듈, HTML/CSS, localStorage, Vitest, Node `vm` 테스트.

## Global Constraints

- 출처 없는 카드 배포 금지: `sourceName`, `sourceUrl`, `checkedAt` 필수.
- 한국 공식 1차 출처 우선; 의료·여행 내용은 진단·허용 판정 대신 확인 항목과 공식 링크만 제공.
- 예정일/출산일/지역은 가이드 전용 저장소에만 저장.
- 지역 미선택 시 전국 공통 카드, 지역 선택 시 전국 공통 + 해당 지역 카드 표시.
- 기존 사용자 변경 파일 `config.js`, `refresh-button.*`, 관련 테스트는 스테이징하지 않는다.
- 새 의존성 추가 금지.

---

### Task 1: 출처 필수 가이드 데이터·계산 API

**Files:**
- Create: `/Users/yongseokwon/dev/family/family-guide-data.js`
- Test: `/Users/yongseokwon/dev/family/test/family-guide-data.test.js`

**Interfaces:**
- Produces `window.FAMILY_GUIDE_DATA_API.cards`, `calculatePhase(input)`, `filterCards(cards, options)`.
- `calculatePhase({ dueDate, birthDate, todayKey })` returns `{ mode: 'prenatal'|'postpartum'|'infant'|'toddler'|'unknown', dayOffset: number|null, label: string }`.
- `filterCards(cards, { phase, category, region, hiddenCardIds, completedCardIds })` returns cards with `completed` boolean, excluding hidden cards.

- [ ] **Step 1: Write failing tests**

```js
test('모든 카드가 출처 필드를 가진다', () => {
  const { cards } = loadGuideData();
  expect(cards.length).toBeGreaterThan(0);
  cards.forEach((card) => {
    expect(card.sourceName).toBeTruthy();
    expect(card.sourceUrl).toMatch(/^https:\/\//);
    expect(card.checkedAt).toMatch(/^2026-08-06$/);
  });
});

test('예정일과 출산일 기준으로 단계를 계산한다', () => {
  expect(api.calculatePhase({ dueDate: '2026-08-20', todayKey: '2026-08-06' }).label).toBe('D-14');
  expect(api.calculatePhase({ birthDate: '2026-08-01', todayKey: '2026-08-06' }).label).toBe('생후 5일');
});

test('지역·숨김·완료 필터를 적용한다', () => {
  const cards = api.filterCards(api.cards, { region: { sido: '서울특별시', sigungu: '마포구' }, hiddenCardIds: ['prepare-hospital-bag'], completedCardIds: ['newborn-register'] });
  expect(cards.some((card) => card.id === 'prepare-hospital-bag')).toBe(false);
  expect(cards.find((card) => card.id === 'newborn-register')?.completed).toBe(true);
  expect(cards.every((card) => card.regionScope === 'national' || card.regionScope === '서울특별시' || card.regionScope === '마포구')).toBe(true);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run test/family-guide-data.test.js`
Expected: FAIL because `family-guide-data.js` and API do not exist.

- [ ] **Step 3: Implement minimum data/API**

Add approximately 24 curated cards across prenatal, postpartum, infant, toddler, travel, supplies, vaccination, health screening, childcare, and kindergarten. Every card must include `id`, `title`, `phase`, `category`, `timing`, `summary`, `action`, `regionScope`, `sourceName`, `sourceUrl`, and `checkedAt`. Use only verified official URLs, including:

```js
const SOURCES = {
  isarangDue: ['임신육아종합포털 아이사랑', 'https://www.childcare.go.kr/?menuno=278'],
  isarangBirthSigns: ['임신육아종합포털 아이사랑', 'https://www.childcare.go.kr/?menuno=267'],
  isarangPostpartum: ['임신육아종합포털 아이사랑', 'https://www.childcare.go.kr/?menuno=275'],
  isarangWaitlist: ['임신육아종합포털 아이사랑', 'https://www.childcare.go.kr/?menuno=172'],
  moePortal: ['교육부', 'https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=101343&lev=0&m=0204'],
  kdcaVaccination: ['질병관리청 예방접종도우미', 'https://nip.kdca.go.kr/irhp/infm/goVcntInfo.do?menuCd=136&menuLv=1'],
  kdcaPregnancyVaccination: ['질병관리청 예방접종도우미', 'https://cert.kdca.go.kr/irhp/infm/goVcntInfo.do?menuCd=134&menuLv=1'],
  nhisExam: ['국민건강보험공단 건강검진 실시기준', 'https://www.nhis.or.kr/lm/lmxsrv/law/lawFullContent.do?SEQ=80&SEQ_HISTORY=595068'],
  kdcaTravel: ['질병관리청 국가건강정보포털', 'https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=6257'],
  whoNewborn: ['WHO', 'https://www.who.int/tools/your-life-your-health/life-phase/newborns-and-children-under-5-years/caring-for-newborns'],
  katsChildSafety: ['국가기술표준원', 'https://kats.go.kr/content.do?cmsid=499'],
};
```

Use integer date arithmetic on local `YYYY-MM-DD` keys. `filterCards` must match national cards plus selected `sido`/`sigungu`, and must never mutate source cards.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run test/family-guide-data.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add family-guide-data.js test/family-guide-data.test.js
git commit -m "feat: add sourced family guide data"
```

### Task 2: 가이드 탭 UI·설정 저장

**Files:**
- Create: `/Users/yongseokwon/dev/family/family-guide.js`
- Create: `/Users/yongseokwon/dev/family/family-guide.css`
- Test: `/Users/yongseokwon/dev/family/test/family-guide.test.js`

**Interfaces:**
- Consumes `window.FAMILY_GUIDE_DATA_API`.
- Produces `data-view="guide"`, `#guideView`, and `window.FAMILY_GUIDE_API` with `getSettings()`, `setSettings(next)`, `getVisibleCards()`.

- [ ] **Step 1: Write failing source/behavior tests**

```js
test('가이드 탭은 별도 설정 키와 출처 UI를 사용한다', () => {
  expect(source).toContain('family-guide-settings-v1');
  expect(source).toContain('data-view="guide"');
  expect(source).toContain('sourceUrl');
  expect(style).toContain('#guideView');
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npx vitest run test/family-guide.test.js`
Expected: FAIL because module/styles do not exist.

- [ ] **Step 3: Implement UI**

Build one compact mobile-first view:

```html
<section class="guide-setup-card">
  <div class="guide-date-fields">
    <label>예정일 <input type="date" data-guide-due-date></label>
    <label>출산일 <input type="date" data-guide-birth-date></label>
  </div>
  <label>지역 <select data-guide-sido></select><select data-guide-sigungu></select></label>
</section>
<section class="guide-status-card"><strong data-guide-phase></strong><span data-guide-count></span></section>
<div class="guide-filters">단계·카테고리·상태 버튼</div>
<section class="guide-card-list" data-guide-list></section>
```

Each card renders completion checkbox, hide button, timing, source name, checked date, and a safe external link. Store only settings under `family-guide-settings-v1` in demo mode; for signed-in households append user/household IDs, matching existing scoped storage pattern. Validate dates before saving; if birth date exists and is earlier than due date, show a correction message and do not persist.

- [ ] **Step 4: Add interaction tests and run**

Test that hiding/removing a card changes only `hiddenCardIds`, completion changes only `completedCardIds`, and external links include `target="_blank" rel="noopener noreferrer"`.

Run: `npx vitest run test/family-guide.test.js test/family-guide-data.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add family-guide.js family-guide.css test/family-guide.test.js
git commit -m "feat: add family guide tab"
```

### Task 3: 기존 탭·모듈 등록

**Files:**
- Modify: `/Users/yongseokwon/dev/family/config.js` (only add new manifest entries; preserve existing dirty hunks)
- Modify: `/Users/yongseokwon/dev/family/tab-emojis.js`
- Modify: `/Users/yongseokwon/dev/family/settings.js`
- Test: `/Users/yongseokwon/dev/family/test/family-guide.test.js`

**Interfaces:**
- `config.js` loads `family-guide-data` before `family-guide`.
- `tab-emojis.js` labels `guide` as `🧭 가이드`.
- `settings.js` hides `guideView` while settings is open.

- [ ] **Step 1: Add manifest and labels**

Insert:

```js
{ name: "family-guide-data", version: "20260806-family-guide-v1", style: false },
{ name: "family-guide", version: "20260806-family-guide-v1" },
```

Add `guide: ['🧭', '가이드']` to tab labels. Extend settings' hidden view list with `guideView`.

- [ ] **Step 2: Run module wiring tests**

Run: `npx vitest run test/family-guide.test.js`
Expected: PASS with manifest, label, and settings assertions.

- [ ] **Step 3: Commit**

```bash
git add tab-emojis.js settings.js
git add -p config.js
git commit -m "feat: register family guide tab"
```

### Task 4: Integrated verification and deployment

**Files:**
- Modify: none beyond Tasks 1–3

- [ ] **Step 1: Run focused suite and syntax checks**

Run:

```bash
npx vitest run test/family-guide-data.test.js test/family-guide.test.js
node --check family-guide-data.js family-guide.js
git diff --check
```

Expected: all focused tests pass, syntax checks exit 0, no whitespace errors.

- [ ] **Step 2: Inspect changed files**

Run: `git status --short` and verify only new guide files plus intentional manifest/label/settings hunks are staged. Existing dirty files remain untouched.

- [ ] **Step 3: Push and verify Pages**

```bash
git push origin main
gh run list --repo wys1110/family --limit 3
```

Verify `https://wys1110.github.io/family/family-guide.js` and `family-guide-data.js` return HTTP 200 after deployment. Report any unrelated existing full-suite failures separately.

