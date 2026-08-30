import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const source = read('settings-family-management.js');
const css = read('settings-family-management.css');
const config = read('config.js');
const serviceWorker = read('service-worker.js');
const migration = read('supabase/migrations/20260805_household_backup_imports.sql');
const integrityMigration = read('supabase/migrations/20260806_data-integrity-hardening.sql');
const restoreMeasurementFixMigration = read('supabase/migrations/20260809_fix_restore_backup_head_measurement.sql');

const loadApi = () => {
  const window = {};
  const document = { querySelector: () => null, documentElement: { dataset: {} } };
  new Function('window', 'document', source)(window, document);
  return window.FAMILY_SETTINGS_MANAGEMENT_API;
};

describe('settings family management', () => {
  test('loads a compact settings module and style', () => {
    expect(config).toContain('{ name: "settings-family-management", version: "20260830-auth-recovery-v2" }');
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
    expect(migration).toContain('public.is_household_owner(household_id)');
    expect(migration).toContain('owners can remove own household backup imports');
    expect(source).toContain("household_backup_imports");
    expect(source).toContain("backupId");
  });

  test('scopes every restored row to the active household and current user', () => {
    const api = loadApi();
    expect(api.scopeRestoreRow('events', {
      id: 'old-id', household_id: 'other-household', created_by: 'other-user', title: '회의',
    }, { householdId: 'current-household', userId: 'current-user' })).toEqual({
      household_id: 'current-household', created_by: 'current-user', title: '회의',
    });
    expect(api.scopeRestoreRow('calendar_members', { name: '아빠' }, { householdId: 'current-household', userId: 'current-user' })).toEqual({
      household_id: 'current-household', created_by: 'current-user', name: '아빠', sort_order: 0,
    });
  });

  test('remaps imported baby IDs before inserting growth rows', () => {
    const api = loadApi();
    const result = api.remapBackupTables({
      babies: [{ id: 'old-baby', name: '도윤' }],
      growth_entries: [{ id: 'old-growth', baby_id: 'old-baby', title: '수유' }],
      events: [],
      calendar_members: [],
    }, { householdId: 'current-household', userId: 'current-user' }, () => 'new-id');
    expect(result.babies[0]).toMatchObject({ id: 'new-id', household_id: 'current-household', created_by: 'current-user' });
    expect(result.growth_entries[0]).toMatchObject({ baby_id: 'new-id', household_id: 'current-household', created_by: 'current-user' });
  });

  test('converts local backup fields to the remote schema before restoring', () => {
    const api = loadApi();
    let sequence = 0;
    const result = api.remapBackupTables({
      babies: [{ id: 'old-baby', name: '도윤', birthDate: '2026-07-01', birthWeight: 3.2 }],
      events: [{ id: 'old-event', title: '진료', date: '2026-08-08', endDate: '2026-08-08', time: '09:00' }],
      growth_entries: [{ id: 'old-growth', babyId: 'old-baby', title: '수유', date: '2026-08-08', feedingMl: 120 }],
      calendar_members: [{ id: 'old-member', name: '엄마', color: '#B57D4B' }],
    }, { householdId: 'current-household', userId: 'current-user' }, () => `new-${++sequence}`);

    expect(result.babies[0]).toMatchObject({
      id: 'new-1', household_id: 'current-household', created_by: 'current-user', birth_date: '2026-07-01', birth_weight_kg: 3.2,
    });
    expect(result.babies[0]).not.toHaveProperty('birthDate');
    expect(result.events[0]).toMatchObject({
      household_id: 'current-household', event_date: '2026-08-08', event_end_date: '2026-08-08', event_time: '09:00',
    });
    expect(result.events[0]).not.toHaveProperty('date');
    expect(result.growth_entries[0]).toMatchObject({
      household_id: 'current-household', baby_id: 'new-1', entry_date: '2026-08-08', feeding_ml: 120,
    });
    expect(result.growth_entries[0]).not.toHaveProperty('babyId');
  });

  test('uses one owner-authorized database function for remote restores', () => {
    expect(source).toContain(".rpc('restore_household_backup'");
    expect(source).not.toContain("const registry = context.supabase.from('household_backup_imports')");
    expect(integrityMigration).toContain('create or replace function public.restore_household_backup');
    expect(integrityMigration).toContain('security definer');
    expect(integrityMigration).toContain('revoke all on function public.restore_household_backup');
    expect(integrityMigration).toContain('grant execute on function public.restore_household_backup');
  });

  test('hardening migration enforces household-scoped baby links and owner-only mutations', () => {
    expect(integrityMigration).toContain('growth_entries_baby_household_fkey');
    expect(integrityMigration).toContain('baby_ai_profiles_baby_household_fkey');
    expect(integrityMigration).toContain('public.is_household_owner(household_id)');
    expect(integrityMigration).toContain('mismatched baby household');
  });

  test('restores a growth entry head measurement from its own backup field', () => {
    expect(restoreMeasurementFixMigration).toContain("nullif(backup_row ->> 'height_cm', '')::numeric,\n      nullif(backup_row ->> 'weight_kg', '')::numeric,\n      nullif(backup_row ->> 'head_cm', '')::numeric");
  });
});
