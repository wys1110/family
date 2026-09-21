# Android 앱 패키징 및 배포

`우리 가족`은 기존 PWA를 Capacitor Android 앱으로 감싸는 방식으로 구성되어 있습니다. 웹 기능과 Supabase 연동은 그대로 유지하고, Android에서는 외부 링크를 시스템 브라우저로 열고 뒤로가기 동작을 네이티브 앱 흐름에 맞게 연결합니다.

## 현재 설정

- 애플리케이션 ID: `com.wys1110.family`
- 표시 이름: `우리 가족`
- 웹 자산: `dist/`에 정리한 정적 파일을 Capacitor가 Android 앱에 복사
- 최소 Android SDK: 24
- compile/target SDK: 36
- Java: 21 권장 (Capacitor 8 Android 템플릿 기준)

## 로컬 개발

Android Studio와 Android SDK가 설치된 환경에서 실행합니다.

```bash
npm ci
npm run android:sync
npm run android:open
```

연결된 에뮬레이터 또는 기기에 디버그 APK를 설치하려면:

```bash
npm run android:debug
```

생성 위치는 `android/app/build/outputs/apk/debug/app-debug.apk`입니다. `dist/`와 Capacitor가 생성하는 `android/app/src/main/assets/public/`은 커밋하지 않습니다.

## GitHub Actions

`.github/workflows/android-build.yml`이 `main`에 Android 관련 변경이 들어오거나 수동 실행될 때 디버그 APK를 빌드하고 `family-debug-apk` 아티팩트로 업로드합니다. 저장소의 **Actions → Build Android debug APK → Run workflow**에서 직접 실행할 수도 있습니다.

## Play 스토어 출시 전 체크리스트

1. Play Console에서 `com.wys1110.family` 앱을 만들고 Play App Signing을 활성화합니다.
2. release 서명용 키를 안전한 비밀 저장소에 보관하고 `android/app/build.gradle`의 release signing 설정을 GitHub Secrets 기반으로 추가합니다. 키 파일과 비밀번호는 저장소에 커밋하지 않습니다.
3. 앱 아이콘, 스크린샷, 개인정보처리방침 URL, 콘텐츠 등급, 데이터 보안 설문을 준비합니다.
4. Supabase Authentication의 Android 패키지/딥링크 설정을 검토합니다. Google 로그인을 Android에서 사용할 경우 SHA-1/SHA-256 인증서 지문을 OAuth 설정에 추가해야 합니다.
5. 실제 푸시 알림이 필요하면 Firebase 프로젝트의 `google-services.json`을 로컬/CI 비밀로 주입하고, 출시 빌드에서 FCM 토큰 등록을 검증합니다. 해당 파일은 저장소에 넣지 않습니다.
6. 내부 테스트 트랙에 AAB를 먼저 올리고 로그인, 일정 삭제 후 위치 유지, 성장 기록, 사진, 알림, 다크 모드를 실기기에서 확인합니다.

현재 개발 실행 환경에는 Android SDK가 없고 Gradle 배포 파일 다운로드도 제한되어 있어 이 환경에서 release APK/AAB를 직접 생성할 수 없습니다. 소스와 CI 빌드 경로는 준비되어 있으며, Android Studio 또는 GitHub Actions에서 위 절차로 재현할 수 있습니다.
