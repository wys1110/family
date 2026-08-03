# 테스트 모드 화이트·다크 테마 제한 설계

## 목표

`?demo=1` 테스트 모드의 설정 화면에는 화이트와 다크 두 테마만 남기고, 실제 로그인 모드의 기존 테마 목록과 동작은 유지한다.

## 범위와 동작

- `demo-mode.js`가 설정한 `window.FAMILY_DEMO_MODE`를 테마 모듈이 공통으로 사용한다.
- 테스트 모드에서만 `settings.js`가 `white`와 `black` 테마를 노출한다.
- 테스트 모드의 다크 표시명은 사용자에게 `다크`로 보이게 하고, 내부 `black` ID와 CSS alias는 유지한다.
- 테스트 모드에서 기존 테마 저장값이 `white` 또는 `black`이 아니면 화이트를 기본값으로 사용한다.
- 테스트 모드 테마 저장값은 `family-demo-theme-v1` 및 `family-demo-theme-choice-v1`에 보관해 실제 모드의 테마 선택과 분리한다.
- 테스트 모드에서는 `storybook-theme.js`와 `ghibli-theme.js`가 추가 선택지를 삽입하지 않는다.
- 실제 모드에서는 기존 7개 테마와 동적 storybook/ghibli 선택지를 그대로 유지한다.

## 구현 경계

- `config.js`: 데모 여부에 따라 테마 저장 키를 선택하고, 데모에서는 화이트/다크만 유효한 초기 테마로 처리한다.
- `settings.js`: 전체 테마 정의와 데모용 노출 목록을 분리하고, 데모 저장 키·표시명·유효성 검사를 적용한다.
- `storybook-theme.js`, `ghibli-theme.js`: 데모 모드 조기 종료 guard를 추가한다.
- 테스트는 문자열 계약을 과도하게 고정하지 않고, 데모/실제 분기·저장 키·동적 옵션 차단을 검증한다.

## 저장값 호환

기존 `family-theme-v1` 또는 `family-theme-choice-v1` 값은 실제 모드에서 계속 사용한다. 테스트 모드에서는 해당 키를 읽지 않으므로, 기존 실제 테마 선택이 테스트 화면에 유출되지 않는다. 테스트 모드에서 처음 열면 화이트를 사용하고, 다크 선택 후에는 데모 전용 키에만 저장한다.

## 검증 기준

1. 데모 모드 설정 화면에 `data-theme-option` 버튼이 정확히 `white`, `black` 두 개만 존재한다.
2. 실제 모드 설정 화면의 기존 테마 목록과 storybook/ghibli 확장이 유지된다.
3. 데모 모드에서 비지원 저장값이 화이트로 정규화되고 실제 저장 키는 변경되지 않는다.
4. 화이트·다크 선택 시 `data-family-theme`, `data-family-theme-choice`, `color-scheme`가 현재 CSS 계약과 일치한다.
