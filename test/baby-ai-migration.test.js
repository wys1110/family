import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function migrationSql() {
  return readFileSync("supabase/migrations/20260719_baby_ai_assistant.sql", "utf8");
}

describe("AI 육아 도우미 마이그레이션", () => {
  test.each(["baby_ai_profiles", "baby_ai_strategy_drafts", "baby_ai_refresh_queue"])(
    "%s 테이블과 RLS를 선언한다",
    (table) => {
      const sql = migrationSql();
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    },
  );

  test("가족 권한을 확인하고 30분 뒤로 큐를 upsert한다", () => {
    const sql = migrationSql();
    expect(sql).toContain("public.is_household_member");
    expect(sql).toContain("interval '30 minutes'");
    expect(sql).toContain("on conflict (baby_id) do update");
  });

  test("새 확정 전략이 기존 확정 전략을 교체한다", () => {
    const sql = migrationSql();
    expect(sql).toContain("status = 'superseded'");
    expect(sql).toContain("status = 'confirmed'");
  });

  test("전략 확정 시 같은 종류의 오래된 초안도 다시 노출되지 않게 정리한다", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/set status = 'superseded'[\s\S]*status in \('draft', 'confirmed'\)[\s\S]*id <> target_row\.id/);
  });

  test("프로필 텍스트와 전략 상태에 제약을 둔다", () => {
    const sql = migrationSql();
    expect(sql).toContain("char_length(baby_notes) <= 2000");
    expect(sql).toContain("status in ('draft', 'confirmed', 'superseded')");
    expect(sql).toContain("attempt_count between 0 and 3");
  });
});
