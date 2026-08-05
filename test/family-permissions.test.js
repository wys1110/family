import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const permissionSource = readFileSync('family-permissions.js', 'utf8');
const settingsSource = readFileSync('settings-family-management.js', 'utf8');
const exportSource = readFileSync('settings-data-export.js', 'utf8');
const appSource = readFileSync('app.js', 'utf8');
const config = readFileSync('config.js', 'utf8');

const loadApi = () => {
  const window = {};
  new Function('window', 'document', permissionSource)(window, {});
  return window.FAMILY_PERMISSIONS_API;
};

describe('family owner/member permission boundary', () => {
  test('관리 권한은 owner만 허용하고 role 누락은 거부한다', () => {
    const api = loadApi();
    expect(api.canManage('owner')).toBe(true);
    expect(api.canManage('member')).toBe(false);
    expect(api.canManage(null)).toBe(false);
  });

  test('owner 전용 컨트롤은 현재 role과 context 이벤트를 사용한다', () => {
    expect(settingsSource).toContain('FAMILY_PERMISSIONS_API');
    expect(settingsSource).toContain('가족 관리자만 사용할 수 있어요');
    expect(exportSource).toContain('canManage');
    expect(appSource).toContain('householdRole');
    expect(appSource).toContain('detail: {');
    expect(config).toContain('{ name: "family-permissions", version: "20260805-family-permissions-v1" }');
  });
});
