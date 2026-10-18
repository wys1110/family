import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';
const source = readFileSync('parenting-assistant.js', 'utf8');
function load({ origin, fetch, store } = {}) {
  class Element {
    constructor() { this.children=[]; this.events={}; this.attrs={}; this.hidden=false; this.value=''; this.classList={toggle:vi.fn()}; }
    setAttribute(name,value){this.attrs[name]=value;}
    append(...children){this.children.push(...children);}
    appendChild(child){this.append(child);return child;}
    replaceChildren(){this.children=[];}
    addEventListener(name,fn){this.events[name]=fn;}
    focus(){this.focused=true;}
    scrollIntoView(){this.scrolled=true;}
    get lastElementChild(){return this.children.at(-1);}
  }
  const input=new Element(),form=new Element(),log=new Element(),welcome=new Element(),send=new Element(),clear=new Element();
  const prompts=['수유 간격은 어떻게 잡으면 좋을까요?','밤에 자주 깨는데 무엇을 살펴볼까요?'].map(text=>Object.assign(new Element(),{textContent:text}));
  const status=new Element(),privacy=new Element(),babySelect=new Element(),useRecords=new Element(),contextPreview=new Element(); useRecords.checked=true;
  const savedList=new Element(),savedStatus=new Element(),savedCount=new Element(),savedSection=new Element();
  const controls={'#assistantSavedList':savedList,'#assistantSavedStatus':savedStatus,'#assistantSavedCount':savedCount,'.assistant-saved':savedSection,'#assistantBaby':babySelect,'#assistantUseRecords':useRecords,'#assistantContext':contextPreview,'.assistant-connection':status,'#assistantPrivacy':privacy,'textarea':input,'form':form,'[role="log"]':log,'.assistant-welcome':welcome,'[type="submit"]':send,'[data-assistant-clear]':clear};
  const views=[new Element(),new Element()];
  const tabs=['calendar','growth','assistant','travel'].map(view=>Object.assign(new Element(),{dataset:{view}}));
  const main=new Element(); main.appendChild=child=>{views.push(child);}; main.querySelectorAll=()=>views;
  const nav=new Element(); nav.querySelectorAll=()=>tabs;
  const add=new Element();
  const document={getElementById:id=>views.find(view=>view.id===id),querySelector:s=>({'main':main,'.view-tabs':nav,'#addEventButton':add}[s]),createElement:()=>{
    const element=new Element();element.querySelector=s=>controls[s];element.querySelectorAll=()=>prompts;return element;
  }};
  const events={},storage=new Map();
  const window={FAMILY_PARENTING_HISTORY:store,location:{origin},FAMILY_APP_STATE:{activeView:'calendar'},switchView:vi.fn(next=>{window.FAMILY_APP_STATE.activeView=next;}),addEventListener:(name,fn)=>{events[name]=fn;},confirm:vi.fn(()=>true)};
  window.switchView.existingMarker=true;
  let poll;
  vm.runInNewContext(source,{window,document,fetch,AbortController,crypto:{randomUUID:()=> 'new-id'},setInterval:fn=>{poll=fn;},localStorage:{setItem:(k,v)=>storage.set(k,v)},ACTIVE_VIEW_KEY:'active'});
  const submit=value=>{input.value=value;return form.events.submit({preventDefault(){}});};
  return {poll:()=>poll(),savedList,savedStatus,window,view:views.at(-1),views,input,log,welcome,send,clear,prompts,events,storage,submit,nav,tabs,status,privacy,babySelect,useRecords,contextPreview};
}

test('the chat is deferred and remains explicitly disconnected without sending data',()=>{
 const config=readFileSync('config.js','utf8');
 expect(config).toContain("assistant: ['parenting-context', 'parenting-history', 'parenting-assistant']");
 const app=load();
 expect(app.view.hidden).toBe(true);
 expect(app.view.innerHTML).toContain('AI 연결 전');
 expect(app.view.innerHTML).toContain('새로고침하면 사라져요.');
 expect(source).not.toMatch(/OPENAI_API_KEY|setItem\([^,]*,\s*(question|input|log)/);
 app.window.switchView('assistant');
 expect(app.view.hidden).toBe(false);
 expect(app.views.slice(0,-1).every(view=>view.hidden)).toBe(true);
 expect(app.window.FAMILY_APP_STATE.activeView).toBe('assistant');
 expect(app.storage.get('active')).toBe('assistant');
 expect(app.window.switchView.existingMarker).toBe(true);
});

test('questions remain text, cannot exceed the input limit, and never fabricate an AI reply',()=>{
 const app=load();
 app.submit('   ');app.submit('a'.repeat(2001));
 expect(app.log.children).toHaveLength(0);
 const question='<img src=x onerror=alert(1)>\n수유 질문';
 app.submit(question);
 expect(app.log.children).toHaveLength(2);
 expect(app.log.children[0].children[1].textContent).toBe(question);
 expect(app.log.children[0].children[1].innerHTML).toBeUndefined();
 expect(app.log.children[1].children[0].textContent).toBe('연결 안내');
 expect(app.log.children[1].children[1].textContent).toContain('외부로 전송하지 않고');
 expect(app.welcome.hidden).toBe(true);
 expect(app.input.value).toBe('');expect(app.send.disabled).toBe(true);
});

test('suggestions prepare editable questions, drafts survive navigation, and family changes clear private text',()=>{
 const app=load();
 app.prompts[0].events.click();
 expect(app.input.value).toBe(app.prompts[0].textContent);
 expect(app.input.focused).toBe(true);expect(app.send.disabled).toBe(false);
 expect(app.log.children).toHaveLength(0);
 app.window.switchView('assistant');app.window.switchView('calendar');app.window.switchView('assistant');
 expect(app.input.value).toBe(app.prompts[0].textContent);
 app.submit('질문');app.input.value='작성 중인 질문';
 app.events.familycontextchange();
 expect(app.log.children).toHaveLength(0);expect(app.input.value).toBe('');
 expect(app.welcome.hidden).toBe(false);expect(app.clear.hidden).toBe(true);
});

test('new conversation resets the screen without deleting saved questions',()=>{
 const app=load();app.submit('질문');
 app.clear.events.click();expect(app.log.children).toHaveLength(0);
 app.nav.events.click({target:{closest:()=>({dataset:{view:'assistant'}})}});
 expect(app.window.FAMILY_APP_STATE.activeView).toBe('assistant');
});

test('local chat sends only typed conversation and blocks double submit',async()=>{
 let finish;
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({provider:'codex-local',token:'token'})}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const app=load({origin:'http://127.0.0.1:8775',fetch});
 await vi.waitFor(()=>expect(app.status.textContent).toBe('Codex · 5.6 Sol'));
 const pending=app.submit('안녕하세요');
 await app.submit('중복');
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({messages:[{role:'user',content:'안녕하세요'}],context:'아이 기록이 없어요.'});
 finish({ok:true,json:async()=>({answer:'반가워요'})});await pending;
 expect(app.log.children[1].children[1].textContent).toBe('반가워요');
 expect(app.log.attrs['aria-busy']).toBe('false');
});

test('late replies cannot reappear after a family change',async()=>{
 let finish;
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({provider:'codex-local',token:'token'})}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const app=load({origin:'http://127.0.0.1:8775',fetch});
 await vi.waitFor(()=>expect(app.status.textContent).toBe('Codex · 5.6 Sol'));
 const pending=app.submit('질문');app.events.familycontextchange();
 expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
 finish({ok:true,json:async()=>({answer:'이전 가족 답변'})});await pending;
 expect(app.log.children).toHaveLength(0);
 expect(app.log.attrs['aria-busy']).toBe('false');
});

test('turning off records clears prior context and sends only the question',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({provider:'codex-local',token:'token'})}).mockResolvedValue({ok:true,json:async()=>({answer:'답변'})});
 const app=load({origin:'http://127.0.0.1:8775',fetch});
 await vi.waitFor(()=>expect(app.status.textContent).toBe('Codex · 5.6 Sol'));
 await app.submit('첫 질문');
 app.useRecords.checked=false;app.useRecords.events.change();
 await app.submit('새 질문');
 expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({messages:[{role:'user',content:'새 질문'}],context:''});
});

test('private mobile chat discovers only its same-origin server and uses its token',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({provider:'codex-local',token:'private-token'})}).mockResolvedValue({ok:true,json:async()=>({answer:'휴대폰 답변'})});
 const app=load({origin:'https://family-mac.example-tail.ts.net',fetch});
 await vi.waitFor(()=>expect(app.status.textContent).toBe('Codex · 5.6 Sol'));
 expect(app.privacy.textContent).toContain('연결된 Mac');
 await app.submit('질문');
 expect(fetch.mock.calls.map(call=>call[0])).toEqual(['/api/parenting/status','/api/parenting/chat']);
 expect(fetch.mock.calls[1][1].headers['X-Chat-Token']).toBe('private-token');
 expect(app.log.children[1].children[1].textContent).toBe('휴대폰 답변');
});

test('public and lookalike origins never try the private server; failed private auth stays disconnected',async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:false});
 for(const origin of ['https://wys1110.github.io','http://mac.tail.ts.net','https://mac.tail.ts.net.evil.test']) {
   const app=load({origin,fetch}); await app.submit('질문');
 }
 expect(fetch).not.toHaveBeenCalled();
 const app=load({origin:'https://mac.tail.ts.net',fetch});
 await vi.waitFor(()=>expect(app.status.textContent).toBe('연결 끊김'));
 await app.submit('질문');
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(app.log.children[1].children[1].textContent).toContain('외부로 전송하지 않고');
});

test('signed-in public app queues questions and restores the saved answer without a private network',async()=>{
 let rows=[];
 const ctx={userId:'owner',householdId:'home'};
 const store={context:()=>ctx,status:vi.fn(async()=>({registered:true,online:true})),list:vi.fn(async()=>rows),enqueue:vi.fn(async(_,q)=>{rows=[{id:q.id,question:q.question,status:'queued',created_at:'2026-10-18'}];})};
 const fetch=vi.fn();
 const app=load({origin:'https://wys1110.github.io',fetch,store});
 app.window.switchView('assistant');
 await vi.waitFor(()=>expect(app.status.textContent).toBe('Codex · 연결됨'));
 await app.submit('저장할 질문');
 expect(store.enqueue).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();
 expect(app.send.disabled).toBe(true);
 rows=[{...rows[0],status:'completed',answer:'DB 답변'}]; app.poll();
 await vi.waitFor(()=>expect(app.log.children[1].children[1].textContent).toBe('DB 답변'));
 const reloaded=load({origin:'https://wys1110.github.io',store});
 await vi.waitFor(()=>expect(reloaded.savedList.children).toHaveLength(1));
 reloaded.savedList.children[0].events.click();
 expect(reloaded.log.children[1].children[1].textContent).toBe('DB 답변');
});

test('late saved history is discarded after switching family',async()=>{
 let finish;
 const store={context:()=>({}),status:async()=>({online:true}),list:()=>new Promise(resolve=>{finish=resolve;})};
 const app=load({store}); app.events.familycontextchange();
 finish([{id:'old',question:'private previous family',status:'completed',answer:'old answer'}]);
 await Promise.resolve(); await Promise.resolve();
 expect(app.savedList.children).toHaveLength(0);expect(app.log.children).toHaveLength(0);
});
