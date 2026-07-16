(() => {
  if (document.querySelector('[data-storybook-theme-module]')) return;

  const loadGhibliTheme = () => {
    if (!document.querySelector('link[data-module="ghibli-theme"]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'ghibli-theme.css?v=20260716-ghibli-v1';
      stylesheet.dataset.module = 'ghibli-theme';
      document.head.appendChild(stylesheet);
    }
    if (!document.querySelector('script[data-module="ghibli-theme"]')) {
      const script = document.createElement('script');
      script.src = 'ghibli-theme.js?v=20260716-ghibli-v1';
      script.dataset.module = 'ghibli-theme';
      document.body.appendChild(script);
    }
  };
  loadGhibliTheme();

  const THEME_ID = 'storybook';
  const THEME_STORAGE_KEY = 'family-theme-v1';
  const THEME = {
    name: '바람의 숲 🌿',
    description: '수채화 같은 하늘빛과 초록, 따뜻한 애니메이션 톤',
    themeColor: '#edf4e6',
    preview: ['#dfeef0', '#fffdf2', '#6f9368', '#e2a15f', '#304238'],
  };

  const readStoredTheme = () => {
    try { return localStorage.getItem(THEME_STORAGE_KEY); }
    catch { return null; }
  };

  const updateControls = () => {
    const selected = document.documentElement.dataset.familyTheme === THEME_ID;
    document.querySelectorAll('[data-theme-option]').forEach((button) => {
      const active = button.dataset.themeOption === THEME_ID ? selected : !selected && button.classList.contains('active');
      if (button.dataset.themeOption === THEME_ID) {
        button.classList.toggle('active', active);
        button.setAttribute('aria-checked', String(active));
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
    if (announce && typeof toast === 'function') toast(`${THEME.name} 테마로 바꿨어요 🍃`);
  };

  const install = (attempt = 0) => {
    const grid = document.querySelector('#settingsView .theme-option-grid');
    if (!grid) {
      if (attempt < 50) setTimeout(() => install(attempt + 1), 100);
      return;
    }
    if (grid.querySelector(`[data-theme-option="${THEME_ID}"]`)) return;

    const button = document.createElement('button');
    button.className = 'theme-option storybook-theme-option';
    button.type = 'button';
    button.dataset.themeOption = THEME_ID;
    button.dataset.storybookThemeModule = '';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.style.cssText = `--preview-bg:${THEME.preview[0]};--preview-surface:${THEME.preview[1]};--preview-accent:${THEME.preview[2]};--preview-highlight:${THEME.preview[3]};--preview-text:${THEME.preview[4]}`;
    button.innerHTML = `
      <span class="theme-preview storybook-theme-preview" aria-hidden="true">
        <i class="theme-preview-header"></i>
        <i class="theme-preview-card"></i>
        <i class="theme-preview-accent"></i>
        <i class="theme-preview-highlight"></i>
        <i class="storybook-cloud"></i>
        <i class="storybook-hill"></i>
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
