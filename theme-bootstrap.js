(() => {
  if (window.FAMILY_THEME_BOOTSTRAP) return;

  const DEMO_SESSION_KEY = 'family-demo-mode-v1';
  const requestedByUrl = (() => {
    try { return new URL(window.location.href).searchParams.get('demo') === '1'; }
    catch { return false; }
  })();
  const requestedBySession = (() => {
    try { return window.sessionStorage.getItem(DEMO_SESSION_KEY) === '1'; }
    catch { return false; }
  })();
  const demoMode = requestedByUrl || requestedBySession;
  const themeStorageKey = demoMode ? 'family-demo-theme-v1' : 'family-theme-v1';
  const themeChoiceStorageKey = demoMode ? 'family-demo-theme-choice-v1' : 'family-theme-choice-v1';
  const validThemes = ['white', 'black'];
  const themeCssAliases = { black: 'night' };
  let themeId = 'white';

  try {
    const storedChoice = window.localStorage.getItem(themeChoiceStorageKey);
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    const candidate = storedChoice || storedTheme;
    if (validThemes.includes(candidate)) themeId = candidate;
  } catch { /* 기본 화이트 테마 사용 */ }

  const root = document.documentElement;
  root.dataset.familyTheme = themeCssAliases[themeId] || themeId;
  root.dataset.familyThemeChoice = themeId;
  root.style.colorScheme = themeId === 'black' ? 'dark' : 'light';
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = themeId === 'black' ? '#050505' : '#f7f7f5';

  window.FAMILY_THEME_BOOTSTRAP = Object.freeze({ demoMode, themeId });
})();
