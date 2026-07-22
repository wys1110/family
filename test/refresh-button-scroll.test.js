import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const source = readFileSync("refresh-button.js", "utf8");

test("새로고침 버튼은 데이터만 갱신하지 않고 페이지를 완전히 다시 읽는다", () => {
  expect(source).toContain("button.setAttribute('aria-label', '페이지 완전 새로고침')");
  expect(source).toContain("const target = new URL(window.location.href)");
  expect(source).toContain("target.searchParams.set('__refresh'");
  expect(source).toContain("window.location.replace(target.href)");
  expect(source).not.toContain("bootstrapData()");
});

test("iOS 앱 모드의 캐시를 우회하도록 고유 새로고침 주소를 만든다", () => {
  expect(source).toContain("target.searchParams.delete('__appv')");
  expect(source).toContain("Date.now()");
  expect(source).toContain("Math.random().toString(36)");
});

test("페이지를 다시 읽기 전에 현재 앱의 서비스 워커 업데이트를 짧게 확인한다", () => {
  expect(source).toContain("navigator.serviceWorker.getRegistration()");
  expect(source).toContain("await registration.update()");
  expect(source).toContain("registration.waiting?.postMessage({ type: 'SKIP_WAITING' })");
  expect(source).toMatch(/Promise\.race\([\s\S]*updateServiceWorker\(\)[\s\S]*window\.setTimeout\(resolve, 900\)/);
  expect(source).not.toContain("getRegistrations()");
});

test("재로딩 완료 후 사용자에게 완료 안내를 표시한다", () => {
  expect(source).toContain("sessionStorage.setItem('family-refresh-complete-v1', '1')");
  expect(source).toContain("sessionStorage.getItem('family-refresh-complete-v1') === '1'");
  expect(source).toContain("message.textContent = '페이지를 새로 읽어왔어요'");
});

test("변경된 새로고침 모듈을 즉시 불러오도록 캐시 버전을 갱신한다", () => {
  const config = readFileSync("config.js", "utf8");

  expect(config).toContain('{ name: "refresh-button", version: "20260722-bottom-center-v4" }');
});

test("config fallback 버튼을 발견하면 fallback 클릭 핸들러를 비활성화하지 않는다", () => {
  expect(source).not.toContain("existingButton.dataset.refreshHydrated = 'true'");
});
