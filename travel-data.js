(() => {
  // Travel records use a small, versioned document so the itinerary can become
  // the family memory after the trip. The storage key stays v1 for a safe,
  // one-time migration of the earlier local archive.
  const VERSION = 2;
  const LOCAL_KEY = 'family-travel-v1';
  const MAX_DAYS = 366;
  const MAX_ITEMS = 500;
  const MAX_TITLE = 120;
  const MAX_NOTE = 2000;
  const makeId = prefix => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const todayKey = () => new Intl.DateTimeFormat('sv-SE').format(new Date());
  const dateValue = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const dateList = (start, end) => {
    const result = [];
    const cursor = dateValue(start);
    const last = dateValue(end);
    while (cursor && last && cursor <= last && result.length < MAX_DAYS) {
      result.push(new Intl.DateTimeFormat('sv-SE').format(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  };
  const dayIndexFor = (date, start) => {
    if (!date || !start) return null;
    const from = dateValue(start); const target = dateValue(date);
    if (!from || !target) return null;
    const index = Math.round((target - from) / 86400000);
    return index >= 0 ? index : null;
  };
  const localDateFor = (trip, dayIndex) => dayIndex == null ? null : dateList(trip.startDate, trip.endDate)[dayIndex] || null;
  const validCoordinate = (lat, lng) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
  const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  const contextKey = () => {
    const householdId = window.FAMILY_APP_STATE?.household?.id;
    if (householdId) return `family-travel-v1:${householdId}`;
    return window.FAMILY_DEMO?.storageKey?.('family-travel-v1') || 'family-travel-v1';
  };
  const sharing = () => window.FAMILY_TRAVEL_SHARING;
  const shared = () => sharing()?.enabled() === true;
  const demoMode = () => window.FAMILY_DEMO_MODE === true;

  const normalizeItem = (raw, trip, fallbackIndex = 0) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const legacyDate = source.localDate || source.date || null;
    const dayIndex = source.dayIndex == null ? dayIndexFor(legacyDate, trip.startDate) : Number(source.dayIndex);
    const placeSource = source.place && typeof source.place === 'object' ? source.place : null;
    const isNote = source.type === 'note' || source.kind === 'note' || (!source.place && !validCoordinate(source.latitude, source.longitude) && source.note && !source.address);
    const place = isNote ? null : (placeSource || (source.address || source.place || validCoordinate(source.latitude, source.longitude) ? {
      provider: source.provider || 'legacy', providerId: source.providerId || source.placeId || null,
      name: String(source.placeName || source.place || source.title || '').trim(), address: String(source.address || '').trim(),
      lat: validCoordinate(source.latitude, source.longitude) ? Number(source.latitude) : null,
      lng: validCoordinate(source.latitude, source.longitude) ? Number(source.longitude) : null,
      attribution: source.attribution || null,
    } : null));
    const item = {
      id: String(source.id || makeId('item')),
      type: isNote ? 'note' : 'place',
      dayIndex: Number.isInteger(dayIndex) && dayIndex >= 0 ? dayIndex : null,
      order: Number.isFinite(Number(source.order ?? source.position)) ? Number(source.order ?? source.position) : fallbackIndex,
      title: String(source.title || source.name || place?.name || '기록').trim().slice(0, MAX_TITLE),
      time: source.time || source.startTime || null,
      note: String(source.note || '').slice(0, MAX_NOTE),
      visited: Boolean(source.visited),
      place,
    };
    // Compatibility aliases keep old local records and exports readable.
    item.localDate = localDateFor(trip, item.dayIndex); item.position = item.order; item.kind = item.type === 'place' ? 'visit' : 'note';
    if (item.place) {
      item.placeName = item.place.name; item.address = item.place.address; item.latitude = item.place.lat; item.longitude = item.place.lng;
      item.provider = item.place.provider; item.providerId = item.place.providerId;
    }
    return item;
  };
  const normalizeOrder = trip => {
    const buckets = new Map();
    trip.items.forEach(item => { const key = item.dayIndex == null ? 'inbox' : String(item.dayIndex); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(item); });
    for (const bucket of buckets.values()) bucket.sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id))).forEach((item, index) => { item.order = index; item.position = index; item.localDate = localDateFor(trip, item.dayIndex); });
    return trip;
  };
  const normalizeTrip = raw => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const startDate = String(source.startDate || todayKey()); const endDate = String(source.endDate || startDate);
    const preservedLegacy = clone(source.legacy || source.document?.legacy || {});
    for (const key of ['memories','expenses','bookings','candidates','tasks']) if (source[key] != null && preservedLegacy[key] == null) preservedLegacy[key] = clone(source[key]);
    const trip = {
      id: String(source.id || makeId('trip')), title: String(source.title || `${source.destinationLabel || source.destination || '우리 가족'} 여행`).slice(0, 60),
      destinationLabel: String(source.destinationLabel || source.destination || '').slice(0, 120), destination: String(source.destinationLabel || source.destination || '').slice(0, 120),
      centerLat: validCoordinate(source.centerLat, source.centerLng) ? Number(source.centerLat) : null, centerLng: validCoordinate(source.centerLat, source.centerLng) ? Number(source.centerLng) : null,
      timezone: String(source.timezone || 'Asia/Seoul'), startDate, endDate, intro: String(source.intro || '').slice(0, 240), archivedAt: source.archivedAt || source.archived_at || null,
      revision: Number.isFinite(Number(source.revision)) ? Number(source.revision) : 0, updatedAt: source.updatedAt || source.updated_at || new Date().toISOString(), createdAt: source.createdAt || source.created_at || new Date().toISOString(),
      updatedBy: source.updatedBy || null, householdId: source.householdId || source.household_id || null, legacy: preservedLegacy, memories: Array.isArray(source.memories) ? clone(source.memories) : [],
      travelers: Array.isArray(source.travelers) ? clone(source.travelers) : [], tasks: Array.isArray(source.tasks) ? clone(source.tasks) : [], expenses: Array.isArray(source.expenses) ? clone(source.expenses) : [], candidates: Array.isArray(source.candidates) ? clone(source.candidates) : [], bookings: Array.isArray(source.bookings) ? clone(source.bookings) : [],
    };
    const rawItems = Array.isArray(source.items) ? source.items : Array.isArray(source.document?.items) ? source.document.items : [];
    trip.items = rawItems.slice(0, MAX_ITEMS).map((item, index) => normalizeItem(item, trip, index));
    trip.document = { schemaVersion: VERSION, items: trip.items.map(item => ({ id: item.id, type: item.type, dayIndex: item.dayIndex, order: item.order, title: item.title, time: item.time, note: item.note, visited: item.visited, place: item.place ? { ...item.place } : null })), legacy: clone(trip.legacy) };
    return normalizeOrder(trip);
  };
  const validateDates = (start, end) => {
    const from = dateValue(start); const to = dateValue(end);
    if (!from || !to || end < start) throw new Error('여행 날짜를 확인해 주세요.');
    if ((to - from) / 86400000 >= MAX_DAYS) throw new Error('여행은 최대 366일까지 계획할 수 있어요.');
  };
  const validateTrip = trip => {
    validateDates(trip.startDate, trip.endDate);
    if (!trip.title || trip.title.length > 60) throw new Error('여행 이름을 확인해 주세요.');
    if (!trip.destinationLabel || trip.destinationLabel.length > 120) throw new Error('여행지를 확인해 주세요.');
    if (trip.items.length > MAX_ITEMS) throw new Error('한 여행에는 최대 500개까지 기록할 수 있어요.');
    const maxDayIndex = dateList(trip.startDate, trip.endDate).length - 1;
    trip.items.forEach(item => {
      if (item.dayIndex != null && item.dayIndex > maxDayIndex) { const error = new Error('기간 밖에 있는 기록이 있어요.'); error.code = 'OUT_OF_RANGE'; throw error; }
      if (!item.title || item.title.length > MAX_TITLE || item.note.length > MAX_NOTE) throw new Error('장소 이름 또는 메모가 너무 길어요.');
      if (item.type === 'place' && item.place?.lat != null && !validCoordinate(item.place.lat, item.place.lng)) throw new Error('장소 위치를 확인해 주세요.');
    });
    return trip;
  };
  const demoTrip = () => normalizeTrip({ id: 'demo-trip-family-map', title: '도윤이와 첫 오키나와', destinationLabel: '오키나와', startDate: '2026-12-11', endDate: '2026-12-15', timezone: 'Asia/Tokyo', items: [
    { id: 'demo-place-1', type: 'place', dayIndex: 1, order: 0, title: '국제거리 산책', note: '도윤이 컨디션에 따라 짧게', place: { provider: 'demo', providerId: 'kokusai', name: '국제거리', address: '오키나와 나하시 국제거리', lat: 26.2144, lng: 127.6792 } },
    { id: 'demo-note-1', type: 'note', dayIndex: 1, order: 1, title: '점심·수유 시간', time: '12:30', note: '수유 공간을 먼저 확인해요.' },
    { id: 'demo-place-2', type: 'place', dayIndex: 2, order: 0, title: '추라우미 수족관', note: '주차·기저귀 교환대 확인', place: { provider: 'demo', providerId: 'churaumi', name: '해양박공원', address: '424 Ishikawa, Motobu, Okinawa', lat: 26.6942, lng: 127.8777 } },
  ], memories: [], legacy: {} });
  const readRaw = () => { try { return JSON.parse(localStorage.getItem(contextKey()) || 'null'); } catch { return null; } };
  const read = () => { const value = readRaw(); if (Array.isArray(value)) return value.map(normalizeTrip).filter(trip => !trip.archivedAt); if (value && Array.isArray(value.trips)) return value.trips.map(normalizeTrip).filter(trip => !trip.archivedAt); return demoMode() ? [demoTrip()] : []; };
  const write = values => { try { localStorage.setItem(contextKey(), JSON.stringify(values.map(normalizeTrip))); return true; } catch { return false; } };
  let trips = shared() ? [] : read(); let generation = 0; let refreshing = null;
  const emit = detail => window.dispatchEvent(new CustomEvent('family:travel-change', { detail: detail || { count: trips.length } }));
  const commit = async (next, options = {}) => { const epoch = generation; let normalized = next.map(value => validateTrip(normalizeTrip(value))); if (shared()) { normalized = normalized.map(value => { if (isUuid(value.id)) return value; const originalId = value.id; return normalizeTrip({ ...value, id: crypto.randomUUID?.() || makeId('trip'), legacy: { ...value.legacy, originalLocalId: originalId } }); }); await sharing().save(normalized, { expectedRevision: options.expectedRevision, mutationId: options.mutationId || makeId('mutation') }); } else if (!write(normalized)) throw new Error('저장 공간이 부족하거나 저장이 차단되어 있어요. 입력 내용을 보관한 뒤 다시 시도해 주세요.'); if (epoch !== generation) throw new Error('가족 계정이 변경되었어요. 여행 탭을 다시 열어 주세요.'); trips = normalized; emit(); return { data: clone(trips), saved: true }; };
  const getTrips = (options = {}) => clone(options.includeArchived ? trips : trips.filter(trip => !trip.archivedAt));
  const getTrip = id => clone(trips.find(trip => trip.id === id && !trip.archivedAt) || null);
  const getArchivedTrips = () => clone(trips.filter(trip => trip.archivedAt));
  const updateLocal = async (id, updater, options = {}) => { const index = trips.findIndex(trip => trip.id === id); if (index < 0) throw new Error('여행을 찾을 수 없어요.'); const before = normalizeTrip(trips[index]); const next = normalizeOrder(normalizeTrip(updater(clone(before)))); next.id = before.id; next.revision = before.revision + 1; next.updatedAt = new Date().toISOString(); validateTrip(next); await commit(trips.map((trip, tripIndex) => tripIndex === index ? next : trip), { ...options, expectedRevision: before.revision }); return clone(next); };
  const createTrip = async input => { const destinationLabel = String(input.destinationLabel || input.destination || '').trim(); const startDate = String(input.startDate || ''); const endDate = String(input.endDate || startDate); const trip = normalizeTrip({ id: makeId('trip'), title: String(input.title || `${destinationLabel} 가족여행`).trim(), destinationLabel, destination: destinationLabel, startDate, endDate, timezone: input.timezone || 'Asia/Seoul', centerLat: input.centerLat, centerLng: input.centerLng, intro: input.intro, legacy: {}, items: [], memories: [] }); validateTrip(trip); const originalId = trip.id; await commit([...trips, trip]); return clone(trips.find(item => item.id === originalId || item.legacy?.originalLocalId === originalId) || trip); };
  const updateTrip = async (id, patch = {}) => updateLocal(id, trip => { const next = { ...trip, ...patch }; if (patch.destination != null && patch.destinationLabel == null) next.destinationLabel = patch.destination; if (patch.destinationLabel != null) next.destination = patch.destinationLabel; if (patch.startDate && patch.startDate !== trip.startDate) { const oldDates = dateList(trip.startDate, trip.endDate); const newDates = dateList(patch.startDate, patch.endDate || trip.endDate); next.items = trip.items.map(item => ({ ...item, localDate: null })); next.items.forEach(item => { item.localDate = localDateFor(next, item.dayIndex); }); next.legacy = { ...trip.legacy, dateShiftedAt: new Date().toISOString(), previousDates: oldDates, nextDates: newDates }; } return next; });
  const moveOutOfRangeToInbox = async (id, patch = {}) => updateLocal(id, trip => { const next = { ...trip, ...patch }; const max = dateList(next.startDate, next.endDate).length - 1; next.items = trip.items.map(item => item.dayIndex != null && item.dayIndex > max ? { ...item, dayIndex: null } : item); return next; });
  const addItem = async (id, input = {}) => updateLocal(id, trip => { if (trip.items.length >= MAX_ITEMS) throw new Error('한 여행에는 최대 500개까지 기록할 수 있어요.'); const type = input.type || (input.kind === 'note' ? 'note' : 'place'); const localDate = input.localDate || null; const dayIndex = input.dayIndex == null ? dayIndexFor(localDate, trip.startDate) : Number(input.dayIndex); const place = input.place && typeof input.place === 'object' ? input.place : (type === 'place' && (input.place || input.address || validCoordinate(input.latitude, input.longitude)) ? { provider: input.provider || 'manual', providerId: input.providerId || null, name: String(input.place || input.title || '').trim(), address: String(input.address || '').trim(), lat: validCoordinate(input.latitude, input.longitude) ? Number(input.latitude) : null, lng: validCoordinate(input.latitude, input.longitude) ? Number(input.longitude) : null, attribution: input.attribution || null } : null); if (type === 'place' && !place) throw new Error('검색 결과를 선택하거나 위치가 있는 장소를 추가해 주세요. 위치가 없으면 메모로 남길 수 있어요.'); return { ...trip, items: [...trip.items, normalizeItem({ ...input, id: makeId('item'), type, dayIndex: Number.isInteger(dayIndex) && dayIndex >= 0 ? dayIndex : null, order: trip.items.filter(item => item.dayIndex === dayIndex).length, place }, trip, trip.items.length)] }; });
  const addPlace = (id, input) => addItem(id, { ...input, type: 'place' }); const addNote = (id, input) => addItem(id, { ...input, type: 'note', place: null });
  const updateItem = async (tripId, itemId, patch) => updateLocal(tripId, trip => ({ ...trip, items: trip.items.map(item => item.id === itemId ? normalizeItem({ ...item, ...patch }, trip, item.order) : item) }));
  const deleteItem = async (tripId, itemId) => updateLocal(tripId, trip => ({ ...trip, items: trip.items.filter(item => item.id !== itemId) }));
  const moveItem = async (tripId, itemId, dayIndex) => updateLocal(tripId, trip => ({ ...trip, items: trip.items.map(item => item.id === itemId ? { ...item, dayIndex: dayIndex == null ? null : Number(dayIndex), order: trip.items.filter(other => other.dayIndex === (dayIndex == null ? null : Number(dayIndex))).length } : item) }));
  const reorderItem = async (tripId, itemId, direction) => updateLocal(tripId, trip => { const item = trip.items.find(entry => entry.id === itemId); if (!item) return trip; const siblings = trip.items.filter(entry => entry.dayIndex === item.dayIndex).sort((a, b) => a.order - b.order); const index = siblings.findIndex(entry => entry.id === itemId); const target = index + (direction === 'up' ? -1 : 1); if (target < 0 || target >= siblings.length) return trip; [siblings[index].order, siblings[target].order] = [siblings[target].order, siblings[index].order]; return { ...trip, items: trip.items.map(entry => entry.id === siblings[index].id ? siblings[index] : entry.id === siblings[target].id ? siblings[target] : entry) }; });
  const toggleVisited = (tripId, itemId) => { const item = getTrip(tripId)?.items.find(entry => entry.id === itemId); return updateItem(tripId, itemId, { visited: !item?.visited }); };
  const archiveTrip = async id => updateLocal(id, trip => ({ ...trip, archivedAt: new Date().toISOString() })); const restoreTrip = async id => updateLocal(id, trip => ({ ...trip, archivedAt: null }));
  const addMemory = async (id, input) => updateLocal(id, trip => ({ ...trip, memories: [...trip.memories, { ...input, id: makeId('memory'), createdAt: new Date().toISOString() }] }));
  const toggleTask = async (id, taskId) => updateLocal(id, trip => ({ ...trip, tasks: trip.tasks.map(task => task.id === taskId ? { ...task, completed: !task.completed } : task) }));
  const addExpense = async (id, input) => updateLocal(id, trip => ({ ...trip, expenses: [...trip.expenses, { ...input, id: makeId('expense'), spentAt: input.spentAt || todayKey() }] }));
  const unsupported = async () => { throw new Error('항공·숙소 후보 기능은 여행 기록 범위에 포함되지 않아요.'); }; const addCandidate = unsupported; const updateCandidate = unsupported; const addBooking = unsupported; const removeTrip = archiveTrip;
  const searchPlaces = async (query, options = {}) => {
    const text = String(query || '').trim(); if (!text) return { items: [], status: 'empty' };
    if (typeof window.FAMILY_TRAVEL_GEOCODER === 'function') return window.FAMILY_TRAVEL_GEOCODER(text, options);
    const client = window.FAMILY_APP_STATE?.supabase;
    if (!client || !window.FAMILY_APP_STATE?.session?.user?.id || !window.FAMILY_APP_STATE?.household?.id) return { items: [], status: 'unavailable', message: '가족 계정에서 장소 검색을 사용할 수 있어요. 지금은 이름과 주소를 직접 기록해 주세요.' };
    const { data: payload, error } = await client.functions.invoke('travel-place-search', { body: { query: text, limit: Math.min(10, options.limit || 10) }, headers: { 'x-family-household': window.FAMILY_APP_STATE.household.id } });
    if (error) return { items: [], status: 'error', message: '장소 검색에 실패했어요. 잠시 후 다시 시도해 주세요.' };
    return payload || { items: [], status: 'ok' };
  };
  const refresh = async () => { if (!shared()) { trips = read(); emit(); return getTrips(); } if (refreshing) return refreshing; const epoch = generation; refreshing = sharing().load().then(next => { if (epoch !== generation) return []; trips = (next || []).map(normalizeTrip); emit(); return getTrips(); }).finally(() => { refreshing = null; }); return refreshing; };
  const importLocalTrip = async id => { const local = readRaw(); const candidate = (Array.isArray(local) ? local : []).find(item => item.id === id); if (!candidate) throw new Error('기존 여행을 찾을 수 없어요.'); const created = normalizeTrip(candidate); const originalId = created.id; await commit([...trips, created]); return clone(trips.find(item => item.id === originalId || item.legacy?.originalLocalId === originalId) || created); };
  const getLocalTrips = () => shared() ? read().filter(local => !trips.some(remote => remote.id === local.id)) : [];
  window.addEventListener('familycontextchange', () => { generation++; refreshing = null; trips = shared() ? [] : read(); emit(); });
  window.FAMILY_TRAVEL_DATA = Object.freeze({ VERSION, getTrips, getTrip, getArchivedTrips, createTrip, updateTrip, moveOutOfRangeToInbox, addItem, addPlace, addNote, updateItem, deleteItem, moveItem, reorderItem, toggleVisited, archiveTrip, restoreTrip, addMemory, toggleTask, addExpense, addCandidate, updateCandidate, addBooking, removeTrip, searchPlaces, refresh, importLocalTrip, getLocalTrips, contextKey, isLocal: () => !shared() });
})();
