import { createHmac, webcrypto } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { createPrivateAssetsHandler } from '../supabase/functions/private-assets/handler.ts';

const owner = '10000000-0000-4000-8000-000000000001';
const secret = 'ab'.repeat(32); // Synthetic test secret, never used by a deployment.
const origin = 'https://family.example.invalid';
const record = { id: 'manual:demo', type: 'transaction', date: '2026-01-01', label: '가상 식료품', amount: '1000', currency: 'KRW', basis: '합성 테스트', sourceLocation: '사용자 직접 입력', flow: 'expense', status: 'active', channel: 'manual', attribution: 'personal', category: '식료품' };
const command = () => ({ requestId: owner, expectedRevision: 'r1', record: { ...record } });
function setup(options = {}) {
  const config = { scriptUrl: 'https://script.google.com/macros/s/SYNTHETIC_DEPLOYMENT/exec', hmacSecret: secret, ownerUserId: owner, allowedOrigins: [origin], ...options.config };
  const getUser = vi.fn(async () => options.user === undefined ? { id: owner } : options.user);
  const fetch = vi.fn(options.fetch || (async () => Response.json({ program: { records: [record] } })));
  return { handler: createPrivateAssetsHandler({ config, getUser, fetch, crypto: webcrypto, now: () => 1800000000000 }), getUser, fetch };
}
function request(body = { action: 'dashboard' }, options = {}) {
  return new Request('https://edge.example.invalid/private-assets', { method: options.method || 'POST', headers: { origin: options.origin || origin, authorization: options.auth === undefined ? 'Bearer test-token' : options.auth, 'content-type': 'application/json' }, ...((options.method || 'POST') === 'POST' ? { body: options.raw === undefined ? JSON.stringify(body) : options.raw } : {}) });
}

describe('private assets authenticated bridge', () => {
  test.each(['', 'bad', 'Basic secret'])('rejects missing or malformed bearer without calling upstream: %s', async auth => {
    const deps = setup();
    const response = await deps.handler(request(undefined, { auth }));
    expect(response.status).toBe(401); expect(deps.getUser).not.toHaveBeenCalled(); expect(deps.fetch).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  test.each([null, { id: '10000000-0000-4000-8000-000000000002' }])('rejects unverified user or another family member %j', async user => {
    const deps = setup({ user }); const response = await deps.handler(request());
    expect(response.status).toBe(user ? 403 : 401); expect(deps.fetch).not.toHaveBeenCalled();
  });
  test('authentication transport failure reveals no raw error', async () => {
    const deps = setup(); deps.getUser.mockRejectedValue(new Error('private auth detail'));
    const response = await deps.handler(request()); expect(response.status).toBe(401); expect(await response.text()).not.toContain('private'); expect(deps.fetch).not.toHaveBeenCalled();
  });
  test.each([{ scriptUrl: '' }, { hmacSecret: '' }, { hmacSecret: 'short' }, { ownerUserId: '' }, { allowedOrigins: [] }, { scriptUrl: 'https://script.google.com.evil.invalid/macros/s/x/exec' }, { scriptUrl: 'https://script.google.com/macros/s/x/exec?key=secret' }, { allowedOrigins: ['*'] }])('missing or invalid configuration fails closed: %j', async config => {
    const deps = setup({ config }); const response = await deps.handler(request());
    expect(response.status).toBe(503); expect(deps.getUser).not.toHaveBeenCalled(); expect(deps.fetch).not.toHaveBeenCalled();
  });
  test('CORS only allows configured origins and no-store covers preflight and method errors', async () => {
    const deps = setup();
    const denied = await deps.handler(request(undefined, { origin: 'https://evil.invalid' })); expect(denied.status).toBe(403); expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    for (const [method, status] of [['OPTIONS', 204], ['GET', 405]]) { const result = await deps.handler(request(undefined, { method })); expect(result.status).toBe(status); expect(result.headers.get('cache-control')).toBe('no-store'); expect(result.headers.get('access-control-allow-origin')).toBe(origin); }
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  test.each([{}, { action: 'other' }, { action: 'dashboard', email: 'owner@example.invalid' }, { action: 'dashboard', sourceId: 'other-doc' }, { action: 'saveRecord', command: {} }, { action: 'saveRecord', command: { ...command(), sourceDocId: 'other' } }, { action: 'saveRecord', command: { ...command(), record: { ...record, amount: '-1' } } }, { action: 'saveRecord', command: { ...command(), record: { ...record, date: '2026-02-30' } } }])('rejects invalid payload before upstream %j', async body => {
    const deps = setup(); expect((await deps.handler(request(body))).status).toBe(400); expect(deps.fetch).not.toHaveBeenCalled();
  });
  test('bounds streamed request bytes and invalid JSON', async () => {
    const deps = setup(); expect((await deps.handler(request({}, { raw: '{' }))).status).toBe(400); expect((await deps.handler(request({ action: '가'.repeat(9000) }))).status).toBe(413); expect(deps.fetch).not.toHaveBeenCalled();
  });
  test.each([{ action: 'dashboard' }, { action: 'saveRecord', command: command() }])('signs the exact payload with nonce and time, forwarding no bearer: %j', async body => {
    const deps = setup(); const response = await deps.handler(request(body)); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ program: { records: [record] } });
    const [, options] = deps.fetch.mock.calls[0]; const envelope = JSON.parse(options.body); const payload = JSON.parse(envelope.request);
    expect(envelope.signature).toBe(createHmac('sha256', secret).update(envelope.request).digest('hex'));
    expect(payload).toMatchObject({ v: 1, action: body.action, timestamp: 1800000000000 }); expect(payload.nonce).toMatch(/^[a-f0-9-]{36}$/); expect(payload.command).toEqual(body.command);
    expect(options.headers).toEqual({ 'content-type': 'application/json' }); expect(options.redirect).toBe('manual'); expect(options.signal).toBeInstanceOf(AbortSignal); expect(options.body).not.toContain('test-token');
  });
  test('accepts only the one-time Google result GET, with no signed body or auth header', async () => {
    const deps = setup({ fetch: async (_, options) => options.method === 'POST' ? new Response(null, { status: 302, headers: { location: 'https://script.googleusercontent.com/macros/echo?user_content_key=synthetic' } }) : Response.json({ ok: true }) });
    expect((await deps.handler(request())).status).toBe(200);
    expect(deps.fetch.mock.calls[1][1]).toMatchObject({ method: 'GET', redirect: 'manual' }); expect(deps.fetch.mock.calls[1][1].body).toBeUndefined(); expect(deps.fetch.mock.calls[1][1].headers).toBeUndefined();
  });
  test.each([['https://evil.invalid/macros/echo', 302], ['https://script.googleusercontent.com.evil.invalid/macros/echo', 303], ['https://script.googleusercontent.com/other', 302], ['https://user:pass@script.googleusercontent.com/macros/echo', 302], ['https://script.googleusercontent.com/macros/echo', 307], ['https://script.googleusercontent.com/macros/echo', 308]])('blocks redirect leakage %s %s', async (location, status) => {
    const deps = setup({ fetch: async () => new Response(null, { status, headers: { location } }) });
    const response = await deps.handler(request()); expect(response.status).toBe(502); expect(deps.fetch).toHaveBeenCalledTimes(1); expect(response.headers.get('cache-control')).toBe('no-store');
  });
  test('rejects a second redirect and oversized upstream body', async () => {
    const redirect = setup({ fetch: async () => new Response(null, { status: 302, headers: { location: 'https://script.googleusercontent.com/macros/echo?synthetic=1' } }) });
    expect((await redirect.handler(request())).status).toBe(502); expect(redirect.fetch).toHaveBeenCalledTimes(2);
    const oversized = setup({ fetch: async () => Response.json({ huge: 'x'.repeat(4 * 1024 * 1024) }) }); expect((await oversized.handler(request())).status).toBe(502);
  });
  test.each(['TimeoutError', 'AbortError'])('maps bounded upstream timeout to a safe retryable TIMEOUT: %s', async name => {
    const deps = setup({ fetch: async () => { throw Object.assign(new Error('private provider timeout detail'), { name }); } });
    const response = await deps.handler(request({ action: 'saveRecord', command: command() }));
    expect(response.status).toBe(504); expect(await response.json()).toEqual({ error: 'TIMEOUT' }); expect(response.headers.get('cache-control')).toBe('no-store');
  });
  test('future dates match the ledger Seoul date restriction before any upstream call', async () => {
    const future = new Date(Date.now() + 9 * 3600_000 + 86400_000).toISOString().slice(0, 10);
    const deps = setup();
    const response = await deps.handler(request({ action: 'saveRecord', command: { ...command(), record: { ...record, date: future } } }));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: 'INVALID_REQUEST' }); expect(deps.fetch).not.toHaveBeenCalled();
  });
  test('returns safe domain errors unchanged and strips private provider error bodies', async () => {
    for (const [error, expected] of [['SOURCE_CHANGED', 'SOURCE_CHANGED'], ['private provider detail', 'UPSTREAM_FAILED']]) { const deps = setup({ fetch: async () => Response.json({ error, detail: 'private' }) }); const response = await deps.handler(request()); expect(await response.json()).toEqual({ error: expected }); }
    const deps = setup({ fetch: async () => { throw new Error('private token'); } }); expect(await (await deps.handler(request())).json()).toEqual({ error: 'UPSTREAM_FAILED' });
  });
});
