window.FAMILY_CONFIG = {
  supabaseUrl: "https://ljutcgmgtqfkwkxdbiyb.supabase.co",
  supabaseAnonKey: "sb_publishable_PlEeuwC__Ft2Gtv3iT4OcA_hV461WbY",
};

(() => {
  const modules = [
    { name: "calendar-swipe", version: "20260716-fast-swipe" },
    { name: "private-space", version: "20260716-private-editor-v2" },
    { name: "english-stories", version: "20260716-baby-stories" },
  ];

  modules.forEach(({ name, version }) => {
    if (document.querySelector(`link[data-module="${name}"]`)) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = `${name}.css?v=${version}`;
    stylesheet.dataset.module = name;
    document.head.appendChild(stylesheet);
  });

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
    if (typeof switchView === "function" && switchView.__englishStoriesInstalled) {
      switchView.__privateSpaceInstalled = true;
    }
  };

  if (document.readyState === "complete") loadModules();
  else window.addEventListener("load", loadModules, { once: true });
})();