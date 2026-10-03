(() => {
  const data = window.FAMILY_TRAVEL_DATA;
  if (!data) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const filters = [['all','전체'],['upcoming','예정'],['ongoing','진행 중'],['past','지난 여행'],['archived','보관']];
  const labels = { upcoming:'예정', ongoing:'진행 중', past:'지난 여행', archived:'보관됨', unknown:'날짜 확인 필요' };
  const status = (trip, now) => {
    if (trip.archivedAt) return 'archived';
    const summary = data.summarizeTrips([trip], now);
    return summary.ongoingTrips ? 'ongoing' : summary.upcomingTrips ? 'upcoming' : summary.pastTrips ? 'past' : 'unknown';
  };
  const selectTrips = (trips, {query='', filter='all', now=new Date()}={}) => {
    const needle = query.trim().toLocaleLowerCase('ko-KR');
    const rank = {ongoing:0, upcoming:1, past:2, unknown:3, archived:4};
    return trips.map(trip => ({trip, state:status(trip, now)}))
      .filter(({trip,state}) => (filter === 'all' ? state !== 'archived' : state === filter) && `${trip.title ?? ''} ${trip.destinationLabel ?? ''}`.toLocaleLowerCase('ko-KR').includes(needle))
      .sort((a,b) => rank[a.state]-rank[b.state] || (a.state === 'past' || a.state === 'archived' ? String(b.trip.startDate).localeCompare(String(a.trip.startDate)) : String(a.trip.startDate).localeCompare(String(b.trip.startDate))) || String(a.trip.title).localeCompare(String(b.trip.title),'ko'))
      .map(({trip}) => trip);
  };
  const renderResults = (trips, options={}) => {
    const selected = selectTrips(trips, options);
    const now = options.now ?? new Date();
    const cards = selected.map(trip => {
      const state = status(trip, now);
      return `<article class="travel-catalog-card"><div class="travel-catalog-meta"><span class="travel-catalog-status" data-status="${state}">${labels[state]}</span><span>${trip.items?.length ?? 0}개 기록</span></div><h3>${esc(trip.title)}</h3><p>${esc(trip.destinationLabel || '여행지 미지정')}</p><p class="travel-catalog-dates">${esc(trip.startDate || '날짜 미정')} – ${esc(trip.endDate || '날짜 미정')}</p>${state === 'archived' ? `<button type="button" class="travel-secondary-button" data-travel-restore="${esc(trip.id)}" aria-label="${esc(trip.title)} 복원">복원하기</button>` : `<button type="button" class="travel-secondary-button" data-travel-open="${esc(trip.id)}" aria-label="${esc(trip.title)} 일정 열기">일정 열기 <span aria-hidden="true">→</span></button>`}</article>`;
    }).join('');
    const empty = options.query?.trim() ? '검색 결과가 없어요. 검색어나 필터를 바꿔 보세요.' : options.filter === 'archived' ? '보관한 여행이 없어요. 여행 상세에서 보관할 수 있어요.' : '이 상태의 여행이 없어요. 새 여행을 만들거나 다른 필터를 선택해 보세요.';
    return `<p class="travel-catalog-count" role="status">${selected.length}개 여행${options.filter === 'archived' ? ' · 복원하면 여행 목록에 다시 표시돼요.' : ''}</p><div class="travel-catalog-grid">${cards || `<p class="travel-catalog-empty">${empty}</p>`}</div>`;
  };
  const render = (trips, options={}) => `<section class="travel-management" aria-label="여행 관리 목록"><label class="travel-catalog-search">여행 찾기<input type="search" data-travel-query placeholder="여행 이름 또는 여행지" maxlength="120" value="${esc(options.query || '')}"></label><div class="travel-catalog-filters" role="group" aria-label="여행 상태">${filters.map(([value,label]) => `<button type="button" data-travel-filter="${value}" aria-pressed="${(options.filter || 'all') === value}">${label}</button>`).join('')}</div><div data-travel-results>${renderResults(trips, options)}</div></section>`;
  window.FAMILY_TRAVEL_MANAGEMENT = {selectTrips, render, renderResults};
})();
