# 네온 3D 모션과 런타임 정리 설계

## 목표

가족 앱의 탭 전환과 주요 상호작용에 화려한 네온 3D 깊이 모션을 적용한다. 동시에 운영 경로에서 사용되지 않는 제품 파일과 오래된 로더 참조를 삭제해 새 모션 기반을 단순하게 유지한다.

## 범위

### 모션

- 상단 탭 전환은 탭 순서에 따라 좌우 방향이 바뀌는 3D 슬라이드로 표현한다.
- 나가는 화면은 뒤로 밀리며 회전하고, 들어오는 화면은 반대쪽 깊이에서 전면으로 이동한다.
- 주요 카드에는 한 번의 순차 진입 모션을 적용한다. 상시 반복하지 않는다.
- 바텀시트와 대화상자는 아래에서 상승하면서 배경 깊이가 변한다.
- 저장 성공 표시는 체크 아이콘 확대와 짧은 네온 광택으로 피드백한다.
- 플로팅 버튼은 화면 진입 시 한 번 등장하고, 눌렀을 때 짧게 반응한다.

### 테마

- 다크 모드는 보라·하늘·분홍 계열의 네온 광택과 깊은 그림자를 사용한다.
- 화이트 모드는 같은 색상 계열을 저채도 광택과 옅은 그림자로 바꿔 가독성을 유지한다.
- 모션은 색상 토큰을 사용하며 기능별 색상을 직접 하드코딩하지 않는다.

### 런타임 정리

운영 로더에서 도달할 수 없는 다음 제품 파일을 삭제한다. 과거 구현은 Git 이력으로 복구할 수 있다.

- `ghibli-theme.js`, `ghibli-theme.css`
- `storybook-theme.js`, `storybook-theme.css`
- `private-space.js`, `private-space.css`
- `growth-date-time-alignment.css`
- `growth-dialog-simple.css`
- `growth-history-edit.js`, `growth-history-edit.css`
- `growth-when-polish.css`

함께 정리할 오래된 참조:

- `config.js`의 비활성 `growth-history-edit` 항목
- `config.js`에서 존재하지 않는 `family-permissions.css` 요청
- `service-worker.js`의 존재하지 않는 `language-practice.js/css` 예외

Supabase의 적용 이력인 `supabase/migrations/20260716_private_space.sql`은 삭제하지 않는다.

## 구조

새 `motion-system.js`와 `motion-system.css`가 모션 규칙을 한 곳에서 소유한다. `app.js`의 기존 `switchView`가 화면 변경을 수행할 때 이 모듈의 좁은 인터페이스를 호출한다. 다른 탭 모듈은 모션 구현이나 DOM 스냅샷을 알지 않는다.

지원 브라우저에서는 `document.startViewTransition()`으로 이전·다음 화면 스냅샷을 전환한다. 지원하지 않는 브라우저에서는 Web Animations API 기반 진입 모션만 실행하며 화면 변경 자체는 즉시 완료한다. 외부 라이브러리는 추가하지 않는다.

## 동작 규칙

- 탭 전환 시간은 기본 420ms다.
- 연속 탭 입력이 오면 진행 중인 장식 모션을 끝내고 마지막 선택 화면을 표시한다.
- 모션 오류가 나도 `switchView`의 화면 상태, 포커스, 저장된 탭 값은 유지한다.
- 초기 로그인·새로고침에서는 전체 화면 전환을 실행하지 않는다.
- 사용자가 `prefers-reduced-motion: reduce`를 설정하면 모든 3D 이동과 순차 등장을 제거하고 80ms 이하의 불투명도 변화만 허용한다.
- 화면 전환 중에도 새 화면의 접근성 트리와 포커스 순서는 최종 상태와 일치해야 한다.

## 검증

- 런타임 manifest 테스트가 모든 활성 JS/CSS 파일의 존재와 비활성 항목 부재를 검증한다.
- 모션 계약 테스트가 좌우 방향, 초기 렌더 제외, 연속 입력 처리, reduced-motion 분기를 검증한다.
- 기존 70개 테스트 파일과 `npm run check`를 모두 실행한다.
- 모바일 크기의 화이트·다크 모드에서 일정, 성장, 동화, 요청, 설정 탭 전환을 직접 확인한다.
- 지원 브라우저와 `startViewTransition` 미지원 환경 모두에서 화면 전환이 완료되는지 확인한다.

## 배포

기능 브랜치에서 검증한 뒤 `main`에 반영한다. GitHub Pages 배포가 성공하고 공개 URL에서 새 모션 자산이 응답하며 기존 삭제 자산이 manifest에서 사라진 것을 확인한다.
