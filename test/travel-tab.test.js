import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const dataSource = readFileSync('travel-data.js', 'utf8');
const providerSource = readFileSync('travel-providers.js', 'utf8');
const travelSource = readFileSync('travel.js', 'utf8');
const configSource = readFileSync('config.js', 'utf8');
const deferredSource = readFileSync('deferred-tabs.js', 'utf8');

function loadData({ demo = true, householdId = null } = {}) {
  const store = new Map();
  const window = {
    FAMILY_DEMO_MODE: demo,
    FAMILY_DEMO: { storageKey: key => `demo:${key}` },
    FAMILY_APP_STATE: { household: householdId ? { id: householdId } : null },
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    addEventListener: () => {},
    dispatchEvent: () => {},
  };
  window.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const context = { window, localStorage: window.localStorage, CustomEvent: window.CustomEvent, crypto: { randomUUID: (() => { let index = 0; return () => `id-${++index}`; })() } };
  vm.createContext(context);
  vm.runInContext(dataSource, context);
  return { api: window.FAMILY_TRAVEL_DATA, store, window };
}

test('travel data keeps family context local and models child/room counts', () => {
  const { api, store } = loadData({ demo: false, householdId: 'household-a' });
  const trip = api.createTrip({ title: '제주 가족 여행', origin: '김포', destination: '제주', startDate: '2026-10-01', endDate: '2026-10-03', adults: 2, children: 1, infants: 1, rooms: 2, travelers: [{ type: 'adult' }, { type: 'adult' }, { type: 'child' }, { type: 'infant' }] });
  expect(trip.children).toBe(1);
  expect(trip.infants).toBe(1);
  expect(trip.rooms).toBe(2);
  expect([...store.keys()]).toEqual(['family-travel-v1:household-a']);
});

test('travel candidates are capped at three per kind and can be dismissed before another is saved', () => {
  const { api } = loadData({ demo: false, householdId: 'household-a' });
  const trip = api.createTrip({ title: '후보 비교', destination: '도쿄', startDate: '2026-11-01', endDate: '2026-11-04' });
  for (let index = 0; index < 3; index += 1) api.addCandidate(trip.id, { kind: 'flight', title: `항공 ${index + 1}` });
  expect(() => api.addCandidate(trip.id, { kind: 'flight', title: '네 번째 항공' })).toThrow('최대 3개');
  const latest = api.getTrip(trip.id).candidates.at(-1);
  api.updateCandidate(trip.id, latest.id, { status: 'dismissed' });
  expect(() => api.addCandidate(trip.id, { kind: 'flight', title: '새 항공' })).not.toThrow();
});

test('provider links reject non-web schemes and keep booking actions external', () => {
  const window = {};
  const context = { window, URL, encodeURIComponent };
  vm.createContext(context);
  vm.runInContext(providerSource, context);
  expect(window.FAMILY_TRAVEL_PROVIDERS.providerCatalog.flight.map(item => item.id)).toEqual(expect.arrayContaining(['google-flights', 'skyscanner', 'kayak']));
  expect(window.FAMILY_TRAVEL_PROVIDERS.providerCatalog.stay.map(item => item.id)).toEqual(expect.arrayContaining(['hotelscombined', 'google-hotels', 'booking', 'agoda']));
  expect(window.FAMILY_TRAVEL_PROVIDERS.safeExternalUrl('javascript:alert(1)')).toBe('');
  expect(window.FAMILY_TRAVEL_PROVIDERS.safeExternalUrl('https://example.com/booking')).toBe('https://example.com/booking');
  expect(window.FAMILY_TRAVEL_PROVIDERS.searchUrl({ kind: 'stay', provider: 'hotel', destination: '제주', startDate: '2026-10-01', endDate: '2026-10-03', children: 1, infants: 1, rooms: 2 })).toContain('%EC%A0%9C%EC%A3%BC');
});

test('travel is registered as a deferred tab and keeps the five-section workspace contract', () => {
  expect(configSource).toContain("travel: ['travel-data', 'travel-providers', 'travel-map', 'travel']");
  expect(deferredSource).toContain("createTab('travel', '✈️ 여행')");
  expect(travelSource).toContain("['summary','요약']");
  expect(travelSource).toContain("['bookings','예약']");
  expect(travelSource).toContain("['itinerary','일정·지도']");
  expect(travelSource).toContain("['prepare','준비']");
  expect(travelSource).toContain("['memories','기록']");
  expect(travelSource).not.toMatch(/service_role|sk-[A-Za-z0-9]{20,}/i);
});

test('failed storage writes do not pretend the trip was saved', () => {
  const { api, window } = loadData({ demo: false });
  window.localStorage.setItem = () => { throw new Error('quota'); };
  expect(() => api.createTrip({ title: '제주', destination: '제주', startDate: '2026-10-01', endDate: '2026-10-03' })).toThrow('저장');
  expect(api.getTrips()).toEqual([]);
});

test('invalid dates and shortening a trip across existing items preserve the trip', () => {
  const { api } = loadData({ demo: false });
  expect(() => api.createTrip({ title: '제주', destination: '제주', startDate: '2026-02-30', endDate: '2026-03-05' })).toThrow();
  const trip = api.createTrip({ title: '제주', destination: '제주', startDate: '2026-10-01', endDate: '2026-10-03' });
  api.addItem(trip.id, { title: '마지막 날', localDate: '2026-10-03' });
  expect(() => api.updateTrip(trip.id, { endDate: '2026-10-02' })).toThrow('기간 밖');
  expect(api.getTrip(trip.id).endDate).toBe('2026-10-03');
});

test('registering the same candidate twice creates one booking', () => {
  const { api } = loadData();
  const trip = api.getTrips()[0];
  api.addBooking(trip.id, { candidateId: 'demo-flight', title: '항공' });
  api.addBooking(trip.id, { candidateId: 'demo-flight', title: '항공' });
  expect(api.getTrip(trip.id).bookings).toHaveLength(1);
});

test('route preview rejects missing and invalid coordinates while keeping itinerary numbering', () => {
  const window = {};
  vm.runInNewContext(readFileSync('travel-map.js', 'utf8'), { window });
  const items = [
    { id: 'missing', latitude: null, longitude: null },
    { id: 'blank', latitude: '', longitude: '' },
    { id: 'invalid', latitude: 100, longitude: 190 },
    { id: 'valid', title: '장소', latitude: 26, longitude: 127 },
  ];
  expect(window.FAMILY_TRAVEL_MAP.placePoints(items).map(item => item.id)).toEqual(['valid']);
  expect(window.FAMILY_TRAVEL_MAP.render({ items })).toContain('<b>4</b>');
});

test('destination-only recommendations contain no invented prices and carry their destination into search', () => {
  const window = {};
  vm.runInNewContext(providerSource, { window, URL, encodeURIComponent });
  const api = window.FAMILY_TRAVEL_PROVIDERS;
  const offers = api.recommend({ destination: '오키나와' });
  expect(offers.some(item => item.kind === 'flight')).toBe(true);
  expect(offers.filter(item => item.kind === 'stay')).toHaveLength(2);
  expect(offers.every(item => item.amountMinor === null)).toBe(true);
  expect(offers.some(item => item.title.includes('하얏트'))).toBe(true);
  expect(api.recommend({ destination: '' })).toEqual([]);
  expect(decodeURIComponent(api.searchUrl({kind:'flight',provider:'skyscanner',origin:'부산',destination:'도쿄'}))).toContain('부산 도쿄');
  expect(api.recommend({ destination:'오키나와', origin:'부산' }).some(item => item.id === 'flight-korean-okinawa')).toBe(false);
});

test('chosen recommendations transfer into a new trip in one save', () => {
  const { api } = loadData({ demo: false });
  const trip = api.createTrip({ title:'첫 여행', destination:'오키나와', startDate:'2026-12-01', endDate:'2026-12-04', candidates:[{id:'picked',kind:'stay',title:'숙소',source:'recommendation',searchRevision:1}] });
  expect(api.getTrip(trip.id).candidates[0].id).toBe('picked');
});
