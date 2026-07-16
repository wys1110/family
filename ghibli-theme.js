(() => {
  if (document.querySelector('[data-ghibli-theme-module]')) return;

  const THEME_ID = 'ghibli';
  const THEME_STORAGE_KEY = 'family-theme-v1';
  const THEME = {
    name: '지브리 감성 🌿',
    description: '푸른 하늘과 연초록 언덕이 어우러진 따뜻한 지브리풍 애니메이션 테마',
    themeColor: '#eaf3df',
    preview: ['#dceef4', '#fffdf1', '#739760', '#d5a05b', '#304238'],
  };

  const readStoredTheme = () => {
    try { return localStorage.getItem(THEME_STORAGE_KEY); }
    catch { return null; }
  };

  const updateControls = () => {
    const selected = document.documentElement.dataset.familyTheme === THEME_ID;
    document.querySelectorAll('[data-theme-option]').forEach((button) => {
      if (button.dataset.themeOption === THEME_ID) {
        button.classList.toggle('active', selected);
        button.setAttribute('aria-checked', String(selected));
      } else if (selected) {
        button.classList.remove('active');
        button.setAttribute('aria-checked', 'false');
      }
    });
    if (selected) {
      const label = document.querySelector('.settings-current-theme');
      if (label) label.textContent = `현재 · ${THEME.name}`;
    }
  };

  const applyTheme = ({ persist = true, announce = false } = {}) => {
    document.documentElement.dataset.familyTheme = THEME_ID;
    document.documentElement.style.colorScheme = 'light';
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = THEME.themeColor;
    if (persist) {
      try { localStorage.setItem(THEME_STORAGE_KEY, THEME_ID); } catch { /* 현재 화면에는 적용 */ }
    }
    updateControls();
    window.dispatchEvent(new CustomEvent('familythemechange', { detail: { theme: THEME_ID } }));
    if (announce && typeof toast === 'function') toast(`${THEME.name} 테마로 바꿨어요 ☁️`);
  };

  const install = (attempt = 0) => {
    const grid = document.querySelector('#settingsView .theme-option-grid');
    if (!grid) {
      if (attempt < 50) setTimeout(() => install(attempt + 1), 100);
      return;
    }
    if (grid.querySelector(`[data-theme-option="${THEME_ID}"]`)) return;

    const button = document.createElement('button');
    button.className = 'theme-option ghibli-theme-option';
    button.type = 'button';
    button.dataset.themeOption = THEME_ID;
    button.dataset.ghibliThemeModule = '';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.style.cssText = `--preview-bg:${THEME.preview[0]};--preview-surface:${THEME.preview[1]};--preview-accent:${THEME.preview[2]};--preview-highlight:${THEME.preview[3]};--preview-text:${THEME.preview[4]}`;
    button.innerHTML = `
      <span class="theme-preview ghibli-theme-preview" aria-hidden="true">
        <i class="theme-preview-header"></i>
        <i class="theme-preview-card"></i>
        <i class="theme-preview-accent"></i>
        <i class="theme-preview-highlight"></i>
        <i class="ghibli-preview-sun"></i>
        <i class="ghibli-preview-cloud"></i>
        <i class="ghibli-preview-hill"></i>
      </span>
      <span class="theme-option-copy">
        <strong>${THEME.name}<em>NEW</em></strong>
        <small>${THEME.description}</small>
      </span>
      <i class="theme-check" aria-hidden="true">✓</i>
    `;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      applyTheme({ announce: true });
    });
    grid.appendChild(button);

    window.addEventListener('familythemechange', (event) => {
      if (event.detail?.theme !== THEME_ID) updateControls();
    });

    if (readStoredTheme() === THEME_ID) applyTheme({ persist: false });
    else updateControls();
  };

  install();
})();