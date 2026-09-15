import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, test, vi } from 'vitest';

const source = readFileSync('motion-system.js', 'utf8');
const css = readFileSync('motion-system.css', 'utf8');
const app = readFileSync('app.js', 'utf8');
const config = readFileSync('config.js', 'utf8');

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

describe('smooth mobile motion policy', () => {
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

  test('switches tabs synchronously even after motion activation', () => {
    const startViewTransition = vi.fn((callback) => { callback(); return { finished: Promise.resolve() }; });
    const switchView = vi.fn();
    const context = loadMotionContext({ startViewTransition, switchView });

    context.window.switchView('growth');
    expect(startViewTransition).not.toHaveBeenCalled();

    context.api.activate();
    context.window.switchView('growth');
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(switchView).toHaveBeenCalledTimes(2);
  });


  test('rapid tab presses finish on the latest tab without waiting for a browser callback', () => {
    let visible = 'calendar';
    const startViewTransition = vi.fn(() => ({ finished: new Promise(() => {}) }));
    const context = loadMotionContext({ startViewTransition, switchView: view => { visible = view; } });
    context.api.activate();
    for (const view of ['growth', 'settings', 'english', 'calendar']) {
      context.window.switchView(view);
      expect(visible).toBe(view);
    }
    expect(startViewTransition).not.toHaveBeenCalled();
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
    const callbacks = [];
    const firstTransition = { finished: new Promise(() => {}), skipTransition: vi.fn() };
    const secondTransition = { finished: new Promise(() => {}), skipTransition: vi.fn() };
    const startViewTransition = vi.fn((callback) => {
      callbacks.push(callback);
      return startViewTransition.mock.calls.length === 1 ? firstTransition : secondTransition;
    });
    const api = loadMotion({ startViewTransition });
    const firstUpdate = vi.fn();
    const secondUpdate = vi.fn();

    api.transitionView('growth', firstUpdate, { currentView: 'calendar' });
    api.transitionView('settings', secondUpdate, { currentView: 'growth' });
    callbacks[1]();
    callbacks[0]();

    expect(firstTransition.skipTransition).toHaveBeenCalledOnce();
    expect(startViewTransition).toHaveBeenCalledTimes(2);
    expect(secondUpdate).toHaveBeenCalledOnce();
    expect(firstUpdate).not.toHaveBeenCalled();
  });

  test('cancels a pending transition when navigation returns to the current tab', () => {
    const callbacks = [];
    const pendingTransition = { finished: new Promise(() => {}), skipTransition: vi.fn() };
    const startViewTransition = vi.fn((callback) => {
      callbacks.push(callback);
      return pendingTransition;
    });
    const api = loadMotion({ startViewTransition });
    const pendingUpdate = vi.fn();
    const returnUpdate = vi.fn();

    api.transitionView('growth', pendingUpdate, { currentView: 'calendar' });
    api.transitionView('calendar', returnUpdate, { currentView: 'calendar' });
    callbacks[0]();

    expect(pendingTransition.skipTransition).toHaveBeenCalledOnce();
    expect(returnUpdate).toHaveBeenCalledOnce();
    expect(pendingUpdate).not.toHaveBeenCalled();
  });

  test('updates immediately when reduced motion is requested', () => {
    const update = vi.fn();
    const startViewTransition = vi.fn((callback) => { callback(); return { finished: Promise.resolve() }; });
    loadMotion({ reduce: true, startViewTransition }).transitionView('growth', update, { currentView: 'calendar' });
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  test('uses short two-dimensional motion without mobile blur or stagger', () => {
    expect(css).toMatch(/:root\s*\{[^}]*view-transition-name:\s*none;/s);
    expect(css).toContain('::view-transition-old(family-view-stage)');
    expect(css).toContain('::view-transition-new(family-view-stage)');
    expect(css).toMatch(/::view-transition-group\(family-view-stage\) \{[^}]*animation:\s*none;/s);
    expect(css).toMatch(/animation:\s*family-slide-new-forward\s+\.22s/);
    expect(css).toMatch(/animation:\s*family-slide-old-forward\s+\.22s/);
    expect(css).toMatch(/animation:\s*family-slide-new-backward\s+\.22s/);
    expect(css).toMatch(/animation:\s*family-slide-old-backward\s+\.22s/);
    expect(css).toMatch(/animation:\s*family-sheet-rise\s+\.24s/);
    expect(css).toMatch(/family-sheet-rise[^]*from \{ opacity: 0; transform: translateY\(18px\); \}/);
    expect(css).not.toContain('blur(');
    expect(css).not.toMatch(/rotate[XY]\(/);
    expect(css).not.toContain('perspective(');
    expect(css).not.toContain('motion-neon');
    expect(css).not.toContain('family-card-depth-arrive');
    expect(css).not.toContain('family-fab-depth-arrive');
    expect(source).not.toContain('family-motion-entering');
    expect(css).toMatch(/body > #addEventButton\.fab \{[^}]*animation:\s*none;/s);
    expect(css).toMatch(/#addEventButton\.fab:active \{[^}]*scale\(\.96\)/s);
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/animation-duration:\s*\.08s/);
  });

  test('ships the smooth motion under a fresh asset version', () => {
    expect(config).toContain('{ name: "motion-system", version: "20260915-instant-tabs-v1" }');
  });

  test('marks growth completion for save feedback', () => {
    expect(app).toContain('window.FAMILY_MOTION_API?.markSaved(dialog)');
  });
});
