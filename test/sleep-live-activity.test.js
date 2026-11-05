import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, vi } from 'vitest';

test('native sleep follows confirmed timer state, suppresses duplicate renders and clears on family change', async () => {
  const events = {};
  const sync = vi.fn(async () => ({ applied: true }));
  const scope = {
    window: { Capacitor: { getPlatform: () => 'ios', registerPlugin: () => ({ sync }) }, addEventListener: (key, fn) => { events[key] = fn; } },
    document: { addEventListener() {} },
    state: { babies: [{ id: 'baby', name: '가상 아기' }] },
    careTimer: { type: 'sleep', babyId: 'baby', sharedId: 'sleep-a', startedAt: Date.now() - 60000, contextKey: 'family-a' },
    careTimerContextKey: () => 'family-a', renderCareTimer() {}, Date,
  };
  vm.createContext(scope);
  vm.runInContext(readFileSync('sleep-live-activity.js', 'utf8'), scope);
  await vi.waitFor(() => expect(sync).toHaveBeenCalledOnce());
  expect(sync.mock.calls[0][0]).toMatchObject({ sessionId: 'sleep-a', babyName: '가상 아기' });
  scope.renderCareTimer(); await Promise.resolve(); expect(sync).toHaveBeenCalledOnce();
  scope.careTimer.endedAt = Date.now(); scope.renderCareTimer();
  await vi.waitFor(() => expect(sync).toHaveBeenLastCalledWith({}));
  scope.careTimer.endedAt = null; scope.renderCareTimer();
  await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(3));
  events.familycontextchange();
  await vi.waitFor(() => expect(sync).toHaveBeenLastCalledWith({}));
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
