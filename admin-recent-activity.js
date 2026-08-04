(() => {
  if (document.documentElement.dataset.adminRecentActivityModule === 'ready') return;
  document.documentElement.dataset.adminRecentActivityModule = 'ready';

  const ACTIVITY_LABELS = {
    session_open: '앱 실행',
    session_resume: '앱 다시 열기',
    view_open: '화면 열람',
    record_saved: '기록 저장',
  };
  const FEATURE_LABELS = {
    app: '앱',
    calendar: '일정',
    growth: '성장',
    english: '동화',
    'feature-request': '기능 요청',
    settings: '설정',
    admin: '관리자',
  };
  const RANGE_DAYS = { '1': 1, '7': 7, '30': 30 };
  const MAX_CHART_USERS = 8;

  let activities = [];
  let loadId = 0;
  let searchTimer = null;
  let adminAllowed = false;

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

  const formatTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
  };

  const relativeTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.round(hours / 24)}일 전`;
  };

  const missingMigration = (error) => error?.code === '42883' || /list_platform_recent_activity|app_activity_logs|schema cache/i.test(error?.message || '');

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

  const injectStyle = () => {
    if (document.querySelector('style[data-admin-recent-activity-style]')) return;
    const style = document.createElement('style');
    style.dataset.adminRecentActivityStyle = '';
    style.textContent = `
      .admin-recent-card[hidden] { display: none !important; }
      .admin-recent-card { margin-top: 16px; }
      .admin-recent-heading { grid-template-columns: 44px minmax(0, 1fr) auto; }
      .admin-recent-heading .admin-card-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
      .admin-recent-heading .admin-refresh-button { align-self: start; }
      .admin-recent-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
      .admin-recent-summary div { padding: 11px 8px; border: 1px solid var(--separator); border-radius: 14px; background: rgba(var(--theme-accent-rgb), .055); text-align: center; }
      .admin-recent-summary strong, .admin-recent-summary span { display: block; }
      .admin-recent-summary strong { color: var(--label); font-size: 18px; }
      .admin-recent-summary span { margin-top: 3px; color: var(--secondary); font-size: 9px; }
      .admin-user-chart { margin-bottom: 12px; padding: 13px; border: 1px solid var(--separator); border-radius: 16px; background: rgba(var(--theme-accent-rgb), .035); }
      .admin-user-chart-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 11px; }
      .admin-user-chart-heading strong { color: var(--label); font-size: 12px; }
      .admin-user-chart-heading span { color: var(--tertiary); font-size: 8px; white-space: nowrap; }
      .admin-user-chart-list { display: grid; gap: 10px; }
      .admin-user-chart-row { display: grid; grid-template-columns: minmax(72px, 112px) minmax(0, 1fr) auto; gap: 9px; align-items: center; }
      .admin-user-chart-label { min-width: 0; }
      .admin-user-chart-label strong, .admin-user-chart-label span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .admin-user-chart-label strong { color: var(--label); font-size: 10px; }
      .admin-user-chart-label span { margin-top: 2px; color: var(--tertiary); font-size: 7px; }
      .admin-user-chart-track { position: relative; height: 11px; overflow: hidden; border-radius: 999px; background: rgba(var(--theme-accent-rgb), .09); }
      .admin-user-chart-bar { display: block; width: var(--activity-width); height: 100%; min-width: 6px; border-radius: inherit; background: linear-gradient(90deg, rgba(var(--theme-accent-rgb), .48), rgba(var(--theme-accent-rgb), .92)); transition: width .28s ease; }
      .admin-user-chart-count { min-width: 25px; color: var(--label); font-size: 10px; font-variant-numeric: tabular-nums; text-align: right; }
      .admin-user-chart-more { margin: 9px 0 0; color: var(--tertiary); font-size: 8px; text-align: right; }
      .admin-user-chart-empty { padding: 8px 0 2px; color: var(--secondary); font-size: 9px; text-align: center; }
      .admin-recent-controls { display: grid; grid-template-columns: minmax(0, 1fr) minmax(100px, 140px); gap: 8px; margin-bottom: 12px; }
      .admin-recent-controls input, .admin-recent-controls select { width: 100%; min-height: 44px; border: 1px solid var(--separator); border-radius: 12px; color: var(--label); background: var(--surface); font: inherit; font-size: 11px; }
      .admin-recent-controls input { padding: 0 12px; }
      .admin-recent-controls select { padding: 0 32px 0 10px; }
      .admin-recent-list { display: grid; gap: 8px; }
      .admin-recent-item { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 11px; border: 1px solid var(--separator); border-radius: 15px; background: var(--surface); }
      .admin-recent-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; color: var(--blue); background: rgba(var(--theme-accent-rgb), .10); font-size: 15px; }
      .admin-recent-copy { min-width: 0; }
      .admin-recent-copy strong, .admin-recent-copy span, .admin-recent-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .admin-recent-copy strong { color: var(--label); font-size: 12px; }
      .admin-recent-copy span { margin-top: 3px; color: var(--secondary); font-size: 9px; }
      .admin-recent-copy small { margin-top: 3px; color: var(--tertiary); font-size: 8px; }
      .admin-recent-time { text-align: right; }
      .admin-recent-time strong, .admin-recent-time span { display: block; }
      .admin-recent-time strong { color: var(--secondary); font-size: 9px; }
      .admin-recent-time span { margin-top: 3px; color: var(--tertiary); font-size: 8px; }
      .admin-recent-empty, .admin-recent-error { padding: 22px 14px; border: 1px dashed var(--separator); border-radius: 15px; color: var(--secondary); text-align: center; font-size: 10px; line-height: 1.5; }
      .admin-recent-error strong, .admin-recent-error span { display: block; }
      .admin-recent-error strong { margin-bottom: 4px; color: var(--label); font-size: 12px; }
      .admin-recent-note { margin: 10px 2px 0; color: var(--tertiary); font-size: 9px; line-height: 1.45; }
      @media (max-width: 540px) {
        .admin-recent-heading { grid-template-columns: 44px minmax(0, 1fr); }
        .admin-recent-heading .admin-card-actions { grid-column: 1 / -1; justify-content: stretch; width: 100%; }
        .admin-recent-heading .admin-card-actions > * { flex: 1 1 0; width: 0; max-width: 100%; box-sizing: border-box; }
        .admin-recent-heading .admin-refresh-button { grid-column: 1 / -1; justify-self: stretch; width: 100%; max-width: 100%; box-sizing: border-box; }
        .admin-user-chart-row { grid-template-columns: minmax(64px, 92px) minmax(0, 1fr) auto; gap: 7px; }
        .admin-recent-controls { grid-template-columns: 1fr; }
        .admin-recent-item { grid-template-columns: 38px minmax(0, 1fr); }
        .admin-recent-time { grid-column: 2; display: flex; gap: 6px; text-align: left; }
      }
      @media (prefers-reduced-motion: reduce) {
        .admin-user-chart-bar { transition: none; }
      }
    `;
    document.head.appendChild(style);
  };

  const createSection = (adminView) => {
    let section = adminView.querySelector('[data-admin-recent-activity]');
    if (section) return section;
    section = document.createElement('section');
    section.className = 'settings-card admin-recent-card';
    section.dataset.adminRecentActivity = '';
    section.dataset.adminCollapsed = 'true';
    section.hidden = true;
    section.innerHTML = `
      <div class="settings-heading admin-recent-heading">
        <span class="settings-mark" aria-hidden="true">◷</span>
        <div>
          <p class="eyebrow">플랫폼 관리자 전용</p>
          <h2>최근 사용자 활동</h2>
          <span>앱 실행과 화면 이동 등 최소 활동 정보만 확인합니다.</span>
        </div>
        <div class="admin-card-actions">
          <button class="admin-refresh-button" type="button" data-admin-recent-refresh>새로고침</button>
          <button class="admin-card-toggle" type="button" data-admin-collapse aria-expanded="false" aria-controls="adminRecentDetails">펼치기</button>
        </div>
      </div>
      <div class="admin-recent-summary">
        <div><strong data-admin-recent-total>0</strong><span>조회 기간 활동</span></div>
        <div><strong data-admin-recent-users>0</strong><span>활동 사용자</span></div>
        <div><strong data-admin-recent-today>0</strong><span>오늘 활동</span></div>
      </div>
      <div class="admin-card-body" id="adminRecentDetails" data-admin-card-body hidden>
        <div class="admin-user-chart" data-admin-user-chart>
          <div class="admin-user-chart-heading">
            <strong>사용자별 활동</strong>
            <span>조회 기간 활동 횟수</span>
          </div>
          <div class="admin-user-chart-list" data-admin-user-chart-list>
            <div class="admin-user-chart-empty">활동을 불러오는 중이에요.</div>
          </div>
        </div>
        <div class="admin-recent-controls">
          <input type="search" data-admin-recent-search placeholder="사용자·이메일·가족 그룹 검색" aria-label="최근 활동 검색">
          <select data-admin-recent-range aria-label="최근 활동 기간">
            <option value="1">최근 24시간</option>
            <option value="7" selected>최근 7일</option>
            <option value="30">최근 30일</option>
          </select>
        </div>
        <div class="admin-recent-list" data-admin-recent-list><div class="admin-recent-empty">활동을 불러오는 중이에요.</div></div>
        <p class="admin-recent-note">일정 제목, 성장 수치, 메모, 사진 같은 실제 내용은 수집하지 않습니다.</p>
      </div>`;
    adminView.appendChild(section);
    return section;
  };

  const activityIcon = (activity) => {
    if (activity.activity_type === 'session_open') return '↗';
    if (activity.activity_type === 'session_resume') return '↻';
    if (activity.activity_type === 'record_saved') return '✓';
    return '◉';
  };

  const filteredActivities = (section) => {
    const query = section.querySelector('[data-admin-recent-search]').value.trim().toLocaleLowerCase('ko-KR');
    if (!query) return activities;
    return activities.filter((activity) => [activity.user_name, activity.user_email, activity.household_name, activity.feature_name]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('ko-KR').includes(query)));
  };

  const buildUserActivityRows = () => {
    const grouped = new Map();
    activities.forEach((activity) => {
      const key = activity.user_id || activity.user_email || `${activity.household_id || ''}:${activity.user_name || ''}`;
      const current = grouped.get(key) || {
        name: activity.user_name || activity.user_email || '이름 미등록',
        email: activity.user_email || '',
        count: 0,
      };
      current.count += 1;
      if (!current.name && activity.user_name) current.name = activity.user_name;
      if (!current.email && activity.user_email) current.email = activity.user_email;
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko-KR'));
  };

  const renderUserChart = (section) => {
    const chart = section.querySelector('[data-admin-user-chart-list]');
    const rows = buildUserActivityRows();
    if (!rows.length) {
      chart.innerHTML = '<div class="admin-user-chart-empty">조회 기간에 사용자 활동이 없어요.</div>';
      return;
    }

    const visibleRows = rows.slice(0, MAX_CHART_USERS);
    const maxCount = Math.max(...visibleRows.map((row) => row.count), 1);
    const rowMarkup = visibleRows.map((row) => {
      const width = Math.max(6, Math.round((row.count / maxCount) * 100));
      const detail = row.email && row.email !== row.name ? row.email : '이메일 없음';
      const label = `${row.name} ${row.count}회`;
      return `
        <div class="admin-user-chart-row" aria-label="${escapeHtml(label)}">
          <div class="admin-user-chart-label">
            <strong>${escapeHtml(row.name)}</strong>
            <span>${escapeHtml(detail)}</span>
          </div>
          <div class="admin-user-chart-track" aria-hidden="true">
            <span class="admin-user-chart-bar" style="--activity-width: ${width}%"></span>
          </div>
          <strong class="admin-user-chart-count">${row.count}</strong>
        </div>`;
    }).join('');
    const moreCount = rows.length - visibleRows.length;
    chart.innerHTML = `${rowMarkup}${moreCount > 0 ? `<p class="admin-user-chart-more">그 외 ${moreCount}명</p>` : ''}`;
  };

  const render = (section) => {
    const visible = filteredActivities(section);
    const uniqueUsers = new Set(activities.map((activity) => activity.user_id || activity.user_email)).size;
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const todayCount = activities.filter((activity) => {
      const date = new Date(activity.occurred_at);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` === todayKey;
    }).length;
    section.querySelector('[data-admin-recent-total]').textContent = String(activities.length);
    section.querySelector('[data-admin-recent-users]').textContent = String(uniqueUsers);
    section.querySelector('[data-admin-recent-today]').textContent = String(todayCount);
    renderUserChart(section);

    const list = section.querySelector('[data-admin-recent-list]');
    if (!visible.length) {
      list.innerHTML = '<div class="admin-recent-empty">조건에 맞는 최근 활동이 없어요.</div>';
      return;
    }
    list.innerHTML = visible.map((activity) => {
      const action = ACTIVITY_LABELS[activity.activity_type] || activity.activity_type;
      const feature = FEATURE_LABELS[activity.feature_name] || activity.feature_name;
      const name = activity.user_name || '이름 미등록';
      return `
        <article class="admin-recent-item">
          <span class="admin-recent-icon" aria-hidden="true">${activityIcon(activity)}</span>
          <div class="admin-recent-copy">
            <strong>${escapeHtml(name)} · ${escapeHtml(feature)} ${escapeHtml(action)}</strong>
            <span>${escapeHtml(activity.user_email || '이메일 없음')}</span>
            <small>${escapeHtml(activity.household_name || '가족 그룹 미가입')}</small>
          </div>
          <div class="admin-recent-time">
            <strong>${escapeHtml(relativeTime(activity.occurred_at))}</strong>
            <span>${escapeHtml(formatTime(activity.occurred_at))}</span>
          </div>
        </article>`;
    }).join('');
  };

  const showError = (section, error) => {
    const missing = missingMigration(error);
    section.querySelector('[data-admin-user-chart-list]').innerHTML = '<div class="admin-user-chart-empty">그래프를 불러오지 못했어요.</div>';
    section.querySelector('[data-admin-recent-list]').innerHTML = `
      <div class="admin-recent-error">
        <strong>${missing ? '최근 활동 DB 설정이 필요해요.' : '최근 활동을 불러오지 못했어요.'}</strong>
        <span>${missing ? '20260801_recent_activity_admin.sql을 Supabase SQL Editor에서 실행해 주세요.' : '잠시 후 다시 시도해 주세요.'}</span>
      </div>`;
  };

  const load = async (section) => {
    if (!adminAllowed) return;
    const context = await waitForContext();
    if (!context) return;
    const currentLoadId = ++loadId;
    const button = section.querySelector('[data-admin-recent-refresh]');
    const days = RANGE_DAYS[section.querySelector('[data-admin-recent-range]').value] || 7;
    button.disabled = true;
    button.textContent = '불러오는 중…';
    try {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await context.supabase.rpc('list_platform_recent_activity', {
        p_since_at: since,
        p_row_limit: 500,
      });
      if (currentLoadId !== loadId) return;
      if (error) throw error;
      activities = Array.isArray(data) ? data : [];
      render(section);
    } catch (error) {
      if (currentLoadId === loadId) showError(section, error);
    } finally {
      if (currentLoadId === loadId) {
        button.disabled = false;
        button.textContent = '새로고침';
      }
    }
  };

  const bind = (section) => {
    if (section.dataset.adminRecentBound === 'true') return;
    section.dataset.adminRecentBound = 'true';
    section.querySelector('[data-admin-recent-refresh]').addEventListener('click', () => load(section));
    section.querySelector('[data-admin-recent-range]').addEventListener('change', () => load(section));
    section.querySelector('[data-admin-recent-search]').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => render(section), 150);
    });
  };

  const initialize = async () => {
    injectStyle();
    const adminView = await waitForAdminView();
    if (!adminView) return;
    const section = createSection(adminView);
    bind(section);
    adminAllowed = await verifyAdmin();
    section.hidden = !adminAllowed;
    if (adminAllowed) load(section);
  };

  window.addEventListener('familycontextchange', () => {
    loadId += 1;
    activities = [];
    adminAllowed = false;
    initialize();
  });

  initialize();
})();
