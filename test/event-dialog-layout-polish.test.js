import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const style = readFileSync("event-dialog-layout-polish.css", "utf8");

test("일정 수정 화면의 전용 레이아웃 CSS를 마지막 순서로 불러온다", () => {
  expect(config).toContain('{ name: "event-dialog-layout-polish", version: "20260720-v2", script: false }');
  expect(config.indexOf('{ name: "night-theme-polish"')).toBeLessThan(config.indexOf('{ name: "event-dialog-layout-polish"'));
});

test("모바일 일정 편집 화면은 날짜·알림·구성원·하단 버튼을 압축한다", () => {
  expect(style).toContain("scroll-padding-bottom: 150px");
  expect(style).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
  expect(style).toContain("grid-column: span 2");
  expect(style).toContain("margin: 14px -20px calc(-1 * max(18px, env(safe-area-inset-bottom)))");
});

test("별빛밤 테마에서 입력 카드와 저장 버튼 대비를 높인다", () => {
  expect(style).toContain('html[data-family-theme="night"] #eventDialog');
  expect(style).toContain("--event-panel: #122946");
  expect(style).toContain("color-scheme: dark");
  expect(style).toContain("background: linear-gradient(135deg, #6f9ee7 0%, #70c8b8 100%)");
});
