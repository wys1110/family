(() => {
  if (document.documentElement.dataset.platformRequestAdminModule === 'ready') return;
  document.documentElement.dataset.platformRequestAdminModule = 'ready';

  const PLATFORM_ADMIN_EMAIL = 'wys1110@gmail.com';
  const STATUS_OPTIONS = [
    ['new', '신규'],
    ['reviewing', '검토 중'],
    ['planned', '반영 예정'],
    ['done', '완료'],
    ['dismissed', '보류'],
  ];
  const STATUS_LABELS = new Map(STATUS_OPTIONS);
  const MAX_REQUESTS = 500;

  let allRequests = [];
  let loadId = 0;
  let searchTimer = null;
  let platformAdmin = false;

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);

  const getContext = () => {
    if (typeof state === 'undefined' || !state.supabase || !state.session?.user) return null;
    return { supabase: state.supabase, session: state.session };
  };

  const waitForContext = async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const context = getContext();
      if (context) return context;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  const waitForAdminView = async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const view = document.querySelector('#adminView');
      if (view) return view;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  const formatCreatedAt = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', {
      year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
  };

  const syncNavigationColumns = () => {
    const navigation = document.querySelector('.view-tabs');
    if (!navigation) return;
    const visibleTabs = [...navigation.querySelectorAll('.view-tab')].filter((button) => !button.hidden).length;
    navigation.style.gridTemplateColumns = `repeat(${Math.max(1, visibleTabs)}, minmax(0, 1fr))`;
  };

  const revealAdminTab = () => {
    const tab = document.querySelector('.view-tab[data-view="admin"]');
    if (!tab) return;
    tab.hidden = false;
    syncNavigationColumns();
  };

  const updateDisclosure = () => {
    const note = document.querySelector('#featureRequestView .feature-request-note');
    if (note) note.textContent = '등록한 내용은 가족 관리자와 플랫폼 관리자가 서비스 개선을 위해 확인할 수 있어요.';
  };

  const injectStyle = () => {
    if (document.querySelector('style[data-platform-request-admin-style]')) return;
    const style = document.createElement('style');
    style.dataset.platformRequestAdminStyle = '';
    style.textContent = `
      .platform-request-admin-card[hidden] { display: none !important; }
      .platform-request-admin-card { margin-top: 16px; }
      .platform-request-admin-heading { grid-template-columns: 44px minmax(0, 1fr) auto; }
      .platform-request-admin-heading .admin-card-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
      .platform-request-admin-heading .admin-refresh-button { align-self: start; }
      .platform-request-admin-summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 14px;
      }
      .platform-request-admin-summary div {
        min-width: 0;
        padding: 11px 8px;
        border: 1px solid var(--separator);
        border-radius: 14px;
        background: rgba(var(--theme-accent-rgb), .055);
        text-align: center;
      }
      .platform-request-admin-summary strong,
      .platform-request-admin-summary span { display: block; }
      .platform-request-admin-summary strong { color: var(--label); font-size: 18px; }
      .platform-request-admin-summary span { margin-top: 3px; color: var(--secondary); font-size: 9px; }
      .platform-request-admin-controls {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(120px, 180px);
        gap: 8px;
        margin-bottom: 12px;
      }
      .platform-request-admin-controls input,
      .platform-request-admin-controls select {
        width: 100%;
        min-height: 44px;
        border: 1px solid var(--separator);
        border-radius: 13px;
        color: var(--label);
        background: var(--surface);
        font: inherit;
        font-size: 12px;
      }
      .platform-request-admin-controls input { padding: 0 13px; }
      .platform-request-admin-controls select { padding: 0 34px 0 12px; }
      .platform-request-admin-list { display: grid; gap: 10px; }
      .platform-request-admin-item {
        padding: 14px;
        border: 1px solid var(--separator);
        border-left: 4px solid var(--tertiary);
        border-radius: 16px;
        background: var(--surface);
      }
      .platform-request-admin-item[data-status="new"] { border-left-color: #c07a55; }
      .platform-request-admin-item[data-status="reviewing"] { border-left-color: #697aa1; }
      .platform-request-admin-item[data-status="planned"] { border-left-color: #8a78a2; }
      .platform-request-admin-item[data-status="done"] { border-left-color: #5f8069; }
      .platform-request-admin-item[data-status="dismissed"] { border-left-color: #a29c92; }
      .platform-request-admin-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 9px;
        color: var(--secondary);
        font-size: 10px;
      }
      .platform-request-admin-household {
        padding: 4px 7px;
        border-radius: 999px;
        color: var(--blue);
        background: rgba(var(--theme-accent-rgb), .10);
        font-weight: 800;
      }
      .platform-request-admin-author { color: var(--label); font-weight: 750; }
      .platform-request-admin-time { margin-left: auto; }
      .platform-request-admin-item p {
        margin: 10px 0 12px;
        color: var(--label);
        font-size: 13px;
        line-height: 1.58;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .platform-request-admin-status {
        display: grid;
        grid-template-columns: auto minmax(0, 220px);
        justify-content: end;
        align-items: center;
        gap: 8px;
        color: var(--secondary);
        font-size: 10px;
        font-weight: 750;
      }
      .platform-request-admin-status select {
        width: 100%;
        min-height: 42px;
        padding: 0 34px 0 11px;
        border: 1px solid var(--separator);
        border-radius: 11px;
        color: var(--label);
        background: var(--surface-2);
        font: inherit;
        font-size: 11px;
        font-weight: 750;
      }
      .platform-request-admin-empty,
      .platform-request-admin-error {
        padding: 24px 14px;
        border: 1px dashed var(--separator);
        border-radius: 16px;
        color: var(--secondary);
        text-align: center;
        font-size: 11px;
        line-height: 1.5;
      }
      .platform-request-admin-error strong,
      .platform-request-admin-error span { display: block; }
      .platform-request-admin-error strong { margin-bottom: 5px; color: var(--label); }
      @media (max-width: 560px) {
        .platform-request-admin-heading { grid-template-columns: 44px minmax(0, 1fr); }
        .platform-request-admin-heading .admin-card-actions { grid-column: 1 / -1; justify-content: stretch; width: 100%; }
        .platform-request-admin-heading .admin-card-actions > * { flex: 1 1 0; width: 0; max-width: 100%; box-sizing: border-box; }
        .platform-request-admin-heading .admin-refresh-button { grid-column: 1 / -1; justify-self: stretch; width: 100%; max-width: 100%; box-sizing: border-box; }
        .platform-request-admin-controls { grid-template-columns: 1fr; }
        .platform-request-admin-time { width: 100%; margin-left: 0; }
        .platform-request-admin-status { grid-template-columns: auto minmax(0, 1fr); }
      }
    `;
    document.head.appendChild(style);
  };

  const createSection = (adminView) => {
    let section = adminView.querySelector('[data-platform-request-admin]');
    if (section) return section;
    section = document.createElement('section');
    section.className = 'settings-card platform-request-admin-card';
    section.dataset.platformRequestAdmin = '';
    section.dataset.adminCollapsed = 'true';
    section.hidden = true;
    section.innerHTML = `
      <div class="settings-heading platform-request-admin-heading">
        <span class="settings-mark" aria-hidden="true">💡</span>
        <div>
          <p class="eyebrow">플랫폼 관리자 전용</p>
          <h2>전체 사용자 요청</h2>
          <span>모든 가족 그룹에서 등록한 개선 요청을 확인하고 처리 상태를 관리하세요.</span>
        </div>
        <div class="admin-card-actions">
          <button class="admin-refresh-button" type="button" data-platform-request-refresh>새로고침</button>
          <button class="admin-card-toggle" type="button" data-admin-collapse aria-expanded="false" aria-controls="platformRequestDetails">펼치기</button>
        </div>
      </div>
      <div class="platform-request-admin-summary">
        <div><strong data-platform-request-total>0</strong><span>전체 요청</span></div>
        <div><strong data-platform-request-open>0</strong><span>처리 필요</span></div>
        <div><strong data-platform-request-done>0</strong><span>완료</span></div>
      </div>
      <div class="admin-card-body" id="platformRequestDetails" data-admin-card-body hidden>
        <div class="platform-request-admin-controls">
          <input type="search" data-platform-request-search placeholder="가족 그룹·작성자·요청 내용 검색" aria-label="전체 요청 검색">
          <select data-platform-request-filter aria-label="요청 상태 필터">
            <option value="all">전체 상태</option>
            ${STATUS_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
          </select>
        </div>
        <div class="platform-request-admin-list" data-platform-request-list>
          <div class="platform-request-admin-empty">요청을 불러오는 중이에요.</div>
        </div>
      </div>
    `;
    adminView.appendChild(section);
    return section;
  };

  const filteredRequests = (section) => {
    const query = section.querySelector('[data-platform-request-search]').value.trim().toLocaleLowerCase('ko-KR');
    const status = section.querySelector('[data-platform-request-filter]').value;
    return allRequests.filter((request) => {
      if (status !== 'all' && request.status !== status) return false;
      if (!query) return true;
      return [request.household_name, request.requester_name, request.content]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('ko-KR').includes(query));
    });
  };

  const updateSummary = (section) => {
    section.querySelector('[data-platform-request-total]').textContent = String(allRequests.length);
    section.querySelector('[data-platform-request-open]').textContent = String(allRequests.filter((request) => !['done', 'dismissed'].includes(request.status)).length);
    section.querySelector('[data-platform-request-done]').textContent = String(allRequests.filter((request) => request.status === 'done').length);
  };

  const renderRequests = (section) => {
    updateSummary(section);
    const list = section.querySelector('[data-platform-request-list]');
    const requests = filteredRequests(section);
    if (!requests.length) {
      list.innerHTML = '<div class="platform-request-admin-empty">조건에 맞는 요청이 없어요.</div>';
      return;
    }
    list.innerHTML = requests.map((request) => `
      <article class="platform-request-admin-item" data-platform-request-id="${escapeHtml(request.id)}" data-status="${escapeHtml(request.status)}">
        <div class="platform-request-admin-meta">
          <span class="platform-request-admin-household">${escapeHtml(request.household_name || '이름 없는 가족 그룹')}</span>
          <span class="platform-request-admin-author">${escapeHtml(request.requester_name || '가족 구성원')}</span>
          <time class="platform-request-admin-time" datetime="${escapeHtml(request.created_at || '')}">${escapeHtml(formatCreatedAt(request.created_at))}</time>
        </div>
        <p>${escapeHtml(request.content)}</p>
        <label class="platform-request-admin-status">
          <span>상태</span>
          <select data-platform-request-status aria-label="플랫폼 기능 요청 상태 변경">
            ${STATUS_OPTIONS.map(([value, label]) => `<option value="${value}"${request.status === value ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </article>
    `).join('');
  };

  const showLoadError = (section, error) => {
    const list = section.querySelector('[data-platform-request-list]');
    const missingMigration = error?.code === '42883' || /list_platform_feature_requests|is_platform_admin/i.test(error?.message || '');
    list.innerHTML = `
      <div class="platform-request-admin-error">
        <strong>${missingMigration ? 'Supabase 관리자 마이그레이션이 필요해요.' : '전체 요청을 불러오지 못했어요.'}</strong>
        <span>${missingMigration ? '20260801_platform_feature_request_admin.sql을 SQL Editor에서 실행해 주세요.' : '잠시 후 다시 시도해 주세요.'}</span>
      </div>
    `;
  };

  const loadRequests = async (section) => {
    if (!platformAdmin) return;
    const context = await waitForContext();
    if (!context) return;
    const currentLoadId = ++loadId;
    const refreshButton = section.querySelector('[data-platform-request-refresh]');
    refreshButton.disabled = true;
    refreshButton.textContent = '불러오는 중…';
    try {
      const { data, error } = await context.supabase.rpc('list_platform_feature_requests', {
        status_filter: null,
        search_text: null,
        row_limit: MAX_REQUESTS,
      });
      if (currentLoadId !== loadId) return;
      if (error) throw error;
      allRequests = Array.isArray(data) ? data : [];
      renderRequests(section);
    } catch (error) {
      if (currentLoadId === loadId) showLoadError(section, error);
    } finally {
      if (currentLoadId === loadId) {
        refreshButton.disabled = false;
        refreshButton.textContent = '새로고침';
      }
    }
  };

  const verifyPlatformAdmin = async (section) => {
    const context = await waitForContext();
    if (!context) return;
    try {
      const { data, error } = await context.supabase.rpc('is_platform_admin');
      if (error) throw error;
      platformAdmin = data === true;
    } catch (error) {
      const currentEmail = String(context.session.user.email || '').toLowerCase();
      const missingMigration = error?.code === '42883' || /is_platform_admin/i.test(error?.message || '');
      platformAdmin = missingMigration && currentEmail === PLATFORM_ADMIN_EMAIL;
      if (platformAdmin) showLoadError(section, error);
    }

    section.hidden = !platformAdmin;
    if (!platformAdmin) return;
    revealAdminTab();
    if (!section.querySelector('.platform-request-admin-error')) loadRequests(section);
  };

  const bindSection = (section) => {
    if (section.dataset.platformRequestAdminBound === 'true') return;
    section.dataset.platformRequestAdminBound = 'true';
    section.querySelector('[data-platform-request-refresh]').addEventListener('click', () => loadRequests(section));
    section.querySelector('[data-platform-request-filter]').addEventListener('change', () => renderRequests(section));
    section.querySelector('[data-platform-request-search]').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderRequests(section), 180);
    });
    section.querySelector('[data-platform-request-list]').addEventListener('change', async (event) => {
      const select = event.target.closest('[data-platform-request-status]');
      if (!select || !platformAdmin) return;
      const item = select.closest('[data-platform-request-id]');
      const request = allRequests.find((candidate) => candidate.id === item?.dataset.platformRequestId);
      if (!item || !request) return;
      const previousStatus = request.status;
      const nextStatus = select.value;
      if (previousStatus === nextStatus) return;

      const context = await waitForContext();
      if (!context) {
        select.value = previousStatus;
        return;
      }
      select.disabled = true;
      try {
        const { error } = await context.supabase.rpc('update_platform_feature_request_status', {
          request_id: request.id,
          next_status: nextStatus,
        });
        if (error) throw error;
        request.status = nextStatus;
        item.dataset.status = nextStatus;
        updateSummary(section);
        try {
          await context.supabase.rpc('log_platform_admin_action', {
            p_action: 'feature_request_status',
            p_target_type: 'feature_request',
            p_target_id: request.id,
            p_metadata: { next_status: nextStatus },
          });
        } catch {
          // 상태 변경 자체는 성공했으므로 감사 로그 실패가 작업을 되돌리지는 않아요.
        }
        if (typeof toast === 'function') toast(`요청 상태를 ‘${STATUS_LABELS.get(nextStatus) || nextStatus}’로 변경했어요.`);
      } catch {
        select.value = previousStatus;
        if (typeof toast === 'function') toast('요청 상태를 변경하지 못했어요.');
      } finally {
        select.disabled = false;
      }
    });
  };

  const initialize = async () => {
    updateDisclosure();
    injectStyle();
    const adminView = await waitForAdminView();
    if (!adminView) return;
    const section = createSection(adminView);
    bindSection(section);
    await verifyPlatformAdmin(section);
  };

  window.addEventListener('familycontextchange', () => {
    loadId += 1;
    allRequests = [];
    platformAdmin = false;
    initialize();
  });

  initialize();
})();
