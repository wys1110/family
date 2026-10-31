import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';
const source=readFileSync('family-sleep.js','utf8');
const flush=async()=>{for(let i=0;i<20;i++) await Promise.resolve();};
function server() {
  const rows=new Map(), entries=new Map(), aliases=new Map(), channels=[];
  let lose=false;
  const client={
    channel:()=>{
      const ch={on(_type,filter,cb){this.filter=filter;this.cb=cb;return this;},subscribe(){channels.push(this);return this;}};return ch;
    }, removeChannel:vi.fn(ch=>{channels.splice(channels.indexOf(ch),1);}),
    from:table=>{
      const predicates=[];
      const q={select(){return this;},eq(k,v){predicates.push(row=>row[k]===v);return this;},is(k,v){return this.eq(k,v);},in(k,ids){predicates.push(row=>ids.includes(row[k]));return this;},then(resolve){return Promise.resolve({data:[...(table==='family_sleep_sessions'?rows:entries).values()].filter(row=>predicates.every(p=>p(row))).map(row=>({...row}))}).then(resolve);}}; return q;
    },
    rpc:vi.fn(async(_name,p)=>{
      let row=rows.get(aliases.get(p.p_session_id)||p.p_session_id);
      if(p.p_action==='start') {
        row ||= [...rows.values()].find(r=>r.baby_id===p.p_baby_id&&!r.ended_at&&!r.cancelled_at);
        if(!row){row={id:p.p_session_id,household_id:p.p_household_id,baby_id:p.p_baby_id,started_at:p.p_started_at||new Date().toISOString(),ended_at:null,cancelled_at:null};rows.set(row.id,row);}
        aliases.set(p.p_session_id,row.id);
      }else if(!row.ended_at&&!row.cancelled_at) {
        if(p.p_action==='cancel') row.cancelled_at=new Date().toISOString();
        else {row.ended_at=p.p_ended_at;entries.set(row.id,{id:row.id,baby_id:row.baby_id,household_id:row.household_id,sleep_minutes:30});}
      }
      if(lose){lose=false;return {error:{message:'response lost'}};}
      return {data:{session:{...row},entry:entries.get(row.id)||null}};
    }),
  };
  return {client,rows,entries,loseNext:()=>{lose=true;},emit:async()=>{channels.forEach(ch=>ch.cb());await flush();}};
}
function harness(server,user='u1',storage=new Map(),local=null) {
  const listeners={}, elements=new Map();
  const element=s=>{if(!elements.has(s))elements.set(s,{disabled:false});return elements.get(s);};
  let seq=0;
  const ctx={
    state:{supabase:server.client,session:{user:{id:user}},household:{id:'home'},babies:[{id:'baby'},{id:'baby2'}],activeBabyId:'baby',growthEntries:[]},
    careTimer:local, careTimerDefinition:()=>({type:'sleep',label:'수면'}),
    careTimerContextKey:()=>`${ctx.state.session?.user.id}:${ctx.state.household?.id}`,
    persistCareTimer:vi.fn(),renderTodayCareSummary:vi.fn(),activeBabyEntries:()=>[],
    fromGrowthRemote:row=>({id:row.id,babyId:row.baby_id,sleepMinutes:row.sleep_minutes}),
    dispatchGrowthEntrySaved:vi.fn(),showGrowthComplete:vi.fn(),formatDuration:m=>`${m}분`,toast:vi.fn(),
    withAuthRecovery:fn=>fn(),uid:()=>`${user}-${++seq}`,Date,
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{hidden:false,querySelector:element,addEventListener:(type,fn)=>{listeners[type]=fn;}},
    window:{addEventListener:(type,fn)=>{listeners[type]=fn;},confirm:()=>true},setInterval:fn=>{listeners.poll=fn;},
    renderCareTimer:()=>{element('[data-compact-sleep]').disabled=false;element('[data-compact-sleep]').textContent=ctx.careTimer?'수면 끝':'수면 시작';},
    renderGrowth:()=>ctx.renderCareTimer(),
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {ctx,api:ctx.window.FAMILY_SLEEP,storage,listeners,elements};
}
test('two clients see identical starts, another member ends it, both can immediately restart',async()=>{
  const s=server(), a=harness(s),b=harness(s,'u2'); await flush();
  await a.api.start(); await s.emit();
  expect(a.ctx.careTimer.startedAt).toBe(b.ctx.careTimer.startedAt);
  expect(a.ctx.careTimer.sharedId).toBe(b.ctx.careTimer.sharedId);
  await b.api.stop();await s.emit();
  expect(a.ctx.careTimer).toBeNull();expect(b.ctx.careTimer).toBeNull();
  expect(a.ctx.state.growthEntries).toHaveLength(1);expect(b.ctx.state.growthEntries).toHaveLength(1);
  expect(a.elements.get('[data-compact-sleep]').disabled).toBe(false);
  await a.api.start();await s.emit();expect(b.ctx.careTimer.sharedId).toBe('u1-2');
});
test('lost end response resumes after reload with original ID/time and one record',async()=>{
  const s=server(),a=harness(s);await flush();await a.api.start();s.loseNext();
  await a.api.stop();expect(a.api.hasPending()).toBe(true);
  const first=s.client.rpc.mock.calls.at(-1)[1];
  const reloaded=harness(s,'u1',a.storage);await flush();
  expect(s.client.rpc.mock.calls.at(-1)[1]).toEqual(first);
  expect(reloaded.ctx.careTimer).toBeNull();expect(s.entries.size).toBe(1);expect(reloaded.api.hasPending()).toBe(false);
});
test('start response loss retries the same ID; concurrent clicks do not submit twice',async()=>{
  const s=server(),a=harness(s);await flush();s.loseNext();
  const first=a.api.start();await a.api.start();await first;
  expect(s.client.rpc).toHaveBeenCalledTimes(1);
  await a.api.start();expect(s.client.rpc.mock.calls[1][1]).toEqual(s.client.rpc.mock.calls[0][1]);
  expect(s.rows.size).toBe(1);
});
test('focus/reconnect loads a missed start; switching babies projects the correct timer',async()=>{
  const s=server(),a=harness(s),b=harness(s,'u2');await flush();await a.api.start();
  await b.listeners.focus();await flush();expect(b.ctx.careTimer.sharedId).toBe(a.ctx.careTimer.sharedId);
  b.ctx.state.activeBabyId='baby2';b.ctx.renderCareTimer();expect(b.ctx.careTimer).toBeNull();
  b.ctx.state.activeBabyId='baby';b.ctx.renderCareTimer();expect(b.ctx.careTimer.babyId).toBe('baby');
  await b.api.cancel();await s.emit();expect(a.ctx.careTimer).toBeNull();expect(s.entries.size).toBe(0);
});
test('late response from a prior family cannot overwrite a new account',async()=>{
  const s=server(),a=harness(s);await flush();let resolve;
  s.client.rpc.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const request=a.api.start();a.ctx.state.household={id:'other'};a.ctx.state.babies=[];
  await a.listeners.familycontextchange();
  resolve({data:{session:{id:'old',household_id:'home',baby_id:'baby',started_at:new Date().toISOString()},entry:null}});await request;
  expect(a.ctx.careTimer).toBeNull();expect(a.ctx.state.growthEntries).toHaveLength(0);
});
test('running legacy timer is imported with original time; local feeding is retained',async()=>{
  const started=Date.now()-60000;
  const s=server(),a=harness(s,'u1',new Map(),{type:'sleep',babyId:'baby',contextKey:'u1:home',startedAt:started});await flush();
  expect(a.ctx.careTimer.startedAt).toBe(started);expect(a.ctx.careTimer.sharedId).toBe('u1-1');
  const b=harness(s,'u2',new Map(),{type:'feeding',babyId:'baby',startedAt:started});await flush();
  expect(b.ctx.careTimer.type).toBe('feeding');
});
