import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const app = readFileSync('app.js', 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function harness() {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { close: vi.fn(), removeAttribute: vi.fn(), textContent: '', disabled: false });
    return nodes.get(selector);
  };
  const photo = { entry: { title: '합성 사진', date: '2000-01-01' }, url: 'https://example.invalid/private-a', filePromise: Promise.resolve(new Blob(['synthetic'], { type: 'image/jpeg' })) };
  const state = { supabase: {}, session: { user: { id: 'user-a' } }, household: { id: 'home-a' }, activeBabyId: 'baby-a', wallpapers: { calendar: { url: photo.url }, growth: null }, onboardingPrompted: true };
  const context = {
    state, activePhotoViewerItems: [photo], activeRecentPhotoIndex: 0, $: node,
    activeBaby: () => ({ id: state.activeBabyId, name: '합성 아기' }),
    navigator: { share: vi.fn(async () => {}), canShare: () => true, clipboard: { writeText: vi.fn(async () => {}) } },
    Blob, File, toast: vi.fn(), bootstrapRetryTimer: null, bootstrapRequestId: 0,
    clearTimeout: vi.fn(), authSessionKey: s => s?.user?.id || 'signed-out',
    isCurrentBootstrap: () => true, DEFAULT_FAMILY_MEMBERS: [],
    document: { documentElement: { dataset: { familyModulesReady: 'true' } } },
    render: vi.fn(), renderWallpapers: vi.fn(), updateAuthGate: vi.fn(),
    withAuthRecovery: async () => ({ data: [], error: null }),
    window: { FAMILY_MODULES_READY: Promise.resolve(), dispatchEvent: vi.fn(), FAMILY_AUTH_API: { isAuthError: () => false }, setTimeout: vi.fn() },
    selectInitialBaby: vi.fn(), validateCareTimerContext: vi.fn(), CustomEvent: class {},
    DEMO_MODE: false, BABY_STORAGE_KEY: '', STORAGE_KEY: '', GROWTH_STORAGE_KEY: '',
    localMembers: () => [], readLocalJson: () => [], normalizeEvent: value => value,
    console: { error: vi.fn() }, describeRemoteError: () => 'synthetic offline', BOOTSTRAP_RETRY_DELAYS: [], lastAuthSessionKey: 'user-a',
  };
  vm.createContext(context);
  const reset = app.includes('function resetPhotoViewer(') ? section('function resetPhotoViewer(', 'async function shareRecentPhoto(') : '';
  vm.runInContext(`${reset}\n${section('async function shareRecentPhoto(', '\nfunction filterGrowthEntries(')}\n${section('async function bootstrapData(', '\nfunction isCurrentBootstrap(')}`, context);
  return { context, state, photo, node };
}

test.each(['empty', 'error', 'signed-out'])('bootstrap clears previous family photos for %s membership before awaiting', async mode => {
  const h = harness(), lookup = deferred();
  if (mode === 'signed-out') h.state.session = null;
  h.context.withAuthRecovery = () => lookup.promise;
  const pending = h.context.bootstrapData();
  expect(h.state.wallpapers).toEqual({ calendar: null, growth: null });
  expect(h.context.activePhotoViewerItems).toEqual([]);
  expect(h.node('#photoViewerDialog').close).toHaveBeenCalled();
  expect(h.node('#photoViewerImage').removeAttribute).toHaveBeenCalledWith('src');
  lookup.resolve(mode === 'error' ? { error: new Error('synthetic offline') } : { data: [], error: null });
  await pending;
  expect(h.state.wallpapers.calendar).toBeNull();
});

test('auth changes clear photos immediately before deferred bootstrap', () => {
  const h = harness();
  h.context.session = { user: { id: 'user-b' } };
  vm.runInContext(app.slice(app.indexOf('        const nextKey = authSessionKey(session);'), app.indexOf('\n      });', app.indexOf('        const nextKey = authSessionKey(session);'))), h.context);
  expect(h.state.wallpapers.calendar).toBeNull();
  expect(h.context.activePhotoViewerItems).toEqual([]);
  expect(h.context.renderWallpapers).toHaveBeenCalled();
  expect(h.context.window.setTimeout).toHaveBeenCalled();
});

test.each(['user', 'household', 'baby', 'client', 'viewer'])('pending photo share is cancelled after %s context changes', async change => {
  const h = harness(), fetched = deferred(); h.photo.filePromise = fetched.promise;
  const pending = h.context.shareRecentPhoto();
  if (change === 'user') h.state.session = { user: { id: 'user-b' } };
  if (change === 'household') h.state.household = { id: 'home-b' };
  if (change === 'baby') h.state.activeBabyId = 'baby-b';
  if (change === 'client') h.state.supabase = {};
  if (change === 'viewer') h.context.resetPhotoViewer();
  fetched.resolve(new Blob(['synthetic'], { type: 'image/jpeg' })); await pending;
  expect(h.context.navigator.share).not.toHaveBeenCalled();
  expect(h.context.navigator.clipboard.writeText).not.toHaveBeenCalled();
  expect(h.node('#photoShareButton').disabled).toBe(false);
});

test.each(['file', 'link', 'clipboard'])('unchanged context retains %s photo sharing', async mode => {
  const h = harness();
  if (mode === 'link') h.photo.filePromise = Promise.resolve(null);
  if (mode === 'clipboard') h.context.navigator.share = null;
  await h.context.shareRecentPhoto();
  if (mode === 'file') expect(h.context.navigator.share.mock.calls[0][0].files[0].name).toBe('합성 아기-2000-01-01.jpg');
  if (mode === 'link') expect(h.context.navigator.share).toHaveBeenCalledWith(expect.objectContaining({ url: h.photo.url }));
  if (mode === 'clipboard') expect(h.context.navigator.clipboard.writeText).toHaveBeenCalledWith(h.photo.url);
});
