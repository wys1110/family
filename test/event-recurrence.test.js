import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = readFileSync('event-recurrence.js', 'utf8');
const config = readFileSync('config.js', 'utf8');

test('일정 입력 화면에 반복 주기와 종료일을 추가한다', () => {
  expect(config).toContain('{ name: "event-recurrence", version: "20260720-v1" }');
  expect(source).toContain("<option value=\"daily\">매일</option>");
  expect(source).toContain("<option value=\"weekly\">매주</option>");
  expect(source).toContain("<option value=\"monthly\">매월</option>");
  expect(source).toContain("<option value=\"yearly\">매년</option>");
  expect(source).toContain('id="eventRecurrenceUntil"');
});

test('기간 일정의 길이를 유지하며 종료일까지 반복 일정을 생성한다', () => {
  expect(source).toContain('const generateOccurrences = (template, recurrence, recurrenceUntil)');
  expect(source).toContain('const duration = Math.max(0, dayDistanceBetween(template.date, template.endDate || template.date))');
  expect(source).toContain('endDate: addDaysToKey(date, duration)');
  expect(source).toContain('const MAX_OCCURRENCES = 400');
});

test('반복 저장은 기존 단일 저장을 가로채 일괄 upsert하고 알림 설정도 복사한다', () => {
  expect(source).toContain("form.addEventListener('submit', saveRepeatedEvent, { capture: true })");
  expect(source).toContain("state.supabase.from('events').upsert(items.map((item) => window.toRemote(item)))");
  expect(source).toContain('copyReminderSettings(items, template)');
});
