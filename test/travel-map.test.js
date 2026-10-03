import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const source = readFileSync('travel-map.js', 'utf8');
const items = [
  { id:'a', title:'첫 장소', dayIndex:0, place:{lat:26.21,lng:127.68} },
  { id:'missing', title:'위치 없음', dayIndex:0 },
  { id:'b', title:'세 번째', dayIndex:0, place:{lat:26.22,lng:127.69} },
  { id:'c', title:'다른 날', dayIndex:1, place:{lat:26.69,lng:127.87} },
  { id:'inbox', title:'미정', dayIndex:null, place:{lat:26.3,lng:127.7} },
];

// Leaflet is an external boundary. Record map actions; exercise the real module.
function loadMap() {
  const calls = { maps:0, removed:0, fit:0, markers:[], routes:[], redraw:0, pan:[], events:[] };
  const container = { isConnected:true };
  const status = { hidden:true, innerHTML:'' };
  const selected = { innerHTML:'' };
  const root = { querySelector: selector => ({'.travel-leaflet-map':container,'.travel-map-status':status,'.travel-map-selected':selected})[selector] };
  const instance = { remove:()=>calls.removed++, invalidateSize:()=>{}, fitBounds:()=>calls.fit++, setView:()=>{}, panTo:coords=>calls.pan.push(coords), on:(name,handler)=>{calls.events.push({name,handler});} };
  const tileEvents = {};
  const layer = { addTo:()=>layer, on:(name,handler)=>{tileEvents[name]=handler;return layer;}, redraw:()=>calls.redraw++ };
  const L = {
    map:()=>{calls.maps++;return instance;}, tileLayer:()=>layer,
    layerGroup:()=>({addTo(){return this;},clearLayers:()=>{calls.markers=[];calls.routes=[];}}),
    divIcon:options=>options,
    marker:(coords,options)=>{const marker={coords,options,addTo(){calls.markers.push(this);return this;},on(name,handler){this[name]=handler;return this;}};return marker;},
    polyline:(coords,options)=>({addTo(){calls.routes.push({coords,options});return this;}}),
  };
  const window = { L, getComputedStyle:()=>({getPropertyValue:()=> 'currentColor'}) };
  vm.runInNewContext(source,{window,document:{},requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout});
  return {api:window.FAMILY_TRAVEL_MAP,calls,root,tileEvents,status,selected};
}

test('real map keeps itinerary numbering, day routes, selection, view state, and retry', async () => {
  const {api:module,calls,root,tileEvents,status,selected}=loadMap();
  const api=module.create();
  let selectedId='';
  const options={items,grouped:true,scope:'trip:all',onSelect:id=>selectedId=id};
  expect(typeof api.mount).toBe('function');
  await api.mount(root,options);
  expect(calls.maps).toBe(1);
  expect(calls.fit).toBe(1);
  expect(calls.markers.map(marker=>marker.options.title)).toEqual(['DAY 1 1번 첫 장소','DAY 1 3번 세 번째','DAY 2 1번 다른 날','보관함 1번 미정']);
  expect(calls.routes).toHaveLength(1);
  expect(calls.routes[0].coords).toEqual([[26.21,127.68],[26.22,127.69]]);
  calls.markers[1].click();
  expect(selectedId).toBe('b');
  await api.mount(root,{...options,activeId:'b'});
  expect(calls.maps).toBe(1);
  expect(calls.fit).toBe(1);
  await api.mount(root,{...options,activeId:'b',focus:true});
  expect(calls.pan).toEqual([[26.22,127.69]]);
  expect(selected.innerHTML).toContain('DAY 1 · 3번 · 세 번째');
  await api.mount(root,{...options,items:[items[3]],scope:'trip:day-1'});
  expect(calls.fit).toBe(2);
  const replacementStatus={hidden:true,innerHTML:''};
  const replacementRoot={querySelector:selector=>selector==='.travel-map-status'?replacementStatus:root.querySelector(selector)};
  await api.mount(replacementRoot,{...options});
  tileEvents.tileerror();
  expect(replacementStatus.hidden).toBe(false);
  expect(replacementStatus.innerHTML).toContain('data-travel-map-retry');
  await api.mount(replacementRoot,{...options,retry:true});
  expect(calls.redraw).toBe(1);
  api.destroy();
  expect(calls.removed).toBe(1);
});

test('history and itinerary maps have independent lifecycles and history pins show visits without routes', async () => {
  const {api,calls,root,selected}=loadMap();
  const itinerary=api.create(), history=api.create();
  await itinerary.mount(root,{items});
  const destinations=[{id:'제주',title:'제주',visits:2,place:{lat:33.4,lng:126.2},records:[{title:'첫 제주 <여행>',startDate:'2026-09-01',endDate:'2026-09-03'}]}, {id:'부산',title:'부산',visits:1,place:{lat:35.1,lng:129},records:[]}];
  let chosen='';
  await history.mount(root,{items:destinations,kind:'history',onSelect:id=>chosen=id});
  expect(calls.maps).toBe(2);
  expect(calls.removed).toBe(0);
  expect(calls.routes).toHaveLength(0);
  expect(calls.markers[0].options.title).toBe('제주 · 2회 방문');
  expect(calls.markers[0].options.icon.html).toContain('제주');
  expect(calls.markers[0].options.icon.html).toContain('2회');
  const fitBeforeResize=calls.fit;
  calls.events.filter(event=>event.name==='resize').forEach(event=>event.handler());
  expect(calls.fit).toBe(fitBeforeResize+1);
  calls.markers[0].click();
  expect(chosen).toBe('제주');
  await history.mount(root,{items:destinations,kind:'history',activeId:'제주'});
  expect(selected.innerHTML).toContain('첫 제주 &lt;여행&gt;');
  expect(selected.innerHTML).toContain('2026-09-01');
  history.destroy();
  expect(calls.removed).toBe(1);
  await itinerary.mount(root,{items});
  expect(calls.maps).toBe(2);
});
