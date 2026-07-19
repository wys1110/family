import {
  buildChatPrompt,
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

export type HandlerDependencies = {
  authenticate(request: Request): Promise<{ userId: string } | null>;
  isCronAuthorized(request: Request): boolean;
  loadContext(userId: string, babyId: string): Promise<BabyAiContext | null>;
  generateText(prompt: string, options: { json: boolean }): Promise<string>;
  saveDraft(input: {
    userId: string;
    babyId: string;
    kind: StrategyKind;
    content: StrategyContent;
    sourceWindowStart: string;
    sourceWindowEnd: string;
    sourceLogCount: number;
  }): Promise<{ id: string }>;
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
      return json({ error: "UNKNOWN_ACTION" }, 400);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_STRATEGY_RESPONSE") {
        return json({ error: "INVALID_AI_RESPONSE" }, 502);
      }
      return json({ error: "AI_REQUEST_FAILED" }, 502);
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
  const answer = await deps.generateText(buildChatPrompt(context, history, question), { json: false });
  if (!answer.trim()) throw new Error("EMPTY_AI_RESPONSE");
  return json({ answer: answer.trim().slice(0, 8000), urgent: false });
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

  const prompt = buildStrategyPrompt(context, body.kind);
  let raw = await deps.generateText(prompt, { json: true });
  let content: StrategyContent;
  try {
    content = parseStrategy(raw);
  } catch {
    raw = await deps.generateText([
      prompt,
      "이전 응답은 필수 JSON 구조가 아니었습니다. 설명이나 코드 펜스 없이 필수 키를 모두 포함한 JSON 객체만 다시 반환하세요.",
    ].join("\n\n"), { json: true });
    content = parseStrategy(raw);
  }

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
