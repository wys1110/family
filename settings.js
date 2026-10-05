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

  const searchTools = document.createElement('div');
  searchTools.className = 'settings-search-tools';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = '설정 검색';
  searchInput.setAttribute('aria-label', '설정 검색');
  searchInput.dataset.settingsSearchInput = '';
  const searchStatus = document.createElement('p');
  searchStatus.dataset.settingsSearchStatus = '';
  searchStatus.setAttribute('aria-live', 'polite');
  const resetSearch = document.createElement('button');
  resetSearch.type = 'button';
  resetSearch.textContent = '검색 초기화';
  resetSearch.hidden = true;
  resetSearch.dataset.settingsSearchReset = '';
  const searchJumps = document.createElement('div');
  searchJumps.className = 'settings-search-jumps';
  searchJumps.setAttribute('role', 'group');
  searchJumps.setAttribute('aria-label', '설정 항목 바로가기');
  searchJumps.dataset.settingsSearchJumps = '';
  searchTools.append(searchInput, searchStatus, resetSearch, searchJumps);
  view.insertBefore(searchTools, view.firstElementChild);

  let renderedMatches = [];
  const refreshSettingsSearch = () => {
    if (view.firstElementChild !== searchTools) view.insertBefore(searchTools, view.firstElementChild);
    const query = searchInput.value.trim().toLocaleLowerCase();
    const matches = [];
    [...view.querySelectorAll('.settings-card')].forEach((card) => {
      card.classList.remove('settings-search-hidden');
      if (card.hidden || (typeof getComputedStyle === 'function' && getComputedStyle(card).display === 'none')) return;
      const title = card.querySelector('h1, h2, h3, h4')?.textContent.trim() || '설정';
      const matched = !query || `${title} ${card.textContent}`.toLocaleLowerCase().includes(query);
      card.classList.toggle('settings-search-hidden', !matched);
      if (matched) matches.push({ card, title });
    });
    const status = query && !matches.length ? '검색 결과가 없어요 (0개). 검색어를 지워 다시 확인해 보세요.' : `${matches.length}개 설정 항목`;
    if (searchStatus.textContent !== status) searchStatus.textContent = status;
    const showReset = Boolean(query && !matches.length);
    if (resetSearch.hidden !== !showReset) resetSearch.hidden = !showReset;
    if (matches.length !== renderedMatches.length || matches.some((match, index) => match.card !== renderedMatches[index].card || match.title !== renderedMatches[index].title)) {
      searchJumps.textContent = '';
      matches.forEach(({ card, title }) => {
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.textContent = title;
        jump.addEventListener('click', () => {
          card.tabIndex = -1;
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          card.focus({ preventScroll: true });
        });
        searchJumps.appendChild(jump);
      });
      renderedMatches = matches;
    }
  };
  searchInput.addEventListener('input', refreshSettingsSearch);
  resetSearch.addEventListener('click', () => {
    searchInput.value = '';
    refreshSettingsSearch();
    searchInput.focus();
  });
  window.addEventListener('familycontextchange', refreshSettingsSearch);
  window.addEventListener('familybabychange', refreshSettingsSearch);
  if (typeof MutationObserver === 'function') {
    new MutationObserver((records) => {
      const outsideSearchClass = (value) => String(value || '').split(/\s+/).filter((name) => name && name !== 'settings-search-hidden').sort().join(' ');
      if (!records.length || records.some((record) => {
        const { target } = record;
        if (target === view) return true;
        if (!(target.closest?.('.settings-card') || target.matches?.('.settings-card'))) return false;
        return record.attributeName !== 'class' || outsideSearchClass(record.oldValue) !== outsideSearchClass(target.getAttribute('class'));
      })) refreshSettingsSearch();
    }).observe(view, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden', 'class', 'style'] });
  }
  refreshSettingsSearch();

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

      ['calendarView', 'growthView', 'englishView', 'privateView', 'featureRequestView'].forEach((id) => {
        const target = document.getElementById(id);
        if (target) target.hidden = true;
      });
      if (settingsView) settingsView.hidden = false;
      refreshSettingsSearch();
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
