# 관리자 운영 도구 설계

## 목표

관리자 탭에 운영 상태, 데이터 정합성, 관리자 감사, 안전한 데이터 내보내기를 추가하되 현재의 접힌 카드 구조와 한눈에 보는 요약을 유지한다.

## 범위

- 운영 상태: 관리자용 RPC가 정상 응답하는지, 최근 앱 활동과 감사 기록의 최신 시각, 열린 기능 요청 수를 요약한다.
- 데이터 정합성: 그룹 미가입 사용자, 구성원이 없는 가족 그룹, 소유자/구성원 불일치, 아기 AI 프로필의 가족 불일치, 성장 기록의 아기/가족 불일치, Storage의 존재하지 않는 가족 폴더를 읽기 전용 경고로 보여준다.
- 관리자 감사: 관리자 화면 조회, 운영 점검, 내보내기, 기능 요청 상태 변경을 개인정보 최소화된 로그로 남기고 최근 기록을 보여준다.
- 데이터 내보내기: 플랫폼 관리자만 전체 가족 데이터의 JSON 스냅샷과 민감한 본문을 제외한 CSV 요약을 브라우저에 다운로드한다. 서버 Storage에는 파일을 만들지 않는다.

## UX

`admin-ops.js` 하나의 운영 카드로 네 기능을 묶는다. 카드 헤더에는 운영 상태·정합성 경고 수·최근 감사 시각을 3개 타일로 노출하고 상세 본문은 기본 접는다. 상세 본문에는 상태 점검 버튼, 경고 목록, JSON/CSV 다운로드 버튼, 최근 관리자 감사 10건을 배치한다. 기존 관리자 카드와 같은 `data-admin-collapsed`, `data-admin-card-body`, 44px 터치 영역 규칙을 사용한다.

## 데이터/API

새 migration `20260804_platform_admin_operations.sql`에서 다음을 추가한다.

- `platform_admin_audit_logs`: 관리자 ID, action, optional target, 제한된 metadata, timestamp를 저장한다. RLS를 켜고 테이블 직접 접근은 막는다.
- `log_platform_admin_action(action, metadata)`: `is_platform_admin()`을 재검증한 뒤 허용된 action만 기록한다.
- `list_platform_admin_audit_logs(limit)`: 관리자만 최근 기록을 조회한다.
- `get_platform_admin_operations()`: 관리자만 운영 상태와 정합성 검사 결과를 JSON으로 반환한다.
- `get_platform_admin_export()`: 관리자만 private_entries와 비공개 인증 원문을 제외한 앱 데이터를 JSON으로 반환한다.

모든 `SECURITY DEFINER` 함수는 `search_path`를 고정하고 실행 권한을 `authenticated`로 제한한다. 클라이언트는 RPC 오류를 카드 단위로 표시하며, migration 미적용 시 실행 SQL 파일명을 안내한다.

## 보안/개인정보

- 브라우저에는 기존 publishable/anon 키만 사용하고 service role은 노출하지 않는다.
- 관리자 함수는 호출 시점마다 `is_platform_admin()`을 재검증한다.
- 감사 metadata에는 이메일, 일정 제목, 메모, 사진 URL, 성장 수치 원문을 넣지 않는다.
- CSV는 집계·식별자·날짜 중심으로 만들고 본문/메모/사진 경로는 제외한다.
- 삭제·차단·그룹 이동은 이번 범위에 포함하지 않는다.

## 검증

- 정적 계약 테스트로 새 module loader, 접힌 카드, RPC 이름, 데이터 내보내기 포맷, 허용 action을 확인한다.
- SQL은 `supabase db`/MCP 적용 후 관리자 RPC를 실제 호출하고, advisors security/performance 결과를 확인한다.
- `npm test`, `node --check`, `git diff --check`와 배포된 관리자 화면의 접힘·새로고침·다운로드를 확인한다.
