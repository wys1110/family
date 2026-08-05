# 설정 관리 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 화면에 가족 구성원 관리, 가족 공간 요약/공유, household-scoped JSON 백업·복원을 추가한다.

**Architecture:** 기존 설정 모듈과 분리된 `settings-family-management.js`가 구성원·공간 UI와 순수 백업 helper를 제공한다. `settings-data-export.js`는 기존 Excel 책임을 유지하고 JSON backup API만 별도 모듈에서 소비한다. 원격 저장은 항상 현재 household id를 컨텍스트에서 주입한다.

**Tech Stack:** Vanilla JavaScript, DOM modules loaded by `config.js`, Supabase REST client already exposed on `state`, Vitest.

## Global Constraints

- 기존 화이트/다크 테마와 Excel 두 시트 이름을 변경하지 않는다.
- 알림·활동 공개·설정 새로고침 카드는 다시 노출하지 않는다.
- 기존 미커밋 변경은 스테이징하지 않는다.
- 모든 원격 조회·삽입은 현재 `state.household.id` 범위로 제한한다.
- 백업에는 private entries, auth token, invite code 원문, photo path를 넣지 않는다.

### Task 1: Backup contract helpers

**Files:**
- Create: `settings-backup.js`
- Create: `test/settings-backup.test.js`
- Modify: `config.js`
- Modify: `service-worker.js`

- [x] Write failing tests for fingerprint determinism, rejecting mismatched households/versions, and excluding private fields.
- [x] Run `npx vitest run test/settings-backup.test.js` and confirm RED.
- [x] Implement pure helpers `createBackupPayload`, `validateBackupPayload`, `householdFingerprint`, and `BACKUP_SCHEMA_VERSION`.
- [x] Run the focused test and then `npx vitest run test/settings-backup.test.js` again.
- [x] Register the module and cache-bust it through the existing config/service-worker patterns.

### Task 2: Family member settings UI

**Files:**
- Create: `settings-family-management.js`
- Create: `settings-family-management.css`
- Create: `test/settings-family-management.test.js`
- Modify: `config.js`
- Modify: `service-worker.js`

- [x] Write failing contract tests for household-scoped member queries, duplicate-name rejection, and archive instead of delete.
- [x] Run the focused test and confirm RED.
- [x] Implement a compact settings card listing members, edit name/color, add, and archive controls using existing `calendar_members` schema.
- [x] Use localStorage only when no Supabase context exists; use `.eq('household_id', state.household.id)` for remote operations.
- [x] Run focused tests and `git diff --check`.

### Task 3: Family space summary/actions

**Files:**
- Modify: `settings-family-management.js`
- Modify: `settings-family-management.css`
- Modify: `test/settings-family-management.test.js`

- [x] Add failing assertions for current household name, masked signed-in email, member count, invite share/copy, and reuse of existing logout behavior.
- [x] Run focused tests and confirm RED.
- [x] Implement the compact family-space card; do not add destructive leave/delete actions in this pass.
- [x] Run focused tests and verify no notification settings are re-exposed.

### Task 4: JSON backup/restore UI

**Files:**
- Modify: `settings-family-management.js`
- Modify: `settings-family-management.css`
- Modify: `test/settings-family-management.test.js`

- [x] Add failing tests for household-scoped table reads, JSON download, mismatched-file blocking before writes, and append-only restore.
- [x] Run focused tests and confirm RED.
- [x] Implement JSON backup for events, growth entries, calendar members, and babies; inject current household id on every remote write.
- [x] Add file picker, validation status, preview counts, and restore button; reject malformed or mismatched files without writes.
- [x] Run focused tests and verify the existing Excel card remains unchanged.

### Task 5: Browser and regression verification

- [x] Run `npx vitest run test/settings-backup.test.js test/settings-family-management.test.js test/settings-data-export.test.js`.
- [x] Run `npm test` or the repository’s documented full test command, plus `git diff --check`.
- [x] Open the settings tab in the in-app browser and verify card order, compact layout, member edit/archive, backup download, and mismatch rejection.
- [x] Commit only the new settings files, config/cache references, tests, and docs from this task.
