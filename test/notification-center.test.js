import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const config = readFileSync('config.js', 'utf8');
const client = readFileSync('notification-center.js', 'utf8');
const style = readFileSync('notification-center.css', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');

test('상단 알림 버튼과 새 알림·예정·지난 알림 목록을 설치한다', () => {
  expect(config).toContain('{ name: "notification-center", version: "20260720-mobile-width-v3" }');
  expect(client).toContain("button.id = 'notificationCenterButton'");
  expect(client).toContain('data-notification-filter="new"');
  expect(client).toContain('data-notification-filter="upcoming"');
  expect(client).toContain('data-notification-filter="history"');
  expect(style).toContain('.notification-center-button');
  expect(style).toContain('.notification-center-dialog');
});

test('일정과 할 일 등록창에 알림 시점 선택을 추가한다', () => {
  expect(client).toContain("id: 'eventReminderPreset'");
  expect(client).toContain('10분 전');
  expect(client).toContain('1시간 전');
  expect(client).toContain("id: 'todoReminderPreset'");
  expect(client).toContain('마감일 오전 9시');
  expect(client).toContain('하루 전 오전 9시');
  expect(client).toContain('type="datetime-local"');
});

test('알림 상태를 사용자와 가족 공간별로 분리하고 읽음·삭제·전달 상태를 보존한다', () => {
  expect(client).toContain('return `${state.session.user.id}:${state.household.id}`');
  expect(client).toContain('eventReminders: {}');
  expect(client).toContain('todoReminders: {}');
  expect(client).toContain('store.read[item.id] = Date.now()');
  expect(client).toContain('store.dismissed[item.id] = Date.now()');
  expect(client).toContain('store.delivered[item.id] = now');
});

test('앱이 실행 중일 때 기한 도달 알림을 서비스 워커로 표시한다', () => {
  expect(client).toContain('const POLL_INTERVAL_MS = 30_000');
  expect(client).toContain('registration.showNotification');
  expect(client).toContain("Notification.permission !== 'granted'");
  expect(packageJson).toContain('node --check notification-center.js');
});
