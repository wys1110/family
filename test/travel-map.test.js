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
  const calls = { maps:0, removed:0, fit:0, markers:[], routes:[], redraw:0, pan:[] };
  const container = { isConnected:true };
  const status = { hidden:true, innerHTML:'' };
  const selected = { innerHTML:'' };
  const root = { querySelector: selector => ({'.travel-leaflet-map':container,'.travel-map-status':status,'.travel-map-selected':selected})[selector] };
  const instance = { remove:()=>calls.removed++, invalidateSize:()=>{}, fitBounds:()=>calls.fit++, setView:()=>{}, panTo:coords=>calls.pan.push(coords) };
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
  const {api,calls,root,tileEvents,status,selected}=loadMap();
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
  tileEvents.tileerror();
  expect(status.hidden).toBe(false);
  expect(status.innerHTML).toContain('data-travel-map-retry');
  await api.mount(root,{...options,retry:true});
  expect(calls.redraw).toBe(1);
  api.destroy();
  expect(calls.removed).toBe(1);
});
