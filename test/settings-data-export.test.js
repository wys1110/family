import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (path) => {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
};

const config = read('config.js');
const exportModule = read('settings-data-export.js');
const serviceWorker = read('service-worker.js');

const loadExportApi = () => {
  const source = read('settings-data-export.js');
  const element = () => ({
    dataset: {},
    classList: { add() {}, remove() {} },
    querySelector: () => ({ addEventListener() {} }),
    appendChild() {},
    setAttribute() {},
  });
  const fakeView = element();
  fakeView.querySelector = () => null;
  const fakeDocument = {
    documentElement: { dataset: {} },
    head: { appendChild() {} },
    querySelector: (selector) => selector === '#settingsView' ? fakeView : null,
    createElement: element,
  };
  const fakeWindow = { addEventListener() {} };
  const run = new Function('window', 'document', 'setTimeout', source);
  run(fakeWindow, fakeDocument, (callback) => callback());
  return fakeWindow.FAMILY_SETTINGS_EXPORT;
};

describe('settings Excel data export', () => {
  test('loads after settings and renders an Excel export card', () => {
    expect(config).toContain('{ name: "settings-data-export", version: "20260805-settings-excel-v2" }');
    expect(serviceWorker).toContain('url.pathname.endsWith("/settings-data-export.js")');
    expect(exportModule).toContain('data-settings-data-export');
    expect(exportModule).toContain('data-settings-export-download');
    expect(exportModule).toContain('Excel(.xlsx)');
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

  test('builds a real OOXML xlsx package with stable sheets and XML escaping', () => {
    expect(exportModule).toContain('SETTINGS_EXPORT_SHEETS');
    expect(exportModule).toContain('buildXlsxZip');
    expect(exportModule).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(exportModule).toContain('[Content_Types].xml');
    expect(exportModule).toContain('xl/workbook.xml');
    expect(exportModule).toContain('xl/worksheets/sheet');
    expect(exportModule).toContain('crc32');
    expect(exportModule).not.toContain('application/vnd.ms-excel');
    expect(exportModule).toContain('family-data-');
    expect(exportModule).toContain(".replace(/&/g, '&amp;')");
    ['일정', '성장 기록', '아기 기록', '할 일', '가족 구성원'].forEach((sheet) => {
      expect(exportModule).toContain(`name: '${sheet}'`);
    });
  });

  test('starts with a ZIP signature and contains OOXML package parts', () => {
    const api = loadExportApi();
    const bytes = api.buildXlsxZip([{ name: '일정', headers: ['제목'], rows: [['<회의>']] }]);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const packageText = new TextDecoder().decode(bytes);
    expect(packageText).toContain('[Content_Types].xml');
    expect(packageText).toContain('xl/workbook.xml');
    expect(packageText).toContain('&lt;회의&gt;');
  });

  test('does not create a download until every query succeeds', () => {
    expect(exportModule).toContain('if (error) throw error');
    expect(exportModule).toContain('URL.revokeObjectURL');
    expect(exportModule).toContain('downloadButton.disabled = true');
    expect(exportModule).toContain('downloadButton.disabled = false');
    expect(exportModule).toContain('.xlsx');
    expect(exportModule).not.toContain('.xls`');
  });
});
