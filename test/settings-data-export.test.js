import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (path) => {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
};

const config = read('config.js');
const exportModule = read('settings-data-export.js');
const serviceWorker = read('service-worker.js');

describe('settings Excel data export', () => {
  test('loads after settings and renders an Excel export card', () => {
    expect(config).toContain('{ name: "settings-data-export", version: "20260805-settings-excel-v1" }');
    expect(serviceWorker).toContain('url.pathname.endsWith("/settings-data-export.js")');
    expect(exportModule).toContain('data-settings-data-export');
    expect(exportModule).toContain('data-settings-export-download');
    expect(exportModule).toContain('Excel(.xls)');
  });

  test('exports only the current household shared tables', () => {
    expect(exportModule).toContain("household_id', householdId");
    ['households', 'household_members', 'calendar_members', 'babies', 'events', 'growth_entries', 'family_todos'].forEach((table) => {
      expect(exportModule).toContain(`from('${table}')`);
    });
    expect(exportModule).not.toContain("from('private_entries')");
    expect(exportModule).not.toContain('access_token');
    expect(exportModule).not.toContain('invite_code');
    expect(exportModule).not.toContain('photo_paths');
  });

  test('builds a SpreadsheetML workbook with stable sheets and XML escaping', () => {
    expect(exportModule).toContain('SETTINGS_EXPORT_SHEETS');
    expect(exportModule).toContain('buildSpreadsheetXml');
    expect(exportModule).toContain('application/vnd.ms-excel');
    expect(exportModule).toContain('family-data-');
    expect(exportModule).toContain(".replace(/&/g, '&amp;')");
    ['일정', '성장 기록', '아기 기록', '할 일', '가족 구성원'].forEach((sheet) => {
      expect(exportModule).toContain(`name: '${sheet}'`);
    });
  });

  test('does not create a download until every query succeeds', () => {
    expect(exportModule).toContain('if (error) throw error');
    expect(exportModule).toContain('URL.revokeObjectURL');
    expect(exportModule).toContain('downloadButton.disabled = true');
    expect(exportModule).toContain('downloadButton.disabled = false');
  });
});
