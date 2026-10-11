import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const travelSource = readFileSync('travel.js', 'utf8');
const functionBlock = (name, end = '\n  };') => {
  const start = travelSource.indexOf(`  const ${name} =`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const endAt = travelSource.indexOf(end, start);
  if (endAt < 0) throw new Error(`Missing end of ${name}`);
  return travelSource.slice(start, endAt + end.length);
};

function saveHarness({ addPlace, items = [] } = {}) {
  const fields = { title: '이름만 장소', address: '주소', time: '10:30', note: '메모', dayIndex: '1', visited: 'true' };
  const controls = Object.values(fields).map(() => ({ disabled: false }));
  const error = { hidden: true, textContent: '' };
  const saved = { textContent: '' };
  let focusCount = 0;
  let focusAfterEnable = false;
  const form = {
    isConnected: true,
    elements: Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { value, focus() { focusCount++; focusAfterEnable = controls.every(control => !control.disabled); } }])),
    querySelector: selector => selector === '.travel-trip-error' ? error : saved,
    querySelectorAll: () => controls,
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; },
  };
  const calls = [];
  const context = {
    current: { placeSaving: false },
    FormData: class { entries() { return Object.entries(fields); } },
    form,
    trip: () => ({ id: 'trip-1', items }),
    data: { addPlace: async (...args) => { calls.push(args); return addPlace?.(...args); } },
  };
  vm.createContext(context);
  const placeAlreadyAdded = travelSource.split('\n').find(line => line.trimStart().startsWith('const placeAlreadyAdded ='));
  vm.runInContext(`${placeAlreadyAdded}\n${functionBlock('savePlace')}`, context);
  return { context, form, fields, controls, error, saved, calls, get focusCount() { return focusCount; }, get focusAfterEnable() { return focusAfterEnable; } };
}

test('place save errors stay inline with fields intact and a retry keeps date and visited state', async () => {
  let attempt = 0;
  const h = saveHarness({ addPlace: async () => { if (!attempt++) throw new Error('저장 실패'); } });
  await vm.runInContext('savePlace(form)', h.context);

  expect(h.error).toMatchObject({ hidden: false, textContent: '저장 실패' });
  expect(h.form.elements.title.value).toBe('이름만 장소');
  expect(h.form.elements.address.value).toBe('주소');
  expect(h.form.elements.note.value).toBe('메모');
  expect(h.form['aria-busy']).toBeUndefined();
  expect(h.controls.every(control => !control.disabled)).toBe(true);

  await vm.runInContext('savePlace(form)', h.context);
  expect(h.calls).toHaveLength(2);
  expect(h.calls[1]).toEqual(['trip-1', expect.objectContaining({
    title: '이름만 장소', dayIndex: 1, visited: true, time: '10:30', note: '메모',
    place: expect.objectContaining({ provider: 'manual', providerId: null, name: '이름만 장소', lat: null, lng: null }),
  })]);
  expect(h.saved.textContent).toContain('이름만 장소 추가했어요');
  expect(h.form.elements.title.value).toBe('');
  expect(h.focusCount).toBe(1);
  expect(h.focusAfterEnable).toBe(true);
});

test('one-click provider result retains its provider identity, coordinates, and selected day', async () => {
  const h = saveHarness();
  const place = { provider: 'kakao', providerId: 'place-42', name: '해변 카페', address: '제주', lat: 33.4, lng: 126.2, attribution: 'Kakao' };
  const addLabel = { textContent: '＋ 추가' };
  const button = { disabled: false, querySelector: () => addLabel };
  await vm.runInContext('savePlace(form, selected, button)', Object.assign(h.context, { selected: place, button }));

  expect(h.calls[0][1]).toMatchObject({ title: '해변 카페', place, dayIndex: 1, visited: true, time: null, note: '' });
  expect(addLabel.textContent).toBe('추가됨');
  expect(button.disabled).toBe(true);
  expect(h.form.isConnected).toBe(true);
});

test('concurrent result clicks save once and provider duplicates are ignored', async () => {
  let finishSave;
  const place = { provider: 'kakao', providerId: 'place-42', name: '해변 카페' };
  const h = saveHarness({
    items: [{ type: 'place', place }],
    addPlace: () => new Promise(resolve => { finishSave = resolve; }),
  });
  const calls = [];
  h.context.selected = { ...place, providerId: 'new-place' };
  h.context.button = { disabled: false, querySelector: () => ({ textContent: '' }) };
  calls.push(vm.runInContext('savePlace(form, selected, button)', h.context));
  calls.push(vm.runInContext('savePlace(form, selected, button)', h.context));
  expect(h.calls).toHaveLength(1);
  finishSave();
  await Promise.all(calls);

  const duplicateButton = { disabled: false, querySelector: () => ({ textContent: '' }) };
  await vm.runInContext('savePlace(form, duplicate, duplicateButton)', Object.assign(h.context, { duplicate: place, duplicateButton }));
  expect(h.calls).toHaveLength(1);
});

test('a search response arriving after the modal closes is discarded', async () => {
  const search = functionBlock('search');
  const closeModal = travelSource.split('\n').find(line => line.trimStart().startsWith('const closeModal ='));
  const category = { dataset: { travelCategory: '관광지' }, setAttribute() {} };
  const results = { innerHTML: '' };
  const form = {
    isConnected: true,
    elements: { region: { value: '제주' }, query: { value: '카페' } },
    querySelectorAll: () => [category], querySelector: () => results,
  };
  let resolveSearch;
  let resultUpdates = 0;
  const current = { searchRequest: 0, modalMode: 'place' };
  const context = {
    current, view: {},
    $: selector => selector === '#travelPlaceForm' ? form : null,
    data: { searchPlaces: () => new Promise(resolve => { resolveSearch = resolve; }) },
    updateModalResults: () => resultUpdates++,
    clearTravelViewport: () => {},
  };
  vm.createContext(context);
  vm.runInContext(`${search}\n${closeModal}`, context);
  const pending = vm.runInContext('search()', context);
  expect(results.innerHTML).toContain('장소를 찾고 있어요');
  vm.runInContext('closeModal()', context);
  resolveSearch({ status: 'ok', items: [{ name: '늦은 결과' }] });
  await pending;

  expect(resultUpdates).toBe(0);
  expect(current.searchRequest).toBe(2);
});

test('available discovery shows regional search and starts with the attractions category', async () => {
  const preparePlaceSearch = functionBlock('preparePlaceSearch');
  const calls = [];
  const form = {
    isConnected: true,
    querySelector: selector => ({
      '.travel-place-discovery': discovery,
      '.travel-manual-place': manual,
      '.travel-place-status': status,
    })[selector],
  };
  const discovery = { hidden: true };
  const manual = { open: true };
  const status = { textContent: '' };
  const context = {
    view: {},
    $: () => form,
    data: { searchPlaces: async (...args) => { calls.push(args); return { status: 'ok' }; } },
    search: async category => calls.push(['search', category]),
  };
  vm.createContext(context);
  vm.runInContext(preparePlaceSearch, context);
  await vm.runInContext('preparePlaceSearch()', context);

  expect(calls).toEqual([['', { action: 'status' }], ['search', '관광지']]);
  expect(discovery.hidden).toBe(false);
  expect(manual.open).toBe(false);
  expect(status.textContent).toContain('지역과 종류');
});

test('unavailable discovery stays hidden, opens manual entry, and skips place search', async () => {
  const preparePlaceSearch = functionBlock('preparePlaceSearch');
  const calls = [];
  const discovery = { hidden: false };
  const manual = { open: false };
  const status = { textContent: '' };
  const form = {
    isConnected: true,
    querySelector: selector => ({
      '.travel-place-discovery': discovery,
      '.travel-manual-place': manual,
      '.travel-place-status': status,
    })[selector],
  };
  const context = {
    view: {}, $: () => form,
    data: { searchPlaces: async (...args) => { calls.push(args); return { status: 'unavailable', message: '검색을 사용할 수 없어요.' }; } },
    search: async category => calls.push(['search', category]),
  };
  vm.createContext(context);
  vm.runInContext(preparePlaceSearch, context);
  await vm.runInContext('preparePlaceSearch()', context);

  expect(calls).toEqual([['', { action: 'status' }]]);
  expect(discovery.hidden).toBe(true);
  expect(manual.open).toBe(true);
  expect(status.textContent).toBe('검색을 사용할 수 없어요.');
});
