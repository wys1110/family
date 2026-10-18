import { afterEach, expect, test, vi } from 'vitest';
import { request } from 'node:http';
import { createChatServer, validateMessages, codexArgs } from '../scripts/parenting-codex-server.mjs';
const servers = [];
afterEach(async () => { for (const server of servers.splice(0)) await new Promise(resolve => server.close(resolve)); });
async function setup(reply = vi.fn(async () => '테스트 답변')) {
  const server = createChatServer({ root: '/tmp', reply }); servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const call = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method, headers: { host: '127.0.0.1:8775', ...headers } }, res => {
      let data = ''; res.on('data', chunk => { data += chunk; }); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }));
    }); req.on('error', reject); req.end(body);
  });
  const { data } = await call('/api/parenting/status');
  const headers = { origin: 'http://127.0.0.1:8775', 'content-type': 'application/json', 'x-chat-token': data.token };
  return { call, reply, headers };
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
