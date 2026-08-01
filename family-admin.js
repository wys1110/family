(() => {
  if (document.querySelector('[data-family-admin-module]')) return;

  const VIEW_NAME = 'admin';
  const ACTIVE_VIEW_STORAGE_KEY = 'family-active-view-v1';
  const main = document.querySelector('.app-shell main');
  const navigation = document.querySelector('.view-tabs');
  if (!main || !navigation) return;

  let tab = navigation.querySelector(`[data-view="${VIEW_NAME}"]`);
  if (!tab) {
    tab = document.createElement('button');
    tab.className = 'view-tab';
    tab.dataset.view = VIEW_NAME;
    tab.type = 'button';
    tab.textContent = '관리자';
    tab.hidden = true;
    navigation.appendChild(tab);
  }

  const view = document.createElement('div');
  view.id = 'adminView';
  view.className = 'settings-view admin-view';
  view.dataset.familyAdminModule = '';
  view.hidden = true;
  view.innerHTML = `
    <section class="settings-card admin-family-card" aria-labelledby="adminFamilyTitle">
      <div class="settings-heading admin-family-heading">
        <span class="settings-mark" aria-hidden="true">♛</span>
        <div>
          <p class="eyebrow">관리자 전용</p>
          <h2 id="adminFamilyTitle">가족 그룹 구성</h2>
          <span>현재 가족 공간에 연결된 계정과 등록 정보를 확인하세요.</span>
        </div>
        <button class="admin-refresh-button" type="button" data-admin-refresh>새로고침</button>
      </div>
      <div class="admin-loading" data-admin-loading>가족 그룹을 확인하는 중이에요.</div>
      <div class="admin-content" data-admin-content hidden>
        <div class="admin-household-summary">
          <div class="admin-household-name">
            <span>가족 그룹</span>
            <strong data-admin-household-name>우리 가족</strong>
          </div>
          <div class="admin-stat-grid">
            <div><strong data-admin-member-count>0</strong><span>로그인 구성원</span></div>
            <div><strong data-admin-calendar-count>0</strong><span>캘린더 이름</span></div>
            <div><strong data-admin-baby-count>0</strong><span>등록된 아이</span></div>
          </div>
        </div>

        <section class="admin-group-section" aria-labelledby="adminLoginMembersTitle">
          <div class="admin-section-heading">
            <div><h3 id="adminLoginMembersTitle">로그인 구성원</h3><span>실제로 이 가족 그룹에 참여한 계정이에요.</span></div>
            <span class="admin-section-count" data-admin-login-count></span>
          </div>
          <div class="admin-member-list" data-admin-member-list></div>
          <p class="admin-privacy-note">개인정보 보호를 위해 다른 구성원의 이메일은 표시하지 않아요.</p>
        </section>

        <section class="admin-group-section" aria-labelledby="adminCalendarMembersTitle">
          <div class="admin-section-heading">
            <div><h3 id="adminCalendarMembersTitle">캘린더 구성</h3><span>일정과 할 일에서 사용하는 표시 이름이에요.</span></div>
          </div>
          <div class="admin-chip-list" data-admin-calendar-list></div>
        </section>

        <section class="admin-group-section" aria-labelledby="adminBabiesTitle">
          <div class="admin-section-heading">
            <div><h3 id="adminBabiesTitle">아이 프로필</h3><span>성장일기에 연결된 아이 목록이에요.</span></div>
          </div>
          <div class="admin-baby-list" data-admin-baby-list></div>
        </section>
      </div>
      <div class="admin-error" data-admin-error hidden>
        <strong>가족 그룹을 불러오지 못했어요.</strong>
        <span>잠시 후 새로고침해 주세요.</span>
      </div>
    </section>
  `;
  main.appendChild(view);

  if (!document.querySelector('style[data-family-admin-style]')) {
    const style = document.createElement('style');
    style.dataset.familyAdminStyle = '';
    style.textContent = `
      .admin-view[hidden] { display: none !important; }
      .admin-family-heading { grid-template-columns: 44px minmax(0, 1fr) auto; }
      .admin-family-heading .admin-refresh-button {
        align-self: start;
        min-height: 38px;
        padding: 0 12px;
        border: 1px solid var(--separator);
        border-radius: 12px;
        color: var(--blue);
        background: rgba(var(--theme-accent-rgb), .10);
        font: inherit;
        font-size: 11px;
        font-weight: 750;
      }
      .admin-family-heading .admin-refresh-button:disabled { opacity: .55; }
      .admin-loading, .admin-error {
        padding: 22px 16px;
        border: 1px dashed var(--separator);
        border-radius: 18px;
        color: var(--secondary);
        text-align: center;
        font-size: 13px;
      }
      .admin-error strong, .admin-error span { display: block; }
      .admin-error strong { color: var(--label); margin-bottom: 5px; }
      .admin-household-summary {
        padding: 16px;
        border: 1px solid var(--separator);
        border-radius: 20px;
        background: rgba(var(--theme-accent-rgb), .065);
      }
      .admin-household-name span, .admin-household-name strong { display: block; }
      .admin-household-name span { color: var(--secondary); font-size: 10px; font-weight: 750; }
      .admin-household-name strong { margin-top: 4px; color: var(--label); font-size: 20px; }
      .admin-stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
      .admin-stat-grid div {
        min-width: 0;
        padding: 11px 8px;
        border: 1px solid var(--separator);
        border-radius: 14px;
        background: var(--surface);
        text-align: center;
      }
      .admin-stat-grid strong, .admin-stat-grid span { display: block; }
      .admin-stat-grid strong { color: var(--label); font-size: 18px; }
      .admin-stat-grid span { margin-top: 3px; color: var(--secondary); font-size: 9px; line-height: 1.25; }
      .admin-group-section { margin-top: 20px; }
      .admin-section-heading { display: flex; gap: 12px; align-items: end; justify-content: space-between; margin-bottom: 10px; }
      .admin-section-heading h3 { margin: 0; color: var(--label); font-size: 15px; }
      .admin-section-heading div > span { display: block; margin-top: 3px; color: var(--secondary); font-size: 10px; line-height: 1.4; }
      .admin-section-count {
        flex: none;
        padding: 5px 8px;
        border-radius: 999px;
        color: var(--blue);
        background: rgba(var(--theme-accent-rgb), .10);
        font-size: 9px;
        font-weight: 750;
      }
      .admin-member-list { display: grid; gap: 8px; }
      .admin-member-item {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) auto;
        gap: 11px;
        align-items: center;
        min-height: 68px;
        padding: 10px 12px;
        border: 1px solid var(--separator);
        border-radius: 17px;
        background: var(--surface);
      }
      .admin-member-avatar {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border-radius: 14px;
        color: white;
        background: linear-gradient(145deg, var(--theme-hero-start), var(--theme-hero-end));
        font-size: 14px;
        font-weight: 800;
      }
      .admin-member-copy { min-width: 0; }
      .admin-member-copy strong, .admin-member-copy span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .admin-member-copy strong { color: var(--label); font-size: 13px; }
      .admin-member-copy span { margin-top: 4px; color: var(--secondary); font-size: 10px; }
      .admin-role-badge {
        padding: 6px 9px;
        border: 1px solid var(--separator);
        border-radius: 999px;
        color: var(--secondary);
        background: var(--surface-2);
        font-size: 9px;
        font-weight: 800;
      }
      .admin-role-badge.owner { color: var(--blue); background: rgba(var(--theme-accent-rgb), .11); }
      .admin-privacy-note { margin: 8px 2px 0; color: var(--tertiary); font-size: 9px; line-height: 1.4; }
      .admin-chip-list { display: flex; flex-wrap: wrap; gap: 8px; }
      .admin-calendar-chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 34px;
        padding: 0 11px;
        border: 1px solid var(--separator);
        border-radius: 999px;
        color: var(--label);
        background: var(--surface);
        font-size: 11px;
        font-weight: 700;
      }
      .admin-calendar-chip i { width: 9px; height: 9px; border-radius: 50%; background: var(--member-color, var(--blue)); }
      .admin-baby-list { display: grid; gap: 8px; }
      .admin-baby-item, .admin-empty-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 54px;
        padding: 10px 12px;
        border: 1px solid var(--separator);
        border-radius: 16px;
        background: var(--surface);
      }
      .admin-baby-item div strong, .admin-baby-item div span { display: block; }
      .admin-baby-item div strong { color: var(--label); font-size: 12px; }
      .admin-baby-item div span { margin-top: 3px; color: var(--secondary); font-size: 9px; }
      .admin-baby-item > span { color: var(--blue); font-size: 9px; font-weight: 800; }
      .admin-empty-item { justify-content: center; color: var(--secondary); font-size: 11px; }
      @media (max-width: 520px) {
        .admin-family-heading { grid-template-columns: 44px minmax(0, 1fr); }
        .admin-family-heading .admin-refresh-button { grid-column: 1 / -1; justify-self: stretch; }
      }
    `;
    document.head.appendChild(style);
  }

  const getFamilyContext = () => {
    if (typeof state === 'undefined' || !state.session || !state.household?.id) return null;
    return {
      supabase: state.supabase,
      session: state.session,
      household: state.household,
    };
  };

  const waitForFamilyContext = async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const context = getFamilyContext();
      if (context) return context;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  const sessionName = (session) => {
    const metadata = session?.user?.user_metadata || {};
    return String(metadata.full_name || metadata.name || metadata.user_name || session?.user?.email || '나').trim().slice(0, 80) || '나';
  };

  const formatJoinedAt = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '참여일 정보 없음';
    return `${new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date)} 참여`;
  };

  const formatBirthDate = (value) => {
    if (!value) return '생일 정보 없음';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '생일 정보 없음';
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  };

  const visibleBabies = () => {
    if (typeof state === 'undefined' || !Array.isArray(state.babies)) return [];
    return state.babies.filter((baby) => !baby?.archivedAt && !baby?.archived_at);
  };

  const visibleCalendarMembers = () => {
    if (typeof state === 'undefined' || !Array.isArray(state.familyMembers)) return [];
    return state.familyMembers;
  };

  const syncNavigationColumns = () => {
    const visibleTabs = [...navigation.querySelectorAll('.view-tab')].filter((button) => !button.hidden).length;
    navigation.style.gridTemplateColumns = `repeat(${Math.max(1, visibleTabs)}, minmax(0, 1fr))`;
  };

  let adminAllowed = false;
  let loadRequestId = 0;

  const setAdminAccess = (allowed) => {
    adminAllowed = Boolean(allowed);
    tab.hidden = !adminAllowed;
    syncNavigationColumns();
    if (!adminAllowed && !view.hidden && typeof switchView === 'function') switchView('settings');
  };

  const createMemberItem = (member, index, context) => {
    const current = member.user_id === context.session.user.id;
    const name = current ? sessionName(context.session) : (member.display_name || `가족 구성원 ${index + 1}`);
    const item = document.createElement('article');
    item.className = 'admin-member-item';

    const avatar = document.createElement('span');
    avatar.className = 'admin-member-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = name.slice(0, 1).toUpperCase();

    const copy = document.createElement('div');
    copy.className = 'admin-member-copy';
    const strong = document.createElement('strong');
    strong.textContent = current ? `${name} · 나` : name;
    const meta = document.createElement('span');
    meta.textContent = formatJoinedAt(member.created_at);
    copy.append(strong, meta);

    const role = document.createElement('span');
    role.className = `admin-role-badge${member.role === 'owner' ? ' owner' : ''}`;
    role.textContent = member.role === 'owner' ? '관리자' : '구성원';

    item.append(avatar, copy, role);
    return item;
  };

  const renderOverview = (context, members) => {
    const babies = visibleBabies();
    const calendarMembers = visibleCalendarMembers();
    view.querySelector('[data-admin-household-name]').textContent = context.household.name || '우리 가족';
    view.querySelector('[data-admin-member-count]').textContent = String(members.length);
    view.querySelector('[data-admin-calendar-count]').textContent = String(calendarMembers.length);
    view.querySelector('[data-admin-baby-count]').textContent = String(babies.length);
    view.querySelector('[data-admin-login-count]').textContent = `${members.length}명`;

    const memberList = view.querySelector('[data-admin-member-list]');
    memberList.replaceChildren(...members.map((member, index) => createMemberItem(member, index, context)));

    const calendarList = view.querySelector('[data-admin-calendar-list]');
    if (calendarMembers.length) {
      calendarList.replaceChildren(...calendarMembers.map((member) => {
        const chip = document.createElement('span');
        chip.className = 'admin-calendar-chip';
        const dot = document.createElement('i');
        dot.style.setProperty('--member-color', member.color || 'var(--blue)');
        const label = document.createElement('span');
        label.textContent = member.name || '가족';
        chip.append(dot, label);
        return chip;
      }));
    } else {
      const empty = document.createElement('div');
      empty.className = 'admin-empty-item';
      empty.textContent = '등록된 캘린더 이름이 없어요.';
      calendarList.replaceChildren(empty);
    }

    const babyList = view.querySelector('[data-admin-baby-list]');
    if (babies.length) {
      babyList.replaceChildren(...babies.map((baby) => {
        const item = document.createElement('article');
        item.className = 'admin-baby-item';
        const copy = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = baby.name || '이름 없는 아이';
        const birth = document.createElement('span');
        birth.textContent = formatBirthDate(baby.birthDate || baby.birth_date);
        copy.append(name, birth);
        const status = document.createElement('span');
        status.textContent = '활성 프로필';
        item.append(copy, status);
        return item;
      }));
    } else {
      const empty = document.createElement('div');
      empty.className = 'admin-empty-item';
      empty.textContent = '등록된 아이 프로필이 없어요.';
      babyList.replaceChildren(empty);
    }

    view.querySelector('[data-admin-loading]').hidden = true;
    view.querySelector('[data-admin-error]').hidden = true;
    view.querySelector('[data-admin-content]').hidden = false;
  };

  const demoMembers = (context) => [
    { user_id: context.session.user.id, role: 'owner', created_at: new Date().toISOString(), display_name: sessionName(context.session) },
    { user_id: 'demo-family-member', role: 'member', created_at: new Date(Date.now() - 86400000 * 7).toISOString(), display_name: '테스트 가족 구성원' },
  ];

  const loadOverview = async ({ announceError = false } = {}) => {
    const requestId = ++loadRequestId;
    const refreshButton = view.querySelector('[data-admin-refresh]');
    const loading = view.querySelector('[data-admin-loading]');
    const content = view.querySelector('[data-admin-content]');
    const errorBox = view.querySelector('[data-admin-error]');
    refreshButton.disabled = true;
    refreshButton.textContent = '불러오는 중…';
    loading.hidden = false;
    content.hidden = true;
    errorBox.hidden = true;

    const context = await waitForFamilyContext();
    if (requestId !== loadRequestId) return;
    if (!context) {
      setAdminAccess(false);
      loading.hidden = true;
      errorBox.hidden = false;
      refreshButton.disabled = false;
      refreshButton.textContent = '새로고침';
      return;
    }

    try {
      if (window.FAMILY_DEMO?.active) {
        const members = demoMembers(context);
        setAdminAccess(true);
        renderOverview(context, members);
        return;
      }

      if (!context.supabase) throw new Error('Supabase 연결 없음');
      const { data, error } = await context.supabase
        .from('household_members')
        .select('user_id, role, created_at')
        .eq('household_id', context.household.id)
        .order('role', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (requestId !== loadRequestId) return;

      const members = Array.isArray(data) ? data : [];
      const currentMembership = members.find((member) => member.user_id === context.session.user.id);
      setAdminAccess(currentMembership?.role === 'owner');
      if (!adminAllowed) return;
      renderOverview(context, members);
    } catch (error) {
      console.error('관리자 가족 그룹 조회 실패', error);
      setAdminAccess(false);
      loading.hidden = true;
      content.hidden = true;
      errorBox.hidden = false;
      if (announceError && typeof toast === 'function') toast('가족 그룹을 불러오지 못했어요');
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = '새로고침';
    }
  };

  const installView = () => {
    if (typeof switchView !== 'function') return false;
    if (switchView.__familyAdminInstalled) return true;

    const previousSwitchView = switchView;
    const enhancedSwitchView = function (requestedView) {
      if (requestedView !== VIEW_NAME) {
        view.hidden = true;
        return previousSwitchView(requestedView);
      }
      if (!adminAllowed) return;

      previousSwitchView('calendar');
      if (typeof state !== 'undefined') state.activeView = VIEW_NAME;
      try { localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, VIEW_NAME); } catch { /* 현재 화면만 유지 */ }

      ['calendarView', 'growthView', 'englishView', 'privateView', 'featureRequestView', 'settingsView'].forEach((id) => {
        const target = document.getElementById(id);
        if (target) target.hidden = true;
      });
      view.hidden = false;
      document.querySelectorAll('.view-tab').forEach((button) => {
        const active = button.dataset.view === VIEW_NAME;
        button.classList.toggle('active', active);
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(active));
      });
      const addButton = document.querySelector('#addEventButton');
      if (addButton) addButton.hidden = true;
      loadOverview();
    };

    Object.keys(previousSwitchView).forEach((key) => {
      try { enhancedSwitchView[key] = previousSwitchView[key]; } catch { /* 읽기 전용 속성은 건너뜀 */ }
    });
    enhancedSwitchView.__familyAdminInstalled = true;
    switchView = enhancedSwitchView;
    return true;
  };

  const restoreView = (attempt = 0) => {
    if (!installView()) {
      if (attempt < 40) setTimeout(() => restoreView(attempt + 1), 100);
      return;
    }
    let savedView = null;
    try { savedView = localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY); } catch { /* 기본 탭 유지 */ }
    loadOverview().then(() => {
      if (savedView === VIEW_NAME && adminAllowed && typeof switchView === 'function') switchView(VIEW_NAME);
    });
  };

  tab.addEventListener('click', () => {
    if (adminAllowed && typeof switchView === 'function') switchView(VIEW_NAME);
  });

  view.querySelector('[data-admin-refresh]').addEventListener('click', () => {
    loadOverview({ announceError: true });
  });

  new MutationObserver(syncNavigationColumns).observe(navigation, {
    childList: true,
    attributes: true,
    attributeFilter: ['hidden'],
  });

  syncNavigationColumns();
  restoreView();
})();
