import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('settings-backup.js', 'utf8');
const config = readFileSync('config.js', 'utf8');
const serviceWorker = readFileSync('service-worker.js', 'utf8');

const loadApi = () => {
  const window = {};
  const document = { documentElement: { dataset: {} } };
  new Function('window', 'document', source)(window, document);
  return window.FAMILY_SETTINGS_BACKUP;
};

describe('settings JSON backup contract', () => {
  test('loads through the versioned app module manifest and network bypass', () => {
    expect(config).toContain('{ name: "settings-backup", version: "20260805-settings-management-v1", style: false }');
    expect(serviceWorker).toContain('url.pathname.endsWith("/settings-backup.js")');
  });

  test('creates a deterministic household fingerprint without exposing the id', () => {
    const api = loadApi();
    const first = api.householdFingerprint('household-42');
    expect(first).toMatch(/^hh-[a-f0-9]{16}$/);
    expect(first).toBe(api.householdFingerprint('household-42'));
    expect(first).not.toContain('household-42');
  });

  test('validates version and current household before any restore write', () => {
    const api = loadApi();
    const payload = api.createBackupPayload('household-42', {
      events: [{ title: '회의', household_id: 'wrong-id' }],
      growth_entries: [],
      calendar_members: [],
      babies: [],
    }, new Date('2026-08-05T00:00:00.000Z'));

    expect(api.validateBackupPayload(payload, 'household-42')).toEqual({ ok: true });
    expect(api.validateBackupPayload({ ...payload, schemaVersion: 99 }, 'household-42').ok).toBe(false);
    expect(api.validateBackupPayload(payload, 'other-household').reason).toBe('household-mismatch');
  });

  test('keeps only approved shared tables and strips household ids from exported rows', () => {
    const api = loadApi();
    const payload = api.createBackupPayload('household-42', {
      events: [{ id: 'e1', title: '회의', household_id: 'household-42', access_token: 'secret' }],
      growth_entries: [{ id: 'g1', title: '성장', household_id: 'household-42', photo_path: 'private/path', photo_paths: ['private/path'] }],
      calendar_members: [{ id: 'm1', name: '아빠', household_id: 'household-42', created_by: 'user-1' }],
      babies: [{ id: 'b1', name: '도윤', household_id: 'household-42' }],
      private_entries: [{ body: '숨김' }],
    });

    expect(Object.keys(payload.tables).sort()).toEqual(['babies', 'calendar_members', 'events', 'growth_entries']);
    expect(payload.tables.events[0]).not.toHaveProperty('household_id');
    expect(payload.tables.events[0]).not.toHaveProperty('access_token');
    expect(payload.tables.growth_entries[0]).not.toHaveProperty('photo_path');
    expect(payload.tables.growth_entries[0]).not.toHaveProperty('photo_paths');
    expect(payload.tables.calendar_members[0]).not.toHaveProperty('created_by');
  });
});
