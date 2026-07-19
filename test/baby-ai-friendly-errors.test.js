import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("Gemini 할당량 오류를 쉬는 중 안내로 바꾼다", () => {
  const source = readFileSync("baby-ai-core.js", "utf8");
  expect(source).toContain("AI 사용량이 잠시 많아요");
  expect(source).toContain("제미나이가 지금 쉬는 중이에요 😴 잠시 후 다시 질문해 주세요.");
  expect(source).toContain("replaceGeminiRateLimitMessage");
  expect(source).toContain("MutationObserver");
});
