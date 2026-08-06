(() => {
  if (document.querySelector('[data-theme-settings-module]')) return;

  const VIEW_NAME = 'settings';
  const ACTIVE_VIEW_STORAGE_KEY = 'family-active-view-v1';
  const THEME_STORAGE_KEY = 'family-theme-v1';
  const THEME_CHOICE_STORAGE_KEY = 'family-theme-choice-v1';
  const DEMO_THEME_STORAGE_KEY = 'family-demo-theme-v1';
  const DEMO_THEME_CHOICE_STORAGE_KEY = 'family-demo-theme-choice-v1';
  const demoMode = window.FAMILY_DEMO_MODE === true;
  const activeThemeStorageKey = demoMode ? DEMO_THEME_STORAGE_KEY : THEME_STORAGE_KEY;
  const activeThemeChoiceStorageKey = demoMode ? DEMO_THEME_CHOICE_STORAGE_KEY : THEME_CHOICE_STORAGE_KEY;
  const DEFAULT_THEME = 'white';
  const THEMES = [
    {
      id: 'white',
      name: '화이트',
      description: '깨끗한 화이트와 차콜 포인트',
      themeColor: '#f7f7f5',
      colorScheme: 'light',
      preview: ['#f7f7f5', '#ffffff', '#202124', '#aeb4ba', '#1b1d1f'],
    },
    {
      id: 'black',
      cssTheme: 'night',
      name: '다크',
      description: '깊은 블랙과 다크 그레이의 모던한 톤',
      themeColor: '#050505',
      colorScheme: 'dark',
      preview: ['#050505', '#151515', '#d8d8d8', '#7f858c', '#f5f5f5'],
    },
  ];
  const AVAILABLE_THEMES = THEMES;

  const main = document.querySelector('.app-shell main');
  const navigation = document.querySelector('.view-tabs');
  if (!main || !navigation) return;

  const validTheme = (value) => AVAILABLE_THEMES.some((theme) => theme.id === value) ? value : DEFAULT_THEME;
  const storedTheme = () => {
    try {
      const storedChoice = localStorage.getItem(activeThemeChoiceStorageKey);
      const storedThemeId = localStorage.getItem(activeThemeStorageKey);
      return validTheme(storedChoice || storedThemeId);
    } catch { return DEFAULT_THEME; }
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
          <p class="eyebrow">화면 꾸미기</p>
          <h2 id="themeSettingsTitle">화면 테마</h2>
          <span>가족 공간의 분위기를 취향에 맞게 바꿔보세요.</span>
        </div>
      </div>
      <div class="theme-option-grid" role="radiogroup" aria-label="화면 테마 선택">
        ${AVAILABLE_THEMES.map((theme) => `
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
    const selected = AVAILABLE_THEMES.find((theme) => theme.id === themeId) || AVAILABLE_THEMES[0];
    view.querySelectorAll('[data-theme-option]').forEach((button) => {
      const active = button.dataset.themeOption === selected.id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
    currentThemeLabel.textContent = `현재 · ${selected.name}`;
  };

  const applyTheme = (themeId, { persist = true, announce = false } = {}) => {
    const selectedId = validTheme(themeId);
    const selected = AVAILABLE_THEMES.find((theme) => theme.id === selectedId) || AVAILABLE_THEMES[0];
    const cssTheme = selected.cssTheme || selected.id;
    document.documentElement.dataset.familyTheme = cssTheme;
    document.documentElement.dataset.familyThemeChoice = selected.id;
    document.documentElement.style.colorScheme = selected.colorScheme || (cssTheme === 'night' ? 'dark' : 'light');
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = selected.themeColor;
    if (persist) {
      try {
        localStorage.setItem(activeThemeStorageKey, selected.id);
        localStorage.setItem(activeThemeChoiceStorageKey, selected.id);
      } catch { /* 현재 화면에는 적용 */ }
    }
    updateControls(selected.id);
    window.dispatchEvent(new CustomEvent('familythemechange', { detail: { theme: selected.id, cssTheme } }));
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

      ['calendarView', 'growthView', 'englishView', 'privateView', 'featureRequestView', 'guideView'].forEach((id) => {
        const target = document.getElementById(id);
        if (target) target.hidden = true;
      });
      if (settingsView) settingsView.hidden = false;
      document.querySelectorAll('.view-tab').forEach((button) => {
        const active = button.dataset.view === VIEW_NAME;
        button.classList.toggle('active', active);
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(active));
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
