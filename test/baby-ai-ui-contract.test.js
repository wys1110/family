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
  expect(config).toContain('{ name: "baby-ai", version: "20260719-v2"');
  expect(config.indexOf('{ name: "baby-ai-core",')).toBeLessThan(config.indexOf('{ name: "baby-ai",'));
});

test("UI 모듈은 프로필, 질문, 전략 확정 동작을 연결한다", () => {
  const source = readFileSync("baby-ai.js", "utf8");
  expect(source).toContain('from("baby_ai_profiles")');
  expect(source).toContain('functions.invoke("baby-ai"');
  expect(source).toContain('rpc("confirm_baby_ai_strategy"');
  expect(source).toContain("familybabychange");
});

test("AI 답변과 전략은 안전한 실제 출처 링크를 표시한다", () => {
  const source = readFileSync("baby-ai.js", "utf8");
  const style = readFileSync("baby-ai.css", "utf8");
  expect(source).toContain("renderBabyAiSources");
  expect(source).toContain('rel="noopener noreferrer"');
  expect(source).toContain("출처 표시 기능 적용 전에 생성된 전략이에요");
  expect(style).toContain(".baby-ai-sources");
  expect(style).toContain("overflow-wrap: anywhere");
});

test("Function 오류를 로그인, 네트워크, 할당량, 구조, 검색 실패로 나눈다", () => {
  const source = readFileSync("baby-ai.js", "utf8");
  expect(source).toContain("readFunctionErrorCode");
  expect(source).toContain("babyAiErrorMessage");
  expect(source).toContain("로그인이 만료됐어요");
  expect(source).toContain("인터넷 연결을 확인해 주세요");
  expect(source).toContain("AI 사용량이 잠시 많아요");
  expect(source).toContain("AI 답변 형식을 확인하지 못했어요");
  expect(source).toContain("믿을 만한 인터넷 자료를 찾지 못했어요");
});
