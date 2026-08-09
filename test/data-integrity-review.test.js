import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

describe('data integrity review fixes', () => {
  test('growth export keeps the baby identity with every row', () => {
    const source = read('settings-data-export.js');
    expect(source).toContain("'아기 ID'");
    expect(source).toContain('baby_id');
  });

  test('remote membership selection is scoped to the signed-in user', () => {
    const source = read('app.js');
    expect(source).toContain('.eq("user_id", state.session.user.id)');
  });

  test('remote mutations include the active household condition', () => {
    const source = read('app.js');
    expect(source).toContain('.eq("household_id", state.household.id).eq("id", id)');
  });
});
