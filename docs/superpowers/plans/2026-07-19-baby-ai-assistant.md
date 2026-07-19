# AI 육아 도우미 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가족 공동 프로필과 최근 7일 수유·수면 기록을 바탕으로 일반 질문과 수유·수면 전략을 제공하는 Gemini 기반 AI 육아 도우미를 추가한다.

**Architecture:** 정적 GitHub Pages UI는 로그인 JWT로 Supabase Edge Function만 호출한다. Edge Function은 가족 권한을 확인해 DB에서 입력을 수집하고 Gemini REST API를 호출하며, 전략 초안과 30분 지연 갱신 큐는 RLS가 적용된 Supabase 테이블에 저장한다.

**Tech Stack:** Vanilla JavaScript/CSS, Supabase JS v2, PostgreSQL/RLS/pg_cron/pg_net, Supabase Edge Functions(Deno TypeScript), Gemini `generateContent` REST API, Vitest 4

## Global Constraints

- `GEMINI_API_KEY`, 예약 작업 토큰, service-role 키를 Git·브라우저·공개 DB 행에 기록하지 않는다.
- 첫 버전은 일반 질문, 수유 전략, 수면 전략만 지원한다.
- 일반 대화는 현재 브라우저 세션에만 유지한다.
- 확정 전략만 가족 공동 상태가 되며 자동 생성 초안은 확정 전략을 덮어쓰지 않는다.
- 최근 7일의 해당 아기 수유·수면 기록만 Gemini에 전달한다.
- 수유·수면 기록 저장 후 마지막 기록으로부터 30분 뒤 자동 갱신한다.
- 진단·처방·약물 용량 결정을 제공하지 않고 긴급 위험 표현은 Gemini 호출 전에 고정 안내로 처리한다.
- 기존 Supabase 설정이 없으면 현재 로컬 저장 기능은 그대로 동작하고 AI 기능만 설정 안내를 표시한다.

---

### Task 1: 테스트 기반과 브라우저 공용 규칙

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `baby-ai-core.js`
- Test: `test/baby-ai-core.test.js`

**Interfaces:**
- Consumes: 성장 기록의 `category`, ISO 날짜/시간 문자열
- Produces: `isAiCareCategory(category): boolean`, `refreshDueAt(now): string`, `shouldReplaceDraft(existingEnd, requestedEnd): boolean`, `formatStrategySections(content): Array<{title:string,items:string[]}>`

- [ ] **Step 1: 공용 규칙의 실패 테스트 작성**

```js
import { describe, expect, test } from "vitest";
import { formatStrategySections, isAiCareCategory, refreshDueAt, shouldReplaceDraft } from "../baby-ai-core.js";

describe("AI 육아 도우미 공용 규칙", () => {
  test("수유와 수면 기록만 자동 갱신 대상으로 본다", () => {
    expect(isAiCareCategory("수유·이유식")).toBe(true);
    expect(isAiCareCategory("수면")).toBe(true);
    expect(isAiCareCategory("기저귀")).toBe(false);
  });

  test("마지막 기록으로부터 30분 뒤를 예약한다", () => {
    expect(refreshDueAt(new Date("2026-07-19T10:00:00.000Z"))).toBe("2026-07-19T10:30:00.000Z");
  });

  test("더 최신 기록 범위의 초안만 교체 대상으로 본다", () => {
    expect(shouldReplaceDraft("2026-07-19T09:00:00Z", "2026-07-19T10:00:00Z")).toBe(true);
    expect(shouldReplaceDraft("2026-07-19T10:00:00Z", "2026-07-19T10:00:00Z")).toBe(false);
  });

  test("전략 JSON을 고정된 화면 섹션으로 바꾼다", () => {
    expect(formatStrategySections({ observations: ["밤잠 2회"], actions: ["조명 낮추기"], watch: ["깨는 횟수"], reassess: "3일 후" })).toEqual([
      { title: "확인한 패턴", items: ["밤잠 2회"] },
      { title: "실행 단계", items: ["조명 낮추기"] },
      { title: "관찰할 것", items: ["깨는 횟수"] },
      { title: "다시 살펴볼 때", items: ["3일 후"] },
    ]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm install && npm test -- test/baby-ai-core.test.js`

Expected: FAIL because `baby-ai-core.js` exports do not exist.

- [ ] **Step 3: 최소 구현 작성**

`package.json`:

```json
{
  "name": "family",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "check": "node --check app.js && node --check baby-ai.js && node --check baby-ai-core.js && tsc --noEmit --allowImportingTsExtensions --module esnext --moduleResolution bundler --target es2022 supabase/functions/baby-ai/*.ts"
  },
  "devDependencies": {
    "typescript": "^6.0.3",
    "vitest": "^4.1.10"
  }
}
```

`vitest.config.js`:

```js
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.js"] } });
```

`baby-ai-core.js`:

```js
export const AI_CARE_CATEGORIES = new Set(["수유·이유식", "수면"]);
export function isAiCareCategory(category) { return AI_CARE_CATEGORIES.has(category); }
export function refreshDueAt(now = new Date()) { return new Date(now.getTime() + 30 * 60_000).toISOString(); }
export function shouldReplaceDraft(existingEnd, requestedEnd) { return !existingEnd || Date.parse(requestedEnd) > Date.parse(existingEnd); }
export function formatStrategySections(content) {
  return [
    { title: "확인한 패턴", items: content.observations || [] },
    { title: "실행 단계", items: content.actions || [] },
    { title: "관찰할 것", items: content.watch || [] },
    { title: "다시 살펴볼 때", items: content.reassess ? [content.reassess] : [] },
  ];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- test/baby-ai-core.test.js`

Expected: 4 tests PASS.

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json vitest.config.js baby-ai-core.js test/baby-ai-core.test.js
git commit -m "test: add baby AI core rules"
```

### Task 2: 가족 공동 프로필·전략·갱신 큐 스키마

**Files:**
- Create: `supabase/migrations/20260719_baby_ai_assistant.sql`
- Modify: `supabase/schema.sql`
- Test: `test/baby-ai-migration.test.js`

**Interfaces:**
- Consumes: 기존 `babies`, `households`, `household_members`, `is_household_member(uuid)`
- Produces: `baby_ai_profiles`, `baby_ai_strategy_drafts`, `baby_ai_refresh_queue`, `schedule_baby_ai_refresh(uuid)`, `confirm_baby_ai_strategy(uuid)`

- [ ] **Step 1: SQL 계약 실패 테스트 작성**

```js
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const sql = readFileSync("supabase/migrations/20260719_baby_ai_assistant.sql", "utf8");

describe("AI 육아 도우미 마이그레이션", () => {
  test.each(["baby_ai_profiles", "baby_ai_strategy_drafts", "baby_ai_refresh_queue"])("%s 테이블과 RLS를 선언한다", (table) => {
    expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  });
  test("가족 권한을 확인하고 30분 뒤로 큐를 upsert한다", () => {
    expect(sql).toContain("public.is_household_member");
    expect(sql).toContain("interval '30 minutes'");
    expect(sql).toContain("on conflict (baby_id) do update");
  });
  test("새 확정 전략이 기존 확정 전략을 교체한다", () => {
    expect(sql).toContain("status = 'superseded'");
    expect(sql).toContain("status = 'confirmed'");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- test/baby-ai-migration.test.js`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: 마이그레이션과 RLS 구현**

세 테이블, 외래 키, 길이·상태 제약, 인덱스, 가족 구성원 CRUD 정책을 추가한다. `schedule_baby_ai_refresh`는 대상 아기의 가족을 조회하고 호출자의 가족 권한을 확인한 뒤 큐를 upsert한다. `confirm_baby_ai_strategy`는 같은 아기·종류의 기존 confirmed 행을 superseded로 바꾸고 선택 행을 confirmed로 바꾸는 단일 트랜잭션 함수로 작성한다.

- [ ] **Step 4: 현재 전체 스키마에도 같은 선언 반영**

신규 프로젝트가 `supabase/schema.sql` 하나로 동일한 상태를 만들도록 마이그레이션의 테이블·함수·정책을 병합한다.

- [ ] **Step 5: 통과 확인**

Run: `npm test -- test/baby-ai-migration.test.js && npm test`

Expected: migration contract and all tests PASS.

- [ ] **Step 6: 커밋**

```bash
git add supabase/schema.sql supabase/migrations/20260719_baby_ai_assistant.sql test/baby-ai-migration.test.js
git commit -m "feat: add baby AI family data model"
```

### Task 3: Gemini 프롬프트·안전·구조 검증

**Files:**
- Create: `supabase/functions/baby-ai/domain.ts`
- Test: `test/baby-ai-domain.test.js`

**Interfaces:**
- Produces: `containsUrgentSignal(text): boolean`, `sevenDayStart(now): string`, `buildChatPrompt(context, history, question): string`, `buildStrategyPrompt(context, kind): string`, `parseStrategy(raw): StrategyContent`
- `StrategyContent`: `{summary:string,observations:string[],actions:string[],watch:string[],reassess:string,safety:string}`

- [ ] **Step 1: 안전·개인정보·구조 실패 테스트 작성**

```js
import { describe, expect, test } from "vitest";
import { buildStrategyPrompt, containsUrgentSignal, parseStrategy, sevenDayStart } from "../supabase/functions/baby-ai/domain.ts";

test("긴급 표현을 감지한다", () => {
  expect(containsUrgentSignal("아기 입술이 파래지고 숨을 못 쉬어요")).toBe(true);
  expect(containsUrgentSignal("낮잠 시간을 바꾸고 싶어요")).toBe(false);
});

test("최근 7일 시작 시각을 계산한다", () => {
  expect(sevenDayStart(new Date("2026-07-19T00:00:00.000Z"))).toBe("2026-07-12T00:00:00.000Z");
});

test("프롬프트에서 식별자를 제외한다", () => {
  const prompt = buildStrategyPrompt({ baby: { ageDays: 90 }, profile: {}, logs: [], householdId: "secret-household", userId: "secret-user" }, "sleep");
  expect(prompt).not.toContain("secret-household");
  expect(prompt).not.toContain("secret-user");
  expect(prompt).toContain("진단하거나 처방하지 마세요");
});

test("완전한 전략 JSON만 허용한다", () => {
  const valid = JSON.stringify({ summary: "요약", observations: ["관찰"], actions: ["실행"], watch: ["지표"], reassess: "3일", safety: "필요시 상담" });
  expect(parseStrategy(valid).actions).toEqual(["실행"]);
  expect(() => parseStrategy('{"summary":"불완전"}')).toThrow("INVALID_STRATEGY_RESPONSE");
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- test/baby-ai-domain.test.js`

Expected: FAIL because domain exports do not exist.

- [ ] **Step 3: 최소 구현 작성**

긴급 표현 목록, 7일 범위 계산, 개인 식별자를 받지 않는 프롬프트용 context 투영, 한국어 안전 지침, 전략 JSON 타입 검증을 구현한다. 자유 텍스트와 메시지는 각각 2,000자, 대화는 최근 8개 메시지로 제한한다.

- [ ] **Step 4: 통과 확인**

Run: `npm test -- test/baby-ai-domain.test.js && npm test`

Expected: all tests PASS.

- [ ] **Step 5: 커밋**

```bash
git add supabase/functions/baby-ai/domain.ts test/baby-ai-domain.test.js
git commit -m "feat: add safe baby AI prompt domain"
```

### Task 4: 인증된 Edge Function과 Gemini 전송 계층

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/functions/baby-ai/gemini.ts`
- Create: `supabase/functions/baby-ai/handler.ts`
- Create: `supabase/functions/baby-ai/index.ts`
- Test: `test/baby-ai-handler.test.js`

**Interfaces:**
- Consumes: `action: 'chat' | 'generate-strategy' | 'process-refresh-queue'`
- Produces: `createBabyAiHandler(deps): (request: Request) => Promise<Response>`
- `GeminiTransport.generateText(prompt, { json }): Promise<string>`

- [ ] **Step 1: 핸들러 실패 테스트 작성**

가짜 인증·DB·Gemini 의존성을 주입해 다음을 검증한다.

```js
test("긴급 질문은 Gemini를 호출하지 않는다", async () => {
  let calls = 0;
  const handler = createBabyAiHandler(fakeDeps({ generateText: async () => { calls += 1; return ""; } }));
  const response = await handler(request({ action: "chat", babyId: BABY_ID, question: "숨을 못 쉬어요", history: [] }));
  expect(response.status).toBe(200);
  expect(calls).toBe(0);
});

test("다른 가족 아기는 거부한다", async () => {
  const handler = createBabyAiHandler(fakeDeps({ loadContext: async () => null }));
  expect((await handler(request({ action: "generate-strategy", babyId: BABY_ID, kind: "sleep" }))).status).toBe(404);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- test/baby-ai-handler.test.js`

Expected: FAIL because handler exports do not exist.

- [ ] **Step 3: Gemini REST 전송 계층 구현**

`GEMINI_API_KEY`가 비어 있으면 시작 시 거부한다. `GEMINI_MODEL` 기본값은 기존 runner와 같은 `gemini-2.5-flash`로 두고, `x-goog-api-key` 헤더와 `responseMimeType: application/json`을 사용한다. 비정상 HTTP 응답에는 본문·키를 노출하지 않는 오류 코드만 남긴다.

- [ ] **Step 4: 요청 핸들러 구현**

브라우저 작업은 Authorization JWT로 `auth.getUser()`를 실행하고 사용자 인증 문맥의 Supabase client로 DB를 조회한다. cron 작업은 `x-baby-ai-cron`과 `BABY_AI_CRON_SECRET`을 상수 시간 비교하고 service-role client로 만료 큐를 최대 10개 처리한다. OPTIONS preflight, 400/401/404/429/502 응답을 명시한다.

- [ ] **Step 5: 통과 확인**

Run: `npm test -- test/baby-ai-handler.test.js && npm test`

Expected: auth, urgent bypass, context isolation, response validation tests PASS.

- [ ] **Step 6: 커밋**

```bash
git add supabase/config.toml supabase/functions/baby-ai test/baby-ai-handler.test.js
git commit -m "feat: add authenticated Gemini baby AI function"
```

### Task 5: 가족 공동 프로필·대화·전략 UI

**Files:**
- Create: `baby-ai.js`
- Create: `baby-ai.css`
- Modify: `config.js`
- Modify: `index.html`
- Test: `test/baby-ai-ui-contract.test.js`

**Interfaces:**
- Consumes: global `state`, `activeBaby()`, `escapeHtml()`, `toast()`, `familybabychange`, Supabase function `baby-ai`
- Produces: `#babyAiAssistant`, 프로필 폼, 세션 대화, 수유·수면 초안과 확정 전략 UI

- [ ] **Step 1: UI 계약 실패 테스트 작성**

```js
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("AI 카드와 접근 가능한 상태 영역을 제공한다", () => {
  const html = readFileSync("index.html", "utf8");
  expect(html).toContain('id="babyAiAssistant"');
  expect(html).toContain('id="babyAiStatus"');
  expect(html).toContain('aria-live="polite"');
});

test("AI 모듈을 core 이후 로드한다", () => {
  const config = readFileSync("config.js", "utf8");
  expect(config).toContain('{ name: "baby-ai",');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- test/baby-ai-ui-contract.test.js`

Expected: FAIL because the AI card and module are absent.

- [ ] **Step 3: 카드 마크업과 스타일 구현**

성장일기의 현재 아기 콘텐츠 하단에 프로필, 질문, 전략 탭을 가진 카드를 추가한다. 모바일 1열·데스크톱 2열, 44px 이상 터치 영역, 로딩·오류·설정 필요 상태, 마지막 갱신 시각을 구현한다.

- [ ] **Step 4: 프로필·대화·전략 동작 구현**

프로필은 `baby_ai_profiles` upsert, 대화는 현재 메모리 배열만 사용, 전략은 `baby-ai` invoke와 `confirm_baby_ai_strategy` RPC를 사용한다. 아기 변경 이벤트와 로그인/부트스트랩 이후 데이터를 다시 불러온다. 입력을 HTML에 넣을 때 `escapeHtml`을 사용한다.

- [ ] **Step 5: 통과 확인**

Run: `npm test -- test/baby-ai-ui-contract.test.js && npm test`

Expected: UI contract and all tests PASS.

- [ ] **Step 6: 커밋**

```bash
git add index.html config.js baby-ai.js baby-ai.css test/baby-ai-ui-contract.test.js
git commit -m "feat: add family baby AI assistant UI"
```

### Task 6: 수유·수면 기록과 30분 갱신 연결

**Files:**
- Modify: `app.js`
- Modify: `baby-ai.js`
- Test: `test/baby-ai-growth-hook.test.js`

**Interfaces:**
- Produces: `family:growth-entry-saved` event detail `{babyId:string,category:string,savedAt:string}`
- Consumes: `schedule_baby_ai_refresh(baby_id)` RPC

- [ ] **Step 1: 기록 훅 실패 테스트 작성**

```js
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("상세 기록과 빠른 기록 성공 후 같은 이벤트를 발생시킨다", () => {
  const source = readFileSync("app.js", "utf8");
  expect(source.match(/family:growth-entry-saved/g)?.length).toBeGreaterThanOrEqual(2);
});

test("AI 모듈이 관련 기록만 큐에 예약한다", () => {
  const source = readFileSync("baby-ai.js", "utf8");
  expect(source).toContain("isAiCareCategory");
  expect(source).toContain('rpc("schedule_baby_ai_refresh"');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- test/baby-ai-growth-hook.test.js`

Expected: FAIL because save events and queue calls are absent.

- [ ] **Step 3: 저장 성공 이벤트 추가**

빠른 기록과 상세 기록의 DB/로컬 저장 성공 뒤 이벤트를 발생시킨다. 기록 저장 실패, 사진 업로드 실패, 편집 저장에는 중복 큐 작업을 만들지 않는다.

- [ ] **Step 4: 큐 예약과 화면 상태 연결**

AI 모듈은 로그인·가족 공간이 있고 카테고리가 수유·수면일 때만 RPC를 호출한다. 반환된 `due_at`을 상태 영역에 표시하고, 화면이 열려 있으면 만료 시 초안을 다시 조회한다.

- [ ] **Step 5: 통과 확인**

Run: `npm test -- test/baby-ai-growth-hook.test.js && npm test`

Expected: growth hook and all tests PASS.

- [ ] **Step 6: 커밋**

```bash
git add app.js baby-ai.js test/baby-ai-growth-hook.test.js
git commit -m "feat: queue baby AI refresh after care logs"
```

### Task 7: 운영 설정·전체 검증·배포

**Files:**
- Create: `supabase/baby-ai-cron.sql`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Requires Supabase secrets: `GEMINI_API_KEY`, `BABY_AI_CRON_SECRET`
- Requires Vault secrets: `baby_ai_project_url`, `baby_ai_publishable_key`, `baby_ai_cron_secret`

- [ ] **Step 1: 운영 문서 계약 실패 테스트 추가**

`test/baby-ai-ops.test.js`에서 README가 비밀값 등록, 마이그레이션, Function 배포, cron 설정, 비활성 상태를 모두 설명하는지 검사한다.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- test/baby-ai-ops.test.js`

Expected: FAIL because operational instructions are absent.

- [ ] **Step 3: cron SQL과 운영 문서 작성**

Vault의 세 비밀값을 읽어 5분마다 `process-refresh-queue`를 호출하는 `pg_cron` 작업을 작성한다. README에는 값 자체를 넣지 않고 Dashboard/CLI에서 비밀값을 등록하는 명령과 검증 방법만 기록한다. `.env`, `.env.*`, Supabase 임시 산출물을 ignore한다.

- [ ] **Step 4: 정적·단위 검증**

Run: `npm test && npm run check`

Expected: all tests PASS; `node --check` for browser JS and `tsc --noEmit` for function TypeScript exit 0.

- [ ] **Step 5: 로컬 브라우저 smoke test**

Run: `python3 -m http.server 4173`

Verify: 캘린더·성장일기 기존 화면, AI 설정 필요 상태, 모바일 폭 390px과 데스크톱 폭 1440px에서 가로 넘침 없음.

- [ ] **Step 6: 가능한 원격 배포 실행**

Supabase CLI 인증이 있으면 마이그레이션과 `baby-ai` Function을 배포하고 실제 로그인 JWT로 일반 질문 1회, 수면 전략 1회를 smoke test한다. 인증 또는 Gemini secret이 없으면 코드 검증 상태를 보존하고 필요한 관리자 명령만 보고한다.

- [ ] **Step 7: 최종 커밋**

```bash
git add README.md .gitignore supabase/baby-ai-cron.sql test/baby-ai-ops.test.js
git commit -m "docs: add baby AI deployment guide"
```

- [ ] **Step 8: 최종 상태 확인**

Run: `git status --short --branch && git log --oneline --decorate -8`

Expected: clean feature branch containing the design and seven implementation commits.
