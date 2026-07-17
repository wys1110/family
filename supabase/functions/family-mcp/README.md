# 우리 가족 MCP

Supabase Edge Function으로 실행되는 원격 MCP 서버입니다. 기존 Supabase 로그인 토큰과 Row Level Security(RLS)를 그대로 사용하므로, 인증된 사용자가 속한 가족 공간의 데이터만 조회·변경합니다.

## 제공 도구

| 도구 | 동작 | 변경 여부 |
| --- | --- | --- |
| `list_events` | 기간별 가족 일정 조회 | 읽기 |
| `create_event` | 가족 일정 추가 | 쓰기 |
| `list_todos` | 가족 할 일 조회 | 읽기 |
| `create_todo` | 가족 할 일 추가 | 쓰기 |
| `complete_todo` | 할 일 완료/미완료 변경, 반복 할 일 다음 회차 생성 | 쓰기 |
| `list_babies` | 아기 프로필 조회 | 읽기 |
| `get_baby_daily_summary` | 하루 분유·모유·수면·기저귀·체온 요약 | 읽기 |
| `log_baby_care` | 분유·모유·수면·기저귀·체온·성장 기록 추가 | 쓰기 |

삭제 도구와 사진 조회 도구는 초기 버전에서 의도적으로 제외했습니다.

## 배포

Supabase CLI로 프로젝트에 연결한 뒤 배포합니다.

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy family-mcp
```

기본 배포 설정의 JWT 검증을 유지해야 합니다. `--no-verify-jwt` 옵션을 사용하지 마세요.

배포 주소는 다음 형태입니다.

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/family-mcp
```

## 인증

모든 MCP 요청에 로그인한 가족 사용자의 Supabase access token을 전달합니다.

```http
Authorization: Bearer SUPABASE_USER_ACCESS_TOKEN
Content-Type: application/json
Accept: application/json, text/event-stream
```

서버는 access token으로 사용자를 확인한 다음 `household_members`에서 가족 공간을 찾고, 동일한 토큰으로 PostgREST를 호출합니다. `service_role` 키는 사용하지 않습니다.

access token은 만료될 수 있으므로 장기간 연결에는 Supabase Auth를 OAuth/OIDC 공급자로 연결하는 후속 작업이 필요합니다. 토큰을 저장소, 문서, 채팅에 커밋하거나 공유하지 마세요.

## 초기화 확인

```bash
curl -sS \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-11-25",
      "capabilities":{},
      "clientInfo":{"name":"family-mcp-test","version":"1.0.0"}
    }
  }' \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/family-mcp"
```

## 도구 조회 확인

```bash
curl -sS \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/family-mcp"
```

## 선택 설정

브라우저 기반 클라이언트에서 추가 Origin을 허용해야 한다면 Edge Function secret으로 쉼표 구분 목록을 설정합니다.

```bash
supabase secrets set MCP_ALLOWED_ORIGINS="https://example.com,https://another.example.com"
```

기본값으로 ChatGPT, Claude 웹 Origin과 로컬 개발 주소만 허용합니다. 일반적인 서버 간 MCP 호출에는 `Origin` 헤더가 없어 이 설정이 필요하지 않습니다.

## 보안 원칙

- Supabase 사용자 JWT와 기존 가족 단위 RLS를 그대로 적용합니다.
- `service_role` 키를 사용하거나 노출하지 않습니다.
- 응답에는 선택한 가족 데이터 필드만 포함합니다.
- 분당 사용자별 요청 수를 제한합니다. 서버리스 인스턴스별 보조 제한이므로, 공개 운영 시 게이트웨이 수준 rate limit도 추가하세요.
- 쓰기 도구에는 MCP annotation을 지정해 클라이언트가 확인 절차를 적용할 수 있도록 했습니다.
- 민감한 아기 사진과 개인 공간 데이터는 MCP 도구에 노출하지 않습니다.
