# Family Guide Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 불필요한 준비·육아 가이드 탭과 그 전체 클라이언트 구현을 제거한다.

**Architecture:** 메뉴와 설정 화면에서 가이드 뷰 참조를 제거하고, 더 이상 로드하지 않는 가이드 모듈·데이터·CSS·테스트를 삭제한다. 일정·성장 데이터 모델과 Supabase 스키마는 변경하지 않는다.

**Tech Stack:** 정적 JavaScript, CSS, config 모듈 매니페스트, Vitest.

## Global Constraints

- 가이드 기능은 숨김이 아닌 완전 제거다.
- 일정·성장·가족 데이터와 DB 마이그레이션을 변경하지 않는다.
- 삭제 후 가이드 문자열이나 모듈 로더 참조가 런타임 코드에 남지 않는다.

---

### Task 1: 가이드 노출과 로더 참조를 제거한다

**Files:**
- Modify: `config.js`
- Modify: `tab-emojis.js`
- Modify: `settings.js`
- Create: `test/family-guide-removal.test.js`

**Interfaces:**
- Consumes: 모듈 매니페스트와 탭/설정 확장 코드
- Produces: 가이드 모듈과 가이드 탭을 참조하지 않는 앱 초기화

- [ ] **Step 1: 실패하는 제거 계약 테스트를 작성한다**

```js
expect(config).not.toContain('family-guide');
expect(tabEmojis).not.toContain("guide: ['🧭', '가이드']");
expect(settings).not.toContain("'guideView'");
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run test/family-guide-removal.test.js`

Expected: FAIL because the guide module and view references still exist.

- [ ] **Step 3: 모듈과 UI 참조를 최소 변경으로 삭제한다**

```js
// config.js: remove both entries
// { name: "family-guide-data", ... }
// { name: "family-guide", ... }
```

`tab-emojis.js`의 가이드 이모지 매핑과 `settings.js`의 `guideView` 목록 참조를 삭제한다.

- [ ] **Step 4: 집중 테스트를 통과시킨다**

Run: `npx vitest run test/family-guide-removal.test.js`

Expected: PASS.

### Task 2: 더 이상 로드되지 않는 가이드 자산과 테스트를 삭제한다

**Files:**
- Delete: `family-guide.js`
- Delete: `family-guide-data.js`
- Delete: `family-guide.css`
- Delete: `test/family-guide.test.js`
- Delete: `test/family-guide-data.test.js`

**Interfaces:**
- Consumes: Task 1에서 제거한 로더 참조
- Produces: 가이드 전용 런타임·데이터·스타일·테스트가 없는 저장소

- [ ] **Step 1: 삭제 전 참조 검사를 실행한다**

Run: `rg -n -i "family-guide|guideView|가이드" --glob '!docs/**' --glob '!node_modules/**'`

Expected: 가이드 전용 파일과 Task 1 이전 참조가 표시된다.

- [ ] **Step 2: 가이드 전용 파일과 기존 테스트를 삭제한다**

```bash
git rm family-guide.js family-guide-data.js family-guide.css test/family-guide.test.js test/family-guide-data.test.js
```

- [ ] **Step 3: 런타임 참조가 사라졌는지 확인한다**

Run: `rg -n -i "family-guide|guideView" --glob '!docs/**' --glob '!node_modules/**'`

Expected: 결과 없음.

- [ ] **Step 4: 전체 검증과 커밋을 수행한다**

Run: `npm run check && npm test && git diff --check`

Expected: PASS.
