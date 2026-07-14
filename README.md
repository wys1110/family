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

## 주요 기능

- 월간 달력 및 오늘 일정
- 일정 추가·수정·삭제
- 아빠·엄마·도윤 구성원별 표시
- 브라우저 로컬 저장
- Supabase 이메일 로그인 및 가족 초대 코드
- 가족 단위 RLS 데이터 보호
