import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createBabyAiHandler } from "../supabase/functions/baby-ai/handler.ts";

const BABY_ID = "11111111-1111-4111-8111-111111111111";
const context = {
  baby: { ageDays: 90, sex: "남아" },
  profile: {},
  logs: [],
  householdId: "household-1",
};

test("로그인한 가족이 실패한 자동 갱신을 즉시 다시 예약한다", async () => {
  let received;
  const handler = createBabyAiHandler({
    authenticate: async () => ({ userId: "user-1" }),
    isCronAuthorized: () => false,
    loadContext: async () => context,
    generateGroundedText: async () => ({ text: "", sources: [], grounded: false }),
    generateText: async () => "",
    saveDraft: async () => ({ id: "draft-1" }),
    retryRefresh: async (input) => {
      received = input;
      return { dueAt: "2026-07-20T01:00:00.000Z" };
    },
    processRefreshQueue: async () => ({ processed: 0, failed: 0 }),
    now: () => new Date("2026-07-20T01:00:00.000Z"),
  });
  const response = await handler(new Request("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer token" },
    body: JSON.stringify({ action: "retry-refresh", babyId: BABY_ID }),
  }));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ dueAt: "2026-07-20T01:00:00.000Z" });
  expect(received).toMatchObject({ userId: "user-1", babyId: BABY_ID, context });
});

test("큐는 멈춘 processing 복구와 두 전략 일괄 저장을 포함한다", () => {
  const source = readFileSync("supabase/functions/baby-ai/index.ts", "utf8");
  expect(source).toContain('last_error: "PROCESSING_TIMEOUT"');
  expect(source).toContain('.eq("status", "processing")');
  expect(source).toContain("generateScheduledDrafts");
  expect(source).toContain("insert(drafts)");
  expect(source).toContain("attempt_count: 0");
  expect(source).toContain("last_error: null");
});
