import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

function setup() {
  const calls = [];
  const pending = [];
  const api = {
    groups: { settings: ['prerequisite', 'dependent', 'last'] },
    prepare: vi.fn(() => calls.push('prepare')),
    load: vi.fn(name => {
      calls.push(name);
      return new Promise((resolve, reject) => pending.push({ name, resolve, reject }));
    }),
  };
  const nav = { querySelector: () => ({}) };
  const main = { appendChild() {} };
  const window = { FAMILY_DEFERRED_MODULES: api, addEventListener() {} };
  const document = {
    querySelector: selector => selector === '.view-tabs' ? nav : main,
    createElement: () => ({ setAttribute() {} }),
    addEventListener() {},
  };
  vm.runInNewContext(readFileSync('deferred-tabs.js', 'utf8'), {
    window, document, state: {}, switchView() {}, console,
  });
  return { api, calls, pending, ensure: window.FAMILY_DEFERRED_TABS.ensure };
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
