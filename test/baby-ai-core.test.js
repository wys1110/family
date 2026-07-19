import { describe, expect, test } from "vitest";
import {
  formatStrategySections,
  isAiCareCategory,
  refreshDueAt,
  shouldReplaceDraft,
} from "../baby-ai-core.js";

describe("AI 육아 도우미 공용 규칙", () => {
  test("수유와 수면 기록만 자동 갱신 대상으로 본다", () => {
    expect(isAiCareCategory("수유·이유식")).toBe(true);
    expect(isAiCareCategory("수면")).toBe(true);
    expect(isAiCareCategory("기저귀")).toBe(false);
  });

  test("마지막 기록으로부터 30분 뒤를 예약한다", () => {
    expect(refreshDueAt(new Date("2026-07-19T10:00:00.000Z"))).toBe("2026-07-19T10:30:00.000Z");
  });

  test("더 최신 기록 범위의 초안만 교체 대상으로 본다", () => {
    expect(shouldReplaceDraft("2026-07-19T09:00:00Z", "2026-07-19T10:00:00Z")).toBe(true);
    expect(shouldReplaceDraft("2026-07-19T10:00:00Z", "2026-07-19T10:00:00Z")).toBe(false);
  });

  test("전략 JSON을 고정된 화면 섹션으로 바꾼다", () => {
    expect(formatStrategySections({
      observations: ["밤잠 2회"],
      actions: ["조명 낮추기"],
      watch: ["깨는 횟수"],
      reassess: "3일 후",
    })).toEqual([
      { title: "확인한 패턴", items: ["밤잠 2회"] },
      { title: "실행 단계", items: ["조명 낮추기"] },
      { title: "관찰할 것", items: ["깨는 횟수"] },
      { title: "다시 살펴볼 때", items: ["3일 후"] },
    ]);
  });
});
