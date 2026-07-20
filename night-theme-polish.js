(() => {
  const NIGHT_THEME_COLOR = '#071425';
  const NIGHT_PREVIEW = {
    bg: '#071425',
    surface: '#0f2138',
    accent: '#8eb9ff',
    highlight: '#eda5c7',
    text: '#f5f7fc',
  };

  const syncNightThemePresentation = () => {
    const isNight = document.documentElement.dataset.familyTheme === 'night';
    if (isNight) {
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) themeMeta.content = NIGHT_THEME_COLOR;
    }

    const option = document.querySelector('[data-theme-option="night"]');
    if (!option) return;

    option.style.setProperty('--preview-bg', NIGHT_PREVIEW.bg);
    option.style.setProperty('--preview-surface', NIGHT_PREVIEW.surface);
    option.style.setProperty('--preview-accent', NIGHT_PREVIEW.accent);
    option.style.setProperty('--preview-highlight', NIGHT_PREVIEW.highlight);
    option.style.setProperty('--preview-text', NIGHT_PREVIEW.text);

    const description = option.querySelector('.theme-option-copy small');
    if (description) description.textContent = '깊은 네이비와 은은한 별빛 포인트';
  };

  window.addEventListener('familythemechange', syncNightThemePresentation);
  syncNightThemePresentation();
})();
