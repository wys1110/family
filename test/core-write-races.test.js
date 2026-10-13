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
  const item = { id: 'event', date: '2026-10-13', endDate: '2026-10-14' };
  const context = {
    eventMovePromises: new Map(), bootstrapRequestId: 1, state: { events: [item], household: { id: 'home' }, session: { user: { id: 'user' } }, supabase: { from: () => ({ update: (patch) => ({ eq: () => ({ eq: () => write(patch) }) }) }) } },
    withAuthRecovery: (operation) => operation(), dayDistance: (start, end) => Math.round((new Date(end) - new Date(start)) / 86400000),
    addDays: (date, count) => new Date(new Date(date).getTime() + count * 86400000).toISOString().slice(0, 10),
    parseDate: (date) => new Date(`${date}T12:00:00`), startOfMonth: (date) => date, render: vi.fn(), toast: vi.fn(), persistLocal: vi.fn(), console,
  };
  vm.createContext(context);
  vm.runInContext(section('async function moveEventToDate(', 'async function storeEvent('), context);
  return { context, item };
}

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
