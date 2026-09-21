(() => {
  const esc = value => String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const placePoints = items => items.filter(item => item.latitude != null && item.latitude !== '' && item.longitude != null && item.longitude !== '' && Number.isFinite(Number(item.latitude)) && Math.abs(Number(item.latitude)) <= 90 && Number.isFinite(Number(item.longitude)) && Math.abs(Number(item.longitude)) <= 180);
  const project = (items, width = 720, height = 240) => {
    const points = placePoints(items); if (!points.length) return [];
    const lats = points.map(item => Number(item.latitude)), lngs = points.map(item => Number(item.longitude));
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const latSpan = Math.max(maxLat - minLat, .01), lngSpan = Math.max(maxLng - minLng, .01);
    return points.map((item, index) => ({ item, index: items.indexOf(item), x: 44 + ((Number(item.longitude) - minLng) / lngSpan) * (width - 88), y: 42 + ((maxLat - Number(item.latitude)) / latSpan) * (height - 82) }));
  };
  const render = ({ items = [], activeId = '', onSelect = () => {} } = {}) => {
    const points = project(items);
    if (!points.length) return `<div class="travel-map-empty"><span aria-hidden="true">⌖</span><strong>장소를 추가하면 여기에서 동선을 볼 수 있어요</strong><small>좌표가 있는 장소는 동선도로, 주소·장소 이름은 Google Maps에서 확인할 수 있어요.</small></div>`;
    const line = points.map(point => `${point.x},${point.y}`).join(' ');
    return `<div class="travel-map-canvas" role="img" aria-label="선택한 날의 장소 동선 미리보기"><svg viewBox="0 0 720 240" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="travelRouteGradient" x1="0" x2="1"><stop offset="0" stop-color="var(--nova-accent)"/><stop offset="1" stop-color="var(--nova-accent-deep)"/></linearGradient></defs><path class="travel-map-route" d="${points.length > 1 ? `M ${line.replaceAll(' ', ' L ')}` : ''}" /></svg><div class="travel-map-labels">${points.map((point, index) => `<button type="button" class="travel-map-pin${point.item.id === activeId ? ' active' : ''}" style="left:${(point.x / 720) * 100}%;top:${(point.y / 240) * 100}%" data-map-item="${esc(point.item.id)}" aria-label="${point.index + 1}번 ${esc(point.item.title)}"><b>${point.index + 1}</b><span>${esc(point.item.place || point.item.title)}</span></button>`).join('')}</div><small class="travel-map-caption">장소 좌표를 잇는 동선도 · 실제 도로 지도는 Google Maps에서 확인</small></div>`;
  };
  window.FAMILY_TRAVEL_MAP = Object.freeze({ render, placePoints });
})();
