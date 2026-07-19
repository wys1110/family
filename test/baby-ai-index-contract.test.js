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
