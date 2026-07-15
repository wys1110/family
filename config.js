window.FAMILY_CONFIG = {
  supabaseUrl: "https://ljutcgmgtqfkwkxdbiyb.supabase.co",
  supabaseAnonKey: "sb_publishable_PlEeuwC__Ft2Gtv3iT4OcA_hV461WbY",
};

(() => {
  const version = "20260716-private-space";
  if (!document.querySelector('link[data-private-space]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = `private-space.css?v=${version}`;
    stylesheet.dataset.privateSpace = "true";
    document.head.appendChild(stylesheet);
  }

  const loadPrivateSpace = () => {
    if (document.querySelector('script[data-private-space]')) return;
    const script = document.createElement("script");
    script.src = `private-space.js?v=${version}`;
    script.dataset.privateSpace = "true";
    document.body.appendChild(script);
  };

  if (document.readyState === "complete") loadPrivateSpace();
  else window.addEventListener("load", loadPrivateSpace, { once: true });
})();
