# AI 육아 도우미 검색 근거·전략 복구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 간헐적으로 실패하는 수유·수면 전략 생성을 복구하고, 공식 웹·검증된 소아과 유튜브 자료에 근거한 쉬운 답변과 출처 링크를 제공한다.

**Architecture:** 먼저 Gemini 전략 출력에 JSON Schema를 강제해 현재 `INVALID_STRATEGY_RESPONSE` 장애를 제거한다. 이후 개인 정보를 제거한 검색 입력으로 Google Search grounding을 실행하고, 검색 근거와 기존 비식별 가족 문맥을 두 번째 합성 호출에서 결합한다. 실제 `groundingMetadata`에서 추출·검증한 출처만 API와 화면에 전달한다.

**Tech Stack:** JavaScript, TypeScript, Deno Supabase Edge Functions, Supabase JS v2, Gemini 2.5 Flash REST API, Google Search grounding, Vitest, GitHub Pages

## Global Constraints

- 의료 진단·처방과 약 이름·용량 추천을 하지 않는다.
- 긴급 신호는 Gemini와 웹 검색을 호출하기 전에 119 또는 응급실 안내를 반환한다.
- 검색 입력에 아기·부모 이름, 계정 식별자, 정확한 가족 일정, 자유 메모, 전화번호, 이메일, URL을 포함하지 않는다.
- 실제 `groundingMetadata`에 없는 URL은 출처로 인정하지 않는다.
- 출처 우선순위는 국내 공공기관·학회, 해외 공식기관, 대학병원, 검증된 소아청소년과 전문의 유튜브 순서다.
- 일반 답변은 `한 줄 결론 → 지금 할 일 → 지켜볼 것 → 병원에 갈 때 → 참고한 자료` 순서와 쉬운 한국어를 사용한다.
- 기존 API 필드는 하위 호환성을 유지하며 새 필드 `sources`와 `grounded`만 추가한다.
- 검색 내용과 가족 문맥은 로그에 남기지 않고 정해진 오류 코드만 기록한다.

---

## File map

- `supabase/functions/baby-ai/gemini.ts`: Gemini 요청 옵션, JSON Schema, grounding 메타데이터 추출
- `supabase/functions/baby-ai/domain.ts`: 검색용 비식별 입력, 쉬운 설명 프롬프트, 전략 파싱 타입
- `supabase/functions/baby-ai/sources.ts`: URL 정규화와 신뢰 가능한 웹·유튜브 출처 검증
- `supabase/functions/baby-ai/handler.ts`: 검색과 합성의 두 단계 orchestration, 오류 코드
- `supabase/functions/baby-ai/index.ts`: 실제 Gemini·DB 의존성 연결과 운영 오류 로깅
- `baby-ai.js`: 출처 링크 렌더링과 Function 오류별 사용자 메시지
- `baby-ai.css`: 출처 목록 모바일·PC 스타일
- `test/baby-ai-gemini.test.js`: Schema와 grounding 메타데이터 계약
- `test/baby-ai-domain.test.js`: 검색 입력 개인정보 제거와 쉬운 설명 지침
- `test/baby-ai-sources.test.js`: 출처 허용·차단 규칙
- `test/baby-ai-handler.test.js`: 두 단계 호출, 긴급 우회, 오류 분류
- `test/baby-ai-ui-contract.test.js`: 출처 UI와 오류 메시지 계약

### Task 1: 전략 JSON Schema 강제와 현재 장애 복구 코드

**Files:**
- Modify: `supabase/functions/baby-ai/gemini.ts`
- Modify: `supabase/functions/baby-ai/handler.ts`
- Test: `test/baby-ai-gemini.test.js`
- Test: `test/baby-ai-handler.test.js`

**Interfaces:**
- Consumes: 기존 `generateText(prompt, { json })`
- Produces: `generateText(prompt, { json, responseSchema? })`, `STRATEGY_RESPONSE_SCHEMA`

- [ ] **Step 1: 전략 요청이 필수 Schema를 전달한다는 실패 테스트 작성**

```js
test("전략 생성은 여섯 필수 필드의 JSON schema를 전달한다", async () => {
  let received;
  const handler = createBabyAiHandler(fakeDeps({
    generateText: async (_prompt, options) => {
      received = options.responseSchema;
      return JSON.stringify(validStrategy);
    },
  }));
  await handler(strategyRequest("sleep"));
  expect(received.required).toEqual([
    "summary", "observations", "actions", "watch", "reassess", "safety",
  ]);
});
```

- [ ] **Step 2: 대상 테스트가 `responseSchema` 부재로 실패하는지 확인**

Run: `npm test -- test/baby-ai-handler.test.js test/baby-ai-gemini.test.js`

Expected: `received` 또는 Gemini 요청 body의 `responseSchema`가 `undefined`여서 FAIL.

- [ ] **Step 3: 최소 JSON Schema와 Gemini generationConfig 전달 구현**

```ts
export const STRATEGY_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "쉬운 한국어 한 줄 요약" },
    observations: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
    watch: { type: "array", items: { type: "string" } },
    reassess: { type: "string" },
    safety: { type: "string" },
  },
  required: ["summary", "observations", "actions", "watch", "reassess", "safety"],
  additionalProperties: false,
};
```

`gemini.ts`의 JSON 요청에는 다음을 넣는다.

```ts
generationConfig: {
  responseMimeType: "application/json",
  responseSchema: requestOptions.responseSchema,
}
```

- [ ] **Step 4: 대상 테스트와 전체 검사를 통과시킨다**

Run: `npm test -- test/baby-ai-handler.test.js test/baby-ai-gemini.test.js && npm run check`

Expected: 대상 테스트 PASS, TypeScript 오류 0개.

- [ ] **Step 5: 장애 복구 코드를 커밋한다**

```bash
git add supabase/functions/baby-ai/gemini.ts supabase/functions/baby-ai/handler.ts test/baby-ai-gemini.test.js test/baby-ai-handler.test.js
git commit -m "fix: enforce baby AI strategy schema"
```

### Task 2: 검색용 개인정보 제거와 쉬운 설명 프롬프트

**Files:**
- Modify: `supabase/functions/baby-ai/domain.ts`
- Test: `test/baby-ai-domain.test.js`

**Interfaces:**
- Produces: `buildEvidencePrompt(context, topic, question?)`, `buildChatPrompt(context, history, question, evidence)`, `buildStrategyPrompt(context, kind, evidence)`

- [ ] **Step 1: 검색 입력 개인정보 제거와 답변 형식 실패 테스트 작성**

```js
test("검색 입력은 자유 메모와 연락처를 보내지 않는다", () => {
  const context = sampleContext({
    profile: { babyNotes: "민준 010-1234-5678 parent@example.com" },
  });
  const prompt = buildEvidencePrompt(context, "sleep", "민준이가 잠을 못 자요");
  expect(prompt).not.toContain("민준");
  expect(prompt).not.toContain("010-1234-5678");
  expect(prompt).not.toContain("parent@example.com");
  expect(prompt).toContain("영아 수면");
});

test("최종 답변 프롬프트는 쉬운 다섯 부분을 요구한다", () => {
  const prompt = buildChatPrompt(context, [], "질문", "공식 근거");
  for (const title of ["한 줄 결론", "지금 할 일", "지켜볼 것", "병원에 갈 때", "참고한 자료"]) {
    expect(prompt).toContain(title);
  }
  expect(prompt).toContain("초등학생도 이해");
});
```

- [ ] **Step 2: 새 함수와 인자가 없어 실패하는지 확인**

Run: `npm test -- test/baby-ai-domain.test.js`

Expected: `buildEvidencePrompt` 미정의 또는 새 문구 부재로 FAIL.

- [ ] **Step 3: 구조화된 일반 정보만 쓰는 검색 프롬프트 구현**

```ts
export function buildEvidencePrompt(context, topic, question = "") {
  const ageBand = ageBandForDays(context.baby?.ageDays);
  const safeQuestion = sanitizeSearchText(question);
  return [
    `${ageBand} ${topic === "feeding" ? "영아 수유" : "영아 수면"} 일반 원칙을 검색하세요.`,
    safeQuestion ? `일반화한 질문: ${safeQuestion}` : "",
    "공식 의료기관과 검증된 소아청소년과 전문의 자료를 우선하세요.",
    "개인 이름이나 가족 일정은 검색하지 마세요.",
  ].filter(Boolean).join("\n");
}
```

`sanitizeSearchText`는 전화번호, 이메일, URL을 마스킹하고 한글 이름으로 단정할 수 있는 자유 문구는 검색 입력에서 제외한다. 검색 질문은 `수면`, `수유`, `분유`, `모유`, `울음`, `낮잠`, `밤잠`처럼 허용한 일반 키워드만 남긴다.

- [ ] **Step 4: 대상 테스트를 통과시킨다**

Run: `npm test -- test/baby-ai-domain.test.js`

Expected: 모든 domain 테스트 PASS.

- [ ] **Step 5: 도메인 변경을 커밋한다**

```bash
git add supabase/functions/baby-ai/domain.ts test/baby-ai-domain.test.js
git commit -m "feat: add private baby AI search prompts"
```

### Task 3: 실제 웹·유튜브 출처 추출과 검증

**Files:**
- Create: `supabase/functions/baby-ai/sources.ts`
- Modify: `supabase/functions/baby-ai/gemini.ts`
- Test: `test/baby-ai-sources.test.js`
- Test: `test/baby-ai-gemini.test.js`

**Interfaces:**
- Produces: `GroundedSource`, `resolveTrustedSources(chunks, fetchImpl)`, `GeminiResult`, `generateText(prompt, { grounding })`

- [ ] **Step 1: 실제 메타데이터만 허용하는 실패 테스트 작성**

```js
test("공식 웹과 하정훈 채널만 출처로 남긴다", async () => {
  const sources = await resolveTrustedSources([
    { web: { title: "질병관리청", uri: "https://kdca.go.kr/example" } },
    { web: { title: "광고 블로그", uri: "https://example.com/ad" } },
    { web: { title: "하정훈의 삐뽀삐뽀 119 소아과", uri: "https://www.youtube.com/channel/UC6t0ees15Lp0gyrLrAyLeJQ" } },
  ], fakeSourceFetch);
  expect(sources.map((source) => source.title)).toEqual([
    "질병관리청", "하정훈의 삐뽀삐뽀 119 소아과",
  ]);
});

test("본문에만 적힌 URL은 출처가 아니다", async () => {
  const result = await groundedTransportWith({
    text: "답변 https://untrusted.example",
    groundingMetadata: { groundingChunks: [] },
  });
  expect(result.sources).toEqual([]);
});
```

- [ ] **Step 2: 출처 모듈 부재로 실패하는지 확인**

Run: `npm test -- test/baby-ai-sources.test.js test/baby-ai-gemini.test.js`

Expected: 모듈 또는 `sources` 필드가 없어 FAIL.

- [ ] **Step 3: 출처 타입과 동기 검증 구현**

```ts
export type GroundedSource = {
  title: string;
  url: string;
  type: "web" | "youtube";
};

const TRUSTED_HOSTS = [
  "kdca.go.kr", "mohw.go.kr", "pediatrics.or.kr", "nfa.go.kr",
  "who.int", "cdc.gov", "aap.org", "healthychildren.org", "nhs.uk",
];
const HA_CHANNEL_ID = "UC6t0ees15Lp0gyrLrAyLeJQ";
```

HTTPS만 허용하고, 호스트는 정확히 일치하거나 허용 도메인의 하위 도메인이어야 한다. Google 검색 리디렉션 URL은 `redirect: "follow"`로 한 번 해석한 최종 URL을 검사하며, `localhost`, `.local`, 사설 IP 대역은 항상 거부한다. 각 확인 요청은 3초 뒤 중단한다.

YouTube 채널 URL은 `/channel/UC6t0ees15Lp0gyrLrAyLeJQ`가 확인될 때만 허용한다. 개별 영상 URL은 YouTube oEmbed의 `author_url`을 가져온 뒤 해당 채널 페이지에서 `UC6t0ees15Lp0gyrLrAyLeJQ`를 확인해야 허용한다. 중복 URL은 첫 항목만 남기고 최대 5개로 제한한다. 테스트의 `fakeSourceFetch`는 공식 URL 리디렉션, 차단 도메인, oEmbed 저자 URL, 올바른 채널 ID 응답을 모두 고정 fixture로 반환한다.

- [ ] **Step 4: Gemini 반환형과 grounding 요청을 구현**

```ts
export type GeminiResult = {
  text: string;
  sources: GroundedSource[];
  grounded: boolean;
};
```

`grounding: true`이면 request body에 다음을 추가한다.

```ts
tools: [{ google_search: {} }]
```

응답의 `candidates[0].groundingMetadata.groundingChunks`만 `resolveTrustedSources`에 전달한다. 검색을 사용하지 않는 합성 호출도 같은 `GeminiResult` 형태로 반환하되 `sources: []`, `grounded: false`로 둔다.

- [ ] **Step 5: 대상 테스트를 통과시킨다**

Run: `npm test -- test/baby-ai-sources.test.js test/baby-ai-gemini.test.js`

Expected: 출처와 Gemini 테스트 PASS.

- [ ] **Step 6: 검색 전송 계층을 커밋한다**

```bash
git add supabase/functions/baby-ai/sources.ts supabase/functions/baby-ai/gemini.ts test/baby-ai-sources.test.js test/baby-ai-gemini.test.js
git commit -m "feat: ground baby AI with trusted sources"
```

### Task 4: 검색 근거와 가족 문맥의 두 단계 합성

**Files:**
- Modify: `supabase/functions/baby-ai/handler.ts`
- Modify: `supabase/functions/baby-ai/index.ts`
- Test: `test/baby-ai-handler.test.js`
- Test: `test/baby-ai-index-contract.test.js`

**Interfaces:**
- Consumes: `GeminiResult`, `buildEvidencePrompt`, `STRATEGY_RESPONSE_SCHEMA`
- Produces: `{ answer, urgent, sources, grounded }`, 전략 `content.sources`

- [ ] **Step 1: 검색 후 합성과 긴급 우회 실패 테스트 작성**

```js
test("일반 전략은 검색 후 schema 합성을 하고 실제 출처를 저장한다", async () => {
  const calls = [];
  const handler = createBabyAiHandler(fakeDeps({
    generateText: async (prompt, options) => {
      calls.push(options);
      if (options.grounding) return { text: "공식 근거", sources: [officialSource], grounded: true };
      return { text: JSON.stringify(validStrategy), sources: [], grounded: false };
    },
  }));
  const response = await handler(strategyRequest("sleep"));
  expect(calls.map((call) => call.grounding)).toEqual([true, false]);
  expect((await response.json()).content.sources).toEqual([officialSource]);
});

test("긴급 질문은 검색도 합성도 호출하지 않는다", async () => {
  let calls = 0;
  const handler = createBabyAiHandler(fakeDeps({ generateText: async () => { calls += 1; } }));
  const response = await handler(chatRequest("아기가 숨을 못 쉬어요"));
  expect(calls).toBe(0);
  expect((await response.json()).urgent).toBe(true);
});
```

- [ ] **Step 2: 기존 한 단계 호출로 테스트가 실패하는지 확인**

Run: `npm test -- test/baby-ai-handler.test.js test/baby-ai-index-contract.test.js`

Expected: 호출 횟수, 반환형 또는 `sources`가 달라 FAIL.

- [ ] **Step 3: 채팅·전략 두 단계 orchestration 구현**

```ts
const evidence = await deps.generateText(buildEvidencePrompt(context, topic, question), {
  json: false,
  grounding: true,
});
const synthesis = await deps.generateText(
  buildChatPrompt(context, history, question, evidence.text),
  { json: false, grounding: false },
);
```

전략 합성에는 `responseSchema: STRATEGY_RESPONSE_SCHEMA`를 전달한다. 최종 `sources`는 검색 결과에서만 가져오며 합성 본문의 URL은 무시한다. 허용 출처가 0개면 공식 출처를 요구하는 검색을 한 번 재시도하고, 다시 0개면 `GROUNDING_UNAVAILABLE`을 반환한다.

- [ ] **Step 4: 오류 코드를 보존하는 서버 로깅 구현**

`handler.ts`는 `GEMINI_HTTP_429`, `GEMINI_HTTP_5XX`, `INVALID_AI_RESPONSE`, `GROUNDING_UNAVAILABLE`, `DRAFT_SAVE_FAILED`를 외부 안전 코드로 매핑한다. `index.ts`는 질문·프롬프트·응답 내용을 기록하지 않고 다음 형태만 기록한다.

```ts
console.error("BABY_AI_ERROR", { code: safeErrorCode(error), action: body.action });
```

- [ ] **Step 5: 대상 테스트와 전체 서버 검사를 통과시킨다**

Run: `npm test -- test/baby-ai-handler.test.js test/baby-ai-index-contract.test.js && npm run check`

Expected: 대상 테스트 PASS, TypeScript 오류 0개.

- [ ] **Step 6: orchestration을 커밋한다**

```bash
git add supabase/functions/baby-ai/handler.ts supabase/functions/baby-ai/index.ts test/baby-ai-handler.test.js test/baby-ai-index-contract.test.js
git commit -m "feat: synthesize grounded baby AI guidance"
```

### Task 5: 출처 UI와 실제 오류 메시지

**Files:**
- Modify: `baby-ai.js`
- Modify: `baby-ai.css`
- Test: `test/baby-ai-ui-contract.test.js`

**Interfaces:**
- Consumes: API `sources`, `grounded`, 안전 오류 코드
- Produces: `renderBabyAiSources(sources)`, `readFunctionErrorCode(error)`, `babyAiErrorMessage(code)`

- [ ] **Step 1: 출처 링크와 오류 분기 실패 테스트 작성**

```js
test("AI 화면은 안전한 출처 링크와 오류별 문구를 제공한다", () => {
  expect(ui).toContain("renderBabyAiSources");
  expect(ui).toContain('rel="noopener noreferrer"');
  expect(ui).toContain("로그인이 만료됐어요");
  expect(ui).toContain("AI 사용량이 잠시 많아요");
  expect(ui).toContain("답변 형식을 확인하지 못했어요");
});
```

- [ ] **Step 2: 기존 UI에 출처와 오류 분기가 없어 실패하는지 확인**

Run: `npm test -- test/baby-ai-ui-contract.test.js`

Expected: 새 함수 또는 문구 부재로 FAIL.

- [ ] **Step 3: 출처 렌더링과 Function 오류 판독 구현**

```js
function renderBabyAiSources(sources = []) {
  const safeSources = sources.slice(0, 5).filter((source) => /^https:\/\//.test(source.url));
  if (!safeSources.length) return "";
  return `<section class="baby-ai-sources"><strong>참고한 자료</strong><ul>${safeSources.map((source) =>
    `<li><a href="${safeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${safeHtml(source.title)}</a></li>`
  ).join("")}</ul></section>`;
}
```

`FunctionsHttpError.context`의 JSON body에서 안전 오류 코드만 읽고 로그인 만료, 네트워크, 할당량, 구조 오류, 검색 근거 없음, 서버 설정 누락으로 매핑한다. 알 수 없는 오류는 기존의 일반 재시도 문구를 사용한다.

- [ ] **Step 4: 채팅과 전략 카드에 출처를 연결한다**

채팅 history의 assistant message에 `sources`를 보관하고 답변 바로 아래 렌더링한다. 전략은 `content.sources`를 `안전 안내` 다음에 렌더링한다. 기존 전략에 출처가 없으면 `출처 표시 기능 적용 전에 생성된 전략이에요.`를 표시한다.

- [ ] **Step 5: 모바일·PC 스타일을 추가하고 테스트한다**

```css
.baby-ai-sources a { overflow-wrap: anywhere; }
.baby-ai-sources ul { margin: 0.5rem 0 0; padding-left: 1.2rem; }
```

Run: `npm test -- test/baby-ai-ui-contract.test.js && npm run check`

Expected: UI 계약과 정적 검사 PASS.

- [ ] **Step 6: UI를 커밋한다**

```bash
git add baby-ai.js baby-ai.css test/baby-ai-ui-contract.test.js
git commit -m "feat: show baby AI sources and errors"
```

### Task 6: 전체 검증, 운영 복구, 배포

**Files:**
- Modify only if verification exposes a scoped defect

**Interfaces:**
- Consumes: all prior tasks
- Produces: deployed Edge Function, recovered queue, GitHub Pages build

- [ ] **Step 1: 전체 테스트와 정적 검사를 실행한다**

Run: `npm test && npm run check`

Expected: 모든 테스트 PASS, TypeScript와 JavaScript 검사 오류 0개.

- [ ] **Step 2: Edge Function을 배포한다**

Run: `npx supabase functions deploy baby-ai --project-ref ljutcgmgtqfkwkxdbiyb --no-verify-jwt`

Expected: `baby-ai`의 새 버전이 `ACTIVE`.

- [ ] **Step 3: 실패 큐 한 건만 복구한다**

Management API에서 다음 SQL을 실행한다.

```sql
update baby_ai_refresh_queue
set status = 'pending', attempt_count = 0, last_error = null,
    due_at = now(), updated_at = now()
where status = 'failed'
  and attempt_count >= 3
  and last_error = 'INVALID_STRATEGY_RESPONSE';
```

Expected: 현재 확인된 실패 행 1개만 갱신.

- [ ] **Step 4: cron 처리 경로를 한 번 호출한다**

Vault의 `baby_ai_cron_secret`을 shell 변수에만 읽어 `x-baby-ai-cron` 헤더로 호출하고 값은 출력하지 않는다.

Expected: HTTP 200, `processed: 1`, `failed: 0`.

- [ ] **Step 5: 전략과 큐의 운영 상태를 확인한다**

```sql
select kind, status, generated_at
from baby_ai_strategy_drafts
order by generated_at desc
limit 4;

select status, attempt_count, last_error
from baby_ai_refresh_queue;
```

Expected: 새 수유·수면 draft 생성, 대상 큐 제거. 질문·가족 메모는 출력하지 않는다.

- [ ] **Step 6: GitHub에 푸시하고 PR을 병합한다**

```bash
git push -u origin agent/baby-ai-grounded-sources
gh pr create --base main --head agent/baby-ai-grounded-sources --title "feat: ground baby AI guidance" --body "Adds official web and trusted pediatric YouTube grounding, easy Korean answers, reliable strategy JSON schema, source links, and safer error messages. Verified with npm test and npm run check."
pr_number=$(gh pr view --json number --jq .number)
gh pr merge "$pr_number" --merge --delete-branch
```

Expected: PR `MERGED`, local `main`과 `origin/main` SHA 일치.

- [ ] **Step 7: Pages 배포와 라이브 자산을 확인한다**

Run: latest `Deploy family calendar to Pages` workflow를 `gh run watch --exit-status`로 확인.

Expected: workflow `success`; 라이브 `baby-ai.js`에 `renderBabyAiSources`, 라이브 HTML에 `babyAiAssistant` 존재.

- [ ] **Step 8: 최종 비밀·임시 파일을 정리한다**

cron 비밀, Management API 응답, PR 본문 등 이번 작업의 임시 파일만 정확한 경로로 삭제한다. Supabase Secrets와 Vault의 운영 값은 유지한다.

Expected: Git working tree clean, 임시 비밀 파일 없음.
