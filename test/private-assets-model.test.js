import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import vm from 'node:vm';
const sharedConfigSource = readFileSync('config.js', 'utf8');
import { summaryModel, monthlyModel, money, filterRecords, validateRecord, safeDocumentUrl } from '../private-assets-model.js';

const snapshot = () => ({
  asOf: '2026-10-28', assets: [{ id: 'a', amount: 200 }], debts: [{ id: 'd', amount: null }],
  financialAssets: 200, knownDebt: 0, assetReconciled: true,
  valuation: { reconciled: true, gross: 400, net: 400 },
  program: { initialized: true, records: [
    { id: 'a', type: 'balance', currency: 'KRW', date: '2026-10-28', amount: '200' },
    { id: 'd', type: 'balance', currency: 'KRW', date: '2026-10-28', amount: null },
  ] },
});
test('unknown amounts stay unknown while a verified zero remains zero', () => {
  expect(money(null)).toBe('미확인'); expect(money(undefined)).toBe('미확인'); expect(money('')).toBe('미확인');
  expect(money(0)).toContain('0'); expect(money('0')).toContain('0'); expect(money('12.25', 'USD')).toContain('12.25');
});
test('edited, duplicated, differently dated or foreign balances suppress stale totals', () => {
  expect(summaryModel(snapshot())).toEqual({ matched: true, financial: 200, debt: 0, net: 400 });
  for (const alter of [data => data.program.records[0].amount = '300', data => data.program.records[0].date = '2026-10-29', data => data.program.records[0].currency = 'USD', data => data.program.records.push(data.program.records[0])]) {
    const data = snapshot(); alter(data);
    expect(summaryModel(data)).toEqual({ matched: false, financial: null, debt: null, net: null });
  }
});
test('an unreconciled financial total or valuation cannot be promoted to net worth', () => {
  const data = snapshot(); data.assetReconciled = false;
  expect(summaryModel(data).net).toBe(null);
  data.assetReconciled = true; data.valuation.gross++;
  expect(summaryModel(data).net).toBe(null);
});
test('partial months are disclosed and absent components never become zero income', () => {
  const data = { monthly: { reconciled: true, start: '2026-09-15', end: '2026-10-28', rows: [
    { month: '2026-09', salary: 100, bonus: null, card: 40 },
    { month: '2026-10', salary: 100, bonus: 0, card: null },
  ] } };
  expect(monthlyModel(data)).toEqual([
    { month: '2026-09', income: null, card: 40, partial: true, coverage: '2026-09-15 ~ 2026-09-30' },
    { month: '2026-10', income: 100, card: null, partial: true, coverage: '2026-10-01 ~ 2026-10-28' },
  ]);
  data.monthly.reconciled = false; expect(monthlyModel(data)).toEqual([]);
});
test('record pagination filters before slicing and does not mutate the journal', () => {
  const rows = Array.from({ length: 65 }, (_, index) => ({ id: String(index), type: 'transaction', date: '2026-10-28', label: '가상 커피', category: '식비', basis: '가상', attribution: index < 60 ? 'personal' : 'company' }));
  const before = structuredClone(rows);
  expect(filterRecords(rows, { attribution: 'personal', page: 2 })).toMatchObject({ total: 60, rows: expect.any(Array) });
  expect(filterRecords(rows, { attribution: 'personal', page: 2 }).rows).toHaveLength(10);
  expect(filterRecords(rows, { query: '없는 항목' }).total).toBe(0); expect(rows).toEqual(before);
});
test('form validation respects Korean date rollover and currency precision', () => {
  const row = { type: 'balance', date: '2026-10-29', label: '합성', basis: '합성', sourceLocation: '합성', amount: '100', currency: 'KRW' };
  const beforeKoreanMidnight = new Date('2026-10-28T14:59:00Z');
  expect(validateRecord(row, beforeKoreanMidnight)).toContain('오늘');
  expect(validateRecord(row, new Date('2026-10-28T15:00:00Z'))).toBe(null);
  expect(validateRecord({ ...row, date: '2026-02-30' })).toContain('날짜');
  expect(validateRecord({ ...row, amount: '0.25' })).toContain('금액');
  expect(validateRecord({ ...row, amount: '0.25', currency: 'USD' })).toBe(null);
  expect(validateRecord({ ...row, amount: null })).toBe(null);
});
test('source links allow only the expected Google document route', () => {
  expect(safeDocumentUrl('https://docs.google.com/document/d/synthetic/edit')).toBeTruthy();
  for (const value of ['javascript:alert(1)', 'https://docs.google.com.evil.invalid/document/d/a/edit', 'https://docs.google.com/document/d/a/edit?token=secret', null]) expect(safeDocumentUrl(value)).toBe(null);
});
test('private page reads the shared auth configuration without starting family modules', () => {
  const window = {};
  const document = { documentElement: { dataset: { familyPage: 'private-assets' } } };
  // Missing DOM and storage methods deliberately throw if the shared loader proceeds.
  vm.runInNewContext(sharedConfigSource, { window, document });
  expect(window.FAMILY_CONFIG.supabaseUrl).toMatch(/^https:\/\//);
  expect(window.FAMILY_MODULES_READY).toBeUndefined();
});
