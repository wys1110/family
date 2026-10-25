import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync('service-worker.js', 'utf8');
const scope = 'https://example.test/family/';
function worker(windows = [], appScope = scope) {
  const handlers = {};
  const self = {
    registration: { scope: appScope, showNotification: vi.fn(async () => {}) },
    clients: { matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => {}) },
    addEventListener: (name, handler) => { handlers[name] = handler; },
  };
  vm.runInNewContext(source, { self, URL });
  const dispatch = async (type, event) => {
    let pending;
    handlers[type]({ ...event, waitUntil: promise => { pending = promise; } });
    await pending;
  };
  const click = async url => {
    const close = vi.fn();
    await dispatch('notificationclick', { notification: { close, data: { url } } });
    expect(close).toHaveBeenCalledOnce();
  };
  return { self, click, dispatch };
}

test.each([
  'https://evil.test/', '//evil.test/', 'javascript:alert(1)', 'data:text/html,test',
  '../other-app/', '/family-other/', '/family/%2e%2e/other-app/', '/family/%2f..%2fother-app/',
  'https://user:password@example.test/family/', 'http://example.test/family/', 'https://[', {}, null,
])('unsafe or malformed notification URL opens only the family app: %j', async url => {
  const { self, click, dispatch } = worker();
  await dispatch('push', { data: { json: () => ({ url, body: '' }) } });
  const options = self.registration.showNotification.mock.calls[0][1];
  expect(new URL(options.data.url, scope).href).toBe(scope);
  expect(options.body).toBe('');
  // Revalidate already-stored notifications too, including ones created by an older worker.
  await click(url);
  expect(self.clients.openWindow).toHaveBeenCalledWith(scope);
});

test.each(['./?eventDate=2026-10-25', '?growthDate=2026-10-25&growthId=record', './?briefingDate=2026-10-25', 'index.html#growth', `${scope}?eventDate=2026-10-25`])('keeps valid app routes: %s', async url => {
  const { self, click } = worker();
  await click(url);
  expect(self.clients.openWindow).toHaveBeenCalledWith(new URL(url, scope).href);
});

test('reuses the family window without navigating another app on the same origin', async () => {
  const other = { url: 'https://example.test/other-app/', navigate: vi.fn(), focus: vi.fn() };
  const family = { url: `${scope}?old=1`, navigate: vi.fn(async () => {}), focus: vi.fn() };
  const { self, click } = worker([other, family]);
  await click('?growthDate=2026-10-25');
  expect(other.navigate).not.toHaveBeenCalled(); expect(other.focus).not.toHaveBeenCalled();
  expect(family.navigate).toHaveBeenCalledWith(`${scope}?growthDate=2026-10-25`);
  expect(family.focus).toHaveBeenCalledOnce(); expect(self.clients.openWindow).not.toHaveBeenCalled();
});

test('opens a new family window if only other apps are open', async () => {
  const other = { url: 'https://example.test/other-app/', navigate: vi.fn(), focus: vi.fn() };
  const { self, click } = worker([other, { url: 'about:blank' }]);
  await click('./');
  expect(self.clients.openWindow).toHaveBeenCalledWith(scope);
  expect(other.navigate).not.toHaveBeenCalled(); expect(other.focus).not.toHaveBeenCalled();
});

test('also supports a private deployment served at the domain root', async () => {
  const appScope = 'https://family-mac.example-tail.ts.net/';
  const { self, click } = worker([], appScope);
  await click('./?growthDate=2026-10-25');
  expect(self.clients.openWindow).toHaveBeenCalledWith(`${appScope}?growthDate=2026-10-25`);
});
