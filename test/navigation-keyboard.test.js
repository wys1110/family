import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,test} from 'vitest';
test('top-level tabs support manual keyboard selection, wrapping and hidden tab exclusion',()=>{
 const listeners={},tabs=['calendar','growth','travel','settings','admin'].map((view,i)=>({dataset:{view},hidden:i===4,attributes:{},tabIndex:0,
 classList:{contains:()=>i===0},setAttribute(name,value){this.attributes[name]=value;},focus(){focused=this;},closest(){return this;}}));
 let focused=tabs[0];
 const nav={querySelectorAll:()=>tabs,addEventListener:(name,fn)=>{listeners[name]=fn;}};
 const document={documentElement:{dataset:{}},querySelector:()=>nav};
 vm.runInNewContext(readFileSync('tab-interaction-fix.js','utf8'),{document,window:{matchMedia:()=>({matches:false})},MutationObserver:class{observe(){}},requestAnimationFrame:fn=>fn(),Element:class{}});
 expect(tabs[0].attributes['aria-controls']).toBe('calendarView');
 const press=key=>listeners.keydown({target:focused,key,preventDefault(){}});
 press('ArrowLeft');expect(focused).toBe(tabs[3]); expect(focused.attributes['aria-selected']).toBe('false');
 press('Home');expect(focused).toBe(tabs[0]);press('ArrowRight');expect(focused).toBe(tabs[1]);
 press('End');expect(focused).toBe(tabs[3]);expect(tabs[4].tabIndex).toBe(-1);
});
