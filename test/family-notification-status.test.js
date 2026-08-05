import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('notification-center.js', 'utf8');
const briefingSource = readFileSync('daily-briefing.js', 'utf8');

describe('family notification delivery status', () => {
  test('푸시 설정이 없을 때 성공으로 표시하지 않는다', () => {
    expect(source).toContain('not-configured');
    expect(briefingSource).toContain('VAPID');
    expect(briefingSource).toContain('알림 연결 상태');
    expect(source).toContain('getDeliveryStatus');
  });

  test('읽지 않은 수와 상태 API를 외부 모듈에 제공한다', () => {
    expect(source).toContain('FAMILY_NOTIFICATION_API');
    expect(source).toContain('family:notification-count-changed');
    expect(briefingSource).toContain('FAMILY_DAILY_BRIEFING_API');
  });
});
