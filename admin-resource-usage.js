(() => {
  if (document.documentElement.dataset.adminResourceUsageModule === 'ready') return;
  document.documentElement.dataset.adminResourceUsageModule = 'ready';

  const DEFAULT_LIMITS = {
    database: 500 * 1024 * 1024,
    storage: 1024 * 1024 * 1024,
  };

  let section = null;
  let adminView = null;
  let allowed = false;
  let loadId = 0;

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

  const configuredLimit = (key) => {
    const value = Number(window.FAMILY_CONFIG?.supabaseUsageLimits?.[key]);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_LIMITS[key];
  };

  const formatBytes = (value) => {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let amount = bytes / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && amount >= 1024; index += 1) {
      amount /= 1024;
      unit = units[index];
    }
    const digits = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
    return `${amount.toFixed(digits)} ${unit}`;
  };

  const formatTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const usageState = (percent) => {
    if (percent >= 90) return { label: '한도 임박', tone: 'critical' };
    if (percent >= 70) return { label: '사용량 주의', tone: 'warning' };
    return { label: '여유 있음', tone: 'normal' };
  };

  const missingMigration = (error) => error?.code === '42883'
    || /get_platform_resource_usage|schema cache/i.test(error?.message || '');

  const injectStyle = () => {
    if (document.querySelector('style[data-admin-resource-usage-style]')) return;
    const style = document.createElement('style');
    style.dataset.adminResourceUsageStyle = '';
    style.textContent = `
      .admin-resource-card[hidden] { display: none !important; }
      .admin-resource-card { margin-top: 16px; }
      .admin-resource-heading { grid-template-columns: 44px minmax(0, 1fr) auto; }
      .admin-resource-heading .admin-refresh-button { align-self: start; }
      .admin-resource-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .admin-resource-item { min-width: 0; padding: 14px; border: 1px solid var(--separator); border-radius: 18px; background: rgba(var(--theme-accent-rgb), .055); }
      .admin-resource-item-head { display: flex; align-items: start; justify-content: space-between; gap: 8px; }
      .admin-resource-item-head div { min-width: 0; }
      .admin-resource-item-head strong, .admin-resource-item-head span { display: block; }
      .admin-resource-item-head strong { color: var(--label); font-size: 13px; }
      .admin-resource-item-head span { margin-top: 3px; color: var(--secondary); font-size: 9px; }
      .admin-resource-badge { flex: none; padding: 5px 7px; border-radius: 999px; color: var(--blue); background: rgba(var(--theme-accent-rgb), .11); font-size: 8px; font-weight: 800; }
      .admin-resource-badge.warning { color: #a96a00; background: rgba(255, 174, 0, .13); }
      .admin-resource-badge.critical { color: #c94343; background: rgba(255, 69, 58, .13); }
      .admin-resource-value { display: flex; align-items: baseline; gap: 4px; margin-top: 14px; min-width: 0; }
      .admin-resource-value strong { overflow: hidden; color: var(--label); font-size: 21px; line-height: 1; text-overflow: ellipsis; white-space: nowrap; }
      .admin-resource-value span { flex: none; color: var(--secondary); font-size: 9px; }
      .admin-resource-track { height: 8px; margin-top: 12px; overflow: hidden; border-radius: 999px; background: var(--surface-2); }
      .admin-resource-track i { display: block; width: 0; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--theme-hero-start), var(--theme-hero-end)); transition: width .25s ease; }
      .admin-resource-track i.warning { background: #e6a11b; }
      .admin-resource-track i.critical { background: #dc5a55; }
      .admin-resource-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 7px; color: var(--tertiary); font-size: 8px; }
      .admin-resource-status { min-height: 42px; margin-top: 10px; padding: 12px; border: 1px dashed var(--separator); border-radius: 14px; color: var(--secondary); text-align: center; font-size: 10px; line-height: 1.45; }
      .admin-resource-status[hidden] { display: none !important; }
      .admin-resource-note { margin: 10px 2px 0; color: var(--tertiary); font-size: 9px; line-height: 1.45; }
      @media (max-width: 520px) {
        .admin-resource-heading { grid-template-columns: 44px minmax(0, 1fr); }
        .admin-resource-heading .admin-refresh-button { grid-column: 1 / -1; justify-self: stretch; }
      }
      @media (max-width: 360px) {
        .admin-resource-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  };

  const createSection = (view) => {
    const existing = view.querySelector('[data-admin-resource-usage]');
    if (existing) return existing;
    const next = document.createElement('section');
    next.className = 'settings-card admin-resource-card';
    next.dataset.adminResourceUsage = '';
    next.hidden = true;
    next.innerHTML = `
      <div class="settings-heading admin-resource-heading">
        <span class="settings-mark" aria-hidden="true">▤</span>
        <div>
          <p class="eyebrow">SUPABASE RESOURCE</p>
          <h2>Supabase 사용량</h2>
          <span>데이터베이스와 파일 Storage 사용량을 확인하세요.</span>
        </div>
        <button class="admin-refresh-button" type="button" data-resource-refresh>새로고침</button>
      </div>
      <div class="admin-resource-grid">
        <article class="admin-resource-item" data-resource="database">
          <div class="admin-resource-item-head"><div><strong>Database</strong><span>테이블·인덱스 포함</span></div><b class="admin-resource-badge" data-resource-badge>확인 중</b></div>
          <div class="admin-resource-value"><strong data-resource-used>—</strong><span data-resource-limit>/ 500 MB</span></div>
          <div class="admin-resource-track" role="progressbar" aria-label="Database 사용률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-resource-bar></i></div>
          <div class="admin-resource-meta"><span data-resource-percent>0%</span><span>Free 기준</span></div>
        </article>
        <article class="admin-resource-item" data-resource="storage">
          <div class="admin-resource-item-head"><div><strong>파일 Storage</strong><span data-storage-count>업로드 파일</span></div><b class="admin-resource-badge" data-resource-badge>확인 중</b></div>
          <div class="admin-resource-value"><strong data-resource-used>—</strong><span data-resource-limit>/ 1 GB</span></div>
          <div class="admin-resource-track" role="progressbar" aria-label="파일 Storage 사용률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-resource-bar></i></div>
          <div class="admin-resource-meta"><span data-resource-percent>0%</span><span>Free 기준</span></div>
        </article>
      </div>
      <div class="admin-resource-status" data-resource-status>사용량을 불러오는 중이에요.</div>
      <p class="admin-resource-note"><span data-resource-updated>마지막 갱신 전</span> · 과금 화면의 일별 집계와는 갱신 시점 차이가 있을 수 있어요.</p>`;
    const mainCard = view.querySelector('.global-admin-card');
    if (mainCard) mainCard.insertAdjacentElement('afterend', next);
    else view.prepend(next);
    return next;
  };

  const renderItem = (type, usedBytes) => {
    const item = section.querySelector(`[data-resource="${type}"]`);
    const limit = configuredLimit(type);
    const used = Math.max(0, Number(usedBytes) || 0);
    const percent = limit > 0 ? (used / limit) * 100 : 0;
    const stateInfo = usageState(percent);
    item.querySelector('[data-resource-used]').textContent = formatBytes(used);
    item.querySelector('[data-resource-limit]').textContent = `/ ${formatBytes(limit)}`;
    item.querySelector('[data-resource-percent]').textContent = `${percent.toFixed(percent >= 10 ? 0 : 1)}%`;
    const badge = item.querySelector('[data-resource-badge]');
    badge.textContent = stateInfo.label;
    badge.className = `admin-resource-badge ${stateInfo.tone === 'normal' ? '' : stateInfo.tone}`.trim();
    const bar = item.querySelector('[data-resource-bar]');
    bar.style.width = `${Math.min(100, percent)}%`;
    bar.className = stateInfo.tone === 'normal' ? '' : stateInfo.tone;
    const progress = item.querySelector('[role="progressbar"]');
    progress.setAttribute('aria-valuenow', String(Math.min(100, Math.round(percent))));
    progress.setAttribute('aria-valuetext', `${formatBytes(used)} / ${formatBytes(limit)}, ${percent.toFixed(1)}%`);
  };

  const render = (result) => {
    renderItem('database', result?.database_bytes);
    renderItem('storage', result?.storage_bytes);
    const count = Math.max(0, Number(result?.storage_object_count) || 0);
    section.querySelector('[data-storage-count]').textContent = `업로드 파일 ${count.toLocaleString('ko-KR')}개`;
    section.querySelector('[data-resource-updated]').textContent = `마지막 갱신 ${formatTime(result?.generated_at || new Date())}`;
    section.querySelector('[data-resource-status]').hidden = true;
  };

  const showError = (error) => {
    const status = section.querySelector('[data-resource-status]');
    status.hidden = false;
    status.textContent = missingMigration(error)
      ? 'DB 사용량 설정이 필요해요. Supabase SQL Editor에서 20260801_platform_resource_usage.sql을 실행해 주세요.'
      : 'Supabase 사용량을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
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

  const load = async (announce = false) => {
    if (!allowed || !section) return;
    const context = await waitForContext();
    if (!context) return;
    const currentLoadId = ++loadId;
    const button = section.querySelector('[data-resource-refresh]');
    button.disabled = true;
    button.textContent = '불러오는 중…';
    const status = section.querySelector('[data-resource-status]');
    status.hidden = false;
    status.textContent = '사용량을 불러오는 중이에요.';
    try {
      const { data, error } = await context.supabase.rpc('get_platform_resource_usage');
      if (error) throw error;
      if (currentLoadId === loadId) render(data || {});
    } catch (error) {
      console.error('Supabase 사용량 조회 실패', error);
      if (currentLoadId === loadId) showError(error);
      if (announce && typeof toast === 'function') toast('Supabase 사용량을 불러오지 못했어요');
    } finally {
      if (currentLoadId === loadId) {
        button.disabled = false;
        button.textContent = '새로고침';
      }
    }
  };

  const initialize = async () => {
    adminView = await waitForAdminView();
    if (!adminView) return;
    injectStyle();
    section = createSection(adminView);
    allowed = await verifyAdmin();
    section.hidden = !allowed;
    if (!allowed) return;

    section.querySelector('[data-resource-refresh]').addEventListener('click', () => load(true));
    adminView.querySelector('[data-admin-refresh]')?.addEventListener('click', () => load());
    new MutationObserver(() => {
      if (!adminView.hidden) load();
    }).observe(adminView, { attributes: true, attributeFilter: ['hidden'] });

    if (!adminView.hidden) load();
  };

  initialize();
})();
