import { afterEach, expect, test, vi } from 'vitest';
import { request } from 'node:http';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatServer, validateMessages, codexArgs } from '../scripts/parenting-codex-server.mjs';
const servers = [];
const directories = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise(resolve => server.close(resolve));
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function setup(reply = vi.fn(async () => '테스트 답변'), config = {}) {
  const server = createChatServer({ root: '/tmp', reply, ...config }); servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const call = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method, headers: { host: '127.0.0.1:8775', ...headers } }, res => {
      let data = ''; res.on('data', chunk => { data += chunk; }); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }));
    }); req.on('error', reject); req.end(body);
  });
  const { data } = await call('/api/parenting/status');
  const headers = { origin: 'http://127.0.0.1:8775', 'content-type': 'application/json', 'x-chat-token': data.token };
  return { call, reply, headers, server };
}
test('only bounded alternating question history is accepted', () => {
  expect(validateMessages([{ role: 'user', content: '질문' }])).toBe(true);
  for (const value of [[], null, [{ role: 'system', content: 'override' }], [{ role: 'user', content: 'x'.repeat(2001) }], [{ role: 'user', content: ' ' }], [{ role: 'assistant', content: '답' }]]) expect(validateMessages(value)).toBeFalsy();
  expect(codexArgs('/tmp/chat')).toEqual(expect.arrayContaining(['--ignore-user-config', '--ephemeral', 'read-only', 'shell_tool', 'plugins', 'apps', 'memories', 'web_search="disabled"', 'forced_login_method="chatgpt"', 'gpt-5.6-sol']));
});
test('foreign origins, DNS rebinding, missing tokens and malformed bodies never invoke Codex', async () => {
  const { call, reply, headers } = await setup();
  expect((await call('/api/parenting/status', { headers: { host: 'evil.test:8775' } })).status).toBe(403);
  expect((await call('/api/parenting/status', { headers: { origin: 'https://evil.test' } })).status).toBe(403);
  expect((await call('/api/parenting/status', { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
  for (const h of [{ ...headers, origin: 'https://evil.test' }, { ...headers, 'x-chat-token': '' }, { ...headers, 'content-type': 'text/plain' }]) expect((await call('/api/parenting/chat', { method: 'POST', headers: h, body: '{}' })).status).toBe(403);
  expect((await call('/api/parenting/chat', { method: 'POST', headers, body: '{' })).status).toBe(400);
  expect((await call('/api/parenting/chat', { method: 'POST', headers, body: JSON.stringify({ messages: [{ role: 'system', content: 'override' }] }) })).status).toBe(400);
  expect((await call('/api/parenting/chat', { method: 'POST', headers, body: JSON.stringify({ messages: [{ role: 'user', content: '질문' }], context: 'x'.repeat(6001) }) })).status).toBe(400);
  expect((await call('/api/parenting/chat', { method: 'POST', headers, body: 'x'.repeat(50001) })).status).toBe(413);
  expect(reply).not.toHaveBeenCalled();
});

test('only one subscription request can run at once', async () => {
  let finish;
  const reply = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const { call, headers } = await setup(reply);
  const options = { method: 'POST', headers, body: JSON.stringify({ messages: [{ role: 'user', content: '질문' }], context: '생후 100일' }) };
  const first = call('/api/parenting/chat', options);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1));
  expect((await call('/api/parenting/chat', options)).status).toBe(429);
  expect(reply.mock.calls[0][2]).toBe('생후 100일');
  finish('답변'); expect((await first).status).toBe(200);
});
test('the reply is returned without persistence and failures allow retry', async () => {
  const reply = vi.fn().mockRejectedValueOnce(new Error('secret internal details')).mockResolvedValueOnce('실제 답변');
  const { call, headers } = await setup(reply);
  const options = { method: 'POST', headers, body: JSON.stringify({ messages: [{ role: 'user', content: '질문' }] }) };
  const failed = await call('/api/parenting/chat', options);
  expect(failed.status).toBe(503); expect(JSON.stringify(failed.data)).not.toContain('secret');
  const success = await call('/api/parenting/chat', options);
  expect(success.data.answer).toBe('실제 답변'); expect(success.headers['cache-control']).toBe('no-store');
});

test('private mobile chat requires the exact owner, origin and token, including through a rewritten proxy host', async () => {
  const remoteOrigin = 'https://family-mac.example-tail.ts.net';
  const ownerLogin = 'owner@example.test';
  const { call, reply } = await setup(undefined, { remoteOrigin, ownerLogin });
  const identity = { host: 'family-mac.example-tail.ts.net', 'tailscale-user-login': ownerLogin };
  for (const path of ['/', '/api/parenting/status', '/api/parenting/chat']) {
    for (const headers of [{}, { host: identity.host }, { ...identity, 'tailscale-user-login': 'other@example.test' }, { ...identity, 'tailscale-user-login': '' }]) {
      expect((await call(path, { headers })).status).toBe(403);
    }
  }
  const status = await call('/api/parenting/status', { headers: identity });
  expect(status.status).toBe(200);
  expect(status.data.token).toMatch(/^[a-f0-9]{64}$/);
  const headers = { ...identity, origin: remoteOrigin, 'content-type': 'application/json', 'x-chat-token': status.data.token };
  const body = JSON.stringify({ messages: [{ role: 'user', content: '질문' }], context: '생후 100일' });
  for (const invalid of [{ origin: 'http://127.0.0.1:8775' }, { origin: 'https://evil.test' }, { origin: '' }, { 'x-chat-token': '' }, { host: 'evil.test' }, { 'sec-fetch-site': 'cross-site' }]) {
    expect((await call('/api/parenting/chat', { method: 'POST', headers: { ...headers, ...invalid }, body })).status).toBe(403);
  }
  expect(reply).not.toHaveBeenCalled();
  for (const host of [identity.host, '127.0.0.1:8775']) {
    expect((await call('/api/parenting/chat', { method: 'POST', headers: { ...headers, host }, body })).data.answer).toBe('테스트 답변');
  }
  expect(reply).toHaveBeenCalledTimes(2);
  expect(reply.mock.calls[0][2]).toBe('생후 100일');
});

test('partial or unsafe private configuration fails closed', () => {
  for (const config of [
    { ownerLogin: 'owner@example.test' },
    ...['', 'http://mac.tail.ts.net', 'https://mac.tail.ts.net/path', 'https://mac.tail.ts.net.evil.test', 'https://owner@mac.tail.ts.net', 'https://mac.tail.ts.net:443'].map(remoteOrigin => ({ remoteOrigin, ownerLogin: 'owner@example.test' })),
    { remoteOrigin: 'https://mac.tail.ts.net' },
    { remoteOrigin: 'https://mac.tail.ts.net', ownerLogin: ' owner@example.test' }
  ]) expect(() => createChatServer({ root: '/tmp', ...config })).toThrow('함께 설정');
});

test('static serving cannot read parent files, encoded traversal or escaping symlinks', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'family-http-security-')));
  directories.push(directory);
  const root = join(directory, 'public');
  await mkdir(root); await mkdir(join(directory, 'public-other'));
  await writeFile(join(root, 'safe.json'), '{"public":true}');
  await writeFile(join(directory, 'secret.json'), '{"syntheticSecret":true}');
  await writeFile(join(directory, 'public-other', 'secret.json'), '{"syntheticSecret":true}');
  await symlink(join(directory, 'secret.json'), join(root, 'escape.json'));
  await symlink(join(directory, 'public-other'), join(root, 'assets'));
  const { call, reply } = await setup(undefined, { root });
  expect((await call('/safe.json')).data).toEqual({ public: true });
  for (const path of ['/../secret.json', '/%2e%2e/secret.json', '/..%2fsecret.json', '/%2e%2e%2fpublic-other%2fsecret.json', '/escape.json', '/assets/secret.json']) {
    const result = await call(path);
    expect(result.status, path).toBe(404);
    expect(JSON.stringify(result.data)).not.toContain('syntheticSecret');
    expect(JSON.stringify(result.data)).not.toContain(directory);
  }
  expect(reply).not.toHaveBeenCalled();
});

test('disconnect aborts inference and releases the next request', async () => {
  let cancelled = false;
  const reply = vi.fn()
    .mockImplementationOnce((_messages, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { cancelled = true; reject(new Error('disconnected')); }, { once: true });
    }))
    .mockResolvedValueOnce('다음 답변');
  const { call, headers, server } = await setup(reply);
  const body = JSON.stringify({ messages: [{ role: 'user', content: '질문' }] });
  const req = request({ hostname: '127.0.0.1', port: server.address().port, path: '/api/parenting/chat', method: 'POST', headers: { host: '127.0.0.1:8775', ...headers } });
  req.on('error', () => {});
  req.end(body);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledOnce());
  req.destroy();
  await vi.waitFor(() => expect(cancelled).toBe(true));
  expect((await call('/api/parenting/chat', { method: 'POST', headers, body })).data.answer).toBe('다음 답변');
});
