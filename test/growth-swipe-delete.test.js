import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

// Small DOM fixture: execute the shipped event handlers, without a new runtime dependency.
function harness() {
  const observers=[];
  class Element {
    constructor(tag='div',classes='',id='') { this.tag=tag;this.className=classes;this.id=id;this.dataset={};this.attrs={};this.children=[];this.listeners={};this.style={setProperty:vi.fn()}; }
    classList={contains:c=>this.className.split(' ').includes(c),add:c=>{if(!this.classList.contains(c))this.className+=` ${c}`;},remove:c=>{this.className=this.className.split(' ').filter(x=>x!==c).join(' ');},toggle:(c,on)=>on?this.classList.add(c):this.classList.remove(c)};
    matches(selector) {
      return selector.split(',').some(part=>{
        const terms=part.trim().split(/\s+/),last=terms.pop();
        const attr=last.match(/\[([^\]]+)\]/)?.[1],plain=last.replace(/\[[^\]]+\]/g,'');
        const match=plain.startsWith('#')?this.id===plain.slice(1):plain.startsWith('.')?this.classList.contains(plain.slice(1)):this.tag===plain;
        const dataKey=attr?.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
        return match&&(!attr||dataKey in this.dataset||attr in this.attrs)&&(!terms.length||this.parentElement?.closest(terms.join(' ')));
      });
    }
    closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;}
    querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
    contains(e){return e===this||this.children.some(c=>c.contains(e));}
    append(e){if(e.parentElement)e.parentElement.children=e.parentElement.children.filter(c=>c!==e);this.children.push(e);e.parentElement=this;}
    before(e){const p=this.parentElement;p.children.splice(p.children.indexOf(this),0,e);e.parentElement=p;}
    getAttribute(k){return this.attrs[k]??null;}
    setAttribute(k,v){this.attrs[k]=v;}
    addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
    setPointerCapture(){}
    focus(){this.focused=true;}
  }
  const root=new Element('section','','growthView');
  const recent=new Element('div','','growthList'),timeline=new Element('div','','carePatternContent'),measurements=new Element('div','','growthInsightRow');
  [recent,timeline,measurements].forEach(c=>root.append(c));
  const make=(container,classes,data)=>{const r=new Element('button',classes);r.dataset=data;r.setAttribute('aria-label','합성 기록 수정');container.append(r);return r;};
  const rows={recent:make(recent,'growth-entry',{id:'recent'}),sleep:make(timeline,'care-time-row',{careEntryId:'sleep'}),split:make(timeline,'care-split-entry',{careEntryId:'split'}),measurement:make(measurements,'growth-inline-history-row',{growthInlineEntry:'measurement'})};
  const remove=vi.fn(async()=>{});
  vm.runInNewContext(readFileSync('growth-swipe-delete.js','utf8'),{
    document:{querySelector:s=>s==='#growthView'?root:s==='#growthList'?recent:null,createElement:tag=>new Element(tag),addEventListener(){}},
    window:{FAMILY_DELETE_GROWTH_ENTRY:remove},state:{},renderGrowthList(){},Date,
    MutationObserver:class{constructor(fn){this.fn=fn;}observe(){observers.push(this.fn);}},
  });
  const dispatch=(type,row,extra={})=>{const event={type,target:row,pointerId:1,button:0,isPrimary:true,clientX:180,clientY:30,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn(),...extra};for(const fn of root.listeners[type]||[])fn(event);return event;};
  const swipe=row=>{dispatch('pointerdown',row);dispatch('pointermove',row,{clientX:70});dispatch('pointerup',row,{clientX:70});};
  return {root,rows,remove,dispatch,swipe,addSleep:()=>make(timeline,'care-time-row',{careEntryId:'after-filter'}),mutate:()=>observers.forEach(fn=>fn())};
}

test.each(['recent','sleep','split','measurement'])('%s records reveal delete and pass the original record ID',async kind=>{
  const h=harness(),row=h.rows[kind];h.swipe(row);
  expect(row.parentElement.classList.contains('is-open')).toBe(true);
  expect(h.dispatch('click',row).stopImmediatePropagation).toHaveBeenCalledOnce();
  const remove=row.parentElement.querySelector('.growth-swipe-delete');
  expect(remove.tabIndex).toBe(0);
  await remove.listeners.click[0]();
  expect(h.remove.mock.calls[0][0]).toBe(kind==='sleep'?'sleep':kind==='split'?'split':kind==='measurement'?'measurement':'recent');
});
test('timeline rows inserted after filtering are decorated once and retain swipe behavior',()=>{
  const h=harness(),row=h.addSleep();h.mutate();h.mutate();h.swipe(row);
  expect(row.parentElement.classList.contains('is-open')).toBe(true);
  expect(h.root.querySelectorAll('.growth-swipe-row')).toHaveLength(5);
});
test('vertical movement does not reveal deletion and opening a second list closes the first',()=>{
  const h=harness(),row=h.rows.sleep;
  h.dispatch('pointerdown',row);h.dispatch('pointermove',row,{clientX:175,clientY:90});h.dispatch('pointerup',row);
  expect(row.parentElement.classList.contains('is-open')).toBe(false);
  h.swipe(row);h.swipe(h.rows.measurement);
  expect(row.parentElement.classList.contains('is-open')).toBe(false);
  expect(h.rows.measurement.parentElement.classList.contains('is-open')).toBe(true);
});
