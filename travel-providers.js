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
    if (['google-flights', 'skyscanner', 'kayak', 'hotelscombined', 'google-hotels', 'booking', 'agoda'].includes(catalog.id)) return catalog.url;
    const query = [kind === 'flight' ? '항공권' : '숙소', origin, destination, startDate, endDate, `${adults}명`, children ? `아동 ${children}명` : '', infants ? `유아 ${infants}명` : '', kind === 'stay' ? `${rooms}객실` : ''].filter(Boolean).join(' ');
    return `${catalog.url}${encodeURIComponent(query)}`;
  };
  const mapsUrl = place => {
    const query = [place?.place, place?.address].filter(Boolean).join(', ');
    return query ? `${GOOGLE_MAPS_SEARCH}${encodeURIComponent(query)}` : '';
  };
  const capabilities = Object.freeze({ flights: 'external', stays: 'external', map: 'preview', routing: 'external' });
  window.FAMILY_TRAVEL_PROVIDERS = Object.freeze({ providerCatalog, capabilities, safeExternalUrl, searchUrl, mapsUrl });
})();
