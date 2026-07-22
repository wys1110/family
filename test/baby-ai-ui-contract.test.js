import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const html = readFileSync("index.html", "utf8");
const config = readFileSync("config.js", "utf8");
const packageJson = readFileSync("package.json", "utf8");

test("사용하지 않는 AI 육아 도우미 UI와 브라우저 코드를 제공하지 않는다", () => {
  expect(html).not.toContain('id="babyAiAssistant"');
  expect(html).not.toContain('id="babyAiStatus"');
  expect(config).not.toContain('{ name: "baby-ai"');
  expect(config).not.toContain('{ name: "baby-ai-core"');
  expect(config).not.toContain('{ name: "baby-ai-time-fields"');
  expect(config).not.toContain('{ name: "night-baby-ai-polish"');
  expect(packageJson).not.toContain("node --check baby-ai.js");
  expect(existsSync("baby-ai.js")).toBe(false);
  expect(existsSync("baby-ai-core.js")).toBe(false);
  expect(existsSync("baby-ai.css")).toBe(false);
});

test("AI 서버와 기존 데이터 마이그레이션은 복구 가능하게 보존한다", () => {
  expect(existsSync("supabase/functions/baby-ai/index.ts")).toBe(true);
  expect(existsSync("supabase/functions/baby-ai/handler.ts")).toBe(true);
  expect(existsSync("supabase/migrations/20260719_baby_ai_assistant.sql")).toBe(true);
  expect(readFileSync("supabase/config.toml", "utf8")).toContain("[functions.baby-ai]");
});
