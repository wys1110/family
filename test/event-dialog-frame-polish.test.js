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

test("일정 추가 영역은 폼과 함께 스크롤하고 하단에 고정되지 않는다", () => {
  expect(style).toContain("overflow-y: auto");
  expect(style).toContain("#eventDialog .dialog-actions {");
  expect(style).toContain("position: static");
  expect(style).not.toContain("position: sticky");
  expect(style).not.toContain("bottom: 0");
  expect(style).toContain("margin: 22px -20px 0");
});

test("메모와 일정 추가 영역 사이 구분선을 충분한 대비로 표시한다", () => {
  expect(style).toContain("--event-frame-divider: color-mix(in srgb, var(--label) 28%, transparent)");
  expect(style).toContain("border-top: 1px solid var(--event-frame-divider)");
  expect(style).toContain('--event-frame-divider: rgba(148, 190, 247, .38)');
});
