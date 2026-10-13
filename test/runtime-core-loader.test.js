import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync('config.js', 'utf8');

function createLoader() {
  const scripts = [];
  const toast = vi.fn();
  const window = {
    FAMILY_DEMO_MODE: false,
    location: { search: '' },
    addEventListener: vi.fn(),
    setTimeout,
  };
  const document = {
    documentElement: { dataset: {}, style: {} },
    head: { appendChild: vi.fn() },
    body: {
      appendChild(node) { node.parentElement = this; if (node.tagName === 'script') scripts.push(node); },
    },
    addEventListener: vi.fn(),
    querySelector: vi.fn((selector) => {
      const match = selector.match(/^script\[data-module="([^"]+)"\]$/);
      return match ? scripts.find(script => !script.removed && script.dataset.module === match[1]) || null : null;
    }),
    createElement(tag) {
      return {
        tagName: tag,
        dataset: {},
        attributes: {},
        addEventListener: vi.fn(),
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        remove() { this.removed = true; this.parentElement = null; },
      };
    },
  };
  const context = {
    window, document, toast, console: { error: vi.fn() },
    URLSearchParams, localStorage: { getItem: () => null }, navigator: {},
  };
  vm.runInNewContext(source, context);
  window.__familyCoreReady = true;
  // config waits for core-ready unless the signal was already set before load.
  const eventHandler = window.addEventListener.mock.calls.find(([name]) => name === 'family:core-ready')?.[1];
  if (eventHandler) eventHandler();
  return { window, document, scripts, toast, startModules: eventHandler };
}

const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

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
