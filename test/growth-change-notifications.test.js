import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const schema = readFileSync("supabase/schema.sql", "utf8");
const edge = readFileSync("supabase/functions/daily-briefing-push/index.ts", "utf8");
const growthNotification = readFileSync("supabase/functions/daily-briefing-push/growth-notification.ts", "utf8");
const migrationName = readdirSync("supabase/migrations").find((name) => name.endsWith("_growth_change_notifications.sql"));
const migration = migrationName && existsSync(`supabase/migrations/${migrationName}`)
  ? readFileSync(`supabase/migrations/${migrationName}`, "utf8")
  : "";

test("성장 변경 알림을 저장할 수 있도록 notifications 허용값을 확장한다", () => {
  expect(migrationName).toBeTruthy();
  expect(migration).toContain("growth_change");
  expect(migration).toContain("source_type");
  expect(migration).toContain("'growth'");
  expect(schema).toContain("growth_change");
  expect(schema).toContain("'growth'");
});

test("성장 변경을 다른 가족 구성원에게만 안전하게 전달한다", () => {
  expect(edge).toContain('if (body.action === "growth-change")');
  expect(edge).toContain("normalizeGrowthChange(body.change)");
  expect(edge).toContain('kind: "growth_change"');
  expect(edge).toContain('sourceType: "growth"');
  expect(edge).toContain("sourceId");
  expect(edge).toContain("sourceDate");
  expect(edge).toContain("growth-change:");
  expect(edge).toContain("buildGrowthChangePayload(change, actorLabel)");
  expect(edge).toContain("INVALID_GROWTH_CHANGE");
  expect(growthNotification).toContain('url: `./?growthDate=${encodeURIComponent(change.sourceDate || "")}');
  expect(edge).not.toContain("change.note");
  expect(edge).not.toContain("change.photo_paths");
});

test("성장 알림은 구체적인 기록 내용과 기록자 호칭만 제목에 표시한다", () => {
  expect(edge).toContain("user.user_metadata?.family_role");
  expect(growthNotification).toContain("growthNotificationDetails(change)");
  expect(growthNotification).toContain("`${change.feedingSide} 수유`");
  expect(growthNotification).toContain("normalizeFamilyRole(actorLabel)");
  expect(growthNotification).toContain('body: ""');
  expect(edge).not.toContain('created: "성장 기록이 추가됐어요"');
});
