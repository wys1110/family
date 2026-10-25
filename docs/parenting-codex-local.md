# 개인용 Codex 육아 채팅

이 Mac의 ChatGPT 계정으로 로그인한 Codex CLI를 사용합니다. 별도 API 키는 전달하지 않습니다. GPT-5.6 Sol / Medium을 사용하며 구독의 Codex 사용 한도가 적용됩니다.

```sh
codex login
npm run chat:local
```

`http://127.0.0.1:8775/?demo=1`에서 **육아** 탭을 열어 질문합니다. 본인 가족 데이터가 필요한 경우 demo 매개변수를 빼고 앱에 로그인할 수 있으나, 챗봇에는 선택한 아이의 생후 일수·최근 성장 측정·최근 7일 수유·기저귀·수면 요약, 질문과 최근 대화를 전달합니다. 전송할 기록을 화면에서 확인할 수 있고 기록 참고를 끄면 새 대화부터 질문만 보냅니다. 아이 또는 가족을 바꾸면 이전 대화와 진행 중 요청을 지웁니다. 이름·생년월일 원문·사진·자유 메모는 기록 요약에 넣지 않습니다.

## 기존 가족 앱에서 질문하기 (기본 경로)

로그인한 앱은 Supabase의 `parenting_questions`에 질문을 접수합니다. Mac의 `parenting-queue-worker.mjs`가 10초 간격으로 본인 요청만 가져와 기존 Codex CLI로 답변하고 결과를 저장합니다. 휴대폰에는 Tailscale이나 다른 주소가 필요하지 않습니다. Mac은 로그인·온라인·깨어 있는 상태여야 합니다.

- `지난 질문`에서 선택한 아이의 최근 질문 20개를 다시 열 수 있습니다. 질문·답변·상태·시각을 저장하며, `새 대화`는 화면만 초기화합니다. 다른 가족 구성원에게 대화를 공개하지 않습니다.
- 상세 기록 요약과 최근 대화는 답변 처리에 필요한 동안만 큐에 보관하고, 완료·실패 시 지웁니다. Mac이 오프라인이면 처리 시까지 대기합니다. 10분 넘게 대기하거나 3분 넘게 처리 중인 요청은 Mac 복귀 시 실패 처리하며 임시 기록을 지웁니다. 새로고침해도 접수된 질문은 남습니다.
- `family_internal.parenting_workers`는 사용자 ID, 무작위 256비트 키의 SHA-256 해시, 마지막 접속 시각만 보관합니다. DB 전체 접근 키를 Mac에 주지 않습니다. 키 원문은 저장소 밖의 `~/Library/Application Support/FamilyChat/queue.json`에 권한 0600으로 보관합니다. 구성에는 `url`, 공개 `key`, 비밀 `secret` 필드가 필요합니다.
- 워커는 두 RPC(`claim_parenting_question`, `finish_parenting_question`)만 호출합니다. 비밀 키와 요청별 lease가 필요하며 등록된 작성자의 가족 멤버십을 재검사합니다. 임의 SQL·다른 사용자 요청·파일·셸을 실행할 수 없습니다. 로그에는 질문과 답변을 기록하지 않습니다.
- Supabase advisor의 두 anon SECURITY DEFINER 경고는 이 제한된 capability 인증 경로에 해당합니다. 잘못된 키 거부·다른 작성자 조회 거부·직접 테이블 변경 금지·lease 및 재전송을 테스트합니다. 내부 키 테이블은 RLS 정책 없이 모든 클라이언트 접근을 차단합니다.

실행: `FAMILY_QUEUE_CONFIG=/absolute/path/queue.json node scripts/parenting-queue-worker.mjs`. 현재 Mac은 `local.family.parenting-queue` LaunchAgent로 로그인 시 자동 실행합니다. 키를 철회하려면 내부 worker 행을 삭제하고 LaunchAgent를 중지합니다. 새 키 발급은 관리자가 해시 등록과 Mac 파일 교체를 함께 수행합니다. 다른 사용자를 자동 등록하지 않습니다.

## 로컬·비공개 직접 연결 (테스트용)

로컬 서버는 127.0.0.1에만 열립니다. 아래 Tailscale Serve 경로는 가상 데이터 테스트 등 직접 연결용으로 유지합니다. 로그인한 사용자의 실제 질문은 이 주소에서도 DB 큐를 우선 사용합니다.

## 본인 휴대폰에서 연결

1. Mac과 휴대폰에 Tailscale을 설치하고 같은 본인 계정으로 로그인합니다. Mac의 네트워크 확장과 휴대폰의 VPN 구성을 허용합니다.
2. Mac에서 `tailscale status --json`의 `Self.DNSName`과 `User[Self.UserID].LoginName`을 확인합니다. 아래 예시 주소와 로그인 이름을 실제 값으로 바꿉니다. 주소 끝의 점은 빼고 HTTPS 주소만 사용합니다.

```sh
FAMILY_CHAT_ORIGIN='https://family-mac.example-tail.ts.net' \
FAMILY_CHAT_OWNER_LOGIN='owner@example.com' npm run chat:local
```

3. 다른 터미널에서 비공개 HTTPS 프록시를 켭니다. 처음 실행할 때 표시되는 Tailscale HTTPS 설정 안내를 완료합니다.

```sh
tailscale serve --bg http://127.0.0.1:8775
tailscale serve status
```

4. 가족 앱의 Supabase **Authentication → URL Configuration → Redirect URLs**에 발급된 정확한 `https://…ts.net/` 주소를 추가합니다. 기존 Site URL과 기존 허용 주소는 유지하고, 전체 `*.ts.net` 같은 와일드카드는 추가하지 않습니다. 이 설정이 없으면 Google·이메일 로그인 후 공개 앱으로 돌아갈 수 있습니다.
5. 휴대폰의 Tailscale을 켜고 표시된 `https://…ts.net/` 주소로 접속합니다. 가족 앱에 로그인한 뒤 **육아** 탭에서 질문합니다. 가상 기록으로만 확인하려면 `/?demo=1`을 붙입니다. 공개 앱과 주소가 달라 가족 앱 로그인이 다시 필요합니다.

Mac용 앱에서 CLI 경로가 등록되지 않았다면 `tailscale` 대신 `/Applications/Tailscale.app/Contents/MacOS/Tailscale`을 사용합니다.

Serve가 확인한 `Tailscale-User-Login`이 설정한 본인 계정과 정확히 같아야 화면과 API에 접근할 수 있습니다. 주소와 계정 중 하나만 설정하거나 잘못된 주소를 설정하면 서버가 시작되지 않습니다. 서버는 프록시를 사용하는 동안에도 loopback에만 바인딩해야 합니다. 별도의 프록시를 붙이거나 `0.0.0.0`으로 바꾸지 마세요. 공개 Funnel에는 본인 확인 헤더가 없으므로 요청이 거부됩니다. Funnel은 설정하지 않습니다.

Mac과 채팅 서버가 실행 중이어야 답변합니다. Mac이 잠들면 연결이 끊길 수 있습니다. 채팅 서버 터미널을 닫으면 서버도 종료됩니다. 연결을 끄려면 `tailscale serve --https=443 off`를 실행하고 채팅 서버에서 Ctrl+C를 누릅니다.

이 구성은 개인용 CLI의 비공개 원격 접속을 위한 구현입니다. 여러 사용자의 구독 공유나 공개 호스팅 허용을 의미하지 않습니다. 참고: [Codex 비대화형 실행](https://developers.openai.com/codex/noninteractive), [원격 연결](https://learn.chatgpt.com/docs/remote-connections), [Tailscale Serve와 본인 확인 헤더](https://tailscale.com/docs/features/tailscale-serve#identity-headers).

Codex 사용자 설정, 실행 규칙, 프로젝트 지침, 메모리, 셸, 앱, 플러그인, 브라우저와 웹 검색을 비활성화하고 임시 폴더의 읽기 전용 실행을 사용합니다. 질문은 명령 인자가 아닌 표준 입력으로 전달합니다. 로그인한 앱의 대화는 위 DB 정책대로 저장하며, 가상 데이터 직접 연결은 메모리에서만 대화합니다. OpenAI 측 데이터 처리는 계정 설정과 정책을 따릅니다. 새 대화·가족 변경 시 현재 화면을 비우며, DB에 저장된 본인 질문은 지난 질문에서 다시 확인할 수 있습니다.

AI 답변은 틀릴 수 있으며 진료를 대신하지 않습니다. 웹 검색은 연결하지 않았습니다. 90초 안에 응답하지 않거나 구독 한도·로그인 문제가 있으면 오류를 표시하고 질문을 다시 입력창에 남깁니다.

## 연결 복구와 취소

대기 10분·처리 3분 제한은 상태 조회, 접수, 워커 claim/finish에서 같은 내부 함수로 정리합니다. Mac이 꺼져 있어도 앱을 열면 만료된 질문이 실패로 바뀌고 새 질문을 보낼 수 있습니다. 만료 후 결과는 lease가 폐기되어 저장되지 않습니다.

대기 취소 RPC는 작성자·현재 가족 멤버십을 확인하고 행 잠금으로 claim과 직렬화합니다. 처리 중인 Codex는 취소하지 않습니다. 취소된 질문은 기록에 남고 context/messages/lease만 지웁니다. 상태 RPC의 pending은 계정 전체 기준이며, 탈퇴한 가족의 아이·가족 식별자는 반환하지 않습니다. 새 취소 함수는 authenticated만 실행할 수 있습니다. 기존 워커의 anon 실행 권한은 무작위 비밀 키 검증을 위한 의도된 제한적 예외입니다.

접수 결과가 불확실하면 페이지 메모리에 동일 ID와 전송 내용을 보관하고 접수 확인 후 동일 ID로만 재전송합니다. 이때 아이·기록 설정은 잠깁니다. 가족 전환 시 내용은 버립니다. 실패/취소된 질문의 다시 작성은 질문 텍스트만 가져오며 현재 아이·기록 설정을 사용하고 이전 대화를 포함하지 않습니다. 개인정보를 브라우저 저장소에 추가 저장하지 않습니다.
