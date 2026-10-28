import { readJsonObject } from '../_shared/request.ts';

type Config = { scriptUrl: string; hmacSecret: string; ownerUserId: string; allowedOrigins: string[] };
type Dependencies = {
  config: Config;
  getUser: (authorization: string) => Promise<{ id: string } | null>;
  fetch: typeof fetch;
  crypto: Crypto;
  now?: () => number;
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, any>, keys: string[]) => Object.keys(value).sort().join(',') === keys.sort().join(',');
const text = (value: unknown, max: number) => typeof value === 'string' && !!value && value === value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

export function validCommand(command: unknown): boolean {
  if (!object(command) || !exactKeys(command, ['requestId', 'expectedRevision', 'record']) || !UUID.test(command.requestId) || !text(command.expectedRevision, 200)) return false;
  const r = command.record;
  if (!object(r) || !text(r.id, 90) || !/^[A-Za-z0-9:_-]+$/.test(r.id) || !['transaction', 'balance'].includes(r.type) || !['KRW', 'USD', 'EUR'].includes(r.currency)) return false;
  const common = ['id', 'type', 'date', 'label', 'amount', 'currency', 'basis', 'sourceLocation'];
  if (!exactKeys(r, [...common, ...(r.type === 'transaction' ? ['flow', 'status', 'channel', 'attribution', 'category'] : ['balanceKind'])])) return false;
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? new Date(r.date + 'T00:00:00Z') : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== r.date || r.date > new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)) return false;
  if (!text(r.label, 120) || !text(r.basis, 160) || !text(r.sourceLocation, 200)) return false;
  const amount = r.currency === 'KRW' ? /^(0|[1-9]\d{0,11})$/ : /^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
  if (!(r.type === 'balance' && r.amount === null) && (typeof r.amount !== 'string' || !amount.test(r.amount))) return false;
  if (r.type === 'balance') return ['asset', 'liability'].includes(r.balanceKind);
  return text(r.category, 50) && ['salary', 'bonus', 'income', 'expense', 'reimbursement', 'transfer', 'loan_principal', 'loan_interest', 'loan_payment', 'gift', 'refund', 'unclassified_income', 'unclassified_outflow'].includes(r.flow)
    && ['active', 'excluded', 'cancelled', 'cashback'].includes(r.status) && ['card', 'bank', 'manual'].includes(r.channel) && ['personal', 'company', 'household', 'unknown'].includes(r.attribution);
}

function configured(config: Config): boolean {
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.scriptUrl)
    && /^[a-f0-9]{64}$/i.test(config.hmacSecret) && UUID.test(config.ownerUserId)
    && config.allowedOrigins.length > 0 && config.allowedOrigins.every(origin => {
      try { const url = new URL(origin); return url.protocol === 'https:' && url.origin === origin; } catch { return false; }
    });
}

async function sign(request: string, secret: string, crypto: Crypto) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(request));
  return Array.from(new Uint8Array(signed), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function upstream(envelope: string, deps: Dependencies): Promise<Record<string, unknown>> {
  const signal = AbortSignal.timeout(25_000);
  let response = await deps.fetch(deps.config.scriptUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: envelope, redirect: 'manual', signal,
  });
  // Apps Script ContentService redirects to its one-time result URL. Never forward
  // the signed envelope or bearer token to a redirect target, including Google.
  if ([302, 303].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error('UPSTREAM');
    const target = new URL(location);
    if (target.protocol !== 'https:' || target.hostname !== 'script.googleusercontent.com' || target.port || target.username || target.password || target.pathname !== '/macros/echo') throw new Error('UPSTREAM');
    await response.body?.cancel();
    response = await deps.fetch(target.href, { method: 'GET', redirect: 'manual', signal });
  }
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new Error('UPSTREAM'); }
  // Body reader counts streamed bytes instead of trusting Content-Length.
  const value = await readJsonObject(new Request('https://internal.invalid', { method: 'POST', body: response.body, duplex: 'half' } as RequestInit), 4 * 1024 * 1024);
  if ('error' in value) {
    const safe = ['ACCESS_DENIED', 'PRIVATE_SOURCE_REQUIRED', 'SOURCE_NOT_CONFIGURED', 'SOURCE_CHANGED', 'UNSUPPORTED_DOCUMENT', 'INVALID_LEDGER', 'LOAD_FAILED', 'INVALID_RECORD', 'WRITE_NOT_ENABLED', 'WRITE_BUSY', 'LEDGER_NOT_INITIALIZED', 'REQUEST_CONFLICT', 'LEDGER_LIMIT', 'SAVE_FAILED'];
    return { error: safe.includes(value.error) ? value.error : 'UPSTREAM_FAILED' };
  }
  return value;
}

export function createPrivateAssetsHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    if (origin && deps.config.allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (!configured(deps.config)) return json({ error: 'NOT_CONFIGURED' }, 503);
    if (origin && !deps.config.allowedOrigins.includes(origin)) return json({ error: 'FORBIDDEN' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'UNAUTHORIZED' }, 401);
    try {
      const user = await deps.getUser(authorization);
      if (!user) return json({ error: 'UNAUTHORIZED' }, 401);
      if (user.id !== deps.config.ownerUserId) return json({ error: 'FORBIDDEN' }, 403);
    } catch { return json({ error: 'UNAUTHORIZED' }, 401); }
    let body;
    try { body = await readJsonObject(request, 8192); }
    catch (error) { const large = error instanceof Error && error.message === 'BODY_TOO_LARGE'; return json({ error: large ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST' }, large ? 413 : 400); }
    if (!(body.action === 'dashboard' && exactKeys(body, ['action']))
      && !(body.action === 'saveRecord' && exactKeys(body, ['action', 'command']) && validCommand(body.command))) return json({ error: 'INVALID_REQUEST' }, 400);
    try {
      const payload = JSON.stringify({ v: 1, action: body.action, timestamp: (deps.now || Date.now)(), nonce: deps.crypto.randomUUID(), ...(body.action === 'saveRecord' ? { command: body.command } : {}) });
      const envelope = JSON.stringify({ request: payload, signature: await sign(payload, deps.config.hmacSecret, deps.crypto) });
      return json(await upstream(envelope, deps));
    } catch (error) {
      const timedOut = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      return json({ error: timedOut ? 'TIMEOUT' : 'UPSTREAM_FAILED' }, timedOut ? 504 : 502);
    }
  };
}
