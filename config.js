window.FAMILY_CONFIG = {
  supabaseUrl: "https://ljutcgmgtqfkwkxdbiyb.supabase.co",
  supabaseAnonKey: "sb_publishable_PlEeuwC__Ft2Gtv3iT4OcA_hV461WbY",
};

(() => {
  const modules = [
    { name: "calendar-swipe", version: "20260716-fast-swipe" },
    { name: "english-stories", version: "20260716-baby-stories" },
    { name: "photo-viewer-navigation", version: "20260716-swipe-buttons" },
    { name: "feeding-pattern-split", version: "20260716-formula-breast-v1" },
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
      .view-tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .view-tab { padding-inline: .45rem; font-size: 12px; }
    `;
    document.head.appendChild(navigationStyle);
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