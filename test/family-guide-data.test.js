import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('family-guide-data.js', 'utf8');
const sandbox = { window: {}, console };
vm.runInNewContext(source, sandbox);
const api = sandbox.window.FAMILY_GUIDE_DATA_API;

describe('family guide data', () => {
  test('모든 카드가 출처 필드를 가진다', () => {
    expect(api).toBeTruthy();
    expect(api.cards.length).toBeGreaterThan(0);
    api.cards.forEach((card) => {
      expect(card.sourceName).toBeTruthy();
      expect(card.sourceUrl).toMatch(/^https:\/\//);
      expect(card.checkedAt).toMatch(/^2026-08-06$/);
    });
  });

  test('예정일과 출산일 기준으로 단계를 계산한다', () => {
    expect(api.calculatePhase({ dueDate: '2026-08-20', todayKey: '2026-08-06' }).label).toBe('D-14');
    expect(api.calculatePhase({ birthDate: '2026-08-01', todayKey: '2026-08-06' }).label).toBe('생후 5일');
    expect(api.calculatePhase({ todayKey: '2026-08-06' }).mode).toBe('unknown');
  });

  test('profilePhaseInput은 프로필 출생일보다 아기 출생일을 우선한다', () => {
    expect(api.profilePhaseInput({ birthDate: '2026-08-01', dueDate: '2026-08-20' }, { birthDate: '2026-07-01' }))
      .toEqual({ birthDate: '2026-07-01', dueDate: '2026-08-20' });
  });

  test('지역·숨김·완료 필터를 적용한다', () => {
    const national = api.filterCards(api.cards, { region: {} });
    expect(national.some((card) => card.regionScope === 'regional')).toBe(false);
    const cards = api.filterCards(api.cards, {
      region: { sido: '서울특별시', sigungu: '마포구' },
      hiddenCardIds: ['prepare-hospital-bag'],
      completedCardIds: ['newborn-register'],
    });
    expect(cards.some((card) => card.id === 'prepare-hospital-bag')).toBe(false);
    expect(cards.find((card) => card.id === 'newborn-register')?.completed).toBe(true);
    expect(cards.every((card) => ['national', 'regional', '서울특별시', '마포구'].includes(card.regionScope))).toBe(true);
  });
});
