(() => {
  if (document.documentElement.dataset.tabEmojisModule === 'ready') return;
  document.documentElement.dataset.tabEmojisModule = 'ready';

  const labels = {
    calendar: ['🗓️', '일정'],
    growth: ['🌱', '성장'],
    english: ['📖', '동화'],
    'feature-request': ['💡', '요청'],
    settings: ['⚙️', '설정'],
    admin: ['👑', '관리'],
  };
  let shouldRestoreAdmin = false;
  try {
    shouldRestoreAdmin = localStorage.getItem('family-active-view-v1') === 'admin';
  } catch { /* 저장소 접근이 막히면 기본 탭 사용 */ }

  const navigation = document.querySelector('.view-tabs');
  if (!navigation) return;
  navigation.setAttribute('role', 'tablist');

  const applyLabels = () => {
    navigation.querySelectorAll('.view-tab[data-view]').forEach((tab) => {
      const label = labels[tab.dataset.view];
      if (label) {
        const [icon, text] = label;
        const iconNode = tab.querySelector(':scope > .view-tab-icon');
        const labelNode = tab.querySelector(':scope > .view-tab-label');
        if (!iconNode || !labelNode || iconNode.textContent !== icon || labelNode.textContent !== text) {
          tab.replaceChildren();
          const nextIcon = document.createElement('span');
          nextIcon.className = 'view-tab-icon';
          nextIcon.setAttribute('aria-hidden', 'true');
          nextIcon.textContent = icon;
          const nextLabel = document.createElement('span');
          nextLabel.className = 'view-tab-label';
          nextLabel.textContent = text;
          tab.append(nextIcon, nextLabel);
        }
        tab.setAttribute('aria-label', text);
      }
      const active = tab.classList.contains('active');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(active));
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
  };

  applyLabels();
  new MutationObserver(applyLabels).observe(navigation, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  const loadModule = (name, src, errorMessage) => {
    if (document.querySelector(`script[data-module="${name}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.dataset.module = name;
    script.async = false;
    script.onerror = () => console.error(errorMessage);
    document.body.appendChild(script);
  };

  const restorePersistedAdminView = (attempt = 0) => {
    if (!shouldRestoreAdmin) return;
    const adminTab = navigation.querySelector('.view-tab[data-view="admin"]');
    const ready = adminTab && !adminTab.hidden
      && typeof switchView === 'function'
      && switchView.__familyAdminInstalled;
    if (ready) {
      shouldRestoreAdmin = false;
      switchView('admin');
      return;
    }
    if (attempt < 120) setTimeout(() => restorePersistedAdminView(attempt + 1), 100);
  };

  loadModule('english-story-name', 'english-story-name.js?v=20260801-v1', '영어동화 이름 편집 모듈을 불러오지 못했어요.');
  loadModule('family-admin', 'family-admin.js?v=20260804-dashboard-v1', '가족 관리자 모듈을 불러오지 못했어요.');
  loadModule('admin-resource-usage', 'admin-resource-usage.js?v=20260804-dashboard-v1', 'Supabase 사용량 관리자 모듈을 불러오지 못했어요.');
  loadModule('platform-request-admin', 'platform-request-admin.js?v=20260804-dashboard-v1', '플랫폼 요청 관리자 모듈을 불러오지 못했어요.');
  loadModule('activity-log', 'activity-log.js?v=20260803-settings-disclosure-v1', '최근 활동 기록 모듈을 불러오지 못했어요.');
  loadModule('admin-recent-activity', 'admin-recent-activity.js?v=20260804-dashboard-v1', '최근 활동 관리자 모듈을 불러오지 못했어요.');
  restorePersistedAdminView();
})();
