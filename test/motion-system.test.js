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

  test('uses the short fade transition when reduced motion is requested', () => {
    const update = vi.fn();
    const startViewTransition = vi.fn((callback) => { callback(); return { finished: Promise.resolve() }; });
    loadMotion({ reduce: true, startViewTransition }).transitionView('growth', update, { currentView: 'calendar' });
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  test('uses short two-dimensional motion without mobile blur or stagger', () => {
    expect(css).toMatch(/:root\s*\{[^}]*view-transition-name:\s*none;/s);
    expect(css).toContain('::view-transition-old(family-view-stage)');
    expect(css).toContain('::view-transition-new(family-view-stage)');
    expect(css).toMatch(/::view-transition-group\(family-view-stage\) \{[^}]*animation:\s*none;/s);
    expect(css).toMatch(/animation:\s*family-slide-new-forward\s+\.22s/);
    expect(css).not.toContain('blur(');
    expect(css).not.toMatch(/rotate[XY]\(/);
    expect(css).not.toContain('perspective(');
    expect(css).not.toContain('motion-neon');
    expect(css).not.toContain('family-card-depth-arrive');
    expect(css).not.toContain('family-fab-depth-arrive');
    expect(source).not.toContain('family-motion-entering');
    expect(css).toMatch(/body > #addEventButton\.fab \{[^}]*animation:\s*none;/s);
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/animation-duration:\s*\.08s/);
  });

  test('ships the smooth motion under a fresh asset version', () => {
    expect(config).toContain('{ name: "motion-system", version: "20260812-smooth-mobile-v1" }');
  });

  test('marks growth completion for save feedback', () => {
    expect(app).toContain('window.FAMILY_MOTION_API?.markSaved(dialog)');
  });
});
