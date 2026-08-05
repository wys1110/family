import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const source = read('settings-family-management.js');
const css = read('settings-family-management.css');
const config = read('config.js');
const serviceWorker = read('service-worker.js');
const migration = read('supabase/migrations/20260805_household_backup_imports.sql');

const loadApi = () => {
  const window = {};
  const document = { querySelector: () => null, documentElement: { dataset: {} } };
  new Function('window', 'document', source)(window, document);
  return window.FAMILY_SETTINGS_MANAGEMENT_API;
};

describe('settings family management', () => {
  test('loads a compact settings module and style', () => {
    expect(config).toContain('{ name: "settings-family-management", version: "20260805-settings-management-v1" }');
    expect(serviceWorker).toContain('url.pathname.endsWith("/settings-family-management.js")');
    expect(source).toContain('data-settings-family-members');
    expect(css).toContain('.settings-family-members-card');
  });

  test('normalizes names/colors and rejects duplicates without mutating state', () => {
    const api = loadApi();
    expect(api.normalizeMember({ name: '  할머니  ', color: '#b57d4b' })).toEqual({ name: '할머니', color: '#B57D4B' });
    expect(api.normalizeMember({ name: '', color: '#b57d4b' })).toBeNull();
    expect(api.hasDuplicateName([{ name: '아빠' }], ' 아빠 ')).toBe(true);
    expect(api.hasDuplicateName([{ name: '아빠' }], '엄마')).toBe(false);
  });

  test('archives a member instead of deleting a referenced calendar member', () => {
    const api = loadApi();
    expect(api.archiveDecision('아빠', [{ member: '아빠' }])).toEqual({ mode: 'archive', reason: 'referenced' });
    expect(api.archiveDecision('할머니', [])).toEqual({ mode: 'archive', reason: 'unused' });
    expect(source).toContain(".eq('household_id', context.householdId)");
    expect(source).toContain(".eq('id', member.id)");
    expect(source).toContain("archived_at");
  });

  test('uses an RLS-protected household backup registry for remote deduplication', () => {
    expect(migration).toContain('create table if not exists public.household_backup_imports');
    expect(migration).toContain('unique (household_id, backup_id)');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('public.is_household_member(household_id)');
    expect(source).toContain("household_backup_imports");
    expect(source).toContain("backupId");
  });

  test('scopes every restored row to the active household and current user', () => {
    const api = loadApi();
    expect(api.scopeRestoreRow('events', {
      id: 'old-id', household_id: 'other-household', created_by: 'other-user', title: '회의',
    }, { householdId: 'current-household', userId: 'current-user' })).toEqual({
      household_id: 'current-household', title: '회의',
    });
    expect(api.scopeRestoreRow('calendar_members', { name: '아빠' }, { householdId: 'current-household', userId: 'current-user' })).toEqual({
      household_id: 'current-household', created_by: 'current-user', name: '아빠', sort_order: 0,
    });
  });
});
