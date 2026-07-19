# 우리 가족 캘린더

가족 일정을 한눈에 보고 함께 관리하는 모바일 중심 캘린더입니다.

## 지금 바로 실행

별도 설정 없이 열면 브라우저의 로컬 저장소에 일정이 저장됩니다.

```bash
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173`을 엽니다.

## Supabase 연결

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 실행합니다.
3. [`config.example.js`](config.example.js)를 복사해 `config.js`를 만들고 Project URL과 anon key를 입력합니다.
4. Supabase Authentication의 URL Configuration에 로컬 주소와 GitHub Pages 주소를 Redirect URL로 추가합니다.

```js
window.FAMILY_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
};
```

anon key는 브라우저용 공개 키이며, 실제 데이터 보호는 `schema.sql`의 Row Level Security 정책이 담당합니다. `service_role` 키는 절대 넣지 마세요.

## GitHub Pages

`main` 브랜치에 반영되면 `.github/workflows/pages.yml`이 정적 사이트를 자동 배포합니다. 저장소의 **Settings → Pages → Source**가 **GitHub Actions**로 설정되어 있어야 합니다.

## Google 로그인 설정

1. Google Cloud에서 OAuth 2.0 Client ID를 **Web application**으로 생성합니다.
2. Authorized JavaScript origins에 `https://wys1110.github.io`를 추가합니다.
3. Authorized redirect URI에 `https://ljutcgmgtqfkwkxdbiyb.supabase.co/auth/v1/callback`을 추가합니다.
4. Supabase **Authentication → Providers → Google**에서 Google Client ID와 Client Secret을 입력하고 활성화합니다.

Google Client Secret은 Supabase에만 입력하고 저장소에는 커밋하지 않습니다. 자세한 내용은 [Supabase Google 로그인 공식 문서](https://supabase.com/docs/guides/auth/social-login/auth-google)를 참고하세요.

## 주요 기능

- 월간 달력 및 오늘 일정
- 일정 추가·수정·삭제, 시작일–종료일 범위 지정 및 최대 50개 일괄 입력
- 캘린더 안 가족 할 일(오늘·예정·완료, 담당자, 마감일, 반복, 날짜별 표시)
- 아빠·엄마·도윤 구성원별 표시
- 브라우저 로컬 저장
- Supabase 이메일 로그인 및 가족 초대 코드
- Google 소셜 로그인
- 가족 단위 RLS 데이터 보호
- 도윤이 성장일기(첫 순간, 성장, 수유, 수면, 기저귀, 건강·병원, 놀이)
- 시간과 유형별 수치 기록(키, 몸무게, 머리둘레, 수유량, 수면시간, 체온)
- 기록당 사진 최대 4장 업로드(비공개 Supabase Storage, 가족 구성원 전용)
- 여러 아기 프로필과 태어난 날 기준 D-day·생후 일수
- 수유·수면·기저귀 원터치 기록과 오늘 요약
- 최근 성장 측정 및 비공개 사진 타임라인
- 로그인 계정 본인만 접근할 수 있는 `나만의 공간`(일기·기도·생각·메모)
- 아기에게 들려주는 창작 영어동화 7편과 한글 뜻
- 영어동화 전체·문장별 음성 재생, 느린 속도, 오늘의 동화 완료 표시
- 가족 구성원 기능 요청 DB 저장과 가족 관리자 전용 조회·상태 관리
- 가족 공동 아기 특징·부모 생활 패턴과 최근 7일 기록을 반영하는 AI 육아 질문·수유·수면 전략

영어동화는 브라우저의 영어 음성 읽기 기능을 사용하며 별도 DB 설정 없이 바로 동작합니다. 완료 표시는 현재 기기의 로그인 계정별 로컬 저장소에 보관됩니다.

이미 초기 스키마를 적용한 프로젝트에서 성장일기를 추가하려면 SQL Editor에서 [`supabase/migrations/20260714_growth_diary.sql`](supabase/migrations/20260714_growth_diary.sql)을 한 번 실행합니다.

기존 성장일기에 상세 기록과 사진 업로드를 추가하려면 SQL Editor에서 [`supabase/migrations/20260715_growth_records_and_photos.sql`](supabase/migrations/20260715_growth_records_and_photos.sql)을 한 번 실행합니다. 이 마이그레이션은 비공개 `growth-photos` 버킷과 가족 단위 Storage RLS 정책도 함께 만듭니다.

아기 프로필, 생후 일수, 원터치 수유 기록을 추가하려면 [`supabase/migrations/20260715_baby_profiles_and_quick_logs.sql`](supabase/migrations/20260715_baby_profiles_and_quick_logs.sql)을 SQL Editor에서 한 번 실행합니다.

아기 프로필을 기록·사진 삭제 없이 아카이브하고 복원하려면 [`supabase/migrations/20260717_archive_baby_profiles.sql`](supabase/migrations/20260717_archive_baby_profiles.sql)을 SQL Editor에서 한 번 실행합니다.

기존 일정에 날짜 범위를 추가하려면 SQL Editor에서 [`supabase/migrations/20260715_event_date_ranges.sql`](supabase/migrations/20260715_event_date_ranges.sql)을 한 번 실행합니다. 기존 일정의 종료일은 시작일과 동일하게 자동 설정됩니다.

가족 구성원 추가와 구성원별 일정 색상을 사용하려면 [`supabase/migrations/20260715_family_calendar_members.sql`](supabase/migrations/20260715_family_calendar_members.sql)을 SQL Editor에서 한 번 실행합니다. 기존 가족 공간에는 가족·아빠·엄마·도윤이 자동 등록되며, 이후 추가한 구성원은 가족 모두에게 공유됩니다.

개인 전용 `나만의 공간`을 사용하려면 SQL Editor에서 [`supabase/migrations/20260716_private_space.sql`](supabase/migrations/20260716_private_space.sql)을 한 번 실행합니다. 이 테이블은 `auth.uid() = owner_id` RLS 정책으로 로그인한 본인에게만 읽기·쓰기·수정·삭제를 허용합니다.

기능 요청을 Supabase DB에 저장하고 가족 관리자만 조회·상태 변경하도록 하려면 [`supabase/migrations/20260716_feature_requests.sql`](supabase/migrations/20260716_feature_requests.sql)을 SQL Editor에서 한 번 실행합니다. 일반 가족 구성원은 요청 등록만 가능하며 목록 조회 권한은 없습니다.

가족 할 일을 모든 가족 기기에서 공유하려면 [`supabase/migrations/20260716_family_todos.sql`](supabase/migrations/20260716_family_todos.sql)을 SQL Editor에서 한 번 실행합니다. 적용 전에도 기능은 동작하지만 현재 기기의 로컬 저장소에만 임시 저장됩니다.

## AI 육아 도우미 배포

AI 기능은 브라우저에서 Gemini를 직접 호출하지 않습니다. 로그인 사용자는 Supabase Edge Function을 호출하며 `GEMINI_API_KEY`와 예약 작업용 `BABY_AI_CRON_SECRET`은 Supabase Function Secret으로만 보관합니다. 일반 질문은 DB에 저장하지 않고, 가족이 확정한 수유·수면 전략만 공동 저장합니다.

1. Supabase SQL Editor에서 [`supabase/migrations/20260719_baby_ai_assistant.sql`](supabase/migrations/20260719_baby_ai_assistant.sql)을 실행합니다.
2. Git에 포함되지 않는 `supabase/.env.ai` 파일을 만들고 다음 두 값을 입력합니다.

   ```dotenv
   GEMINI_API_KEY=Google_AI_Studio에서_발급한_키
   BABY_AI_CRON_SECRET=충분히_긴_무작위_문자열
   ```

3. 로컬 셸에 Supabase 프로젝트 ref를 설정한 뒤 비밀값과 함수를 배포합니다.

   ```bash
   export SUPABASE_PROJECT_ID="프로젝트-ref"
   supabase secrets set --env-file ./supabase/.env.ai --project-ref "$SUPABASE_PROJECT_ID"
   supabase functions deploy baby-ai --project-ref "$SUPABASE_PROJECT_ID"
   ```

4. Supabase Dashboard의 **Database → Vault**에 아래 이름으로 값을 등록합니다.

   - `baby_ai_project_url`: Supabase Project URL
   - `baby_ai_publishable_key`: 브라우저용 publishable key 또는 기존 anon key
   - `baby_ai_cron_secret`: `BABY_AI_CRON_SECRET`과 동일한 값

5. SQL Editor에서 [`supabase/baby-ai-cron.sql`](supabase/baby-ai-cron.sql)을 실행합니다. 5분마다 만료된 갱신 큐를 확인하며, 새 수유·수면 기록은 마지막 기록으로부터 30분 뒤 처리됩니다.

확인은 Supabase **Edge Functions → baby-ai → Logs**와 SQL Editor의 아래 쿼리로 합니다.

```sql
select jobname, schedule, active from cron.job where jobname = 'baby-ai-refresh-every-5-minutes';
select baby_id, due_at, status, attempt_count from public.baby_ai_refresh_queue order by due_at;
```

마이그레이션이나 Function Secret이 적용되지 않은 환경에서도 캘린더와 성장일기는 그대로 동작하며 AI 카드에 관리자 설정 안내만 표시됩니다. `service_role`, Gemini 키, cron 비밀값은 `config.js`, GitHub Actions 로그, 이슈 또는 채팅에 넣지 마세요.
