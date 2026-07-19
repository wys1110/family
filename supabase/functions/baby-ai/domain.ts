export type StrategyKind = "feeding" | "sleep";

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type BabyAiContext = {
  baby: {
    ageDays: number | null;
    sex?: string | null;
  };
  profile: Record<string, unknown>;
  logs: Array<Record<string, unknown>>;
  householdId?: string;
  userId?: string;
};

export type StrategyContent = {
  summary: string;
  observations: string[];
  actions: string[];
  watch: string[];
  reassess: string;
  safety: string;
};

export const URGENT_GUIDANCE = [
  "지금은 AI 답변을 기다리지 말고 즉시 의료 도움을 받아야 할 수 있어요.",
  "아기가 숨쉬기 어렵거나 입술이 파래짐, 의식 저하, 경련, 축 늘어짐이 있으면 119 또는 가까운 응급실에 바로 연락하세요.",
  "이 안내는 진단이 아니며, 보호자가 위급하다고 느끼면 즉시 전문가의 도움을 받는 것이 우선입니다.",
].join(" ");

const URGENT_PATTERNS = [
  /숨(을|이)?\s*(못\s*쉬|안\s*쉬|가쁘|막히)/,
  /호흡\s*(곤란|정지|이상)/,
  /(입술|얼굴|피부).{0,8}(파래|파랗|청색)/,
  /(의식|반응).{0,8}(없|저하)/,
  /경련|발작/,
  /축\s*늘어|깨워도\s*(안|못)\s*일어나/,
  /심한\s*탈수|소변.{0,8}(안\s*나|없)/,
];

const SEARCH_KEYWORDS = [
  "수유",
  "분유",
  "모유",
  "직수",
  "젖병",
  "트림",
  "토",
  "게움",
  "수면",
  "낮잠",
  "밤잠",
  "잠",
  "울음",
  "보챔",
  "배고픔",
  "포만",
  "피로",
];

const PROFILE_KEYS = [
  "feedingMethod",
  "feedingTraits",
  "sleepOnsetMethod",
  "sleepEnvironment",
  "temperament",
  "soothingMethods",
  "babyNotes",
  "motherSchedule",
  "fatherSchedule",
  "familyNotes",
];

const LOG_KEYS = [
  "occurredAt",
  "category",
  "feedingMl",
  "feedingType",
  "feedingSide",
  "feedingMinutes",
  "sleepMinutes",
  "note",
];

export function containsUrgentSignal(text: string): boolean {
  const normalized = String(text || "").replace(/\s+/g, " ");
  return URGENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function sevenDayStart(now = new Date()): string {
  return new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
}

export function buildChatPrompt(
  context: BabyAiContext,
  history: ChatMessage[],
  question: string,
  evidence = "",
): string {
  const safeHistory = history.slice(-8).map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    text: clipText(message.text),
  }));

  return [
    baseInstructions(),
    "목적: 보호자의 일반 육아 질문에 이해하기 쉬운 한국어로 답하세요.",
    "초등학생도 이해할 수 있는 짧고 쉬운 문장을 쓰세요. 어려운 말은 괄호 안에 쉬운 뜻을 붙이세요.",
    "답변 순서: 한 줄 결론, 지금 할 일, 지켜볼 것, 병원에 갈 때, 참고한 자료.",
    "참고한 자료에는 아래 공식 근거의 기관명만 적고 URL을 새로 만들지 마세요.",
    "확인 가능한 사실과 일반 원칙을 구분하고, 불확실하면 필요한 추가 관찰을 물어보세요.",
    evidence ? `검색으로 확인한 공식 근거:\n${clipText(evidence)}` : "검색 근거를 받지 못했다면 최신 정보라고 단정하지 마세요.",
    "아기와 가족의 참고 정보:",
    JSON.stringify(safeContext(context)),
    "현재 브라우저 세션의 최근 대화:",
    JSON.stringify(safeHistory),
    "새 질문:",
    clipText(question),
  ].join("\n\n");
}

export function buildEvidencePrompt(
  context: BabyAiContext,
  topic: StrategyKind | "general",
  question = "",
): string {
  const subject = topic === "feeding" ? "영아 수유" : topic === "sleep" ? "영아 수면" : "영아 돌봄";
  const keywords = SEARCH_KEYWORDS.filter((keyword) => String(question || "").includes(keyword));
  return [
    `${ageBandForDays(context.baby?.ageDays)} ${subject} 일반 원칙을 검색하세요.`,
    keywords.length ? `일반 주제: ${keywords.slice(0, 5).join(", ")}` : "일반 주제만 검색하세요.",
    "질병관리청, 보건복지부, 소아청소년과 학회, WHO, CDC, AAP, NHS 자료를 우선하세요.",
    "하정훈의 삐뽀삐뽀 119 소아과 등 신원이 확인된 소아청소년과 전문의 유튜브도 보조 자료로 사용할 수 있습니다.",
    "개인 이름, 연락처, 계정 정보, 가족 일정, 자유 메모는 검색하지 마세요.",
  ].join("\n");
}

export function buildStrategyPrompt(context: BabyAiContext, kind: StrategyKind, evidence = ""): string {
  const focus = kind === "feeding" ? "수유" : "수면";
  return [
    baseInstructions(),
    `목적: 최근 7일 기록과 공동 프로필을 바탕으로 ${focus} 전략을 제안하세요.`,
    "초등학생도 이해할 수 있는 짧고 쉬운 한국어로 쓰고, 한 항목에는 한 행동만 담으세요.",
    evidence ? `검색으로 확인한 공식 근거:\n${clipText(evidence)}` : "검색 근거를 받지 못했다면 최신 정보라고 단정하지 마세요.",
    "기록에 없는 사실을 추측하지 말고, 관찰과 제안을 명확히 구분하세요.",
    "오늘부터 적용 가능한 작은 단계로 작성하고 부모 생활 패턴 안에서 담당 시간을 나누세요.",
    "반드시 JSON 객체 하나만 반환하세요.",
    "필수 키: summary(문자열), observations(문자열 배열), actions(문자열 배열), watch(문자열 배열), reassess(문자열), safety(문자열).",
    "아기와 가족의 참고 정보:",
    JSON.stringify(safeContext(context)),
  ].join("\n\n");
}

export function parseStrategy(raw: string): StrategyContent {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new Error("INVALID_STRATEGY_RESPONSE");
  }

  if (!isRecord(value)) throw new Error("INVALID_STRATEGY_RESPONSE");
  const stringKeys = ["summary", "reassess", "safety"] as const;
  const arrayKeys = ["observations", "actions", "watch"] as const;
  if (stringKeys.some((key) => typeof value[key] !== "string" || !String(value[key]).trim())) {
    throw new Error("INVALID_STRATEGY_RESPONSE");
  }
  if (arrayKeys.some((key) => !isStringArray(value[key]))) {
    throw new Error("INVALID_STRATEGY_RESPONSE");
  }

  return {
    summary: clipText(String(value.summary)),
    observations: clipList(value.observations as string[]),
    actions: clipList(value.actions as string[]),
    watch: clipList(value.watch as string[]),
    reassess: clipText(String(value.reassess)),
    safety: clipText(String(value.safety)),
  };
}

function baseInstructions(): string {
  return [
    "당신은 가족의 관찰과 실행을 돕는 한국어 육아 정보 도우미입니다.",
    "의사나 간호사를 대신하지 않습니다. 진단하거나 처방하지 마세요.",
    "약 이름이나 용량을 정하지 말고, 의료 판단이 필요한 경우 소아청소년과 또는 보건 전문가 상담을 안내하세요.",
    "아기의 배고픔·포만·피로 신호와 보호자의 안전을 우선하세요.",
  ].join(" ");
}

function ageBandForDays(value: unknown): string {
  const days = Number(value);
  if (!Number.isFinite(days) || days < 0) return "월령을 모르는";
  if (days < 60) return "생후 0~1개월";
  if (days < 180) return "생후 2~5개월";
  if (days < 365) return "생후 6~11개월";
  return "생후 12개월 이상";
}

function safeContext(context: BabyAiContext): Record<string, unknown> {
  return {
    baby: {
      ageDays: Number.isFinite(context.baby?.ageDays) ? context.baby.ageDays : null,
      sex: clipNullable(context.baby?.sex),
    },
    profile: pickAndClip(context.profile || {}, PROFILE_KEYS),
    recentSevenDayLogs: (context.logs || []).slice(-200).map((log) => pickAndClip(log, LOG_KEYS)),
  };
}

function pickAndClip(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") result[key] = clipText(value);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) result[key] = value;
    else if (isRecord(value)) result[key] = pickAndClip(value, Object.keys(value).slice(0, 12));
  }
  return result;
}

function clipText(value: unknown): string {
  return String(value || "").trim().slice(0, 2000);
}

function clipNullable(value: unknown): string | null {
  const clipped = clipText(value);
  return clipped || null;
}

function clipList(values: string[]): string[] {
  return values.slice(0, 12).map(clipText).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
