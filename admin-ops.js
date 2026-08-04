(() => {
  if (document.documentElement.dataset.adminOperationsModule === 'ready') return;
  document.documentElement.dataset.adminOperationsModule = 'ready';

  const ACTION_LABELS = {
    admin_view: '관리자 화면 열람',
    operations_check: '운영 점검',
    export_json: 'JSON 내보내기',
    export_csv: 'CSV 내보내기',
    feature_request_status: '기능 요청 상태 변경',
  };
  const OPERATION_ACTIONS = new Set(['admin_view', 'operations_check', 'export_json', 'export_csv']);
  let adminView = null;
  let section = null;
  let allowed = false;
  let loadId = 0;

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);

  const getContext = () => {
    if (typeof state === 'undefined' || !state.supabase || !state.session?.user) return null;
    return { supabase: state.supabase, session: state.session };
  };

  const waitForContext = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const context = getContext();
      if (context) return context;
      if (typeof state !== 'undefined' && state.authReady && !state.session) return null;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  const waitForAdminView = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const view = document.querySelector('#adminView');
      if (view) return view;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  const missingMigration = (error) => error?.code === '42883'
    || /get_platform_admin_operations|list_platform_admin_audit_logs|get_platform_admin_export|log_platform_admin_action|schema cache/i.test(error?.message || '');

  const formatTime = (value, withDate = true) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '기록 없음';
    return new Intl.DateTimeFormat('ko-KR', withDate
      ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' }).format(date);
  };

  const injectStyle = () => {
    if (document.querySelector('style[data-admin-operations-style]')) return;
    const style = document.createElement('style');
    style.dataset.adminOperationsStyle = '';
    style.textContent = `
      .admin-operations-card[hidden] { display: none !important; }
      .admin-operations-card { margin-top: 16px; }
      .admin-operations-heading { grid-template-columns: 44px minmax(0, 1fr) auto; }
      .admin-operations-heading .admin-card-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
      .admin-operations-heading .admin-refresh-button { align-self: start; }
      .admin-ops-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
      .admin-ops-summary div { min-width: 0; padding: 10px 6px; border: 1px solid var(--separator); border-radius: 14px; background: rgba(var(--theme-accent-rgb), .055); text-align: center; }
      .admin-ops-summary strong, .admin-ops-summary span { display: block; }
      .admin-ops-summary strong { overflow: hidden; color: var(--label); font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
      .admin-ops-summary strong.warning { color: var(--orange); }
      .admin-ops-summary strong.error { color: var(--red); }
      .admin-ops-summary span { margin-top: 3px; color: var(--secondary); font-size: 9px; }
      .admin-ops-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .admin-ops-panel { min-width: 0; padding: 13px; border: 1px solid var(--separator); border-radius: 16px; background: var(--surface); }
      .admin-ops-panel-wide { grid-column: 1 / -1; }
      .admin-ops-panel h3 { margin: 0; color: var(--label); font-size: 12px; }
      .admin-ops-panel > p { margin: 4px 0 10px; color: var(--secondary); font-size: 9px; line-height: 1.4; }
      .admin-ops-health-list { display: grid; gap: 7px; margin: 0; }
      .admin-ops-health-list div { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--secondary); font-size: 10px; }
      .admin-ops-health-list dt, .admin-ops-health-list dd { margin: 0; }
      .admin-ops-health-list dd { color: var(--label); font-weight: 750; text-align: right; }
      .admin-ops-health-list dd.ok { color: var(--green); }
      .admin-ops-integrity-list, .admin-ops-audit-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
      .admin-ops-integrity-list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 8px; border-radius: 10px; color: var(--secondary); background: var(--surface-2); font-size: 9px; }
      .admin-ops-integrity-list li strong { flex: none; color: var(--label); font-size: 10px; }
      .admin-ops-integrity-list li.warning strong { color: var(--orange); }
      .admin-ops-integrity-list li.error strong { color: var(--red); }
      .admin-ops-empty { margin: 0; color: var(--tertiary); font-size: 9px; }
      .admin-ops-export-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
      .admin-ops-export-actions button { min-width: 0; min-height: 44px; padding: 0 8px; border: 1px solid var(--separator); border-radius: 11px; color: var(--label); background: var(--surface-2); font: inherit; font-size: 10px; font-weight: 750; }
      .admin-ops-export-actions button:disabled { opacity: .55; }
      .admin-ops-audit-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; padding: 7px 8px; border-radius: 10px; background: var(--surface-2); font-size: 9px; }
      .admin-ops-audit-list strong { color: var(--label); font-size: 10px; }
      .admin-ops-audit-list time { color: var(--tertiary); text-align: right; }
      .admin-ops-audit-list span { grid-column: 1 / -1; color: var(--secondary); }
      .admin-ops-error { grid-column: 1 / -1; padding: 12px; border: 1px dashed var(--separator); border-radius: 12px; color: var(--secondary); font-size: 10px; line-height: 1.45; }
      .admin-ops-error strong { display: block; margin-bottom: 4px; color: var(--label); }
      @media (max-width: 560px) {
        .admin-operations-heading { grid-template-columns: 44px minmax(0, 1fr); }
        .admin-operations-heading .admin-card-actions { grid-column: 1 / -1; justify-content: stretch; width: 100%; }
        .admin-operations-heading .admin-card-actions > * { flex: 1 1 0; width: 0; max-width: 100%; box-sizing: border-box; }
        .admin-operations-heading .admin-refresh-button { grid-column: 1 / -1; justify-self: stretch; width: 100%; max-width: 100%; box-sizing: border-box; }
      }
      @media (max-width: 380px) {
        .admin-ops-grid { grid-template-columns: 1fr; }
        .admin-ops-panel-wide { grid-column: auto; }
      }
    `;
    document.head.appendChild(style);
  };

  const createSection = (view) => {
    const existing = view.querySelector('[data-admin-operations]');
    if (existing) return existing;
    const next = document.createElement('section');
    next.className = 'settings-card admin-operations-card';
    next.dataset.adminOperations = '';
    next.dataset.adminCollapsed = 'true';
    next.hidden = true;
    next.innerHTML = `
      <div class="settings-heading admin-operations-heading">
        <span class="settings-mark" aria-hidden="true">◉</span>
        <div>
          <p class="eyebrow">플랫폼 운영</p>
          <h2>운영 상태 및 도구</h2>
          <span>서비스 상태, 데이터 점검, 감사 기록, 내보내기를 한곳에서 확인하세요.</span>
        </div>
        <div class="admin-card-actions">
          <button class="admin-refresh-button" type="button" data-ops-refresh>새로고침</button>
          <button class="admin-card-toggle" type="button" data-admin-collapse aria-expanded="false" aria-controls="adminOperationsDetails">펼치기</button>
        </div>
      </div>
      <div class="admin-ops-summary">
        <div><strong data-ops-health>확인 중</strong><span>운영 상태</span></div>
        <div><strong data-ops-integrity>—</strong><span>정합성 경고</span></div>
        <div><strong data-ops-audit>—</strong><span>최근 감사</span></div>
      </div>
      <div class="admin-card-body" id="adminOperationsDetails" data-admin-card-body hidden>
        <div class="admin-ops-grid">
          <section class="admin-ops-panel" aria-labelledby="adminOpsHealthTitle">
            <h3 id="adminOpsHealthTitle">서비스 건강</h3>
            <p>관리자 RPC가 확인한 현재 상태입니다.</p>
            <dl class="admin-ops-health-list" data-ops-health-list></dl>
          </section>
          <section class="admin-ops-panel" aria-labelledby="adminOpsIntegrityTitle">
            <h3 id="adminOpsIntegrityTitle">데이터 정합성</h3>
            <p>삭제하지 않고 확인이 필요한 항목만 표시합니다.</p>
            <ul class="admin-ops-integrity-list" data-ops-integrity-list></ul>
          </section>
          <section class="admin-ops-panel" aria-labelledby="adminOpsExportTitle">
            <h3 id="adminOpsExportTitle">안전한 내보내기</h3>
            <p>파일은 이 브라우저에서만 생성되며 서버에 저장하지 않습니다.</p>
            <div class="admin-ops-export-actions">
              <button type="button" data-ops-export-json>JSON 백업</button>
              <button type="button" data-ops-export-csv>CSV 요약</button>
            </div>
          </section>
          <section class="admin-ops-panel" aria-labelledby="adminOpsAuditTitle">
            <h3 id="adminOpsAuditTitle">관리자 감사</h3>
            <p>운영 작업만 기록하며 앱 내용은 저장하지 않습니다.</p>
            <ul class="admin-ops-audit-list" data-ops-audit-list></ul>
          </section>
          <div class="admin-ops-error" data-ops-error hidden></div>
        </div>
      </div>`;
    view.appendChild(next);
    return next;
  };

  const query = (selector) => section?.querySelector(selector);
  const setSummaryState = (selector, value, tone = '') => {
    const element = query(selector);
    if (!element) return;
    element.textContent = value;
    element.className = tone;
  };

  const showError = (error) => {
    const element = query('[data-ops-error]');
    if (!element) return;
    element.hidden = false;
    element.innerHTML = `<strong>${missingMigration(error) ? '운영 도구 DB 설정이 아직 적용되지 않았어요.' : '운영 정보를 불러오지 못했어요.'}</strong>${missingMigration(error) ? 'Supabase SQL Editor에서 20260804_platform_admin_operations.sql을 실행해 주세요.' : '권한 또는 네트워크 상태를 확인한 뒤 다시 시도해 주세요.'}`;
  };

  const renderHealth = (health = {}) => {
    const entries = [
      ['데이터베이스', health.database === 'ok' ? '정상' : '확인 필요', health.database === 'ok' ? 'ok' : ''],
      ['최근 앱 활동', health.activity_last_at ? formatTime(health.activity_last_at) : '기록 없음', ''],
      ['24시간 활동', `${Number(health.activity_24h || 0).toLocaleString('ko-KR')}건`, ''],
      ['처리 대기 요청', `${Number(health.open_requests || 0).toLocaleString('ko-KR')}건`, ''],
    ];
    query('[data-ops-health-list]').innerHTML = entries.map(([label, value, tone]) => `<div><dt>${escapeHtml(label)}</dt><dd class="${tone}">${escapeHtml(value)}</dd></div>`).join('');
    setSummaryState('[data-ops-health]', health.database === 'ok' ? '정상' : '확인 필요', health.database === 'ok' ? 'ok' : 'warning');
  };

  const renderIntegrity = (items = []) => {
    const warnings = items.filter((item) => Number(item?.count || 0) > 0);
    const list = query('[data-ops-integrity-list]');
    list.innerHTML = warnings.length
      ? warnings.map((item) => `<li class="${escapeHtml(item.severity || 'warning')}"><span>${escapeHtml(item.label || item.key)}</span><strong>${Number(item.count || 0).toLocaleString('ko-KR')}건</strong></li>`).join('')
      : '<li><span>점검 대상 이상 없음</span><strong>정상</strong></li>';
    setSummaryState('[data-ops-integrity]', warnings.length ? `${warnings.length}건` : '정상', warnings.some((item) => item.severity === 'error') ? 'error' : warnings.length ? 'warning' : 'ok');
    return warnings.length;
  };

  const renderAudit = (logs = []) => {
    const list = query('[data-ops-audit-list]');
    list.innerHTML = logs.length
      ? logs.slice(0, 10).map((log) => `<li><strong>${escapeHtml(ACTION_LABELS[log.action] || log.action || '운영 작업')}</strong><time>${escapeHtml(formatTime(log.occurred_at))}</time><span>${escapeHtml(log.admin_email || '관리자')}${log.metadata?.format ? ` · ${escapeHtml(String(log.metadata.format).toUpperCase())}` : ''}${log.metadata?.next_status ? ` · ${escapeHtml(log.metadata.next_status)}` : ''}</span></li>`).join('')
      : '<li><span>아직 관리자 작업 기록이 없습니다.</span></li>';
    const latest = logs[0]?.occurred_at;
    setSummaryState('[data-ops-audit]', latest ? formatTime(latest, false) : '없음');
  };

  const logAction = async (context, action, targetType = null, targetId = null, metadata = {}) => {
    if (!OPERATION_ACTIONS.has(action) && action !== 'feature_request_status') return;
    const { error } = await context.supabase.rpc('log_platform_admin_action', {
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId,
      p_metadata: metadata,
    });
    if (error) throw error;
  };

  const load = async (announce = false) => {
    if (!allowed || !section) return;
    const context = await waitForContext();
    if (!context) return;
    const currentLoadId = ++loadId;
    const refresh = query('[data-ops-refresh]');
    refresh.disabled = true;
    refresh.textContent = '불러오는 중…';
    const error = query('[data-ops-error]');
    error.hidden = true;
    try {
      const [{ data: operations, error: operationsError }, { data: logs, error: logsError }] = await Promise.all([
        context.supabase.rpc('get_platform_admin_operations'),
        context.supabase.rpc('list_platform_admin_audit_logs', { p_row_limit: 20 }),
      ]);
      if (operationsError) throw operationsError;
      if (logsError) throw logsError;
      if (currentLoadId !== loadId) return;
      renderHealth(operations?.health || {});
      const warningCount = renderIntegrity(operations?.integrity || []);
      renderAudit(Array.isArray(logs) ? logs : []);
      await logAction(context, 'operations_check', null, null, { warning_count: warningCount });
    } catch (loadError) {
      if (currentLoadId === loadId) showError(loadError);
      if (announce && typeof toast === 'function') toast('운영 정보를 불러오지 못했어요');
    } finally {
      if (currentLoadId === loadId) {
        refresh.disabled = false;
        refresh.textContent = '새로고침';
      }
    }
  };

  const download = (filename, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const exportRows = (payload) => {
    const rows = [['table', 'id', 'household_id', 'name_or_title', 'date', 'status', 'created_at']];
    const append = (table, records, getRow) => (records || []).forEach((record) => rows.push([table, ...getRow(record)]));
    append('users', payload.users, (record) => [record.id, '', record.name || record.email, '', '', record.created_at]);
    append('households', payload.households, (record) => [record.id, '', record.name, '', '', record.created_at]);
    append('events', payload.events, (record) => [record.id, record.household_id, record.title, record.event_date, '', record.created_at]);
    append('babies', payload.babies, (record) => [record.id, record.household_id, record.name, record.birth_date, '', record.created_at]);
    append('growth_entries', payload.growth_entries, (record) => [record.id, record.household_id, record.title, record.entry_date, record.category, record.created_at]);
    append('family_todos', payload.family_todos, (record) => [record.id, record.household_id, record.title, record.due_date, record.completed ? '완료' : '미완료', record.created_at]);
    append('feature_requests', payload.feature_requests, (record) => [record.id, record.household_id, record.requester_name || '가족 구성원', '', record.status, record.created_at]);
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  };

  const requestExport = async (format) => {
    const context = await waitForContext();
    if (!context) return;
    const button = query(`[data-ops-export-${format}]`);
    button.disabled = true;
    button.textContent = '준비 중…';
    try {
      const { data, error } = await context.supabase.rpc('get_platform_admin_export');
      if (error) throw error;
      const content = format === 'json'
        ? JSON.stringify(data || {}, null, 2)
        : exportRows(data || {});
      const stamp = new Date().toISOString().slice(0, 10);
      download(`family-admin-${stamp}.${format}`, content, format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8');
      await logAction(context, `export_${format}`, null, null, { format });
      if (typeof toast === 'function') toast(`${format.toUpperCase()} 파일을 저장했어요.`);
    } catch (error) {
      showError(error);
      if (typeof toast === 'function') toast('내보내기를 준비하지 못했어요');
    } finally {
      button.disabled = false;
      button.textContent = format === 'json' ? 'JSON 백업' : 'CSV 요약';
    }
  };

  const verifyAdmin = async () => {
    const context = await waitForContext();
    if (!context) return false;
    try {
      const { data, error } = await context.supabase.rpc('is_platform_admin');
      if (error) throw error;
      return data === true;
    } catch {
      return false;
    }
  };

  const initialize = async () => {
    injectStyle();
    adminView = adminView || await waitForAdminView();
    if (!adminView) return;
    section = section || createSection(adminView);
    allowed = await verifyAdmin();
    section.hidden = !allowed;
    if (!allowed) return;
    const refresh = query('[data-ops-refresh]');
    if (!section.dataset.adminOperationsBound) {
      section.dataset.adminOperationsBound = 'true';
      refresh.addEventListener('click', () => load(true));
      query('[data-ops-export-json]').addEventListener('click', () => requestExport('json'));
      query('[data-ops-export-csv]').addEventListener('click', () => requestExport('csv'));
    }
    const context = await waitForContext();
    if (context) {
      try { await logAction(context, 'admin_view'); } catch { /* audit is best effort */ }
    }
    load();
  };

  window.addEventListener('familycontextchange', () => {
    loadId += 1;
    allowed = false;
    if (section) section.hidden = true;
    initialize();
  });

  initialize();
})();
