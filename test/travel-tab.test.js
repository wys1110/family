import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const dataSource = readFileSync('travel-data.js', 'utf8');
const travelSource = readFileSync('travel.js', 'utf8');
const managementSource = readFileSync('travel-management.js', 'utf8');
const configSource = readFileSync('config.js', 'utf8');
const deferredSource = readFileSync('deferred-tabs.js', 'utf8');
const appSource = readFileSync('app.js', 'utf8');
const travelCssSource = readFileSync('travel.css', 'utf8');

function loadData({ demoMode = false, savedTrips, shared = false, supabase, uuid = () => 'id-1' } = {}) {
  const store = new Map();
  const key = 'family-travel-v1:household-a';
  if (savedTrips !== undefined) store.set(key, JSON.stringify(savedTrips));
  const window = {
    FAMILY_DEMO_MODE: demoMode,
    FAMILY_APP_STATE: { household: { id: 'household-a' }, session: supabase ? { user: { id: 'user-a' } } : undefined, supabase },
    FAMILY_TRAVEL_SHARING: shared ? { enabled: () => true, load: async () => [] } : undefined,
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    addEventListener: () => {}, dispatchEvent: () => {},
  };
  window.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const context = { window, localStorage: window.localStorage, CustomEvent: window.CustomEvent, crypto: { randomUUID: uuid } };
  vm.createContext(context); vm.runInContext(dataSource, context);
  return { api: window.FAMILY_TRAVEL_DATA, store, context };
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

test.each([
  ['America/New_York', '2024-03-09', '2025-03-09', '2025-03-10'],
  ['Pacific/Kiritimati', '2026-12-31', '2027-12-31', '2028-01-01'],
])('calendar date helpers stay aligned in %s', async (timezone, startDate, endDate, overLimitEndDate) => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = timezone;
  try {
    let nextId = 0;
    const { api } = loadData({ uuid: () => `id-${++nextId}` });
    const created = await api.createTrip({ title: '달력 경계 여행', destinationLabel: '제주', startDate, endDate });
    await expect(api.createTrip({ title: '너무 긴 여행', destinationLabel: '제주', startDate, endDate: overLimitEndDate })).rejects.toThrow('최대 366일');
    await expect(api.createTrip({ title: '잘못된 날짜', destinationLabel: '제주', startDate: '2026-02-30', endDate: '2026-02-30' })).rejects.toThrow('날짜를 확인');
    const dataDates = api.dateList(startDate, endDate);
    expect(dataDates).toHaveLength(366);
    expect(dataDates[0]).toBe(startDate);
    expect(dataDates.at(-1)).toBe(endDate);

    const daysDeclaration = travelSource.match(/const days = trip => [^;]+;/)?.[0];
    expect(daysDeclaration).toBe('const days = trip => data.dateList(trip.startDate, trip.endDate);');
    const uiContext = { data: api, trip: created };
    vm.createContext(uiContext);
    vm.runInContext(`${daysDeclaration}\nglobalThis.uiDates = days(trip);`, uiContext);
    expect(Array.from(uiContext.uiDates)).toEqual(dataDates);

    await api.addNote(created.id, { title: '마지막 날짜', dayIndex: 365 });
    expect(api.getTrip(created.id).items[0].localDate).toBe(endDate);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('place search sends an empty-query status request to the connected provider', async () => {
  const calls = [];
  const supabase = { functions: { invoke: async (...args) => { calls.push(args); return { data: { status: 'ok' }, error: null }; } } };
  const { api } = loadData({ supabase });

  expect(await api.searchPlaces('', { action: 'status' })).toEqual({ status: 'ok' });
  expect(calls).toEqual([['travel-place-search', {
    body: { action: 'status', query: '', limit: 10 },
    headers: { 'x-family-household': 'household-a' },
  }]]);
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

test('travel tab loads its report and record modules without mounting a map or booking-search workspace', () => {
  expect(configSource).toMatch(/travel:\s*\[\s*['"]travel-data['"],\s*['"]travel-management['"],\s*['"]travel['"]\s*\]/);
  expect(configSource).not.toMatch(/name:\s*['"]travel-map['"]/);
  expect(deferredSource).toContain("createTab('travel', '✈️ 여행')");
  expect(travelSource).not.toMatch(/FAMILY_TRAVEL_MAP|travel-history-map|map\.kakao\.com|data-travel-page="summary"/);
  expect(travelSource).toContain('data-travel-add-place');
  expect(travelSource).not.toContain('항공·숙소 찾기');
  expect(travelSource).not.toContain('예약처 열기');
  expect(travelSource).not.toMatch(/service_role|sk-[A-Za-z0-9]{20,}/i);
});

test('travel report prose keeps Korean words together and wraps long text', () => {
  expect(travelCssSource).toMatch(/\.travel-plan-intro, \.travel-report-copy[^{]*\{[^}]*word-break:\s*keep-all;[^}]*overflow-wrap:\s*anywhere;/s);
  expect(configSource).toMatch(/name: "travel", version: "(?!20261018-travel-summary-v1|20261117-travel-report-v1)[^"]+"/);
});

function loadReport(savedTrips) {
  const { api, context, store } = loadData({ savedTrips });
  const windowListeners = {};
  const viewListeners = {};
  const addListener = (table, type, callback) => (table[type] ??= []).push(callback);
  const modalTitle = { textContent: '' };
  const modalContent = { innerHTML: '' };
  const modal = {
    dataset: {}, hidden: true, open: false,
    style: { removeProperty() {}, setProperty() {} },
    querySelector(selector) {
      return { '#travelModalTitle': modalTitle, '#travelModalContent': modalContent }[selector] ?? null;
    },
    addEventListener() {},
    setAttribute() { this.hidden = true; },
    showModal() { this.open = true; },
    close() { this.open = false; },
  };
  let cards = [];
  const view = {
    dataset: {}, markup: '',
    get innerHTML() { return this.markup; },
    set innerHTML(markup) {
      this.markup = markup;
      cards = [...markup.matchAll(/<details[^>]*data-travel-report-section="([^"]+)" data-trip-id="([^"]+)"/g)]
        .map(([, travelReportSection, tripId]) => ({ open: false, dataset: { travelReportSection, tripId } }));
    },
    addEventListener(type, callback) { addListener(viewListeners, type, callback); },
    querySelector: selector => selector === '#travelModal' ? modal : null,
    querySelectorAll: selector => selector.endsWith('[open]') ? cards.filter(card => card.open) : cards,
  };
  Object.assign(context.window, {
    addEventListener: (type, callback) => addListener(windowListeners, type, callback),
    dispatchEvent: event => windowListeners[event.type]?.forEach(callback => callback(event)),
    alert: message => { throw new Error(message); },
  });
  context.window.FAMILY_APP_STATE.activeView = 'travel';
  Object.assign(context, {
    document: { querySelector: selector => selector === '#travelView' ? view : null, addEventListener() {} },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : ['2026-11-17T03:00:00Z'])); }
    },
    URL, HTMLFormElement: class {},
    FormData: class {
      constructor(form) { this.values = form.values; }
      entries() { return Object.entries(this.values); }
    },
  });
  vm.runInContext(managementSource, context);
  vm.runInContext(travelSource, context);

  const click = async (attribute, dataset = {}) => {
    const target = {
      dataset,
      matches: selector => selector === `[${attribute}]`,
      closest: selector => selector.split(',').includes('button') ? target : null,
    };
    for (const listener of viewListeners.click) await listener({ target });
  };
  const submitReport = async (note, dataset) => {
    const button = { disabled: false };
    const error = { hidden: true };
    const target = Object.assign(new context.HTMLFormElement(), {
      id: 'travelReportForm', dataset, values: { note },
      querySelector: selector => selector === '.travel-trip-error' ? error : button,
    });
    await viewListeners.submit[0]({ target, preventDefault() {} });
    return error;
  };
  return { api, store, view, modal, modalContent, modalTitle, click, submitReport, cards: () => cards };
}

const reportTrip = {
  id: 'sample-trip', title: '겨울 가족 여행', destinationLabel: '강릉',
  startDate: '2026-12-02', endDate: '2026-12-06', intro: '쉬는 시간도 일정에 넣어요.', items: [],
};

test('family plan shows the ongoing trip first and otherwise the soonest unarchived trip', async () => {
  const ongoing = { ...reportTrip, id: 'ongoing', title: '진행 중인 가족 여행', startDate: '2026-11-16', endDate: '2026-11-18' };
  const later = { ...reportTrip, id: 'later', title: '다음 해 여행', startDate: '2027-01-01', endDate: '2027-01-03' };
  const archived = { ...reportTrip, id: 'archived', archivedAt: '2026-10-01', startDate: '2026-11-19', endDate: '2026-11-19' };
  const past = { ...reportTrip, id: 'past', startDate: '2026-10-03', endDate: '2026-10-05' };
  expect(loadReport([later, archived, reportTrip, ongoing]).view.innerHTML).toContain('id="travelPlanTitle">진행 중인 가족 여행');

  const app = loadReport([later, archived, past, reportTrip]);
  expect(app.view.innerHTML).toContain('data-travel-page="plan" aria-pressed="true"');
  expect(app.view.innerHTML).toContain('준비 보고서');
  expect(app.view.innerHTML).toContain('id="travelPlanTitle">겨울 가족 여행');
  expect(app.view.innerHTML).toContain('4박 5일');
  expect(app.view.innerHTML).toContain('쉬는 시간도 일정에 넣어요.');
  expect(app.view.innerHTML).toContain('이 기기에 저장됨');
  expect(app.view.innerHTML).toContain('data-travel-open-itinerary="sample-trip"');
  for (const section of ['예상 예산', '예약 전에 정할 일', '항공·숙소·교통 비교', '날짜별 일정안']) {
    expect(app.view.innerHTML).toContain(section);
  }
  expect([...app.view.innerHTML.matchAll(/data-travel-report-section="([^"]+)"/g)].map(match => match[1])).toEqual(['flight', 'stay', 'transport', 'parking']);

  await app.click('data-travel-page', { travelPage: 'manage' });
  expect(app.view.innerHTML).toContain('data-travel-open="later"');
  expect(app.view.innerHTML).toContain('data-travel-filter="past"');
  expect(app.view.innerHTML).toContain('data-travel-filter="archived"');
  await app.click('data-travel-open', { travelOpen: 'later' });
  expect(app.view.innerHTML).toContain('id="travelPlanTitle">다음 해 여행');
  expect(app.view.innerHTML).not.toContain('data-travel-tab="day-0"');
  await app.click('data-travel-open-itinerary', { travelOpenItinerary: 'later' });
  expect(app.view.innerHTML).toContain('data-travel-show-plan');
  expect(app.view.innerHTML).toContain('data-travel-tab="day-0"');
  await app.click('data-travel-show-plan');
  expect(app.view.innerHTML).toContain('id="travelPlanTitle">다음 해 여행');
});

test('report reuses only undated notes with no clock time and matching report titles', async () => {
  const items = [
    { id: 'old', kind: 'note', title: '항공편', note: '이전 항공편 메모\n상세 항공편 비교' },
    { id: 'extra', kind: 'note', title: '항공편', note: '두 번째 항공편 메모' },
    { id: 'dated', kind: 'note', title: '항공편', date: reportTrip.startDate, note: '날짜가 있는 메모' },
    { id: 'timed', kind: 'note', title: '항공편', startTime: '15:00', note: '시간이 있는 메모' },
    { id: 'other', kind: 'note', title: '항공편 확인', note: '다른 제목의 메모' },
    { id: 'place', type: 'place', title: '항공편', place: { name: '공항' }, note: '장소 메모' },
  ];
  const app = loadReport([{ ...reportTrip, items }]);
  const flight = app.view.innerHTML.match(/<details[^>]*data-travel-report-section="flight"[\s\S]*?<\/details>/)?.[0];
  expect(flight).toContain('class="travel-report-highlight">이전 항공편 메모</span>');
  expect(flight).toContain('class="travel-report-copy">상세 항공편 비교</p>');
  expect(flight).toContain('두 번째 항공편 메모');
  expect(flight).toContain('data-item-id="old"');
  expect(flight).toContain('data-item-id="extra"');
  for (const item of items.slice(2)) expect(flight).not.toContain(item.note);

  await app.click('data-travel-open-itinerary', { travelOpenItinerary: reportTrip.id });
  expect(app.view.innerHTML).toContain('data-travel-item="dated"');
  expect(app.view.innerHTML).toContain('data-travel-item="timed"');
  expect(app.view.innerHTML).toContain('data-travel-item="place"');
});

test('report escapes text and makes only credential-free HTTPS URLs clickable', () => {
  const intro = '<img src=x onerror=alert(1)>';
  const note = [
    '<script>alert(1)</script>',
    '<b>예약처</b> | https://example.test/book?start=1&end=2',
    'javascript:alert(1)',
    'http://example.test/insecure',
    'https://user:password@example.test/credentials',
  ].join('\n');
  const { view } = loadReport([{ ...reportTrip, title: '<여행>', intro, items: [{ id: 'flight', type: 'note', title: '항공편', note }] }]);
  expect(view.innerHTML).toContain('&lt;여행&gt;');
  expect(view.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(view.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(view.innerHTML).not.toMatch(/<(?:img|script|b)\b/);
  expect(view.innerHTML.match(/<a\b/g)).toHaveLength(1);
  expect(view.innerHTML).toContain('href="https://example.test/book?start=1&amp;end=2" target="_blank" rel="noopener noreferrer">&lt;b&gt;예약처&lt;/b&gt;</a>');
  for (const link of note.split('\n').slice(2)) expect(view.innerHTML).toContain(link);
});

test('report presents the family budget separately from parking and displays decision and schedule lists', async () => {
  const app = loadReport([{ ...reportTrip, items: [
    { id: 'budget', type: 'note', title: '예상 예산', note: '가족 예상 합계 120만 원\n현지 이동 별도' },
    { id: 'decisions', type: 'note', title: '예약 전에 정할 일', note: '항공편 고르기\n<유아 옵션> 확인' },
    { id: 'parking', type: 'note', title: '발렛·주차', note: '공항 주차 약 4만 원' },
    { id: 'schedule', type: 'note', title: '날짜별 일정안', note: '1일차 도착\n2일차 시내 산책' },
  ] }]);
  const html = app.view.innerHTML;
  expect(html).toContain('<strong>가족 예상 합계 120만 원</strong>');
  expect(html).toContain('현지 이동 별도</p>');
  expect(html).toMatch(/data-travel-report-section="parking"[\s\S]*?공항 주차 약 4만 원/);
  expect(html).toContain('<ol class="travel-report-list"><li>항공편 고르기</li><li>&lt;유아 옵션&gt; 확인</li></ol>');
  expect(html).toContain('<ul class="travel-report-list"><li>1일차 도착</li><li>2일차 시내 산책</li></ul>');

  await app.click('data-travel-report-edit', { tripId: reportTrip.id, travelReportEdit: 'budget', itemId: 'budget' });
  expect(app.modalTitle.textContent).toBe('예상 예산');
  await app.submitReport('가족 예상 합계 125만 원\n현지 이동 별도', { tripId: reportTrip.id, section: 'budget', itemId: 'budget' });
  expect(app.view.innerHTML).toContain('<strong>가족 예상 합계 125만 원</strong>');
  expect(app.api.getTrip(reportTrip.id).items.find(item => item.id === 'parking').note).toBe('공항 주차 약 4만 원');
});

test('report adds an unscheduled note, edits it in place and rejects empty saves', async () => {
  const scheduled = { id: 'scheduled', type: 'note', title: '항공편', dayIndex: 0, note: '일정으로 남긴 항공편' };
  const app = loadReport([{ ...reportTrip, items: [scheduled] }]);
  const originalItems = app.api.getTrip(reportTrip.id).items;
  const dataset = { tripId: reportTrip.id, section: 'flight', itemId: '' };
  expect(app.cards().every(card => !card.open)).toBe(true);
  app.cards()[0].open = true;
  await app.click('data-travel-report-edit', { tripId: reportTrip.id, travelReportEdit: 'flight', itemId: '' });
  expect(app.modal.open).toBe(true);
  expect(app.modalTitle.textContent).toBe('항공편');
  expect(app.modalContent.innerHTML).toContain('id="travelReportForm"');
  const error = await app.submitReport('  ', dataset);
  expect(error).toMatchObject({ hidden: false, textContent: '내용을 적어 주세요.' });
  expect(app.api.getTrip(reportTrip.id).items).toEqual(originalItems);

  await app.submitReport('  첫 항공편 비교  ', dataset);
  const [, entry] = app.api.getTrip(reportTrip.id).items;
  expect(entry).toMatchObject({ type: 'note', title: '항공편', dayIndex: null, time: null, note: '첫 항공편 비교' });
  expect(app.modal.open).toBe(false);
  expect(app.view.innerHTML).toContain('첫 항공편 비교');
  expect(app.cards().filter(card => card.open).map(card => card.dataset.travelReportSection)).toEqual(['flight']);

  await app.click('data-travel-report-edit', { tripId: reportTrip.id, travelReportEdit: 'flight', itemId: entry.id });
  expect(app.modalContent.innerHTML).toContain('첫 항공편 비교</textarea>');
  await app.submitReport('최신 항공편 비교', { ...dataset, itemId: entry.id });
  const savedTrips = JSON.parse(app.store.get('family-travel-v1:household-a'));
  const reopened = loadReport(savedTrips);
  expect(reopened.api.getTrip(reportTrip.id).items).toEqual([...originalItems, { ...entry, note: '최신 항공편 비교' }]);
  expect(reopened.view.innerHTML).toContain('최신 항공편 비교');
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
  const current = { modalMode: 'trip', searchRequest: 0 };
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
  expect(current.searchRequest).toBe(1);
  expect(closeCount).toBe(1);
  expect(modal.hidden).toBe(true);
  expect(viewportListeners.size).toBe(0);
  expect(styleValues.size).toBe(0);
  expect(current).toEqual({ modalMode: null, searchRequest: 1 });
  vm.runInContext('showModal("새 여행", "<form></form>")', context);
  expect(showCount).toBe(2);
  expect(panelFocusCount).toBe(2);

  expect(travelCssSource).toContain('dialog.travel-modal:not([open])');
  expect(travelCssSource).toContain('calc(var(--travel-viewport-height, 100dvh) - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))');
  expect(travelSource).toContain("event.target.matches('.travel-modal-backdrop')");
});

test('trip destination requires a preset or custom choice and preserves unknown edit values safely', () => {
  const sourceLines = travelSource.split('\n');
  const helperNames = ['destinationGroups', 'destinationOptions', 'resolveDestination', 'reconcileDestinationInputs'];
  const helperLines = helperNames.map(name => sourceLines.find(line => line.trimStart().startsWith(`const ${name} =`)));
  const formBlock = travelSource.match(/  const tripForm = item => \{[\s\S]*?\n  \};/)?.[0];
  expect(helperLines.every(Boolean)).toBe(true);
  expect(formBlock).toBeTruthy();
  const destinationHelpers = [...helperLines, formBlock].join('\n');
  const context = { esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') };
  vm.createContext(context);
  vm.runInContext(destinationHelpers, context);

  expect(vm.runInContext('resolveDestination({destination:"제주", destinationCustom:"영종도"})', context)).toBe('제주');
  expect(vm.runInContext('resolveDestination({destination:"__custom", destinationCustom:" 영종도 "})', context)).toBe('영종도');
  expect(vm.runInContext('resolveDestination({destination:"__custom", destinationCustom:"  "})', context)).toBe('');
  expect(vm.runInContext('resolveDestination({destination:"", destinationCustom:"영종도"})', context)).toBe('');

  const fields = {
    destination: { value: '__custom' },
    destinationCustom: { value: '영종도', disabled: false, required: true, parentElement: { hidden: false } },
  };
  const form = { elements: fields };
  for (const name of Object.keys(fields)) fields[name].closest = selector => selector === '#travelTripForm' ? form : null;
  context.target = fields.destination;
  vm.runInContext('reconcileDestinationInputs(target)', context);
  expect(fields.destinationCustom).toMatchObject({ disabled: false, required: true, parentElement: { hidden: false }, value: '영종도' });
  fields.destination.value = '제주';
  context.target = fields.destination;
  vm.runInContext('reconcileDestinationInputs(target)', context);
  expect(fields.destinationCustom).toMatchObject({ disabled: true, required: false, parentElement: { hidden: true }, value: '영종도' });
  fields.destination.value = '__custom';
  context.target = fields.destination;
  vm.runInContext('reconcileDestinationInputs(target)', context);
  expect(fields.destinationCustom).toMatchObject({ disabled: false, required: true, parentElement: { hidden: false }, value: '영종도' });
  context.target = fields.destinationCustom;
  vm.runInContext('reconcileDestinationInputs(target)', context);
  expect(fields.destination.value).toBe('__custom');

  const createForm = vm.runInContext('tripForm()', context);
  const editPreset = vm.runInContext('tripForm({destinationLabel:"제주", title:"제주 여행"})', context);
  const editCustom = vm.runInContext('tripForm({destinationLabel:"<영종도 & 제주>", title:"영종도 여행"})', context);
  expect(createForm).toContain('<select name="destination" required><option value="" selected>');
  expect(createForm).toMatch(/<option value="__custom"\s*>직접 입력<\/option>/);
  expect(createForm).toContain('<optgroup');
  expect(createForm).toContain('name="destinationCustom"');
  expect(editPreset).toContain('name="destination"');
  expect(editPreset).toContain('value="제주" selected');
  expect(editPreset).toContain('name="destinationCustom"');
  expect(editCustom).toContain('value="__custom" selected');
  expect(editCustom).toContain('value="&lt;영종도 &amp; 제주&gt;"');
  expect(editCustom).not.toContain('(기존)');
  expect(editCustom).toContain('출발일');
  expect(editCustom).toContain('마지막 날');
  expect(editCustom).toMatch(/class="[^"]*travel-trip-dates/);
  expect(travelCssSource).toMatch(/@media\s*\(max-width:\s*560px\)[\s\S]*?travel-trip-dates[^\n{]*\{[^}]*grid-template-columns:\s*(?:minmax\(0,\s*)?1fr/);
});

test('trip save shows a safe inline error and retries with the entered preset', async () => {
  const lines = travelSource.split('\n');
  const resolveLine = lines.find(line => line.trimStart().startsWith('const resolveDestination ='));
  const submitBlock = travelSource.slice(travelSource.indexOf('  const submit ='), travelSource.indexOf('  const click ='));
  expect(resolveLine).toBeTruthy();
  expect(submitBlock).toBeTruthy();
  const fields = { title: '우리 가족 여행', destination: '제주', destinationCustom: '<stale>', startDate: '2026-11-01', endDate: '2026-11-03', intro: '기억할 이야기' };
  const errorNotice = { hidden: true, textContent: '', innerHTML: '' };
  class TestForm {}
  const form = Object.assign(new TestForm(), { id: 'travelTripForm', querySelector: selector => selector === '.travel-trip-error' ? errorNotice : null });
  let attempts = 0;
  let closeCount = 0;
  const createdTrips = [];
  const alerts = [];
  const context = {
    current: { bulkBusy: false, editingId: null, page: 'plan', tripId: null, tab: 'all' },
    HTMLFormElement: TestForm,
    FormData: class { constructor() { } entries() { return Object.entries(fields); } },
    data: { createTrip: async trip => { if (!attempts++) throw new Error('<storage unavailable>'); createdTrips.push(trip); return { id: 'saved-trip' }; } },
    resolveDestination: undefined,
    trip: () => null,
    clearSelection: () => {}, clearItineraryFilters: () => {}, closeModal: () => closeCount++, render: () => {},
    window: { alert: message => alerts.push(message) },
  };
  vm.createContext(context);
  vm.runInContext(`${resolveLine}\n${submitBlock}`, context);
  const event = { target: form, preventDefault() {} };
  context.event = event;

  await vm.runInContext('submit(event)', context);
  expect(errorNotice).toMatchObject({ hidden: false, textContent: '<storage unavailable>', innerHTML: '' });
  expect(fields).toMatchObject({ title: '우리 가족 여행', destination: '제주', destinationCustom: '<stale>' });
  expect(alerts).toEqual([]);
  expect(closeCount).toBe(0);

  await vm.runInContext('submit(event)', context);
  expect(errorNotice.hidden).toBe(true);
  expect(createdTrips[0]).toMatchObject({ title: '우리 가족 여행', destination: '제주', destinationLabel: '제주', startDate: '2026-11-01', endDate: '2026-11-03' });
  expect(alerts).toEqual([]);
  expect(closeCount).toBe(1);
});

test('day-scoped forms and itinerary use the selected date or inbox', () => {
  const lines = travelSource.split('\n');
  const activeItems = travelSource.match(/  const activeItems = item => \{[\s\S]*?\n  \};/)?.[0];
  const functions = ['const itineraryOrder =', 'const defaultDayIndex =', 'const daySelect ='];
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
  expect(vm.runInContext('activeItems(trip).map(item => item.id)', context)).toEqual(['b']);
  context.current.tab = 'inbox';
  expect(vm.runInContext('defaultDayIndex()', context)).toBeNull();
  expect(vm.runInContext('activeItems(trip).map(item => item.id)', context)).toEqual(['inbox']);
  context.current.tab = 'all';
  expect(vm.runInContext('activeItems(trip).map(item => item.id)', context)).toEqual(['a', 'b', 'inbox']);
});

test('planner capture controls preserve day context, details clicks, and null inbox moves', async () => {
  const handler = travelSource.match(/  const handlePlannerControls = async event => \{[\s\S]*?\n  \};/)?.[0];
  expect(handler).toBeTruthy();
  const current = { tab: 'all', modalMode: null };
  const trip = { id: 'trip-1' };
  const calls = { render: 0, move: [], show: [], prepare: 0 };
  const context = {
    current,
    trip: () => trip,
    defaultDayIndex: () => null,
    placeForm: (_trip, day) => `place-day:${day}`,
    noteForm: (_trip, day) => `note-day:${day}`,
    showModal: (...args) => calls.show.push(args),
    preparePlaceSearch: async () => calls.prepare++,
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
  expect(calls.prepare).toBe(1);

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
