# PC Logout Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PC 헤더에서 로그인 사용자가 즉시 로그아웃할 수 있고 실패 시 원인을 안내받도록 한다.

**Architecture:** 기존 `app.js` 인증 상태를 단일 진실 공급원으로 유지한다. 헤더와 계정 팝업은 공통 `signOutCurrentUser()`를 호출하며, 버튼 노출은 `state.session`과 768px 데스크톱 미디어 쿼리의 조합으로 제어한다.

**Tech Stack:** 정적 HTML, CSS, JavaScript, Supabase Auth, Vitest

## Global Constraints

- PC 기준은 화면 폭 768px 이상이다.
- 모바일의 기존 계정 팝업 및 로그아웃 흐름을 유지한다.
- 인증 세션이 없거나 Supabase가 연결되지 않으면 PC 로그아웃 버튼을 숨긴다.
- 로그아웃 실패 시 세션을 유지하고 사용자에게 오류를 안내한다.

---

### Task 1: 공통 로그아웃 동작과 PC 헤더 버튼

**Files:**
- Create: `test/desktop-logout.test.js`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `responsive-layout.css`
- Modify: `app.js`
- Modify: `invite-link.js`

**Interfaces:**
- Consumes: `state.supabase.auth.signOut()`, `state.session`, 기존 `toast(message)`
- Produces: `signOutCurrentUser(button = null): Promise<boolean>`, `updateDesktopLogoutVisibility(): void`, `#desktopLogoutButton`

- [ ] **Step 1: 실패하는 정적 계약 테스트 작성**

```js
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("PC 헤더는 로그인 상태 전용 로그아웃 버튼을 제공한다", () => {
  const html = readFileSync("index.html", "utf8");
  const app = readFileSync("app.js", "utf8");
  const baseCss = readFileSync("styles.css", "utf8");
  const desktopCss = readFileSync("responsive-layout.css", "utf8");

  expect(html).toContain('id="desktopLogoutButton"');
  expect(app).toContain("function updateDesktopLogoutVisibility()");
  expect(app).toContain("async function signOutCurrentUser(button = null)");
  expect(app).toContain('$("#desktopLogoutButton").addEventListener("click"');
  expect(baseCss).toContain(".desktop-logout-button");
  expect(desktopCss).toContain(".desktop-logout-button:not([hidden])");
});

test("계정 팝업과 PC 버튼은 오류를 처리하는 공통 로그아웃 함수를 쓴다", () => {
  const app = readFileSync("app.js", "utf8");
  const invite = readFileSync("invite-link.js", "utf8");

  expect(app).toContain("const { error } = await state.supabase.auth.signOut()");
  expect(app).toContain('toast("로그아웃하지 못했어요. 다시 시도해 주세요")');
  expect(invite).toContain("signOutCurrentUser(event.currentTarget)");
  expect(invite).not.toContain("state.supabase.auth.signOut()");
});
```

- [ ] **Step 2: 테스트가 기능 부재로 실패하는지 확인**

Run: `npm test -- --run test/desktop-logout.test.js`

Expected: `desktopLogoutButton` 또는 `signOutCurrentUser`가 없어 FAIL

- [ ] **Step 3: 최소 구현 추가**

`index.html`의 기존 계정 버튼을 감싸고 데스크톱 로그아웃 버튼을 추가한다.

```html
<div class="topbar-account-actions">
  <button class="desktop-logout-button" id="desktopLogoutButton" type="button" hidden>로그아웃</button>
  <button class="avatar-button" id="accountButton" aria-label="계정 및 저장 상태">...</button>
</div>
```

`styles.css`에서는 기본적으로 버튼을 숨기고 헤더 액션을 정렬한다.

```css
.topbar-account-actions { display:flex; align-items:center; gap:10px; }
.desktop-logout-button { display:none; }
```

`responsive-layout.css`의 `@media (min-width: 768px)` 안에서 인증 상태로 `hidden`이 제거된 버튼만 표시한다.

```css
.desktop-logout-button:not([hidden]) {
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
```

`app.js`에 공통 동작과 노출 갱신을 추가하고 기존 직접 호출을 교체한다.

```js
function updateDesktopLogoutVisibility() {
  $("#desktopLogoutButton").hidden = !(state.supabase && state.session);
}

async function signOutCurrentUser(button = null) {
  if (!state.supabase || !state.session) return false;
  if (button) button.disabled = true;
  const { error } = await state.supabase.auth.signOut();
  if (button) button.disabled = false;
  if (error) {
    console.error("로그아웃 실패", error);
    toast("로그아웃하지 못했어요. 다시 시도해 주세요");
    return false;
  }
  $("#accountDialog")?.close();
  return true;
}
```

`bindUi()`에서 PC 버튼을 연결하고 `updateAuthGate()`가 실행될 때 노출 상태를 갱신한다. `app.js`와 `invite-link.js`의 계정 팝업 로그아웃 리스너도 `signOutCurrentUser(event.currentTarget)`을 호출한다.

- [ ] **Step 4: 대상 테스트와 전체 검증 실행**

Run: `npm test -- --run test/desktop-logout.test.js && npm test && npm run check`

Expected: 새 테스트 2개와 기존 39개 테스트가 모두 PASS하고 정적 검사가 종료 코드 0

- [ ] **Step 5: 브라우저 반응형 검증**

Run: 로컬 서버에서 인증 상태 DOM을 사용해 767px과 1280px 화면을 확인한다.

Expected: 767px에서는 PC 버튼이 보이지 않고, 1280px에서는 `로그아웃` 버튼이 계정 버튼 옆에 표시되며 가로 오버플로가 없다.

- [ ] **Step 6: 커밋**

```bash
git add index.html styles.css responsive-layout.css app.js invite-link.js test/desktop-logout.test.js
git commit -m "fix: expose reliable desktop logout"
```
