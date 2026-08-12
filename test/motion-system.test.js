import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, test, vi } from 'vitest';

const source = readFileSync('motion-system.js', 'utf8');

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

  test('updates immediately when reduced motion is requested', () => {
    const update = vi.fn();
    const startViewTransition = vi.fn();
    loadMotion({ reduce: true, startViewTransition }).transitionView('growth', update, { currentView: 'calendar' });
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});
