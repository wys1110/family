import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("AI 카드와 접근 가능한 상태 영역을 제공한다", () => {
  const html = readFileSync("index.html", "utf8");
  expect(html).toContain('id="babyAiAssistant"');
  expect(html).toContain('id="babyAiStatus"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('id="babyAiProfileForm"');
  expect(html).toContain('id="babyAiChatForm"');
});

test("AI core와 UI 모듈을 core 이후 순서대로 로드한다", () => {
  const config = readFileSync("config.js", "utf8");
  expect(config).toContain('{ name: "baby-ai-core",');
  expect(config).toContain('{ name: "baby-ai",');
  expect(config.indexOf('{ name: "baby-ai-core",')).toBeLessThan(config.indexOf('{ name: "baby-ai",'));
});

test("UI 모듈은 프로필, 질문, 전략 확정 동작을 연결한다", () => {
  const source = readFileSync("baby-ai.js", "utf8");
  expect(source).toContain('from("baby_ai_profiles")');
  expect(source).toContain('functions.invoke("baby-ai"');
  expect(source).toContain('rpc("confirm_baby_ai_strategy"');
  expect(source).toContain("familybabychange");
});
