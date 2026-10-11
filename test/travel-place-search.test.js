import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, test, vi } from 'vitest';
import { readJsonObject } from '../supabase/functions/_shared/request.ts';

const source = readFileSync(new URL('../supabase/functions/travel-place-search/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace(/^import .*;$/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const place = {
  id: '12345', place_name: '오동도', road_address_name: '전남 여수시 오동도로 222',
  address_name: '전남 여수시 수정동 1', x: '127.7679', y: '34.7448',
  place_url: 'http://place.map.kakao.com/12345', category_name: '여행 > 관광,명소',
};

function setup({ key = 'server-key', user = { id: 'user-1' }, authError = null, membership = { household_id: 'home-1' }, membershipError = null } = {}) {
  let handler;
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data: membership, error: membershipError })) };
  const client = { auth: { getUser: vi.fn(async () => ({ data: { user }, error: authError })) }, from: vi.fn(() => query) };
  const createClient = vi.fn(() => client);
  const fetch = vi.fn(async () => Response.json({ documents: [place] }));
  const timeout = vi.fn(() => new AbortController().signal);
  runInNewContext(compiled, {
    Deno: { env: { get: name => ({ SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon-key', KAKAO_REST_API_KEY: key })[name] }, serve: fn => { handler = fn; } },
    createClient, readJsonObject, fetch, Response, URL, AbortSignal: { timeout },
  });
  return { handler, client, query, createClient, fetch, timeout };
}

function request(body = { query: '여수 관광명소', limit: 10 }, { auth = 'Bearer user-token', household = 'home-1', method = 'POST', raw } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth) headers.authorization = auth;
  if (household) headers['x-family-household'] = household;
  return new Request('https://example.test/travel-place-search', {
    method, headers, ...(method === 'POST' ? { body: raw === undefined ? JSON.stringify(body) : raw } : {}),
  });
}

describe('Kakao travel place search Edge Function', () => {
  test('CORS permits the household header without requiring authentication for OPTIONS', async () => {
    const deps = setup();
    const response = await deps.handler(request({}, { method: 'OPTIONS', auth: '', household: '' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-headers')).toContain('x-family-household');
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(deps.createClient).not.toHaveBeenCalled();
    const rejected = await deps.handler(request({}, { method: 'GET' }));
    expect(rejected.status).toBe(405);
    expect(rejected.headers.get('access-control-allow-origin')).toBe('*');
  });

  test.each(['', 'invalid-token'])('rejects missing or malformed authorization: %s', async auth => {
    const deps = setup();
    expect((await deps.handler(request({}, { auth }))).status).toBe(401);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  test.each([{ user: null }, { authError: new Error('expired') }])('rejects invalid Supabase users: %j', async options => {
    const deps = setup(options);
    expect((await deps.handler(request({ action: 'status' }))).status).toBe(401);
    expect(deps.query.maybeSingle).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  test('requires household membership for status and search', async () => {
    for (const body of [{ action: 'status' }, { query: '여수 관광명소' }]) {
      const missing = setup();
      expect((await missing.handler(request(body, { household: '' }))).status).toBe(403);
      for (const options of [{ membership: null }, { membershipError: new Error('db failure') }]) {
        const deps = setup(options);
        expect((await deps.handler(request(body))).status).toBe(403);
        expect(deps.query.eq).toHaveBeenCalledWith('household_id', 'home-1');
        expect(deps.query.eq).toHaveBeenCalledWith('user_id', 'user-1');
        expect(deps.fetch).not.toHaveBeenCalled();
      }
    }
  });

  test('returns a controlled error if authentication transport throws', async () => {
    const deps = setup();
    deps.client.auth.getUser.mockRejectedValue(new Error('network'));
    const response = await deps.handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ status: 'error', items: [] });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  test.each([['server-key', 'ok'], ['', 'unavailable'], ['  ', 'unavailable']])('reports configuration without calling Kakao: %s', async (key, status) => {
    const deps = setup({ key });
    const response = await deps.handler(request({ action: 'status' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status, items: [] });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  test('search is unavailable when the server key is missing', async () => {
    const deps = setup({ key: '' });
    const response = await deps.handler(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'unavailable', items: [] });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  test.each([null, [], { query: 123 }, { query: ['여수'] }, { query: '' }, { query: ' 가 ' }, { query: '가'.repeat(121) }, { action: 'other', query: '여수' }])('rejects malformed request %j', async body => {
    const deps = setup();
    expect((await deps.handler(request(body))).status).toBe(400);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  test.each([0, 11, 1.5, '10', null])('rejects invalid limit %j', async limit => {
    const deps = setup();
    const response = await deps.handler(request({ query: '여수', limit }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'INVALID_LIMIT' });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  test('rejects malformed JSON and oversized bodies using the shared body reader', async () => {
    const deps = setup();
    expect((await deps.handler(request({}, { raw: '{' }))).status).toBe(400);
    expect((await deps.handler(request({ query: '가'.repeat(20000) }))).status).toBe(413);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  test('normalizes coordinates, addresses and links and keeps the key only in the upstream header', async () => {
    const deps = setup();
    const response = await deps.handler(request({ action: 'search', query: '  여수 관광명소  ' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', items: [{
      provider: 'kakao', providerId: '12345', name: '오동도', address: place.road_address_name,
      lat: 34.7448, lng: 127.7679, sourceUrl: place.place_url,
      category: place.category_name, attribution: '© Kakao Corp.',
    }] });
    const [url, options] = deps.fetch.mock.calls[0];
    expect(url.origin + url.pathname).toBe('https://dapi.kakao.com/v2/local/search/keyword.json');
    expect([...url.searchParams]).toEqual([['query', '여수 관광명소'], ['size', '10']]);
    expect(options.headers).toEqual({ Authorization: 'KakaoAK server-key' });
    expect(deps.timeout).toHaveBeenCalledWith(8000);
    expect(deps.createClient.mock.calls[0][2].global.headers.Authorization).toBe('Bearer user-token');
  });

  test('caps results, uses the lot address if needed, and excludes invalid coordinates and unsafe links', async () => {
    const deps = setup();
    deps.fetch.mockResolvedValue(Response.json({ documents: [
      { ...place, x: '' }, { ...place, y: '91' }, null,
      { ...place, road_address_name: '', place_url: 'javascript:alert(1)' }, place,
    ] }));
    const response = await deps.handler(request({ query: '여수', limit: 4 }));
    expect((await response.json()).items).toEqual([expect.objectContaining({ address: place.address_name, sourceUrl: '' })]);
    expect(deps.fetch.mock.calls[0][0].searchParams.get('size')).toBe('4');
  });

  test.each([[429, 429, 'limit'], [401, 502, 'error'], [500, 502, 'error']])('handles upstream HTTP %s', async (upstreamStatus, status, resultStatus) => {
    const deps = setup();
    deps.fetch.mockResolvedValue(new Response('provider error', { status: upstreamStatus }));
    const response = await deps.handler(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ status: resultStatus, items: [] });
    expect(response.headers.get('access-control-allow-headers')).toContain('x-family-household');
  });

  test.each(['network', 'TimeoutError', 'AbortError'])('handles fetch failure %s', async name => {
    const deps = setup();
    const error = new Error('provider failure');
    error.name = name;
    deps.fetch.mockRejectedValue(error);
    const response = await deps.handler(request());
    expect(response.status).toBe(name === 'network' ? 502 : 504);
    expect(await response.json()).toMatchObject({ status: 'error', items: [] });
  });

  test.each([new Response('invalid json'), Response.json({ results: [] }), Response.json(null)])('handles invalid provider JSON', async upstream => {
    const deps = setup();
    deps.fetch.mockResolvedValue(upstream);
    const response = await deps.handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ status: 'error', items: [] });
  });
});
