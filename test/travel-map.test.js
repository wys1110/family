import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const source = readFileSync('travel-map.js', 'utf8');
const items = [
  { id:'a', title:'첫 장소', dayIndex:0, place:{lat:'37.56',lng:'126.97'} },
  { id:'missing', title:'위치 없음', dayIndex:0 },
  { id:'invalid', title:'잘못된 좌표', dayIndex:5, place:{lat:91,lng:127} },
  { id:'b', title:'세 번째', dayIndex:0, place:{lat:37.57,lng:126.98} },
  { id:'c', title:'다른 날', dayIndex:1, place:{lat:37.58,lng:126.99} },
  { id:'inbox', title:'미정', dayIndex:null, place:{lat:37.59,lng:127} },
];

function loadMap({ key = 'test-js-key', initialLevel = 8, fitLevel = 2 } = {}) {
  const calls = { maps:[], overlays:[], routes:[], scripts:[], sdkLoads:[], observers:[], controls:[], levels:[], relayouts:0 };
  function element(tag) {
    return {
      tagName:tag.toUpperCase(), attrs:{}, children:[], style:{}, className:'', type:'', textContent:'', innerHTML:'',
      hidden:false, isConnected:true,
      setAttribute(name,value){this.attrs[name]=String(value);},
      getAttribute(name){return this.attrs[name]??null;},
      append(...nodes){this.children.push(...nodes);},
      replaceChildren(...nodes){this.children=nodes;},
      addEventListener(name,handler){this[`on${name}`]=handler;},
      remove(){this.removed=true;},
      click(){this.onclick?.();},
    };
  }
  const container=element('div');
  const status=element('p'); status.hidden=true;
  const selected=element('div');
  const zoomIn=element('button'),zoomOut=element('button');
  const root={querySelector(selector){return ({'.travel-kakao-map':container,'.travel-map-status':status,'.travel-map-selected':selected,'[data-travel-map-zoom-in]':zoomIn,'[data-travel-map-zoom-out]':zoomOut})[selector]??null;}};
  const scripts=[];
  const document={
    createElement:element,
    head:{append(...nodes){for(const node of nodes)if(node.tagName==='SCRIPT'){scripts.push(node);calls.scripts.push(node);}}},
  };
  class LatLng { constructor(lat,lng){this.lat=Number(lat);this.lng=Number(lng);} }
  class LatLngBounds {
    constructor(){this.points=[];}
    extend(point){this.points.push(point);return this;}
  }
  class Map {
    constructor(node,options){
      this.node=node;this.options=options;this.level=initialLevel;this.center=null;this.bounds=[];
      calls.maps.push(this);
    }
    addControl(control,position){calls.controls.push({control,position});}
    setBounds(bounds,...padding){this.bounds=bounds;this.padding=padding;this.level=fitLevel;}
    setCenter(point){this.center=point;}
    setLevel(level){this.level=level;calls.levels.push(level);}
    getLevel(){return this.level;}
    getCenter(){return this.center;}
    panTo(point){this.center=point;this.panCount=(this.panCount??0)+1;}
    relayout(){calls.relayouts++;}
  }
  class CustomOverlay {
    constructor(options){this.options=options;this.map=options.map??null;calls.overlays.push(this);}
    setMap(map){this.map=map;}
  }
  class Polyline {
    constructor(options){this.options=options;this.map=options.map??null;calls.routes.push(this);}
    setMap(map){this.map=map;}
  }
  class ResizeObserver {
    constructor(callback){this.callback=callback;this.disconnected=false;calls.observers.push(this);}
    observe(target){this.target=target;}
    disconnect(){this.disconnected=true;}
    trigger(){this.callback([{contentRect:{width:400,height:300}}]);}
  }
  const maps={
    Map:undefined, LatLng, LatLngBounds, CustomOverlay, Polyline,
    ZoomControl:class ZoomControl{}, ControlPosition:{RIGHT:'RIGHT'},
    load(callback){calls.sdkLoads.push(callback);},
  };
  const window={FAMILY_CONFIG:{kakaoMapsJavaScriptKey:key},kakao:{maps},getComputedStyle:()=>({getPropertyValue:()=> 'currentColor'})};
  vm.runInNewContext(source,{window,document,ResizeObserver,setTimeout,clearTimeout});
  return {
    api:window.FAMILY_TRAVEL_MAP,calls,root,container,status,selected,document,
    resolveSdk(index=0){maps.Map=Map;scripts[index].onload();calls.sdkLoads.shift()?.();},
  };
}

test('renders an accessible Kakao map and keeps numbered day pins and same-day routes in sync', async () => {
  const {api,calls,root,selected,resolveSdk}=loadMap();
  const controller=api.create();
  const markup=controller.render({items,grouped:true});
  expect(markup).toContain('class="travel-kakao-map"');
  expect(markup).toContain('role="region"');
  expect(markup).toContain('aria-label="지도 확대"');
  expect(markup).toContain('aria-label="지도 축소"');
  const selectedIds=[];
  const pending=controller.mount(root,{items,grouped:true,scope:'trip:all',onSelect:id=>selectedIds.push(id)});
  expect(calls.scripts).toHaveLength(1);
  expect(calls.scripts[0].src).toContain('https://dapi.kakao.com/v2/maps/sdk.js?appkey=test-js-key&autoload=false');
  resolveSdk();
  await pending;

  expect(calls.maps).toHaveLength(1);
  const buttons=calls.overlays.map(overlay=>overlay.options.content);
  expect(buttons.map(button=>button.tagName)).toEqual(['BUTTON','BUTTON','BUTTON','BUTTON']);
  expect(buttons.map(button=>button.attrs['aria-label'])).toEqual([
    'DAY 1 1번 첫 장소','DAY 1 3번 세 번째','DAY 2 1번 다른 날','보관함 1번 미정',
  ]);
  expect(buttons.map(button=>button.type)).toEqual(['button','button','button','button']);
  expect(buttons[1].innerHTML).toContain('D1');
  expect(calls.routes).toHaveLength(1);
  expect(calls.routes[0].options.path.map(point=>[point.lat,point.lng])).toEqual([[37.56,126.97],[37.57,126.98]]);
  const level=calls.maps[0].level;
  root.querySelector('[data-travel-map-zoom-in]').click();
  expect(calls.maps[0].level).toBe(level-1);
  root.querySelector('[data-travel-map-zoom-out]').click();
  expect(calls.maps[0].level).toBe(level);

  buttons[1].click();
  expect(selectedIds).toEqual(['b']);
  const map=calls.maps[0],bounds=map.bounds;
  await controller.mount(root,{items,grouped:true,scope:'trip:all',activeId:'b',onSelect:id=>selectedIds.push(id)});
  expect(map.bounds).toBe(bounds);
  expect(selected.innerHTML).toContain('DAY 1 · 3번 · 세 번째');
  await controller.mount(root,{items,grouped:true,scope:'trip:all',activeId:'b',focus:true});
  expect(map.panCount).toBe(1);
  controller.destroy();
  expect(calls.overlays.every(overlay=>overlay.map===null)).toBe(true);
  expect(root.querySelector('.travel-kakao-map').children).toEqual([]);
});

test('history controllers are independent, add no history routes, and refit only on history resize', async () => {
  const {api,calls,root,selected,resolveSdk}=loadMap();
  const itinerary=api.create(),history=api.create();
  const first=itinerary.mount(root,{items});
  const destinations=[
    {id:'제주',title:'제주',visits:2,place:{lat:33.4,lng:126.2},records:[{title:'첫 제주 <여행>',startDate:'2026-09-01',endDate:'2026-09-03'}]},
    {id:'부산',title:'부산',visits:1,place:{lat:35.1,lng:129},records:[]},
  ];
  const selectedIds=[];
  const second=history.mount(root,{items:destinations,kind:'history',onSelect:id=>selectedIds.push(id)});
  expect(calls.scripts).toHaveLength(1);
  resolveSdk();
  await Promise.all([first,second]);
  expect(calls.maps).toHaveLength(2);
  expect(calls.routes).toHaveLength(1);
  expect(calls.routes[0].options.map).toBe(calls.maps[0]);
  const before= calls.maps.map(map=>map.bounds);
  calls.observers[0].trigger();
  expect(calls.maps[0].bounds).toBe(before[0]);
  calls.observers[1].trigger();
  expect(calls.maps[1].bounds).not.toBe(before[1]);
  calls.overlays.at(-2).options.content.click();
  expect(selectedIds).toEqual(['제주']);
  await history.mount(root,{items:destinations,kind:'history',activeId:'제주'});
  expect(selected.innerHTML).toContain('첫 제주 &lt;여행&gt;');
  expect(selected.innerHTML).toContain('2026-09-01');

  history.destroy();
  expect(calls.observers[1].disconnected).toBe(true);
  expect(calls.overlays.filter(overlay=>overlay.options.map===calls.maps[1]).every(overlay=>overlay.map===null)).toBe(true);
  await itinerary.mount(root,{items});
  expect(calls.maps).toHaveLength(2);
});

test('ignores invalid coordinates and applies safe empty, single-point, and close-zoom bounds', async () => {
  const {api,calls,root,resolveSdk}=loadMap({initialLevel:8,fitLevel:2});
  const controller=api.create();
  const pending=controller.mount(root,{items:[items[0],items[1],items[2]]});
  resolveSdk();
  await pending;
  expect(api.placePoints(items)).toEqual([items[0],items[3],items[4],items[5]]);
  expect(calls.overlays).toHaveLength(1);
  expect(calls.maps[0].center).toEqual(expect.objectContaining({lat:37.56,lng:126.97}));
  expect(calls.maps[0].level).toBe(3);
  expect(calls.levels).toEqual([3]);
  await controller.mount(root,{items:[items[0],items[3]],scope:'multiple'});
  expect(calls.maps[0].padding).toEqual([30,30,30,30]);
  expect(calls.maps[0].level).toBe(3);
  expect(calls.levels.at(-1)).toBe(3);

  const empty=api.create(),emptyRoot=loadMapRoot();
  await empty.mount(emptyRoot,{items:[]});
  expect(calls.maps).toHaveLength(2);
  expect(calls.maps[1].center).toEqual(expect.objectContaining({lat:37.5665,lng:126.978}));
  expect(calls.maps[1].level).toBe(8);
});

function loadMapRoot() {
  const container={isConnected:true,replaceChildren(){this.children=[];},children:[]};
  const status={hidden:true};
  const selected={innerHTML:''};
  const zoomIn={},zoomOut={};
  return {querySelector(selector){return ({'.travel-kakao-map':container,'.travel-map-status':status,'.travel-map-selected':selected,'[data-travel-map-zoom-in]':zoomIn,'[data-travel-map-zoom-out]':zoomOut})[selector]??null;}};
}

test('retries failed shared SDK loading and ignores a mount destroyed or detached while pending', async () => {
  const {api,calls,root,resolveSdk}=loadMap();
  const controller=api.create();
  const failed=controller.mount(root,{items});
  calls.scripts[0].onerror();
  await failed;
  expect(root.querySelector('.travel-map-status').hidden).toBe(false);
  expect(root.querySelector('.travel-map-status').innerHTML).toContain('data-travel-map-retry');

  const retry=controller.mount(root,{items,retry:true});
  expect(calls.scripts).toHaveLength(2);
  resolveSdk(1);
  await retry;
  expect(calls.maps).toHaveLength(1);
  controller.destroy();

  const detached=loadMap(),detachedController=detached.api.create();
  const pending=detachedController.mount(detached.root,{items});
  detached.root.querySelector('.travel-kakao-map').isConnected=false;
  detached.resolveSdk();
  await pending;
  expect(detached.calls.maps).toHaveLength(0);

  const destroyed=loadMap(),destroyedController=destroyed.api.create();
  const pendingMount=destroyedController.mount(destroyed.root,{items});
  destroyedController.destroy();
  destroyed.resolveSdk();
  await pendingMount;
  expect(destroyed.calls.maps).toHaveLength(0);
});
