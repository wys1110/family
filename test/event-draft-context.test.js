import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const app = readFileSync('app.js', 'utf8');
const section = (a, b) => app.slice(app.indexOf(a), app.indexOf(b, app.indexOf(a)));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness() {
  const nodes = new Map();
  const $ = key => {
    if (!nodes.has(key)) {
      const node = { value: '', open: false, classList: { toggle() {} }, setAttribute() {} };
      node.showModal = vi.fn(() => { node.open = true; });
      node.close = vi.fn(() => { node.open = false; });
      nodes.set(key, node);
    }
    return nodes.get(key);
  };
  $('#eventForm').reset = () => { for (const node of nodes.values()) node.value = ''; };
  const write = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  const client = { from: () => ({ upsert: write, delete: () => ({ eq: () => ({ eq: remove }) }) }) };
  const context = {
    $, eventDialogContext: null, eventDialogReturnPosition: null, eventSaveInProgress: false, bootstrapRequestId: 1,
    state: { supabase: client, session: { user: { id: 'user-a' } }, household: { id: 'home-a' }, selectedDate: '2026-11-12', events: [], familyMembers: [] },
    window: { scrollX: 0, scrollY: 0, setTimeout: vi.fn(), scrollTo: vi.fn() },
    document: { querySelectorAll: () => [] }, focusOnDesktop() {},
    uid: () => 'event-id', parseDate: x => new Date(x), startOfMonth: x => x, dateKey: x => x.toISOString().slice(0, 10),
    render: vi.fn(), renderHeader: vi.fn(), renderCalendar: vi.fn(), renderAgenda: vi.fn(), renderUpcomingEvents: vi.fn(),
    toast: vi.fn(), confirm: () => true, requestAnimationFrame: vi.fn(), console,
    localStorage: { setItem: vi.fn() }, STORAGE_KEY: 'synthetic',
    withAuthRecovery: async (operation, _client, _userId, current) => current && !current() ? { error: new Error('changed') } : operation(),
    authSessionKey: s => s?.user?.id || 'signed-out', lastAuthSessionKey: 'user-a',
    resetPhotoViewer: vi.fn(), renderWallpapers: vi.fn(),
  };
  vm.createContext(context);
  vm.runInContext(section('function toRemote(', 'function toGrowthRemote('), context);
  if (app.includes('function resetEventDraft(')) vm.runInContext(section('function resetEventDraft(', 'async function storeEvent('), context);
  vm.runInContext(section('async function storeEvent(', 'function renderGrowth('), context);
  const open = () => { context.openEventDialog(); $('#eventTitle').value = 'family A draft'; $('#eventNote').value = 'private A note'; };
  const switchAccount = () => { context.state.session = { user: { id: 'user-b' } }; context.state.household = { id: 'home-b' }; };
  return { context, $, write, remove, open, switchAccount, save: () => context.saveEvent({ preventDefault() {} }) };
}

test.each(['user', 'household', 'reload'])('a draft opened before %s changes cannot be saved', async change => {
  const h = harness(); h.open();
  if (change === 'user') h.switchAccount();
  if (change === 'household') h.context.state.household = { id: 'home-b' };
  if (change === 'reload') h.context.bootstrapRequestId++;
  await h.save();
  expect(h.write).not.toHaveBeenCalled();
  expect(h.context.state.events).toEqual([]);
  expect(h.$('#eventNote').value).toBe('');
});

test.each([null, { user: { id: 'user-b' } }])('auth change clears the open draft before deferred loading', session => {
  const h = harness(); h.open(); h.context.session = session;
  vm.runInContext(section('        const nextKey = authSessionKey(session);', '\n      });'), h.context);
  expect(h.$('#eventDialog').open).toBe(false);
  expect(h.$('#eventTitle').value).toBe('');
  expect(h.$('#eventNote').value).toBe('');
});

test('token refresh for the same user preserves an unsaved draft', () => {
  const h = harness(); h.open(); h.context.session = { user: { id: 'user-a' } };
  vm.runInContext(section('        const nextKey = authSessionKey(session);', '\n      });'), h.context);
  expect(h.$('#eventDialog').open).toBe(true);
  expect(h.$('#eventNote').value).toBe('private A note');
});

test('late save response does not append an old draft to a new household', async () => {
  const h = harness(), response = deferred(); h.open(); h.write.mockReturnValue(response.promise);
  const pending = h.save(); h.switchAccount(); h.context.state.events = [{ id: 'new-event' }];
  response.resolve({ error: null }); await pending;
  expect(h.context.state.events).toEqual([{ id: 'new-event' }]);
  expect(h.context.render).not.toHaveBeenCalled();
  expect(h.context.toast).not.toHaveBeenCalled();
});

test('normal save uses the original account and remains retryable after a network failure', async () => {
  const h = harness(); h.open(); h.write.mockRejectedValueOnce(new Error('offline'));
  await h.save();
  expect(h.$('#eventNote').value).toBe('private A note');
  expect(h.$('#eventDialog').open).toBe(true);
  expect(h.$('#eventSubmitButton').disabled).toBe(false);
  await h.save();
  expect(h.write).toHaveBeenLastCalledWith(expect.objectContaining({ household_id: 'home-a', created_by: 'user-a', note: 'private A note' }));
  expect(h.context.state.events).toHaveLength(1);
  expect(h.$('#eventDialog').open).toBe(false);
});

test('auth recovery cannot send an old payload after the account switches', async () => {
  const h = harness(); h.open();
  h.context.withAuthRecovery = async (operation, _client, _userId, current) => {
    h.switchAccount();
    return current && !current() ? { error: new Error('changed') } : operation();
  };
  await h.save();
  expect(h.write).not.toHaveBeenCalled();
});

test('a stale edit cannot delete or mutate the next family state', async () => {
  const h = harness(); h.open(); h.$('#eventId').value = 'old-event'; h.switchAccount();
  await h.context.deleteEvent();
  expect(h.remove).not.toHaveBeenCalled();
});

test('an old save cannot unlock the next account save after an auth change', async () => {
  const h = harness(), oldResponse = deferred(), newResponse = deferred(); h.open();
  h.write.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(newResponse.promise);
  const oldSave = h.save();
  h.context.session = { user: { id: 'user-b' } };
  vm.runInContext(section('        const nextKey = authSessionKey(session);', '\n      });'), h.context);
  h.context.state.household = { id: 'home-b' };
  h.open(); const newSave = h.save();
  oldResponse.resolve({ error: null }); await oldSave;
  expect(h.$('#eventSubmitButton').disabled).toBe(true);
  expect(h.$('#eventDialog').open).toBe(true);
  expect(h.context.state.events).toEqual([]);
  newResponse.resolve({ error: null }); await newSave;
  expect(h.context.state.events).toHaveLength(1);
  expect(h.$('#eventSubmitButton').disabled).toBe(false);
});

test('late deletion response does not close or rerender a newly opened editor', async () => {
  const h = harness(), response = deferred(); h.open(); h.$('#eventId').value = 'old-event';
  h.remove.mockReturnValue(response.promise);
  const pending = h.context.deleteEvent();
  h.context.session = { user: { id: 'user-b' } };
  vm.runInContext(section('        const nextKey = authSessionKey(session);', '\n      });'), h.context);
  h.context.state.household = { id: 'home-b' }; h.open();
  h.context.state.events = [{ id: 'other-event' }]; h.$('#eventDialog').close.mockClear();
  response.resolve({ error: null }); await pending;
  expect(h.context.state.events).toEqual([{ id: 'other-event' }]);
  expect(h.$('#eventDialog').close).not.toHaveBeenCalled();
  expect(h.context.renderCalendar).not.toHaveBeenCalled();
});

test.each(['save', 'delete'])('a pending %s prevents overlapping mutations and replacing the editor', async action => {
  const h = harness(), response = deferred(); h.open(); h.$('#eventId').value = 'old-event';
  const firstWrite = action === 'save' ? h.write : h.remove;
  firstWrite.mockReturnValue(response.promise);
  const pending = action === 'save' ? h.save() : h.context.deleteEvent();
  await h.save(); await h.context.deleteEvent(); h.context.openEventDialog();
  expect(h.write).toHaveBeenCalledTimes(action === 'save' ? 1 : 0);
  expect(h.remove).toHaveBeenCalledTimes(action === 'delete' ? 1 : 0);
  expect(h.$('#eventId').value).toBe('old-event');
  response.resolve({ error: null }); await pending;
});
