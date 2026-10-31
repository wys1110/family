import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const source = readFileSync('app.js', 'utf8');
const names = ['storedCareTimer', 'persistCareTimer', 'careTimerContextKey', 'careTimerDefinition', 'startCareTimerFromEvent', 'renderCareTimer', 'updateCareTimerClock', 'stopCareTimer'];
const functions = names.map(name => {
  const start = source.indexOf(`function ${name}(`);
  return `${name === 'stopCareTimer' ? 'async ' : ''}${source.slice(start, source.indexOf('\n}', start) + 2)}`;
}).join('\n');

function harness() {
  const storage = new Map(), elements = new Map(), messages = [];
  let now = new Date(2026, 9, 31, 23, 30).getTime();
  const context = {
    careTimer: null, careTimerSaveInProgress: false,
    CARE_TIMER_KEY: 'timer', GROWTH_STORAGE_KEY: 'growth',
    state: { babies: [{ id: 'baby', name: '아기' }], activeBabyId: 'baby', growthEntries: [], supabase: null },
    Date: class extends Date { static now() { return now; } },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    $: selector => { if (!elements.has(selector)) elements.set(selector, { classList: { add() {}, remove() {} } }); return elements.get(selector); },
    activeBaby: () => context.state.babies[0], activeBabyEntries: () => [],
    renderTodayCareSummary() {}, openBabyDialog() {}, renderGrowth() {}, dispatchGrowthEntrySaved() {},
    toast: value => messages.push(value), showGrowthComplete: value => messages.push(value),
    uid: () => 'entry', formatDuration: minutes => `${minutes}분`,
    dateKey: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    toGrowthRemote: entry => entry, withAuthRecovery: run => run(), console: { error() {} },
  };
  vm.createContext(context); vm.runInContext(functions, context);
  const start = (type = 'sleep') => context.startCareTimerFromEvent({ target: { closest: () => ({ dataset: { careTimer: type } }) } });
  return { context, storage, elements, start, advance: minutes => { now += minutes * 60000; } };
}

test('sleep start survives reload and sleep end saves a cross-midnight record once', async () => {
  const h = harness(); h.start();
  expect(h.elements.get('#careTimerLabel').textContent).toBe('자는 중');
  expect(h.elements.get('#careTimerStop').innerHTML).toContain('수면 끝');
  h.context.careTimer = h.context.storedCareTimer(); h.advance(90); h.context.renderCareTimer();
  expect(h.elements.get('#careTimerClock').textContent).toBe('01:30:00');
  await h.context.stopCareTimer(); await h.context.stopCareTimer();
  expect(h.context.state.growthEntries).toEqual([expect.objectContaining({ category: '수면', date: '2026-10-31', time: '23:30', sleepMinutes: 90 })]);
  expect(h.storage.has('timer')).toBe(false);
  expect(JSON.parse(h.storage.get('growth'))).toHaveLength(1);
});

test('failed sleep save keeps the timer and end action available for retry', async () => {
  const h = harness(); h.start(); h.advance(30);
  h.context.state.supabase = { from: () => ({ upsert: async () => ({ error: new Error('offline') }) }) };
  h.context.state.session = { user: { id: 'user' } };
  h.context.state.household = { id: 'home' };
  h.context.careTimer.contextKey = 'user:home';
  await h.context.stopCareTimer();
  expect(h.context.state.growthEntries).toHaveLength(0);
  expect(h.context.careTimer.startedAt).toBeTruthy();
  expect(h.elements.get('#careTimerStop').disabled).toBe(false);
  expect(h.elements.get('#careTimerStop').innerHTML).toContain('수면 끝');
});

test('feeding retains its existing label and stop action', () => {
  const h = harness(); h.start('feeding-left');
  expect(h.elements.get('#careTimerLabel').textContent).toBe('왼쪽 모유 수유');
  expect(h.elements.get('#careTimerStop').innerHTML).toContain('멈추고 저장');
});

test('the surviving compact sleep button starts and ends the timer after layout removes the original controls', () => {
  const h = harness();
  const listeners = new Map();
  const button = { dataset: {}, addEventListener: (name, handler) => listeners.set(name, handler), closest: () => button };
  h.context.document = { createElement: () => button };
  h.context.quickGrid = { appendChild() {} };
  h.context.renderGrowth = () => h.context.renderCareTimer();
  const compact = readFileSync('compact-family.js', 'utf8');
  vm.runInContext(compact.slice(compact.indexOf('  const sleep ='), compact.indexOf('  const summary =')), h.context);
  expect(button.innerHTML).toContain('수면 시작');
  listeners.get('click')({ target: button });
  expect(h.context.careTimer.type).toBe('sleep');
  expect(button.innerHTML).toContain('수면 끝');
  h.advance(45);
  listeners.get('click')({ target: button });
  expect(h.context.state.growthEntries[0].sleepMinutes).toBe(45);
  expect(button.innerHTML).toContain('수면 시작');
  h.start('feeding-left');
  expect(button.disabled).toBe(true);
});
