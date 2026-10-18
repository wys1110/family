import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, vi } from 'vitest';

const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup(saved = 'travel') {
  const events = {}, clicks = [], loads = [];
  const element = () => ({ hidden: false, dataset: {}, children: [], classList: { toggle() {} }, setAttribute() {}, addEventListener() {}, appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; }, querySelectorAll: () => [] });
  const tabs = Object.fromEntries(['calendar', 'growth', 'assistant', 'english', 'travel', 'settings', 'admin'].map(name => [name, { ...element(), dataset: { view: name } }]));
  tabs.admin.hidden = true;
  const nav = { ...element(), querySelector: selector => tabs[selector.match(/data-view="([^"]+)"/)?.[1]], querySelectorAll: () => Object.values(tabs) };
  const main = element(), button = element();
  const api = { initialView: saved, groups: { assistant: ['parenting-assistant'], travel: ['travel'], settings: ['settings'], admin: ['admin'] }, prepare() {}, load: vi.fn(() => new Promise((resolve, reject) => loads.push({ resolve, reject }))) };
  const ctx = { state: { activeView: 'calendar', session: { user: { id: 'a' } }, household: { id: 'home' } }, FAMILY_DEFERRED_MODULES: api,
    addEventListener: (name, fn) => { events[name] = fn; }, console: { warn: vi.fn() }, ACTIVE_VIEW_KEY: 'view', localStorage: { setItem() {} },
    document: { querySelector: selector => selector === '.view-tabs' ? nav : selector === 'main' ? main : button, createElement: element, addEventListener: (_name, fn) => clicks.push(fn) },
    switchView: vi.fn(view => { ctx.state.activeView = view; }),
  };
  ctx.window = ctx;
  vm.runInNewContext(readFileSync('deferred-tabs.js', 'utf8'), ctx);
  return { ctx, api, tabs, loads, notice: main.children[0], context: () => events.familycontextchange(), click: view => { api.initialView = null; clicks[0]({ target: { closest: () => tabs[view] }, preventDefault() {}, stopImmediatePropagation() {} }); } };
}

test('saved tab starts after bootstrap context and shows local loading without blocking core', async () => {
  const h = setup();
  h.ctx.FAMILY_DEFERRED_TABS.restoreInitial();
  expect(h.loads).toHaveLength(0);
  h.context();
  expect(h.loads).toHaveLength(1);
  expect(h.notice.hidden).toBe(false);
  expect(h.ctx.state.activeView).toBe('travel');
  h.loads[0].resolve(); await settle();
  expect(h.notice.hidden).toBe(true);
  expect(h.ctx.state.activeView).toBe('travel');
});

test('user tab selection during bootstrap wins over the saved tab', () => {
  const h = setup();
  h.click('growth'); h.ctx.switchView('growth'); h.context();
  expect(h.loads).toHaveLength(0);
  expect(h.ctx.state.activeView).toBe('growth');
});

test('failed restored tab shows retry and does not hold subsequent core navigation', async () => {
  const h = setup(); h.context();
  h.loads[0].reject(new Error('offline')); await settle();
  expect(h.notice.children[0].textContent).toContain('연결을 확인');
  expect(h.notice.children[1].textContent).toBe('다시 시도');
  h.ctx.switchView('growth');
  expect(h.notice.hidden).toBe(true);
  expect(h.ctx.state.activeView).toBe('growth');
});

test('context changes cancel an in-flight restoration', async () => {
  const h = setup(); h.context();
  h.ctx.state.session.user.id = 'b';
  h.ctx.switchView(h.ctx.state.activeView); // bootstrap renders before its context event
  h.context();
  expect(h.ctx.state.activeView).toBe('calendar');
  h.loads[0].resolve(); await settle();
  expect(h.ctx.state.activeView).toBe('calendar');
  expect(h.notice.hidden).toBe(true);
});

test('saved admin tab waits for permission and never overrides later user navigation', () => {
  const h = setup('admin'); h.context(); expect(h.loads).toHaveLength(0);
  h.tabs.admin.hidden = false; h.ctx.FAMILY_DEFERRED_TABS.restoreInitial();
  expect(h.loads).toHaveLength(1);
  const other = setup('admin'); other.context(); other.click('growth');
  other.tabs.admin.hidden = false; other.ctx.FAMILY_DEFERRED_TABS.restoreInitial();
  expect(other.loads).toHaveLength(0);
});

test('the saved parenting assistant restores through the deferred loader', async () => {
  const h = setup('assistant');
  h.context();
  expect(h.ctx.state.activeView).toBe('assistant');
  expect(h.api.load).toHaveBeenCalledWith('parenting-assistant');
  h.loads[0].resolve(); await settle();
  expect(h.ctx.state.activeView).toBe('assistant');
  expect(h.notice.hidden).toBe(true);
});
