import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("README가 AI 배포 순서와 비밀값 경계를 설명한다", () => {
  const readme = readFileSync("README.md", "utf8");
  expect(readme).toContain("AI 육아 도우미 배포");
  expect(readme).toContain("20260719_baby_ai_assistant.sql");
  expect(readme).toContain("GEMINI_API_KEY");
  expect(readme).toContain("BABY_AI_CRON_SECRET");
  expect(readme).toContain("supabase functions deploy baby-ai");
  expect(readme).toContain("baby-ai-cron.sql");
});

test("cron SQL은 Vault 비밀값으로 5분마다 큐를 처리한다", () => {
  const sql = readFileSync("supabase/baby-ai-cron.sql", "utf8");
  expect(sql).toContain("*/5 * * * *");
  expect(sql).toContain("baby_ai_project_url");
  expect(sql).toContain("baby_ai_publishable_key");
  expect(sql).toContain("baby_ai_cron_secret");
  expect(sql).toContain('"action":"process-refresh-queue"');
});

test("로컬 비밀 파일은 Git에서 제외한다", () => {
  const ignore = readFileSync(".gitignore", "utf8");
  expect(ignore).toContain(".env");
  expect(ignore).toContain("node_modules/");
  expect(ignore).toContain("supabase/.env.ai");
});
