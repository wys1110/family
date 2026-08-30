(() => {
  if (document.querySelector('[data-family-admin-module]')) return;

  const VIEW = 'admin';
  const ADMIN_EMAIL = 'wys1110@gmail.com';
  const ACTIVE_VIEW_KEY = 'family-active-view-v1';
  const main = document.querySelector('.app-shell main');
  const nav = document.querySelector('.view-tabs');
  if (!main || !nav) return;

  if (!document.querySelector('link[data-family-admin-style]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'family-admin.css?v=20260804-dashboard-v1';
    link.dataset.familyAdminStyle = '';
    document.head.appendChild(link);
  }

  let tab = nav.querySelector(`[data-view="${VIEW}"]`);
  if (!tab) {
    tab = document.createElement('button');
    tab.className = 'view-tab';
    tab.dataset.view = VIEW;
    tab.type = 'button';
    tab.textContent = '관리자';
    tab.hidden = true;
    nav.appendChild(tab);
  }

  const view = document.createElement('div');
  view.id = 'adminView';
  view.className = 'settings-view admin-view';
  view.dataset.familyAdminModule = '';
  view.hidden = true;
  view.innerHTML = `
    <section class="settings-card global-admin-card" aria-labelledby="globalAdminTitle" data-admin-collapsed="true">
      <div class="settings-heading global-admin-heading">
        <span class="settings-mark" aria-hidden="true">♛</span>
        <div><p class="eyebrow">WYS1110 전용</p><h2 id="globalAdminTitle">앱 전체 사용자 관리</h2><span>모든 가입 사용자와 가족 그룹 구성을 확인하세요.</span></div>
        <div class="admin-card-actions">
          <button class="admin-refresh-button" type="button" data-admin-refresh>새로고침</button>
          <button class="admin-card-toggle" type="button" data-admin-collapse aria-expanded="false" aria-controls="globalAdminDetails">펼치기</button>
        </div>
      </div>
      <div class="global-admin-loading" data-admin-loading>전체 사용자 정보를 불러오는 중이에요.</div>
      <div class="global-admin-error" data-admin-error hidden><strong data-admin-error-title></strong><span data-admin-error-copy></span></div>
      <div data-admin-content hidden>
        <div class="global-admin-stats">
          <div><strong data-stat="users">0</strong><span>전체 사용자</span></div>
          <div><strong data-stat="households">0</strong><span>가족 그룹</span></div>
          <div><strong data-stat="ungrouped_users">0</strong><span>그룹 미가입</span></div>
          <div><strong data-stat="active_30d">0</strong><span>30일 내 로그인</span></div>
        </div>
        <div class="admin-card-body" id="globalAdminDetails" data-admin-card-body hidden>
          <div class="global-admin-tools">
            <label class="global-admin-search"><span aria-hidden="true">⌕</span><input type="search" data-admin-search placeholder="이름, 이메일, 가족 그룹 검색" autocomplete="off"></label>
            <div class="global-admin-modes" role="tablist" aria-label="관리 대상">
              <button class="active" type="button" data-admin-mode="users" role="tab" aria-selected="true">사용자</button>
              <button type="button" data-admin-mode="households" role="tab" aria-selected="false">가족 그룹</button>
            </div>
          </div>
          <section class="global-admin-section" data-admin-section="users">
            <div class="global-admin-section-head"><div><h3>전체 사용자</h3><span>가입 계정, 최근 로그인, 소속 가족 그룹</span></div><strong data-admin-count="users">0명</strong></div>
            <div class="global-admin-list" data-admin-users></div>
          </section>
          <section class="global-admin-section" data-admin-section="households" hidden>
            <div class="global-admin-section-head"><div><h3>가족 그룹 구성</h3><span>그룹별 관리자, 구성원, 기록 규모</span></div><strong data-admin-count="households">0개</strong></div>
            <div class="global-admin-list" data-admin-households></div>
          </section>
          <p class="global-admin-note">계정 삭제·차단·그룹 이동 같은 변경 작업은 실수 방지를 위해 제공하지 않습니다.</p>
        </div>
      </div>
    </section>`;
  main.appendChild(view);

  const $ = (selector) => view.querySelector(selector);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
  const arr = (value) => Array.isArray(value) ? value : [];
  const email = (session) => String(session?.user?.email || '').trim().toLowerCase();
  const formatDate = (value, withTime = false) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '기록 없음';
    return new Intl.DateTimeFormat('ko-KR', withTime
      ? { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
  };
  const provider = (value) => ({ google: 'Google', email: '이메일' }[value] || value || '이메일');
  const missingMigration = (error) => error?.code === '42883' || /is_platform_admin|get_global_admin_overview|schema cache/i.test(error?.message || '');
  const context = () => (typeof state !== 'undefined' && state.supabase && state.session)
    ? { supabase: state.supabase, session: state.session }
    : null;
  const withAuthRecovery = (operation, current) => window.FAMILY_AUTH_API.withRecovery(operation, {
    supabase: current.supabase,
    userId: current.session.user.id,
    isCurrent: () => {
      const latest = context();
      return latest?.supabase === current.supabase && latest.session.user.id === current.session.user.id;
    },
  });
  const waitContext = async () => {
    for (let i = 0; i < 80; i += 1) {
      const current = context();
      if (current) return current;
      if (typeof state !== 'undefined' && state.authReady && !state.session) return null;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  let allowed = false;
  let data = { stats: {}, users: [], households: [] };
  let mode = 'users';
  let query = '';
  let loadId = 0;

  const syncColumns = () => {
    const count = [...nav.querySelectorAll('.view-tab')].filter((button) => !button.hidden).length;
    nav.style.gridTemplateColumns = `repeat(${Math.max(1, count)}, minmax(0, 1fr))`;
  };
  const setAllowed = (value) => {
    allowed = Boolean(value);
    tab.hidden = !allowed;
    syncColumns();
    if (!allowed && !view.hidden && typeof switchView === 'function') switchView('settings');
  };
  const verify = async (current) => {
    if (!current) return false;
    try {
      const { data: result, error } = await withAuthRecovery(() => current.supabase.rpc('is_platform_admin'), current);
      if (error) throw error;
      return result === true;
    } catch (error) {
      return missingMigration(error) && email(current.session) === ADMIN_EMAIL;
    }
  };

  const userText = (user) => [user.name, user.email, user.provider, ...arr(user.households).flatMap((group) => [group.name, group.role])].join(' ').toLowerCase();
  const groupText = (group) => [group.name, ...arr(group.members).flatMap((member) => [member.name, member.email, member.role])].join(' ').toLowerCase();
  const empty = (message) => `<div class="global-admin-empty">${esc(message)}</div>`;

  const userHtml = (user) => {
    const groups = arr(user.households);
    const groupNames = groups.length ? groups.map((group) => group.name || '이름 없는 그룹').join(', ') : '가족 그룹 미가입';
    const name = user.name || '이름 미등록';
    return `<article class="global-admin-user">
      <span class="global-admin-avatar" aria-hidden="true">${esc((name || user.email || '?').slice(0, 1).toUpperCase())}</span>
      <div class="global-admin-user-copy"><strong>${esc(name)}</strong><span>${esc(user.email || '이메일 없음')}</span><small>${esc(provider(user.provider))} · ${esc(groupNames)}</small></div>
      <div class="global-admin-user-status"><b class="${groups.length ? 'connected' : ''}">${groups.length ? '그룹 연결' : '미가입'}</b><small>최근 ${esc(formatDate(user.last_sign_in_at, true))}</small></div>
    </article>`;
  };

  const groupHtml = (group) => {
    const members = arr(group.members);
    const memberHtml = members.length ? members.map((member) => `<div class="global-admin-member">
      <div><strong>${esc(member.name || '이름 미등록')}</strong><span>${esc(member.email || '이메일 없음')}</span></div>
      <em class="${member.role === 'owner' ? 'owner' : ''}">${member.role === 'owner' ? '그룹 관리자' : '구성원'}</em>
    </div>`).join('') : empty('연결된 사용자가 없어요.');
    return `<article class="global-admin-household">
      <div class="global-admin-household-head"><div><strong>${esc(group.name || '이름 없는 가족 그룹')}</strong><span>${esc(formatDate(group.created_at))} 생성</span></div><b>${members.length}명</b></div>
      <div class="global-admin-metrics"><span><strong>${esc(group.baby_count || 0)}</strong>아이</span><span><strong>${esc(group.event_count || 0)}</strong>일정</span><span><strong>${esc(group.growth_count || 0)}</strong>성장 기록</span></div>
      <div class="global-admin-members">${memberHtml}</div>
    </article>`;
  };

  const renderLists = () => {
    const needle = query.trim().toLowerCase();
    const users = arr(data.users).filter((user) => !needle || userText(user).includes(needle));
    const groups = arr(data.households).filter((group) => !needle || groupText(group).includes(needle));
    $('[data-admin-count="users"]').textContent = `${users.length}명`;
    $('[data-admin-count="households"]').textContent = `${groups.length}개`;
    $('[data-admin-users]').innerHTML = users.length ? users.map(userHtml).join('') : empty('검색 조건에 맞는 사용자가 없어요.');
    $('[data-admin-households]').innerHTML = groups.length ? groups.map(groupHtml).join('') : empty('검색 조건에 맞는 가족 그룹이 없어요.');
  };

  const setMode = (next) => {
    mode = next === 'households' ? 'households' : 'users';
    view.querySelectorAll('[data-admin-mode]').forEach((button) => {
      const active = button.dataset.adminMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    view.querySelectorAll('[data-admin-section]').forEach((section) => { section.hidden = section.dataset.adminSection !== mode; });
  };

  const render = (result) => {
    data = { stats: result?.stats || {}, users: arr(result?.users), households: arr(result?.households) };
    ['users', 'households', 'ungrouped_users', 'active_30d'].forEach((key) => { $(`[data-stat="${key}"]`).textContent = String(data.stats[key] || 0); });
    renderLists();
    setMode(mode);
    $('[data-admin-loading]').hidden = true;
    $('[data-admin-error]').hidden = true;
    $('[data-admin-content]').hidden = false;
  };

  const showError = (error) => {
    const missing = missingMigration(error);
    $('[data-admin-error-title]').textContent = missing ? '관리자 DB 설정이 아직 적용되지 않았어요.' : '전체 사용자 정보를 불러오지 못했어요.';
    $('[data-admin-error-copy]').textContent = missing ? 'Supabase에 20260801_platform_user_admin.sql을 실행해 주세요.' : '권한 또는 네트워크 상태를 확인해 주세요.';
    $('[data-admin-loading]').hidden = true;
    $('[data-admin-content]').hidden = true;
    $('[data-admin-error]').hidden = false;
  };

  const load = async (announce = false) => {
    const id = ++loadId;
    const refresh = $('[data-admin-refresh]');
    refresh.disabled = true;
    refresh.textContent = '불러오는 중…';
    $('[data-admin-loading]').hidden = false;
    $('[data-admin-content]').hidden = true;
    $('[data-admin-error]').hidden = true;
    const current = await waitContext();
    if (id !== loadId) return;
    if (!(await verify(current))) {
      setAllowed(false);
      refresh.disabled = false;
      refresh.textContent = '새로고침';
      return;
    }
    setAllowed(true);
    try {
      const { data: result, error } = await withAuthRecovery(() => current.supabase.rpc('get_global_admin_overview'), current);
      if (error) throw error;
      if (id === loadId) render(result || {});
    } catch (error) {
      console.error('앱 전체 관리자 조회 실패', error);
      if (id === loadId) showError(error);
      if (announce && typeof toast === 'function') toast('전체 사용자 정보를 불러오지 못했어요');
    } finally {
      if (id === loadId) { refresh.disabled = false; refresh.textContent = '새로고침'; }
    }
  };

  const installView = () => {
    if (typeof switchView !== 'function') return false;
    if (switchView.__familyAdminInstalled) return true;
    const previous = switchView;
    const enhanced = function (requested) {
      if (requested !== VIEW) { view.hidden = true; return previous(requested); }
      if (!allowed) return;
      previous('calendar');
      if (typeof state !== 'undefined') state.activeView = VIEW;
      try { localStorage.setItem(ACTIVE_VIEW_KEY, VIEW); } catch { /* current screen only */ }
      ['calendarView', 'growthView', 'englishView', 'privateView', 'featureRequestView', 'settingsView'].forEach((id) => {
        const target = document.getElementById(id);
        if (target) target.hidden = true;
      });
      view.hidden = false;
      document.querySelectorAll('.view-tab').forEach((button) => {
        const active = button.dataset.view === VIEW;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
      });
      const add = document.querySelector('#addEventButton');
      if (add) add.hidden = true;
      load();
    };
    Object.keys(previous).forEach((key) => { try { enhanced[key] = previous[key]; } catch { /* readonly */ } });
    enhanced.__familyAdminInstalled = true;
    switchView = enhanced;
    return true;
  };

  const restore = (attempt = 0) => {
    if (!installView()) { if (attempt < 50) setTimeout(() => restore(attempt + 1), 100); return; }
    let saved = null;
    try { saved = localStorage.getItem(ACTIVE_VIEW_KEY); } catch { /* default */ }
    waitContext().then(async (current) => {
      setAllowed(await verify(current));
      if (saved === VIEW && allowed && typeof switchView === 'function') switchView(VIEW);
    });
  };

  tab.addEventListener('click', () => { if (allowed && typeof switchView === 'function') switchView(VIEW); });
  $('[data-admin-refresh]').addEventListener('click', () => load(true));
  $('[data-admin-search]').addEventListener('input', (event) => { query = event.target.value || ''; renderLists(); });
  $('.global-admin-modes').addEventListener('click', (event) => {
    const button = event.target.closest('[data-admin-mode]');
    if (button) setMode(button.dataset.adminMode);
  });
  view.addEventListener('click', (event) => {
    const button = event.target.closest('[data-admin-collapse]');
    if (!button || !view.contains(button)) return;
    const card = button.closest('.settings-card');
    const body = document.getElementById(button.getAttribute('aria-controls'));
    if (!card || !body) return;
    const expanded = card.dataset.adminCollapsed === 'true';
    if (expanded) {
      view.querySelectorAll('.settings-card[data-admin-collapsed="false"]').forEach((otherCard) => {
        if (otherCard === card) return;
        otherCard.dataset.adminCollapsed = 'true';
        const otherButton = otherCard.querySelector('[data-admin-collapse]');
        const otherBody = otherButton ? document.getElementById(otherButton.getAttribute('aria-controls')) : null;
        if (otherBody) otherBody.hidden = true;
        if (otherButton) {
          otherButton.setAttribute('aria-expanded', 'false');
          otherButton.textContent = '펼치기';
        }
      });
    }
    card.dataset.adminCollapsed = String(!expanded);
    body.hidden = !expanded;
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? '접기' : '펼치기';
  });
  new MutationObserver(syncColumns).observe(nav, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  syncColumns();
  restore();

  if (!document.querySelector('script[data-admin-operations-module]')) {
    const operationsScript = document.createElement('script');
    operationsScript.src = 'admin-ops.js?v=20260830-auth-recovery-v2';
    operationsScript.dataset.adminOperationsModule = '';
    document.head.appendChild(operationsScript);
  }
})();
