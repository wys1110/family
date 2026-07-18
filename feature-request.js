(() => {
  if (document.querySelector('[data-feature-request-module]')) return;

  const VIEW_NAME = 'feature-request';
  const ACTIVE_VIEW_STORAGE_KEY = 'family-active-view-v1';
  const DRAFT_KEY = 'family-feature-request-draft-v1';
  const MAX_LENGTH = 500;
  const STATUS_OPTIONS = [
    ['new', '신규'],
    ['reviewing', '검토 중'],
    ['planned', '반영 예정'],
    ['done', '완료'],
    ['dismissed', '보류'],
  ];

  const main = document.querySelector('.app-shell main');
  const navigation = document.querySelector('.view-tabs');
  if (!main || !navigation) return;

  let tab = navigation.querySelector(`[data-view="${VIEW_NAME}"]`);
  if (!tab) {
    tab = document.createElement('button');
    tab.className = 'view-tab';
    tab.dataset.view = VIEW_NAME;
    tab.type = 'button';
    tab.textContent = '기능 요청';
    navigation.appendChild(tab);
  }

  const view = document.createElement('div');
  view.id = 'featureRequestView';
  view.className = 'feature-request-view';
  view.dataset.featureRequestModule = '';
  view.hidden = true;
  view.innerHTML = `
    <section class="feature-request-card" aria-labelledby="featureRequestTitle">
      <div class="feature-request-heading">
        <span class="feature-request-mark" aria-hidden="true">✦</span>
        <div>
          <p class="eyebrow">FAMILY LAB</p>
          <h2 id="featureRequestTitle">필요한 기능 요청</h2>
          <span>불편한 점이나 새로 필요한 기능을 편하게 남겨주세요.</span>
        </div>
      </div>
      <form class="feature-request-form" id="featureRequestForm">
        <label for="featureRequestText">어떤 기능이 필요하세요?</label>
        <textarea id="featureRequestText" name="request" rows="4" maxlength="${MAX_LENGTH}" placeholder="예: 모유와 분유를 구분해서 하루 합계를 보고 싶어요." required></textarea>
        <div class="feature-request-actions">
          <span id="featureRequestCount" aria-live="polite">0/${MAX_LENGTH}</span>
          <button type="submit">요청 등록</button>
        </div>
        <p class="feature-request-note">등록한 내용은 가족 DB에 저장되며 관리자만 확인할 수 있어요.</p>
        <p class="feature-request-message" id="featureRequestMessage" role="status" aria-live="polite" hidden></p>
      </form>
    </section>
    <section class="feature-request-admin" id="featureRequestAdmin" aria-labelledby="featureRequestAdminTitle" hidden>
      <div class="feature-request-admin-heading">
        <div>
          <p class="eyebrow">ADMIN ONLY</p>
          <h2 id="featureRequestAdminTitle">요청 관리</h2>
          <span id="featureRequestAdminCount">등록된 요청을 불러오는 중이에요.</span>
        </div>
        <button type="button" id="featureRequestRefresh">새로고침</button>
      </div>
      <div class="feature-request-list" id="featureRequestList"></div>
    </section>
  `;
  main.appendChild(view);

  const form = view.querySelector('#featureRequestForm');
  const textarea = view.querySelector('#featureRequestText');
  const count = view.querySelector('#featureRequestCount');
  const submitButton = form.querySelector('button[type="submit"]');
  const message = view.querySelector('#featureRequestMessage');
  const admin = view.querySelector('#featureRequestAdmin');
  const adminCount = view.querySelector('#featureRequestAdminCount');
  const requestList = view.querySelector('#featureRequestList');
  const refreshButton = view.querySelector('#featureRequestRefresh');
  let isOwner = false;
  let adminInitialized = false;
  let adminContextKey = '';
  let requestLoadId = 0;
  let submitInProgress = false;
  let messageTimer = null;

  const contextKey = (context = getFamilyContext()) => context
    ? `${context.session.user.id}:${context.household.id}`
    : 'device';

  let activeDraftKey = `${DRAFT_KEY}:${typeof state !== 'undefined' && state.session?.user?.id ? state.session.user.id : 'device'}`;

  const readDraft = () => {
    try { return localStorage.getItem(activeDraftKey) || ''; }
    catch { return ''; }
  };

  const saveDraft = (value) => {
    try {
      if (value) localStorage.setItem(activeDraftKey, value);
      else localStorage.removeItem(activeDraftKey);
    } catch { /* 브라우저 저장이 막혀도 입력은 계속 허용 */ }
  };

  const updateCount = () => {
    count.textContent = `${textarea.value.length}/${MAX_LENGTH}`;
  };

  const showMessage = (text, kind = 'success') => {
    clearTimeout(messageTimer);
    message.textContent = text;
    message.className = `feature-request-message ${kind}`;
    message.hidden = false;
    messageTimer = setTimeout(() => { message.hidden = true; }, 4200);
  };

  const setSaving = (saving) => {
    submitButton.disabled = saving;
    submitButton.setAttribute('aria-busy', String(saving));
    submitButton.textContent = saving ? '저장 중…' : '요청 등록';
  };

  const getFamilyContext = () => {
    if (typeof state === 'undefined') return null;
    if (!state.supabase || !state.session || !state.household?.id) return null;
    return { supabase: state.supabase, session: state.session, household: state.household };
  };

  const waitForFamilyContext = async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const context = getFamilyContext();
      if (context) return context;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  const requesterName = (session) => {
    const metadata = session.user.user_metadata || {};
    return String(metadata.full_name || metadata.name || metadata.user_name || '').trim().slice(0, 80) || null;
  };

  const formatCreatedAt = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
  };

  const statusLabel = (status) => STATUS_OPTIONS.find(([value]) => value === status)?.[1] || '신규';

  const renderRequests = (requests) => {
    adminCount.textContent = `${requests.length}개의 요청`;
    if (!requests.length) {
      requestList.innerHTML = '<div class="feature-request-empty"><strong>아직 등록된 요청이 없어요</strong><span>가족이 요청을 남기면 여기에 표시돼요.</span></div>';
      return;
    }

    requestList.innerHTML = requests.map((request) => `
      <article class="feature-request-item" data-request-id="${request.id}" data-status="${request.status}">
        <div class="feature-request-item-meta">
          <span>${escapeHtml(request.requester_name || '가족 구성원')}</span>
          <time datetime="${escapeHtml(request.created_at || '')}">${escapeHtml(formatCreatedAt(request.created_at))}</time>
        </div>
        <p>${escapeHtml(request.content)}</p>
        <label>
          <span>상태</span>
          <select data-request-status aria-label="기능 요청 상태 변경">
            ${STATUS_OPTIONS.map(([value, label]) => `<option value="${value}"${request.status === value ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </article>
    `).join('');
  };

  const loadRequests = async () => {
    if (!isOwner) return;
    const context = await waitForFamilyContext();
    if (!context) {
      adminCount.textContent = '가족 공간 연결 후 요청을 확인할 수 있어요.';
      return;
    }
    const loadId = ++requestLoadId;
    const expectedContext = contextKey(context);
    refreshButton.disabled = true;
    refreshButton.textContent = '불러오는 중…';
    try {
      const { data, error } = await context.supabase
        .from('feature_requests')
        .select('id, content, status, requester_name, created_at, updated_at')
        .eq('household_id', context.household.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (loadId !== requestLoadId || expectedContext !== adminContextKey || expectedContext !== contextKey()) return;
      if (error) {
        adminCount.textContent = '요청을 불러오지 못했어요.';
        requestList.innerHTML = '<div class="feature-request-empty error"><strong>DB 업데이트가 필요해요</strong><span>Supabase에 기능 요청 마이그레이션이 적용됐는지 확인해 주세요.</span></div>';
        return;
      }
      renderRequests(data || []);
    } catch {
      if (loadId === requestLoadId && expectedContext === adminContextKey) adminCount.textContent = '요청을 불러오지 못했어요.';
    } finally {
      if (loadId === requestLoadId) {
        refreshButton.disabled = false;
        refreshButton.textContent = '새로고침';
      }
    }
  };

  const initializeAdmin = async () => {
    const context = await waitForFamilyContext();
    if (!context) return;
    const expectedContext = contextKey(context);
    if (adminInitialized && adminContextKey === expectedContext) {
      if (isOwner) loadRequests();
      return;
    }

    adminInitialized = false;
    isOwner = false;
    adminContextKey = expectedContext;
    admin.hidden = true;
    requestList.innerHTML = '';

    const { data, error } = await context.supabase
      .from('household_members')
      .select('role')
      .eq('household_id', context.household.id)
      .eq('user_id', context.session.user.id)
      .maybeSingle();

    if (expectedContext !== contextKey()) return;
    adminInitialized = true;
    isOwner = !error && data?.role === 'owner';
    admin.hidden = !isOwner;
    if (isOwner) loadRequests();
  };

  const installFeatureRequestView = () => {
    if (typeof switchView !== 'function') return false;
    if (switchView.__featureRequestInstalled) return true;

    const previousSwitchView = switchView;
    const enhancedSwitchView = function (requestedView) {
      const featureView = document.querySelector('#featureRequestView');
      const addButton = document.querySelector('#addEventButton');

      if (requestedView !== VIEW_NAME) {
        if (featureView) featureView.hidden = true;
        return previousSwitchView(requestedView);
      }

      previousSwitchView('calendar');
      if (typeof state !== 'undefined') state.activeView = VIEW_NAME;
      try { localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, VIEW_NAME); } catch { /* 현재 화면만 유지 */ }

      ['calendarView', 'growthView', 'englishView', 'privateView'].forEach((id) => {
        const target = document.getElementById(id);
        if (target) target.hidden = true;
      });
      if (featureView) featureView.hidden = false;
      document.querySelectorAll('.view-tab').forEach((button) => {
        const active = button.dataset.view === VIEW_NAME;
        button.classList.toggle('active', active);
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(active));
      });
      if (addButton) addButton.hidden = true;
      initializeAdmin();
    };

    Object.keys(previousSwitchView).forEach((key) => {
      try { enhancedSwitchView[key] = previousSwitchView[key]; } catch { /* 읽기 전용 속성은 건너뜀 */ }
    });
    enhancedSwitchView.__featureRequestInstalled = true;
    switchView = enhancedSwitchView;
    return true;
  };

  const restoreFeatureRequestView = (attempt = 0) => {
    if (!installFeatureRequestView()) {
      if (attempt < 40) setTimeout(() => restoreFeatureRequestView(attempt + 1), 100);
      return;
    }
    let savedView = null;
    try { savedView = localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY); } catch { /* 기본 탭 유지 */ }
    if (savedView === VIEW_NAME) switchView(VIEW_NAME);
  };

  textarea.value = readDraft();
  updateCount();

  textarea.addEventListener('input', () => {
    updateCount();
    saveDraft(textarea.value);
  });

  tab.addEventListener('click', () => {
    if (typeof switchView === 'function') switchView(VIEW_NAME);
  });

  refreshButton.addEventListener('click', loadRequests);

  requestList.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-request-status]');
    if (!select || !isOwner) return;
    const item = select.closest('[data-request-id]');
    const previousStatus = item.dataset.status;
    const nextStatus = select.value;
    if (previousStatus === nextStatus) return;

    const context = await waitForFamilyContext();
    if (!context) { select.value = previousStatus; return; }
    const expectedContext = contextKey(context);
    select.disabled = true;
    try {
      const { error } = await context.supabase
        .from('feature_requests')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', item.dataset.requestId)
        .eq('household_id', context.household.id);
      if (error || expectedContext !== contextKey()) throw error || new Error('family context changed');
      item.dataset.status = nextStatus;
      showMessage(`요청 상태를 ‘${statusLabel(nextStatus)}’로 변경했어요.`);
    } catch {
      select.value = previousStatus;
      showMessage('요청 상태를 변경하지 못했어요.', 'error');
    } finally {
      select.disabled = false;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitInProgress) return;
    const request = textarea.value.trim();
    if (!request) {
      textarea.focus();
      return;
    }

    submitInProgress = true;
    setSaving(true);
    try {
      const context = await waitForFamilyContext();
      if (!context) {
        showMessage('로그인하고 가족 공간에 연결한 뒤 등록해 주세요.', 'error');
        return;
      }
      const expectedContext = contextKey(context);
      const { error } = await context.supabase.from('feature_requests').insert({
        household_id: context.household.id,
        content: request,
        status: 'new',
        requester_name: requesterName(context.session),
        created_by: context.session.user.id,
      });
      if (error || expectedContext !== contextKey()) {
        const migrationMissing = error?.code === '42P01' || /feature_requests/i.test(error?.message || '');
        showMessage(migrationMissing ? '기능 요청 DB가 아직 준비되지 않았어요.' : '요청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.', 'error');
        return;
      }
      textarea.value = '';
      saveDraft('');
      updateCount();
      showMessage('요청을 등록했어요. 관리자가 확인할게요.');
      if (isOwner) loadRequests();
    } catch {
      showMessage('요청을 저장하지 못했어요. 작성 내용은 그대로 보관했어요.', 'error');
    } finally {
      submitInProgress = false;
      setSaving(false);
    }
  });

  window.addEventListener('familycontextchange', (event) => {
    requestLoadId += 1;
    isOwner = false;
    adminInitialized = false;
    adminContextKey = '';
    admin.hidden = true;
    requestList.innerHTML = '';
    adminCount.textContent = '등록된 요청을 불러오는 중이에요.';
    activeDraftKey = `${DRAFT_KEY}:${event.detail?.userId || 'device'}`;
    textarea.value = readDraft();
    updateCount();
    if (!view.hidden) initializeAdmin();
  });

  restoreFeatureRequestView();
})();
