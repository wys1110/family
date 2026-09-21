import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const script = readFileSync("care-time-emphasis.js", "utf8");
const style = readFileSync("care-time-emphasis.css", "utf8");
const clockMode = readFileSync("care-ring-timeline.js", "utf8");

test("원형 시계 아래 시간별 기록을 수정 가능한 버튼으로 렌더링한다", () => {
  expect(script).toContain('return `<button type="button" class="care-time-row ${type}"');
  expect(script).toContain('data-care-entry-id="${escapeHtml(String(entry.id || ""))}"');
  expect(script).toContain('aria-haspopup="dialog"');
  expect(script).toContain("기록 수정");
  expect(script).not.toContain('<article class="care-time-row ${type}">');
});

test("시간별 기록 버튼은 모바일 터치와 키보드 포커스 피드백을 제공한다", () => {
  expect(style).toContain("width:100%");
  expect(style).toContain("touch-action:manipulation");
  expect(style).toContain("-webkit-appearance:none");
  expect(style).toContain(".care-time-row:active");
  expect(style).toContain(".care-time-row:focus-visible");
});

test("수유 기록은 시계 타임라인을 기본으로 열고, 기존 선형 목록도 선택할 수 있다", () => {
  expect(clockMode).toContain('const CARE_DAY_MODE_KEY = "family-care-day-mode-v2"');
  expect(clockMode).toContain('saved : "clock"');
  expect(clockMode).toContain('>시계 타임라인</button>');
  expect(clockMode).toContain('data-care-day-mode="timeline"');
});
