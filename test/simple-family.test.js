import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

// Small DOM fixture: tests routing to existing controls, not business logic copies.
function fixture() {
  class Node {
    constructor(tag='div', classes='', id='') { this.tagName=tag; this.className=classes; this.id=id; this.dataset={}; this.children=[]; this.attrs={}; this.listeners={}; this.hidden=false; this.disabled=false; this.open=false; this._text=''; }
    get textContent(){ return this._text+this.children.map(n=>n.textContent).join(''); }
    set textContent(v){ this.children=[];this._text=v; }
    get lastElementChild(){ return this.children.at(-1); }
    append(...nodes){ for(const n of nodes){ if(n.parentElement)n.parentElement.children=n.parentElement.children.filter(c=>c!==n); this.children.push(n);n.parentElement=this; } }
    prepend(n){ this.append(n);this.children.unshift(this.children.pop()); }
    before(n){ const p=this.parentElement;if(!p)return;p.append(n);p.children.splice(p.children.indexOf(n),1);p.children.splice(p.children.indexOf(this),0,n); }
    after(n){ const p=this.parentElement;if(!p)return;p.append(n);p.children.splice(p.children.indexOf(n),1);p.children.splice(p.children.indexOf(this)+1,0,n); }
    replaceChildren(...nodes){ this.children.forEach(n=>n.parentElement=null);this.children=[];this._text='';this.append(...nodes); }
    setAttribute(k,v){ this.attrs[k]=String(v); }
    removeAttribute(k){ delete this.attrs[k]; }
    addEventListener(k,fn){ (this.listeners[k]||=[]).push(fn); }
    click(){ if(!this.disabled)for(const fn of this.listeners.click||[])fn({target:this}); }
    showModal(){this.open=true;}
    close(){this.open=false;for(const fn of this.listeners.close||[])fn();}
    matches(s){
      const attrs=[...s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
      if(attrs.some(([,key,val])=>{ const actual=key.startsWith('data-')?this.dataset[key.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]:this.attrs[key];return val===undefined?actual===undefined:actual!==val;}))return false;
      s=s.replace(/\[[^\]]*\]/g,'');const id=s.match(/#([\w-]+)/)?.[1];if(id&&this.id!==id)return false;
      if([...s.matchAll(/\.([\w-]+)/g)].some(([,c])=>!this.className.split(' ').includes(c)))return false;
      const tag=s.match(/^[\w-]+/)?.[0];return !tag||this.tagName===tag;
    }
    querySelectorAll(selector){ const parts=selector.split(' ');let parents=[this];for(const part of parts){ const found=[];const walk=n=>{for(const child of n.children){if(child.matches(part))found.push(child);walk(child);}};parents.forEach(walk);parents=found;}return parents; }
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
  }
  const root=new Node('html');const add=(parent,tag,classes='',id='')=>{const n=new Node(tag,classes,id);parent.append(n);return n;};
  const shell=add(root,'div','','appShell'),top=add(shell,'header','topbar');add(top,'h1');add(top,'button','','accountButton');
  const nav=add(shell,'nav','view-tabs');const tabs={};
  for(const name of ['calendar','growth','assistant','english','travel','settings','admin']){const tab=add(nav,'button',`view-tab${name==='calendar'?' active':''}`);tab.dataset.view=name;tab.textContent=name;tab.addEventListener('click',vi.fn());tabs[name]=tab;}
  tabs.admin.hidden=true;
  const calendar=add(shell,'div','','calendarView');add(shell,'section','daily-verse-card');
  const growth=add(shell,'div','','growthView'),journal=add(growth,'div','','babyJournalContent');add(growth,'div','baby-header-actions');
  const profile=add(journal,'section','baby-profile-card');profile.dataset.wallpaperSurface='growth';const wallpaper=add(profile,'div','wallpaper-actions');const remove=add(wallpaper,'button');remove.dataset.wallpaperRemove='growth';
  const timer=add(journal,'section','','careTimerCard'),running=add(timer,'div','','careTimerRunning');running.hidden=true;
  const block=add(timer,'div','care-quick-block');const sources={};
  for(const [name,attr,value]of [['sleep','compactSleep',''],['feed','growthQuick','수유·이유식'],['diaper','growthQuick','기저귀']]){const b=add(block,'button');b.dataset[attr]=value;b.textContent=name==='sleep'?'수면 시작':name;b.addEventListener('click',vi.fn());sources[name]=b;}
  add(journal,'section','compact-today');add(journal,'section','growth-section');add(journal,'div','','growthRecordFilters');add(journal,'section','care-pattern-section');add(journal,'section','integrated-care-summary');add(journal,'section','','growthInsightRow');
  const state={activeView:'calendar',activeBabyId:'synthetic',babies:[{id:'synthetic'}]},events={},observers=[];
  const document={documentElement:root,createElement:tag=>new Node(tag),querySelector:s=>root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s)};
  const run=()=>vm.runInNewContext(readFileSync('simple-family.js','utf8'),{document,window:{FAMILY_APP_STATE:state,addEventListener:(k,fn)=>events[k]=fn},MutationObserver:class{constructor(fn){this.fn=fn;}observe(target){observers.push({target,fn:this.fn});}},Date});run();
  return {root,document,state,tabs,sources,profile,remove,journal,events,observers,run};
}

test('navigation delegates to original tabs and hides privileged entries',()=>{
  const f=fixture();f.document.querySelector('[data-simple-view="growth"]').click();expect(f.tabs.growth.listeners.click[0]).toHaveBeenCalledOnce();
  f.document.querySelector('#simpleNavigation').lastElementChild.click();
  const dialog=f.document.querySelector('#simpleMore');expect(dialog.open).toBe(true);
  expect(dialog.textContent).toContain('여행');expect(dialog.textContent).not.toContain('관리');
  dialog.querySelectorAll('button').find(b=>b.textContent==='여행').click();expect(f.tabs.travel.listeners.click[0]).toHaveBeenCalledOnce();expect(dialog.open).toBe(false);
});
test('quick records reuse sources and follow pending and family context states',()=>{
  const f=fixture(),quick=f.document.querySelector('[data-quick="sleep"]');quick.click();expect(f.sources.sleep.listeners.click[0]).toHaveBeenCalledOnce();
  f.sources.sleep.disabled=true;f.sources.sleep.textContent='수면 끝';f.observers.find(o=>o.target.id==='careTimerCard').fn();expect(quick.disabled).toBe(true);expect(quick.textContent).toBe('수면 끝');quick.click();expect(f.sources.sleep.listeners.click[0]).toHaveBeenCalledOnce();
  f.state.babies=[];f.events.familycontextchange();expect(f.document.querySelector('.simple-quick').hidden).toBe(true);
});
test('wallpaper render ownership and management access survive reorganization',()=>{
  const f=fixture();expect(f.profile.querySelector('[data-wallpaper-remove]')).toBe(f.remove);
  f.journal.hidden=true;expect(f.document.querySelector('.simple-profile-tools').parentElement.id).toBe('growthView');
  f.run();expect(f.document.querySelectorAll('#simpleNavigation')).toHaveLength(1);
});

test('care circle stays visible before records while other analysis stays collapsed',()=>{
  const f=fixture(), pattern=f.document.querySelector('.care-pattern-section');
  const analysis=f.document.querySelector('.simple-analysis'), history=f.document.querySelector('.growth-section');
  const summary=f.document.querySelector('.compact-today');
  expect(pattern.parentElement).toBe(f.journal);
  expect(f.journal.children.indexOf(pattern)).toBe(f.journal.children.indexOf(summary)+1);
  expect(f.journal.children.indexOf(history)).toBe(f.journal.children.indexOf(pattern)+1);
  expect(analysis.open).toBe(false);
  expect(f.document.querySelector('.integrated-care-summary').parentElement).toBe(analysis);
  expect(f.document.querySelector('#growthInsightRow').parentElement).toBe(analysis);
  f.events.familybabychange(); f.events.familycontextchange(); f.run();
  expect(f.document.querySelector('.care-pattern-section')).toBe(pattern);
  expect(pattern.parentElement).toBe(f.journal);
  expect(f.document.querySelectorAll('.simple-analysis')).toHaveLength(1);
  expect(analysis.open).toBe(false);
});
