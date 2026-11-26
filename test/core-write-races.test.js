import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync('app.js', 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function quickHarness(write) {
  let id = 0;
  const controls = [{ disabled: false }, { disabled: false }, { disabled: true }];
  const dialog = { close: vi.fn(), querySelectorAll: () => controls };
  const context = {
    quickGrowthSaveInProgress: false, bootstrapRequestId: 1, activeQuickCategory: '수유·이유식',
    activeQuickPresets: [{ title: '젖병 수유', label: '80 ml', feedingMl: 80 }, { title: '젖병 수유', label: '100 ml', feedingMl: 100 }],
    state: { activeBabyId: 'baby', growthEntries: [], household: { id: 'home' }, session: { user: { id: 'user' } }, supabase: { from: () => ({ upsert: write }) } },
    $: () => dialog, uid: () => String(++id), dateKey: () => '2026-10-13', toGrowthRemote: (entry) => entry,
    withAuthRecovery: (operation) => operation(), dispatchGrowthEntrySaved: vi.fn(), renderGrowth: vi.fn(), showGrowthComplete: vi.fn(), toast: vi.fn(), console,
  };
  vm.createContext(context);
  vm.runInContext(section('async function saveGrowthPresetFromEvent(', 'function defaultGrowthTitle('), context);
  return { context, controls, dialog, click: (index) => context.saveGrowthPresetFromEvent({ target: { closest: () => ({ dataset: { presetIndex: String(index) } }) } }) };
}

test('one quick record saves while all preset and adaptive feeding controls are locked', async () => {
  const response = deferred(), write = vi.fn(() => response.promise), h = quickHarness(write);
  const first = h.click(0), second = h.click(1);
  expect(write).toHaveBeenCalledTimes(1);
  expect(h.controls.every((control) => control.disabled)).toBe(true);
  response.resolve({ error: null });
  await Promise.all([first, second]);
  expect(h.context.state.growthEntries).toHaveLength(1);
  expect(h.controls.map((control) => control.disabled)).toEqual([false, false, true]);
});

test.each(['returned', 'thrown'])('quick save %s failure restores controls and allows retry', async (mode) => {
  const write = vi.fn().mockImplementationOnce(async () => {
    if (mode === 'thrown') throw new Error('offline');
    return { error: new Error('offline') };
  }).mockResolvedValue({ error: null });
  const h = quickHarness(write);
  await h.click(0);
  expect(h.context.state.growthEntries).toHaveLength(0);
  expect(h.controls.map((control) => control.disabled)).toEqual([false, false, true]);
  await h.click(1);
  expect(h.context.state.growthEntries).toHaveLength(1);
  expect(h.context.state.growthEntries[0].feedingMl).toBe(100);
});

test('quick response cannot append or close the next account dialog after a context switch', async () => {
  const response = deferred(), h = quickHarness(() => response.promise);
  const pending = h.click(0);
  h.context.state.session = { user: { id: 'next-user' } };
  h.context.state.household = { id: 'next-home' };
  h.context.state.growthEntries = [];
  response.resolve({ error: null });
  await pending;
  expect(h.context.state.growthEntries).toEqual([]);
  expect(h.dialog.close).not.toHaveBeenCalled();
  expect(h.context.renderGrowth).not.toHaveBeenCalled();
  expect(h.context.dispatchGrowthEntrySaved).not.toHaveBeenCalled();
});

function moveHarness(write) {
  const row = {
    id: 'event', title: 'synthetic title', member: '아빠', event_date: '2026-10-13', event_end_date: '2026-10-14',
    event_time: null, note: null, updated_at: '2026-10-01T00:00:00Z', household_id: 'home',
  };
  let stored = row;
  const send = async (patch, filters) => {
    if (write) {
      const result = await write(patch);
      if (result.error || Object.hasOwn(result, 'data')) return result;
    }
    if (!stored || filters.some(([key, value]) => stored[key] !== value)) return { data: null, error: null };
    stored = { ...stored, ...patch };
    return { data: stored, error: null };
  };
  const requests = vi.fn(send);
  const read = vi.fn(async () => ({ data: stored ? [stored] : [], error: null }));
  const client = { from: () => ({
    select: () => ({ eq: () => ({ order: read }) }),
    update: patch => {
      const filters = [];
      const run = () => requests(patch, filters);
      return {
        eq(key, value) { filters.push([key, value]); return this; },
        select() { return this; },
        maybeSingle: run,
        then(yes, no) { return run().then(yes, no); },
      };
    },
  }) };
  const context = {
    eventMovePromises: new Map(), bootstrapRequestId: 1, calendarRefreshRequest: null, dragState: null,
    state: { events: [], selectedDate: '2026-10-10', viewDate: new Date('2026-10-01T12:00:00'), activeView: 'calendar',
      household: { id: 'home' }, session: { user: { id: 'user' } }, supabase: client },
    withAuthRecovery: (operation) => operation(), dayDistance: (start, end) => Math.round((new Date(end) - new Date(start)) / 86400000),
    addDays: (date, count) => new Date(new Date(date).getTime() + count * 86400000).toISOString().slice(0, 10),
    parseDate: (date) => new Date(`${date}T12:00:00`), startOfMonth: (date) => date, render: vi.fn(), toast: vi.fn(), persistLocal: vi.fn(),
    normalizeEvent: (event) => event, refreshCalendarEvents: vi.fn(), console,
    window: { innerWidth: 800, innerHeight: 800, scrollBy() {}, dispatchEvent() {} }, navigator: {},
    memberColor: () => '#000', escapeHtml: value => value, authSessionKey: session => session?.user?.id,
    clearTimeout() {}, bootstrapRetryTimer: null, CustomEvent: class {},
  };
  const classes = () => ({ add: vi.fn(), remove: vi.fn() });
  const ghost = { style: { setProperty() {} }, classList: classes() };
  const body = { classList: classes() };
  const target = { dataset: { date: '2026-10-15' }, classList: classes() };
  const handle = () => {
    const listeners = new Map();
    return {
      addEventListener: (type, run) => listeners.set(type, run),
      removeEventListener: type => listeners.delete(type),
      setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn(),
      send(type, pointerId) { return listeners.get(type)?.({ type, pointerId, clientX: 300, clientY: 300, preventDefault() {} }); },
    };
  };
  context.document = { body, querySelectorAll: () => [target], elementFromPoint: () => ({ closest: () => target }) };
  context.$ = () => ghost;
  vm.createContext(context);
  vm.runInContext(section('function setAuthUser(', 'function withAuthRecovery('), context);
  vm.runInContext(section('const EVENT_FIELDS', 'function readHouseholdEvents('), context);
  vm.runInContext(section('function fromRemote(', 'function toGrowthRemote('), context);
  vm.runInContext(section('function bindDragHandle(', 'async function storeEvent('), context);
  const item = context.fromRemote(row);
  context.state.events = [item];
  const enableCalendarRefresh = () => {
    const nodes = { '#calendarView': {}, '#appShell': { ariaBusy: 'false' },
      '#eventDialog': { open: false }, '#bulkEventDialog': { open: false } };
    context.$ = selector => nodes[selector] ?? (selector === '#dragGhost' ? ghost : null);
    Object.assign(context, {
      DEMO_MODE: false, completedBootstrapRequestId: 1, eventSaveInProgress: false, bulkEventSaveInProgress: false,
      renderHeader: vi.fn(), renderCalendar: vi.fn(), renderAgenda: vi.fn(), renderUpcomingEvents: vi.fn(),
    });
    context.window.FAMILY_DATA = { readAll: query => query() };
    vm.runInContext(section('function isCurrentBootstrap(', 'function readLocalJson('), context);
    vm.runInContext(section('function readHouseholdEvents(', 'function fromRemote('), context);
  };
  return { context, item, requests, read, handle, ghost, body, enableCalendarRefresh, get server() { return stored; },
    externalChange: changes => { stored = changes ? { ...stored, ...changes } : null; } };
}

test.each([
  ['start and end', '2026-10-20', '2026-10-23'],
  ['end only', '2026-10-13', '2026-10-23'],
])('a stale move protects a %s change made by another device', async (_range, start, end) => {
  const h = moveHarness();
  const source = h.handle();
  h.context.bindDragHandle(source, h.item);
  source.send('pointerdown', 1);
  source.send('pointermove', 1);
  h.externalChange({ event_date: start, event_end_date: end });
  await source.send('pointerup', 1);
  expect(h.server.event_date).toBe(start);
  expect(h.server.event_end_date).toBe(end);
  expect(h.context.state.selectedDate).toBe('2026-10-10');
  expect(h.context.refreshCalendarEvents).toHaveBeenCalledOnce();
});

test('undo preserves a date range moved by another device after the first move', async () => {
  const h = moveHarness();
  await h.context.moveEventToDate('event', '2026-10-15');
  const undo = h.context.toast.mock.calls[0][1];
  h.externalChange({ event_date: '2026-10-19', event_end_date: '2026-10-22' });
  await undo.run();
  await flush();
  expect(h.server.event_date).toBe('2026-10-19');
  expect(h.server.event_end_date).toBe('2026-10-22');
});

test('successful date-only moves and undos keep another device’s latest note and revision', async () => {
  const h = moveHarness();
  h.externalChange({ note: 'The second device updated the note' });
  await h.context.moveEventToDate('event', '2026-10-15');
  expect(h.requests.mock.calls[0][1]).toEqual([
    ['household_id', 'home'], ['id', 'event'], ['event_date', '2026-10-13'], ['event_end_date', '2026-10-14'],
  ]);
  expect(h.item.note).toBe('The second device updated the note');
  expect(h.item.remote).toEqual(h.server);
  expect(h.server.event_end_date).toBe('2026-10-16');
  h.externalChange({ note: 'Updated again', updated_at: '2026-10-19T00:01:23Z' });
  await h.context.toast.mock.calls[0][1].run();
  expect(h.item.note).toBe('Updated again');
  expect(h.item.remote).toEqual(h.server);
  expect(h.server.event_date).toBe('2026-10-13');
  expect(h.server.event_end_date).toBe('2026-10-14');
});

test.each([
  ['move', { title: 'Device B changed the title and dates', event_date: '2026-10-22', event_end_date: '2026-10-23' }],
  ['move', null],
  ['undo', { title: 'Device B changed the title and dates', event_date: '2026-10-22', event_end_date: '2026-10-23' }],
  ['undo', null],
])('the calendar refreshes after a delayed %s when another device leaves %j', async (action, changes) => {
  const mutationResponse = deferred();
  const write = vi.fn();
  const h = moveHarness(write);
  let undo;
  if (action === 'undo') {
    write.mockResolvedValueOnce({ error: null });
    await h.context.moveEventToDate('event', '2026-10-15');
    undo = h.context.toast.mock.calls[0][1];
  }
  h.enableCalendarRefresh();
  let committed;
  write.mockImplementationOnce(patch => {
    h.externalChange(patch);
    committed = { ...h.server };
    return mutationResponse.promise;
  });
  const drag = () => {
    const source = h.handle();
    h.context.bindDragHandle(source, h.item);
    source.send('pointerdown', 1);
    source.send('pointermove', 1);
    return source.send('pointerup', 1);
  };
  const pending = undo ? undo.run() : drag();
  expect(committed.event_date).toBe(action === 'undo' ? '2026-10-13' : '2026-10-15');

  h.externalChange(changes);
  const latest = h.server;
  await h.context.refreshCalendarEvents(); // Focus while the move response is pending.
  expect(h.read).not.toHaveBeenCalled();
  mutationResponse.resolve({ data: committed, error: null });
  await pending;
  await flush();

  expect(h.read).toHaveBeenCalledOnce();
  expect(h.server).toEqual(latest);
  expect(h.context.state.events).toEqual(latest ? [expect.objectContaining({
    title: latest.title, date: latest.event_date, endDate: latest.event_end_date, remote: latest,
  })] : []);
  expect(h.context.renderCalendar).toHaveBeenCalledOnce();
  expect(h.context.renderAgenda).toHaveBeenCalledOnce();
  expect(h.context.renderUpcomingEvents).toHaveBeenCalledOnce();
});

test('an older calendar read cannot replace the view after reconciling a move', async () => {
  const oldRead = deferred(), mutationResponse = deferred();
  const h = moveHarness(patch => {
    h.externalChange(patch);
    return mutationResponse.promise;
  });
  h.enableCalendarRefresh();
  h.read.mockReturnValueOnce(oldRead.promise);
  const initial = h.server;
  const staleRefresh = h.context.refreshCalendarEvents();
  const move = h.context.moveEventToDate('event', '2026-10-15');
  const committed = h.server;
  h.externalChange({ title: 'Device B changed the title' });
  mutationResponse.resolve({ data: committed, error: null });
  await move;
  await flush();
  expect(h.context.state.events[0].title).toBe(h.server.title);

  oldRead.resolve({ data: [initial], error: null });
  await staleRefresh;
  expect(h.read).toHaveBeenCalledTimes(2);
  expect(h.context.state.events[0].remote).toEqual(h.server);
  expect(h.context.renderCalendar).toHaveBeenCalledOnce();
});

test('a move of a deleted event rolls back without recreating it or showing success', async () => {
  const h = moveHarness();
  h.externalChange(null);
  await h.context.moveEventToDate('event', '2026-10-15');
  expect(h.server).toBeNull();
  expect(h.item.date).toBe('2026-10-13');
  expect(h.context.toast.mock.calls).toEqual([['다른 곳에서 일정이 변경됐어요. 최신 일정을 확인해 주세요']]);
  expect(h.context.refreshCalendarEvents).toHaveBeenCalledOnce();
});

test.each(['pointercancel', 'lostpointercapture', 'account'])('a drag ends safely on %s', async reason => {
  const h = moveHarness(), source = h.handle(), secondary = h.handle();
  h.context.bindDragHandle(source, h.item);
  h.context.bindDragHandle(secondary, h.item);
  source.send('pointerdown', 1);
  source.send('pointermove', 1);
  source.send('pointercancel', 2);
  secondary.send('pointerdown', 2);
  expect(h.context.dragState.pointerId).toBe(1);
  expect(h.requests).not.toHaveBeenCalled();
  if (reason === 'account') h.context.setAuthUser({ user: { id: 'next-user' } });
  else source.send(reason, 1);
  await source.send('pointerup', 1);
  expect(h.context.dragState).toBeNull();
  expect(h.ghost.classList.remove).toHaveBeenCalledWith('show');
  expect(h.body.classList.remove).toHaveBeenCalledWith('dragging-event');
  if (reason === 'account') expect(source.releasePointerCapture).toHaveBeenCalledWith(1);
  expect(h.requests).not.toHaveBeenCalled();
});

test('a failed move leaves a newer calendar selection in place', async () => {
  const delayed = deferred();
  const h = moveHarness(() => delayed.promise);
  const pending = h.context.moveEventToDate('event', '2026-10-15');
  expect(h.context.state.selectedDate).toBe('2026-10-15');
  h.context.state.selectedDate = '2026-11-01';
  h.context.state.viewDate = new Date('2026-11-01');
  delayed.resolve({ error: new Error('offline') });
  await pending;
  expect(h.context.state.selectedDate).toBe('2026-11-01');
  expect(h.context.state.viewDate).toEqual(new Date('2026-11-01'));
  expect(h.item.date).toBe('2026-10-13');
});

test('calendar moves run in order and the latest requested day wins after an older failure', async () => {
  const firstResponse = deferred(), secondResponse = deferred();
  const write = vi.fn().mockImplementationOnce(() => firstResponse.promise).mockImplementationOnce(() => secondResponse.promise);
  const h = moveHarness(write);
  const first = h.context.moveEventToDate('event', '2026-10-14');
  const second = h.context.moveEventToDate('event', '2026-10-15');
  expect(write).toHaveBeenCalledTimes(1);
  firstResponse.resolve({ error: new Error('offline') });
  await first; await flush();
  expect(write).toHaveBeenCalledTimes(2);
  secondResponse.resolve({ error: null });
  await second;
  expect(h.item.date).toBe('2026-10-15');
  expect(h.item.endDate).toBe('2026-10-16');
  expect(h.context.state.selectedDate).toBe('2026-10-15');
  expect(h.context.eventMovePromises.size).toBe(0);
});

test.each(['returned', 'thrown'])('calendar %s failure rolls back and releases its queue', async (mode) => {
  const write = vi.fn(async () => {
    if (mode === 'thrown') throw new Error('offline');
    return { error: new Error('offline') };
  });
  const h = moveHarness(write);
  await h.context.moveEventToDate('event', '2026-10-15');
  expect(h.item.date).toBe('2026-10-13');
  expect(h.item.endDate).toBe('2026-10-14');
  expect(h.context.eventMovePromises.size).toBe(0);
});

test('account switch discards old move effects and cancels queued old-account writes', async () => {
  const response = deferred(), write = vi.fn(() => response.promise), h = moveHarness(write);
  const first = h.context.moveEventToDate('event', '2026-10-14');
  const queued = h.context.moveEventToDate('event', '2026-10-15');
  h.context.state.session = { user: { id: 'next-user' } };
  h.context.state.household = { id: 'next-home' };
  h.context.state.events = [{ id: 'other', date: '2026-11-01' }];
  h.context.state.selectedDate = '2026-11-01';
  h.context.render.mockClear();
  response.resolve({ error: new Error('offline') });
  await Promise.all([first, queued]);
  expect(write).toHaveBeenCalledTimes(1);
  expect(h.context.state.selectedDate).toBe('2026-11-01');
  expect(h.context.render).not.toHaveBeenCalled();
  expect(h.context.toast).not.toHaveBeenCalled();
  expect(h.context.eventMovePromises.size).toBe(0);
});

test('an old move undo action cannot write in the next account', async () => {
  const write = vi.fn(async () => ({ error: null })), h = moveHarness(write);
  await h.context.moveEventToDate('event', '2026-10-15');
  const undo = h.context.toast.mock.calls[0][1];
  h.context.state.session = { user: { id: 'next-user' } };
  h.context.state.household = { id: 'next-home' };
  undo.run();
  await flush();
  expect(write).toHaveBeenCalledTimes(1);
});

test('deleting another event does not cancel a pending rollback or latest queued move', async () => {
  const firstResponse = deferred(), secondResponse = deferred();
  const write = vi.fn().mockImplementationOnce(() => firstResponse.promise).mockImplementationOnce(() => secondResponse.promise);
  const h = moveHarness(write);
  h.context.state.events.push({ id: 'other', date: '2026-10-13' });
  const first = h.context.moveEventToDate('event', '2026-10-14');
  const latest = h.context.moveEventToDate('event', '2026-10-15');
  h.context.state.events = h.context.state.events.filter((event) => event.id !== 'other');
  firstResponse.resolve({ error: new Error('offline') });
  await first; await flush();
  expect(write).toHaveBeenCalledTimes(2);
  secondResponse.resolve({ error: null });
  await latest;
  expect(h.context.state.events[0].date).toBe('2026-10-15');
  expect(h.context.state.events[0].endDate).toBe('2026-10-16');
  expect(write.mock.calls[1][0].event_date).toBe('2026-10-15');
});

test('deleting another growth record does not discard a successful quick save', async () => {
  const response = deferred(), h = quickHarness(() => response.promise);
  h.context.state.growthEntries.push({ id: 'other' });
  const pending = h.click(0);
  h.context.state.growthEntries = h.context.state.growthEntries.filter((entry) => entry.id !== 'other');
  response.resolve({ error: null });
  await pending;
  expect(h.context.state.growthEntries).toHaveLength(1);
  expect(h.context.state.growthEntries[0].feedingMl).toBe(80);
  expect(h.context.dispatchGrowthEntrySaved).toHaveBeenCalledTimes(1);
});

test('a bootstrap reload discards quick save effects even when the account and baby stay the same', async () => {
  const response = deferred(), h = quickHarness(() => response.promise);
  const pending = h.click(0);
  h.context.bootstrapRequestId += 1;
  response.resolve({ error: null });
  await pending;
  expect(h.context.state.growthEntries).toEqual([]);
  expect(h.dialog.close).not.toHaveBeenCalled();
});

test('an escaped quick dialog cannot reopen until its accepted save completes', async () => {
  const response = deferred(), h = quickHarness(() => response.promise);
  h.context.activeBaby = () => ({ id: 'baby' });
  h.context.quickPresets = () => [{ title: 'new', label: 'new' }];
  h.context.escapeHtml = (value) => value;
  h.context.focusOnDesktop = () => {};
  h.dialog.showModal = vi.fn();
  vm.runInContext(section('function openGrowthQuick(', 'async function saveGrowthPresetFromEvent('), h.context);
  const pending = h.click(0);
  h.dialog.close(); // Native Escape can close a dialog even while its buttons are disabled.
  h.context.openGrowthQuick('기저귀');
  expect(h.dialog.showModal).not.toHaveBeenCalled();
  expect(h.context.toast).toHaveBeenCalledWith('기록을 저장 중이에요');
  response.resolve({ error: null });
  await pending;
  expect(h.context.state.growthEntries).toHaveLength(1);
});

test.each(['수유·이유식', '기저귀'])('adaptive %s opener cannot replace an escaped dialog while its save is pending', async (category) => {
  const response = deferred(), h = quickHarness(() => response.promise);
  const resetBottleAmounts = vi.fn(), renderQuick = vi.fn(), baseOpenGrowthQuick = vi.fn();
  h.dialog.showModal = vi.fn();
  Object.assign(h.context, {
    document: { querySelector: () => ({ showModal: h.dialog.showModal, classList: { remove: vi.fn() }, setAttribute: vi.fn() }) },
    baseOpenGrowthQuick, activeBaby: () => ({ id: 'baby' }), resetBottleAmounts,
    resetDirectMinutes: vi.fn(), installFeedingOptions: vi.fn(), renderQuick,
  });
  const adaptive = readFileSync('adaptive-feeding.js', 'utf8');
  vm.runInContext(adaptive.slice(adaptive.indexOf('openGrowthQuick = function adaptiveOpenQuick('), adaptive.indexOf('const baseTodaySummary')), h.context);
  const pending = h.click(0);
  h.dialog.close();
  h.context.openGrowthQuick(category);
  expect(resetBottleAmounts).not.toHaveBeenCalled();
  expect(renderQuick).not.toHaveBeenCalled();
  expect(baseOpenGrowthQuick).not.toHaveBeenCalled();
  expect(h.dialog.showModal).not.toHaveBeenCalled();
  expect(h.context.toast).toHaveBeenCalledWith('기록을 저장 중이에요');
  response.resolve({ error: null });
  await pending;
  expect(h.context.state.growthEntries).toHaveLength(1);
});

test.each(['bootstrap', 'replacement', 'deletion'])('an event %s discards old move responses and queued writes', async (change) => {
  const response = deferred(), write = vi.fn(() => response.promise), h = moveHarness(write);
  const first = h.context.moveEventToDate('event', '2026-10-14');
  const latest = h.context.moveEventToDate('event', '2026-10-15');
  if (change === 'bootstrap') h.context.bootstrapRequestId += 1;
  if (change === 'replacement') h.context.state.events = [{ ...h.item, date: '2026-11-01' }];
  if (change === 'deletion') h.context.state.events = [];
  h.context.state.selectedDate = '2026-11-01';
  h.context.render.mockClear();
  response.resolve({ error: new Error('offline') });
  await Promise.all([first, latest]);
  expect(write).toHaveBeenCalledTimes(1);
  expect(h.context.state.selectedDate).toBe('2026-11-01');
  expect(h.context.render).not.toHaveBeenCalled();
  expect(h.context.toast).not.toHaveBeenCalled();
});
