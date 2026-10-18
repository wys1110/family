import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const id = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const trip = { id, household_id: 'home', title: 'original', destination_label: '제주', start_date: '2026-01-01', end_date: '2026-01-02', revision: 0, document: { schemaVersion: 2, items: [], legacy: {} } };
function harness() {
  let realtime;
  const update = vi.fn(patch => {
    const filters = {};
    const query = { eq: (key, value) => { filters[key] = value; return query; }, select: () => ({ maybeSingle: async () => ({ data: { id, revision: patch.revision }, error: null }) }) };
    return query;
  });
  const client = { from: () => ({ select: () => ({ eq: async () => ({ data: [trip, { ...trip, id: otherId }], error: null }) }), update }), channel: () => ({ on: (_type, _filter, callback) => { realtime = callback; return { subscribe: () => ({}) }; } }), removeChannel: () => {} };
  const window = { FAMILY_APP_STATE: { session: { user: { id: 'user' } }, household: { id: 'home' }, supabase: client }, addEventListener: () => {}, dispatchEvent: () => {} };
  const context = { window, localStorage: { getItem: () => null }, crypto: { randomUUID: () => id }, CustomEvent: class {} };
  vm.runInNewContext(readFileSync('travel-sharing.js', 'utf8'), context);
  vm.runInNewContext(readFileSync('travel-data.js', 'utf8'), context);
  return { data: window.FAMILY_TRAVEL_DATA, sharing: window.FAMILY_TRAVEL_SHARING, update, remote: row => realtime({ eventType: 'UPDATE', new: row }) };
}

test('a realtime revision cannot authorize overwriting a stale itinerary draft', async () => {
  const h = harness();
  await h.data.refresh();
  h.remote({ ...trip, title: 'other family edit', revision: 1 });
  await expect(h.data.updateTrip(id, { title: 'my stale draft' })).rejects.toThrow('가족이 먼저 수정');
  expect(h.update).not.toHaveBeenCalled();
  expect(h.data.getTrip(id).title).toBe('original');
});

test('saving one trip never writes another remotely changed itinerary', async () => {
  const h = harness();
  await h.data.refresh();
  h.remote({ ...trip, id: otherId, title: 'other family edit', revision: 1 });
  await h.data.updateTrip(id, { title: 'my current draft' });
  expect(h.update).toHaveBeenCalledTimes(1);
  expect(h.update.mock.calls[0][0].title).toBe('my current draft');
});

test.each([
  ['2024-02-28', '2024-03-01'],
  ['2024-03-09', '2024-03-12'],
  ['2026-12-31', '2027-01-03'],
  ['2026-01-01', '2026-12-31'],
])('item dates match the trip calendar across %s through %s', async (startDate, endDate) => {
  const window = { FAMILY_APP_STATE: {}, addEventListener: () => {}, dispatchEvent: () => {} };
  vm.runInNewContext(readFileSync('travel-data.js', 'utf8'), { window, localStorage: { getItem: () => null, setItem: () => {} }, crypto: { randomUUID: () => id }, CustomEvent: class {} });
  const api = window.FAMILY_TRAVEL_DATA;
  const created = await api.createTrip({ title: 'calendar', destinationLabel: '제주', startDate, endDate });
  const dates = api.dateList(startDate, endDate);
  for (const dayIndex of [0, dates.length - 1]) {
    await api.addNote(created.id, { title: `day ${dayIndex}`, dayIndex });
    expect(api.getTrip(created.id).items.at(-1).localDate).toBe(dates[dayIndex]);
  }
  await api.addNote(created.id, { title: 'undated', dayIndex: null });
  expect(api.getTrip(created.id).items.at(-1).localDate).toBe(null);
  await expect(api.addNote(created.id, { title: 'outside', dayIndex: dates.length })).rejects.toThrow('기간 밖');
});


test('retry of a committed mutation succeeds after realtime JSON key ordering changes', async () => {
  const h = harness();
  await h.data.refresh();
  h.remote({ ...trip, title: 'saved draft', revision: 1, last_mutation_id: 'same-mutation', document: { legacy: {}, items: [], schemaVersion: 2 } });
  await expect(h.sharing.save([{ id, title: 'saved draft', destinationLabel: '제주', startDate: trip.start_date, endDate: trip.end_date, items: [], legacy: {}, revision: 1 }], { expectedRevision: 0, mutationId: 'same-mutation' })).resolves.toBe(true);
  expect(h.update).not.toHaveBeenCalled();
});

test.each(['create', 'import'])('%s persists exactly its new trip after local IDs become UUIDs', async action => {
  const save = vi.fn(async () => true);
  const source = { id: 'local-trip', title: 'local', destinationLabel: '제주', startDate: '2026-01-01', endDate: '2026-01-02', items: [] };
  const window = { FAMILY_APP_STATE: {}, FAMILY_TRAVEL_SHARING: { enabled: () => true, load: async () => [], save }, addEventListener: () => {}, dispatchEvent: () => {} };
  vm.runInNewContext(readFileSync('travel-data.js', 'utf8'), { window, localStorage: { getItem: () => JSON.stringify([source]) }, crypto: { randomUUID: () => id }, CustomEvent: class {} });
  const api = window.FAMILY_TRAVEL_DATA;
  await api.refresh();
  const result = action === 'create' ? await api.createTrip(source) : await api.importLocalTrip(source.id);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0]).toHaveLength(1);
  expect(save.mock.calls[0][0][0].id).toBe(id);
  expect(result.id).toBe(id);
});
