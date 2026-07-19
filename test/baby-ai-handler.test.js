import { describe, expect, test } from "vitest";
import { createBabyAiHandler } from "../supabase/functions/baby-ai/handler.ts";

const BABY_ID = "11111111-1111-4111-8111-111111111111";
const context = {
  baby: { ageDays: 90, sex: "남아" },
  profile: { temperament: "소리에 예민함" },
  logs: [],
};
const officialSource = { title: "질병관리청", url: "https://www.kdca.go.kr/health", type: "web" };

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
    generateGroundedText: async () => ({ text: "공식 근거", sources: [officialSource], grounded: true }),
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
    const handler = createBabyAiHandler(fakeDeps({
      generateGroundedText: async () => { calls += 1; return { text: "", sources: [], grounded: false }; },
      generateText: async () => { calls += 1; return ""; },
    }));
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
    expect(await response.json()).toMatchObject({
      answer: "낮잠 답변",
      urgent: false,
      grounded: true,
      sources: [officialSource],
    });
  });

  test("일반 전략은 검색 후 schema 합성을 하고 실제 출처를 저장한다", async () => {
    const calls = [];
    let saved;
    const strategy = JSON.stringify({
      summary: "요약",
      observations: [],
      actions: ["실행"],
      watch: [],
      reassess: "내일",
      safety: "상담",
    });
    const handler = createBabyAiHandler(fakeDeps({
      generateGroundedText: async (prompt) => {
        calls.push({ kind: "search", prompt });
        return { text: "공식 수면 근거", sources: [officialSource], grounded: true };
      },
      generateText: async (prompt, options) => {
        calls.push({ kind: "synthesis", prompt, options });
        return strategy;
      },
      saveDraft: async (input) => { saved = input; return { id: "draft-grounded" }; },
    }));

    const response = await handler(request({ action: "generate-strategy", babyId: BABY_ID, kind: "sleep" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(calls.map((call) => call.kind)).toEqual(["search", "synthesis"]);
    expect(calls[1].options.responseSchema.required).toContain("summary");
    expect(saved.content.sources).toEqual([officialSource]);
    expect(body.content.sources).toEqual([officialSource]);
  });

  test("허용된 검색 출처가 없으면 한 번 재시도한 뒤 안전 오류를 반환한다", async () => {
    let searches = 0;
    const handler = createBabyAiHandler(fakeDeps({
      generateGroundedText: async () => {
        searches += 1;
        return { text: "근거 없음", sources: [], grounded: false };
      },
    }));

    const response = await handler(request({ action: "generate-strategy", babyId: BABY_ID, kind: "sleep" }));

    expect(searches).toBe(2);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "GROUNDING_UNAVAILABLE" });
  });

  test("잘못된 전략 응답은 구체적인 안전 오류 코드로 반환한다", async () => {
    const handler = createBabyAiHandler(fakeDeps({ generateText: async () => "not-json" }));

    const response = await handler(request({ action: "generate-strategy", babyId: BABY_ID, kind: "sleep" }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "INVALID_AI_RESPONSE" });
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
