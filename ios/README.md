# iPhone 수면 실시간 현황

수면 타이머의 시작·종료와 가족 문맥 변경을 ActivityKit에 연결합니다. 잠금화면과 다이내믹 아일랜드에 아이 이름과 경과 시간을 표시합니다. 웹에서 기존 수면 타이머가 렌더링될 때 최신 상태를 전달하고 중복 시작을 억제합니다.

수면 시작 후 잠금화면과 펼친 다이내믹 아일랜드의 막대가 시간에 따라 채워집니다. 한 칸은 1시간이며 0–8시간 경과 눈금입니다. 수면 목표나 자동 종료 시각이 아닙니다. 8시간을 넘으면 막대는 모두 채워진 채 유지되며, 시스템이 실시간 현황을 종료할 때까지 시계는 계속 경과 시간을 표시합니다.

수면 끝을 누르면 전달된 최초 `endedAt`으로 막대와 모든 크기의 시계가 정지합니다. 저장 지연·재시도 중에도 정지 상태를 유지하고, 저장 완료 또는 다른 가족의 종료가 확인되면 기존처럼 카드를 즉시 닫습니다. 취소·가족 전환도 카드를 제거합니다. 이미 종료된 타이머로 새 실시간 현황을 만들지는 않습니다.

## 빌드와 설치

1. Node 22 이상 및 Capacitor 8에 맞는 Xcode를 설치합니다.
2. 저장소 루트에서 `npm ci`와 `npm run ios:sync`를 실행합니다.
3. `npm run ios:open`으로 프로젝트를 열고 App 및 SleepWidget 타깃의 Signing Team을 본인 계정으로 설정합니다.
4. iPhone 또는 iOS Simulator로 실행합니다. 기기에서 실시간 현황을 허용하고 로그인·가족 연결 및 수면 시작·종료를 검증합니다.

기기 서명과 설치는 아직 수행하지 않았습니다. 네이티브 OAuth 로그인 왕복도 기기에서 검증해야 합니다.

## 네이티브 로그인 준비

iOS는 `com.wys1110.family://login-callback/`으로 돌아오는 PKCE 로그인을 사용합니다. 기존 Supabase 프로젝트의 Auth → URL Configuration → Redirect URLs에 이 주소를 정확히 추가해야 합니다. 기존 웹 Site URL 및 Google 제공자 callback은 변경하지 않습니다. 이번 코드 변경은 실제 프로젝트의 인증 설정을 수정하지 않습니다.

Google 로그인은 기존 Capacitor Browser로 열고 App 플러그인의 warm/cold-start 콜백에서 코드를 한 번 교환합니다. 이메일 링크도 앱에서 요청한 뒤 같은 iPhone 앱으로 돌아와야 합니다. 이메일 템플릿은 Supabase의 `ConfirmationURL` 또는 요청한 `RedirectTo`를 존중해야 하며, 운영 템플릿 상태는 미확인입니다. 웹 및 Android 로그인 경로는 기존대로 유지합니다.

앱에서 직접 시작한 시도로 10분 안에 돌아온 정확한 콜백만 처리합니다. 명시적인 재시도는 이전 시도를 교체하고, 브라우저 취소·로그아웃은 대기를 해제합니다. 토큰 fragment를 받아 세션으로 저장하지 않으며 인증 코드·토큰·이메일을 대기 기록이나 로그에 남기지 않습니다. 설정 및 실제 계정으로 로그인·재실행·가족 연결은 기기에서 별도로 검증해야 합니다.

참고: [Supabase 모바일 deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Capacitor App](https://capacitorjs.com/docs/apis/app).

## CI 실기용 빌드 산출물

`Validate iOS sleep activity` 워크플로는 기존 iOS Simulator 검증 후 `iphoneos` SDK로 실기용 App 및 SleepWidget을 서명 없이 빌드합니다. `family-ios-unsigned-device` artifact의 `family-ios-unsigned-device.zip`에는 실행 권한을 보존해 압축한 `App.app`과 내부 확장이 들어갑니다. 이 산출물은 Simulator 빌드와 구분됩니다.

**서명과 기기 프로비저닝이 없으므로 현재 산출물 그대로는 iPhone에 설치하거나 실행할 수 없습니다.** 다운로드·압축 해제는 설치가 아닙니다. 실제 설치에는 기존 Apple Account와 Xcode로 App 및 SleepWidget의 서명·프로비저닝을 준비해야 합니다. 실기용 컴파일 성공도 서명·설치·잠금화면 알림 검증을 대신하지 않습니다.

## 동작 범위

앱이 활성 상태일 때 수면을 시작하고 재진입 시 동기화합니다. iOS가 타이머를 그리므로 경과 시간을 위해 초마다 네트워크 요청을 보내지 않습니다. 앱이 중단된 동안 다른 가족이 종료한 상태까지 즉시 반영하려면 ActivityKit APNs 전송을 별도로 연결해야 합니다. 이번 구현에는 이 전송 경로가 없습니다. Apple의 실시간 현황 유지 시간 제한도 적용됩니다.

막대는 Apple의 [날짜 기반 ProgressView](https://developer.apple.com/documentation/widgetkit/displaying-dynamic-dates)를 사용합니다. 웹/PWA에서 이 잠금화면 UI가 표시되지는 않습니다.

## 검증 구분

- 합성 테스트는 시작, 종료 시각 고정, 저장 실패·재시도, 늦은 시작 응답 뒤 종료, 재시작과 가족 전환을 검증합니다.
- GitHub Actions의 iOS Simulator 빌드는 App 및 SleepWidget 컴파일을 검증합니다. 화면에서 실제 시간이 흐르는 것을 관찰하는 테스트는 아닙니다.
- 실기에서는 잠금 후 막대 진행, 59분→60분 눈금 이동, 종료 대기 중 시계·막대 정지, 저장 후 제거, 큰 글자와 VoiceOver를 확인해야 합니다. 서명·설치·OAuth 로그인·이 실기 항목은 아직 미확인입니다.
