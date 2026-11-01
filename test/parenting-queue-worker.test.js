import { expect, test, vi } from 'vitest';
import { answerJob, queueRpc, runWorker } from '../scripts/parenting-queue-worker.mjs';
test('worker uses only a scoped secret and returns safe errors without storing prompt diagnostics',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>null});
 await queueRpc({url:'https://example.supabase.co',key:'publishable',secret:'a'.repeat(64)},fetcher)('claim_parenting_question');
 expect(fetcher.mock.calls[0][0]).toBe('https://example.supabase.co/rest/v1/rpc/claim_parenting_question');
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({p_secret:'a'.repeat(64)});
 const reply=vi.fn().mockRejectedValue(new Error('private prompt in upstream diagnostics'));
 const result=await answerJob({id:'job',lease:'lease',question:'q',context:'child records',messages:[]},reply);
 expect(reply).toHaveBeenCalledOnce(); expect(result.p_error).not.toContain('private prompt');
 expect(result.p_answer).toBeNull();
 await answerJob({question:'q',context:'',messages:[{role:'system',content:'bad'}]},reply);
 expect(reply).toHaveBeenCalledOnce();
});
test('a failed database delivery retries the same answer without a second Codex call',async()=>{
 const controller=new AbortController(); let finishCalls=0;
 const rpc=vi.fn(async(name)=>{
   if(name==='claim_parenting_question') return {id:'job',lease:'lease',question:'q',context:'',messages:[]};
   if(++finishCalls===1) throw new Error('network');
   controller.abort(); return true;
 });
 const reply=vi.fn(async()=> 'answer');
 await runWorker(rpc,{signal:controller.signal,reply,pause:async()=>{}});
 expect(reply).toHaveBeenCalledOnce(); expect(finishCalls).toBe(2);
});

test.each([false,true])('queue checks quickly when healthy and backs off after connection failure (%s)',async failed=>{
 const controller=new AbortController();
 const rpc=vi.fn(async()=>{if(failed)throw Error('offline');return null;});
 const pause=vi.fn(async()=>{controller.abort();});
 await runWorker(rpc,{signal:controller.signal,pause});
 expect(pause.mock.calls[0][0]).toBe(failed ? 10000 : 2000);
 expect(rpc).toHaveBeenCalledOnce();
});
