(() => {
  if (document.querySelector('[data-theme-settings-module]')) return;

  const VIEW_NAME = 'settings';
  const ACTIVE_VIEW_STORAGE_KEY = 'family-active-view-v1';
  const THEME_STORAGE_KEY = 'family-theme-v1';
  const DEFAULT_THEME = 'forest';
  const THEMES = [
    {
      id: 'forest',
      name: '포근한 숲',
      description: '지금의 차분한 초록과 크림 톤',
      themeColor: '#fff8f3',
      preview: ['#fff8f3', '#fffefd', '#56796a', '#c98291', '#38443e'],
    },
    {
      id: 'sunshine',
      name: '햇살 크림',
      description: '따뜻한 베이지와 골드 포인트',
      themeColor: '#fffaf0',
      preview: ['#fffaf0', '#fffdf7', '#b77a3f', '#d9974d', '#4a4033'],
    },
    {
      id: 'rose',
      name: '로즈 가든',
      description: '부드러운 핑크와 말린 장미 톤',
      themeColor: '#fff5f7',
      preview: ['#fff5f7', '#fffdfd', '#a86d82', '#d27e9a', '#4b3940'],
    },
    {
      id: 'ocean',
      name: '맑은 바다',
      description: '깨끗한 하늘색과 청록 포인트',
      themeColor: '#f3f9fb',
      preview: ['#f3f9fb', '#fcfeff', '#4f8497', '#76a8b8', '#33454d'],
    },
    {
      id: 'night',
      name: '별빛 밤',
      description: '눈부심을 줄인 짙은 다크 테마',
      themeColor: '#151a20',
      preview: ['#151a20', '#20262d', '#86b6a2', '#d38ca4', '#f1eee8'],
    },
  ];

  const main = document.querySelector('.app-shell main');
  const navigation = document.querySelector('.view-tabs');
  if (!main || !navigation) return;

  const validTheme = (value) => THEMES.some((theme) => theme.id === value) ? value : DEFAULT_THEME;
  const storedTheme = () => {
    try { return validTheme(localStorage.getItem(THEME_STORAGE_KEY)); }
    catch { return DEFAULT_THEME; }
  };

  let tab = navigation.querySelector(`[data-view="${VIEW_NAME}"]`);
  if (!tab) {
    tab = document.createElement('button');
    tab.className = 'view-tab';
    tab.dataset.view = VIEW_NAME;
    tab.type = 'button';
    tab.textContent = '설정';
    navigation.appendChild(tab);
  }

  const view = document.createElement('div');
  view.id = 'settingsView';
  view.className = 'settings-view';
  view.dataset.themeSettingsModule = '';
  view.hidden = true;
  view.innerHTML = `
    <section class="settings-card" aria-labelledby="themeSettingsTitle">
      <div class="settings-heading">
        <span class="settings-mark" aria-hidden="true">◐</span>
        <div>
          <p class="eyebrow">APPEARANCE</p>
          <h2 id="themeSettingsTitle">화면 테마</h2>
          <span>가족 공간의 분위기를 취향에 맞게 바꿔보세요.</span>
        </div>
      </div>
      <div class="theme-option-grid" role="radiogroup" aria-label="화면 테마 선택">
        ${THEMES.map((theme) => `
          <button class="theme-option" type="button" data-theme-option="${theme.id}" role="radio" aria-checked="false"
            style="--preview-bg:${theme.preview[0]};--preview-surface:${theme.preview[1]};--preview-accent:${theme.preview[2]};--preview-highlight:${theme.preview[3]};--preview-text:${theme.preview[4]}">
            <span class="theme-preview" aria-hidden="true">
              <i class="theme-preview-header"></i>
              <i class="theme-preview-card"></i>
              <i class="theme-preview-accent"></i>
              <i class="theme-preview-highlight"></i>
            </span>
            <span class="theme-option-copy">
              <strong>${theme.name}</strong>
              <small>${theme.description}</small>
            </span>
            <i class="theme-check" aria-hidden="true">✓</i>
          </button>
        `).join('')}
      </div>
      <div class="theme-save-note">
        <span aria-hidden="true">✓</span>
        <p><strong>선택한 테마는 자동 저장돼요</strong><small>이 기기에서 다음 방문에도 그대로 적용됩니다.</small></p>
      </div>
    </section>
  `;
  main.appendChild(view);

  const currentThemeLabel = document.createElement('span');
  currentThemeLabel.className = 'settings-current-theme';
  currentThemeLabel.setAttribute('aria-live', 'polite');
  view.querySelector('.settings-heading').appendChild(currentThemeLabel);

  const updateControls = (themeId) => {
    const selected = THEMES.find((theme) => theme.id === themeId) || THEMES[0];
    view.querySelectorAll('[data-theme-option]').forEach((button) => {
      const active = button.dataset.themeOption === selected.id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
    currentThemeLabel.textContent = `현재 · ${selected.name}`;
  };

  const applyTheme = (themeId, { persist = true, announce = false } = {}) => {
    const selectedId = validTheme(themeId);
    const selected = THEMES.find((theme) => theme.id === selectedId) || THEMES[0];
    document.documentElement.dataset.familyTheme = selected.id;
    document.documentElement.style.colorScheme = selected.id === 'night' ? 'dark' : 'light';
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = selected.themeColor;
    if (persist) {
      try { localStorage.setItem(THEME_STORAGE_KEY, selected.id); } catch { /* 현재 화면에는 적용 */ }
    }
    updateControls(selected.id);
    window.dispatchEvent(new CustomEvent('familythemechange', { detail: { theme: selected.id } }));
    if (announce && typeof toast === 'function') toast(`${selected.name} 테마로 바꿨어요 🎨`);
  };

  const installSettingsView = () => {
    if (typeof switchView !== 'function') return false;
    if (switchView.__themeSettingsInstalled) return true;

    const previousSwitchView = switchView;
    const enhancedSwitchView = function (requestedView) {
      const settingsView = document.querySelector('#settingsView');
      const addButton = document.querySelector('#addEventButton');

      if (requestedView !== VIEW_NAME) {
        if (settingsView) settingsView.hidden = true;
        return previousSwitchView(requestedView);
      }

      previousSwitchView('calendar');
      if (typeof state !== 'undefined') state.activeView = VIEW_NAME;
      try { localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, VIEW_NAME); } catch { /* 현재 화면만 유지 */ }

      ['calendarView', 'growthView', 'englishView', 'privateView', 'featureRequestView'].forEach((id) => {
        const target = document.getElementById(id);
        if (target) target.hidden = true;
      });
      if (settingsView) settingsView.hidden = false;
      document.querySelectorAll('.view-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.view === VIEW_NAME);
      });
      if (addButton) addButton.hidden = true;
    };

    Object.keys(previousSwitchView).forEach((key) => {
      try { enhancedSwitchView[key] = previousSwitchView[key]; } catch { /* 읽기 전용 속성은 건너뜀 */ }
    });
    enhancedSwitchView.__themeSettingsInstalled = true;
    switchView = enhancedSwitchView;
    return true;
  };

  const restoreSettingsView = (attempt = 0) => {
    if (!installSettingsView()) {
      if (attempt < 40) setTimeout(() => restoreSettingsView(attempt + 1), 100);
      return;
    }
    let savedView = null;
    try { savedView = localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY); } catch { /* 기본 탭 유지 */ }
    if (savedView === VIEW_NAME) switchView(VIEW_NAME);
  };

  view.addEventListener('click', (event) => {
    const option = event.target.closest('[data-theme-option]');
    if (!option) return;
    applyTheme(option.dataset.themeOption, { announce: true });
  });

  tab.addEventListener('click', () => {
    if (typeof switchView === 'function') switchView(VIEW_NAME);
  });

  applyTheme(storedTheme(), { persist: false });
  restoreSettingsView();
})();
