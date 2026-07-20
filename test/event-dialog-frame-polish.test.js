import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const eventStyle = readFileSync("event-dialog-frame-polish.css", "utf8");
const growthStyle = readFileSync("growth-edit-sheet-polish.css", "utf8");

test("성장 기록 기준 일정 시트 보정을 마지막에 불러온다", () => {
  expect(config).toContain('{ name: "event-dialog-frame-polish", version: "20260721-growth-sheet-v3", script: false }');
  expect(config.indexOf('name: "event-dialog-frame-polish"')).toBeGreaterThan(config.indexOf('name: "event-dialog-layout-polish"'));
});

test("일정 시트의 외곽·스크롤 구조를 새 성장 기록과 같은 규격으로 맞춘다", () => {
  for (const declaration of [
    "width: min(calc(100% - 16px), 500px)",
    "border-radius: 28px",
    "padding: 11px 18px 0",
    "overflow-y: auto",
    "scroll-padding-bottom: 94px",
    "scrollbar-width: none",
  ]) {
    expect(growthStyle).toContain(declaration);
    expect(eventStyle).toContain(declaration);
  }
});

test("제목·닫기 버튼·입력 필드를 성장 기록 시트의 시각 규격으로 통일한다", () => {
  expect(eventStyle).toContain("flex: 0 0 44px");
  expect(eventStyle).toContain("font-size: clamp(27px, 7vw, 31px)");
  expect(eventStyle).toContain("min-height: 52px");
  expect(eventStyle).toContain("border-radius: 14px");
  expect(eventStyle).toContain("min-height: 104px");
});

test("일정 추가 영역은 성장 기록처럼 시트 스크롤 안에 참여하고 구분선은 더 명확하다", () => {
  expect(eventStyle).toContain("#eventDialog .dialog-actions {");
  expect(eventStyle).toContain("position: sticky");
  expect(eventStyle).toContain("bottom: -1px");
  expect(eventStyle).toContain("margin: 16px -18px 0");
  expect(eventStyle).not.toContain("calc(-1 * max(18px, env(safe-area-inset-bottom)))");
  expect(eventStyle).toContain("border-top: 1px solid color-mix(in srgb, var(--label) 16%, transparent)");
  expect(eventStyle).toContain("html[data-family-theme=\"night\"] #eventDialog .dialog-actions");
  expect(eventStyle).toContain("border-color: rgba(255,255,255,.16)");
});

test("날짜·종일·알림·구성원 영역도 성장 기록 카드 톤으로 정리한다", () => {
  expect(eventStyle).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  expect(eventStyle).toContain("#eventDialog .all-day-row,");
  expect(eventStyle).toContain("#eventDialog .notification-reminder-field {");
  expect(eventStyle).toContain("border-radius: 19px");
  expect(eventStyle).toContain("background: var(--event-panel-soft)");
  expect(eventStyle).toContain("#eventDialog .member-selector .member-selector-add");
});
