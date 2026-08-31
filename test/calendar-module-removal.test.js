import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const config = readFileSync('config.js', 'utf8');
const utility = readFileSync('family-utility.js', 'utf8');

test('일정에서 오늘 한눈에 보기와 패밀리 핸드오프 모듈을 제거한다', () => {
  expect(config).not.toContain('today-overview');
  expect(config).not.toContain('family-handoff');
  expect(existsSync('today-overview.js')).toBe(false);
  expect(existsSync('today-overview.css')).toBe(false);
  expect(existsSync('family-handoff.js')).toBe(false);
  expect(existsSync('family-handoff.css')).toBe(false);
});

test('가족 검색에 필요한 유틸리티 API는 유지한다', () => {
  expect(utility).toContain('const searchRecords');
  expect(utility).toContain('window.FAMILY_UTILITY_API = { searchRecords }');
});
