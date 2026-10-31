# 개인 자산 연결 — 아직 비활성

이 변경은 같은 가족앱 주소에서 자산 화면을 제공하기 위한 **코드와 합성 테스트**다. 실제 Apps Script 프로젝트 업로드, 새 배포, 접근 범위 변경, 비밀 설정, 운영 Drive 조회·수정은 수행하지 않았다. 화면·코드·테스트를 검토한 뒤 연결 활성화를 별도 승인한다. 배포 설정이 확인되기 전에는 기존 비공개 자산앱 링크를 유지한다.

## 원본과 접근 경계

- 개인 기록의 유일한 원본은 본인 전용 Google Drive Jayden Log의 기존 요약 문서와 앱 전용 원장이다. GitHub, Pages 정적 파일, Supabase DB, 브라우저 저장소에 원장을 복제하지 않는다.
- 브라우저는 기존 Supabase 세션의 Bearer 토큰으로 `private-assets` Edge Function을 호출한다. 서버는 `auth.getUser()`로 사용자 확인 후 설정된 **사용자 UUID 한 개**와 정확히 비교한다. 가족 가입·메뉴 표시·이메일은 자산 접근 권한이 아니다.
- Edge Function이 요청을 HMAC 서명한다. Google Apps Script는 서명을 확인하고 배포 소유자의 기존 Google 권한으로 기존 Drive 읽기·저장 함수를 실행한다. 브라우저에는 HMAC 비밀을 보내지 않는다.
- Google 새 OAuth 앱·범위 추가는 이 설계에 필요하지 않다. 기존 Apps Script 소유자의 승인된 범위를 재사용한다. Supabase Google 로그인만으로 Drive 권한이 생기는 것은 아니다.
- 기존 사용자용 `getDashboard`·`saveRecord`는 active/effective 사용자 검사를 유지한다. 서명 요청만 내부 `_` 함수로 진입한다. Drive의 단독 소유·비공개·동일 폴더·앱 생성 원장 검사, 수정 전후 비교, 원장 revision 경합·중복 요청 검사를 보존한다.

## 브라우저 계약

```js
// 기존 Supabase client 세션을 사용한다. 실제 기록을 console에 출력하지 않는다.
const { data, error } = await supabase.functions.invoke('private-assets', {
  body: { action: 'dashboard' },
});
// 저장: 기존 Apps Script saveRecord와 같은 명령이다.
// { action: 'saveRecord', command: { requestId, expectedRevision, record } }
```

`requestId`는 저장 작업마다 생성한 UUID다. **통신 실패 후 동일 저장을 재시도할 때는 같은 requestId와 같은 record를 유지**한다. Edge 요청마다 서명 nonce는 새로 생성된다. `expectedRevision`은 마지막 조회한 `program.revision`이다. `record`는 기존 원장이 정의하는 거래 또는 잔액 필드이며 문서 ID·이메일을 받지 않는다. 성공·도메인 오류 응답은 기존 Apps Script 형식을 유지한다. `SOURCE_CHANGED`이면 다시 읽고 사용자 검토 후 새 요청을 만든다. 서버 오류에 포함된 원문·토큰은 표시하거나 기록하지 않는다.

Edge 요청 본문은 8 KiB, Apps Script 서명 envelope는 20 KB, 응답은 4 MiB 이내다. 외부 조회 제한 시간은 25초이며 초과 시 `TIMEOUT`/HTTP 504로 응답한다. 저장 timeout은 실제 미저장을 보장하지 않으므로 같은 명령으로 확인한다. 자동 저장 재시도를 하지 않는다. 클라이언트가 같은 거래를 새 requestId로 반복 제출하지 않도록 한다. 모든 Edge 응답에 `Cache-Control: no-store`를 보낸다. 개인 자산 응답은 서비스 워커 캐시·localStorage·IndexedDB·백업·분석 도구에서 제외한다.

## 활성화 전에 확인할 사항

1. 합성 화면·테스트·코드 검토를 끝낸다. 소유자·다른 가족 계정·비로그인 요청의 차단, 저장 경합·동일 요청 재시도, 브라우저 캐시 미저장을 검토한다.
2. 기존 Apps Script 프로젝트의 배포 설정과 원장 속성을 **비밀 값 출력 없이** 확인한다. 기존 비공개 `/exec` 배포는 소유자 실행·나만 접근 상태와 기존 주소를 유지한다. 이 저장소의 staging `appsscript.json`도 `MYSELF`를 유지한다.
3. `integrations/private-assets-appscript/`의 `Code.gs`, `Ledger.gs`, `Storage.gs`, `SignedApi.gs`, `Index.html`, `appsscript.json`을 검토한다. `Index.html`을 함께 보존한 것은 기존 비공개 화면의 `doGet` 경로를 누락시키지 않기 위해서다. `synthetic-fixture.mjs`는 테스트 전용이며 Apps Script 업로드 대상이 아니다. `.clasp.json`, 실제 문서 ID, 이메일, 인증·프로젝트 속성은 추가하지 않는다.
4. **별도 승인 필요:** Edge 서버가 호출할 전용 Apps Script 웹앱 배포는 Google 로그인 없는 HTTP POST를 받을 수 있는 접근 설정과 `사용자 = 배포 소유자`가 필요하다. 공개 URL이 생겨도 서명 없는 요청은 차단한다. 이것은 기존 `MYSELF` 엔드포인트를 바로 호출할 수 있다는 뜻이 아니다. 새 배포 버전·접근 범위를 실제 UI에서 검토하고, 기존 비공개 배포를 그 버전으로 무심코 갱신하지 않는다. 배포 설정을 바꾸기 위해 이 저장소의 기본 manifest를 자동 변경하지 않는다.
5. 32 bytes를 안전한 난수로 생성해 **64자리 hex 문자열**로 표현한 새 비밀을 보안 설정 UI에 입력한다. 예시 값을 재사용하거나 채팅·명령 인자·로그·저장소에 넣지 않는다. 두 서비스에서 같은 문자열 자체를 HMAC key로 사용한다. 비밀은 Apps Script와 Edge 서버에만 존재한다.
6. Apps Script Script Properties에 `PRIVATE_ASSETS_HMAC_SECRET`을 설정한다. 처음에는 `PRIVATE_ASSETS_API_ENABLED`를 비활성으로 둔다. 기존 `SOURCE_DOC_ID`, `PROGRAM_DOC_ID`, 폴더·설정 식별자는 서버 속성에만 두고 기존 값을 보존한다. 원장 저장의 기존 `PROGRAM_WRITES_ENABLED` 제한도 별도로 유지한다.
7. Supabase Function Secrets에 아래 설정을 등록한다. 값 자체는 이 문서에 기록하지 않는다. 기존 `SUPABASE_URL`·`SUPABASE_ANON_KEY` 런타임 설정을 사용하며 새 DB나 service role 경로를 추가하지 않는다.

| 설정 | 서버에서만 보관할 값 |
| --- | --- |
| `PRIVATE_ASSETS_SCRIPT_URL` | 승인된 전용 `https://script.google.com/macros/s/배포ID/exec` URL; 쿼리·다른 호스트 금지 |
| `PRIVATE_ASSETS_HMAC_SECRET` | 위의 동일한 64자리 hex 비밀 |
| `PRIVATE_ASSETS_OWNER_USER_ID` | 기존 본인 Supabase 사용자 UUID; 이메일·가족 UUID 금지 |
| `PRIVATE_ASSETS_ALLOWED_ORIGINS` | 실제 가족앱 HTTPS origin 목록, 쉼표 구분; 경로·와일드카드 금지 |

8. 승인된 범위에서 Edge Function 배포와 전용 Google API 배포를 수행한 뒤에만 `PRIVATE_ASSETS_API_ENABLED=true`로 활성화한다. 단순 파일 업로드·manifest 확인은 실제 배포/차단 검증을 대신하지 않는다. 쓰기는 읽기 검증 후 기존 원장 저장 제한과 함께 검증한다. 검증 과정에서도 금융 응답·스크린샷을 로컬 파일로 저장하지 않는다.
9. 실제 본인 계정 조회, 비로그인·다른 가족·잘못된 서명 차단, 저장 후 재조회·동일 요청 재시도·기존 비공개 자산앱 접속을 확인한다. **현재 이 검증들은 운영에서 미실행이다.**

## 서명 프로토콜과 실패 처리

서버 POST는 `{request: "정확한 JSON 문자열", signature: "소문자 SHA256 HMAC hex"}`다. 서명 대상은 재직렬화한 객체가 아니라 `request` 문자열의 UTF-8 bytes다. 내부 요청은 `{v:1, action:'dashboard'|'saveRecord', timestamp:epochMilliseconds, nonce:UUIDv4, command?:...}`이며 알 수 없는 키·action·호출자 이메일을 거부한다.

시각 허용 오차는 양방향 60초다. nonce는 ScriptLock 아래 Script Properties에 소비 기록을 저장하고 120초 이상 보존한다. 캐시 eviction에 의존하지 않는다. 2분 동안 80개의 소비 기록이 차면 실패 처리한다. 소규모 개인앱을 위한 제한이다. 재전송된 서명 nonce는 실패하며 저장 명령 재시도는 Edge가 새 nonce로 다시 서명한다. nonce 잠금은 저장 함수가 자체 잠금을 얻기 전에 해제한다.

Apps Script ContentService 응답용 `302/303` 리다이렉트는 정확히 `https://script.googleusercontent.com/macros/echo`로만 1회 허용한다. 리다이렉트에는 `GET`만 보내고 서명 본문·Supabase Bearer를 전달하지 않는다. 다른 호스트·경로·자격 증명 URL·추가 리다이렉트·`307/308`은 차단한다. 실제 Google 응답 흐름과 허용 범위의 일치는 활성화 검증이 필요하다.

서명/API 호출은 권한이 있는 Edge 서버를 신뢰 경계로 둔다. 비밀이 유출되면 Apps Script API flag를 먼저 끄고 양쪽 비밀을 교체한다. 연결 중단은 API flag를 비활성으로 하고 Edge 비밀·전용 배포를 정리하는 방식으로 수행하며 원장·기존 비공개 배포를 삭제하지 않는다. 이 조치는 현재 수행하지 않았다.

## 로컬 합성 검증

```sh
npm test -- test/private-assets-api.test.js test/private-assets-appscript.test.js --maxWorkers=1
```

Edge 권한·설정·payload 경계·서명·리다이렉트 유출 차단, Apps Script HMAC 변조·만료·재사용 차단·잠금, 기존 원장 경합·중복 저장·이력·출처 보호를 가상 데이터로 검사한다. 운영 Google 배포·Supabase 배포·실제 Drive 동작을 검증한 결과는 아니다.

## 공식 동작 근거

Google의 [Content Service 문서](https://developers.google.com/apps-script/guides/content)는 JSON 응답과 `script.googleusercontent.com`으로의 일회성 결과 URL 리다이렉트를 설명한다. [Web Apps 문서](https://developers.google.com/apps-script/guides/web)는 `doPost`, 배포 접근 설정, 배포 소유자/접속 사용자로 실행하는 차이를 설명한다. 이 코드의 실제 새 배포와 리다이렉트 일치는 활성화 후 별도로 확인해야 한다.
