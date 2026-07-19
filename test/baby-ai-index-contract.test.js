import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("Edge Function 진입점이 인증, 가족 데이터, 큐 처리를 연결한다", () => {
  const source = readFileSync("supabase/functions/baby-ai/index.ts", "utf8");
  expect(source).toContain("Deno.serve");
  expect(source).toContain("auth.getUser");
  expect(source).toContain('from("baby_ai_profiles")');
  expect(source).toContain('from("growth_entries")');
  expect(source).toContain('from("baby_ai_refresh_queue")');
  expect(source).toContain("generation");
  expect(source).toContain("GEMINI_API_KEY");
  expect(source).toContain("BABY_AI_CRON_SECRET");
});

test("JWT 검증을 핸들러 안에서 명시적으로 수행한다", () => {
  const config = readFileSync("supabase/config.toml", "utf8");
  expect(config).toContain("[functions.baby-ai]");
  expect(config).toContain("verify_jwt = false");
});

test("예약 전략 생성도 필수 JSON schema를 사용한다", () => {
  const entrypoint = readFileSync("supabase/functions/baby-ai/index.ts", "utf8");
  const handler = readFileSync("supabase/functions/baby-ai/handler.ts", "utf8");
  expect(entrypoint).toContain("generateGroundedStrategy");
  expect(handler).toContain("responseSchema: STRATEGY_RESPONSE_SCHEMA");
});

test("Edge Function은 검색 grounding과 안전 오류 로깅을 연결한다", () => {
  const source = readFileSync("supabase/functions/baby-ai/index.ts", "utf8");
  expect(source).toContain("generateGroundedText");
  expect(source).toContain("BABY_AI_ERROR");
  expect(source).not.toContain("console.error(prompt)");
});
