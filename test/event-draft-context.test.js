import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const app = readFileSync('app.js', 'utf8');
const notifications = readFileSync('notification-center.js', 'utf8');
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

// Compose the real reminder installer with the real editor functions, as classic
// scripts do in the browser. A core-only test misses arguments lost by wrappers.
function withReminders(h = harness()) {
  const { context, $ } = h;
  context.window = Object.assign(context, context.window);
  context.document.querySelector = $;
  $('#eventForm').querySelector = () => null;
  $('#eventTimeField').insertAdjacentElement = vi.fn();
  const preset = $('#eventReminderPreset'), custom = $('#eventReminderCustomAt');
  preset.addEventListener = vi.fn();
  context.createReminderField = () => ({ querySelector: $ });
  context.syncCustomField = vi.fn();
  context.EVENT_PRESETS = new Set(['none', 'at-time', 'before-10', 'before-60', 'custom']);
  context.store = { eventReminders: {} };
  context.eventReminderConfig = id => context.store.eventReminders[id] || { preset: 'none', customAt: '', enabled: false };
  context.ensureScope = vi.fn();
  context.persist = vi.fn();
  context.refresh = vi.fn();
  const start = notifications.indexOf('  const installEventReminderField =');
  const end = notifications.indexOf('  const waitForDialogClose =', start);
  vm.runInContext(notifications.slice(start, end) + '\ninstallEventReminderField();', context);
  return { ...h, preset, custom };
}

test.each(['new', 'existing'])('the installed reminder module saves a %s event and its selected reminder', async kind => {
  const h = withReminders();
  const original = { id: 'existing-id', title: 'before', date: '2026-11-12', member: 'family' };
  if (kind === 'existing') h.context.state.events = [original];
  h.context.openEventDialog(kind === 'existing' ? original : null);
  h.$('#eventTitle').value = 'after';
  h.preset.value = 'before-10';
  await h.save();
  const id = kind === 'existing' ? original.id : 'event-id';
  expect(h.write).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id, title: 'after', household_id: 'home-a' }));
  expect(h.context.state.events).toEqual([expect.objectContaining({ id, title: 'after' })]);
  expect(h.context.store.eventReminders[id]).toEqual({ preset: 'before-10', customAt: '', enabled: true });
  expect(h.$('#eventDialog').open).toBe(false);
});

test('reminder-enabled demo edits survive local persistence', async () => {
  const h = withReminders(); h.context.state.supabase = null;
  const original = { id: 'demo-event', title: 'before', date: '2026-11-12', member: 'family' };
  h.context.state.events = [original]; h.context.openEventDialog(original);
  h.$('#eventTitle').value = 'after'; await h.save();
  expect(h.write).not.toHaveBeenCalled();
  const stored = JSON.parse(h.context.localStorage.setItem.mock.calls.at(-1)[1]);
  expect(stored).toEqual([expect.objectContaining({ id: original.id, title: 'after' })]);
});

test('reminder settings are captured with the submitted event, not read after a slow save', async () => {
  const h = withReminders(), response = deferred(); h.open();
  h.preset.value = 'custom'; h.custom.value = '2026-11-12T12:00';
  h.write.mockReturnValue(response.promise); const pending = h.save();
  h.preset.value = 'none'; h.custom.value = '';
  response.resolve({ error: null }); await pending;
  expect(h.context.store.eventReminders['event-id']).toEqual({ preset: 'custom', customAt: '2026-11-12T12:00', enabled: true });
});

test('an attempted open during saving does not reset the active reminder fields', async () => {
  const h = withReminders(), response = deferred(); h.open();
  h.preset.value = 'before-60'; h.write.mockReturnValue(response.promise);
  const pending = h.save(); h.context.openEventDialog();
  expect(h.preset.value).toBe('before-60');
  response.resolve({ error: null }); await pending;
});

test('a failed wrapped save keeps the draft and reminder retryable', async () => {
  const h = withReminders(); h.open(); h.preset.value = 'at-time';
  h.write.mockResolvedValueOnce({ error: { message: 'offline' } });
  await h.save();
  expect(h.$('#eventDialog').open).toBe(true);
  expect(h.context.persist).not.toHaveBeenCalled();
  expect(h.preset.value).toBe('at-time');
  await h.save();
  expect(h.context.store.eventReminders['event-id']?.preset).toBe('at-time');
  expect(h.$('#eventDialog').open).toBe(false);
});

test('account switching during a wrapped save cannot persist reminders or events into the new family', async () => {
  const h = withReminders(), response = deferred(); h.open(); h.preset.value = 'before-10';
  h.write.mockReturnValue(response.promise); const pending = h.save();
  h.switchAccount(); h.context.store = { eventReminders: {} };
  response.resolve({ error: null }); await pending;
  expect(h.context.store.eventReminders).toEqual({});
  expect(h.context.persist).not.toHaveBeenCalled();
  expect(h.context.refresh).not.toHaveBeenCalled();
  expect(h.context.state.events).toEqual([]);
});

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
