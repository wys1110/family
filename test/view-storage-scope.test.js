import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const liveKey = 'family-active-view-v1', demoKey = 'family-demo-active-view-v1';
test.each([demoKey, liveKey])('settings startup restores only the core view key %s', key => {
  const source = readFileSync('settings.js', 'utf8');
  const store = new Map([[liveKey, 'settings'], [demoKey, 'growth']]);
  const switchView = vi.fn();
  const start = source.indexOf('  const restoreSettingsView =');
  const end = source.indexOf('\n  };', start) + 5;
  const declaration = source.match(/  const ACTIVE_VIEW_STORAGE_KEY = [^;]+;/)[0];
  const context = { ACTIVE_VIEW_KEY: key, VIEW_NAME: 'settings', localStorage: { getItem: k => store.get(k) }, switchView, installSettingsView: () => true };
  vm.runInNewContext(`${declaration}\n${source.slice(start, end)}\nrestoreSettingsView();`, context);
  if (key === demoKey) expect(switchView).not.toHaveBeenCalled();
  else expect(switchView).toHaveBeenCalledExactlyOnceWith('settings');
});

test.each([demoKey, liveKey])('deferred navigation persists only the core view key %s', key => {
  const store = new Map([[liveKey, 'settings'], [demoKey, 'growth']]);
  const element = () => ({ hidden: false, dataset: {}, appendChild() {}, replaceChildren() {}, setAttribute() {}, querySelectorAll: () => [] });
  const nav = { ...element(), querySelector: () => ({ hidden: false }) };
  const main = element(), action = element();
  const state = { activeView: 'growth' };
  const window = { FAMILY_DEFERRED_MODULES: { groups: { travel: ['travel'] }, prepare: vi.fn(), load: () => new Promise(() => {}) }, addEventListener() {} };
  const context = { ACTIVE_VIEW_KEY: key, state, window, localStorage: { setItem: (k, v) => store.set(k, v) }, switchView: view => { state.activeView = view; }, document: { querySelector: selector => selector === '.view-tabs' ? nav : selector === 'main' ? main : action, createElement: element, addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(readFileSync('deferred-tabs.js', 'utf8'), context);
  context.switchView('travel');
  expect(store.get(key)).toBe('travel');
  expect(store.get(key === demoKey ? liveKey : demoKey)).toBe(key === demoKey ? 'settings' : 'growth');
});

test('all tab modules use the core key without global literals or fallback keys', () => {
  for (const file of ['settings.js', 'feature-request.js', 'family-admin.js', 'tab-emojis.js', 'english-stories.js', 'deferred-tabs.js']) {
    const source = readFileSync(file, 'utf8');
    expect(source, file).not.toContain('family-active-view-v1');
    expect(source, file).toContain('ACTIVE_VIEW_KEY');
  }
});
