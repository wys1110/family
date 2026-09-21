(() => {
  const VERSION = 1;
  const LOCAL_KEY = 'family-travel-v1';
  const DEMO_TRIP_ID = 'demo-trip-okinawa';

  const makeId = prefix => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const demoMode = () => window.FAMILY_DEMO_MODE === true;
  const contextKey = () => {
    const householdId = window.FAMILY_APP_STATE?.household?.id;
    if (householdId) return `${LOCAL_KEY}:${householdId}`;
    return window.FAMILY_DEMO?.storageKey?.(LOCAL_KEY) || LOCAL_KEY;
  };
  const starterTasks = () => [
    { id: makeId('task'), title: '아기 여권 준비 여부 확인', category: '서류', assignee: '가족', dueDate: null, completed: false },
    { id: makeId('task'), title: '항공사 유아 탑승 등록 확인', category: '항공', assignee: '가족', dueDate: null, completed: false },
    { id: makeId('task'), title: '숙소 아기 침대·전자레인지 확인', category: '숙소', assignee: '가족', dueDate: null, completed: false },
    { id: makeId('task'), title: '유모차·카시트·수유용품 챙기기', category: '짐', assignee: '가족', dueDate: null, completed: false },
    { id: makeId('task'), title: '공항 이동 방법 정하기', category: '이동', assignee: '가족', dueDate: null, completed: false },
  ];
  const demoTrip = () => ({
    id: DEMO_TRIP_ID, title: '도윤이와 첫 오키나와', origin: '인천공항', destination: '오키나와', startDate: '2026-12-11', endDate: '2026-12-15', timezone: 'Asia/Tokyo', currency: 'KRW', budgetMinor: 1800000, status: 'planning', searchRevision: 1, rooms: 1,
    travelers: [{ name: '용석', type: 'adult' }, { name: '수빈', type: 'adult' }, { name: '도윤', type: 'infant' }],
    candidates: [
      { id: 'demo-flight', kind: 'flight', provider: '외부 예약처', source: 'manual', title: '인천 ↔ 나하 왕복 항공권', detail: '가족 3명 · 유아 좌석 없음 · 수하물 확인 필요', amountMinor: 720000, currency: 'KRW', quotedAt: todayKey(), status: 'shortlisted', searchRevision: 1, bookingUrl: 'https://www.skyscanner.co.kr/' },
      { id: 'demo-stay', kind: 'stay', provider: '외부 예약처', source: 'manual', title: '나하 가족 숙소 4박', detail: '체크인 12/11 · 체크아웃 12/15 · 아기 침대 문의', amountMinor: 680000, currency: 'KRW', quotedAt: todayKey(), status: 'saved', searchRevision: 1, bookingUrl: 'https://www.booking.com/' },
    ],
    bookings: [],
    items: [
      { id: 'demo-item-1', localDate: '2026-12-12', position: 0, kind: 'visit', title: '국제거리 산책', place: '국제거리', address: '오키나와 나하시 국제거리', latitude: 26.2144, longitude: 127.6792, startTime: '10:30', durationMinutes: 90, transportMode: 'walk', fixedTime: false, note: '도윤이 컨디션에 따라 짧게' },
      { id: 'demo-item-2', localDate: '2026-12-12', position: 1, kind: 'meal', title: '아기와 점심', place: '나하 시내', address: '오키나와 나하시', latitude: 26.2124, longitude: 127.6809, startTime: '12:30', durationMinutes: 60, transportMode: 'walk', fixedTime: false, note: '수유 공간 확인' },
      { id: 'demo-item-3', localDate: '2026-12-13', position: 0, kind: 'visit', title: '추라우미 수족관', place: '해양박공원', address: '424 Ishikawa, Motobu, Okinawa', latitude: 26.6942, longitude: 127.8777, startTime: '10:00', durationMinutes: 150, transportMode: 'car', fixedTime: false, note: '주차·기저귀 교환대 확인' },
    ],
    tasks: starterTasks(), expenses: [], memories: [], selectedDate: '2026-12-12', activeSection: 'summary', updatedAt: new Date().toISOString(), version: VERSION,
  });
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalizeTrip = trip => {
    const value = { ...trip };
    value.travelers = Array.isArray(value.travelers) ? value.travelers : [];
    value.candidates = Array.isArray(value.candidates) ? value.candidates : [];
    value.bookings = Array.isArray(value.bookings) ? value.bookings : [];
    value.items = Array.isArray(value.items) ? value.items : [];
    value.tasks = Array.isArray(value.tasks) ? value.tasks : [];
    value.expenses = Array.isArray(value.expenses) ? value.expenses : [];
    value.memories = Array.isArray(value.memories) ? value.memories : [];
    value.rooms = Math.max(1, Number(value.rooms) || 1);
    value.children = Math.max(0, Number(value.children) || value.travelers.filter(person => person.type === 'child').length);
    value.infants = Math.max(0, Number(value.infants) || value.travelers.filter(person => person.type === 'infant').length);
    value.selectedDate ||= value.startDate;
    value.activeSection ||= 'summary';
    value.searchRevision = Number(value.searchRevision) || 1;
    value.version = Number(value.version) || VERSION;
    return value;
  };
  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(contextKey()) || 'null');
      if (Array.isArray(value)) return value.map(normalizeTrip);
    } catch { /* storage may be unavailable */ }
    return demoMode() ? [demoTrip()] : [];
  };
  const write = trips => {
    try { localStorage.setItem(contextKey(), JSON.stringify(trips)); return true; }
    catch { return false; }
  };
  let trips = read();
  const emit = () => window.dispatchEvent(new CustomEvent('family:travel-change', { detail: { count: trips.length } }));
  const commit = next => { const normalized = next.map(normalizeTrip); if (!write(normalized)) throw new Error('저장 공간이 부족하거나 저장이 차단되어 있어요. 입력 내용을 복사한 뒤 다시 시도해 주세요.'); trips = normalized; emit(); return { data: clone(trips), saved: true }; };
  const getTrips = () => clone(trips);
  const getTrip = id => clone(trips.find(trip => trip.id === id) || null);
  const validateDates = (start, end) => {
    const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!valid(start) || !valid(end) || end < start) throw new Error('여행 날짜를 확인해 주세요');
    if ((Date.parse(end) - Date.parse(start)) / 86400000 >= 366) throw new Error('여행은 최대 366일까지 계획할 수 있어요');
  };
  const createTrip = input => {
    const title = String(input.title || '').trim();
    const destination = String(input.destination || '').trim();
    const startDate = String(input.startDate || '');
    const endDate = String(input.endDate || '');
    if (!title || title.length > 60) throw new Error('여행 이름을 확인해 주세요');
    if (!destination || destination.length > 80) throw new Error('여행지를 확인해 주세요');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) throw new Error('여행 날짜를 확인해 주세요');
    validateDates(startDate, endDate);
    const travelers = Array.isArray(input.travelers) ? input.travelers : [];
    const trip = normalizeTrip({ id: makeId('trip'), title, origin: String(input.origin || '').trim(), destination, startDate, endDate, timezone: String(input.timezone || 'Asia/Seoul'), currency: String(input.currency || 'KRW'), budgetMinor: Number(input.budgetMinor) > 0 ? Math.round(Number(input.budgetMinor)) : null, status: 'planning', searchRevision: 1, rooms: Math.max(1, Number(input.rooms) || 1), children: Math.max(0, Number(input.children) || travelers.filter(person => person.type === 'child').length), infants: Math.max(0, Number(input.infants) || travelers.filter(person => person.type === 'infant').length), travelers, candidates: Array.isArray(input.candidates) ? input.candidates : [], bookings: [], items: [], tasks: starterTasks(), expenses: [], memories: [], selectedDate: startDate, activeSection: 'summary', updatedAt: new Date().toISOString(), version: VERSION });
    commit([...trips, trip]); return clone(trip);
  };
  const updateTrip = (id, patch) => {
    const index = trips.findIndex(trip => trip.id === id); if (index < 0) throw new Error('여행을 찾을 수 없어요');
    const next = normalizeTrip({ ...trips[index], ...patch, id, updatedAt: new Date().toISOString(), version: Number(trips[index].version || 1) + 1 });
    validateDates(next.startDate, next.endDate);
    if (next.items.some(item => item.localDate < next.startDate || item.localDate > next.endDate)) throw new Error('변경할 기간 밖에 일정이 있어요. 해당 일정의 날짜를 먼저 수정해 주세요.');
    if (next.selectedDate < next.startDate || next.selectedDate > next.endDate) next.selectedDate = next.startDate;
    commit(trips.map((trip, i) => i === index ? next : trip)); return clone(next);
  };
  const mutateTrip = (id, fn) => {
    const trip = getTrip(id); if (!trip) throw new Error('여행을 찾을 수 없어요');
    const next = normalizeTrip(fn(trip)); return updateTrip(id, next);
  };
  const addCandidate = (id, input) => mutateTrip(id, trip => {
    const current = trip.candidates.filter(item => item.kind === input.kind && item.searchRevision === trip.searchRevision && item.status !== 'dismissed');
    if (current.length >= 3) throw new Error(`${input.kind === 'flight' ? '항공' : '숙소'} 후보는 현재 조건에서 최대 3개까지 저장할 수 있어요.`);
    return { ...trip, candidates: [...trip.candidates, { ...input, id: makeId('candidate'), status: input.status || 'saved', source: input.source || 'manual', searchRevision: trip.searchRevision, quotedAt: input.quotedAt || todayKey() }] };
  });
  const updateCandidate = (id, candidateId, patch) => mutateTrip(id, trip => ({ ...trip, candidates: trip.candidates.map(item => item.id === candidateId ? { ...item, ...patch } : item) }));
  const addBooking = (id, input) => mutateTrip(id, trip => { if (input.candidateId && trip.bookings.some(item => item.candidateId === input.candidateId)) return trip; return ({ ...trip, bookings: [...trip.bookings, { ...input, id: makeId('booking'), status: 'booked', confirmationSource: 'manual' }] }); });
  const addItem = (id, input) => mutateTrip(id, trip => ({ ...trip, items: [...trip.items, { ...input, id: makeId('item'), position: trip.items.filter(item => item.localDate === input.localDate).length, fixedTime: Boolean(input.fixedTime) }] }));
  const updateItem = (id, itemId, patch) => mutateTrip(id, trip => ({ ...trip, items: trip.items.map(item => item.id === itemId ? { ...item, ...patch } : item) }));
  const toggleTask = (id, taskId) => mutateTrip(id, trip => ({ ...trip, tasks: trip.tasks.map(task => task.id === taskId ? { ...task, completed: !task.completed, completedAt: !task.completed ? new Date().toISOString() : null } : task) }));
  const addMemory = (id, input) => mutateTrip(id, trip => ({ ...trip, memories: [...trip.memories, { ...input, id: makeId('memory'), createdAt: new Date().toISOString() }] }));
  const addExpense = (id, input) => mutateTrip(id, trip => ({ ...trip, expenses: [...trip.expenses, { ...input, id: makeId('expense'), amountMinor: Math.round(Number(input.amountMinor) || 0), spentAt: input.spentAt || todayKey() }] }));
  const removeTrip = id => { const before = trips.length; commit(trips.filter(trip => trip.id !== id)); return before !== trips.length; };
  window.addEventListener('familycontextchange', () => { trips = read(); emit(); });
  window.FAMILY_TRAVEL_DATA = Object.freeze({ getTrips, getTrip, createTrip, updateTrip, addCandidate, updateCandidate, addBooking, addItem, updateItem, toggleTask, addMemory, addExpense, removeTrip, contextKey, isLocal: () => true, refresh: () => { trips = read(); return getTrips(); } });
})();
