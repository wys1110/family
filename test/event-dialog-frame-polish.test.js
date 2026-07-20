import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const style = readFileSync("event-dialog-frame-polish.css", "utf8");

test("일정 편집 프레임 보정 모듈을 마지막에 불러온다", () => {
  expect(config).toContain('{ name: "event-dialog-frame-polish", version: "20260721-v1", script: false }');
  expect(config.indexOf('name: "event-dialog-frame-polish"')).toBeGreaterThan(config.indexOf('name: "event-dialog-layout-polish"'));
});

test("제목부터 하단 버튼까지 하나의 둥근 프레임 안에 둔다", () => {
  expect(style).toContain("#eventDialog {");
  expect(style).toContain("overflow: hidden");
  expect(style).toContain("border: 1px solid var(--event-frame-line)");
  expect(style).toContain("border-radius: 30px");
  expect(style).toContain("#eventDialog .dialog-header {");
});

test("하단 액션 영역을 프레임 내부에 고정한다", () => {
  expect(style).toContain("#eventDialog .dialog-actions {");
  expect(style).toContain("position: sticky");
  expect(style).toContain("margin: 18px -20px calc(-1 * max(18px, env(safe-area-inset-bottom)))");
  expect(style).toContain("border-top: 1px solid var(--event-frame-line-soft)");
});
