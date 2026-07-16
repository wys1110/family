window.FAMILY_CONFIG = {
  supabaseUrl: "https://ljutcgmgtqfkwkxdbiyb.supabase.co",
  supabaseAnonKey: "sb_publishable_PlEeuwC__Ft2Gtv3iT4OcA_hV461WbY",
};

(() => {
  const themeStorageKey = "family-theme-v1";
  const themeColors = {
    forest: "#fff8f3",
    sunshine: "#fffaf0",
    rose: "#fff5f7",
    ocean: "#f3f9fb",
    night: "#151a20",
  };
  let initialTheme = "forest";
  try {
    const storedTheme = localStorage.getItem(themeStorageKey);
    if (themeColors[storedTheme]) initialTheme = storedTheme;
  } catch { /* 기본 테마 사용 */ }
  document.documentElement.dataset.familyTheme = initialTheme;
  document.documentElement.style.colorScheme = initialTheme === "night" ? "dark" : "light";
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = themeColors[initialTheme];

  const modules = [
    { name: "calendar-swipe", version: "20260716-fast-swipe" },
    { name: "english-stories", version: "20260716-baby-stories" },
    { name: "photo-viewer-navigation", version: "20260716-swipe-buttons" },
    { name: "feeding-pattern-split", version: "20260716-formula-breast-v1" },
    { name: "feature-request", version: "20260716-feature-request-db-v1" },
    { name: "refresh-button", version: "20260716-refresh-v1" },
    { name: "sticky-tabs", version: "20260716-sticky-v1" },
    { name: "settings", version: "20260716-theme-settings-v1" },
  ];

  modules.forEach(({ name, version }) => {
    if (document.querySelector(`link[data-module="${name}"]`)) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = `${name}.css?v=${version}`;
    stylesheet.dataset.module = name;
    document.head.appendChild(stylesheet);
  });

  if (!document.querySelector('style[data-module="navigation-layout"]')) {
    const navigationStyle = document.createElement("style");
    navigationStyle.dataset.module = "navigation-layout";
    navigationStyle.textContent = `
      .view-tabs { grid-template-columns: repeat(5, minmax(0, 1fr)); }
      .view-tab { padding-inline: .18rem; font-size: 10px; white-space: nowrap; }
    `;
    document.head.appendChild(navigationStyle);
  }

  if (!document.querySelector('style[data-module="calendar-date-selection"]')) {
    const calendarDateSelectionStyle = document.createElement("style");
    calendarDateSelectionStyle.dataset.module = "calendar-date-selection";
    calendarDateSelectionStyle.textContent = `
      .calendar-event-bar {
        pointer-events: none;
        cursor: default;
      }
    `;
    document.head.appendChild(calendarDateSelectionStyle);
  }

  const loadScript = ({ name, version }) => new Promise((resolve) => {
    if (document.querySelector(`script[data-module="${name}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = `${name}.js?v=${version}`;
    script.dataset.module = name;
    script.onload = resolve;
    script.onerror = resolve;
    document.body.appendChild(script);
  });

  const loadModules = async () => {
    for (const module of modules) await loadScript(module);
  };

  if (document.readyState === "complete") loadModules();
  else window.addEventListener("load", loadModules, { once: true });
})();
