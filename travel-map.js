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
    return points.map(item => { const [lat, lng] = coordinates(item); return { item, index: items.indexOf(item), x: lngSpan <= .01 ? width / 2 : ((Number(lng) - minLng) / lngSpan) * width, y: latSpan <= .01 ? height / 2 : ((maxLat - Number(lat)) / latSpan) * height }; });
  };
  const render = ({ items = [], activeId = '', grouped = false } = {}) => {
    const points = project(items);
    if (!points.length) return `<div class="travel-map-empty"><span aria-hidden="true">⌖</span><strong>위치가 있는 장소를 추가하면 지도에 보여요</strong><small>검색 결과를 선택하면 위치가 저장돼요. 위치가 없는 기록은 메모로 남길 수 있어요.</small></div>`;
    const groups = grouped ? [...new Map(points.map(point => [point.item.dayIndex ?? 'inbox', true])).keys()].map(day => points.filter(point => (point.item.dayIndex ?? 'inbox') === day)) : [points];
    const paths = groups.filter(group => group.length > 1).map(group => { const line = group.map(point => `${point.x},${point.y}`).join(' '); return `<path class="travel-map-route" d="M ${line.replaceAll(' ', ' L ')}" />`; }).join('');
    const selected = points.find(point => point.item.id === activeId) || points[0];
    const selectedNumber = selected ? (grouped ? items.slice(0, selected.index + 1).filter(item => item.dayIndex === selected.item.dayIndex).length : selected.index + 1) : 0;
    const selectedDay = selected?.item.dayIndex == null ? '보관함' : `DAY ${selected.item.dayIndex + 1}`;
    return `<div class="travel-map-wrap"><div class="travel-map-canvas" aria-label="장소 방문 순서 지도"><div class="travel-map-plot"><svg viewBox="0 0 720 240" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="travelRouteGradient" x1="0" x2="1"><stop offset="0" stop-color="var(--nova-accent)"/><stop offset="1" stop-color="var(--nova-accent-deep)"/></linearGradient></defs>${paths}</svg><div class="travel-map-labels">${points.map(point => { const number = grouped ? items.slice(0, point.index + 1).filter(item => item.dayIndex === point.item.dayIndex).length : point.index + 1; const day = point.item.dayIndex == null ? '보관함' : `DAY ${point.item.dayIndex + 1}`; return `<button type="button" class="travel-map-pin${point.item.id === activeId ? ' active' : ''}" style="left:${(point.x / 720) * 100}%;top:${(point.y / 240) * 100}%" data-map-item="${esc(point.item.id)}" aria-label="${day} ${number}번 ${esc(point.item.title)}"><b>${number}</b>${grouped?`<span>${point.item.dayIndex == null ? '미정' : `D${point.item.dayIndex + 1}`}</span>`:''}</button>`; }).join('')}</div></div><small class="travel-map-caption">방문 순서 · 실제 이동 경로 아님</small></div>${selected?`<p class="travel-map-selected" aria-live="polite"><strong>${esc(selectedDay)} · ${selectedNumber}번 · ${esc(selected.item.title)}</strong><span>${esc(selected.item.place?.address || selected.item.address || '주소 미지정')}</span></p>`:'<p class="travel-map-selected">장소를 선택하면 이름과 주소가 여기에 표시돼요.</p>'}</div>`;
  };
  window.FAMILY_TRAVEL_MAP = Object.freeze({ render, placePoints, project });
})();
