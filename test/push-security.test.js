import { expect, test, vi } from 'vitest';
import { normalizePushSubscription, maySendPush, claimChange } from '../supabase/functions/daily-briefing-push/security.ts';
import { readJsonObject } from '../supabase/functions/_shared/request.ts';

const keys = { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64url'), auth: Buffer.alloc(16).toString('base64url') };
test.each(['fcm.googleapis.com','web.push.apple.com','updates.push.services.mozilla.com','wns2-db5p.notify.windows.com'])('accepts browser push vendor %s', host => {
  expect(normalizePushSubscription({ endpoint: `https://${host}/push/token`, keys })).not.toBeNull();
});
test.each(['https://127.0.0.1/private','https://[::1]/private','https://169.254.169.254/metadata',
  'https://fcm.googleapis.com.evil.test/token','https://evil.test/token','http://fcm.googleapis.com/token',
  'https://fcm.googleapis.com:8443/token','https://user:pass@fcm.googleapis.com/token','https://fcm.googleapis.com/token#fragment'])('rejects unsafe endpoint %s', endpoint => {
  expect(normalizePushSubscription({ endpoint, keys })).toBeNull();
});
test('rejects invalid encryption keys', () => {
  expect(normalizePushSubscription({ endpoint: 'https://web.push.apple.com/token', keys: { p256dh: 'abc', auth: 'abc' } })).toBeNull();
});
test('former members and failed permission lookups cannot receive pushes', async () => {
  const sub = { household_id: 'h', user_id: 'u', endpoint: 'https://web.push.apple.com/token', ...keys };
  for (const result of [{ data: null }, { data: {}, error: new Error('unavailable') }, { data: { household_id: 'h' } }]) {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(async () => result) };
    const permitted = await maySendPush({ from: vi.fn(() => query) }, sub);
    expect(permitted).toBe(Boolean(result.data) && !result.error);
    expect(query.eq).toHaveBeenCalledWith('household_id', 'h');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u');
  }
});
test('only a committed server change is returned; RPC failure fails closed', async () => {
  const rpc = vi.fn(async () => ({ data: null }));
  expect(await claimChange({ rpc }, 'h', 'growth', 'g')).toBeNull();
  rpc.mockResolvedValue({ error: new Error('missing migration') });
  await expect(claimChange({ rpc }, 'h', 'growth', 'g')).rejects.toThrow('CHANGE_VERIFICATION_FAILED');
});
test('request size is enforced without relying on Content-Length', async () => {
  const request = new Request('https://example.test', { method: 'POST', body: JSON.stringify({ value: '가'.repeat(20000) }) });
  await expect(readJsonObject(request)).rejects.toThrow('BODY_TOO_LARGE');
  await expect(readJsonObject(new Request('https://example.test', { method: 'POST', body: 'null' }))).rejects.toThrow('INVALID_JSON');
});
