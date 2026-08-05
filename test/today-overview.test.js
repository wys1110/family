import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('today-overview.js', 'utf8');
const css = readFileSync('today-overview.css', 'utf8');
const config = readFileSync('config.js', 'utf8');

describe('today overview card', () => {
  test('오늘 요약 카드는 네 가지 요약 항목과 접근 가능한 이름을 가진다', () => {
    expect(source).toContain("card.id = 'todayOverviewCard'");
    expect(source).toContain('data-today-overview-target="calendar"');
    expect(source).toContain('data-today-overview-target="todo"');
    expect(source).toContain('data-today-overview-target="notifications"');
    expect(css).toContain('min-height: 44px');
  });

  test('공유 집계 유틸리티와 버전 모듈로 연결된다', () => {
    expect(source).toContain('FAMILY_UTILITY_API');
    expect(config).toContain('{ name: "family-utility", version: "20260805-family-utility-v1", style: false }');
    expect(config).toContain('{ name: "today-overview", version: "20260805-today-overview-v1" }');
  });
});
