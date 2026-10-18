import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync('config.js', 'utf8');

function createLoader() {
  const scripts = [];
  const links = [];
  const toast = vi.fn();
  const window = {
    FAMILY_DEMO_MODE: false,
    location: { search: '' },
    addEventListener: vi.fn(),
    setTimeout,
  };
  const document = {
    documentElement: { dataset: {}, style: {} },
    head: { appendChild(node) { links.push(node); } },
    body: {
      appendChild(node) { node.parentElement = this; if (node.tagName === 'script') scripts.push(node); },
    },
    addEventListener: vi.fn(),
    querySelector: vi.fn((selector) => {
      const match = selector.match(/^script\[data-module="([^"]+)"\]$/);
      if (match) return scripts.find(script => !script.removed && script.dataset.module === match[1]) || null;
      const linkMatch = selector.match(/^link\[data-(module|module-preload)="([^"]+)"\]$/);
      return linkMatch ? links.find(link => link.dataset[linkMatch[1] === 'module' ? 'module' : 'modulePreload'] === linkMatch[2]) || null : null;
    }),
    createElement(tag) {
      return {
        tagName: tag,
        dataset: {},
        attributes: {},
        addEventListener: vi.fn(),
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return this[name] || this.attributes[name] || null; },
        removeAttribute(name) { delete this.attributes[name]; },
        remove() { this.removed = true; this.parentElement = null; },
      };
    },
  };
  const context = {
    window, document, toast, console: { error: vi.fn() },
    URLSearchParams, clearTimeout, localStorage: { getItem: () => null }, navigator: {},
  };
  vm.runInNewContext(source, context);
  window.__familyCoreReady = true;
  // config waits for core-ready unless the signal was already set before load.
  const eventHandler = window.addEventListener.mock.calls.find(([name]) => name === 'family:core-ready')?.[1];
  if (eventHandler) eventHandler();
  return { window, document, scripts, links, toast, startModules: eventHandler };
}

const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

test('core readiness does not wait for a saved deferred tab', async () => {
  const loader = createLoader();
  loader.window.FAMILY_DEFERRED_TABS = { restoreInitial: vi.fn(() => new Promise(() => {})) };
  const ready = vi.fn();
  loader.window.FAMILY_MODULES_READY.then(ready);
  for (const script of loader.scripts) script.onload();
  await settle();
  expect(ready).toHaveBeenCalledOnce();
  expect(loader.window.FAMILY_DEFERRED_TABS.restoreInitial).not.toHaveBeenCalled();
});

test('navigation before deferred code loads cancels saved-tab restoration', () => {
  const loader = createLoader();
  const api = loader.window.FAMILY_DEFERRED_MODULES;
  api.initialView = 'travel';
  const clicked = loader.document.addEventListener.mock.calls.find(([name]) => name === 'click')[1];
  clicked({ target: { closest: () => null } });
  expect(api.initialView).toBe('travel');
  clicked({ target: { closest: () => ({ dataset: { view: 'growth' } }) } });
  expect(api.initialView).toBeNull();
});

test('core failures remain unready and retry only failed scripts', async () => {
  const loader = createLoader();
  const ready = loader.window.FAMILY_MODULES_READY;
  const readyCallback = vi.fn();
  ready.then(readyCallback);
  await settle();
  expect(loader.scripts.length).toBeGreaterThan(1);
  const initialScriptCount = loader.scripts.length;

  const failed = loader.scripts[0];
  const siblings = loader.scripts.filter(script => script !== failed);
  failed.onerror();
  await settle();

  expect(loader.toast).not.toHaveBeenCalled();
  expect(loader.document.documentElement.dataset.familyModulesLoading).toBe('true');
  siblings[0].onload();
  await settle();
  expect(loader.toast).not.toHaveBeenCalled();
  loader.startModules();
  await settle();
  expect(loader.scripts).toHaveLength(initialScriptCount);

  for (const script of siblings.slice(1)) script.onload();
  await settle();

  expect(readyCallback).not.toHaveBeenCalled();
  expect(loader.document.documentElement.dataset.familyModulesReady).toBeUndefined();
  expect(failed.removed).toBe(true);
  expect(loader.toast).toHaveBeenCalledWith(
    '일부 기능을 불러오지 못했어요. 다시 시도해 주세요',
    expect.objectContaining({ label: '다시 시도', run: expect.any(Function) }),
  );

  const retry = loader.toast.mock.calls[0][1].run;
  retry();
  await settle();
  retry();
  await settle();
  expect(loader.scripts).toHaveLength(initialScriptCount + 1);
  const retryScript = loader.scripts.at(-1);
  expect(retryScript).not.toBe(failed);
  expect(loader.scripts.filter(script => script.dataset.module === failed.dataset.module)).toHaveLength(2);
  for (const moduleName of new Set(loader.scripts.map(script => script.dataset.module))) {
    if (moduleName !== failed.dataset.module) {
      expect(loader.scripts.filter(script => script.dataset.module === moduleName)).toHaveLength(1);
    }
  }
  retryScript.onload();
  await ready;
  expect(readyCallback).toHaveBeenCalledOnce();
  expect(loader.document.documentElement.dataset.familyModulesReady).toBe('true');
});


test('deferred styles keep their cascade slots and script downloads are discovered together', () => {
  const { window, links, scripts } = createLoader();
  const api = window.FAMILY_DEFERRED_MODULES;
  const stylesheetLinks = links.filter(link => link.rel === 'stylesheet');
  const deferredNames = new Set(Object.values(api.groups).flat());
  const dormant = stylesheetLinks.filter(link => deferredNames.has(link.dataset.module));
  expect(dormant.map(link => link.dataset.module)).toEqual(['english-stories', 'feature-request', 'settings-family-management', 'travel']);
  expect(dormant.every(link => !link.href)).toBe(true);
  expect(links.filter(link => link.rel === 'preload')).toHaveLength(0);
  expect(scripts.some(script => script.dataset.module === 'admin-ops')).toBe(false);
  const order = stylesheetLinks.map(link => link.dataset.module);
  api.prepare('settings');
  const preloads = links.filter(link => link.rel === 'preload');
  expect(preloads.map(link => link.dataset.modulePreload)).toEqual(api.groups.settings);
  expect(preloads.every(link => link.as === 'script')).toBe(true);
  expect(stylesheetLinks.map(link => link.dataset.module)).toEqual(order);
  expect(dormant.find(link => link.dataset.module === 'feature-request').href).toContain('feature-request.css?v=');
  expect(dormant.find(link => link.dataset.module === 'travel').href).toBeUndefined();
  api.prepare('settings');
  expect(links.filter(link => link.rel === 'preload')).toHaveLength(5);
});

test('a failed deferred script can retry while successful prerequisites remain cached', async () => {
  const { window, scripts } = createLoader();
  const api = window.FAMILY_DEFERRED_MODULES;
  const first = api.load('family-backup-media');
  const prerequisite = scripts.at(-1);
  prerequisite.onload();
  await first;
  const failed = api.load('settings-backup');
  const failedScript = scripts.at(-1);
  const rejection = expect(failed).rejects.toThrow('Failed to load settings-backup');
  failedScript.onerror();
  await rejection;
  expect(failedScript.removed).toBe(true);
  expect(api.load('family-backup-media')).toBe(first);
  const retried = api.load('settings-backup');
  expect(scripts.at(-1)).not.toBe(failedScript);
  scripts.at(-1).onload();
  await retried;
});
