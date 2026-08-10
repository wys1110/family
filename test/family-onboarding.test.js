import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

describe('family activation onboarding', () => {
  test('derives activation from the active baby, care entries, and current household members', () => {
    const source = read('family-onboarding.js');

    expect(source).toContain('const hasFirstCare = (current) =>');
    expect(source).toContain('entry.babyId === current.activeBabyId');
    expect(source).toContain("from('household_members')");
    expect(source).toContain(".eq('household_id', householdId)");
    expect(source).toContain('state.household?.id !== householdId');
    expect(source).toContain('window.FAMILY_ONBOARDING_API = { getSnapshot }');
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

    expect(source).toContain("'familycontextchange'");
    expect(source).toContain("'familybabychange'");
    expect(source).toContain("'family:growth-entry-saved'");
    expect(source).toContain("'family:baby-saved'");
    expect(source).toContain("hero.insertAdjacentElement('afterend', card)");
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('var(--surface)');
    expect(config).toContain('{ name: "family-onboarding", version: "20260810-v1" }');
  });
});
