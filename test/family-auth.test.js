import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, test, vi } from 'vitest';

const source = () => readFileSync('family-auth.js', 'utf8');
const read = (path) => readFileSync(path, 'utf8');

function loadApi() {
  const events = [];
  const context = {
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    window: {
      dispatchEvent(event) {
        events.push(event);
      },
    },
  };
  vm.runInNewContext(source(), context);
  return { api: context.window.FAMILY_AUTH_API, events };
}

describe('family auth recovery', () => {
  test('recognizes Supabase authentication failures without swallowing ordinary errors', () => {
    const { api } = loadApi();

    expect(api.isAuthError({ status: 401 })).toBe(true);
    expect(api.isAuthError({ code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    expect(api.isAuthError({ status: 403, message: 'permission denied' })).toBe(false);
    expect(api.isAuthError({ code: '23505', message: 'duplicate key' })).toBe(false);
  });

  test('refreshes once and retries the failed operation once', async () => {
    const { api, events } = loadApi();
    let operationCalls = 0;
    const refreshSession = vi.fn(async () => ({
      data: { session: { user: { id: 'user-1' }, access_token: 'fresh-token' } },
      error: null,
    }));
    const operation = vi.fn(async () => {
      operationCalls += 1;
      return operationCalls === 1
        ? { data: null, error: { status: 401, message: 'JWT expired' } }
        : { data: ['ok'], error: null };
    });

    const result = await api.withRecovery(operation, {
      supabase: { auth: { refreshSession } },
      userId: 'user-1',
    });

    expect(result.data).toEqual(['ok']);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.type)).toEqual(['family:auth-session-refreshed']);
  });

  test('coalesces concurrent refreshes while retrying each request once', async () => {
    const { api } = loadApi();
    let resolveRefresh;
    let operationCalls = 0;
    const refreshSession = vi.fn(() => new Promise((resolve) => {
      resolveRefresh = () => resolve({
        data: { session: { user: { id: 'user-1' }, access_token: 'fresh-token' } },
        error: null,
      });
    }));
    const operation = vi.fn(async () => {
      operationCalls += 1;
      return operationCalls <= 2
        ? { data: null, error: { status: 401 } }
        : { data: ['ok'], error: null };
    });
    const options = { supabase: { auth: { refreshSession } }, userId: 'user-1' };

    const first = api.withRecovery(operation, options);
    const second = api.withRecovery(operation, options);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshSession).toHaveBeenCalledTimes(1);

    resolveRefresh();
    const results = await Promise.all([first, second]);
    expect(results.every((result) => result.data[0] === 'ok')).toBe(true);
    expect(operation).toHaveBeenCalledTimes(4);
  });

  test('emits expiration when the session cannot be refreshed and does not retry forever', async () => {
    const { api, events } = loadApi();
    const operation = vi.fn(async () => ({ data: null, error: { status: 401 } }));
    const result = await api.withRecovery(operation, {
      supabase: { auth: { refreshSession: async () => ({ data: { session: null }, error: { message: 'refresh failed' } }) } },
      userId: 'user-1',
    });

    expect(result.error.status).toBe(401);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.type)).toEqual(['family:auth-expired']);
  });

  test('connects auth recovery to the app and every remote activity reader', () => {
    const app = read('app.js');
    const activityLog = read('activity-log.js');
    const familyTodo = read('family-todo.js');
    const notifications = read('notification-center.js');

    expect(app).toContain("window.addEventListener('family:auth-session-refreshed'");
    expect(app).toContain("window.addEventListener('family:auth-expired'");
    expect(app).toContain('window.FAMILY_AUTH_API.withRecovery');
    expect(activityLog).toContain('window.FAMILY_AUTH_API.withRecovery');
    expect(familyTodo).toContain('window.FAMILY_AUTH_API.withRecovery');
    expect(notifications).toContain('window.FAMILY_AUTH_API.withRecovery');
  });

  test('loads the recovery module before app startup and refreshes stale PWA assets', () => {
    const index = read('index.html');
    const config = read('config.js');
    const serviceWorker = read('service-worker.js');

    expect(index).toContain('<script src="family-auth.js?v=20260830-auth-recovery-v1" data-module="family-auth"></script>');
    expect(index).toContain('<script src="app.js?v=20260830-auth-recovery-v1"></script>');
    expect(config).toContain('{ name: "family-auth", version: "20260830-auth-recovery-v1", style: false }');
    expect(index).toContain('config.js?v=20260830-auth-recovery-v1');
    expect(serviceWorker).toContain('url.pathname.endsWith("/family-auth.js")');
  });
});
