import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, test, vi } from 'vitest';

const source = readFileSync('motion-system.js', 'utf8');
const css = readFileSync('motion-system.css', 'utf8');
const app = readFileSync('app.js', 'utf8');
const theme = readFileSync('theme-critical.css', 'utf8');

function loadMotion({ reduce = false, startViewTransition } = {}) {
  const listeners = new Map();
  const document = {
    documentElement: { dataset: {} },
    readyState: 'loading',
    addEventListener: (name, callback) => listeners.set(name, callback),
    querySelector: () => null,
    querySelectorAll: () => [],
    startViewTransition,
  };
  const window = {
    document,
    matchMedia: () => ({ matches: reduce }),
    setTimeout: (callback) => callback(),
    clearTimeout: () => {},
  };
  vm.runInNewContext(source, { window, document, console, CustomEvent: class {} });
  return window.FAMILY_MOTION_API;
}

function loadMotionContext({ reduce = false, startViewTransition, switchView = vi.fn() } = {}) {
  const listeners = new Map();
  const activeView = { classList: { add: vi.fn(), remove: vi.fn() }, offsetWidth: 0 };
  const document = {
    documentElement: { dataset: {} },
    readyState: 'complete',
    addEventListener: (name, callback) => listeners.set(name, callback),
    querySelector: (selector) => selector.startsWith('main >') ? activeView : { dataset: { view: 'calendar' } },
    querySelectorAll: () => [],
    startViewTransition,
  };
  const window = {
    document,
    switchView,
    matchMedia: () => ({ matches: reduce }),
    setTimeout: (callback) => callback(),
    clearTimeout: () => {},
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  vm.runInNewContext(source, { window, document, console, CustomEvent: class {} });
  return { api: window.FAMILY_MOTION_API, window };
}

describe('neon depth motion policy', () => {
  test('uses navigation order to choose motion direction', () => {
    const api = loadMotion();
    expect(api.directionBetween('calendar', 'growth')).toBe('forward');
    expect(api.directionBetween('settings', 'english')).toBe('backward');
    expect(api.directionBetween('growth', 'growth')).toBe('none');
  });

  test('uses View Transition when motion is allowed', () => {
    const update = vi.fn();
    const startViewTransition = vi.fn((callback) => { callback(); return { finished: Promise.resolve() }; });
    loadMotion({ startViewTransition }).transitionView('growth', update, { currentView: 'calendar' });
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  test('does not animate bootstrap render before activation', () => {
    const startViewTransition = vi.fn((callback) => { callback(); return { finished: Promise.resolve() }; });
    const switchView = vi.fn();
    const context = loadMotionContext({ startViewTransition, switchView });

    context.window.switchView('growth');
    expect(startViewTransition).not.toHaveBeenCalled();

    context.api.activate();
    context.window.switchView('growth');
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(switchView).toHaveBeenCalledTimes(2);
  });

  test('folds nested view wrappers into one transition', () => {
    const startViewTransition = vi.fn((callback) => { callback(); return { finished: Promise.resolve() }; });
    const api = loadMotion({ startViewTransition });
    const update = vi.fn();

    api.transitionView('growth', () => {
      api.transitionView('growth', update, { currentView: 'calendar' });
    }, { currentView: 'calendar' });

    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  test('skips the previous transition on rapid successive navigation', () => {
    const firstTransition = { finished: new Promise(() => {}), skipTransition: vi.fn() };
    const secondTransition = { finished: Promise.resolve(), skipTransition: vi.fn() };
    const startViewTransition = vi.fn((callback) => {
      callback();
      return startViewTransition.mock.calls.length === 1 ? firstTransition : secondTransition;
    });
    const api = loadMotion({ startViewTransition });

    api.transitionView('growth', vi.fn(), { currentView: 'calendar' });
    api.transitionView('settings', vi.fn(), { currentView: 'growth' });

    expect(firstTransition.skipTransition).toHaveBeenCalledOnce();
    expect(startViewTransition).toHaveBeenCalledTimes(2);
  });

  test('updates immediately when reduced motion is requested', () => {
    const update = vi.fn();
    const startViewTransition = vi.fn();
    loadMotion({ reduce: true, startViewTransition }).transitionView('growth', update, { currentView: 'calendar' });
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  test('defines themed neon depth visuals and reduced motion', () => {
    expect(theme).toContain('--motion-neon-violet: #8d7bff');
    expect(css).toContain('var(--motion-neon-violet)');
    expect(css).toContain('::view-transition-old(family-view-stage)');
    expect(css).toContain('::view-transition-new(family-view-stage)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/animation-duration:\s*\.08s/);
  });

  test('marks growth completion for save feedback', () => {
    expect(app).toContain('window.FAMILY_MOTION_API?.markSaved(dialog)');
  });
});
