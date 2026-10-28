import { money, summaryModel, monthlyModel, filterRecords, validateRecord, safeDocumentUrl, FLOW_LABELS, ATTRIBUTION_LABELS, STATUS_LABELS, CHANNEL_LABELS } from './private-assets-model.js?v=20261029-v1';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const options = labels => Object.entries(labels).map(([value, label]) => `<option value="${escape(value)}">${escape(label)}</option>`).join('');
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({ back: '<path d="m14 6-6 6 6 6"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>', plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="m9 5 7 7-7 7"/>' })[name]}</svg>`;
const ERRORS = {
  NOT_CONFIGURED: ['자산 연결을 준비하고 있어요', '통합 화면의 원장 연결이 아직 활성화되지 않았어요. 기존 자산 화면은 계속 이용할 수 있어요.'],
  UNAUTHORIZED: ['로그인이 필요해요', '가족 홈에서 로그인한 뒤 내 자산을 다시 열어 주세요.'],
  FORBIDDEN: ['본인 전용 공간이에요', '이 계정에는 내 자산을 열 수 있는 권한이 없어요.'],
  ACCESS_DENIED: ['자산 접근을 확인하지 못했어요', '본인 계정과 원장 연결 상태를 확인한 뒤 다시 시도해 주세요.'],
  PRIVATE_SOURCE_REQUIRED: ['원장의 공개 범위를 확인해 주세요', '본인만 볼 수 있는 원장인지 확인할 때까지 읽기와 저장을 멈췄어요.'],
  SOURCE_CHANGED: ['기록이 변경됐어요', '다른 화면의 수정과 겹치지 않도록 최신 기록을 다시 읽어 주세요.'],
  TIMEOUT: ['기록을 읽는 데 시간이 걸려요', '연결을 확인한 뒤 다시 시도해 주세요.'],
  INVALID_LEDGER: ['원장 형식을 확인해야 해요', '기록을 임의로 해석하지 않았어요. 기존 원장을 확인해 주세요.'],
};
const LEGACY_URL = 'https://script.google.com/macros/s/AKfycbwzuKLH43ew5uGrbj751otSF_6OsmijFIejyTmdaB90MZIUSZau_7PrY0_3ijOadNEAyw/exec';

export function mountPrivateAssets(root, api, { preview = false } = {}) {
  root.innerHTML = `
    <header class="pa-topbar"><a class="pa-back" href="./">${icon('back')}<span>우리 가족</span></a><span class="pa-private">${icon('lock')}나만 보기</span><button type="button" id="paLock" class="pa-quiet">가리기</button></header>
    ${preview ? '<aside class="pa-demo">화면 미리보기 · 모든 금액과 기록은 가상 데이터입니다</aside>' : ''}
    <main class="pa-main">
      <header class="pa-heading"><div><h1>내 자산</h1><p id="paDate">등록된 기록을 한곳에서 확인해요.</p></div><button id="paRefresh" type="button" class="pa-icon-button" aria-label="원장 새로 읽기">${icon('refresh')}</button></header>
      <div id="paMessage" class="pa-message" role="status" hidden></div>
      <nav class="pa-tabs" role="tablist" aria-label="자산 메뉴"><button id="paTabSummary" role="tab" aria-selected="true" aria-controls="paSummary" data-tab="summary" type="button">요약</button><button id="paTabBalances" role="tab" aria-selected="false" tabindex="-1" aria-controls="paBalances" data-tab="balances" type="button">자산·부채</button><button id="paTabRecords" role="tab" aria-selected="false" tabindex="-1" aria-controls="paRecords" data-tab="records" type="button">거래</button></nav>
      <section id="paStatus" class="pa-status" aria-live="polite"></section>
      <div id="paData" hidden>
        <section id="paSummary" role="tabpanel" aria-labelledby="paTabSummary"></section>
        <section id="paBalances" role="tabpanel" aria-labelledby="paTabBalances" hidden></section>
        <section id="paRecords" role="tabpanel" aria-labelledby="paTabRecords" hidden>
          <div class="pa-section-heading"><div><h2>거래 원장</h2><p id="paRecordCoverage"></p></div><button type="button" class="pa-primary" data-add="transaction">${icon('plus')}기록 추가</button></div>
          <div class="pa-filters"><label class="pa-search">거래 찾기<input id="paSearch" type="search" autocomplete="off" placeholder="항목, 분류, 확인 근거" /></label><label>기간<select id="paMonth"><option value="">전체 기간</option></select></label><label>사용 범위<select id="paAttribution"><option value="">전체</option>${options(ATTRIBUTION_LABELS)}</select></label></div>
          <p id="paRecordCount" class="pa-muted" role="status"></p><div id="paRows" class="pa-list"></div>
          <div class="pa-pagination"><button id="paPrev" type="button" class="pa-secondary">이전</button><span id="paPage"></span><button id="paNext" type="button" class="pa-secondary">다음</button></div>
        </section>
        <footer class="pa-footer"><p id="paReadAt"></p><p>개인 · 관찰 기록 기준. 미확인은 0원이 아닙니다.</p><div id="paSources"></div><details><summary>포함 범위와 보관 방식</summary><p>금융기관의 실시간 잔액이 아닌 원장에 등록한 기록입니다. 자산의 평가 기준과 날짜가 다를 수 있으며 전체 순자산을 확정하지 않습니다. 원장은 본인 전용 Google Drive에 보관하고, 자산 자료는 가족 공동 저장소나 이 브라우저에 저장하지 않습니다.</p></details></footer>
      </div>
    </main>
    <dialog id="paEditor" class="pa-editor" aria-labelledby="paEditorTitle">
      <form id="paForm" autocomplete="off">
        <header class="pa-section-heading"><h2 id="paEditorTitle">기록 추가</h2><button type="button" class="pa-quiet" id="paCancel">닫기</button></header>
        <fieldset id="paFields"><div class="pa-form-grid">
          <label>기록 종류<select name="kind"><option value="transaction">거래</option><option value="asset">자산 잔액</option><option value="liability">부채 잔액</option></select></label><label>기준일<input name="date" type="date" required /></label>
          <label class="pa-wide">항목<input name="label" maxlength="120" required placeholder="예: 주거래 통장" /></label>
          <label>금액<input name="amount" inputmode="decimal" maxlength="15" required placeholder="쉼표 없이 입력" /></label><label>통화<select name="currency"><option value="KRW">원화 KRW</option><option value="USD">미국 달러 USD</option><option value="EUR">유로 EUR</option></select></label>
          <label id="paUnknownRow" class="pa-checkbox pa-wide" hidden><input name="unknown" type="checkbox" />금액 미확인</label>
          <label class="pa-wide">확인 근거<input name="basis" maxlength="160" required placeholder="예: 10월 29일 계좌 화면 확인" /></label>
        </div><div id="paTransactionFields" class="pa-form-grid">
          <label>거래 종류<select name="flow">${options(FLOW_LABELS)}</select></label><label>사용 범위<select name="attribution">${options(ATTRIBUTION_LABELS)}</select></label>
          <label>결제 수단<select name="channel">${options(CHANNEL_LABELS)}</select></label><label>집계 상태<select name="status">${options(STATUS_LABELS)}</select></label>
          <label class="pa-wide">분류<input name="category" maxlength="50" placeholder="예: 식비, 주거, 교통" /></label>
        </div></fieldset>
        <div id="paReview" class="pa-review" hidden></div><p id="paFormMessage" class="pa-form-message" role="alert" hidden></p>
        <footer class="pa-editor-actions"><button type="button" id="paBackToEdit" class="pa-secondary" hidden>돌아가서 수정</button><button type="submit" id="paSave" class="pa-primary">저장 전 확인</button></footer>
      </form>
    </dialog>`;
  const $ = selector => root.querySelector(selector);
  const fields = $('#paForm').elements;
  let data = null, generation = 0, activeTab = 'summary', page = 0, userId = null;
  let controller = null, editRecord = null, pending = null, saving = false, uncertain = false;

  function showStatus(title, copy, action = '다시 시도', code = '') {
    $('#paStatus').hidden = false;
    $('#paStatus').innerHTML = `<div class="pa-status-mark">${icon('lock')}</div><h2>${escape(title)}</h2><p>${escape(copy)}</p><div class="pa-status-actions">${code === 'UNAUTHORIZED' ? '<a class="pa-primary" href="./">가족 홈에서 로그인</a>' : `<button type="button" class="pa-primary" data-retry>${escape(action)}</button>`}${code === 'NOT_CONFIGURED' ? `<a class="pa-secondary" href="${LEGACY_URL}" rel="noreferrer noopener" target="_blank">기존 자산 화면 열기</a>` : ''}</div>`;
  }
  function clearData() {
    data = null; editRecord = null; pending = null; uncertain = false;
    $('#paEditor').close(); $('#paForm').reset(); $('#paReview').replaceChildren();
    $('#paData').hidden = true;
    for (const selector of ['#paSummary', '#paBalances', '#paRows', '#paSources', '#paReadAt', '#paRecordCount', '#paRecordCoverage', '#paPage']) $(selector).replaceChildren();
    $('#paMonth').innerHTML = '<option value="">전체 기간</option>';
    $('#paSearch').value = ''; $('#paAttribution').value = '';
    delete $('#paSave').dataset.reload;
    $('#paFormMessage').textContent = ''; $('#paMessage').textContent = ''; $('#paMessage').hidden = true;
    $('#paDate').textContent = '등록된 기록을 한곳에서 확인해요.';
  }
  function lock() {
    generation++; controller?.abort(); controller = null; saving = false; userId = null;
    clearData(); $('#paRefresh').disabled = false;
    showStatus('자산을 가렸어요', '다시 볼 때 원장에서 최신 기록을 읽어와요.', '다시 보기');
  }
  async function request(body, signal) {
    try { return await api.request(body, { signal, userId }); }
    catch (error) {
      if (error.name === 'TimeoutError') error.code = 'TIMEOUT';
      throw error;
    }
  }
  async function load(message = '') {
    if (saving) return;
    generation++; const current = generation;
    controller?.abort(); controller = new AbortController(); const ownController = controller;
    clearData(); $('#paRefresh').disabled = true;
    $('#paStatus').hidden = false;
    $('#paStatus').innerHTML = '<div class="pa-loading"><span class="pa-spinner" aria-hidden="true"></span><h2>원장 확인 중</h2><p>본인 권한과 기록을 확인하고 있어요.</p><div class="pa-skeleton" aria-hidden="true"><i></i><i></i><i></i></div></div>';
    const timeout = setTimeout(() => ownController.abort('timeout'), 35000);
    try {
      const session = await api.session();
      if (current !== generation) return;
      if (!session?.user?.id) throw Object.assign(new Error(), { code: 'UNAUTHORIZED' });
      userId = session.user.id;
      const result = await request({ action: 'dashboard' }, ownController.signal);
      if (current !== generation || ownController.signal.aborted) return;
      if (!result || result.kind !== 'observed-summary' || !Array.isArray(result.assets) || !Array.isArray(result.debts)) throw new Error('INVALID_RESPONSE');
      data = result; render();
      if (message) { $('#paMessage').textContent = message; $('#paMessage').hidden = false; }
    } catch (error) {
      if (current !== generation) return;
      clearData();
      const code = ownController.signal.reason === 'timeout' ? 'TIMEOUT' : error.code;
      const [title, copy] = ERRORS[code] || ['기록을 불러오지 못했어요', '연결을 확인한 뒤 다시 시도해 주세요.'];
      showStatus(title, copy, '다시 시도', code);
      if (message) { $('#paMessage').textContent = message + ' 최신 화면은 다시 읽기가 필요해요.'; $('#paMessage').hidden = false; }
    } finally {
      clearTimeout(timeout);
      if (current === generation) $('#paRefresh').disabled = false;
    }
  }
  function selectTab(tab, focus = false) {
    activeTab = tab;
    root.querySelectorAll('[data-tab]').forEach(button => {
      const active = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
      $('#' + button.getAttribute('aria-controls')).hidden = !active;
    });
  }
  const sourceLink = (url, title) => safeDocumentUrl(url) ? `<a href="${escape(url)}" target="_blank" rel="noreferrer noopener">${escape(title)}</a>` : '';
  function render() {
    $('#paStatus').hidden = true; $('#paData').hidden = false;
    $('#paDate').textContent = `자산 기준 ${data.asOf} · 원화 요약`;
    const summary = summaryModel(data), months = monthlyModel(data), recent = months.at(-1);
    $('#paSummary').innerHTML = `
      <section class="pa-summary-panel"><div class="pa-section-heading"><h2>등록된 자산</h2><button class="pa-text-button" type="button" data-go="balances">전체 보기 ${icon('arrow')}</button></div>
      <dl class="pa-amounts"><div><dt>금융자산</dt><dd>${money(summary.financial)}</dd></div><div><dt>확인된 부채</dt><dd>${money(summary.debt)}</dd></div><div class="pa-net"><dt>등록 순자산 <span>차량 제외</span></dt><dd>${money(summary.net)}</dd></div></dl>
      <p class="pa-scope">${summary.matched ? '순자산은 부동산 등록액·금융자산·포인트에서 확인된 대출을 뺀 부분 범위예요. 전체 순자산 확정액은 아닙니다.' : '잔액 기록이 기존 요약과 달라요. 최신 항목을 확인하고 원본 합계를 다시 대조해 주세요.'}</p></section>
      <div class="pa-overview-grid"><section class="pa-section"><div class="pa-section-heading"><h2>월별 흐름</h2><span class="pa-muted">${recent ? escape(recent.month) + '까지' : '집계 미확인'}</span></div>
      <p class="pa-muted">급여·상여와 카드 사용을 비교해요.</p><div class="pa-chart-legend"><span><i class="pa-income-dot"></i>급여·상여</span><span><i class="pa-card-dot"></i>카드 사용</span></div>${chart(months.slice(-6))}${months.filter(row => row.partial).map(row => `<p class="pa-fine">* ${escape(row.month)}: ${escape(row.coverage)}의 일부 기간 기록</p>`).join('')}
      <details class="pa-month-details"><summary>월별 금액 보기</summary><div class="pa-table-scroll"><table><caption class="pa-sr-only">월별 급여·상여와 카드 사용, 원화</caption><thead><tr><th>월</th><th>급여·상여</th><th>카드 사용</th></tr></thead><tbody>${months.map(row => `<tr><th>${escape(row.month)}${row.partial ? '*' : ''}</th><td>${money(row.income)}</td><td>${money(row.card)}</td></tr>`).join('')}</tbody></table></div></details>
      <p class="pa-fine">카드 사용액은 결제일 출금액과 달라요. 이 비교에는 저축·계좌 지출·대출 납입을 포함하지 않았어요.</p></section>
      <section class="pa-section"><div class="pa-section-heading"><h2>다음으로 확인할 것</h2></div><ul class="pa-checklist">${(data.debtIncomplete ? ['잔액이 미확인인 부채가 있어요.'] : []).concat(data.issues?.length ? ['원본 대조가 필요한 항목 ' + data.issues.length + '개가 있어요.'] : [], ['최근 기록일과 현재 잔액이 같은지 확인해 주세요.']).map(item => `<li>${escape(item)}</li>`).join('')}</ul><button type="button" class="pa-secondary pa-full" data-go="records">거래 원장 확인 ${icon('arrow')}</button>
      <div class="pa-recent"><h3>최근 수정</h3>${(data.program?.history || []).slice(0, 3).map(event => `<p><strong>${escape(event.after?.label)}</strong><span>${escape(event.at?.slice(0, 10))}</span></p>`).join('') || '<p class="pa-muted">수정 이력이 없어요.</p>'}<p class="pa-fine">${Number(data.program?.historyCount || 0).toLocaleString('ko-KR')}건의 수정 이력 · 원장에 보관</p></div></section></div>`;
    renderBalances();
    const monthsInRecords = [...new Set((data.program?.records || []).filter(row => row.type === 'transaction').map(row => row.date.slice(0, 7)))].sort().reverse();
    $('#paMonth').innerHTML = '<option value="">전체 기간</option>' + monthsInRecords.map(month => `<option>${escape(month)}</option>`).join('');
    $('#paRecordCoverage').textContent = data.program?.coverage ? `${data.program.coverage.start} ~ ${data.program.coverage.end}의 초기 집계 + 이후 추가 기록` : '등록된 거래만 표시해요.';
    page = 0; renderRows(); selectTab(activeTab);
    root.querySelectorAll('[data-add]').forEach(button => { button.disabled = !data.program?.writable; });
    $('#paReadAt').textContent = '원장 읽음 ' + (data.loadedAt ? new Date(data.loadedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '시각 미확인');
    $('#paSources').innerHTML = sourceLink(data.sourceUrl, '원본 기록') + sourceLink(data.program?.sourceUrl, '수정 원장');
  }
  function chart(rows) {
    if (!rows.length) return '<p class="pa-empty">비교할 월별 기록이 아직 없어요.</p>';
    const max = Math.max(1, ...rows.flatMap(row => [row.income ?? 0, row.card ?? 0]));
    return `<div class="pa-chart" role="img" aria-label="월별 급여·상여와 카드 사용 비교. 정확한 금액은 아래 월별 금액 보기에서 확인할 수 있습니다.">${rows.map(row => `<div class="pa-chart-month"><div class="pa-bars">${['income', 'card'].map(key => row[key] === null ? '<span class="pa-bar-missing">?</span>' : `<span class="pa-bar pa-bar-${key}" style="height:${row[key] / max * 100}%" title="${escape(money(row[key]))}"></span>`).join('')}</div><span>${Number(row.month.slice(5))}월${row.partial ? '*' : ''}</span></div>`).join('')}</div>`;
  }
  function renderBalances() {
    const records = (data.program?.records || []).filter(row => row.type === 'balance');
    const rows = data.program?.initialized ? records : [...data.assets.map(row => ({ ...row, type: 'balance', balanceKind: 'asset', date: data.asOf, currency: 'KRW' })), ...data.debts.map(row => ({ ...row, type: 'balance', balanceKind: 'liability', date: data.asOf, currency: 'KRW' }))];
    $('#paBalances').innerHTML = `<div class="pa-section-heading"><div><h2>자산·부채 잔액</h2><p>항목마다 기준일과 평가 기준을 확인해요.</p></div><button class="pa-primary" type="button" data-add="asset">${icon('plus')}잔액 추가</button></div>${['asset', 'liability'].map(kind => `<section class="pa-section"><h3>${kind === 'asset' ? '자산' : '부채'}</h3><div class="pa-list">${rows.filter(row => row.balanceKind === kind).map(row => `<div class="pa-record"><div><strong>${escape(row.label)}</strong><p>${escape(row.date)} · ${escape(row.basis)}</p></div><div class="pa-record-amount"><strong>${money(row.amount, row.currency)}</strong>${data.program?.writable ? `<button type="button" class="pa-text-button" data-edit="${escape(row.id)}">수정</button>` : ''}</div></div>`).join('') || '<p class="pa-empty">등록된 잔액이 없어요.</p>'}</div></section>`).join('')}<p class="pa-fine">서로 다른 기준일과 통화의 잔액을 임의로 더하지 않아요. 부동산·포인트의 등록액은 요약 원본을 함께 확인해 주세요.</p>`;
  }
  function renderRows() {
    if (!data) return;
    const result = filterRecords(data.program?.records || [], { query: $('#paSearch').value, month: $('#paMonth').value, attribution: $('#paAttribution').value, page });
    $('#paRecordCount').textContent = `${result.total.toLocaleString('ko-KR')}건`;
    $('#paRows').innerHTML = result.rows.map(row => `<div class="pa-record"><div><strong>${escape(row.label)}</strong><p>${escape(row.date)} · ${escape(FLOW_LABELS[row.flow])} · ${escape(ATTRIBUTION_LABELS[row.attribution])}</p><span class="pa-fine">${escape(row.category)}${row.status !== 'active' ? ' · ' + escape(STATUS_LABELS[row.status]) : ''} · ${escape(CHANNEL_LABELS[row.channel])}</span></div><div class="pa-record-amount"><strong>${money(row.amount, row.currency)}</strong>${data.program?.writable ? `<button type="button" class="pa-text-button" data-edit="${escape(row.id)}">수정</button>` : ''}</div></div>`).join('') || '<p class="pa-empty">조건에 맞는 거래가 없어요.</p>';
    $('#paPrev').disabled = page === 0; $('#paNext').disabled = (page + 1) * 25 >= result.total;
    $('#paPage').textContent = `${page + 1} / ${Math.max(1, Math.ceil(result.total / 25))}`;
  }
  function formTypes() {
    const transaction = fields.kind.value === 'transaction';
    $('#paUnknownRow').hidden = transaction; $('#paTransactionFields').hidden = !transaction;
    if (transaction) fields.unknown.checked = false;
    fields.amount.disabled = fields.unknown.checked; fields.amount.required = !fields.unknown.checked;
    fields.category.required = transaction;
    fields.kind.disabled = Boolean(editRecord);
  }
  function openEditor(record, kind) {
    if (!data?.program?.writable || saving) return;
    editRecord = record || null; pending = null; uncertain = false;
    $('#paForm').reset(); delete $('#paSave').dataset.reload; $('#paFields').disabled = false;
    $('#paReview').hidden = true; $('#paReview').replaceChildren(); $('#paBackToEdit').hidden = true;
    $('#paFormMessage').hidden = true; $('#paFormMessage').textContent = '';
    $('#paEditorTitle').textContent = record ? '기록 수정' : '기록 추가';
    fields.kind.value = record ? (record.type === 'transaction' ? 'transaction' : record.balanceKind) : kind;
    for (const key of ['date', 'label', 'amount', 'currency', 'basis', 'flow', 'status', 'channel', 'attribution', 'category']) if (record?.[key] != null) fields[key].value = record[key];
    if (!record) {
      fields.date.value = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
      fields.flow.value = 'expense'; fields.attribution.value = 'unknown'; fields.channel.value = 'manual';
    }
    fields.date.max = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    fields.unknown.checked = record?.amount === null; formTypes();
    $('#paSave').textContent = '저장 전 확인'; $('#paSave').disabled = false; $('#paCancel').disabled = false;
    $('#paEditor').showModal();
  }
  function formRecord() {
    const type = fields.kind.value === 'transaction' ? 'transaction' : 'balance';
    const record = { id: editRecord?.id || 'manual:' + crypto.randomUUID(), type, date: fields.date.value, label: fields.label.value.trim(), amount: fields.unknown.checked ? null : fields.amount.value.trim(), currency: fields.currency.value, basis: fields.basis.value.trim(), sourceLocation: editRecord?.sourceLocation || '사용자 직접 입력' };
    if (type === 'balance') record.balanceKind = fields.kind.value;
    else for (const key of ['flow', 'status', 'channel', 'attribution', 'category']) record[key] = fields[key].value.trim();
    return record;
  }
  function formMessage(message) { $('#paFormMessage').textContent = message; $('#paFormMessage').hidden = false; }
  async function submit(event) {
    event.preventDefault();
    if (saving || !data?.program?.writable) return;
    if (!pending) {
      const record = formRecord(), error = validateRecord(record);
      if (error) { formMessage(error); return; }
      pending = { requestId: crypto.randomUUID(), expectedRevision: data.program.revision, record };
      $('#paFields').disabled = true; $('#paReview').hidden = false;
      $('#paReview').innerHTML = `<h3>이 내용으로 원장에 저장할까요?</h3><p><strong>${escape(record.label)}</strong> · ${money(record.amount, record.currency)}</p><p>${escape(record.date)} · ${escape(record.basis)}</p><p class="pa-fine">이전 기록은 수정 이력에 남아요.</p>`;
      $('#paBackToEdit').hidden = false; $('#paSave').textContent = '원장에 저장'; $('#paFormMessage').hidden = true;
      $('#paSave').focus(); return;
    }
    const current = generation, command = pending;
    saving = true; $('#paRefresh').disabled = true; $('#paSave').disabled = true; $('#paCancel').disabled = true; $('#paBackToEdit').disabled = true;
    $('#paSave').textContent = '저장 중…'; $('#paFormMessage').hidden = true;
    const writeController = new AbortController(); controller = writeController;
    const timeout = setTimeout(() => writeController.abort('timeout'), 35000);
    try {
      const result = await request({ action: 'saveRecord', command }, writeController.signal);
      if (current !== generation) return;
      if (!result?.ok) throw new Error('SAVE_FAILED');
      saving = false; pending = null; $('#paEditor').close();
      await load(preview ? '가상 기록에 반영했어요. 실제 원장은 변경하지 않았어요.' : result.unchanged ? '내용이 같아 원장을 변경하지 않았어요.' : '저장 요청이 처리됐어요.');
    } catch (error) {
      if (current !== generation) return;
      // An interrupted write may have committed. Retry the exact same command/requestId.
      uncertain = !['SOURCE_CHANGED', 'WRITE_NOT_ENABLED', 'INVALID_REQUEST', 'BODY_TOO_LARGE', 'INVALID_RECORD', 'FORBIDDEN', 'UNAUTHORIZED', 'PRIVATE_SOURCE_REQUIRED', 'ACCESS_DENIED'].includes(error.code);
      if (uncertain) formMessage('저장 결과를 확인하지 못했어요. 다시 확인하면 같은 요청을 사용해 중복 저장을 막아요. 화면을 닫았다면 새 기록을 만들기 전에 원장을 다시 읽어 주세요.');
      else formMessage(ERRORS[error.code]?.[1] || '저장하지 못했어요. 최신 원장을 다시 읽은 뒤 입력 내용을 확인해 주세요.');
      $('#paSave').textContent = uncertain ? '같은 요청으로 다시 확인' : '닫고 최신 기록 읽기';
      $('#paBackToEdit').hidden = true;
      if (!uncertain) { pending = null; $('#paSave').dataset.reload = 'true'; }
    } finally {
      clearTimeout(timeout);
      if (current === generation) {
        saving = false; $('#paRefresh').disabled = false; $('#paSave').disabled = false; $('#paCancel').disabled = false; $('#paBackToEdit').disabled = false;
      }
    }
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.hasAttribute('data-retry')) load();
    if (button.dataset.tab) selectTab(button.dataset.tab);
    if (button.dataset.go) { selectTab(button.dataset.go, true); window.scrollTo({ top: 0, behavior: 'instant' }); }
    if (button.dataset.add) openEditor(null, button.dataset.add);
    if (button.dataset.edit) openEditor(data?.program?.records.find(row => row.id === button.dataset.edit));
  });
  $('.pa-tabs').addEventListener('keydown', event => {
    const tabs = [...root.querySelectorAll('[data-tab]')], current = tabs.indexOf(event.target);
    if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[index].dataset.tab, true);
  });
  $('#paLock').addEventListener('click', lock);
  $('#paRefresh').addEventListener('click', () => load());
  for (const selector of ['#paSearch', '#paMonth', '#paAttribution']) $(selector).addEventListener(selector === '#paSearch' ? 'input' : 'change', () => { page = 0; renderRows(); });
  $('#paPrev').addEventListener('click', () => { page--; renderRows(); });
  $('#paNext').addEventListener('click', () => { page++; renderRows(); });
  fields.kind.addEventListener('change', formTypes); fields.unknown.addEventListener('change', formTypes);
  $('#paCancel').addEventListener('click', () => { if (!saving) { $('#paEditor').close(); if (uncertain) load(); } });
  $('#paEditor').addEventListener('cancel', event => { if (saving) event.preventDefault(); else if (uncertain) load(); });
  $('#paBackToEdit').addEventListener('click', () => { pending = null; $('#paFields').disabled = false; formTypes(); $('#paReview').hidden = true; $('#paBackToEdit').hidden = true; $('#paSave').textContent = '저장 전 확인'; });
  $('#paForm').addEventListener('submit', event => { if ($('#paSave').dataset.reload) { event.preventDefault(); delete $('#paSave').dataset.reload; $('#paEditor').close(); load(); } else submit(event); });
  return { load, lock, sessionChanged(event, session) { if (event === 'SIGNED_OUT' || (userId && session?.user?.id !== userId)) lock(); } };
}
