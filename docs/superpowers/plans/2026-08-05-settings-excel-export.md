# 설정 탭 Excel 데이터 내보내기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 탭에서 현재 로그인한 가족 그룹의 캘린더 일정과 성장 기록만 정식 `.xlsx` 파일로 브라우저에서 내려받게 한다.

**Architecture:** `settings-data-export.js`가 기존 `#settingsView`에 접힌 내보내기 카드를 주입하고, 현재 `state.household.id`를 기준으로 RLS 보호 테이블을 조회한다. 모듈은 외부 라이브러리 없이 OOXML 파트와 무압축 ZIP 컨테이너를 생성해 Blob으로 다운로드하며, 원본 사진·인증 정보·개인 전용 `private_entries`는 포함하지 않는다.

**Tech Stack:** 정적 HTML/브라우저 JavaScript, Supabase JS Data API + 기존 RLS, OOXML ZIP, Vitest.

## Global Constraints

- 현재 가족 그룹(`state.household.id`) 데이터만 조회하며 클라이언트에서 다른 그룹 ID를 요청하지 않는다.
- 내보내기 대상은 `events`, `growth_entries`의 공유 필드뿐이며, 워크북 시트는 `캘린더 가족 일정`, `성장 기록 히스토리` 두 개로 고정한다.
- `private_entries`, 인증 토큰, Storage 원본/경로, 운영용 메타데이터는 내보내지 않는다.
- 외부 SheetJS 또는 CDN 의존성을 추가하지 않는다. ZIP은 무압축 STORE 방식으로 생성한다.
- 다운로드는 브라우저에서만 생성하고 Blob URL은 즉시 해제한다.
- 기존 미커밋 사용자 파일은 staging하지 않는다.

---

### Task 1: Export contract tests

**Files:**
- Create: `test/settings-data-export.test.js`
- Test: `settings-data-export.js`, `config.js`

**Interfaces:**
- Produces the tested constants and helpers: `SETTINGS_EXPORT_SHEETS`, `buildXlsxZip`, `sanitizeExportRow`.

- [ ] **Step 1: Write the failing tests**

  Assert that the module is listed after `settings`, defines the settings card and Excel button, scopes both export queries to the active household, emits exactly the two requested worksheets, excludes sensitive fields, and escapes XML values.

- [ ] **Step 2: Run the focused test and verify the expected failure**

  Run: `npm test -- test/settings-data-export.test.js`

  Expected: FAIL because `settings-data-export.js` and its config entry do not exist yet.

- [ ] **Step 3: Commit the tests**

  Keep the test and implementation in the same feature delivery; do not stage unrelated dirty files.

### Task 2: Browser-side workbook generator

**Files:**
- Create: `settings-data-export.js`
- Test: `test/settings-data-export.test.js`

**Interfaces:**
- `SETTINGS_EXPORT_SHEETS`: ordered sheet definitions with `name`, `headers`, and safe row mappers.
- `sanitizeExportRow(row, headers)`: returns only declared fields and converts dates/numbers to export-safe values.
- `buildXlsxZip(sheets)`: returns a valid OOXML ZIP `Uint8Array` with workbook, relationship, style, content-type, and worksheet parts.

- [ ] **Step 1: Implement the minimal XML helpers**

  Add XML escaping for `&`, `<`, `>`, `'`, and `"`; emit OOXML workbook, relationships, styles, content-type, and worksheet parts with header rows, inline string cells, and numeric cells. Pack the parts into a ZIP with a CRC-32 table and use MIME type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with filename `family-data-YYYY-MM-DD.xlsx`.

- [ ] **Step 2: Add settings card injection**

  Wait for `#settingsView`, append one `.settings-card[data-settings-data-export]`, show the included sheet labels, and keep the card hidden until `state.session` and `state.household` exist. Use a 44px button and existing settings theme tokens.

- [ ] **Step 3: Add bounded Supabase reads**

  Query each shareable table with `.eq('household_id', householdId)` and stable ordering. For `household_members`, select only membership fields; for `events` and `growth_entries`, omit note/photo path columns; for todos, omit free-form notes. Reject on any query error and do not create a Blob.

- [ ] **Step 4: Add download lifecycle**

  Disable the button while loading, create one Blob/object URL only after all reads succeed, click a temporary anchor, revoke the URL, restore the button, and display the last successful download time. Use `toast` when available for success/failure.

- [ ] **Step 5: Run the focused test and syntax check**

  Run: `npm test -- test/settings-data-export.test.js && node --check settings-data-export.js`

  Expected: all export contract tests pass and syntax check exits 0.

### Task 3: Module loading and styling

**Files:**
- Modify: `config.js`
- Modify: `service-worker.js`
- Test: `test/settings-data-export.test.js`

**Interfaces:**
- Consumes the module’s `data-settings-data-export` marker and loader version.

- [ ] **Step 1: Register the module**

  Add `{ name: "settings-data-export", version: "20260805-settings-excel-v3" }` immediately after the existing `settings` module so the settings view exists before injection.

  Add `/settings-data-export.js` to the service worker force-network list so installed iOS/PWA clients do not retain an old module copy. Bump the loader version to `20260805-settings-excel-v3`.

- [ ] **Step 2: Add compact responsive styles**

  Keep the card compact, make the download control full-width on narrow screens, use existing `--surface`, `--separator`, `--label`, and `--secondary` tokens, and preserve both white and black themes.

- [ ] **Step 3: Run focused regression tests**

  Run: `npm test -- test/settings-data-export.test.js test/global-design-harmony.test.js && git diff --check`

  Expected: export tests pass; any unrelated pre-existing design-contract failures are recorded without staging their files.

### Task 4: Live and repository verification

**Files:**
- No additional source files.

- [ ] **Step 1: Run feature-focused and syntax checks**

  Run: `npm test -- test/settings-data-export.test.js test/demo-theme-settings.test.js test/production-theme-settings.test.js`, then `node --check settings-data-export.js && git diff --check`.

- [ ] **Step 2: Verify production asset**

  Confirm `https://wys1110.github.io/family/config.js` references `settings-data-export.js?v=20260805-settings-excel-v3`.

- [ ] **Step 3: Verify the authenticated settings tab**

  Confirm the card appears only in settings, the button is enabled for a household member, an `.xlsx` download is triggered after successful reads, no console error occurs, and the card remains usable in white and black themes.

- [ ] **Step 4: Commit and push only feature files**

  Stage `settings-data-export.js`, `config.js`, `test/settings-data-export.test.js`, and the design/plan docs. Commit with `feat: add settings Excel export`, push `main`, and report any unrelated dirty files left untouched.
