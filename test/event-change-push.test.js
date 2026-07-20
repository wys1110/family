import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const client = readFileSync("event-change-push.js", "utf8");
const worker = readFileSync("service-worker.js", "utf8");
const edge = readFileSync("supabase/functions/daily-briefing-push/index.ts", "utf8");
const pkg = readFileSync("package.json", "utf8");

test("일정 추가·수정·이동·삭제를 가족 푸시 모듈이 감지한다", () => {
  expect(config).toContain('{ name: "event-change-push", version: "20260720-v1", style: false }');
  expect(client).toContain('const MUTATIONS = new Set(["insert", "upsert", "update", "delete"])');
  expect(client).toContain('action: "event-change"');
  expect(client).toContain('kind: moved ? "moved" : "updated"');
  expect(client).toContain('kind: "deleted"');
  expect(pkg).toContain("node --check event-change-push.js");
});

test("일정 변경 알림은 변경한 사람을 제외한 같은 가족의 구독 기기로 보낸다", () => {
  expect(edge).toContain('if (body.action === "event-change")');
  expect(edge).toContain('.eq("household_id", householdId)');
  expect(edge).toContain('.eq("enabled", true)');
  expect(edge).toContain('.neq("user_id", user.id)');
  expect(edge).toContain("buildEventChangePayload(change)");
});

test("일정 변경 푸시는 날짜와 일정 화면 이동 정보를 포함하고 다시 울린다", () => {
  expect(edge).toContain("가족 일정 날짜가 바뀌었어요");
  expect(edge).toContain('url: `./?eventDate=${encodeURIComponent(change.date)}`');
  expect(edge).toContain("renotify: true");
  expect(worker).toContain("renotify: Boolean(payload.renotify)");
  expect(worker).toContain("eventId: payload.eventId ||");
  expect(client).toContain('new URLSearchParams(location.search)');
  expect(client).toContain('state.selectedDate = date');
  expect(client).toContain('switchView("calendar")');
});

test("일정 변경 데이터는 서버에서 길이와 날짜 형식을 검증한다", () => {
  expect(edge).toContain("normalizeEventChange(body.change)");
  expect(edge).toContain('return json({ error: "INVALID_EVENT_CHANGE" }, 400)');
  expect(edge).toContain("normalizeDate(change.date)");
  expect(edge).toContain("cleanText(change.title, 80)");
});
