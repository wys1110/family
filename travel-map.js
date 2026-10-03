(() => {
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  const coordinates = item => [item?.place?.lat, item?.place?.lng];
  const placePoints = items => (items || []).filter(item => { const [lat, lng] = coordinates(item); return lat != null && lat !== '' && lng != null && lng !== '' && Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90 && Number.isFinite(Number(lng)) && Math.abs(Number(lng)) <= 180; });
  // ponytail: at most 500 places; precompute day numbers if that limit grows.
  const number = (items, item) => items.slice(0, items.indexOf(item) + 1).filter(entry => entry.dayIndex === item.dayIndex).length;
  const day = item => item.dayIndex == null ? '보관함' : `DAY ${item.dayIndex + 1}`;
  const selectedMarkup = (items, activeId, kind) => {
    const selected = placePoints(items).find(item => item.id === activeId);
    if (kind === 'history') return selected ? `<strong>${esc(selected.title)} · ${selected.visits}회 방문 · ${selected.nights || 0}박</strong>${selected.records.map(record => `<span>${esc(record.title)}<small>${esc(record.startDate)} – ${esc(record.endDate)}</small></span>`).join('')}` : '여행지 핀을 누르면 다녀온 여행과 날짜를 볼 수 있어요.';
    return selected ? `<strong>${esc(day(selected))} · ${number(items, selected)}번 · ${esc(selected.title)}</strong><span>${esc(selected.place.address || '주소 미지정')}</span>` : '지도 핀이나 장소 번호를 누르면 기록과 함께 확인할 수 있어요.';
  };
  const render = ({ items = [], activeId = '', kind = 'itinerary' } = {}) => `<div class="travel-map-wrap"><div class="travel-map-canvas"><div class="travel-leaflet-map" role="region" aria-label="${kind === 'history' ? '다녀온 여행지 지도' : '여행 장소 지도'}"></div></div><p class="travel-map-status" role="status" hidden></p><p class="travel-map-note">${kind === 'history' ? '지난 여행 · 저장된 여행지 또는 일정 장소 위치 기준' : `방문 순서 · 실제 이동 경로 아님${placePoints(items).length ? '' : ' · 위치가 있는 장소를 추가하면 핀이 표시돼요.'}`}</p><div class="travel-map-selected" aria-live="polite">${selectedMarkup(items, activeId, kind)}</div></div>`;
  let library;
  const load = () => {
    if (library) return library;
    if (window.L) return Promise.resolve(window.L);
    library = new Promise((resolve, reject) => {
      const style = document.createElement('link');
      style.rel = 'stylesheet'; style.href = 'assets/vendor/leaflet-1.9.4/leaflet.css';
      const script = document.createElement('script');
      script.src = 'assets/vendor/leaflet-1.9.4/leaflet.js';
      const timeout = setTimeout(() => fail(), 15000);
      const fail = () => { clearTimeout(timeout); script.onload = script.onerror = style.onload = style.onerror = null; script.remove(); style.remove(); window.L = undefined; library = null; reject(new Error('지도 라이브러리를 불러오지 못했어요.')); };
      let scriptReady = false, styleReady = false;
      const ready = () => { if (scriptReady && styleReady) { clearTimeout(timeout); resolve(window.L); } };
      script.onload = () => { scriptReady = true; ready(); }; script.onerror = fail;
      style.onload = () => { styleReady = true; ready(); }; style.onerror = fail;
      document.head.append(style, script);
    });
    return library;
  };
  const create = () => {
    let instance, container, currentRoot, layers, tiles, signature = '', request = 0, tileFailed = false, historyBounds = [];
    const fitHistory = () => { if(historyBounds.length)instance.fitBounds(historyBounds,{padding:[30,30],maxZoom:10,animate:false}); };
    const destroy = () => { request++; instance?.remove(); instance = null; container = null; currentRoot = null; layers = null; tiles = null; signature = ''; tileFailed = false; historyBounds = []; };
    const mount = async (root, { items = [], activeId = '', grouped = false, scope = '', center = null, onSelect, retry = false, focus = false, kind = 'itinerary' } = {}) => {
      const node = root?.querySelector('.travel-leaflet-map');
      if (!node || !node.isConnected) return;
      currentRoot = root;
      const status = root.querySelector('.travel-map-status');
      const failure = message => { const status = currentRoot?.querySelector('.travel-map-status'); if (!status) return; status.hidden = false; status.innerHTML = `${esc(message)} <button type="button" class="travel-secondary-button small" data-travel-map-retry>다시 불러오기</button>`; };
      const epoch = ++request;
      let L;
      try { L = await load(); } catch { if (epoch === request && node.isConnected) failure('지도를 불러오지 못했어요. 일정은 계속 사용할 수 있어요.'); return; }
      if (epoch !== request || !node.isConnected) return;
      if (node !== container) {
        instance?.remove(); container = node; signature = ''; tileFailed = false;
        instance = L.map(node, { scrollWheelZoom:false });
        instance.on('resize', () => { if(kind === 'history')fitHistory(); });
        // Standard OSM tiles: on-demand only, browser cache/referrer defaults; never prefetch.
        tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(instance);
        tiles.on('tileerror', () => { tileFailed = true; failure('지도 배경을 불러오지 못했어요.'); });
        layers = L.layerGroup().addTo(instance);
      }
      if (retry) { tileFailed = false; status.hidden = true; tiles.redraw(); }
      if (tileFailed) failure('지도 배경을 불러오지 못했어요.');
      else status.hidden = true;
      layers.clearLayers();
      const points = placePoints(items);
      historyBounds = kind === 'history' ? points.map(coordinates) : [];
      const accent = window.getComputedStyle(node).getPropertyValue('--nova-accent').trim();
      const groups = [...new Set(points.map(item => item.dayIndex))];
      for (const group of kind === 'history' ? [] : groups) {
        if (group == null) continue;
        const entries = points.filter(item => item.dayIndex === group);
        if (entries.length > 1) L.polyline(entries.map(coordinates), { color:accent, weight:3, opacity:.75 }).addTo(layers);
      }
      for (const item of points) {
        const label = kind === 'history' ? `${item.title} · ${item.visits}회 방문` : `${day(item)} ${number(items, item)}번 ${item.title}`;
        const icon = kind === 'history' ? L.divIcon({ className:'travel-history-marker', iconSize:[44,44], iconAnchor:[22,22], html:`<span class="travel-history-dot${item.id === activeId ? ' active' : ''}" aria-hidden="true"></span>` }) : L.divIcon({ className:'travel-map-marker', iconSize:[44,44], iconAnchor:[22,22], html:`<span class="travel-map-pin${item.id === activeId ? ' active' : ''}"><b>${number(items, item)}</b>${grouped ? `<span>${item.dayIndex == null ? '미정' : `D${item.dayIndex + 1}`}</span>` : ''}</span>` });
        const marker = L.marker(coordinates(item), { icon, title:kind === 'history' ? '' : label, keyboard:true }).addTo(layers);
        const labelMarker = () => marker.getElement?.()?.setAttribute('aria-label', label);
        marker.on('add', labelMarker);
        labelMarker();
        marker.on('click', () => onSelect?.(item.id));
      }
      root.querySelector('.travel-map-selected').innerHTML = selectedMarkup(items, activeId, kind);
      const nextSignature = JSON.stringify([scope, points.map(item => [item.id, item.dayIndex, ...coordinates(item)]), center]);
      instance.invalidateSize({ pan:false });
      if (nextSignature !== signature) {
        signature = nextSignature;
        if (points.length) { if(kind === 'history')fitHistory(); else instance.fitBounds(points.map(coordinates), { padding:[30,30], maxZoom:15, animate:false }); }
        else instance.setView(center && center.every(value => value != null && Number.isFinite(value)) ? center : [37.5665,126.978], 10);
      }
      const selected = points.find(item => item.id === activeId);
      if (focus && selected) instance.panTo(coordinates(selected), { animate:false });
    };
    return Object.freeze({ render, mount, destroy, placePoints });
  };
  window.FAMILY_TRAVEL_MAP = Object.freeze({ create, placePoints });
})();
