(() => {
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  const coordinates = item => [item?.place?.lat, item?.place?.lng];
  const validCoordinates = ([lat, lng]) => lat != null && lat !== '' && lng != null && lng !== '' && Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90 && Number.isFinite(Number(lng)) && Math.abs(Number(lng)) <= 180;
  const placePoints = items => (items || []).filter(item => validCoordinates(coordinates(item)));
  // shortcut: at most 500 places; precompute day numbers if that limit grows.
  const number = (items, item) => items.slice(0, items.indexOf(item) + 1).filter(entry => entry.dayIndex === item.dayIndex).length;
  const day = item => item.dayIndex == null ? '보관함' : `DAY ${item.dayIndex + 1}`;
  const selectedMarkup = (items, activeId, kind) => {
    const selected = placePoints(items).find(item => item.id === activeId);
    if (kind === 'history') return selected ? `<strong>${esc(selected.title)} · ${selected.visits}회 방문 · ${selected.nights || 0}박</strong>${selected.records.map(record => `<span>${esc(record.title)}<small>${esc(record.startDate)} – ${esc(record.endDate)}</small></span>`).join('')}` : '여행지 핀을 누르면 다녀온 여행과 날짜를 볼 수 있어요.';
    return selected ? `<strong>${esc(day(selected))} · ${number(items, selected)}번 · ${esc(selected.title)}</strong><span>${esc(selected.place.address || '주소 미지정')}</span>` : '지도 핀이나 장소 번호를 누르면 기록과 함께 확인할 수 있어요.';
  };
  const render = ({ items = [], activeId = '', kind = 'itinerary' } = {}) => `<div class="travel-map-wrap"><div class="travel-map-canvas"><div class="travel-kakao-map" role="region" aria-label="${kind === 'history' ? '다녀온 여행지 지도' : '여행 장소 지도'}"></div><div class="travel-map-zoom" role="group" aria-label="지도 크기"><button type="button" aria-label="지도 확대" data-travel-map-zoom-in>＋</button><button type="button" aria-label="지도 축소" data-travel-map-zoom-out>−</button></div></div><p class="travel-map-status" role="status" hidden></p><p class="travel-map-note">${kind === 'history' ? '지난 여행 · 저장된 여행지 또는 일정 장소 위치 기준' : `방문 순서 · 실제 이동 경로 아님${placePoints(items).length ? '' : ' · 위치가 있는 장소를 추가하면 핀이 표시돼요.'}`} · 카카오맵 국내 상세지도 기준</p><div class="travel-map-selected" aria-live="polite">${selectedMarkup(items, activeId, kind)}</div></div>`;
  let library;
  const load = () => {
    if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao.maps);
    if (library) return library;
    const key = String(window.FAMILY_CONFIG?.kakaoMapsJavaScriptKey || '').trim();
    if (!key) return Promise.reject(new Error('카카오 지도 설정이 필요해요.'));
    library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true; clearTimeout(timeout); script.onload = script.onerror = null; script.remove(); library = null;
        reject(new Error('카카오 지도를 불러오지 못했어요.'));
      };
      const timeout = setTimeout(fail, 15000);
      script.onerror = fail;
      script.onload = () => {
        if (!window.kakao?.maps?.load) return fail();
        try {
          window.kakao.maps.load(() => {
            if (settled) return;
            if (!window.kakao.maps.Map) return fail();
            settled = true; clearTimeout(timeout); script.onload = script.onerror = null;
            resolve(window.kakao.maps);
          });
        } catch { fail(); }
      };
      document.head.append(script);
    });
    return library;
  };
  const create = () => {
    let maps, instance, container, currentRoot, observer, overlays = [], signature = '', request = 0, historyPositions = [];
    const latLng = coords => new maps.LatLng(Number(coords[0]), Number(coords[1]));
    const fit = (positions, minimumLevel) => {
      if (positions.length === 1) { instance.setCenter(positions[0]); instance.setLevel(minimumLevel); return; }
      const bounds = new maps.LatLngBounds();
      positions.forEach(position => bounds.extend(position));
      instance.setBounds(bounds, 30, 30, 30, 30);
      if (instance.getLevel() < minimumLevel) instance.setLevel(minimumLevel);
    };
    const clearOverlays = () => { overlays.forEach(overlay => overlay.setMap(null)); overlays = []; };
    const release = () => {
      observer?.disconnect(); observer = null; clearOverlays(); container?.replaceChildren();
      instance = null; container = null; signature = ''; historyPositions = [];
    };
    const destroy = () => { request++; release(); currentRoot = null; };
    const mount = async (root, { items = [], activeId = '', grouped = false, scope = '', center = null, onSelect, focus = false, kind = 'itinerary' } = {}) => {
      const node = root?.querySelector('.travel-kakao-map');
      if (!node || !node.isConnected) return;
      currentRoot = root;
      const failure = () => {
        const status = currentRoot?.querySelector('.travel-map-status');
        if (status) { status.hidden = false; status.innerHTML = '카카오 지도를 불러오지 못했어요. 일정은 계속 사용할 수 있어요. <button type="button" class="travel-secondary-button small" data-travel-map-retry>다시 불러오기</button>'; }
      };
      const epoch = ++request;
      try {
        maps = await load();
        if (epoch !== request || !node.isConnected) return;
        if (node !== container) {
          release(); container = node;
          instance = new maps.Map(node, { center: latLng([37.5665,126.978]), level: 8 });
          observer = new ResizeObserver(entries => {
            if (!instance || !entries[0]?.contentRect.width || !entries[0]?.contentRect.height) return;
            instance.relayout();
            if (historyPositions.length) fit(historyPositions, 7);
          });
          observer.observe(node);
        }
        root.querySelector('.travel-map-status').hidden = true;
        root.querySelector('[data-travel-map-zoom-in]').onclick = () => instance?.setLevel(Math.max(1, instance.getLevel() - 1));
        root.querySelector('[data-travel-map-zoom-out]').onclick = () => instance?.setLevel(Math.min(14, instance.getLevel() + 1));
        clearOverlays();
        const points = placePoints(items);
        const positions = points.map(item => latLng(coordinates(item)));
        historyPositions = kind === 'history' ? positions : [];
        const accent = window.getComputedStyle(node).getPropertyValue('--nova-accent').trim();
        for (const group of kind === 'history' ? [] : new Set(points.map(item => item.dayIndex))) {
          if (group == null) continue;
          const entries = points.filter(item => item.dayIndex === group);
          if (entries.length > 1) overlays.push(new maps.Polyline({ map: instance, path: entries.map(item => latLng(coordinates(item))), strokeColor: accent, strokeWeight: 3, strokeOpacity: .75 }));
        }
        for (let index = 0; index < points.length; index++) {
          const item = points[index];
          const button = document.createElement('button');
          button.type = 'button';
          button.className = kind === 'history' ? 'travel-history-marker' : 'travel-map-marker';
          button.setAttribute('aria-label', kind === 'history' ? `${item.title} · ${item.visits}회 방문` : `${day(item)} ${number(items, item)}번 ${item.title}`);
          button.innerHTML = kind === 'history' ? `<span class="travel-history-dot${item.id === activeId ? ' active' : ''}" aria-hidden="true"></span>` : `<span class="travel-map-pin${item.id === activeId ? ' active' : ''}" aria-hidden="true"><b>${number(items, item)}</b>${grouped ? `<span>${item.dayIndex == null ? '미정' : `D${item.dayIndex + 1}`}</span>` : ''}</span>`;
          button.addEventListener('click', () => onSelect?.(item.id));
          overlays.push(new maps.CustomOverlay({ map: instance, position: positions[index], content: button, xAnchor: .5, yAnchor: .5, zIndex: item.id === activeId ? 3 : 2 }));
        }
        root.querySelector('.travel-map-selected').innerHTML = selectedMarkup(items, activeId, kind);
        const nextSignature = JSON.stringify([scope, points.map(item => [item.id, item.dayIndex, ...coordinates(item)]), center]);
        instance.relayout();
        if (nextSignature !== signature) {
          signature = nextSignature;
          if (positions.length) fit(positions, kind === 'history' ? 7 : 3);
          else { instance.setCenter(latLng(validCoordinates(center || []) ? center : [37.5665,126.978])); instance.setLevel(8); }
        }
        const selectedIndex = points.findIndex(item => item.id === activeId);
        if (focus && selectedIndex !== -1) instance.panTo(positions[selectedIndex]);
      } catch {
        if (epoch === request && node.isConnected) { release(); failure(); }
      }
    };
    return Object.freeze({ render, mount, destroy, placePoints });
  };
  window.FAMILY_TRAVEL_MAP = Object.freeze({ create, placePoints });
})();
