(() => {
  // The web build stays the source of truth. This bridge only adds small,
  // native-friendly behaviors when the same bundle runs inside Capacitor.
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return;

  const plugins = capacitor.Plugins || {};
  const app = plugins.App;
  const browser = plugins.Browser;

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[target="_blank"]');
    if (!link || !/^https?:$/i.test(new URL(link.href, location.href).protocol)) return;
    if (!browser?.open) return;
    event.preventDefault();
    browser.open({ url: link.href }).catch(() => window.open(link.href, '_blank', 'noopener,noreferrer'));
  }, true);

  app?.addListener?.('backButton', ({ canGoBack }) => {
    if (canGoBack) return window.history.back();
    if (window.FAMILY_APP_STATE?.activeView && window.FAMILY_APP_STATE.activeView !== 'calendar') {
      window.switchView?.('calendar');
      return;
    }
    app.exitApp?.();
  });

  document.documentElement.dataset.familyNative = 'android';
})();
