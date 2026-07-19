import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("Gemini 할당량 오류를 쉬는 중 안내로 바꾼다", () => {
  const source = readFileSync("baby-ai-friendly-errors.js", "utf8");
  expect(source).toContain("AI 사용량이 잠시 많아요");
  expect(source).toContain("제미나이가 지금 쉬는 중이에요 😴 잠시 후 다시 질문해 주세요.");
  expect(source).toContain('data.last_error === "GEMINI_HTTP_429"');
});

test("친화적 오류 모듈을 AI UI 뒤에 로드한다", () => {
  const config = readFileSync("config.js", "utf8");
  const babyAiIndex = config.indexOf('{ name: "baby-ai",');
  const friendlyErrorIndex = config.indexOf('{ name: "baby-ai-friendly-errors",');
  expect(babyAiIndex).toBeGreaterThanOrEqual(0);
  expect(friendlyErrorIndex).toBeGreaterThan(babyAiIndex);
});
