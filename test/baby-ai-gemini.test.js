import { describe, expect, test } from "vitest";
import { createGeminiTransport } from "../supabase/functions/baby-ai/gemini.ts";

describe("Gemini 전송 계층", () => {
  test("빈 API 키를 거부한다", () => {
    expect(() => createGeminiTransport({ apiKey: "  " })).toThrow("GEMINI_API_KEY_REQUIRED");
  });

  test("API 키를 헤더로 보내고 텍스트를 추출한다", async () => {
    let observed;
    const transport = createGeminiTransport({
      apiKey: "secret-key",
      model: "gemini-test",
      fetchImpl: async (url, init) => {
        observed = { url, init };
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "답변" }] } }] }), { status: 200 });
      },
    });
    expect(await transport.generateText("질문", { json: false })).toBe("답변");
    expect(observed.init.headers["x-goog-api-key"]).toBe("secret-key");
    expect(observed.url).toContain("gemini-test:generateContent");
  });

  test("구조화 응답을 요청할 때 JSON MIME 타입을 지정한다", async () => {
    let requestBody;
    const transport = createGeminiTransport({
      apiKey: "secret-key",
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }), { status: 200 });
      },
    });
    await transport.generateText("전략", { json: true });
    expect(requestBody.generationConfig.responseMimeType).toBe("application/json");
  });

  test("실패 응답 본문이나 키를 오류에 노출하지 않는다", async () => {
    const transport = createGeminiTransport({
      apiKey: "do-not-leak",
      fetchImpl: async () => new Response("provider secret detail", { status: 429 }),
    });
    await expect(transport.generateText("질문", { json: false })).rejects.toThrow("GEMINI_HTTP_429");
  });
});
