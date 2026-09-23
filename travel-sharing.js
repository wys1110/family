(() => {
  // Shared travel uses one family_trips row per trip. Revisions are checked in
  // the update predicate so two family members cannot silently overwrite each
  // other's itinerary.
  const state = () => window.FAMILY_APP_STATE;
  const enabled = () => !window.FAMILY_DEMO_MODE && Boolean(state()?.session?.user?.id && state()?.household?.id && state()?.supabase);
  let generation = 0;
  let loadedScope = '';
  let rows = new Map();
  let status = 'local';
  let message = '';
  let busy = false;
  let channel = null;
  const scope = () => `${state()?.session?.user?.id || ''}:${state()?.household?.id || ''}:${generation}`;
  const context = () => {
    if (!enabled()) throw new Error('가족 계정으로 로그인해 주세요.');
    return { key: scope(), user: state().session.user.id, household: state().household.id, client: state().supabase };
  };
  const assertCurrent = ctx => { if (ctx.key !== scope()) throw new Error('가족 계정이 변경되었어요. 여행 탭을 다시 열어 주세요.'); };
  const resultData = result => { if (result.error) throw new Error(result.error.message || '가족 여행을 불러오거나 저장하지 못했어요.'); return result.data; };
  const toDocument = trip => ({ schemaVersion: 2, items: (trip.items || []).map(item => ({ id: item.id, type: item.type, dayIndex: item.dayIndex, order: item.order, title: item.title, time: item.time, note: item.note, visited: Boolean(item.visited), place: item.place ? { ...item.place } : null })), legacy: trip.legacy || {} });
  const toRow = (trip, ctx, mutationId = null) => ({
    id: trip.id, household_id: ctx.household, title: trip.title, destination_label: trip.destinationLabel || trip.destination, center_lat: trip.centerLat, center_lng: trip.centerLng,
    timezone: trip.timezone || 'Asia/Seoul', start_date: trip.startDate, end_date: trip.endDate, document: toDocument(trip), archived_at: trip.archivedAt || null,
    revision: Number(trip.revision) || 0, last_mutation_id: mutationId, created_by: trip.createdBy || ctx.user, updated_by: ctx.user,
  });
  const fromRow = row => ({ id: row.id, householdId: row.household_id, title: row.title, destinationLabel: row.destination_label, centerLat: row.center_lat, centerLng: row.center_lng, timezone: row.timezone, startDate: row.start_date, endDate: row.end_date, document: row.document || { schemaVersion: 2, items: [], legacy: {} }, archivedAt: row.archived_at, revision: row.revision, updatedBy: row.updated_by, updatedAt: row.updated_at, createdAt: row.created_at });
  const sameRow = (previous, row) => ['title','destination_label','center_lat','center_lng','timezone','start_date','end_date','archived_at'].every(key => (previous[key] ?? null) === (row[key] ?? null)) && JSON.stringify(previous.document || {}) === JSON.stringify(row.document || {});
  const subscribe = ctx => {
    if (channel) { try { ctx.client.removeChannel(channel); } catch { /* stale realtime channel */ } channel = null; }
    channel = ctx.client.channel(`family-trips:${ctx.household}`).on('postgres_changes', { event: '*', schema: 'public', table: 'family_trips', filter: `household_id=eq.${ctx.household}` }, payload => {
      if (payload.eventType === 'DELETE') rows.delete(payload.old?.id);
      else if (payload.new?.id) rows.set(payload.new.id, payload.new);
      window.dispatchEvent(new CustomEvent('family:travel-remote-change', { detail: payload }));
    }).subscribe();
  };
  const load = async () => {
    const ctx = context(); status = 'loading';
    try {
      const result = await ctx.client.from('family_trips').select('id,household_id,title,destination_label,center_lat,center_lng,timezone,start_date,end_date,document,archived_at,revision,last_mutation_id,updated_by,created_by,created_at,updated_at').eq('household_id', ctx.household);
      assertCurrent(ctx); const data = resultData(result) || []; rows = new Map(data.map(row => [row.id, row])); loadedScope = ctx.key; status = 'shared'; message = ''; subscribe(ctx);
      return data.map(fromRow);
    } catch (error) { if (ctx.key === scope()) { status = 'error'; message = error.message; } throw error; }
  };
  const save = async (trips, options = {}) => {
    const ctx = context();
    if (loadedScope !== ctx.key || status !== 'shared') throw new Error('먼저 가족 여행을 새로고침해 공유 상태를 확인해 주세요.');
    if (busy) throw new Error('저장 중이에요. 잠시 뒤 다시 시도해 주세요.');
    busy = true;
    try {
      const table = ctx.client.from('family_trips');
      const mutationId = options.mutationId || null;
      for (const trip of trips) {
        const previous = rows.get(trip.id);
        const row = toRow(trip, ctx, mutationId);
        if (!previous) {
          const inserted = await table.insert(row).select('id,revision,updated_at').single();
          assertCurrent(ctx); const saved = resultData(inserted); rows.set(trip.id, { ...row, ...saved }); continue;
        }
        if (sameRow(previous, row)) continue;
        const expected = Number(previous.revision ?? trip.revision ?? 0);
        if (mutationId && previous.last_mutation_id === mutationId) continue;
        const updated = await table.update({ title: row.title, destination_label: row.destination_label, center_lat: row.center_lat, center_lng: row.center_lng, timezone: row.timezone, start_date: row.start_date, end_date: row.end_date, document: row.document, archived_at: row.archived_at, updated_by: ctx.user, last_mutation_id: mutationId, revision: expected + 1 }).eq('id', trip.id).eq('household_id', ctx.household).eq('revision', expected).select('id,revision,updated_at,last_mutation_id').maybeSingle();
        assertCurrent(ctx);
        if (updated.error) throw new Error(updated.error.message || '가족 여행을 저장하지 못했어요.');
        if (!updated.data) { status = 'conflict'; message = '가족이 먼저 수정했어요. 최신 내용을 불러온 뒤 내 초안을 다시 적용해 주세요.'; throw new Error(message); }
        rows.set(trip.id, { ...row, ...updated.data });
      }
      return true;
    } finally { busy = false; }
  };
  const reset = () => { generation++; if (channel) { try { state()?.supabase?.removeChannel(channel); } catch { /* stale realtime channel */ } channel = null; } loadedScope = ''; rows = new Map(); status = enabled() ? 'loading' : 'local'; message = ''; busy = false; };
  window.addEventListener('familycontextchange', reset);
  window.FAMILY_TRAVEL_SHARING = Object.freeze({ enabled, scope, load, save, reset, getStatus: () => ({ status, message, busy }), userId: () => state()?.session?.user?.id, getOpinions: () => [] });
})();
