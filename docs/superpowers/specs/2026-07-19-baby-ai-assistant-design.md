# AI 육아 도우미 설계

## 목표

가족 구성원이 공동으로 관리하는 아기 특성과 부모 생활 패턴, 최근 7일의 수유·수면 기록을 바탕으로 Gemini가 일반 육아 질문에 답하고 수유·수면 전략을 제안한다. 확정한 전략만 가족 공간에 보존하며 일반 대화는 현재 브라우저 세션에서만 유지한다.

## 범위

첫 버전은 다음 기능만 제공한다.

- 아기 특성과 부모 생활 패턴을 가족 공동 프로필로 저장·수정
- 아기에 관한 일반적인 정보 질문과 후속 질문
- 최근 7일 기록을 반영한 수유 전략 생성
- 최근 7일 기록을 반영한 수면 전략 생성
- 생성 결과를 검토한 뒤 가족 공동 전략으로 확정·보관
- 새 수유·수면 기록이 생기면 마지막 기록으로부터 30분 뒤 전략 자동 갱신

질병 진단, 약물 용량 결정, 응급상황 판단의 대체, 기저귀·놀이·발달 전용 전략은 첫 버전에 포함하지 않는다.

## 사용자 경험

성장일기 안에 `AI 육아 도우미` 카드를 추가한다. 카드는 세 구역으로 구성한다.

1. `우리 아기와 가족 패턴`
   - 아기: 수유 방식, 수유 시 특징, 잠들기 방식, 수면 환경, 예민함과 진정 방법, 자유 메모
   - 엄마·아빠: 평일 기상·취침, 외출·근무 시간, 야간 돌봄 가능 시간, 선호 교대 방식, 자유 메모
   - 가족 구성원이 저장하면 같은 가족 공간의 모든 사용자에게 보인다.
2. `육아 질문`
   - 일반 질문과 현재 세션의 후속 질문을 주고받는다.
   - 대화는 새로고침하거나 브라우저를 닫으면 사라지고 DB에 저장하지 않는다.
3. `우리 가족 전략`
   - `수유`와 `수면` 탭을 제공한다.
   - AI 제안에는 생성 시각, 참고한 기록 범위, 핵심 관찰, 오늘 실행할 단계, 관찰할 지표, 재평가 기준을 표시한다.
   - 사용자가 `가족 전략으로 확정`을 눌러야 공동 전략으로 저장한다.
   - 자동 갱신 결과는 기존 확정 전략을 덮어쓰지 않고 `새 제안`으로 표시한다.

기록 추가 후에는 `새 기록을 반영해 전략을 준비 중 · HH:MM 이후 갱신` 상태를 표시한다. 같은 아기의 수유·수면 기록이 추가되면 예정 시각을 마지막 기록 기준 30분 뒤로 연장한다.

## 구조

GitHub Pages의 브라우저 코드는 Gemini API를 직접 호출하지 않는다. 기존 Supabase 프로젝트에 `baby-ai` Edge Function을 추가하고 `GEMINI_API_KEY`는 Supabase Function Secret으로만 보관한다.

브라우저는 현재 로그인 JWT로 Edge Function을 호출한다. 함수는 JWT의 사용자를 확인하고 요청한 아기와 사용자가 같은 가족 공간에 속하는지 검사한다. 데이터 조회와 저장은 호출 사용자의 인증 문맥으로 실행해 기존 RLS를 적용한다.

기존 `/Users/yongseokwon/dev/codex-gemini-api-runner`에서 재사용할 개념은 다음과 같다.

- 빈 API 키 거부
- Gemini 텍스트 생성 호출을 별도 전송 계층으로 격리
- 프롬프트 조립을 호출 코드와 분리
- 테스트에서는 실제 Gemini 호출 대신 주입한 전송 계층 사용

Node 전용 `.env` 로더와 CLI·리뷰 프롬프트·워크벤치는 가져오지 않는다. Edge Function은 Deno 환경 변수와 Gemini REST `generateContent` 호출을 사용한다. 일반 대화도 Gemini 서버 대화 상태를 쓰지 않고 현재 브라우저 세션의 필요한 메시지만 요청에 포함한다.

## 데이터 모델

### `baby_ai_profiles`

아기별 가족 공동 입력을 한 행으로 보관한다.

- `baby_id uuid primary key`
- `household_id uuid not null`
- `feeding_method text`
- `feeding_traits text`
- `sleep_onset_method text`
- `sleep_environment text`
- `temperament text`
- `soothing_methods text`
- `baby_notes text`
- `mother_schedule jsonb`
- `father_schedule jsonb`
- `family_notes text`
- `updated_by uuid`
- `updated_at timestamptz`

부모 일정 JSON은 `wakeTime`, `sleepTime`, `awayStart`, `awayEnd`, `nightCareStart`, `nightCareEnd`, `notes`만 허용한다. 텍스트 필드는 각각 2,000자 이하로 제한한다.

### `baby_ai_strategy_drafts`

수동 또는 자동 생성된 제안을 보관한다.

- `id uuid primary key`
- `baby_id uuid not null`
- `household_id uuid not null`
- `kind text check (kind in ('feeding', 'sleep'))`
- `status text check (status in ('draft', 'confirmed', 'superseded'))`
- `content jsonb not null`
- `source_window_start timestamptz`
- `source_window_end timestamptz`
- `source_log_count integer`
- `generated_by uuid null`
- `generated_at timestamptz`
- `confirmed_by uuid null`
- `confirmed_at timestamptz null`

같은 아기·종류에는 확정 전략이 하나만 존재한다. 새 전략을 확정하면 이전 확정 전략은 `superseded`로 바뀐다.

### `baby_ai_refresh_queue`

자동 갱신 대기 상태를 아기별 한 행으로 보관한다.

- `baby_id uuid primary key`
- `household_id uuid not null`
- `due_at timestamptz not null`
- `status text check (status in ('pending', 'processing', 'failed'))`
- `attempt_count integer default 0`
- `last_error text null`
- `updated_at timestamptz`

수유·수면 기록 저장 성공 후 큐를 upsert하며 `due_at = now() + 30 minutes`로 갱신한다. 예약 작업은 5분마다 만료된 대기를 처리한다. 한 작업은 수유·수면 제안을 모두 생성하되, 입력 변화가 없으면 새 초안을 추가하지 않는다.

모든 테이블은 RLS를 활성화한다. 가족 구성원만 자기 가족 행을 조회·작성할 수 있다. 전략 확정도 가족 구성원에게 허용한다. 일반 대화는 테이블을 만들지 않는다.

## API와 데이터 흐름

`baby-ai` 함수는 JSON 요청의 `action`으로 동작을 구분한다.

- `chat`: 질문, 현재 세션 메시지, `babyId`를 받아 답변을 반환한다.
- `generate-strategy`: `babyId`, `kind`를 받아 새 초안을 만든다.
- `process-refresh-queue`: 예약 작업 전용이며 만료된 큐를 제한된 개수만 처리한다.

`chat`과 `generate-strategy`는 로그인 JWT가 필수다. `process-refresh-queue`는 브라우저에서 호출할 수 없고 예약 작업용 비밀 토큰을 검사한다.

함수는 DB에서 프로필, 아기 생년월일, 최근 7일의 해당 아기 수유·수면 기록을 직접 조회한다. 브라우저가 기록 원문이나 가족 식별자를 프롬프트로 조립하지 않는다. Gemini에는 이름 대신 `아기`라는 호칭을 사용하고 사용자 UUID, 가족 UUID, 사진 URL, 계정 정보는 전송하지 않는다.

전략 응답은 다음 키의 구조화 JSON으로 제한한다.

- `summary`: 한 문단 요약
- `observations`: 기록에서 확인 가능한 사실 목록
- `actions`: 부모가 순서대로 실행할 단계 목록
- `watch`: 기록할 지표 목록
- `reassess`: 전략을 다시 평가할 조건
- `safety`: 의료 상담이 필요한 경우의 일반 안전 안내

Gemini 응답이 구조 검증에 실패하면 한 번만 교정 요청을 보내고, 다시 실패하면 저장하지 않고 오류로 처리한다.

## 자동 갱신

브라우저에서 수유·수면 기록 저장이 성공하면 DB 함수 `schedule_baby_ai_refresh(baby_id)`를 호출한다. DB 함수는 가족 권한을 확인하고 큐를 upsert한다.

Supabase `pg_cron`과 `pg_net`은 5분마다 Edge Function의 `process-refresh-queue`를 호출한다. 함수는 다음 순서로 처리한다.

1. `due_at <= now()`인 pending 또는 재시도 가능한 failed 행을 가져온다.
2. 중복 실행을 막기 위해 `processing`으로 바꾼다.
3. 최근 7일 기록과 공동 프로필로 수유·수면 초안을 만든다.
4. 성공하면 큐 행을 삭제한다.
5. 실패하면 오류 전문 대신 안전한 요약과 재시도 횟수를 기록한다.
6. 최대 3회 실패하면 자동 재시도를 멈추고 화면에서 수동 재시도를 제공한다.

## 안전과 개인정보

- Gemini API 키와 예약 작업 토큰은 Git, 브라우저 설정, DB 공개 행에 저장하지 않는다.
- 사용자가 로그인하지 않았거나 가족 권한이 없으면 AI 기능을 사용할 수 없다.
- 모델 프롬프트는 진단·처방·확정적 의학 판단을 금지한다.
- 호흡 곤란, 청색증, 의식 저하, 심한 탈수처럼 즉시 진료가 필요한 표현이 질문에 포함되면 AI 호출 전 고정된 긴급 안내를 우선 반환한다.
- 일반 답변에도 아기 연령과 상태에 따라 소아청소년과·보건 전문가에게 확인해야 한다는 한계를 명시한다.
- 사용자가 입력한 자유 메모는 가족 공동 데이터이며 저장 화면에 이 사실을 표시한다.
- 로그에는 질문 본문, 프로필 본문, Gemini 키, JWT를 기록하지 않는다.

## 오류 처리

- 네트워크 또는 Gemini 장애: 기존 확정 전략은 유지하고 `갱신 실패`와 재시도 버튼을 표시한다.
- 인증 만료: 로그인 갱신 안내를 표시하고 요청을 재전송하지 않는다.
- 입력 부족: 필요한 프로필 항목 또는 최근 기록 부족을 구체적으로 표시한다.
- 응답 구조 오류: DB에 초안을 저장하지 않는다.
- 자동 갱신 중 새 기록 발생: 새 `due_at`을 보존하고 현재 결과는 오래된 제안으로 표시해 확정 대상에서 제외한다.

## 테스트

- 프롬프트 조립: 가족·계정 식별자가 제외되고 최근 7일 데이터만 포함되는지 검사
- 안전 분기: 긴급 표현이 Gemini 호출 없이 고정 안내를 반환하는지 검사
- 응답 검증: 필수 JSON 키와 문자열·배열 타입을 검사
- 권한: 다른 가족의 프로필·전략·큐를 읽거나 수정할 수 없는지 SQL 정책 검사
- 큐: 기록 추가 시 30분 연장, 중복 합치기, 최대 3회 재시도를 검사
- UI: 프로필 저장, 세션 대화, 전략 초안 표시·확정, 실패 상태를 검사
- 기존 기능 회귀: 일정·성장일기·수유·수면 기록이 AI 설정 없이 계속 동작하는지 검사

실제 Gemini 호출은 별도 smoke test로 한 번만 실행하고 자동 테스트에서는 가짜 전송 계층을 사용한다.

## 배포

코드 반영에는 DB 마이그레이션, Edge Function, 정적 UI가 포함된다. 배포 순서는 DB 마이그레이션 적용, Function Secret 등록, Edge Function 배포, 예약 작업 설정, GitHub Pages 배포 순서다. 비밀값이 준비되지 않은 환경에서는 기존 앱이 그대로 동작하고 AI 카드에는 `관리자 설정 필요`를 표시한다.
