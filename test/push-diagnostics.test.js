import {test,expect,vi} from 'vitest';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness({permission='granted',enabled=true,sent=1,subscription={endpoint:'https://example.invalid/device'}}={}){
 const nodes=new Map();
 const node=()=>({textContent:'',classList:{add(){},toggle(){}},setAttribute(){},addEventListener(type,fn){this[type]=fn;}});
 for(const id of ['eventChangePushToggle','eventChangePushStatus','pushDiagnoseButton','pushTestButton','pushDiagnosis'])nodes.set('#'+id,node());
 const card={...node(),querySelector:s=>nodes.get(s)};
 const settings={querySelector:()=>null,appendChild(){}};
 const document={querySelector:s=>s==='#settingsView'?settings:{},createElement:()=>card};
 const invoke=vi.fn(async(_,{body})=>({data:body.action==='test'?{sent}:{enabled}}));
 const state={supabase:{functions:{invoke}},session:{user:{id:'user'}},household:{id:'home'}};
 const registration={pushManager:{getSubscription:async()=>subscription}};
 const navigator={userAgent:'iPhone',standalone:true,serviceWorker:{register:async()=>registration,ready:Promise.resolve(registration)}};
 const Notification={permission,requestPermission:vi.fn()};
 const window={navigator,Notification,PushManager:{},matchMedia:()=>({matches:true}),addEventListener(){},FAMILY_AUTH_API:{withRecovery:op=>op()}};
 vm.runInNewContext(readFileSync('daily-briefing.js','utf8'),{window,document,navigator,Notification,state,localStorage:{getItem:()=>null,setItem(){}},console:{warn(){},error(){}},setTimeout,Intl});
 return {window,nodes,invoke,state,Notification};
}
test('diagnosis checks registration without sending or requesting permission',async()=>{
 const h=harness();await flush();h.invoke.mockClear();expect(await h.window.FAMILY_EVENT_CHANGE_PUSH_API.diagnose()).toBe(true);expect(h.invoke.mock.calls.map(c=>c[1].body.action)).toEqual(['subscription-status']);expect(h.Notification.requestPermission).not.toHaveBeenCalled();expect(h.nodes.get('#pushDiagnosis').textContent).toContain('서버 연결: 알림 켜짐');expect(h.nodes.get('#pushTestButton').disabled).toBe(false);
});
test('test push targets this device and reports acceptance without claiming receipt',async()=>{
 const h=harness();await flush();h.invoke.mockClear();await h.nodes.get('#pushTestButton').click();expect(h.invoke.mock.calls.at(-1)[1].body).toEqual({action:'test',householdId:'home',endpoint:'https://example.invalid/device'});expect(h.nodes.get('#eventChangePushStatus').textContent).toContain('접수했어요');expect(h.nodes.get('#eventChangePushToggle').disabled).toBe(false);
});
test('blocked permission or disabled server registration prevents test delivery',async()=>{
 for(const opts of [{permission:'denied'},{enabled:false},{subscription:null}]){const h=harness(opts);await flush();h.invoke.mockClear();await h.nodes.get('#pushTestButton').click();expect(h.invoke.mock.calls.some(c=>c[1].body.action==='test')).toBe(false);expect(h.window.FAMILY_EVENT_CHANGE_PUSH_API.getStatus().pushReady).toBe(false);}
});
test('zero sent is not displayed as a successful test',async()=>{
 const h=harness({sent:0});await flush();await h.nodes.get('#pushTestButton').click();expect(h.nodes.get('#eventChangePushStatus').textContent).toContain('발송된 알림이 없어요');
});
test('stale diagnosis does not update another family or send a test there',async()=>{
 const h=harness();await flush();let resolve;h.invoke.mockImplementationOnce(()=>new Promise(r=>resolve=r));const pending=h.nodes.get('#pushTestButton').click();await flush();h.state.household={id:'other'};resolve({data:{enabled:true}});await pending;expect(h.invoke.mock.calls.some(c=>c[1].body.action==='test')).toBe(false);
});
