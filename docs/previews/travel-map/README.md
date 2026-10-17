# Travel map preview status — 2026-10-17

The current provider is Kakao Maps Web JavaScript SDK. Load the JavaScript key from `FAMILY_CONFIG.kakaoMapsJavaScriptKey`; place search remains behind the authenticated Supabase function and its separate `KAKAO_REST_API_KEY` secret. See the [Kakao Maps Web API guide](https://apis.map.kakao.com/web/guide/).

The Family Kakao Developers app has these JavaScript origins configured: `https://wys1110.github.io`, `http://localhost:8774`, and `https://localhost` for Capacitor WebView. Origins have no path component. The map is for South Korea; overseas detailed coverage is limited and Japan support is not claimed. The JavaScript key and origins are configured; place search is also locally confirmed through the authenticated flow, with ten real Seoul cafe results returned.

Local browser verification of Kakao Maps: at 390px wide, nine map tiles loaded, all three numbered pin buttons were 44px tall, and the map had no horizontal overflow. Zooming from an approximately 500m to 250m view and selecting a place kept the 250m view, confirming selection preserves the user's current zoom. These are local checks only; public deployment is pending.

At 320px wide, local history-map verification loaded 18 Kakao tiles, kept all three pins within map bounds, and showed no horizontal overflow. Pressing Return selected the history detail. These are local checks only; public deployment and actual iOS/Android device checks remain pending. The earlier screenshots and checks in this preview document concerned the retired Leaflet/OpenStreetMap implementation and are not evidence for the current Kakao provider.
