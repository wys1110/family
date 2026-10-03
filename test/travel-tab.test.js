import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const dataSource = readFileSync('travel-data.js', 'utf8');
const travelSource = readFileSync('travel.js', 'utf8');
const configSource = readFileSync('config.js', 'utf8');
const deferredSource = readFileSync('deferred-tabs.js', 'utf8');
const appSource = readFileSync('app.js', 'utf8');
const travelCssSource = readFileSync('travel.css', 'utf8');

function loadData({ demoMode = false, savedTrips, shared = false } = {}) {
  const store = new Map();
  const key = 'family-travel-v1:household-a';
  if (savedTrips !== undefined) store.set(key, JSON.stringify(savedTrips));
  const window = {
    FAMILY_DEMO_MODE: demoMode,
    FAMILY_APP_STATE: { household: { id: 'household-a' } },
    FAMILY_TRAVEL_SHARING: shared ? { enabled: () => true, load: async () => [] } : undefined,
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    addEventListener: () => {}, dispatchEvent: () => {},
  };
  window.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const context = { window, localStorage: window.localStorage, CustomEvent: window.CustomEvent, crypto: { randomUUID: () => 'id-1' } };
  vm.createContext(context); vm.runInContext(dataSource, context);
  return { api: window.FAMILY_TRAVEL_DATA, store };
}

test('demo travel mode seeds only a generic local sample and never shared records', () => {
  const { api, store } = loadData({ demoMode: true });
  const trips = api.getTrips();
  expect(trips).toHaveLength(1);
  expect(trips.map(({ title, startDate, endDate }) => [title, startDate, endDate])).toEqual([
    ['도윤이와 첫 오키나와', '2026-12-11', '2026-12-15'],
  ]);
  expect(trips[0].items.some(item => item.type === 'place' && Number.isFinite(item.place?.lat) && Number.isFinite(item.place?.lng))).toBe(true);
  expect(trips[0].intro).toContain('예정 여행 예시');
  expect(store.size).toBe(0);
});

test('demo history replaces only an untouched default sample and preserves custom local and remote data', () => {
  const original = loadData({ demoMode: true }).api.getTrips().at(-1);
  expect(loadData({ demoMode: true, savedTrips: [original] }).api.getTrips()).toHaveLength(1);

  const editedDefault = { ...original, title: '우리의 편집한 오키나와 계획' };
  const editedResult = loadData({ demoMode: true, savedTrips: [editedDefault] }).api.getTrips();
  expect(editedResult).toHaveLength(1);
  expect(editedResult[0].title).toBe('우리의 편집한 오키나와 계획');

  const custom = { id: 'my-demo-trip', title: '내가 만든 제주 여행', destination: '제주', startDate: '2026-10-01', endDate: '2026-10-02', items: [] };
  const customResult = loadData({ demoMode: true, savedTrips: [custom] }).api.getTrips();
  expect(customResult.map(trip => trip.id)).toEqual(['my-demo-trip']);
  expect(loadData({ demoMode: true, savedTrips: [] }).api.getTrips()).toEqual([]);

  const remote = loadData({ demoMode: true, shared: true });
  expect(remote.api.getTrips()).toEqual([]);
  expect(remote.store.size).toBe(0);
});

test('travel records remain scoped to the current family and retain places and memories', async () => {
  const { api, store } = loadData();
  const trip = await api.createTrip({ title: '제주 첫 가족여행', destination: '제주', startDate: '2026-10-01', endDate: '2026-10-03', intro: '바다를 처음 본 날' });
  await api.addItem(trip.id, { localDate: '2026-10-01', kind: 'visit', title: '협재 해변', place: '협재 해변', latitude: 33.394, longitude: 126.239 });
  await api.addMemory(trip.id, { localDate: '2026-10-01', title: '첫 바다', note: '파도 소리에 웃었어요.' });
  const saved = api.getTrip(trip.id);
  expect(saved.items).toHaveLength(1);
  expect(saved.memories).toHaveLength(1);
  expect([...store.keys()]).toEqual(['family-travel-v1:household-a']);
});

test('travel history summary validates dates, classifies per-trip timezones, deduplicates ids and ignores archived state', () => {
  const { api } = loadData();
  const now = new Date('2026-10-01T00:30:00.000Z');
  const trips = [
    { id: 'past', startDate: '2026-09-28', endDate: '2026-09-30', destinationLabel: ' 제주 ', archivedAt: '2026-10-01', timezone: 'Asia/Seoul', items: [{ visited: false }] },
    { id: 'past', startDate: '2026-09-28', endDate: '2026-09-30', destinationLabel: '제주', timezone: 'Asia/Seoul' },
    { id: 'same-day', startDate: '2026-09-30', endDate: '2026-09-30', destination: '도쿄', timezone: 'Asia/Tokyo' },
    { id: 'ongoing', startDate: '2026-09-30', endDate: '2026-09-30', destination: '현재 일정', timezone: 'America/Los_Angeles' },
    { id: 'upcoming', startDate: '2026-10-02', endDate: '2026-10-03', destination: '예정', timezone: 'invalid/timezone' },
    { id: 'bad-calendar', startDate: '2026-02-29', endDate: '2026-03-01', destination: '제주' },
    { id: 'bad-format', startDate: '2026-9-01', endDate: '2026-09-02', destination: '제주' },
    { id: 'reversed', startDate: '2026-09-03', endDate: '2026-09-02', destination: '부산' },
    { id: 'missing', startDate: '', endDate: '2026-09-02', destination: '부산' },
    { id: 'missing-destination', startDate: '2026-09-28', endDate: '2026-09-29', destinationLabel: '  ', destination: '' },
  ];
  const before = JSON.stringify(trips);
  expect(api.summarizeTrips(trips, now)).toMatchObject({
    pastTrips: 3, totalNights: 3, destinations: 2, ongoingTrips: 1, upcomingTrips: 1, invalidTrips: 4,
    topDestinations: [
      { name: '제주', trips: 1, nights: 2 },
      { name: '여행지 미지정', trips: 1, nights: 1 },
      { name: '도쿄', trips: 1, nights: 0 },
    ],
  });
  expect(JSON.stringify(trips)).toBe(before);
});

test('travel history ranks destinations by trip count, then nights, then name and retains archived local records', async () => {
  const archived = { id: 'archived-trip', title: '기록', destination: '제주', startDate: '2026-09-01', endDate: '2026-09-03', archivedAt: '2026-09-05', items: [] };
  const { api } = loadData({ savedTrips: [archived] });
  expect(api.getTrips()).toEqual([]);
  expect(api.getTrips({ includeArchived: true })).toHaveLength(1);
  await api.refresh();
  expect(api.getTrips()).toEqual([]);
  expect(api.getTrips({ includeArchived: true })).toHaveLength(1);

  const trips = [
    { id: 'a1', destination: '가', startDate: '2026-09-01', endDate: '2026-09-02' },
    { id: 'a2', destination: '가', startDate: '2026-09-01', endDate: '2026-09-02' },
    { id: 'b1', destination: '나', startDate: '2026-09-01', endDate: '2026-09-04' },
    { id: 'b2', destination: '나', startDate: '2026-09-01', endDate: '2026-09-04' },
    { id: 'c1', destination: '다', startDate: '2026-09-01', endDate: '2026-09-04' },
    { id: 'c2', destination: '다', startDate: '2026-09-01', endDate: '2026-09-04' },
    { id: 'd1', destination: '라', startDate: '2026-09-01', endDate: '2026-09-02' },
    { id: 'e1', destination: '마', startDate: '2026-09-01', endDate: '2026-09-02' },
    { id: 'f1', destination: '바', startDate: '2026-09-01', endDate: '2026-09-02' },
  ];
  const ranked = api.summarizeTrips(trips, new Date('2026-10-01T12:00:00Z')).topDestinations;
  expect(ranked).toHaveLength(5);
  expect(ranked).toEqual([
    { name: '나', trips: 2, nights: 6 }, { name: '다', trips: 2, nights: 6 }, { name: '가', trips: 2, nights: 2 },
    { name: '라', trips: 1, nights: 1 }, { name: '마', trips: 1, nights: 1 },
  ]);
  expect(api.summarizeTrips([], new Date('2026-10-01T12:00:00Z'))).toEqual({ pastTrips: 0, totalNights: 0, destinations: 0, ongoingTrips: 0, upcomingTrips: 0, invalidTrips: 0, topDestinations: [], historyDestinations: [] });
});

test('history map groups all past destinations, retains archived dates and uses only recorded locations', () => {
  const { api } = loadData();
  const base = { startDate:'2026-09-01', endDate:'2026-09-03', timezone:'Asia/Seoul' };
  const trips = [
    {...base,id:'j1',title:'첫 제주',destination:'제주',centerLat:null,centerLng:null,items:[{type:'place',dayIndex:0,place:{lat:33.4,lng:126.2}}]},
    {...base,id:'j2',title:'다시 제주',destination:' 제주 ',archivedAt:'2026-09-04',centerLat:33.5,centerLng:126.5},
    {...base,id:'j2',destination:'제주',centerLat:33.5,centerLng:126.5},
    {...base,id:'no',destination:'위치 없음',centerLat:'',centerLng:'',items:[{type:'place',dayIndex:null,place:{lat:37,lng:127}},{type:'note',dayIndex:0,place:{lat:37,lng:127}}]},
    {...base,id:'bad',destination:'잘못된 위치',centerLat:100,centerLng:127,items:[{type:'place',dayIndex:0,place:{lat:null,lng:null}}]},
    {...base,id:'future',destination:'예정',startDate:'2027-01-01',endDate:'2027-01-02',centerLat:35,centerLng:135},
    {...base,id:'invalid',destination:'날짜 오류',endDate:'2026-02-30',centerLat:35,centerLng:135},
    ...['도쿄','부산','서울','강릉'].map((destination,i)=>({...base,id:`extra-${i}`,destination,centerLat:35+i,centerLng:130})),
  ];
  const summary = api.summarizeTrips(trips,new Date('2026-10-03T00:00:00Z'));
  expect(summary.historyDestinations).toHaveLength(7);
  const jeju = summary.historyDestinations.find(item=>item.title==='제주');
  expect(jeju.visits).toBe(2);
  expect(jeju.place).toEqual({lat:33.4,lng:126.2});
  expect(jeju.records.map(record=>[record.id,record.title,record.startDate,record.endDate])).toEqual([
    ['j1','첫 제주','2026-09-01','2026-09-03'],['j2','다시 제주','2026-09-01','2026-09-03'],
  ]);
  expect(summary.historyDestinations.filter(item=>!item.place).map(item=>item.title).sort()).toEqual(['위치 없음','잘못된 위치']);
  const saved = loadData({savedTrips:[{...base,id:'null',destination:'위치 없음',centerLat:null,centerLng:null,items:[{id:'p',type:'place',dayIndex:0,place:{lat:null,lng:null}}]}]}).api.getTrips()[0];
  expect(saved.centerLat).toBeNull();
  expect(saved.items[0].place.lat).toBeNull();
});

test('travel summary is rendered above both the trip selector and empty state', () => {
  expect(travelSource).toContain('data.getTrips({ includeArchived: true })');
  expect(travelSource).toContain('종료일이 지난 일정 기준 · 박수는 시작일과 종료일의 차이');
  expect(dataSource).toContain('여행지 미지정');
  expect(travelSource).toContain('지난 여행 기록이 쌓이면 여행지가 여기에 표시돼요.');
  expect(travelSource).toMatch(/\$\{pageHeader\(\)\}\$\{historySummary\(\)\}<div class="travel-trip-switcher"/);
  expect(travelSource).toMatch(/\$\{pageHeader\(\)\}\$\{historySummary\(\)\}<section class="travel-empty-card"/);
  expect(travelCssSource).toContain('@media (max-width:420px)');
});

test('travel tab loads only archive modules and has no booking-search workspace', () => {
  expect(configSource).toContain("travel: ['travel-data', 'travel-map', 'travel']");
  expect(configSource).not.toContain("travel: ['travel-data', 'travel-providers', 'travel-map', 'travel']");
  expect(deferredSource).toContain("createTab('travel', '✈️ 여행')");
  expect(travelSource).toContain('FAMILY TRAVEL ARCHIVE');
  expect(travelSource).toContain("[['overview','여행 요약'],['route','장소·지도'],['stories','여행 이야기']]");
  expect(travelSource).toContain('방문한 장소 남기기');
  expect(travelSource).not.toContain('항공·숙소 찾기');
  expect(travelSource).not.toContain('예약처 열기');
  expect(travelSource).not.toMatch(/service_role|sk-[A-Za-z0-9]{20,}/i);
});

test('the dynamically-created travel tab remains navigable after its deferred load', () => {
  expect(deferredSource).toContain('if (!tab || !groups[tab.dataset.view] || loaded.has(tab.dataset.view)) return;');

  const handlerMatch = appSource.match(/\$\("\.view-tabs"\)\.addEventListener\("click", (\(event\) => \{[\s\S]*?\n  \})\);/);
  expect(handlerMatch).not.toBeNull();
  let delegatedClick;
  const navigations = [];
  const window = { FAMILY_TRAVEL_READY: false };
  const context = {
    window,
    switchView: view => navigations.push(view),
    $: selector => ({ addEventListener: (eventName, handler) => {
      expect(selector).toBe('.view-tabs');
      expect(eventName).toBe('click');
      delegatedClick = handler;
    } }),
  };
  vm.createContext(context);
  vm.runInContext(`$(".view-tabs").addEventListener("click", ${handlerMatch[1]});`, context);

  const travelTab = { dataset: { view: 'travel' } };
  const targetTab = tab => ({ closest: selector => selector === '.view-tab[data-view="travel"]' && tab.dataset.view === 'travel' ? tab : null });
  delegatedClick({ target: targetTab(travelTab) }); // Deferred load still pending.
  expect(navigations).toEqual([]);
  window.FAMILY_TRAVEL_READY = true;
  delegatedClick({ target: targetTab(travelTab) }); // First visit after load.
  delegatedClick({ target: targetTab(travelTab) }); // Exit, then re-enter.
  expect(navigations).toEqual(['travel', 'travel']);

  const otherTab = { dataset: { view: 'english' } };
  delegatedClick({ target: targetTab(otherTab) });
  expect(navigations).toEqual(['travel', 'travel']);
  const nestedTarget = { closest: selector => selector === '.view-tab[data-view="travel"]' ? travelTab : null };
  delegatedClick({ target: nestedTarget });
  expect(navigations).toEqual(['travel', 'travel', 'travel']);
});

test('travel modal uses the top layer, closes cleanly, and fits a mobile keyboard viewport', () => {
  const showLine = travelSource.split('\n').find(line => line.trimStart().startsWith('const showModal ='));
  const closeLine = travelSource.split('\n').find(line => line.trimStart().startsWith('const closeModal ='));
  expect(showLine).toBeTruthy();
  expect(closeLine).toBeTruthy();
  expect(travelSource).toContain('dialog class="travel-modal"');

  let showCount = 0;
  let closeCount = 0;
  let panelFocusCount = 0;
  const viewportListeners = new Map();
  const viewport = {
    height: 390, offsetTop: 0,
    addEventListener: (type, listener) => viewportListeners.set(type, listener),
    removeEventListener: type => viewportListeners.delete(type),
  };
  const styleValues = new Map();
  const panel = { focus: () => panelFocusCount++ };
  const title = { textContent: '' };
  const content = { innerHTML: '' };
  const modal = {
    hidden: true, open: false, dataset: {}, style: {
      setProperty: (name, value) => styleValues.set(name, value),
      removeProperty: name => styleValues.delete(name),
    },
    querySelector: selector => ({
      '#travelModalTitle': title,
      '#travelModalContent': content,
      '.travel-modal-panel': panel,
    })[selector],
    addEventListener: () => {},
    showModal() { this.open = true; showCount++; },
    close() { this.open = false; closeCount++; },
  };
  const current = { modalMode: 'trip', selectedPlace: { name: 'Naha' } };
  const context = { current, view: {}, window: { visualViewport: viewport }, $: selector => selector === '#travelModal' ? modal : null };
  vm.createContext(context);
  vm.runInContext(`let travelViewportListener = null;\nconst clearTravelViewport = node => { if(travelViewportListener){window.visualViewport.removeEventListener('resize',travelViewportListener);window.visualViewport.removeEventListener('scroll',travelViewportListener);} travelViewportListener=null; node.style.removeProperty('--travel-viewport-height'); node.style.removeProperty('--travel-viewport-top'); };\n${showLine}\n${closeLine}`, context);
  vm.runInContext('showModal("새 여행", "<form></form>")', context);
  expect(showCount).toBe(1);
  expect(panelFocusCount).toBe(1);
  expect(modal.hidden).toBe(false);
  expect(styleValues.get('--travel-viewport-height')).toBe('390px');
  expect(viewportListeners.has('resize')).toBe(true);
  viewport.height = 300;
  viewport.offsetTop = 20;
  viewportListeners.get('resize')();
  expect(styleValues.get('--travel-viewport-height')).toBe('300px');
  expect(styleValues.get('--travel-viewport-top')).toBe('20px');
  vm.runInContext('closeModal()', context);
  expect(closeCount).toBe(1);
  expect(modal.hidden).toBe(true);
  expect(viewportListeners.size).toBe(0);
  expect(styleValues.size).toBe(0);
  expect(current).toEqual({ modalMode: null, selectedPlace: null });
  vm.runInContext('showModal("새 여행", "<form></form>")', context);
  expect(showCount).toBe(2);
  expect(panelFocusCount).toBe(2);

  expect(travelCssSource).toContain('dialog.travel-modal:not([open])');
  expect(travelCssSource).toContain('calc(var(--travel-viewport-height, 100dvh) - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))');
  expect(travelSource).toContain("event.target.matches('.travel-modal-backdrop')");
});

test('trip destination can be a preset or a custom value without stale-field overrides', () => {
  const resolveLine = travelSource.split('\n').find(line => line.trimStart().startsWith('const resolveDestination ='));
  const reconcileLine = travelSource.split('\n').find(line => line.trimStart().startsWith('const reconcileDestinationInputs ='));
  const formLine = travelSource.split('\n').find(line => line.trimStart().startsWith('const tripForm ='));
  expect(resolveLine).toBeTruthy();
  expect(reconcileLine).toBeTruthy();
  expect(formLine).toBeTruthy();
  const context = { esc: value => String(value ?? ''), destinationGroups: [], destinationOptions: value => `<option>${value || ''}</option>` };
  vm.createContext(context);
  vm.runInContext(`${resolveLine}\n${reconcileLine}\n${formLine}`, context);

  expect(vm.runInContext('resolveDestination({destination:"제주", destinationCustom:""})', context)).toBe('제주');
  expect(vm.runInContext('resolveDestination({destination:"", destinationCustom:"영종도"})', context)).toBe('영종도');
  expect(vm.runInContext('resolveDestination({destination:"제주", destinationCustom:"  "})', context)).toBe('제주');
  expect(vm.runInContext('resolveDestination({destination:"  ", destinationCustom:"  "})', context)).toBe('');

  const fields = { destination: { value: '제주' }, destinationCustom: { value: '영종도' } };
  const form = { elements: fields };
  context.form = form;
  context.target = { closest: selector => selector === '#travelTripForm' ? form : null };
  context.target = fields.destinationCustom;
  // Emulate custom input after editing a preset: the old preset is cleared.
  context.target.closest = selector => selector === '#travelTripForm' ? form : null;
  vm.runInContext('reconcileDestinationInputs(target)', context);
  expect(fields.destination.value).toBe('');
  fields.destination.value = '제주';
  fields.destinationCustom.value = '영종도';
  context.target = fields.destination;
  context.target.closest = selector => selector === '#travelTripForm' ? form : null;
  vm.runInContext('reconcileDestinationInputs(target)', context);
  expect(fields.destinationCustom.value).toBe('');

  const editPreset = vm.runInContext('tripForm({destinationLabel:"제주", title:"제주 여행"})', context);
  const editCustom = vm.runInContext('tripForm({destinationLabel:"영종도", title:"영종도 여행"})', context);
  expect(editPreset).toContain('name="destination"');
  expect(editPreset).not.toContain('name="destination" required');
  expect(editCustom).toContain('name="destinationCustom"');
  expect(editCustom).toContain('value="영종도"');
});

test('day-scoped add defaults and external map route use the selected date or inbox', () => {
  const lines = travelSource.split('\n');
  const activeItems = travelSource.match(/  const activeItems = item => \{[\s\S]*?\n  \};/)?.[0];
  const functions = ['const itineraryOrder =', 'const defaultDayIndex =', 'const daySelect =', 'const routeUrl ='];
  const extracted = [activeItems, ...functions.map(prefix => lines.find(line => line.trimStart().startsWith(prefix)))];
  expect(extracted.every(Boolean)).toBe(true);
  const context = {
    current: { tab: 'day-1' },
    days: () => ['2026-10-01', '2026-10-02'],
    dayLabel: (_trip, index) => `DAY ${index + 1}`,
    fmtDate: value => value,
    esc: value => String(value ?? ''),
  };
  vm.createContext(context);
  vm.runInContext(extracted.join('\n'), context);
  expect(vm.runInContext('defaultDayIndex()', context)).toBe(1);
  context.twoDayTrip = { startDate: '2026-10-01', endDate: '2026-10-02' };
  expect(vm.runInContext('daySelect(twoDayTrip, 1)', context)).toContain('<option value="1" selected>DAY 2');
  const inboxForm = vm.runInContext('daySelect(twoDayTrip, null)', context);
  expect(inboxForm).toContain('<option value="" selected>보관함');
  expect(inboxForm).not.toContain('required');
  const trip = { startDate: '2026-10-01', endDate: '2026-10-02', items: [
    { id: 'a', type: 'place', title: 'A', dayIndex: 0, order: 1, place: { address: '주소 A' } },
    { id: 'b', type: 'place', title: 'B', dayIndex: 1, order: 1, place: { address: '주소 B' } },
    { id: 'inbox', type: 'place', title: '미정', dayIndex: null, order: 1, place: { address: '주소 미정' } },
  ] };
  context.trip = trip;
  expect(vm.runInContext('routeUrl(trip)', context)).toBe('https://www.google.com/maps/search/?api=1&query=%EC%A3%BC%EC%86%8C%20B');
  context.current.tab = 'inbox';
  expect(vm.runInContext('routeUrl(trip)', context)).toBe('https://www.google.com/maps/search/?api=1&query=%EC%A3%BC%EC%86%8C%20%EB%AF%B8%EC%A0%95');
  context.current.tab = 'all';
  const allUrl = vm.runInContext('decodeURIComponent(routeUrl(trip))', context);
  expect(allUrl).toContain('주소 A');
  expect(allUrl).toContain('주소 미정');
});

test('planner capture controls preserve day context, details clicks, and null inbox moves', async () => {
  const handler = travelSource.match(/  const handlePlannerControls = async event => \{[\s\S]*?\n  \};/)?.[0];
  expect(handler).toBeTruthy();
  const current = { tab: 'all', modalMode: null };
  const trip = { id: 'trip-1' };
  const calls = { render: 0, move: [], show: [] };
  const context = {
    current,
    trip: () => trip,
    defaultDayIndex: () => null,
    placeForm: (_trip, day) => `place-day:${day}`,
    noteForm: (_trip, day) => `note-day:${day}`,
    showModal: (...args) => calls.show.push(args),
    render: () => calls.render++,
    data: { moveItem: async (...args) => calls.move.push(args) },
    Number,
  };
  vm.createContext(context);
  vm.runInContext(handler, context);
  const makeEvent = (target, { inMore = false, innerButton = false } = {}) => ({
    target: {
      closest: selector => selector === 'button,summary' ? target
        : selector === '.travel-item-more' ? (inMore ? target.details : null)
        : selector === '.travel-item-more button,.travel-item-more summary' ? (innerButton ? target : null)
        : selector === '[data-travel-add-place],[data-travel-add-note]' ? (target.add ? target : null)
        : null,
    },
    preventDefault() {}, stopImmediatePropagation() { this.stopped = true; }, stopped: false,
  });
  const add = { add: true, dataset: { travelDayIndex: '2' }, hasAttribute: name => name === 'data-travel-day-index', matches: selector => selector === '[data-travel-add-place]', closest: selector => selector === '[data-travel-add-place],[data-travel-add-note]' ? add : null };
  await vm.runInContext('handlePlannerControls(event)', Object.assign(context, { event: makeEvent(add) }));
  expect(calls.show).toEqual([['장소 추가', 'place-day:2']]);

  let selectRenderCount = calls.render;
  const details = { querySelector: () => ({ value: '' }) };
  const summary = { matches: selector => selector === '.travel-item-more summary', details };
  const summaryEvent = makeEvent(summary, { inMore: true });
  await vm.runInContext('handlePlannerControls(event)', Object.assign(context, { event: summaryEvent }));
  expect(summaryEvent.stopped).toBe(true);
  const selectTarget = { matches: () => false, closest: undefined };
  const selectEvent = { ...makeEvent(selectTarget, { inMore: true }), target: { closest: selector => selector === '.travel-item-more' ? details : selector === '.travel-item-more button,.travel-item-more summary' ? null : null } };
  await vm.runInContext('handlePlannerControls(event)', Object.assign(context, { event: selectEvent }));
  expect(selectEvent.stopped).toBe(true);
  expect(calls.render).toBe(selectRenderCount);

  const move = { dataset: { travelMove: 'entry-1' }, matches: selector => selector === '[data-travel-move]', closest: selector => selector === '.travel-item-more' ? details : null };
  await vm.runInContext('handlePlannerControls(event)', Object.assign(context, { event: makeEvent(move, { inMore: true, innerButton: true }) }));
  expect(calls.move).toEqual([['trip-1', 'entry-1', null]]);
});
