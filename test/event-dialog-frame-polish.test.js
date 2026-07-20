import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const style = readFileSync("event-dialog-frame-polish.css", "utf8");

test("일정 편집 프레임 보정 모듈을 마지막에 불러온다", () => {
  expect(config).toContain('{ name: "event-dialog-frame-polish", version: "20260721-v2", script: false }');
  expect(config.indexOf('name: "event-dialog-frame-polish"')).toBeGreaterThan(config.indexOf('name: "event-dialog-layout-polish"'));
});

test("제목부터 하단 버튼까지 하나의 둥근 프레임 안에 둔다", () => {
  expect(style).toContain("#eventDialog {");
  expect(style).toContain("overflow: hidden");
  expect(style).toContain("border: 1px solid var(--event-frame-line)");
  expect(style).toContain("border-radius: 30px");
  expect(style).toContain("#eventDialog .dialog-header {");
});

test("아이폰 안전 영역 아래에서 프레임 상단을 완전히 노출한다", () => {
  expect(style).toContain("@media (max-width: 620px)");
  expect(style).toContain("--event-dialog-top-gap: max(12px, env(safe-area-inset-top))");
  expect(style).toContain("--event-dialog-bottom-gap: max(8px, env(safe-area-inset-bottom))");
  expect(style).toContain("--event-dialog-max-height: calc(100dvh - var(--event-dialog-top-gap) - var(--event-dialog-bottom-gap))");
  expect(style).toContain("inset: auto 0 var(--event-dialog-bottom-gap)");
  expect(style).toContain("margin: 0 auto");
});

test("하단 액션 영역을 프레임 내부에 고정한다", () => {
  expect(style).toContain("#eventDialog .dialog-actions {");
  expect(style).toContain("position: sticky");
  expect(style).toContain("margin: 18px -20px calc(-1 * max(18px, env(safe-area-inset-bottom)))");
  expect(style).toContain("border-top: 1px solid var(--event-frame-line-soft)");
});
