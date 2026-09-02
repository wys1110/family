import { expect, test } from "vitest";
import { buildGrowthChangePayload } from "../supabase/functions/daily-briefing-push/growth-notification.ts";

test("수유 알림은 모유·방향·시간·기록자만 표시한다", () => {
  const payload = buildGrowthChangePayload({
    kind: "created",
    sourceId: "2c5e3d45-3ee6-4dd0-95c4-9fc1efc0ae4f",
    sourceDate: "2026-09-03",
    category: "수유·이유식",
    title: "모유 수유",
    feedingType: "모유",
    feedingSide: "왼쪽",
    feedingMinutes: 20,
    feedingMl: null,
  }, "엄마");

  expect(payload.title).toBe("모유 · 왼쪽 수유 · 20분 · 엄마");
  expect(payload.body).toBe("");
});

test("기저귀 알림은 호칭이 없어도 구체적인 기록만 표시한다", () => {
  const payload = buildGrowthChangePayload({
    kind: "created",
    sourceId: "2c5e3d45-3ee6-4dd0-95c4-9fc1efc0ae4f",
    sourceDate: "2026-09-03",
    category: "기저귀",
    title: "기저귀 교체",
    diaperKind: "소변",
  }, "");

  expect(payload.title).toBe("기저귀 · 소변");
  expect(payload.body).toBe("");
});
