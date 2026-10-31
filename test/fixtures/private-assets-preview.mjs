// Entirely synthetic UI fixture, excluded from the public package.
import { mountPrivateAssets } from '../../private-assets.js';
const assetAmounts = [1230000, 1500000, 200000, 3000000, 10000000, 5000000];
const assets = ['입출금', '청약', '외화 평가액', '적금', '증권', '연금'].map((name, index) => ({ id: `asset-category-${index}`, label: '가상 ' + name, amount: assetAmounts[index], basis: '가상 잔액 · 시안용' }));
const debts = [{ id: 'debt-category-0', label: '가상 대출', amount: 12500000, basis: '가상 잔액 · 시안용' }, { id: 'debt-category-1', label: '가상 할부', amount: null, basis: '가상 미확인 예시' }];
const balance = (row, balanceKind) => ({ id: row.id, type: 'balance', balanceKind, label: row.label, amount: row.amount === null ? null : String(row.amount), date: '2026-10-28', currency: 'KRW', basis: row.basis, sourceLocation: '합성 테스트' });
const transactions = Array.from({ length: 60 }, (_, index) => ({ id: `synthetic-${index}`, type: 'transaction', date: `2026-${index < 28 ? '10' : '09'}-${String(index % 28 + 1).padStart(2, '0')}`, label: ['가상 식료품', '가상 교통비', '가상 식사'][index % 3], amount: String(15000 + index * 1000), currency: 'KRW', basis: '가상 거래 · 실제 지출 아님', sourceLocation: '합성 테스트', flow: 'expense', status: index % 12 === 0 ? 'excluded' : 'active', channel: 'card', attribution: index % 5 === 0 ? 'company' : 'personal', category: '가상 분류' }));
const dashboard = {
  kind: 'observed-summary', owner: '가상 사용자', currency: 'KRW', asOf: '2026-10-28', loadedAt: new Date().toISOString(), assets, debts,
  financialAssets: 20930000, assetReconciled: true, knownDebt: 12500000, debtIncomplete: true, issues: [],
  valuation: { property: 80000000, points: 20000, gross: 100950000, net: 88450000, reconciled: true },
  monthly: { reconciled: true, start: '2026-05-01', end: '2026-10-28', rows: [5, 6, 7, 8, 9, 10].map((month, index) => ({ month: `2026-${String(month).padStart(2, '0')}`, salary: 3200000, bonus: index === 4 ? 1200000 : 0, card: [1350000, 1580000, 1450000, 1810000, 1670000, 1490000][index] })) },
  program: { initialized: true, writable: true, revision: 'synthetic-revision-1', coverage: { start: '2026-05-01', end: '2026-10-28' }, records: [...assets.map(row => balance(row, 'asset')), ...debts.map(row => balance(row, 'liability')), ...transactions], history: [], historyCount: 0 },
};
const params = new URLSearchParams(location.search);
let retryOnce = params.has('retry-save');
const requests = new Map();
const api = {
  session: async () => params.has('signed-out') ? null : { user: { id: 'synthetic-owner' } },
  async request(body, { signal }) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, params.has('loading') ? 40000 : 180);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
    });
    if (params.has('error')) throw Object.assign(new Error(), { code: 'NOT_CONFIGURED' });
    if (body.action === 'saveRecord') {
      const command = body.command;
      if (requests.has(command.requestId)) return { ok: true, replayed: true };
      if (command.expectedRevision !== dashboard.program.revision) throw Object.assign(new Error(), { code: 'SOURCE_CHANGED' });
      const index = dashboard.program.records.findIndex(row => row.id === command.record.id);
      if (index >= 0) dashboard.program.records[index] = structuredClone(command.record);
      else dashboard.program.records.push(structuredClone(command.record));
      dashboard.program.history.unshift({ requestId: command.requestId, after: structuredClone(command.record), at: new Date().toISOString() });
      dashboard.program.historyCount++;
      dashboard.program.revision = 'synthetic-revision-' + (dashboard.program.historyCount + 1);
      requests.set(command.requestId, true);
      if (retryOnce) { retryOnce = false; throw Object.assign(new Error(), { code: 'UPSTREAM_FAILED' }); }
      return { ok: true };
    }
    return structuredClone(dashboard);
  },
};
const root = document.querySelector('#privateAssetsApp');
const app = mountPrivateAssets(root, api, { preview: true });
root.querySelector('.pa-back').href = '../../?demo=1';
app.load();
