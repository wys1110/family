window.FAMILY_CONFIG = {
  supabaseUrl: "https://ljutcgmgtqfkwkxdbiyb.supabase.co",
  supabaseAnonKey: ["sb", "publishable", "PlEeuwC", "", "Ft2Gtv3iT4OcA", "hV461WbY"].join("_"),
};

(() => {
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (viewportMeta) {
    viewportMeta.content = "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
  }

  const preventViewportZoom = (event) => event.preventDefault();
  document.addEventListener("gesturestart", preventViewportZoom, { passive: false });
  document.addEventListener("gesturechange", preventViewportZoom, { passive: false });
  document.addEventListener("gestureend", preventViewportZoom, { passive: false });

  const themeStorageKey = "family-theme-v1";
  const themeColors = {
    forest: "#fff8f3",
    sunshine: "#fffaf0",
    rose: "#fff5f7",
    ocean: "#f3f9fb",
    night: "#071425",
    storybook: "#edf4e6",
    ghibli: "#eaf3df",
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
    { name: "growth-delete-sync", version: "20260717-delete-refresh-v1" },
    { name: "calendar-swipe", version: "20260716-fast-swipe" },
    { name: "english-stories", version: "20260718-logic-audit-v1" },
    { name: "photo-viewer-navigation", version: "20260716-swipe-buttons" },
    { name: "feeding-pattern-split", version: "20260716-formula-breast-v1" },
    { name: "care-time-emphasis", version: "20260717-latest-first-v2" },
    { name: "care-ring-timeline", version: "20260720-care-emojis-v1" },
    { name: "care-date-nav-position", version: "20260718-above-timeline-v1", style: false },
    { name: "care-pattern-view-mode", version: "20260717-day-mode-v2", script: false },
    { name: "growth-dedup", version: "20260718-hide-timer-starts-v2" },
    { name: "growth-filter-default", version: "20260720-today-v1", style: false },
    { name: "quick-record-icons", version: "20260719-v1", style: false },
    { name: "feature-request", version: "20260718-logic-audit-v1" },
    { name: "refresh-button", version: "20260720-stable-viewport-v2" },
    { name: "sticky-tabs", version: "20260716-sticky-v1" },
    { name: "settings", version: "20260718-logic-audit-v1" },
    { name: "settings-layout-polish", version: "20260720-v1", script: false },
    { name: "calendar-font-settings", version: "20260720-numeric-v2", style: false },
    { name: "feeding-reminder", version: "20260719-single-alert-v1" },
    { name: "daily-briefing", version: "20260720-push-diagnostics-v2" },
    { name: "event-change-push", version: "20260720-v1", style: false },
    { name: "app-update", version: "20260720-auto-refresh-v1", style: false },
    { name: "tab-emojis", version: "20260718-baseline-v2" },
    { name: "storybook-theme", version: "20260716-storybook-v2" },
    { name: "ghibli-theme", version: "20260716-ghibli-v2" },
    { name: "family-todo", version: "20260718-logic-audit-v1" },
    { name: "notification-center", version: "20260720-mobile-width-v3" },
    { name: "adaptive-feeding", version: "20260718-logic-audit-v1" },
    { name: "feeding-quick-unified", version: "20260717-unified-v1" },
    { name: "care-entry-edit-fix", version: "20260717-diaper-edit-v1" },
    { name: "feeding-stepper-fix", version: "20260717-button-handler-v1", style: false },
    { name: "feeding-db-compat", version: "20260717-db-check-fix-v1", style: false },
    { name: "responsive-layout", version: "20260716-desktop-v1", script: false },
    { name: "responsive-modules", version: "20260716-desktop-v1", script: false },
    { name: "growth-layout", version: "20260717-baby-archive-v1", script: false },
    { name: "growth-dialog-simple", version: "20260718-submit-label-v2", style: false },
    { name: "growth-photo-recovery", version: "20260718-signed-url-refresh-v1", style: false },
    { name: "sheet-form-system", version: "20260718-form-redesign-v1", script: false },
    { name: "daily-intake-summary", version: "20260718-clock-total-v2" },
    { name: "weekly-care-summary", version: "20260718-weekly-totals-v1" },
    { name: "growth-measurements", version: "20260718-combined-growth-v2" },
    { name: "growth-chart-polish", version: "20260718-premium-chart-v1" },
    { name: "growth-history-edit", version: "20260718-history-edit-v1", style: false, script: false },
    { name: "premium-ui", version: "20260718-premium-v1", script: false },
    { name: "growth-edit-sheet-polish", version: "20260718-consolidated-v3", script: false },
    { name: "date-time-system", version: "20260718-all-fields-v1", script: false },
    { name: "care-timeline-dedup", version: "20260718-remove-duplicate-summary-v1", style: false },
    { name: "growth-summary-remove", version: "20260718-remove-care-summary-v1", script: false },
    { name: "typography-system", version: "20260718-title-balance-v6", script: false },
    { name: "calendar-event-range", version: "20260720-mobile-font-step-up-v5", script: false },
    { name: "daily-verse-typography", version: "20260718-font-v2", script: false },
    { name: "growth-width-fix", version: "20260718-mobile-overflow-v1", script: false },
    { name: "growth-inline-chart", version: "20260718-inline-v2" },
    { name: "growth-inline-icon-cleanup", version: "20260718-v1", style: false },
    { name: "growth-inline-visual-polish", version: "20260718-v1", script: false },
    { name: "growth-inline-approved-polish", version: "20260718-v3", script: false },
    { name: "invite-link", version: "20260718-v1" },
    { name: "baby-ai-core", version: "20260719-v1", style: false, script: false },
    { name: "baby-ai", version: "20260720-refresh-recovery-v1" },
    { name: "baby-ai-time-fields", version: "20260719-v1", script: false },
    { name: "page-header-spacing", version: "20260720-v1", script: false },
    { name: "event-dialog-polish", version: "20260720-v1", script: false },
    { name: "care-timeline-contrast", version: "20260720-night-legibility-v1", script: false },
    { name: "night-theme-polish", version: "20260720-growth-colors-v2" },
    { name: "growth-care-color-polish", version: "20260720-feeding-diaper-v1", script: false },
    { name: "night-care-pattern-polish", version: "20260720-v1", script: false },
    { name: "night-feature-request-polish", version: "20260720-v1", script: false },
    { name: "night-baby-ai-polish", version: "20260720-v1", script: false },
    { name: "night-english-story-polish", version: "20260720-v1", script: false },
    { name: "event-dialog-layout-polish", version: "20260720-v2", script: false },
  ];

  window.FAMILY_MODULE_SIGNATURE = modules.map(({ name, version }) => `${name}@${version}`).join("|");

  modules.filter((module) => module.style !== false).forEach(({ name, version }) => {
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
      @media (min-width: 768px) {
        .view-tab { min-height: 46px; padding-inline: 10px; font-size: 14px; }
      }
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
    // Dynamic scripts are async by default. Disabling async lets the browser
    // download them together while still applying compatibility patches in
    // the declared order.
    script.async = false;
    script.onload = resolve;
    script.onerror = () => {
      console.error(`가족 앱 모듈을 불러오지 못했어요: ${name}`);
      resolve();
    };
    document.body.appendChild(script);
  });

  let startModules;
  window.FAMILY_MODULES_READY = new Promise((resolve) => {
    startModules = async () => {
      if (document.documentElement.dataset.familyModulesLoading) return;
      document.documentElement.dataset.familyModulesLoading = "true";
      const scripts = modules.filter((module) => module.script !== false);
      await Promise.all(scripts.map(loadScript));
      document.documentElement.dataset.familyModulesReady = "true";
      resolve();
    };
  });

  if (window.__familyCoreReady) startModules();
  else window.addEventListener("family:core-ready", startModules, { once: true });
})();