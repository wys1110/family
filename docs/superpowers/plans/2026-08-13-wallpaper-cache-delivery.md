# Wallpaper Cache Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 Safari와 설치형 PWA가 사진 전체 표시 CSS를 즉시 받도록 월페이퍼 자산 전달 경로를 갱신한다.

**Architecture:** 사진·DB·렌더링 규칙은 유지한다. HTML의 `config.js` 캐시 키, 설정의 월페이퍼 CSS 버전, 서비스워커 네트워크 우선 목록을 함께 갱신하여 이전 `cover` 자산이 재사용되지 않게 한다.

**Tech Stack:** Static HTML, JavaScript service worker, CSS module manifest, Vitest

## Global Constraints

- 기존 업로드 사진과 DB 행을 변경하지 않는다.
- 월페이퍼의 `contain` 렌더링 규칙을 유지한다.
- 캐시 전달에 필요한 파일만 수정한다.
- 새 의존성을 추가하지 않는다.

---

### Task 1: 월페이퍼 자산 캐시 전달 보장

**Files:**
- Modify: `test/household-wallpapers.test.js`
- Modify: `index.html`
- Modify: `config.js`
- Modify: `service-worker.js`
- Modify: `test/calendar-mobile-polish.test.js`
- Modify: `test/demo-theme-settings.test.js`
- Modify: `test/calendar-month-typography.test.js`
- Modify: `test/calendar-font-settings.test.js`

**Interfaces:**
- Consumes: `config.js` 모듈 목록, 서비스워커 `forceNetwork`
- Produces: `config.js?v=20260813-wallpaper-cache-v2`, `family-wallpapers.css?v=20260813-full-fit-v2`

- [ ] **Step 1: 실패 테스트 작성**

```js
expect(html).toContain('config.js?v=20260813-wallpaper-cache-v2');
expect(config).toContain('{ name: "family-wallpapers", version: "20260813-full-fit-v2", script: false }');
expect(serviceWorker).toContain('url.pathname.endsWith("/family-wallpapers.css")');
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/household-wallpapers.test.js`

Expected: 이전 HTML·모듈 버전과 서비스워커 목록 때문에 FAIL.

- [ ] **Step 3: 최소 전달 경로 수정**

`index.html`의 `config.js` URL, `config.js`의 월페이퍼 버전, `service-worker.js`의 네트워크 우선 목록을 새 값으로 바꾼다. 기존 테스트의 문서 자산 버전 기대값도 동일하게 맞춘다.

- [ ] **Step 4: 전체 검증**

Run: `npx vitest run test/household-wallpapers.test.js && npm test -- --run && npm run check && git diff --check`

Expected: 모든 명령이 exit code 0.

- [ ] **Step 5: 커밋**

```bash
git add -- index.html config.js service-worker.js test/household-wallpapers.test.js test/calendar-mobile-polish.test.js test/demo-theme-settings.test.js test/calendar-month-typography.test.js test/calendar-font-settings.test.js docs/superpowers/specs/2026-08-13-wallpaper-full-fit-design.md docs/superpowers/plans/2026-08-13-wallpaper-cache-delivery.md
git commit -m "fix: deliver wallpaper fit to mobile"
```
