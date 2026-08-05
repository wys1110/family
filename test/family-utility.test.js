import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('family-utility.js', 'utf8');

const loadApi = () => {
  const window = {};
  new Function('window', source)(window);
  return window.FAMILY_UTILITY_API;
};

describe('family utility aggregation', () => {
  test('오늘 요약은 현재 날짜의 일정·돌봄·미완료 할 일만 집계한다', () => {
    const api = loadApi();
    const result = api.todaySummary({
      todayKey: '2026-08-05',
      events: [
        { id: 'e1', title: '소아과', date: '2026-08-05', time: '14:30' },
        { id: 'e2', title: '지난 일정', date: '2026-08-04', time: '09:00' },
      ],
      growthEntries: [
        { category: '수유·이유식', date: '2026-08-05', feedingMl: 120 },
        { category: '수면', date: '2026-08-05', sleepMinutes: 80 },
        { category: '기저귀', date: '2026-08-05' },
      ],
      todos: [
        { id: 't1', dueDate: '2026-08-05', completed: false },
        { id: 't2', dueDate: '2026-08-05', completed: true },
      ],
      unreadNotifications: 2,
    });

    expect(result).toMatchObject({ eventCount: 1, todoCount: 1, feedingMl: 120, sleepMinutes: 80, diaperCount: 1, unreadNotifications: 2 });
    expect(result.nextEvent).toMatchObject({ id: 'e1', title: '소아과' });
  });

  test('검색은 제목·메모·담당자에서 찾고 유형 필터를 적용한다', () => {
    const api = loadApi();
    const records = api.searchRecords({
      query: '예방',
      filter: 'event',
      events: [{ id: 'e1', title: '예방접종', note: '아기수첩', date: '2026-08-05', member: '가족' }],
      growthEntries: [{ id: 'g1', title: '예방 기록', date: '2026-08-05', category: '건강·병원' }],
      todos: [],
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: 'event', id: 'e1', source: 'event' });
  });
});
