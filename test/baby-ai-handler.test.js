import { describe, expect, test } from "vitest";
import { createBabyAiHandler } from "../supabase/functions/baby-ai/handler.ts";

const BABY_ID = "11111111-1111-4111-8111-111111111111";
const context = {
  baby: { ageDays: 90, sex: "남아" },
  profile: { temperament: "소리에 예민함" },
  logs: [],
};

function request(body, { auth = true, cron = false } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (auth) headers.set("authorization", "Bearer user-token");
  if (cron) headers.set("x-baby-ai-cron", "cron-token");
  return new Request("https://example.test/functions/v1/baby-ai", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function fakeDeps(overrides = {}) {
  return {
    authenticate: async (req) => req.headers.get("authorization") ? { userId: "user-1" } : null,
    isCronAuthorized: (req) => req.headers.get("x-baby-ai-cron") === "cron-token",
    loadContext: async () => context,
    generateText: async () => "일반 답변",
    saveDraft: async () => ({ id: "draft-1" }),
    processRefreshQueue: async () => ({ processed: 2, failed: 0 }),
    now: () => new Date("2026-07-19T10:00:00.000Z"),
    ...overrides,
  };
}

describe("baby-ai Edge Function handler", () => {
  test("인증되지 않은 브라우저 요청을 거부한다", async () => {
    const handler = createBabyAiHandler(fakeDeps());
    const response = await handler(request({ action: "chat", babyId: BABY_ID, question: "질문" }, { auth: false }));
    expect(response.status).toBe(401);
  });

  test("긴급 질문은 Gemini를 호출하지 않는다", async () => {
    let calls = 0;
    const handler = createBabyAiHandler(fakeDeps({ generateText: async () => { calls += 1; return ""; } }));
    const response = await handler(request({ action: "chat", babyId: BABY_ID, question: "입술이 파래지고 숨을 못 쉬어요", history: [] }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.urgent).toBe(true);
    expect(calls).toBe(0);
  });

  test("다른 가족이거나 없는 아기는 찾을 수 없다고 응답한다", async () => {
    const handler = createBabyAiHandler(fakeDeps({ loadContext: async () => null }));
    const response = await handler(request({ action: "generate-strategy", babyId: BABY_ID, kind: "sleep" }));
    expect(response.status).toBe(404);
  });

  test("일반 질문에 세션 기반 답변을 반환한다", async () => {
    const handler = createBabyAiHandler(fakeDeps({ generateText: async (prompt) => prompt.includes("낮잠") ? "낮잠 답변" : "다른 답변" }));
    const response = await handler(request({ action: "chat", babyId: BABY_ID, question: "낮잠은?", history: [] }));
    expect(await response.json()).toMatchObject({ answer: "낮잠 답변", urgent: false });
  });

  test("전략 JSON을 검증한 뒤 초안으로 저장한다", async () => {
    const strategy = JSON.stringify({
      summary: "요약",
      observations: ["관찰"],
      actions: ["실행"],
      watch: ["지표"],
      reassess: "3일",
      safety: "필요시 상담",
    });
    let saved;
    const handler = createBabyAiHandler(fakeDeps({
      generateText: async () => strategy,
      saveDraft: async (input) => { saved = input; return { id: "draft-2" }; },
    }));
    const response = await handler(request({ action: "generate-strategy", babyId: BABY_ID, kind: "feeding" }));
    expect(response.status).toBe(200);
    expect(saved.kind).toBe("feeding");
    expect((await response.json()).draftId).toBe("draft-2");
  });

  test("전략 생성은 여섯 필수 필드의 JSON schema를 전달한다", async () => {
    const strategy = JSON.stringify({
      summary: "요약",
      observations: [],
      actions: ["실행"],
      watch: [],
      reassess: "3일",
      safety: "필요시 상담",
    });
    let receivedSchema;
    const handler = createBabyAiHandler(fakeDeps({
      generateText: async (_prompt, options) => {
        receivedSchema = options.responseSchema;
        return strategy;
      },
    }));

    const response = await handler(request({ action: "generate-strategy", babyId: BABY_ID, kind: "sleep" }));

    expect(response.status).toBe(200);
    expect(receivedSchema.required).toEqual([
      "summary",
      "observations",
      "actions",
      "watch",
      "reassess",
      "safety",
    ]);
  });

  test("잘못된 전략 응답을 한 번 교정한 뒤 저장한다", async () => {
    let calls = 0;
    const handler = createBabyAiHandler(fakeDeps({
      generateText: async () => {
        calls += 1;
        return calls === 1
          ? "not-json"
          : JSON.stringify({ summary: "요약", observations: [], actions: ["실행"], watch: [], reassess: "내일", safety: "상담" });
      },
    }));
    const response = await handler(request({ action: "generate-strategy", babyId: BABY_ID, kind: "sleep" }));
    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  test("예약 작업은 별도 비밀 토큰을 요구한다", async () => {
    const handler = createBabyAiHandler(fakeDeps());
    const denied = await handler(request({ action: "process-refresh-queue" }, { auth: false }));
    const allowed = await handler(request({ action: "process-refresh-queue" }, { auth: false, cron: true }));
    expect(denied.status).toBe(401);
    expect(await allowed.json()).toEqual({ processed: 2, failed: 0 });
  });
});
