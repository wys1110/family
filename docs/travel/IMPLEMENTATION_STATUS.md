# 여행 탭 구현 상태

2026-09-23 기준으로 확정 설계의 여행 기록 플래너 V1을 vanilla JS/PWA 구조에 반영했다.

## 반영된 범위

- 여행 생성·수정·보관, 여행지 드롭다운과 직접 입력, 시작일·종료일
- 보관함 / 전체 / DAY별 탭과 모바일 가로 스크롤
- 장소 검색 결과 저장 훅, 검색 결과의 이름·주소·좌표·공급자 출처 보존
- 검색 키가 없는 환경에서도 장소 이름·주소를 기록하고 지도 핀 없이 보관
- 장소·메모 카드, 시간·메모, 방문 체크, 날짜 이동, 삭제 확인
- 날짜별 순서 변경(위·아래 버튼), 장소 번호와 지도 핀 동기화
- 지도 실패나 위치 없는 기록에서도 일정 목록과 메모 사용 가능
- 기존 로컬 여행의 `items`, `memories`, `legacy` 자료 보존 및 새 문서 형식으로 정규화
- `family_trips` 행 단위 저장 마이그레이션, 가족 소속 RLS, revision 조건부 저장과 충돌 거부
- Kakao Maps Web JavaScript SDK 지도와 핀 렌더링; JavaScript 키는 `FAMILY_CONFIG.kakaoMapsJavaScriptKey`에서 읽는다. 지도 제공자 대체 경로나 fallback은 없다.
- 장소 검색은 인증된 앱 흐름의 Supabase Edge Function이 Kakao REST API를 호출한다. REST 키는 서버의 `KAKAO_REST_API_KEY` secret으로만 설정한다.

## 운영 설정 전 확인할 항목

- `supabase/migrations/20260923000000_family_trips.sql` 적용과 운영 RLS 정책 확인
- Kakao JavaScript 앱 키와 다음 origin 설정 완료: `https://wys1110.github.io`, `http://localhost:8774`, `https://localhost` (Capacitor WebView). Origin에는 경로를 포함하지 않는다. 인증된 로컬 서울 카페 검색에서 실제 결과 10건을 확인했다.
- Kakao Maps Web SDK의 상세 지도 범위는 대한민국이며, 해외 상세 지도 및 일본 지원은 확인·보장하지 않는다.
- 로컬 UI 확인: 390px itinerary 지도와 320px history 지도. 공개 배포 및 실제 iOS/Android 기기 지도 터치·키보드·safe area 확인은 남아 있다.
- 두 가족 계정으로 동시 저장 충돌·재연결·가족 전환 시 초안 격리 확인

항공·숙소 상품 검색과 예약 완료 상태는 이 버전의 범위에 포함하지 않는다. 외부 지도 링크는 사용자가 확인할 수 있는 보조 경로로만 제공한다.
