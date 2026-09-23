import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const dataSource = readFileSync('travel-data.js', 'utf8');
const travelSource = readFileSync('travel.js', 'utf8');
const configSource = readFileSync('config.js', 'utf8');
const deferredSource = readFileSync('deferred-tabs.js', 'utf8');
const appSource = readFileSync('app.js', 'utf8');
const travelCssSource = readFileSync('travel.css', 'utf8');

function loadData() {
  const store = new Map();
  const window = {
    FAMILY_DEMO_MODE: false,
    FAMILY_APP_STATE: { household: { id: 'household-a' } },
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    addEventListener: () => {}, dispatchEvent: () => {},
  };
  window.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const context = { window, localStorage: window.localStorage, CustomEvent: window.CustomEvent, crypto: { randomUUID: () => 'id-1' } };
  vm.createContext(context); vm.runInContext(dataSource, context);
  return { api: window.FAMILY_TRAVEL_DATA, store };
}

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

test('map preview ignores invalid points and retains the original itinerary number', () => {
  const window = {};
  vm.runInNewContext(readFileSync('travel-map.js', 'utf8'), { window });
  const items = [{ id: 'missing', latitude: null, longitude: null }, { id: 'valid', title: '장소', latitude: 26, longitude: 127 }];
  expect(window.FAMILY_TRAVEL_MAP.placePoints(items).map(item => item.id)).toEqual(['valid']);
  expect(window.FAMILY_TRAVEL_MAP.render({ items })).toContain('<b>2</b>');
});
