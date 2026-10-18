# 개인용 Codex 육아 채팅

이 Mac의 ChatGPT 계정으로 로그인한 Codex CLI를 사용합니다. 별도 API 키는 전달하지 않습니다. GPT-5.6 Sol / Medium을 사용하며 구독의 Codex 사용 한도가 적용됩니다.

```sh
codex login
npm run chat:local
```

`http://127.0.0.1:8775/?demo=1`에서 **육아** 탭을 열어 질문합니다. 본인 가족 데이터가 필요한 경우 demo 매개변수를 빼고 앱에 로그인할 수 있으나, 챗봇에는 선택한 아이의 생후 일수·최근 성장 측정·최근 7일 수유·기저귀·수면 요약, 질문과 최근 대화를 전달합니다. 전송할 기록을 화면에서 확인할 수 있고 기록 참고를 끄면 새 대화부터 질문만 보냅니다. 아이 또는 가족을 바꾸면 이전 대화와 진행 중 요청을 지웁니다. 이름·생년월일 원문·사진·자유 메모는 기록 요약에 넣지 않습니다.

서버는 127.0.0.1에만 열립니다. 본인이 휴대폰에서 쓰려면 아래 Tailscale Serve 구성을 사용합니다. GitHub Pages의 공개 주소에서는 연결되지 않습니다. 공개 서비스나 가족 여러 명이 함께 쓰는 서버는 별도로 허용된 인증 경로를 마련해야 합니다.

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

Codex 사용자 설정, 실행 규칙, 프로젝트 지침, 메모리, 셸, 앱, 플러그인, 브라우저와 웹 검색을 비활성화하고 임시 폴더의 읽기 전용 실행을 사용합니다. 질문은 명령 인자가 아닌 표준 입력으로 전달하며 앱은 대화를 저장하지 않습니다. OpenAI 측 데이터 처리는 계정 설정과 정책을 따릅니다. 대화 지우기·가족 변경·새로고침 시 화면 대화가 사라집니다.

AI 답변은 틀릴 수 있으며 진료를 대신하지 않습니다. 웹 검색은 연결하지 않았습니다. 90초 안에 응답하지 않거나 구독 한도·로그인 문제가 있으면 오류를 표시하고 질문을 다시 입력창에 남깁니다.
