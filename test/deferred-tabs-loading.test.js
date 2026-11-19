import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

function setup(prepareStyles = () => undefined) {
  const calls = [];
  const pending = [];
  const api = {
    groups: { settings: ['prerequisite', 'dependent', 'last'] },
    prepare: vi.fn(() => { calls.push('prepare'); return prepareStyles(); }),
    load: vi.fn(name => {
      calls.push(name);
      return new Promise((resolve, reject) => pending.push({ name, resolve, reject }));
    }),
  };
  const nav = { querySelector: () => ({}), querySelectorAll: () => [] };
  const main = { appendChild() {}, querySelectorAll: () => [] };
  const listeners = {};
  const createElement = () => ({ setAttribute() {}, children: [], events: {},
    appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
    addEventListener(type, fn) { this.events[type] = fn; } });
  const notice = createElement();
  const createdElements = [notice];
  const window = { FAMILY_DEFERRED_MODULES: api, addEventListener() {} };
  const document = {
    querySelector: selector => selector === '.view-tabs' ? nav : main,
    createElement: () => createdElements.shift() || createElement(),
    addEventListener(type, fn) { listeners[type] = fn; },
  };
  vm.runInNewContext(readFileSync('deferred-tabs.js', 'utf8'), {
    window, document, state: {}, switchView() {}, console: { warn: vi.fn() },
  });
  const clickSettings = () => listeners.click({ target: { closest: () => ({ dataset: { view: 'settings' } }) }, preventDefault() {}, stopImmediatePropagation() {} });
  return { api, calls, pending, window, notice, clickSettings, ensure: window.FAMILY_DEFERRED_TABS.ensure };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('discovers a group before evaluating only its first script, then preserves dependency order', async () => {
  const { ensure, calls, pending, api } = setup();
  const task = ensure('settings');
  expect(ensure('settings')).toBe(task);
  expect(calls).toEqual(['prepare', 'prerequisite']);
  pending[0].resolve(); await settle();
  expect(calls).toEqual(['prepare', 'prerequisite', 'dependent']);
  pending[1].resolve(); await settle();
  expect(calls).toEqual(['prepare', 'prerequisite', 'dependent', 'last']);
  pending[2].resolve(); await task;
  await ensure('settings');
  expect(api.prepare).toHaveBeenCalledOnce();
});

test('failed prerequisites stop dependent evaluation and permit a complete retry', async () => {
  const { ensure, calls, pending } = setup();
  const first = ensure('settings');
  const rejection = expect(first).rejects.toThrow('offline');
  pending[0].reject(new Error('offline')); await rejection;
  expect(calls).toEqual(['prepare', 'prerequisite']);
  const retried = ensure('settings');
  expect(calls).toEqual(['prepare', 'prerequisite', 'prepare', 'prerequisite']);
  pending[1].resolve(); await settle();
  pending[2].resolve(); await settle();
  pending[3].resolve(); await retried;
  expect(calls.slice(-3)).toEqual(['prerequisite', 'dependent', 'last']);
});

test('a tab stays pending until styles load even when its scripts are already ready', async () => {
  let finishStyles;
  const styles = new Promise(resolve => { finishStyles = resolve; });
  const { ensure, pending } = setup(() => styles);
  const ready = vi.fn();
  const task = ensure('settings');
  task.then(ready);
  for (const i of [0, 1, 2]) { pending[i].resolve(); await settle(); }
  expect(ready).not.toHaveBeenCalled();
  expect(ensure('settings')).toBe(task);
  finishStyles();
  await task;
  expect(ready).toHaveBeenCalledOnce();
});

test('repeat clicks and Retry cannot enter a view through a newly installed script before CSS is ready', async () => {
  let failStyles, finishStyles;
  const first = new Promise((_resolve, reject) => { failStyles = reject; });
  const second = new Promise(resolve => { finishStyles = resolve; });
  let attempts = 0;
  const { clickSettings, pending, window, notice, ensure } = setup(() => attempts++ ? second : first);
  clickSettings();
  for (const i of [0, 1, 2]) { pending[i].resolve(); await settle(); }
  window.switchView = vi.fn(); // Simulate the feature script assigning its navigation wrapper.
  clickSettings();
  expect(window.switchView).not.toHaveBeenCalled();
  failStyles(new Error('Styles unavailable'));
  await settle();
  const retry = notice.children.find(node => node.textContent === '다시 시도');
  expect(retry).toBeDefined();
  retry.events.click();
  expect(window.switchView).not.toHaveBeenCalled();
  const retryPending = ensure('settings');
  for (const i of [3, 4, 5]) { pending[i].resolve(); await settle(); }
  finishStyles();
  await retryPending;
  expect(window.switchView).toHaveBeenCalledExactlyOnceWith('settings');
});
