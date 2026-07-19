import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("타이머, 빠른 기록, 상세 기록 성공 후 공통 이벤트를 발생시킨다", () => {
  const source = readFileSync("app.js", "utf8");
  expect(source).toContain("function dispatchGrowthEntrySaved(entry)");
  expect(source.match(/dispatchGrowthEntrySaved\(entry\)/g)?.length).toBeGreaterThanOrEqual(4);
});

test("AI 모듈이 수유·수면 기록만 30분 갱신 큐에 예약한다", () => {
  const source = readFileSync("baby-ai.js", "utf8");
  expect(source).toContain('addEventListener("family:growth-entry-saved"');
  expect(source).toContain("core.isAiCareCategory");
  expect(source).toContain('rpc("schedule_baby_ai_refresh"');
});

test("기존 기록 편집은 새 기록 이벤트로 처리하지 않는다", () => {
  const source = readFileSync("app.js", "utf8");
  expect(source).toContain("if (isNewEntry) dispatchGrowthEntrySaved(entry)");
});
