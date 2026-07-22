import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const script = readFileSync("tab-interaction-fix.js", "utf8");
const style = readFileSync("tab-interaction-fix.css", "utf8");

test("탭 안정화 모듈을 모든 테마 보정 뒤에 불러온다", () => {
  expect(config).toContain('{ name: "tab-interaction-fix", version: "20260722-ios-tab-ghost-v1" }');
  expect(config.indexOf('name: "tab-interaction-fix"')).toBeGreaterThan(config.indexOf('name: "night-theme-polish"'));
});

test("아이폰에서 이전 활성 탭의 잔상이 남는 합성 조건을 제거한다", () => {
  expect(style).toContain("@media (hover: none) and (pointer: coarse)");
  expect(style).toContain("contain: paint");
  expect(style).toContain("transform: none");
  expect(style).toContain("-webkit-backdrop-filter: none");
  expect(style).toContain(".view-tab:not(.active)");
});

test("동적으로 추가된 탭도 터치 후 포커스를 해제한다", () => {
  expect(script).toContain('document.querySelector(".view-tabs")');
  expect(script).toContain('target.closest(".view-tab")');
  expect(script).toContain('navigation.addEventListener("pointerup"');
  expect(script).toContain('navigation.addEventListener("touchend"');
  expect(script).toContain("event.detail === 0");
  expect(script).toContain("requestAnimationFrame");
  expect(script).toContain("tab.blur()");
});
