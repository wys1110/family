import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const source = readFileSync("refresh-button.js", "utf8");
const style = readFileSync("refresh-button.css", "utf8");

test("새로고침 버튼은 데이터만 갱신하지 않고 페이지를 완전히 다시 읽는다", () => {
  expect(source).toContain("button.setAttribute('aria-label', '페이지 완전 새로고침')");
  expect(source).toContain("const target = new URL(window.location.href)");
  expect(source).toContain("target.searchParams.set('__refresh'");
  expect(source).toContain("window.location.replace(target.href)");
  expect(source).not.toContain("bootstrapData()")
});

test("iOS 앱 모드의 캐시를 우회하도록 고유 새로고침 주소를 만든다", () => {
  expect(source).toContain("target.searchParams.delete('__appv')");
  expect(source).toContain("Date.now()")
  expect(source).toContain("Math.random().toString(36)")
});

test("페이지를 다시 읽기 전에 현재 앱의 서비스 워커 업데이트를 짧게 확인한다", () => {
  expect(source).toContain("navigator.serviceWorker.getRegistration()")
  expect(source).toContain("await registration.update()")
  expect(source).toContain("registration.waiting?.postMessage({ type: 'SKIP_WAITING' })")
  expect(source).toMatch(/Promise\.race\([\s\S]*updateServiceWorker\(\)[\s\S]*window\.setTimeout\(resolve, 900\)/)
  expect(source).not.toContain("getRegistrations()")
});

test("재로딩 완료 후 사용자에게 완료 안내를 표시한다", () => {
  expect(source).toContain("sessionStorage.setItem('family-refresh-complete-v1', '1')")
  expect(source).toContain("sessionStorage.getItem('family-refresh-complete-v1') === '1'")
  expect(source).toContain("message.textContent = '페이지를 새로 읽어왔어요'")
});

test("새로고침 버튼은 상단 캡슐이 아니라 우측 하단 플로팅 액션으로 둔다", () => {
  expect(source).toContain("pageBody.appendChild(button)")
  expect(source).not.toContain("topbarActions.insertBefore(button")
  expect(style).toContain("body > .refresh-button {")
  expect(style).toContain("right: max(16px, calc((100vw - 820px) / 2 + 16px))")
  expect(style).toContain("bottom: calc(16px + env(safe-area-inset-bottom, 0px))")
});

test("상단 우측 알림과 계정 버튼은 헤더의 정상 레이아웃에 고정한다", () => {
  expect(source).toContain("const topbar = document.querySelector('.topbar')")
  expect(source).toContain("topbar.appendChild(topbarActions)")
  expect(source).toContain("topbarActions.style.setProperty('position', 'static', 'important')")
  expect(source).toContain("topbarActions.style.setProperty('justify-content', 'flex-end', 'important')")
  expect(source).not.toContain("window.visualViewport?.addEventListener")
});

test("변경된 새로고침 모듈을 즉시 불러오도록 캐시 버전을 갱신한다", () => {
  const config = readFileSync("config.js", "utf8")

  expect(config).toContain('{ name: "refresh-button", version: "20260722-settings-visible-v4" }')
});

test("config fallback 버튼을 발견하면 fallback 클릭 핸들러를 비활성화하지 않는다", () => {
  expect(source).not.toContain("existingButton.dataset.refreshHydrated = 'true'")
});
