import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, vi } from 'vitest';

test('sleep starts, freezes at the first end time, then clears after saving and can restart', async () => {
  let now = Date.now();
  const events = {};
  const sync = vi.fn(async () => ({ applied: true }));
  const scope = {
    window: { Capacitor: { getPlatform: () => 'ios', registerPlugin: () => ({ sync }) }, addEventListener: (key, fn) => { events[key] = fn; } },
    document: { addEventListener() {} },
    state: { babies: [{ id: 'baby', name: '가상 아기' }] },
    careTimer: { type: 'sleep', babyId: 'baby', sharedId: 'sleep-a', startedAt: now - 60000, contextKey: 'family-a' },
    careTimerContextKey: () => 'family-a', renderCareTimer() {},
    Date: class extends Date { static now() { return now; } },
  };
  vm.createContext(scope);
  vm.runInContext(readFileSync('sleep-live-activity.js', 'utf8'), scope);
  await vi.waitFor(() => expect(sync).toHaveBeenCalledOnce());
  expect(sync.mock.calls[0][0]).toMatchObject({ sessionId: 'sleep-a', babyName: '가상 아기' });
  scope.renderCareTimer(); await Promise.resolve(); expect(sync).toHaveBeenCalledOnce();
  scope.careTimer.endedAt = now; scope.renderCareTimer();
  await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
  expect(sync).toHaveBeenLastCalledWith({ sessionId: 'sleep-a', babyName: '가상 아기', startedAt: now - 60000, endedAt: now });
  now += 3600000; scope.renderCareTimer(); await Promise.resolve();
  expect(sync).toHaveBeenCalledTimes(2);
  expect(sync.mock.lastCall[0].endedAt).toBe(now - 3600000);
  scope.careTimer = null; scope.renderCareTimer();
  await vi.waitFor(() => expect(sync).toHaveBeenLastCalledWith({}));
  scope.careTimer = { type: 'sleep', babyId: 'baby', sharedId: 'sleep-b', startedAt: now, contextKey: 'family-a' };
  scope.renderCareTimer();
  await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(4));
  expect(sync.mock.lastCall[0].sessionId).toBe('sleep-b');
  expect(sync.mock.lastCall[0].endedAt).toBeUndefined();
  events.familycontextchange();
  await vi.waitFor(() => expect(sync).toHaveBeenLastCalledWith({}));
});

test.each(['future', 'before-start', 'invalid'])('an invalid end time clears the activity (%s)', async kind => {
  const now = Date.now();
  const sync = vi.fn(async () => ({ applied: true }));
  const endedAt = { future: now + 60000, 'before-start': now - 120000, invalid: NaN }[kind];
  const scope = {
    window: { Capacitor: { getPlatform: () => 'ios', registerPlugin: () => ({ sync }) }, addEventListener() {} },
    document: { addEventListener() {} }, state: { babies: [{ id: 'baby' }] },
    careTimer: { type: 'sleep', babyId: 'baby', startedAt: now - 60000, endedAt, contextKey: 'a' },
    careTimerContextKey: () => 'a', renderCareTimer() {}, Date,
  };
  vm.createContext(scope); vm.runInContext(readFileSync('sleep-live-activity.js', 'utf8'), scope);
  await vi.waitFor(() => expect(sync).toHaveBeenCalledOnce());
  expect(sync).toHaveBeenLastCalledWith({});
});

test('a stop during a slow native start wins after the start completes', async () => {
  let finish;
  const sync = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ applied: true });
  const scope = { window: { Capacitor: { getPlatform: () => 'ios', registerPlugin: () => ({ sync }) }, addEventListener() {} }, document: { addEventListener() {} }, state: { babies: [{ id: 'baby' }] }, careTimer: { type: 'sleep', babyId: 'baby', startedAt: Date.now(), contextKey: 'a' }, careTimerContextKey: () => 'a', renderCareTimer() {}, Date };
  vm.createContext(scope); vm.runInContext(readFileSync('sleep-live-activity.js', 'utf8'), scope);
  scope.careTimer = null; scope.renderCareTimer(); finish({ applied: true });
  await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
  expect(sync).toHaveBeenLastCalledWith({});
});
