(() => {
  const GOOGLE_MAPS_SEARCH = 'https://www.google.com/maps/search/?api=1&query=';
  const providerCatalog = Object.freeze({
    flight: [
      { id: 'google-flights', name: 'Google Flights', mode: 'external', url: 'https://www.google.com/travel/flights' },
      { id: 'skyscanner', name: 'Skyscanner', mode: 'external', url: 'https://www.skyscanner.co.kr/' },
      { id: 'kayak', name: 'KAYAK', mode: 'external', url: 'https://www.kayak.co.kr/flights' },
      { id: 'airline', name: '항공사 홈페이지', mode: 'external', url: 'https://www.google.com/search?q=' },
    ],
    stay: [
      { id: 'hotelscombined', name: 'HotelsCombined', mode: 'external', url: 'https://www.hotelscombined.co.kr/' },
      { id: 'google-hotels', name: 'Google Hotels', mode: 'external', url: 'https://www.google.com/travel/hotels' },
      { id: 'booking', name: 'Booking.com', mode: 'external', url: 'https://www.booking.com/' },
      { id: 'agoda', name: 'Agoda', mode: 'external', url: 'https://www.agoda.com/' },
      { id: 'hotel', name: '숙소 공식 홈페이지', mode: 'external', url: 'https://www.google.com/search?q=' },
    ],
  });
  const safeText = value => String(value || '').trim().slice(0, 160);
  const safeExternalUrl = value => {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  };
  const searchUrl = ({ kind, provider, origin, destination, startDate, endDate, adults = 2, children = 0, infants = 0, rooms = 1 }) => {
    const catalog = providerCatalog[kind]?.find(item => item.id === provider) || providerCatalog[kind]?.[0];
    if (!catalog) return '';

    const query = [kind === 'flight' ? '항공권' : '숙소', origin, destination, startDate, endDate, `${adults}명`, children ? `아동 ${children}명` : '', infants ? `유아 ${infants}명` : '', kind === 'stay' ? `${rooms}객실` : ''].filter(Boolean).join(' ');
    if (catalog.id === 'google-flights') return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
    if (catalog.id === 'google-hotels') return `https://www.google.com/travel/hotels?q=${encodeURIComponent(query)}`;
    if (['skyscanner','kayak','hotelscombined','booking','agoda'].includes(catalog.id)) return `https://www.google.com/search?q=${encodeURIComponent(`site:${new URL(catalog.url).hostname} ${query}`)}`;
    return `${catalog.url}${encodeURIComponent(query)}`;
  };
  const mapsUrl = place => {
    const query = [place?.place, place?.address].filter(Boolean).join(', ');
    return query ? `${GOOGLE_MAPS_SEARCH}${encodeURIComponent(query)}` : '';
  };
  // Editorial starting points, never live fares or availability.
  const recommend = ({ destination, origin = '서울', preference = 'family' }) => {
    destination = safeText(destination);
    origin = safeText(origin) || '서울';
    if (!destination) return [];
    const flightUrl = searchUrl({ kind: 'flight', provider: 'google-flights', origin, destination });
    const stayUrl = query => `https://www.google.com/travel/hotels?q=${encodeURIComponent(`${destination} ${query}`)}`;
    const flight = [
      { id: 'flight-comfort', kind: 'flight', title: `${origin} → ${destination} · 이동 편한 편`, detail: '직항 가능 여부와 낮 시간대 도착편부터 비교하세요. 유아 동반이라면 환승 횟수를 줄이는 조건을 먼저 권해요.', bookingUrl: flightUrl, provider: 'Google Flights', badge: '편의 우선', source: 'recommendation' },
      { id: 'flight-budget', kind: 'flight', title: `${destination} · 날짜별 요금 비교`, detail: '날짜가 자유롭다면 가격 달력부터 확인하세요. 위탁 수하물·좌석·유아 요금을 합친 총액으로 비교하는 조건이에요.', bookingUrl: flightUrl, provider: 'Google Flights', badge: '예산 우선', source: 'recommendation' },
    ];
    let stays = [
      { id: 'stay-central', kind: 'stay', title: `${destination} 중심지 숙소`, detail: '식당과 이동 수단에 접근하기 쉬운 위치를 먼저 찾는 조건이에요. 지도에서 실제 위치를 확인해 선택하세요.', bookingUrl: stayUrl('city center family hotel'), provider: 'Google Hotels', badge: '이동 편의', source: 'recommendation' },
      { id: 'stay-family', kind: 'stay', title: `${destination} 가족형 숙소`, detail: '가족 객실을 중심으로 찾아보세요. 아기 침대·세탁·취사 가능 여부는 숙소에 확인할 항목이에요.', bookingUrl: stayUrl('family apartment hotel'), provider: 'Google Hotels', badge: '가족 여행', source: 'recommendation' },
    ];
    if (/오키나와|okinawa|나하|naha/i.test(destination)) {
      if (/서울|인천|seoul|incheon/i.test(origin)) flight.unshift({ id: 'flight-korean-okinawa', kind: 'flight', title: '대한항공 · 서울 ↔ 오키나와', detail: '공식 노선 페이지가 있는 항공 후보예요. 실제 운항일·시간·유아 요금은 날짜를 선택해 확인하세요.', bookingUrl: 'https://www.koreanair.com/flights/en-kr/flights-from-seoul-to-okinawa', provider: '대한항공', badge: '공식 노선', source: 'recommendation', verifiedAt: '2026-09-21' });
      stays = [
        { id: 'stay-hyatt-naha', kind: 'stay', title: '하얏트 리젠시 나하 오키나와', detail: '나하 마키시 지역의 도심형 호텔. 시내에서 머물며 여행하고 싶을 때 검토할 후보예요.', bookingUrl: 'https://www.hyatt.com/hyatt-regency/en-US/okarn-hyatt-regency-naha-okinawa', provider: 'Hyatt 공식', badge: '도심형 후보', source: 'recommendation', verifiedAt: '2026-09-21' },
        { id: 'stay-oriental-okinawa', kind: 'stay', title: '오리엔탈 호텔 오키나와 리조트 & 스파', detail: '호텔에서 휴식하는 여행에 검토할 리조트 후보예요. 방문할 장소와의 거리, 객실·유아 편의시설을 확인하세요.', bookingUrl: 'https://www.okinawa.oriental-hotels.com/en/', provider: 'Oriental 공식', badge: '리조트형 후보', source: 'recommendation', verifiedAt: '2026-09-21' },
      ];
    }
    if (preference === 'budget') flight.sort((a,b) => Number(b.id === 'flight-budget') - Number(a.id === 'flight-budget'));
    if (preference === 'relax') stays.reverse();
    return [...flight, ...stays].map(item => ({ ...item, currency: 'KRW', amountMinor: null }));
  };
  const capabilities = Object.freeze({ flights: 'external', stays: 'external', map: 'preview', routing: 'external' });
  window.FAMILY_TRAVEL_PROVIDERS = Object.freeze({ providerCatalog, recommend, capabilities, safeExternalUrl, searchUrl, mapsUrl });
})();
