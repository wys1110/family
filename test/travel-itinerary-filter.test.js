import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,test} from 'vitest';

const source=readFileSync('travel.js','utf8');
const sample={id:'trip-a',title:'제주',destinationLabel:'제주',startDate:'2026-10-01',endDate:'2026-10-03',items:[
 {id:'first',type:'place',title:'해변',note:'산책',dayIndex:0,order:0,visited:false,place:{address:'북쪽 해변',lat:33,lng:126}},
 {id:'middle',type:'place',title:'Cafe',note:'아기 의자',dayIndex:0,order:1,visited:true,place:{address:'중앙로',lat:33.1,lng:126.1}},
 {id:'last',type:'place',title:'수목원',note:'산책',dayIndex:0,order:2,visited:false,place:{address:'남쪽',lat:33.2,lng:126.2}},
 {id:'note',type:'note',title:'낮잠',note:'아기 의자 확인',dayIndex:1,order:0},
 {id:'inbox',type:'place',title:'호텔',dayIndex:null,order:0,visited:true,place:{address:'공항로',lat:33.3,lng:126.3}},
]};
function load({save=async()=>{}}={}){
 const trip=structuredClone(sample);
 const listeners={},events={},calls={render:[],mount:[],active:[],saves:[]};
 const control=kind=>({kind,value:'',disabled:false,selectionStart:0,selectionEnd:0,focus(){document.activeElement=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},matches:s=>s===`[data-travel-itinerary-${kind}]`,closest:()=>null});
 let filters=null;
 const mapRoot={scrollIntoView(){}};
 const view={dataset:{},hidden:false,_html:'',addEventListener(type,fn,capture){if(!capture)(listeners[type]??=[]).push(fn);},
  set innerHTML(value){document.activeElement=null;this._html=value;filters=value.includes('travel-itinerary-filters')?{query:control('query'),status:control('status')}:null;},get innerHTML(){return this._html;},
  querySelector(selector){
   if(selector==='.travel-itinerary-filters'){const block=filters;return block?{...block,contains:node=>node===block.query||node===block.status,querySelector:s=>s.includes('query')?block.query:block.status,replaceWith:node=>{filters=node;}}:null;}
   if(selector==='[data-travel-bulk]')return {classList:{toggle(){}},set innerHTML(value){view._html=view._html.replace(/(<section[^>]+data-travel-bulk[^>]*>)[\s\S]*?<\/section>/,(_,opening)=>opening+value+'</section>');}};
   if(selector==='[data-travel-itinerary-query]')return filters?.query??null;
   if(selector==='[data-travel-itinerary-status]')return filters?.status??null;
   if(selector==='.travel-workspace')return {querySelectorAll:()=>filters?[filters.query,filters.status]:[]};
   if(selector==='.travel-map-card')return this._html.includes('travel-map-card')?mapRoot:null;
   return null;
  },querySelectorAll:()=>[],setAttribute(){},
 };
 const document={activeElement:null,querySelector:s=>s==='#travelView'?view:null,querySelectorAll:()=>[],addEventListener(){}};
 const maps={create:()=>({render:options=>{calls.render.push(options.items.map(item=>item.id));return '';},mount:(_root,options)=>{calls.mount.push(options.items.map(item=>item.id));calls.active.push(options.activeId);},destroy(){},placePoints:items=>items.filter(item=>item.place?.lat!=null)}),placePoints:()=>[]};
 const data={getTrip:id=>id?trip:null,getTrips:()=>[trip],isLocal:()=>true,createTrip:async()=>({id:'new'}),toggleVisited:async(_trip,id)=>{calls.saves.push(id);trip.items.find(item=>item.id===id).visited=!trip.items.find(item=>item.id===id).visited;}};
 data.setPlacesVisited=async(_trip,ids,visited)=>{calls.saves.push(ids);await save();trip.items.filter(item=>ids.includes(item.id)).forEach(item=>item.visited=visited);};
 const window={FAMILY_APP_STATE:{activeView:'travel'},FAMILY_TRAVEL_DATA:data,FAMILY_TRAVEL_MAP:maps,FAMILY_TRAVEL_MANAGEMENT:{render:()=>'',renderResults:()=>''},addEventListener:(name,fn)=>{events[name]=fn;},switchView(){},matchMedia:()=>({matches:false}),scrollTo(){}};
 const context={window,document,HTMLFormElement:class{},FormData:class{constructor(form){this.form=form;}entries(){return Object.entries(this.form.values);}}};
 vm.runInNewContext(source,context);
 const emit=async(type,target,options={})=>{for(const fn of listeners[type]??[])await fn({target,preventDefault(){},...options});};
 const click=async(attr,value)=>{const target={dataset:{[attr.replace(/^data-/,'').replace(/-([a-z])/g,(_,char)=>char.toUpperCase())]:value},matches:s=>s===`[${attr}]`,closest:s=>s==='button,a,[data-map-item]'?target:null};await emit('click',target);};
 const query=async(value)=>{const input=filters?.query??control('query');input.value=value;input.selectionStart=input.selectionEnd=value.length;input.focus();await emit('input',input);return input;};
 const status=async(value)=>{const select=filters?.status??control('status');select.value=value;await emit('change',select);};
 const bulkSave=action=>emit('submit',Object.assign(new context.HTMLFormElement(),{id:'travelBulkForm',values:{}}),{submitter:{dataset:{travelBulkAction:action}}});
 const ids=()=>[...view.innerHTML.matchAll(/data-map-item="([^"]+)"/g)].map(match=>match[1]);
 return {view,document,calls,events,window,click,query,status,ids,emit,bulkSave,filters:()=>filters};
}

test('search and visit status use the same visible records for list, map, route and bulk selection',async()=>{
 const app=load();await app.click('data-travel-open','trip-a');
 await app.query('  CAFE  ');
 expect(app.ids()).toEqual(['middle']);
 expect(app.calls.render.at(-1)).toEqual(['middle']);expect(app.calls.mount.at(-1)).toEqual(['middle']);
 expect(decodeURIComponent(app.view.innerHTML)).toContain('query=중앙로');
 await app.query('아기 의자');expect(app.ids()).toEqual(['middle','note']);
 await app.status('visited');expect(app.ids()).toEqual(['middle']);
 await app.click('data-travel-bulk-start');await app.click('data-travel-bulk-visible');
 expect(app.view.innerHTML).toContain('1곳 선택');
 await app.query('산책');await app.status('unvisited');expect(app.ids()).toEqual(['first','last']);
 expect(app.calls.mount.at(-1)).toEqual(['first','last']);
 await app.click('data-travel-tab','day-1');expect(app.ids()).toEqual([]);
 expect(app.view.innerHTML).toContain('1곳 선택');expect(app.view.innerHTML).toContain('data-travel-itinerary-clear');
 await app.click('data-travel-tab','all');await app.click('data-travel-itinerary-clear');
 expect(app.ids()).toEqual(['first','middle','last','note','inbox']);
 expect(app.view.innerHTML).toContain('data-travel-select-place="middle" aria-label="Cafe 선택" checked');
 expect(app.calls.saves).toEqual([]);
});

test('filtered groups keep original reorder boundaries, hide empty dates and retain typing focus',async()=>{
 const app=load();await app.click('data-travel-open','trip-a');
 const input=await app.query('아기 의자');
 expect(app.document.activeElement).toBe(input);expect(app.filters().query).toBe(input);expect(input.selectionStart).toBe(5);
 const html=app.view.innerHTML;
 expect(html.match(/class="travel-day-group/g)).toHaveLength(2);
 const card=html.match(/<article[^>]*data-map-item="middle"[\s\S]*?<\/article>/)[0];
 expect(card).not.toMatch(/data-travel-reorder="(?:up|down)"[^>]*disabled/);
 await app.query('해변');expect(app.view.innerHTML).toMatch(/data-travel-reorder="up"[^>]*disabled/);
 expect(app.view.innerHTML).not.toMatch(/data-travel-reorder="down"[^>]*disabled/);
 await app.query('no matching item');expect(app.ids()).toEqual([]);expect(app.calls.mount.at(-1)).toEqual([]);
 expect(app.view.innerHTML).toContain('검색 조건에 맞는 기록이 없어요');
 await app.click('data-travel-itinerary-clear');expect(input.value).toBe('');expect(app.document.activeElement).toBe(input);
});

test('filters persist across selection mode and reset on trip, new-trip and family navigation',async()=>{
 const app=load();await app.click('data-travel-open','trip-a');await app.query('Cafe');await app.status('visited');
 await app.click('data-travel-bulk-start');expect(app.ids()).toEqual(['middle']);
 await app.click('data-travel-bulk-end');expect(app.ids()).toEqual(['middle']);
 await app.click('data-travel-back');await app.click('data-travel-open','trip-a');expect(app.ids()).toHaveLength(5);
 await app.query('Cafe');await app.status('visited');await app.click('data-travel-page','manage');await app.click('data-travel-open','trip-a');expect(app.ids()).toHaveLength(5);
 await app.query('Cafe');await app.status('visited');await app.click('data-travel-new');expect(app.ids()).toHaveLength(5);
 await app.query('Cafe');await app.status('visited');app.events.familycontextchange();await app.click('data-travel-open','trip-a');expect(app.ids()).toHaveLength(5);
});

test('composition input stays in place until the completed search event',async()=>{
 const app=load();await app.click('data-travel-open','trip-a');
 const input=app.filters().query;input.value='해';input.focus();
 await app.emit('input',input,{isComposing:true});
 expect(app.ids()).toHaveLength(5);expect(app.document.activeElement).toBe(input);
 input.value='해변';await app.emit('input',input,{isComposing:false});
 expect(app.ids()).toEqual(['first']);expect(app.document.activeElement).toBe(input);
});

test('bulk success and failure restore reusable filter controls and clear an excluded active map item',async()=>{
 for(const fails of [false,true]){
  let finish;
  const app=load({save:()=>new Promise((resolve,reject)=>{finish=()=>fails?reject(new Error('저장 실패')):resolve();})});
  await app.click('data-travel-open','trip-a');await app.query('Cafe');await app.status('visited');
  await app.click('data-travel-bulk-start');await app.click('data-travel-bulk-visible');await app.click('data-travel-select-item','middle');
  expect(app.calls.active.at(-1)).toBe('middle');
  const controls=app.filters(),pending=app.bulkSave('unvisited');
  expect(controls.query.disabled).toBe(true);expect(controls.status.disabled).toBe(true);
  finish();await pending;
  expect(app.filters().query).toBe(controls.query);expect(app.filters().status).toBe(controls.status);
  expect(controls.query.disabled).toBe(false);expect(controls.status.disabled).toBe(false);
  expect(app.ids()).toEqual(fails?['middle']:[]);
  expect(app.calls.active.at(-1)).toBe(fails?'middle':null);
  await app.query('해변');await app.status('all');expect(app.ids()).toEqual(['first']);
 }
});
