import {
  buildChatPrompt,
  buildEvidencePrompt,
  buildStrategyPrompt,
  containsUrgentSignal,
  parseStrategy,
  sevenDayStart,
  URGENT_GUIDANCE,
  type BabyAiContext,
  type ChatMessage,
  type StrategyContent,
  type StrategyKind,
} from "./domain.ts";
import type { GeminiResult } from "./gemini.ts";
import type { GroundedSource } from "./sources.ts";

export type HandlerDependencies = {
  authenticate(request: Request): Promise<{ userId: string } | null>;
  isCronAuthorized(request: Request): boolean;
  loadContext(userId: string, babyId: string): Promise<BabyAiContext | null>;
  generateGroundedText(prompt: string): Promise<GeminiResult>;
  generateText(prompt: string, options: { json: boolean; responseSchema?: Record<string, unknown> }): Promise<string>;
  reportError?(code: string, action: string): void;
  saveDraft(input: {
    userId: string;
    babyId: string;
    kind: StrategyKind;
    content: StrategyContent;
    sourceWindowStart: string;
    sourceWindowEnd: string;
    sourceLogCount: number;
  }): Promise<{ id: string }>;
  retryRefresh(input: {
    userId: string;
    babyId: string;
    context: BabyAiContext;
  }): Promise<{ dueAt: string }>;
  processRefreshQueue(): Promise<{ processed: number; failed: number }>;
  now(): Date;
};

type RequestBody = {
  action?: string;
  babyId?: string;
  question?: string;
  history?: ChatMessage[];
  kind?: StrategyKind;
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-baby-ai-cron",
  "access-control-allow-methods": "POST, OPTIONS",
};

export const STRATEGY_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING", description: "쉬운 한국어 한 줄 요약" },
    observations: { type: "ARRAY", items: { type: "STRING" } },
    actions: { type: "ARRAY", items: { type: "STRING" } },
    watch: { type: "ARRAY", items: { type: "STRING" } },
    reassess: { type: "STRING" },
    safety: { type: "STRING" },
  },
  required: ["summary", "observations", "actions", "watch", "reassess", "safety"],
};

export function createBabyAiHandler(deps: HandlerDependencies) {
  return async function handleBabyAi(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return json({ error: "INVALID_JSON" }, 400);
    }

    if (body.action === "process-refresh-queue") {
      if (!deps.isCronAuthorized(request)) return json({ error: "UNAUTHORIZED" }, 401);
      try {
        return json(await deps.processRefreshQueue());
      } catch {
        return json({ error: "REFRESH_PROCESSING_FAILED" }, 502);
      }
    }

    const auth = await deps.authenticate(request);
    if (!auth) return json({ error: "UNAUTHORIZED" }, 401);
    if (!isUuid(body.babyId)) return json({ error: "INVALID_BABY_ID" }, 400);

    const context = await deps.loadContext(auth.userId, body.babyId);
    if (!context) return json({ error: "BABY_NOT_FOUND" }, 404);

    try {
      if (body.action === "chat") {
        return await handleChat(deps, context, body);
      }
      if (body.action === "generate-strategy") {
        return await handleStrategy(deps, auth.userId, context, body);
      }
      if (body.action === "retry-refresh") {
        return json(await deps.retryRefresh({
          userId: auth.userId,
          babyId: body.babyId,
          context,
        }));
      }
      return json({ error: "UNKNOWN_ACTION" }, 400);
    } catch (error) {
      const errorCode = publicErrorCode(error);
      deps.reportError?.(safeErrorCode(error), String(body.action || "unknown"));
      return json({ error: errorCode }, 502);
    }
  };
}

async function handleChat(
  deps: HandlerDependencies,
  context: BabyAiContext,
  body: RequestBody,
): Promise<Response> {
  const question = String(body.question || "").trim().slice(0, 2000);
  if (!question) return json({ error: "QUESTION_REQUIRED" }, 400);
  if (containsUrgentSignal(question)) {
    return json({ answer: URGENT_GUIDANCE, urgent: true });
  }

  const history = Array.isArray(body.history) ? body.history : [];
  const evidence = await loadGroundedEvidence(deps, context, topicForQuestion(question), question);
  const answer = await deps.generateText(buildChatPrompt(context, history, question, evidence.text), { json: false });
  if (!answer.trim()) throw new Error("EMPTY_AI_RESPONSE");
  return json({
    answer: answer.trim().slice(0, 8000),
    urgent: false,
    sources: evidence.sources,
    grounded: true,
  });
}

async function handleStrategy(
  deps: HandlerDependencies,
  userId: string,
  context: BabyAiContext,
  body: RequestBody,
): Promise<Response> {
  if (body.kind !== "feeding" && body.kind !== "sleep") {
    return json({ error: "INVALID_STRATEGY_KIND" }, 400);
  }

  const content = await generateGroundedStrategy(deps, context, body.kind);

  const now = deps.now();
  const saved = await deps.saveDraft({
    userId,
    babyId: body.babyId!,
    kind: body.kind,
    content,
    sourceWindowStart: sevenDayStart(now),
    sourceWindowEnd: now.toISOString(),
    sourceLogCount: context.logs.length,
  });

  return json({ draftId: saved.id, content });
}

type GeneratorDependencies = Pick<HandlerDependencies, "generateGroundedText" | "generateText">;

export async function generateGroundedStrategy(
  deps: GeneratorDependencies,
  context: BabyAiContext,
  kind: StrategyKind,
): Promise<StrategyContent> {
  const evidence = await loadGroundedEvidence(deps, context, kind);
  const prompt = buildStrategyPrompt(context, kind, evidence.text);
  let raw = await deps.generateText(prompt, { json: true, responseSchema: STRATEGY_RESPONSE_SCHEMA });
  let content: StrategyContent;
  try {
    content = parseStrategy(raw);
  } catch {
    raw = await deps.generateText([
      prompt,
      "이전 응답은 필수 JSON 구조가 아니었습니다. 설명이나 코드 펜스 없이 필수 키를 모두 포함한 JSON 객체만 다시 반환하세요.",
    ].join("\n\n"), { json: true, responseSchema: STRATEGY_RESPONSE_SCHEMA });
    content = parseStrategy(raw);
  }
  return { ...content, sources: evidence.sources };
}

async function loadGroundedEvidence(
  deps: Pick<HandlerDependencies, "generateGroundedText">,
  context: BabyAiContext,
  topic: StrategyKind | "general",
  question = "",
): Promise<{ text: string; sources: GroundedSource[] }> {
  const prompt = buildEvidencePrompt(context, topic, question);
  let evidence = await deps.generateGroundedText(prompt);
  if (!evidence.grounded || !evidence.sources.length) {
    evidence = await deps.generateGroundedText([
      prompt,
      "허용된 공식 의료기관 또는 확인된 소아청소년과 전문의 자료만 사용하고 실제 출처를 포함하세요.",
    ].join("\n"));
  }
  if (!evidence.grounded || !evidence.sources.length) throw new Error("GROUNDING_UNAVAILABLE");
  return { text: evidence.text, sources: evidence.sources.slice(0, 5) };
}

function topicForQuestion(question: string): StrategyKind | "general" {
  if (/수유|분유|모유|직수|젖병|트림|게움/.test(question)) return "feeding";
  if (/수면|낮잠|밤잠|잠/.test(question)) return "sleep";
  return "general";
}

function publicErrorCode(error: unknown): string {
  const code = safeErrorCode(error);
  if (code === "INVALID_STRATEGY_RESPONSE") return "INVALID_AI_RESPONSE";
  if (code === "GROUNDING_UNAVAILABLE" || code === "DRAFT_SAVE_FAILED" || code === "QUEUE_RETRY_FAILED") return code;
  if (code === "GEMINI_HTTP_429") return "AI_RATE_LIMITED";
  if (/^GEMINI_HTTP_5\d\d$/.test(code)) return "AI_TEMPORARILY_UNAVAILABLE";
  return "AI_REQUEST_FAILED";
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  return /^[A-Z0-9_]+$/.test(message) ? message.slice(0, 100) : "UNKNOWN";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
