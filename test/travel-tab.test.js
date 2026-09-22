import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const dataSource = readFileSync('travel-data.js', 'utf8');
const travelSource = readFileSync('travel.js', 'utf8');
const configSource = readFileSync('config.js', 'utf8');
const deferredSource = readFileSync('deferred-tabs.js', 'utf8');

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

test('map preview ignores invalid points and retains the original itinerary number', () => {
  const window = {};
  vm.runInNewContext(readFileSync('travel-map.js', 'utf8'), { window });
  const items = [{ id: 'missing', latitude: null, longitude: null }, { id: 'valid', title: '장소', latitude: 26, longitude: 127 }];
  expect(window.FAMILY_TRAVEL_MAP.placePoints(items).map(item => item.id)).toEqual(['valid']);
  expect(window.FAMILY_TRAVEL_MAP.render({ items })).toContain('<b>2</b>');
});
