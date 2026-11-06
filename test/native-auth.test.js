import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync('native-bridge.js', 'utf8');
const app = readFileSync('app.js', 'utf8');
const loginFunctions = app.slice(app.indexOf('function authRedirectUrl('), app.indexOf('\nasync function createHousehold('));
const logoutFunction = app.slice(app.indexOf('async function signOutCurrentUser('), app.indexOf('\nfunction privateCashflowEntry('));
const callback = 'com.wys1110.family://login-callback/';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness({ platform = 'ios', storage = new Map(), launchUrl, ready = true } = {}) {
  let now = 1800000000000, sequence = 0;
  const events = {}, browserEvents = {};
  const state = { authReady: ready, supabase: null, session: null };
  const browser = { open: vi.fn(async () => {}), close: vi.fn(async () => { browserEvents.browserFinished?.(); }), addListener: vi.fn((name, fn) => { browserEvents[name] = fn; }) };
  const client = { auth: {
    signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://project.supabase.co/auth/v1/authorize?provider=google' }, error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ data: { session: { user: { id: 'synthetic-user' } } }, error: null })),
    signOut: vi.fn(async () => { state.session = null; return { error: null }; }),
  } };
  state.supabase = client;
  const ctx = {
    state, location: { origin: 'https://family.example', pathname: '/family/' },
    Date: class extends Date { static now() { return now; } }, URL, crypto: { randomUUID: () => `flow-${++sequence}` },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    document: { documentElement: { dataset: {} }, addEventListener() {} },
    window: {
      FAMILY_APP_STATE: state,
      Capacitor: { isNativePlatform: () => platform !== 'web', getPlatform: () => platform,
        Plugins: { Browser: browser, App: { addListener: (name, fn) => { events[name] = fn; }, getLaunchUrl: async () => ({ url: launchUrl }) } } },
      addEventListener: (name, fn) => { events[name] = fn; },
    },
    toast: vi.fn(), $: () => ({ close() {} }), console: { error: vi.fn() },
  };
  vm.createContext(ctx); vm.runInContext(source, ctx); vm.runInContext(loginFunctions + '\n' + logoutFunction, ctx);
  return { ctx, client, browser, browserEvents, events, state, storage, native: ctx.window.FAMILY_NATIVE_AUTH,
    advance: ms => { now += ms; }, open: url => events.appUrlOpen?.({ url }), coreReady: () => { state.authReady = true; events['family:core-ready']?.(); } };
}

test('iOS Google login uses PKCE settings, an external browser and the app callback', async () => {
  const h = harness();
  expect(h.native?.clientOptions.auth).toMatchObject({ flowType: 'pkce', detectSessionInUrl: false });
  const createClient = vi.fn(() => h.client);
  h.ctx.window.supabase = { createClient }; h.ctx.config = { supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'synthetic-publishable-key' };
  vm.runInContext(app.match(/state\.supabase = window\.supabase\.createClient[^;]+;/)[0], h.ctx);
  expect(createClient.mock.lastCall[2]).toBe(h.native.clientOptions);
  await h.ctx.signInWithGoogle();
  expect(h.client.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: callback, skipBrowserRedirect: true } });
  expect(h.browser.open).toHaveBeenCalledOnce();
  h.open(callback + '?code=synthetic-code'); await flush();
  expect(h.client.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('synthetic-code');
});

test.each(['web', 'android'])('%s keeps its existing login redirects and browser behavior', async platform => {
  const h = harness({ platform });
  expect(h.native).toBeUndefined();
  await h.ctx.signInWithGoogle();
  expect(h.client.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://family.example/family/' } });
  expect(h.browser.open).not.toHaveBeenCalled();
});

test('callbacks require an unexpired login initiated in this app', async () => {
  const h = harness();
  h.open(callback + '?code=unsolicited'); await flush();
  expect(h.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  await h.ctx.signInWithGoogle(); h.advance(10 * 60000 + 1);
  h.open(callback + '?code=expired'); await flush();
  expect(h.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test.each([
  'other://login-callback/?code=x', 'com.wys1110.family://other/?code=x',
  callback + 'other?code=x', 'com.wys1110.family://user@login-callback/?code=x',
  'com.wys1110.family://login-callback:42/?code=x', callback + '?code=x&code=y',
  callback + '#access_token=x&refresh_token=y', callback + '?code=x#access_token=y',
  callback + '?access_token=x&refresh_token=y',
])('ignores unsupported or forged callbacks: %s', async url => {
  const h = harness(); await h.ctx.signInWithGoogle(); h.open(url); await flush();
  expect(h.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  h.open(callback + '?code=valid'); await flush();
  expect(h.client.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('valid');
});

test('cold start queues its callback until the client is ready and claims duplicate callbacks once', async () => {
  const storage = new Map(), first = harness({ storage }); await first.ctx.signInWithGoogle();
  expect([...storage.values()].join(' ')).not.toContain('synthetic-code');
  const h = harness({ storage, ready: false, launchUrl: callback + '?code=cold-start' }); await flush();
  h.open(callback + '?code=cold-start'); await flush();
  expect(h.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  h.coreReady(); await flush();
  expect(h.client.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('cold-start');
  h.open(callback + '?code=cold-start'); await flush();
  expect(h.client.auth.exchangeCodeForSession).toHaveBeenCalledOnce();
});

test('browser cancellation cancels OAuth pending but does not cancel an email link', async () => {
  const h = harness(); await h.ctx.signInWithGoogle(); h.browserEvents.browserFinished();
  h.open(callback + '?code=cancelled'); await flush();
  expect(h.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  const form = { querySelector: () => ({ value: 'synthetic@example.invalid' }), reset: vi.fn() };
  await h.ctx.sendMagicLink({ preventDefault() {}, currentTarget: form });
  expect(h.client.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'synthetic@example.invalid', options: { emailRedirectTo: callback } });
  h.browserEvents.browserFinished(); h.open(callback + '?code=email-code'); await flush();
  expect(h.client.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('email-code');
});

test('logout cancels pending before its signed-out early return', async () => {
  const h = harness(); await h.ctx.signInWithGoogle(); await h.ctx.signOutCurrentUser();
  h.open(callback + '?code=after-logout'); await flush();
  expect(h.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test('logout waits for an in-flight exchange then clears its session; a new flow cannot race it', async () => {
  const h = harness(); let finish;
  h.client.auth.exchangeCodeForSession.mockImplementationOnce(() => new Promise(resolve => { finish = () => { h.state.session = { user: { id: 'synthetic-user' } }; resolve({ error: null }); }; }));
  await h.ctx.signInWithGoogle(); h.open(callback + '?code=in-flight'); await flush();
  const logout = h.ctx.signOutCurrentUser(); await flush();
  await h.ctx.signInWithGoogle();
  expect(h.client.auth.signInWithOAuth).toHaveBeenCalledOnce();
  expect(h.client.auth.signOut).not.toHaveBeenCalled();
  finish(); await logout;
  expect(h.client.auth.signOut).toHaveBeenCalledOnce();
  expect(h.state.session).toBeNull();
});

test('a failed launch or exchange allows a new attempt and never logs callback credentials', async () => {
  const h = harness(); h.browser.open.mockRejectedValueOnce(new Error('synthetic-code'));
  await h.ctx.signInWithGoogle();
  await h.ctx.signInWithGoogle();
  h.client.auth.exchangeCodeForSession.mockResolvedValueOnce({ error: new Error('synthetic-code') });
  h.open(callback + '?code=synthetic-code'); await flush();
  expect(h.ctx.console.error).not.toHaveBeenCalled();
  expect(h.ctx.toast.mock.calls.flat().join(' ')).not.toContain('synthetic-code');
  await h.ctx.signInWithGoogle(); expect(h.client.auth.signInWithOAuth).toHaveBeenCalledTimes(3);
});

test('an email retry or a switch to Google replaces the old pending attempt', async () => {
  const h = harness();
  await h.native.sendMagicLink(h.client, 'synthetic@example.invalid');
  await h.native.sendMagicLink(h.client, 'synthetic@example.invalid');
  expect(h.client.auth.signInWithOtp).toHaveBeenCalledTimes(2);
  await h.ctx.signInWithGoogle();
  expect(h.browser.open).toHaveBeenCalledOnce();
});

test('cancelling while the authorization URL is being prepared never opens that old request', async () => {
  const h = harness(); let finish;
  h.client.auth.signInWithOAuth.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const starting = h.ctx.signInWithGoogle(); await h.native.cancel();
  await h.ctx.signInWithGoogle(); expect(h.client.auth.signInWithOAuth).toHaveBeenCalledOnce();
  finish({ data: { url: 'https://project.supabase.co/authorize' }, error: null }); await starting;
  expect(h.browser.open).not.toHaveBeenCalled();
  h.open(callback + '?code=late'); await flush();
  expect(h.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test('provider error callbacks clear the pending attempt without displaying or logging their details', async () => {
  const h = harness(); await h.ctx.signInWithGoogle();
  h.open(callback + '?error=access_denied&error_description=synthetic-private-detail'); await flush();
  expect(h.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(h.ctx.toast.mock.calls.flat().join(' ')).not.toContain('synthetic-private-detail');
  expect(h.ctx.console.error).not.toHaveBeenCalled();
  h.open(callback + '?code=after-error'); await flush();
  expect(h.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test('a delayed callback cannot replace an already established account', async () => {
  const h = harness(); await h.ctx.signInWithGoogle();
  h.state.session = { user: { id: 'already-signed-in' } };
  h.open(callback + '?code=late-account'); await flush();
  expect(h.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(h.state.session.user.id).toBe('already-signed-in');
});

test('a previous callback cannot consume a replacement flow before its PKCE request is prepared', async () => {
  const h = harness(); await h.native.sendMagicLink(h.client, 'synthetic@example.invalid');
  let finish;
  h.client.auth.signInWithOAuth.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const starting = h.ctx.signInWithGoogle();
  h.open(callback + '?code=previous-email'); await flush();
  expect(h.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  finish({ data: { url: 'https://project.supabase.co/authorize' }, error: null }); await starting;
  h.open(callback + '?code=new-oauth'); await flush();
  expect(h.client.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('new-oauth');
});
