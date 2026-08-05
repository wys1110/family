# 백업 중복 방지 및 구성원 보관 동기화 디자인

## 목표

같은 가족 JSON 백업을 반복 복원해도 일정·성장 기록이 중복 생성되지 않게 하고,
구성원 보관 상태를 Supabase 가족 공간 전체에서 동기화한다.

## 결정

- 백업 payload는 정렬된 공유 테이블의 비가역 hash인 `backupId`를 포함한다.
- 기존 schema v1 백업은 읽을 수 있게 유지하고, 새 백업은 schema v2로 만든다.
- 로컬/테스트 모드는 household별 localStorage import 목록으로 중복을 차단한다.
- 원격 모드는 `household_backup_imports` registry의 `(household_id, backup_id)` unique 제약으로 중복을 차단한다.
- registry는 RLS를 켜고 가족 구성원만 자신의 household 행을 조회·생성할 수 있게 한다.
- 원격 복원은 registry에 이미 완료된 backupId가 있으면 쓰기 없이 종료한다.
- `calendar_members.archived_at`을 적용하고 보관은 soft archive로만 처리한다.

## 오류 처리

- 다른 household, 지원하지 않는 버전, backupId가 없는 손상 payload는 쓰기 전에 거부한다.
- registry가 없는 원격 환경에서는 복원을 진행하지 않고 마이그레이션 필요 상태를 표시한다.
- 복원 중 오류는 기존 기록을 삭제하지 않으며, 중복 방지 registry 상태와 오류를 사용자에게 알린다.

## 검증

- 순수 helper로 backupId 결정성, legacy v1 호환, 중복 판정을 테스트한다.
- migration SQL에 unique 제약, RLS, household 범위 정책을 계약 테스트로 고정한다.
- 원격 Supabase에 migration을 적용한 뒤 table 목록, advisor 결과, 브라우저 백업 다운로드를 확인한다.
