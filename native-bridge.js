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

  document.documentElement.dataset.familyNative = capacitor.getPlatform();

  if (capacitor.getPlatform() !== 'ios') return;
  const redirectUrl = 'com.wys1110.family://login-callback/';
  const storageKey = 'family-ios-auth-pending-v1';
  const lifetime = 10 * 60 * 1000;
  let pending = null, queuedUrl = null, requesting = false, exchanging = null;
  try { pending = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { /* No recoverable login. */ }
  const clear = () => {
    pending = null; queuedUrl = null;
    try { localStorage.removeItem(storageKey); } catch { /* Memory still cancels this attempt. */ }
  };
  const current = () => {
    const now = Date.now();
    if (pending && typeof pending.id === 'string' && typeof pending.ready === 'boolean' && ['oauth', 'email'].includes(pending.kind)
      && Number.isFinite(pending.startedAt) && pending.startedAt <= now && now - pending.startedAt < lifetime) return pending;
    clear(); return null;
  };
  const failure = () => ({ error: new Error('네이티브 로그인을 완료하지 못했어요') });
  const begin = kind => {
    if (requesting || exchanging || window.FAMILY_APP_STATE?.session) return null;
    // A deliberate retry replaces the earlier attempt, including its SDK PKCE verifier.
    clear();
    const flow = { id: crypto.randomUUID(), kind, startedAt: Date.now(), ready: false };
    try { localStorage.setItem(storageKey, JSON.stringify(flow)); } catch { return null; }
    pending = flow; return flow;
  };
  const isCurrent = flow => current()?.id === flow.id;
  const arm = flow => {
    if (!isCurrent(flow)) return false;
    flow.ready = true;
    try { localStorage.setItem(storageKey, JSON.stringify(flow)); } catch { clear(); return false; }
    return true;
  };
  const closeBrowser = async () => { try { await browser?.close?.(); } catch { /* Returning to the app still works. */ } };
  const handleUrl = raw => {
    let url;
    try { url = new URL(raw); } catch { return; }
    if (url.protocol !== 'com.wys1110.family:' || url.hostname !== 'login-callback' || url.pathname !== '/'
      || url.username || url.password || url.port || url.hash
      || url.searchParams.has('access_token') || url.searchParams.has('refresh_token')) return;
    const code = url.searchParams.get('code');
    const authError = url.searchParams.has('error');
    if ((!authError && (!code || code.length > 2048)) || url.searchParams.getAll('code').length > 1 || !current()?.ready) return;
    const state = window.FAMILY_APP_STATE;
    if (!state?.authReady) { queuedUrl = raw; return; }
    if (!state.supabase || state.session || exchanging) { clear(); return; }
    // Claim before awaiting: getLaunchUrl/appUrlOpen and Browser.close may all arrive together.
    clear();
    exchanging = (async () => {
      await closeBrowser();
      if (authError) { toast('로그인을 완료하지 못했어요. 다시 시도해 주세요'); return; }
      try {
        const { error } = await state.supabase.auth.exchangeCodeForSession(code);
        if (error) toast('로그인을 완료하지 못했어요. 다시 시도해 주세요');
      } catch { toast('로그인을 완료하지 못했어요. 다시 시도해 주세요'); }
    })().finally(() => { exchanging = null; });
  };

  window.FAMILY_NATIVE_AUTH = {
    redirectUrl,
    clientOptions: { auth: { flowType: 'pkce', detectSessionInUrl: false } },
    async signInWithGoogle(client) {
      if (!app?.addListener || !browser?.open) return failure();
      const flow = begin('oauth'); if (!flow) return failure();
      requesting = true;
      try {
        const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl, skipBrowserRedirect: true } });
        if (!isCurrent(flow)) return failure();
        if (error || !data?.url) { clear(); return failure(); }
        if (!arm(flow)) return failure();
        await browser.open({ url: data.url });
        return { error: null };
      } catch { if (isCurrent(flow)) clear(); return failure(); }
      finally { requesting = false; }
    },
    async sendMagicLink(client, email) {
      if (!app?.addListener) return failure();
      const flow = begin('email'); if (!flow) return failure();
      requesting = true;
      try {
        const result = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl } });
        if (!isCurrent(flow)) return failure();
        if (result.error) clear();
        else if (!arm(flow)) return failure();
        return result;
      } catch { if (isCurrent(flow)) clear(); return failure(); }
      finally { requesting = false; }
    },
    async cancel() {
      clear();
      // The SDK stores the session before exchange resolves. Logout must sign out after it settles.
      await exchanging;
    },
  };
  current();
  app?.addListener?.('appUrlOpen', ({ url }) => handleUrl(url));
  browser?.addListener?.('browserFinished', () => { if (current()?.kind === 'oauth') clear(); });
  window.addEventListener('family:core-ready', () => { if (queuedUrl) handleUrl(queuedUrl); });
  Promise.resolve(app?.getLaunchUrl?.()).then(result => { if (result?.url) handleUrl(result.url); }).catch(() => {});
})();
