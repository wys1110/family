import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';
const source = readFileSync('app.js', 'utf8');
const section = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness() {
  const nodes = new Map();
  const $ = key => { if (!nodes.has(key)) nodes.set(key, { value: '', close: vi.fn() }); return nodes.get(key); };
  $('#growthCategory').value = '첫 순간'; $('#growthEntryTitle').value = 'old draft';
  $('#growthForm').querySelectorAll = () => [...nodes.values()].filter(n => 'value' in n);
  for (const key of ['Id', 'Symptom', 'Date', 'Time', 'Height', 'Weight', 'Head', 'FeedingMl', 'FeedingType', 'FeedingSide', 'FeedingMinutes', 'SleepMinutes', 'Temperature', 'DiaperKind', 'Note']) $(`#growth${key}`);
  const upload = deferred(), write = deferred(), hydrate = deferred();
  const remove = vi.fn(async () => ({ error: null })), upsert = vi.fn(() => write.promise);
  const context = { $, GROWTH_PHOTO_BUCKET: 'photos', bootstrapRequestId: 1, growthSaveInProgress: false, growthDialogReturnPosition: null,
    growthPhotoDraft: { existingPaths: [], existingUrls: [], removedPaths: ['old-photo'], newPhotos: [] },
    state: { supabase: { from: () => ({ upsert }), storage: { from: () => ({ remove }) } }, session: { user: { id: 'user' } }, household: { id: 'home' }, activeBabyId: 'baby', growthEntries: [] },
    uid: () => 'entry', numberOrNull: () => null, defaultGrowthTitle: () => 'title', uploadGrowthPhotos: vi.fn(() => upload.promise),
    withAuthRecovery: operation => operation(), hydrateGrowthPhotoUrls: vi.fn(() => hydrate.promise),
    setGrowthSaving: value => { context.growthSaveInProgress = value; }, toast: vi.fn(), dispatchGrowthEntrySaved: vi.fn(),
    resetGrowthPhotoDraft: vi.fn(), renderGrowth: vi.fn(), showGrowthComplete: vi.fn(), activeBaby: () => ({ name: 'baby' }),
    restoreGrowthPosition: vi.fn(), console, window: { FAMILY_DATA: { photoStoragePaths: p => p, removeUnreferencedGrowthPhotos: vi.fn(async () => ({})) } },
  };
  vm.createContext(context);
  vm.runInContext(section('function toGrowthRemote(', 'function selectInitialBaby('), context);
  vm.runInContext(section('async function saveGrowthEntry(', 'function numberOrNull('), context);
  return { context, $, upload, write, hydrate, upsert, remove, start: () => context.saveGrowthEntry({ preventDefault() {} }) };
}
const flush = () => new Promise(r => setTimeout(r, 0));
test.each(['account', 'bootstrap', 'draft', 'form', 'photos'])('upload response cannot save after %s changes', async change => {
  const h = harness(), pending = h.start();
  if (change === 'account') { h.context.state.session = { user: { id: 'new-user' } }; h.context.state.household = { id: 'new-home' }; }
  if (change === 'photos') h.context.growthPhotoDraft.newPhotos.push({ file: {} });
  if (change === 'form') h.$('#growthEntryTitle').value = 'new draft';
  if (change === 'bootstrap') h.context.bootstrapRequestId++;
  if (change === 'draft') h.context.growthPhotoDraft = { existingPaths: [], existingUrls: [], removedPaths: [], newPhotos: [] };
  h.upload.resolve(['uploaded']); await flush();
  h.write.resolve({ error: null }); h.hydrate.resolve(); await pending;
  expect(h.upsert).not.toHaveBeenCalled(); expect(h.$('#growthDialog').close).not.toHaveBeenCalled();
  expect(h.context.resetGrowthPhotoDraft).not.toHaveBeenCalled(); expect(h.context.state.growthEntries).toEqual([]);
});
test.each(['write', 'hydrate'])('committed %s response cannot mutate new account or delete committed photos', async stage => {
  const h = harness(), pending = h.start(); h.upload.resolve(['uploaded']); await flush();
  if (stage === 'hydrate') { h.write.resolve({ error: null }); await flush(); }
  h.context.state.session = { user: { id: 'new-user' } }; h.context.state.household = { id: 'new-home' };
  h.remove.mockClear(); h.write.resolve({ error: null }); h.hydrate.resolve(); await pending;
  expect(h.context.state.growthEntries).toEqual([]); expect(h.remove).not.toHaveBeenCalled();
  expect(h.$('#growthDialog').close).not.toHaveBeenCalled(); expect(h.context.resetGrowthPhotoDraft).not.toHaveBeenCalled();
});
test('successful save uses the captured household and clears only its draft', async () => {
  const h = harness(), pending = h.start(); h.upload.resolve(['uploaded']); await flush();
  expect(h.upsert.mock.calls[0][0]).toMatchObject({ household_id: 'home', created_by: 'user', photo_paths: ['uploaded'] });
  h.write.resolve({ error: null }); await flush(); h.hydrate.resolve(); await pending;
  expect(h.context.state.growthEntries).toHaveLength(1);
  expect(h.context.resetGrowthPhotoDraft).toHaveBeenCalledOnce(); expect(h.$('#growthDialog').close).toHaveBeenCalledOnce();
  expect(h.context.window.FAMILY_DATA.removeUnreferencedGrowthPhotos).toHaveBeenCalledWith(expect.objectContaining({ householdId: 'home', paths: ['old-photo'] }));
});
test('database failure retains the draft and removes only the uncommitted upload', async () => {
  const h = harness(), draft = h.context.growthPhotoDraft, pending = h.start(); h.upload.resolve(['uploaded']); await flush();
  h.write.resolve({ error: new Error('offline') }); await pending;
  expect(h.context.growthPhotoDraft).toBe(draft); expect(h.context.resetGrowthPhotoDraft).not.toHaveBeenCalled();
  expect(h.remove).toHaveBeenCalledWith(['uploaded']); expect(h.context.state.growthEntries).toEqual([]);
  expect(h.context.growthSaveInProgress).toBe(false); expect(h.context.toast).toHaveBeenCalled();
});
test('a signed URL failure still completes the committed save without deleting its upload', async () => {
  const h = harness(); h.context.hydrateGrowthPhotoUrls = vi.fn(async () => { throw new Error('URL offline'); });
  const pending = h.start(); h.upload.resolve(['uploaded']); await flush(); h.write.resolve({ error: null }); await pending;
  expect(h.context.state.growthEntries).toHaveLength(1); expect(h.remove).not.toHaveBeenCalled();
  expect(h.context.resetGrowthPhotoDraft).toHaveBeenCalledOnce();
});
