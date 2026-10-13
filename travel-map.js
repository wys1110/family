(() => {
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  const coordinates = item => [item?.place?.lat, item?.place?.lng];
  const placePoints = items => (items || []).filter(item => { const [lat, lng] = coordinates(item); return lat != null && lat !== '' && lng != null && lng !== '' && Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90 && Number.isFinite(Number(lng)) && Math.abs(Number(lng)) <= 180; });
  // ponytail: at most 500 places; precompute day numbers if that limit grows.
  const number = (items, item) => items.slice(0, items.indexOf(item) + 1).filter(entry => entry.dayIndex === item.dayIndex).length;
  const day = item => item.dayIndex == null ? '보관함' : `DAY ${item.dayIndex + 1}`;
  const selectedMarkup = (items, activeId, kind) => {
    const selected = placePoints(items).find(item => item.id === activeId);
    if (kind === 'history') return selected ? `<strong>${esc(selected.title)} · ${esc(selected.visits)}회 방문 · ${esc(selected.nights || 0)}박</strong>${selected.records.map(record => `<span>${esc(record.title)}<small>${esc(record.startDate)} – ${esc(record.endDate)}</small></span>`).join('')}` : '여행지 핀을 누르면 다녀온 여행과 날짜를 볼 수 있어요.';
    return selected ? `<strong>${esc(day(selected))} · ${number(items, selected)}번 · ${esc(selected.title)}</strong><span>${esc(selected.place.address || '주소 미지정')}</span>` : '지도 핀이나 장소 번호를 누르면 기록과 함께 확인할 수 있어요.';
  };
  const render = ({ items = [], activeId = '', kind = 'itinerary' } = {}) => `<div class="travel-map-wrap"><div class="travel-map-canvas"><div class="travel-kakao-map" role="region" aria-label="${kind === 'history' ? '다녀온 여행지 지도' : '여행 장소 지도'}"></div><div class="travel-map-zoom" aria-label="지도 확대 및 축소"><button type="button" data-travel-map-zoom="in" aria-label="지도 확대">+</button><button type="button" data-travel-map-zoom="out" aria-label="지도 축소">−</button></div></div><p class="travel-map-status" role="status" hidden></p><p class="travel-map-note">${kind === 'history' ? '지난 여행 · 저장된 여행지 또는 일정 장소 위치 기준' : `방문 순서 · 실제 이동 경로 아님${placePoints(items).length ? '' : ' · 위치가 있는 장소를 추가하면 핀이 표시돼요.'}`}</p><div class="travel-map-selected" aria-live="polite">${selectedMarkup(items, activeId, kind)}</div></div>`;
  let library;
  const load = () => {
    const key = window.FAMILY_CONFIG?.kakaoJavaScriptKey;
    if (!key || key === '__KAKAO_JAVASCRIPT_KEY__') return Promise.reject(new Error('지도 연결 설정을 마쳐야 해요. 일정은 계속 사용할 수 있어요.'));
    if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao.maps);
    if (library) return library;
    library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true; clearTimeout(timeout); script.onload = script.onerror = null; script.remove(); library = null;
        reject(new Error('카카오 지도를 불러오지 못했어요. 일정은 계속 사용할 수 있어요.'));
      };
      const timeout = setTimeout(fail, 15000);
      script.onerror = fail;
      script.onload = () => {
        if (settled) return;
        if (!window.kakao?.maps?.load) { fail(); return; }
        try { window.kakao.maps.load(() => {
          if (settled) return;
          if (!window.kakao.maps.Map) { fail(); return; }
          settled = true; clearTimeout(timeout); script.onload = script.onerror = null; resolve(window.kakao.maps);
        }); } catch { fail(); }
      };
      document.head.append(script);
    });
    return library;
  };
  const create = () => {
    let instance, container, overlays = [], buttons = [], observer, wheel, resizeFit, zoomButtons = [], signature = '', request = 0;
    const clear = () => {
      overlays.forEach(overlay => overlay.setMap(null)); overlays = [];
      buttons.forEach(({ button, click }) => button.removeEventListener('click', click)); buttons = [];
    };
    const release = () => { if (wheel && container) container.removeEventListener('wheel', wheel, true); wheel = null; resizeFit = null; clear(); zoomButtons.forEach(({ button, click }) => button.removeEventListener('click', click)); zoomButtons = []; observer?.disconnect(); observer = null; container?.replaceChildren(); instance = null; container = null; signature = ''; };
    const destroy = () => { request++; release(); };
    const mount = async (root, { items = [], activeId = '', grouped = false, scope = '', center = null, onSelect, focus = false, kind = 'itinerary' } = {}) => {
      const node = root?.querySelector('.travel-kakao-map');
      if (!node || !node.isConnected) return;
      const status = root.querySelector('.travel-map-status');
      const epoch = ++request;
      let maps;
      try { maps = await load(); } catch (error) {
        if (epoch === request && node.isConnected && status) {
          status.hidden = false;
          status.innerHTML = `${esc(error.message)} <button type="button" class="travel-secondary-button small" data-travel-map-retry>다시 불러오기</button>`;
        }
        return;
      }
      if (epoch !== request || !node.isConnected) return;
      try {
        const position = item => new maps.LatLng(...coordinates(item).map(Number));
        if (node !== container) {
          release(); container = node;
          instance = new maps.Map(node, { center:new maps.LatLng(37.5665,126.978), level:8 });
          wheel = event => event.stopPropagation();
          node.addEventListener('wheel', wheel, { capture:true, passive:true });
          if (window.ResizeObserver) {
            observer = new window.ResizeObserver(() => { if (node.isConnected && node === container) { instance.relayout(); resizeFit?.(); } });
            observer.observe(node);
          }
        }
        if (status) status.hidden = true;
        zoomButtons.forEach(({ button, click }) => button.removeEventListener('click', click));
        zoomButtons = [...root.querySelectorAll('[data-travel-map-zoom]')].map(button => {
          const click = () => { maps.event.preventMap(); instance.setLevel(instance.getLevel() + (button.dataset.travelMapZoom === 'in' ? -1 : 1)); };
          button.addEventListener('click', click); return { button, click };
        });
        clear();
        const points = placePoints(items);
        const accent = window.getComputedStyle(node).getPropertyValue('--nova-accent').trim();
        for (const group of kind === 'history' ? [] : [...new Set(points.map(item => item.dayIndex))]) {
          if (group == null) continue;
          const entries = points.filter(item => item.dayIndex === group);
          if (entries.length > 1) overlays.push(new maps.Polyline({ map:instance, path:entries.map(position), strokeColor:accent, strokeWeight:3, strokeOpacity:.75 }));
        }
        for (const item of points) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = kind === 'history' ? 'travel-history-marker' : 'travel-map-marker';
          button.setAttribute('aria-label', kind === 'history' ? `${item.title} · ${item.visits}회 방문` : `${day(item)} ${number(items, item)}번 ${item.title}`);
          button.innerHTML = kind === 'history' ? `<span class="travel-history-dot${item.id === activeId ? ' active' : ''}" aria-hidden="true"></span>` : `<span class="travel-map-pin${item.id === activeId ? ' active' : ''}" aria-hidden="true"><b>${number(items, item)}</b>${grouped ? `<span>${item.dayIndex == null ? '미정' : `D${item.dayIndex + 1}`}</span>` : ''}</span>`;
          const click = () => { maps.event.preventMap(); onSelect?.(item.id); };
          button.addEventListener('click', click); buttons.push({ button, click });
          overlays.push(new maps.CustomOverlay({ map:instance, position:position(item), content:button, clickable:true, xAnchor:.5, yAnchor:.5, zIndex:item.id === activeId ? 2 : 1 }));
        }
        root.querySelector('.travel-map-selected').innerHTML = selectedMarkup(items, activeId, kind);
        const nextSignature = JSON.stringify([scope, points.map(item => [item.id, item.dayIndex, ...coordinates(item)]), center]);
        const fit = () => {
          const bounds = new maps.LatLngBounds(); points.forEach(item => bounds.extend(position(item)));
          instance.setBounds(bounds,30,30,30,30);
          // Kakao levels increase while zooming out; avoid an excessive close-up of one point.
          const minimumLevel = kind === 'history' ? 8 : 3;
          if (instance.getLevel() < minimumLevel) instance.setLevel(minimumLevel);
        };
        resizeFit = kind === 'history' && points.length ? fit : null;
        instance.relayout();
        if (nextSignature !== signature) {
          signature = nextSignature;
          if (points.length) fit();
          else {
            const validCenter = placePoints([{place:{lat:center?.[0],lng:center?.[1]}}]).length;
            instance.setCenter(validCenter ? new maps.LatLng(...center.map(Number)) : new maps.LatLng(37.5665,126.978));
            instance.setLevel(8);
          }
        }
        const selected = points.find(item => item.id === activeId);
        if (focus && selected) instance.panTo(position(selected));
      } catch {
        release();
        if (epoch === request && node.isConnected && status) {
          status.hidden = false;
          status.innerHTML = '카카오 지도를 표시하지 못했어요. 일정은 계속 사용할 수 있어요. <button type="button" class="travel-secondary-button small" data-travel-map-retry>다시 불러오기</button>';
        }
      }
    };
    return Object.freeze({ render, mount, destroy, placePoints });
  };
  window.FAMILY_TRAVEL_MAP = Object.freeze({ create, placePoints });
})();
