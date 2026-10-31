// Pure view helpers. Real records are received in memory, never bundled or persisted.
export const FLOW_LABELS = Object.freeze({ salary: '급여', bonus: '상여', income: '기타 수입', expense: '지출', reimbursement: '회사 정산', transfer: '내부 이체', loan_principal: '대출 원금', loan_interest: '대출 이자', loan_payment: '대출 납입', gift: '선물·지원금', refund: '환불', unclassified_income: '미분류 입금', unclassified_outflow: '미분류 출금' });
export const ATTRIBUTION_LABELS = Object.freeze({ personal: '개인', company: '회사', household: '가계', unknown: '미확인' });
export const STATUS_LABELS = Object.freeze({ active: '포함', excluded: '제외', cancelled: '취소', cashback: '캐시백' });
export const CHANNEL_LABELS = Object.freeze({ card: '카드', bank: '계좌', manual: '직접 입력' });

const known = value => Number.isSafeInteger(value) && value >= 0;
export function money(value, currency = 'KRW') {
  if (value === null || value === undefined || value === '') return '미확인';
  const number = typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value) ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return '미확인';
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency, maximumFractionDigits: currency === 'KRW' ? 0 : 2 }).format(number);
}

export function summaryModel(data) {
  const expected = [...(data.assets || []), ...(data.debts || [])];
  const balances = (data.program?.records || []).filter(record => record.type === 'balance');
  const matched = !data.program?.initialized || (balances.length === expected.length && expected.every(item => {
    const rows = balances.filter(record => record.id === item.id);
    return rows.length === 1 && rows[0].date === data.asOf && rows[0].currency === 'KRW'
      && (item.amount == null ? rows[0].amount == null : rows[0].amount != null && Number(rows[0].amount) === item.amount);
  }));
  const financial = matched && data.assetReconciled && known(data.financialAssets) ? data.financialAssets : null;
  const debt = matched && known(data.knownDebt) ? data.knownDebt : null;
  const valuation = data.valuation;
  const net = matched && financial !== null && debt !== null && valuation?.reconciled === true && known(valuation.gross)
    && Number.isSafeInteger(valuation.net) && valuation.gross - debt === valuation.net ? valuation.net : null;
  return { matched, financial, debt, net };
}

export function monthlyModel(data) {
  if (data.monthly?.reconciled !== true) return [];
  return data.monthly.rows.map(row => {
    const monthEnd = new Date(Date.UTC(Number(row.month.slice(0, 4)), Number(row.month.slice(5)), 0)).toISOString().slice(0, 10);
    const start = data.monthly.start?.startsWith(row.month) ? data.monthly.start : row.month + '-01';
    const end = data.monthly.end?.startsWith(row.month) ? data.monthly.end : monthEnd;
    return {
    month: row.month,
    income: known(row.salary) && known(row.bonus) && Number.isSafeInteger(row.salary + row.bonus) ? row.salary + row.bonus : null,
    card: known(row.card) ? row.card : null,
    partial: start !== row.month + '-01' || end !== monthEnd,
    coverage: start + ' ~ ' + end,
  }; });
}

export function filterRecords(records, { query = '', month = '', attribution = '', page = 0, pageSize = 25 } = {}) {
  const needle = query.trim().toLocaleLowerCase('ko-KR');
  const result = records.filter(record => record.type === 'transaction'
    && (!month || record.date.startsWith(month)) && (!attribution || record.attribution === attribution)
    && (!needle || `${record.label} ${record.category} ${record.basis}`.toLocaleLowerCase('ko-KR').includes(needle)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return { total: result.length, rows: result.slice(page * pageSize, (page + 1) * pageSize) };
}

export function validateRecord(record, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) || Number.isNaN(Date.parse(record.date + 'T00:00:00Z'))
    || new Date(record.date + 'T00:00:00Z').toISOString().slice(0, 10) !== record.date) return '날짜를 확인해 주세요.';
  if (record.date > new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now)) return '기록 날짜는 오늘까지 입력할 수 있어요.';
  const pattern = record.currency === 'KRW' ? /^(0|[1-9]\d{0,11})$/ : /^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
  if (!(record.type === 'balance' && record.amount === null) && !pattern.test(record.amount || '')) return '금액을 확인해 주세요. 원화는 정수, 외화는 소수 둘째 자리까지 입력할 수 있어요.';
  for (const [key, limit] of [['label', 120], ['basis', 160], ['sourceLocation', 200]]) {
    if (typeof record[key] !== 'string' || !record[key].trim() || record[key].length > limit || /[\u0000-\u001f\u007f]/.test(record[key])) return '항목과 확인 근거를 입력해 주세요.';
  }
  if (record.type === 'transaction' && (!record.category?.trim() || record.category.length > 50)) return '분류를 입력해 주세요.';
  return null;
}

export function safeDocumentUrl(value) {
  return typeof value === 'string' && /^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+\/edit$/.test(value) ? value : null;
}
