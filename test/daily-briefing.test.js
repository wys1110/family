import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const client = readFileSync("daily-briefing.js", "utf8");
const worker = readFileSync("service-worker.js", "utf8");
const edge = readFileSync("supabase/functions/daily-briefing-push/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260719_daily_briefing_push.sql", "utf8");
const notificationChannelsMigration = readFileSync("supabase/migrations/202607220001_schedule_notification_channels.sql", "utf8");
const cron = readFileSync("supabase/daily-briefing-cron.sql", "utf8");

test("가족 일정 변경 푸시 모듈을 설정 화면에 연결한다", () => {
  const config = readFileSync("config.js", "utf8");
  expect(config).toContain('{ name: "daily-briefing", version: "20260830-auth-recovery-v2" }');
  expect(client).toContain('const SUBSCRIPTION_TIME = "09:00"');
  expect(client).toContain('card.id = "eventChangePushSettings"');
  expect(client).toContain('Notification.requestPermission()');
});

test("iPhone은 홈 화면 앱에서만 푸시 권한을 요청하도록 안내한다", () => {
  expect(client).toContain('const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches');
  expect(client).toContain('if (isIos() && !isStandalone())');
  expect(client).toContain("홈 화면에 추가");
});

test("Edge Function의 실제 오류 코드를 읽어 원인별로 안내한다", () => {
  expect(client).toContain("context.clone().json()");
  expect(client).toContain('code.includes("PUSH_NOT_CONFIGURED")');
  expect(client).toContain('code.includes("SUBSCRIBE_FAILED")');
  expect(client).toContain("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
});

test("구독 저장 실패 시 켜짐 상태를 남기지 않고 브리핑은 항상 끈다", () => {
  expect(client).toContain("await syncSubscription(subscription, { pushEnabled: true })");
  expect(client).toContain("briefingEnabled: false");
  expect(client).toContain("pushSettings.enabled = false;");
  expect(client).not.toContain("sendTest");
});

test("서비스 워커가 백그라운드 푸시를 표시하고 일정 화면을 연다", () => {
  expect(worker).toContain('self.addEventListener("push"');
  expect(worker).toContain("self.registration.showNotification");
  expect(worker).toContain('self.addEventListener("notificationclick"');
  expect(worker).toContain("self.clients.openWindow");
});

test("구독 정보는 RLS가 켜진 전용 테이블에 저장한다", () => {
  expect(migration).toContain("create table if not exists public.push_subscriptions");
  expect(migration).toContain("alter table public.push_subscriptions enable row level security");
  expect(migration).toContain("briefing_time time not null default '09:00'");
  expect(migration).toContain("briefing_enabled boolean not null default true");
  expect(notificationChannelsMigration).toContain("add column if not exists briefing_enabled boolean not null default true");
  expect(migration).not.toMatch(/create policy/i);
});

test("서버는 가족 구성원만 등록하고 오늘 범위 일정을 브리핑한다", () => {
  expect(edge).toContain("await isHouseholdMember(userClient, user.id, householdId)");
  expect(edge).toContain('.lte("event_date", localDate)');
  expect(edge).toContain('.gte("event_end_date", localDate)');
  expect(edge).toContain("subscription.last_sent_on === local.date");
  expect(edge).toContain('.eq("briefing_enabled", true)');
  expect(edge).toContain("x-daily-briefing-cron");
});

test("가족 일정 변경 알림을 끄면 현재 기기 구독을 비활성화한다", () => {
  expect(client).toContain("await syncSubscription(subscription, { pushEnabled: false })");
  expect(client).toContain("이 기기의 가족 일정 변경 알림을 껐어요");
  expect(edge).toContain("briefing_enabled: briefingEnabled");
});

test("5분 크론이 비밀 헤더로 푸시 디스패처를 호출한다", () => {
  expect(cron).toContain("'*/5 * * * *'");
  expect(cron).toContain("'x-daily-briefing-cron'");
  expect(cron).toContain("daily_briefing_cron_secret");
});
