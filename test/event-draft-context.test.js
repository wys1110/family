import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const app = readFileSync('app.js', 'utf8');
const notifications = readFileSync('notification-center.js', 'utf8');
const section = (a, b) => app.slice(app.indexOf(a), app.indexOf(b, app.indexOf(a)));
const existing = {
  id: 'existing-id', title: 'before', event_date: '2026-11-12', event_end_date: '2026-11-12',
  member: '아빠', event_time: '09:30:27.123456', note: null, updated_at: '2026-11-12T00:00:01.123456+00:00',
};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness() {
  const nodes = new Map();
  const $ = key => {
    if (!nodes.has(key)) {
      const node = { value: '', open: false, events: {}, addEventListener(type, fn) { this.events[type] = fn; }, classList: { toggle() {} }, setAttribute() {} };
      node.showModal = vi.fn(() => { node.open = true; });
      node.close = vi.fn(() => { node.open = false; node.events.close?.(); });
      nodes.set(key, node);
    }
    return nodes.get(key);
  };
  $('#eventForm').reset = () => { for (const node of nodes.values()) node.value = ''; };
  const write = vi.fn(async payload => ({ data: { ...payload, updated_at: existing.updated_at }, error: null }));
  const update = vi.fn(async (patch, filters) => {
    if (filters.some(([key, value]) => key !== 'household_id' && existing[key] !== value)) return { data: null, error: null };
    return { data: { ...existing, ...patch }, error: null };
  });
  const lookup = vi.fn();
  const remove = vi.fn(async () => ({ data: { id: existing.id }, error: null }));
  const query = finish => {
    const filters = [];
    const builder = {
      eq(field, value) { filters.push([field, value]); return this; },
      is(field, value) { filters.push([field, value]); return this; },
      select() { return this; },
      maybeSingle: () => finish(filters),
      single: () => finish(filters),
      then(yes, no) { return Promise.resolve(finish(filters)).then(yes, no); },
    };
    return builder;
  };
  const client = { from: () => ({
    insert: payload => query(() => write(payload)),
    update: patch => query(filters => update(patch, filters)),
    select: () => query(lookup),
    delete: () => query(remove),
  }) };
  const context = {
    $, eventDialogContext: null, eventDialogReturnPosition: null, eventSaveInProgress: false, bootstrapRequestId: 1,
    calendarRefreshRequest: null, refreshCalendarEvents: vi.fn(), finishEventDrag: vi.fn(), normalizeEvent: event => event,
    state: { supabase: client, session: { user: { id: 'user-a' } }, household: { id: 'home-a' }, selectedDate: '2026-11-12', events: [], familyMembers: [] },
    window: { scrollX: 0, scrollY: 0, setTimeout: vi.fn(), scrollTo: vi.fn(), dispatchEvent: vi.fn() },
    bootstrapRetryTimer: null, clearTimeout: vi.fn(), CustomEvent: class { constructor(type) { this.type = type; } },
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
  vm.runInContext(section('function setAuthUser(', 'function withAuthRecovery('), context);
  vm.runInContext(section('const EVENT_FIELDS', 'function readHouseholdEvents('), context);
  vm.runInContext(section('function fromRemote(', 'function toGrowthRemote('), context);
  vm.runInContext(section('function resetEventDraft(', 'function renderGrowth('), context);
  vm.runInContext(section('  $("#eventForm").addEventListener("submit", saveEvent);', '  $("#deleteEventButton").addEventListener("click", deleteEvent);'), context);
  const open = () => { context.openEventDialog(); $('#eventTitle').value = 'family A draft'; $('#eventNote').value = 'private A note'; };
  const switchAccount = () => { context.state.session = { user: { id: 'user-b' } }; context.state.household = { id: 'home-b' }; };
  return { context, $, write, update, lookup, remove, open, switchAccount, save: () => $('#eventForm').events.submit({ preventDefault() {} }) };
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
  const original = h.context.fromRemote(existing);
  if (kind === 'existing') h.context.state.events = [original];
  h.context.openEventDialog(kind === 'existing' ? original : null);
  h.$('#eventTitle').value = 'after';
  h.preset.value = 'before-10';
  await h.save();
  const id = kind === 'existing' ? original.id : 'event-id';
  if (kind === 'existing') {
    expect(h.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title: 'after' }), expect.any(Array));
    expect(h.write).not.toHaveBeenCalled();
  } else {
    expect(h.write).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id, title: 'after', household_id: 'home-a' }));
  }
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
  response.resolve({ data: h.write.mock.calls[0][0], error: null }); await pending;
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
  expect(h.context.state.authTransitionPending).toBe(true);
  expect(h.context.window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'family:auth-user-changed' }));
  expect(h.context.window.dispatchEvent.mock.invocationCallOrder[0]).toBeLessThan(h.context.window.setTimeout.mock.invocationCallOrder[0]);
});

test('token refresh for the same user preserves an unsaved draft', () => {
  const h = harness(); h.open(); h.context.session = { user: { id: 'user-a' } };
  vm.runInContext(section('        const nextKey = authSessionKey(session);', '\n      });'), h.context);
  expect(h.$('#eventDialog').open).toBe(true);
  expect(h.$('#eventNote').value).toBe('private A note');
  expect(h.context.window.dispatchEvent).not.toHaveBeenCalled();
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
  const h = harness(); h.context.openEventDialog(h.context.fromRemote(existing)); h.switchAccount();
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
  newResponse.resolve({ data: h.write.mock.calls[1][0], error: null }); await newSave;
  expect(h.context.state.events).toHaveLength(1);
  expect(h.$('#eventSubmitButton').disabled).toBe(false);
});

test('late deletion response does not close or rerender a newly opened editor', async () => {
  const h = harness(), response = deferred(); h.context.openEventDialog(h.context.fromRemote(existing));
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

test('another editor cannot restore an event while its completed deletion response is pending', async () => {
  const a = harness(), b = harness(), response = deferred();
  const openExisting = h => {
    const event = h.context.fromRemote(existing);
    h.context.state.events = [event];
    h.context.openEventDialog(event);
  };
  openExisting(a);
  openExisting(b);
  let server = existing;
  a.remove.mockImplementation(() => {
    server = null;
    return response.promise;
  });
  b.update.mockImplementation(async patch => {
    if (!server) return { data: null, error: null };
    server = { ...server, ...patch };
    return { data: server, error: null };
  });

  const pending = a.context.deleteEvent();
  expect(server).toBeNull();
  b.$('#eventTitle').value = 'updated by B';
  await b.save();
  expect(b.update).toHaveBeenCalledOnce();
  expect(b.$('#eventConflict').hidden).toBe(false);
  expect(b.$('#eventTitle').value).toBe('updated by B');
  response.resolve({ data: { id: existing.id }, error: null });
  await pending;
  expect(a.context.state.events).toEqual([]);
  expect(a.context.renderCalendar).toHaveBeenCalledOnce();
  expect(server).toBeNull();
});

test.each(['save', 'delete'])('a pending %s prevents overlapping mutations and replacing the editor', async action => {
  const h = harness(), response = deferred();
  if (action === 'save') h.open(); else h.context.openEventDialog(h.context.fromRemote(existing));
  const firstWrite = action === 'save' ? h.write : h.remove;
  firstWrite.mockReturnValue(response.promise);
  const pending = action === 'save' ? h.save() : h.context.deleteEvent();
  await h.save(); await h.context.deleteEvent(); h.context.openEventDialog();
  expect(h.write).toHaveBeenCalledTimes(action === 'save' ? 1 : 0);
  expect(h.remove).toHaveBeenCalledTimes(action === 'delete' ? 1 : 0);
  expect(h.$('#eventId').value).toBe(action === 'delete' ? existing.id : '');
  response.resolve({ error: null }); await pending;
});

test.each([
  ['newer edit or deletion', { data: null, error: null }],
  ['permission change', { status: 403, error: { code: '42501' } }],
])('an edit facing %s preserves the draft, then refreshes on close', async (_reason, result) => {
  const h = withReminders();
  const event = h.context.fromRemote(existing);
  h.context.state.events = [event];
  h.context.openEventDialog(event);
  h.$('#eventNote').value = 'keep this draft';
  h.update.mockResolvedValue(result);
  await h.save();
  expect(h.update.mock.calls).toEqual([[expect.objectContaining({
    title: existing.title, event_time: existing.event_time, note: 'keep this draft',
  }), [
    ['household_id', 'home-a'], ['id', existing.id], ['title', existing.title], ['event_date', existing.event_date],
    ['event_end_date', existing.event_end_date], ['event_time', existing.event_time], ['member', existing.member],
    ['note', existing.note], ['updated_at', existing.updated_at],
  ]]]);
  expect(h.$('#eventDialog').open).toBe(true);
  expect(h.$('#eventConflict').hidden).toBe(false);
  expect(h.$('#eventNote').value).toBe('keep this draft');
  expect(h.$('#eventSubmitButton').disabled).toBe(true);
  expect(h.$('#deleteEventButton').disabled).toBe(true);
  expect(h.context.state.events).toEqual([event]);
  expect(h.context.persist).not.toHaveBeenCalled();
  await h.save();
  await h.context.deleteEvent();
  expect(h.update).toHaveBeenCalledOnce();
  expect(h.remove).not.toHaveBeenCalled();
  expect(h.write).not.toHaveBeenCalled();
  h.$('#eventDialog').close();
  expect(h.context.refreshCalendarEvents).toHaveBeenCalledOnce();
});

test('a new event with a lost insert response reuses its ID and verifies the existing record', async () => {
  const h = harness();
  h.open();
  h.write.mockRejectedValueOnce(Error('network response lost'));
  h.write.mockResolvedValueOnce({ error: { code: '23505' } });
  await h.save();
  expect(h.$('#eventDialog').open).toBe(true);
  const payload = h.write.mock.calls[0][0];
  h.lookup.mockResolvedValueOnce({ data: { ...payload, updated_at: existing.updated_at }, error: null });
  await h.save();
  expect(h.write.mock.calls).toEqual([[payload], [payload]]);
  expect(h.lookup).toHaveBeenCalledExactlyOnceWith([['id', payload.id], ['household_id', 'home-a'], ['created_by', 'user-a']]);
  expect(h.context.state.events).toEqual([expect.objectContaining({ id: payload.id })]);
  expect(h.$('#eventDialog').open).toBe(false);
});

test('deletion uses the original editor fields to protect a remotely modified event', async () => {
  const h = harness();
  const opened = h.context.fromRemote(existing);
  h.context.state.events = [opened];
  h.context.openEventDialog(opened);
  h.$('#eventNote').value = 'unsaved note';
  let current = { ...existing, note: 'changed on the other device' };
  h.remove.mockImplementation(async filters => {
    if (!filters.filter(([key]) => key !== 'household_id').every(([key, value]) => current[key] === value)) {
      return { data: null, error: null };
    }
    current = null;
    return { data: { id: existing.id }, error: null };
  });
  await h.context.deleteEvent();
  expect(current?.note).toBe('changed on the other device');
  expect(h.$('#eventDialog').open).toBe(true);
  expect(h.$('#eventNote').value).toBe('unsaved note');
  expect(h.$('#eventConflict').hidden).toBe(false);
});

test.each([
  ['deleted or no longer visible', { data: null, error: null }],
  ['permission denied', { status: 403, error: { code: '42501' } }],
])('a deletion with an event %s reports a conflict instead of success', async (_reason, response) => {
  const h = harness();
  const opened = h.context.fromRemote(existing);
  h.context.openEventDialog(opened);
  h.context.state.events = [opened];
  h.remove.mockResolvedValue(response);
  await h.context.deleteEvent();
  expect(h.context.toast).not.toHaveBeenCalledWith('일정을 삭제했어요');
  expect(h.$('#eventDialog').open).toBe(true);
  expect(h.$('#eventSubmitButton').disabled).toBe(true);
  expect(h.$('#deleteEventButton').disabled).toBe(true);
  expect(h.context.state.events).toEqual([opened]);
  h.$('#eventDialog').close();
  expect(h.context.refreshCalendarEvents).toHaveBeenCalledOnce();
});

test('a deletion with a transient failure keeps the editor available for retry', async () => {
  const h = harness();
  const opened = h.context.fromRemote(existing);
  h.context.openEventDialog(opened);
  h.context.state.events = [opened];
  h.remove.mockResolvedValueOnce({ error: new Error('offline') });
  await h.context.deleteEvent();
  expect(h.context.toast).toHaveBeenCalledWith('삭제하지 못했어요');
  expect(h.$('#deleteEventButton').disabled).toBeFalsy();
  expect(h.$('#eventDialog').open).toBe(true);
  await h.context.deleteEvent();
  expect(h.$('#eventDialog').open).toBe(false);
  expect(h.context.state.events).toEqual([]);
});
