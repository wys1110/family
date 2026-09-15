import {test,expect} from 'vitest';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup(){
 let active='calendar';const listeners={},events={},micro=[],frames=[];
 const state={session:{user:{id:'u'}},household:{id:'h'}};
 const document={documentElement:{dataset:{}},querySelector:()=>({dataset:{view:active}}),addEventListener:(name,fn)=>{listeners[name]=fn;}};
 const window={scrollX:0,scrollY:500,matchMedia:()=>({matches:false}),switchView:view=>{active=view;},addEventListener:(name,fn)=>{events[name]=fn;},scrollTo:({top})=>{window.scrollY=top;}};
 vm.runInNewContext(readFileSync('motion-system.js','utf8'),{window,document,state,console,queueMicrotask:fn=>micro.push(fn),requestAnimationFrame:fn=>frames.push(fn)});
 const click=view=>{listeners.click({target:{closest:()=>({dataset:{view}})}});window.switchView(view);};
 const flush=()=>{while(micro.length)micro.shift()();while(frames.length)frames.shift()();};
 return {window,state,events,listeners,click,flush,active:()=>active};
}
test('tabs restore their independent scroll positions and repeated taps do not jump',()=>{
 const h=setup();h.click('growth');h.flush();expect(h.window.scrollY).toBe(0);h.window.scrollY=1200;h.click('calendar');h.flush();expect(h.window.scrollY).toBe(500);h.click('growth');h.flush();expect(h.window.scrollY).toBe(1200);h.click('growth');h.flush();expect(h.window.scrollY).toBe(1200);
});
test('rapid navigation retains the saved destination instead of the intermediate scroll',()=>{
 const h=setup();h.click('growth');h.flush();h.window.scrollY=1200;for(const view of ['settings','calendar','growth','calendar'])h.click(view);h.flush();expect(h.active()).toBe('calendar');expect(h.window.scrollY).toBe(500);
});
test('programmatic navigation, user scrolling and family changes cancel pending restoration',()=>{
 for(const action of ['programmatic','scroll','family']){
  const h=setup();h.click('growth');
  if(action==='programmatic')h.window.switchView('settings');
  if(action==='scroll')h.listeners.touchmove();
  if(action==='family'){h.state.household={id:'other'};h.events.familycontextchange();}
  h.window.scrollY=77;h.flush();expect(h.window.scrollY).toBe(77);
 }
});
