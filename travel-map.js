(() => {
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  const coordinates = item => item?.place?.lat != null && item?.place?.lng != null ? [item.place.lat, item.place.lng] : [item?.latitude, item?.longitude];
  const placePoints = items => (items || []).filter(item => { const [lat, lng] = coordinates(item); return lat != null && lat !== '' && lng != null && lng !== '' && Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90 && Number.isFinite(Number(lng)) && Math.abs(Number(lng)) <= 180; });
  const project = (items, width = 720, height = 240) => {
    const points = placePoints(items); if (!points.length) return [];
    const values = points.map(item => coordinates(item));
    const lats = values.map(value => Number(value[0])), lngs = values.map(value => Number(value[1]));
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const latSpan = Math.max(maxLat - minLat, .01), lngSpan = Math.max(maxLng - minLng, .01);
    return points.map((item, index) => { const [lat, lng] = coordinates(item); return { item, index: items.indexOf(item), x: 44 + ((Number(lng) - minLng) / lngSpan) * (width - 88), y: 42 + ((maxLat - Number(lat)) / latSpan) * (height - 82) }; });
  };
  const render = ({ items = [], activeId = '', grouped = false } = {}) => {
    const points = project(items);
    if (!points.length) return `<div class="travel-map-empty"><span aria-hidden="true">⌖</span><strong>위치가 있는 장소를 추가하면 지도에 보여요</strong><small>검색 결과를 선택하면 위치가 저장돼요. 위치가 없는 기록은 메모로 남길 수 있어요.</small></div>`;
    const groups = grouped ? [...new Map(points.map(point => [point.item.dayIndex ?? 'inbox', true])).keys()].map(day => points.filter(point => (point.item.dayIndex ?? 'inbox') === day)) : [points];
    const paths = groups.filter(group => group.length > 1).map(group => { const line = group.map(point => `${point.x},${point.y}`).join(' '); return `<path class="travel-map-route" d="M ${line.replaceAll(' ', ' L ')}" />`; }).join('');
    const allItemsHaveDay = points.some(point => point.item.dayIndex != null);
    return `<div class="travel-map-canvas" role="img" aria-label="선택한 날짜의 방문 순서 지도"><svg viewBox="0 0 720 240" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="travelRouteGradient" x1="0" x2="1"><stop offset="0" stop-color="var(--nova-accent)"/><stop offset="1" stop-color="var(--nova-accent-deep)"/></linearGradient></defs>${paths}</svg><div class="travel-map-labels">${points.map((point, index) => { const number = !allItemsHaveDay || point.item.dayIndex == null ? point.index + 1 : points.filter(candidate => candidate.item.dayIndex === point.item.dayIndex && candidate.index <= point.index).length; return `<button type="button" class="travel-map-pin${point.item.id === activeId ? ' active' : ''}" style="left:${(point.x / 720) * 100}%;top:${(point.y / 240) * 100}%" data-map-item="${esc(point.item.id)}" aria-label="${number}번 ${esc(point.item.title)}"><b>${number}</b><span>${esc(point.item.place?.name || point.item.placeName || point.item.title)}</span></button>`; }).join('')}</div><small class="travel-map-caption">방문 순서 · 실제 이동 경로 아님</small></div>`;
  };
  window.FAMILY_TRAVEL_MAP = Object.freeze({ render, placePoints, project });
})();
