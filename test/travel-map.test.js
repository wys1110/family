import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync('travel-map.js', 'utf8');
const items = [
  { id:'a', title:'첫 장소', dayIndex:0, place:{lat:26.21,lng:127.68} },
  { id:'missing', title:'위치 없음', dayIndex:0 },
  { id:'b', title:'세 번째', dayIndex:0, place:{lat:26.22,lng:127.69} },
  { id:'c', title:'다른 날', dayIndex:1, place:{lat:26.69,lng:127.87} },
  { id:'inbox', title:'미정', dayIndex:null, place:{lat:26.3,lng:127.7} },
];

// Kakao SDK is an external boundary; exercise the real module through its public API.
function loadMap({loaded=true,key='test-key'}={}) {
  const calls={levels:[],maps:0,fit:0,markers:[],routes:[],pan:[],removed:0,scripts:[],disconnected:0,observers:[]};
  const container={isConnected:true,cleared:0,replaceChildren(){this.cleared++;},handlers:{},addEventListener(name,fn,options){this.handlers[name]={fn,options};},removeEventListener(name){delete this.handlers[name];}}, status={hidden:true,innerHTML:''}, selected={innerHTML:''};
  const zoomButtons=['in','out'].map(direction=>({dataset:{travelMapZoom:direction},handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},removeEventListener(name){delete this.handlers[name];}}));
  const root={querySelectorAll:()=>zoomButtons,querySelector:s=>({'.travel-kakao-map':container,'.travel-map-status':status,'.travel-map-selected':selected})[s]};
  const maps={
    LatLng:class {constructor(lat,lng){this.coords=[lat,lng];}},
    LatLngBounds:class {constructor(){this.points=[];}extend(point){this.points.push(point);}},
    Map:class {constructor(){calls.maps++;}setZoomable(){}relayout(){}setBounds(){calls.fit++;}getLevel(){return 1;}setLevel(level){calls.levels.push(level);}setCenter(){}panTo(point){calls.pan.push(point.coords);}},
    Polyline:class {constructor(options){this.options=options;calls.routes.push(this);}setMap(value){if(value===null){calls.removed++;calls.routes=calls.routes.filter(x=>x!==this);}}},
    CustomOverlay:class {constructor(options){this.options=options;calls.markers.push(this);}setMap(value){if(value===null){calls.removed++;calls.markers=calls.markers.filter(x=>x!==this);}}},
    event:{preventMap(){}},load:fn=>fn(),
  };
  const document={head:{append:script=>calls.scripts.push(script)},createElement:tag=>({tag,attrs:{},handlers:{},setAttribute(name,value){this.attrs[name]=value;},addEventListener(name,fn){this.handlers[name]=fn;},removeEventListener(name){delete this.handlers[name];},remove(){this.removed=true;}})};
  const window={FAMILY_CONFIG:{kakaoJavaScriptKey:key},kakao:loaded?{maps}:undefined,getComputedStyle:()=>({getPropertyValue:()=> '#123456'}),ResizeObserver:class {constructor(callback){calls.observers.push(callback);}observe(){}disconnect(){calls.disconnected++;}}};
  vm.runInNewContext(source,{window,document,setTimeout,clearTimeout});
  return {api:window.FAMILY_TRAVEL_MAP,calls,root,status,selected,window,maps,container,zoomButtons};
}

test('itinerary preserves day numbering, routes, button selection, view state and focus',async()=>{
  const {api,calls,root,selected,zoomButtons,container}=loadMap(), map=api.create();
  let chosen='';
  const options={items,grouped:true,scope:'trip:all',onSelect:id=>chosen=id};
  await map.mount(root,options);
  expect(calls.maps).toBe(1);expect(calls.fit).toBe(1);
  expect(container.handlers.wheel.options).toEqual({capture:true,passive:true});
  const stopPropagation=vi.fn();container.handlers.wheel.fn({stopPropagation});expect(stopPropagation).toHaveBeenCalledOnce();
  zoomButtons[1].handlers.click();expect(calls.levels.at(-1)).toBe(2);
  expect(calls.markers.map(m=>m.options.content.attrs['aria-label'])).toEqual(['DAY 1 1번 첫 장소','DAY 1 3번 세 번째','DAY 2 1번 다른 날','보관함 1번 미정']);
  expect(calls.routes).toHaveLength(1);
  expect(calls.routes[0].options.path.map(p=>p.coords)).toEqual([[26.21,127.68],[26.22,127.69]]);
  const button=calls.markers[1].options.content;
  expect(button.tag).toBe('button');expect(button.type).toBe('button');button.handlers.click();expect(chosen).toBe('b');
  await map.mount(root,{...options,activeId:'b'});expect(calls.fit).toBe(1);expect(button.handlers.click).toBeUndefined();
  await map.mount(root,{...options,activeId:'b',focus:true});expect(calls.pan).toEqual([[26.22,127.69]]);
  expect(selected.innerHTML).toContain('DAY 1 · 3번 · 세 번째');
  await map.mount(root,{...options,items:[items[3]],scope:'day-1'});expect(calls.fit).toBe(2);
  map.destroy();expect(calls.markers).toHaveLength(0);expect(calls.routes).toHaveLength(0);expect(calls.disconnected).toBe(1);expect(zoomButtons[0].handlers.click).toBeUndefined();expect(container.handlers.wheel).toBeUndefined();
});

test('independent map lifecycles and history dots expose escaped details on selection',async()=>{
  const {api,calls,root,container}=loadMap(), itinerary=api.create(),history=api.create();
  await itinerary.mount(root,{items});
  const destinations=[{id:'제주',title:'제주',visits:2,place:{lat:33.4,lng:126.2},records:[{title:'첫 제주 <여행>',startDate:'2026-09-01',endDate:'2026-09-03'}]}];
  const historyContainer={...container,cleared:0,handlers:{}},selected={innerHTML:''},historyRoot={...root,querySelector:selector=>selector==='.travel-kakao-map'?historyContainer:selector==='.travel-map-selected'?selected:root.querySelector(selector)};
  let chosen='';await history.mount(historyRoot,{items:destinations,kind:'history',onSelect:id=>chosen=id});
  expect(calls.maps).toBe(2);
  const beforeResize=calls.fit;calls.observers[0]();expect(calls.fit).toBe(beforeResize);calls.observers[1]();expect(calls.fit).toBe(beforeResize+1);
  const marker=calls.markers.at(-1);expect(marker.options.content.innerHTML).not.toContain('제주');expect(marker.options.content.innerHTML).not.toContain('2회');
  marker.options.content.handlers.click();expect(chosen).toBe('제주');
  await history.mount(historyRoot,{items:destinations,kind:'history',activeId:'제주'});
  expect(selected.innerHTML).toContain('첫 제주 &lt;여행&gt;');expect(selected.innerHTML).toContain('2026-09-01');
  history.destroy();expect(historyContainer.cleared).toBe(1);expect(container.cleared).toBe(0);expect(calls.markers).toHaveLength(4);await itinerary.mount(root,{items});expect(calls.maps).toBe(2);
});

test('missing key shows accessible retry and works after configuration is supplied',async()=>{
  const {api,calls,root,status,window}=loadMap({key:'__KAKAO_JAVASCRIPT_KEY__'}),map=api.create();
  await map.mount(root,{items});expect(calls.maps).toBe(0);expect(status.hidden).toBe(false);expect(status.innerHTML).toContain('data-travel-map-retry');
  expect(map.render()).toContain('role="status"');window.FAMILY_CONFIG.kakaoJavaScriptKey='test-key';await map.mount(root,{items,retry:true});expect(calls.maps).toBe(1);expect(status.hidden).toBe(true);
});

test('failed SDK requests reset and retry loads the dynamic SDK',async()=>{
  const {api,calls,root,status,window,maps}=loadMap({loaded:false}),map=api.create();
  const first=map.mount(root,{items});expect(calls.scripts[0].src).toContain('autoload=false');calls.scripts[0].onerror();await first;expect(status.hidden).toBe(false);expect(calls.scripts[0].removed).toBe(true);
  const retry=map.mount(root,{items,retry:true});expect(calls.scripts).toHaveLength(2);window.kakao={maps};calls.scripts[1].onload();await retry;expect(calls.maps).toBe(1);
});

test('late SDK responses cannot mount destroyed, disconnected or superseded views',async()=>{
  for(const action of ['destroy','disconnect','supersede']){
    const {api,calls,root,window,maps,container}=loadMap({loaded:false}),map=api.create();
    const first=map.mount(root,{items});let second;
    if(action==='destroy')map.destroy();
    if(action==='disconnect')container.isConnected=false;
    if(action==='supersede')second=map.mount(root,{items:[items[3]],scope:'new'});
    window.kakao={maps};calls.scripts[0].onload();await first;await second;
    expect(calls.maps).toBe(action==='supersede'?1:0);
    if(second)expect(calls.markers).toHaveLength(1);
  }
});

test('SDK timeout resets its promise and ignores the late completion',async()=>{
  vi.useFakeTimers();
  try {
    const {api,calls,root,status,window,maps}=loadMap({loaded:false}),map=api.create();
    const first=map.mount(root,{items}),lateLoad=calls.scripts[0].onload;
    await vi.advanceTimersByTimeAsync(15000);await first;
    expect(status.hidden).toBe(false);expect(calls.maps).toBe(0);
    window.kakao={maps};lateLoad();expect(calls.maps).toBe(0);
    window.kakao=undefined;
    const retry=map.mount(root,{items,retry:true});expect(calls.scripts).toHaveLength(2);
    window.kakao={maps};calls.scripts[1].onload();await retry;expect(calls.maps).toBe(1);
  } finally {vi.useRealTimers();}
});

test('provider construction failures show retry and can recover',async()=>{
  const {api,calls,root,status,maps}=loadMap(),map=api.create(),original=maps.Map;
  maps.Map=class {constructor(){throw new Error('provider rejected');}};
  await map.mount(root,{items});expect(status.hidden).toBe(false);expect(status.innerHTML).toContain('data-travel-map-retry');
  maps.Map=original;await map.mount(root,{items,retry:true});expect(calls.maps).toBe(1);expect(status.hidden).toBe(true);
});
