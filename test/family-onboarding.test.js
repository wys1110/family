import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(path, 'utf8');

const onboardingApi = () => {
  const context = {
    document: { querySelector: () => null },
    setTimeout: () => 0,
    window: { FAMILY_DEMO_MODE: false, addEventListener: () => {} },
  };
  vm.runInNewContext(read('family-onboarding.js'), context);
  return context.window.FAMILY_ONBOARDING_API;
};

describe('family activation onboarding', () => {
  test('derives activation from the active baby, care entries, and current household members', () => {
    const source = read('family-onboarding.js');

    expect(source).toContain('const hasFirstCare = (current) =>');
    expect(source).toContain('entry.babyId === current.activeBabyId');
    expect(source).toContain("from('household_members')");
    expect(source).toContain(".eq('household_id', householdId)");
    expect(source).toContain('state.household?.id !== householdId');
    expect(source).toContain("console.warn('가족 구성원 수를 불러오지 못했어요', error);\n      memberCount = null;\n      scheduleMemberRefresh();");
    expect(source).toContain('window.FAMILY_ONBOARDING_API = { deriveSnapshot, getSnapshot }');
  });

  test('a second member completes onboarding, while deleting the only active-baby record returns the care step', () => {
    const api = onboardingApi();
    const current = {
      activeBabyId: 'baby-a',
      babies: [{ id: 'baby-a' }],
      householdRole: 'owner',
      growthEntries: [{ babyId: 'baby-a', title: '첫 수유' }],
    };

    expect(api.deriveSnapshot(current, 1).complete).toBe(false);
    expect(api.deriveSnapshot(current, 2).complete).toBe(true);
    expect(api.deriveSnapshot({ ...current, growthEntries: [] }, 2).hasFirstCare).toBe(false);
  });

  test('switching to a different active baby recalculates the first-care state for that baby only', () => {
    const api = onboardingApi();
    const current = {
      babies: [{ id: 'baby-a' }, { id: 'baby-b' }],
      householdRole: 'owner',
      growthEntries: [{ babyId: 'baby-a', title: '첫 수유' }],
    };

    expect(api.deriveSnapshot({ ...current, activeBabyId: 'baby-a' }, 2).hasFirstCare).toBe(true);
    expect(api.deriveSnapshot({ ...current, activeBabyId: 'baby-b' }, 2).hasFirstCare).toBe(false);
  });

  test('uses only existing profile, record, and account flows', () => {
    const source = read('family-onboarding.js');
    const appSource = read('app.js');

    expect(source).toContain('data-family-onboarding-action');
    expect(source).toContain("if (action === 'baby') return openBabyDialog()");
    expect(source).toContain("if (action === 'care') return openGrowthQuick('수유·이유식')");
    expect(source).toContain("if (action === 'invite') return openAccountDialog()");
    expect(appSource).toContain("new CustomEvent('family:baby-saved'");
  });

  test('registers a responsive semantic module and refreshes on real data changes', () => {
    const source = read('family-onboarding.js');
    const css = read('family-onboarding.css');
    const config = read('config.js');
    const appSource = read('app.js');

    expect(source).toContain("'familycontextchange'");
    expect(source).toContain("'familybabychange'");
    expect(source).toContain("'family:growth-entry-saved'");
    expect(source).toContain("'family:growth-entry-deleted'");
    expect(source).toContain("'family:baby-saved'");
    expect(source).toContain("hero.insertAdjacentElement('afterend', card)");
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('var(--surface)');
    expect(config).toContain('{ name: "family-onboarding", version: "20260830-auth-recovery-v2" }');
    expect(appSource).toContain("new CustomEvent('family:growth-entry-deleted'");
  });
});
