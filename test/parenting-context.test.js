import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';
const window = {};
vm.runInNewContext(readFileSync('parenting-context.js', 'utf8'), { window, Date, Intl, growthCareType: entry => entry.category === '수유·이유식' ? ({ '모유': 'breast', '유축모유': 'pumped', '이유식': 'solid' }[entry.feedingType] || 'formula') : '' });
const summarize = window.FAMILY_PARENTING_CONTEXT.summarize;
const now = new Date('2026-10-18T00:30:00+09:00');
const state = { babies: [{ id: 'one', name: '비공개 이름', birthDate: '2026-07-10' }, { id: 'two', birthDate: '2026-01-01' }], growthEntries: [
  { babyId: 'one', category: '성장', date: '2026-10-10', weight: 6.2, note: '비공개 메모' },
  { babyId: 'one', category: '수유·이유식', date: '2026-10-17', time: '23:30', feedingType: '모유', feedingMinutes: 20 },
  { babyId: 'one', category: '수유·이유식', date: '2026-10-18', time: '00:10', feedingType: '분유', feedingMl: 100 },
  { babyId: 'one', category: '기저귀', date: '2026-10-18', time: '00:20', diaperKind: '소변·대변' },
  { babyId: 'two', category: '성장', date: '2026-10-18', weight: 9.9 },
  { babyId: 'one', category: '성장', date: '2026-10-19', weight: 8.8 },
  { babyId: 'one', category: '기저귀', date: '2026-10-18', time: '23:30', diaperKind: '대변' },
] };
test('uses the selected child and Korean calendar date, excluding future records and identifying missing data', () => {
  const summary = summarize(state, 'one', now);
  expect(summary).toContain('생후 100일 경과');
  expect(summary).toContain('6.2kg · 2026-10-10 측정 (8일 전)');
  expect(summary).toContain('머리둘레: 측정 기록 없음');
  expect(summary).toContain('최근 두 수유 기록 간격: 40분');
  expect(summary).toContain('2026-10-18 오늘 진행 중: 수유 기록 1회, 분유·유축 100mL');
  expect(summary).toContain('대변 1회, 소변 1회');
  expect(summary).toContain('직수 1회·20분');
  for (const excluded of ['9.9', '8.8', '비공개', '2026-07-10', '23:30 (대변)']) expect(summary).not.toContain(excluded);
});
test('absent or invalid birth dates and missing logs are not treated as normal health', () => {
  expect(summarize({ babies: [{ id: 'one', birthDate: '2026-02-31' }], growthEntries: [] }, 'one', now)).toContain('생후 일수: 생일 미기록');
  expect(summarize({ babies: [{ id: 'one' }], growthEntries: [] }, 'one', now)).toContain('2026-10-18: 기록 없음');
  expect(summarize(state, 'unknown', now)).toContain('선택된 아이가 없어요');
});
