import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('family-utility.js', 'utf8');

const loadApi = () => {
  const window = {};
  new Function('window', source)(window);
  return window.FAMILY_UTILITY_API;
};

describe('family utility search', () => {
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
