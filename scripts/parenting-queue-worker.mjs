import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { askCodex, validateMessages } from './parenting-codex-server.mjs';

export function queueRpc(config, fetcher = fetch) {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url) || !config.key || !/^[a-f0-9]{64}$/.test(config.secret)) throw new Error('Invalid worker configuration');
  return async (name, args = {}) => {
    const response = await fetcher(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...args, p_secret: config.secret }), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Queue HTTP ${response.status}`);
    return response.json();
  };
}

export async function answerJob(job, reply = askCodex) {
  const messages = Array.isArray(job.messages) ? [...job.messages, { role: 'user', content: job.question }] : null;
  if (!validateMessages(messages) || typeof job.context !== 'string' || job.context.length > 6000) {
    return { p_id: job.id, p_lease: job.lease, p_answer: null, p_error: '질문 형식을 확인하고 다시 보내 주세요.' };
  }
  try {
    const answer = await reply(messages, AbortSignal.timeout(95000), job.context);
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('Empty reply');
    return { p_id: job.id, p_lease: job.lease, p_answer: answer.slice(0,6000), p_error: null };
  } catch {
    return { p_id: job.id, p_lease: job.lease, p_answer: null, p_error: 'Mac의 Codex 답변을 받지 못했어요. 로그인·사용 한도를 확인한 뒤 다시 질문해 주세요.' };
  }
}

export async function runWorker(rpc, { signal, reply = askCodex, pause = delay } = {}) {
  let completed = null;
  while (!signal?.aborted) {
    try {
      // Retry delivery, never regenerate an answer when the network fails after inference.
      if (completed) { await rpc('finish_parenting_question', completed); completed = null; }
      if (signal?.aborted) break;
      const job = await rpc('claim_parenting_question');
      if (job) {
        completed = await answerJob(job, reply);
        await rpc('finish_parenting_question', completed); completed = null;
      }
    } catch { console.error('Queue connection unavailable; retrying.'); }
    if (!signal?.aborted) await pause(10000, undefined, { signal }).catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(await readFile(process.env.FAMILY_QUEUE_CONFIG, 'utf8'));
  await runWorker(queueRpc(config));
}
