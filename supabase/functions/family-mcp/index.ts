// @ts-nocheck
const PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2025-11-25",
  "2025-06-18",
  "2024-11-05",
]);
const SERVER_INFO = {
  name: "family-calendar-mcp",
  title: "우리 가족 MCP",
  version: "0.1.0",
  description: "가족 일정, 할 일, 아기 돌봄 기록을 안전하게 조회하고 추가합니다.",
};
const RATE_LIMIT_PER_MINUTE = 120;
const rateBuckets = new Map();

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

class SupabaseError extends Error {
  constructor(status, payload) {
    super(payload?.message || payload?.error_description || `Supabase request failed (${status})`);
    this.status = status;
    this.payload = payload;
  }
}

class ToolInputError extends Error {}

const TOOL_DEFINITIONS = [
  {
    name: "list_events",
    title: "가족 일정 조회",
    description: "지정한 기간과 가족 구성원에 해당하는 가족 캘린더 일정을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", format: "date", description: "조회 시작일 YYYY-MM-DD. 생략하면 오늘입니다." },
        end_date: { type: "string", format: "date", description: "조회 종료일 YYYY-MM-DD. 생략하면 시작일부터 30일 후입니다." },
        member: { type: "string", maxLength: 20, description: "가족 구성원 이름. 생략하면 전체입니다." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: { title: "가족 일정 조회", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "create_event",
    title: "가족 일정 추가",
    description: "가족 캘린더에 새 일정을 추가합니다. 실제 데이터를 변경하므로 실행 전 일정 내용을 사용자에게 확인받으세요.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 60 },
        start_date: { type: "string", format: "date", description: "시작일 YYYY-MM-DD" },
        end_date: { type: "string", format: "date", description: "종료일 YYYY-MM-DD. 생략하면 시작일과 같습니다." },
        time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", description: "선택 시간 HH:MM" },
        member: { type: "string", maxLength: 20, default: "가족" },
        note: { type: "string", maxLength: 300 },
      },
      required: ["title", "start_date"],
      additionalProperties: false,
    },
    annotations: { title: "가족 일정 추가", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "list_todos",
    title: "가족 할 일 조회",
    description: "가족 공유 할 일을 상태, 담당자, 기한으로 필터링해 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "completed", "all"], default: "open" },
        assignee: { type: "string", maxLength: 20 },
        due_from: { type: "string", format: "date" },
        due_to: { type: "string", format: "date" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: { title: "가족 할 일 조회", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "create_todo",
    title: "가족 할 일 추가",
    description: "가족 공유 할 일을 추가합니다. 실제 데이터를 변경하므로 실행 전 제목, 담당자, 기한을 사용자에게 확인받으세요.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 80 },
        due_date: { type: "string", format: "date" },
        assignee: { type: "string", maxLength: 20, default: "가족" },
        note: { type: "string", maxLength: 500 },
        recurrence: { type: "string", enum: ["none", "daily", "weekly", "monthly"], default: "none" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: { title: "가족 할 일 추가", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "complete_todo",
    title: "가족 할 일 완료 변경",
    description: "가족 할 일의 완료 상태를 변경합니다. 반복 할 일을 완료하면 다음 주기의 할 일을 자동 생성합니다.",
    inputSchema: {
      type: "object",
      properties: {
        todo_id: { type: "string", format: "uuid" },
        completed: { type: "boolean", default: true },
      },
      required: ["todo_id"],
      additionalProperties: false,
    },
    annotations: { title: "가족 할 일 완료 변경", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "list_babies",
    title: "아기 프로필 조회",
    description: "가족 공간에 등록된 아기 프로필을 조회합니다.",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: { title: "아기 프로필 조회", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_baby_daily_summary",
    title: "아기 하루 돌봄 요약",
    description: "특정 날짜의 분유, 모유, 수면, 기저귀, 체온과 성장 기록을 요약합니다.",
    inputSchema: {
      type: "object",
      properties: {
        baby_id: { type: "string", format: "uuid" },
        baby_name: { type: "string", maxLength: 30 },
        date: { type: "string", format: "date", description: "YYYY-MM-DD. 생략하면 오늘입니다." },
      },
      additionalProperties: false,
    },
    annotations: { title: "아기 하루 돌봄 요약", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "log_baby_care",
    title: "아기 돌봄 기록 추가",
    description: "분유, 모유, 수면, 기저귀, 체온 또는 성장 측정을 기록합니다. 실제 데이터를 변경하므로 실행 전 아기, 시각, 수치를 사용자에게 확인받으세요.",
    inputSchema: {
      type: "object",
      properties: {
        baby_id: { type: "string", format: "uuid" },
        baby_name: { type: "string", maxLength: 30 },
        kind: { type: "string", enum: ["formula", "breast", "sleep", "diaper", "temperature", "measurement", "note"] },
        date: { type: "string", format: "date", description: "YYYY-MM-DD. 생략하면 오늘입니다." },
        time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", description: "HH:MM. 생략하면 현재 한국 시간입니다." },
        amount_ml: { type: "integer", minimum: 1, maximum: 3000, description: "분유량 mL" },
        minutes: { type: "integer", minimum: 1, maximum: 1440, description: "모유 또는 수면 시간(분)" },
        side: { type: "string", enum: ["left", "right", "both"], description: "모유 수유 방향" },
        diaper_kind: { type: "string", enum: ["urine", "stool", "both"] },
        temperature_c: { type: "number", minimum: 30, maximum: 45 },
        height_cm: { type: "number", exclusiveMinimum: 0, maximum: 250 },
        weight_kg: { type: "number", exclusiveMinimum: 0, maximum: 200 },
        head_cm: { type: "number", exclusiveMinimum: 0, maximum: 100 },
        title: { type: "string", maxLength: 60 },
        note: { type: "string", maxLength: 1000 },
      },
      required: ["kind"],
      additionalProperties: false,
    },
    annotations: { title: "아기 돌봄 기록 추가", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

function getEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `Missing server environment variable: ${name}`);
  return value;
}

function corsHeaders(request) {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  validateOrigin(origin);
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function validateOrigin(origin) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, "Invalid Origin header");
  }

  const configured = (Deno.env.get("MCP_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const known = new Set(["https://chatgpt.com", "https://claude.ai", "https://claude.com", ...configured]);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (!known.has(origin) && !(local && parsed.protocol === "http:")) {
    throw new HttpError(403, "Origin is not allowed");
  }
}

function jsonResponse(request, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}

function emptyResponse(request, status = 202) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      ...corsHeaders(request),
    },
  });
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message, data) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function toolSuccess(message, structuredContent) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent,
  };
}

function toolFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { error: message },
    isError: true,
  };
}

function asObject(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new ToolInputError("arguments must be an object");
  return value;
}

function stringValue(args, key, options = {}) {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new ToolInputError(`${key} is required`);
    return options.defaultValue;
  }
  if (typeof value !== "string") throw new ToolInputError(`${key} must be a string`);
  const trimmed = value.trim();
  if (options.required && !trimmed) throw new ToolInputError(`${key} is required`);
  if (options.max && trimmed.length > options.max) throw new ToolInputError(`${key} must be ${options.max} characters or fewer`);
  return trimmed;
}

function numberValue(args, key, options = {}) {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new ToolInputError(`${key} is required`);
    return options.defaultValue;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ToolInputError(`${key} must be a number`);
  if (options.integer && !Number.isInteger(value)) throw new ToolInputError(`${key} must be an integer`);
  if (options.min !== undefined && value < options.min) throw new ToolInputError(`${key} must be at least ${options.min}`);
  if (options.max !== undefined && value > options.max) throw new ToolInputError(`${key} must be at most ${options.max}`);
  return value;
}

function booleanValue(args, key, defaultValue) {
  const value = args[key];
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== "boolean") throw new ToolInputError(`${key} must be a boolean`);
  return value;
}

function enumValue(args, key, allowed, defaultValue) {
  const value = stringValue(args, key, { defaultValue });
  if (!allowed.includes(value)) throw new ToolInputError(`${key} must be one of: ${allowed.join(", ")}`);
  return value;
}

function validDate(value, key = "date") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw new ToolInputError(`${key} must use YYYY-MM-DD`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ToolInputError(`${key} is not a valid date`);
  }
  return value;
}

function validTime(value, key = "time") {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || "")) throw new ToolInputError(`${key} must use HH:MM`);
  return value;
}

function validUuid(value, key) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "")) {
    throw new ToolInputError(`${key} must be a UUID`);
  }
  return value;
}

function seoulNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${map.year}-${map.month}-${map.day}`, time: `${map.hour}:${map.minute}` };
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addRecurrence(dateString, recurrence) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (recurrence === "daily") date.setUTCDate(date.getUTCDate() + 1);
  if (recurrence === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  if (recurrence === "monthly") {
    const targetMonth = date.getUTCMonth() + 1;
    const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = targetMonth % 12;
    const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
    date.setUTCFullYear(targetYear, normalizedMonth, Math.min(day, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

function checkRateLimit(userId) {
  const now = Date.now();
  const current = rateBuckets.get(userId);
  if (!current || now - current.startedAt >= 60_000) {
    rateBuckets.set(userId, { startedAt: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > RATE_LIMIT_PER_MINUTE) throw new HttpError(429, "Too many MCP requests. Try again shortly.");
}

async function parsePayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function postgrest(context, table, { method = "GET", query = [], body, prefer } = {}) {
  const url = new URL(`${context.supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of query) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.append(key, String(value));
  }
  const headers = {
    apikey: context.anonKey,
    Authorization: `Bearer ${context.token}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await parsePayload(response);
  if (!response.ok) throw new SupabaseError(response.status, payload);
  return payload;
}

async function authenticate(request) {
  const supabaseUrl = getEnv("SUPABASE_URL").replace(/\/$/, "");
  const anonKey = getEnv("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, "Authorization bearer token is required", { "WWW-Authenticate": 'Bearer realm="family-mcp"' });
  const token = match[1].trim();

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  const user = await parsePayload(userResponse);
  if (!userResponse.ok || !user?.id) {
    throw new HttpError(401, "Supabase session is invalid or expired", { "WWW-Authenticate": 'Bearer realm="family-mcp", error="invalid_token"' });
  }

  const context = { supabaseUrl, anonKey, token, userId: user.id, householdId: null, role: null };
  const memberships = await postgrest(context, "household_members", {
    query: [
      ["select", "household_id,role"],
      ["user_id", `eq.${user.id}`],
      ["limit", "1"],
    ],
  });
  const membership = Array.isArray(memberships) ? memberships[0] : null;
  if (!membership?.household_id) throw new HttpError(403, "The authenticated user is not connected to a family household");
  context.householdId = membership.household_id;
  context.role = membership.role;
  checkRateLimit(context.userId);
  return context;
}

async function resolveBaby(context, args) {
  const babyId = stringValue(args, "baby_id");
  const babyName = stringValue(args, "baby_name", { max: 30 });
  const query = [
    ["select", "id,name,birth_date,birth_time,sex,birth_weight_kg,birth_height_cm"],
    ["household_id", `eq.${context.householdId}`],
    ["order", "birth_date.asc"],
    ["limit", babyId || babyName ? "1" : "2"],
  ];
  if (babyId) query.push(["id", `eq.${validUuid(babyId, "baby_id")}`]);
  if (babyName) query.push(["name", `eq.${babyName}`]);
  const babies = await postgrest(context, "babies", { query });
  if (!Array.isArray(babies) || babies.length === 0) throw new ToolInputError("No matching baby profile was found");
  if (!babyId && !babyName && babies.length > 1) throw new ToolInputError("Multiple baby profiles exist. Provide baby_id or baby_name");
  return babies[0];
}

async function listEvents(context, args) {
  const now = seoulNow();
  const start = validDate(stringValue(args, "start_date", { defaultValue: now.date }), "start_date");
  const end = validDate(stringValue(args, "end_date", { defaultValue: addDays(start, 30) }), "end_date");
  if (end < start) throw new ToolInputError("end_date must be on or after start_date");
  const member = stringValue(args, "member", { max: 20 });
  const limit = numberValue(args, "limit", { integer: true, min: 1, max: 100, defaultValue: 50 });
  const query = [
    ["select", "id,title,event_date,event_end_date,event_time,member,note,created_at,updated_at"],
    ["household_id", `eq.${context.householdId}`],
    ["event_date", `lte.${end}`],
    ["event_end_date", `gte.${start}`],
    ["order", "event_date.asc,event_time.asc.nullsfirst,created_at.asc"],
    ["limit", String(limit)],
  ];
  if (member) query.push(["member", `eq.${member}`]);
  const events = await postgrest(context, "events", { query });
  return toolSuccess(`${start}부터 ${end}까지 일정 ${events.length}개를 찾았습니다.`, { start_date: start, end_date: end, events });
}

async function createEvent(context, args) {
  const title = stringValue(args, "title", { required: true, max: 60 });
  const start = validDate(stringValue(args, "start_date", { required: true }), "start_date");
  const end = validDate(stringValue(args, "end_date", { defaultValue: start }), "end_date");
  if (end < start) throw new ToolInputError("end_date must be on or after start_date");
  const timeValue = stringValue(args, "time");
  const member = stringValue(args, "member", { max: 20, defaultValue: "가족" });
  const note = stringValue(args, "note", { max: 300 });
  const rows = await postgrest(context, "events", {
    method: "POST",
    query: [["select", "id,title,event_date,event_end_date,event_time,member,note,created_at"]],
    prefer: "return=representation",
    body: {
      id: crypto.randomUUID(),
      household_id: context.householdId,
      title,
      event_date: start,
      event_end_date: end,
      event_time: timeValue ? validTime(timeValue) : null,
      member,
      note: note || null,
      created_by: context.userId,
    },
  });
  const event = rows?.[0];
  return toolSuccess(`가족 일정 '${title}'을 ${start}${end !== start ? `~${end}` : ""}에 추가했습니다.`, { event });
}

async function listTodos(context, args) {
  const status = enumValue(args, "status", ["open", "completed", "all"], "open");
  const assignee = stringValue(args, "assignee", { max: 20 });
  const dueFromRaw = stringValue(args, "due_from");
  const dueToRaw = stringValue(args, "due_to");
  const dueFrom = dueFromRaw ? validDate(dueFromRaw, "due_from") : null;
  const dueTo = dueToRaw ? validDate(dueToRaw, "due_to") : null;
  if (dueFrom && dueTo && dueTo < dueFrom) throw new ToolInputError("due_to must be on or after due_from");
  const limit = numberValue(args, "limit", { integer: true, min: 1, max: 100, defaultValue: 50 });
  const query = [
    ["select", "id,title,due_date,assignee,note,recurrence,completed,completed_at,recurrence_parent_id,created_at,updated_at"],
    ["household_id", `eq.${context.householdId}`],
    ["order", "completed.asc,due_date.asc.nullslast,created_at.desc"],
    ["limit", String(limit)],
  ];
  if (status !== "all") query.push(["completed", `eq.${status === "completed"}`]);
  if (assignee) query.push(["assignee", `eq.${assignee}`]);
  if (dueFrom) query.push(["due_date", `gte.${dueFrom}`]);
  if (dueTo) query.push(["due_date", `lte.${dueTo}`]);
  const todos = await postgrest(context, "family_todos", { query });
  return toolSuccess(`조건에 맞는 가족 할 일 ${todos.length}개를 찾았습니다.`, { status, todos });
}

async function createTodo(context, args) {
  const title = stringValue(args, "title", { required: true, max: 80 });
  const dueRaw = stringValue(args, "due_date");
  const dueDate = dueRaw ? validDate(dueRaw, "due_date") : null;
  const assignee = stringValue(args, "assignee", { max: 20, defaultValue: "가족" });
  const note = stringValue(args, "note", { max: 500 });
  const recurrence = enumValue(args, "recurrence", ["none", "daily", "weekly", "monthly"], "none");
  if (recurrence !== "none" && !dueDate) throw new ToolInputError("A recurring todo requires due_date");
  const rows = await postgrest(context, "family_todos", {
    method: "POST",
    query: [["select", "id,title,due_date,assignee,note,recurrence,completed,completed_at,recurrence_parent_id,created_at,updated_at"]],
    prefer: "return=representation",
    body: {
      id: crypto.randomUUID(),
      household_id: context.householdId,
      title,
      due_date: dueDate,
      assignee,
      note: note || null,
      recurrence,
      completed: false,
      completed_at: null,
      recurrence_parent_id: null,
      created_by: context.userId,
    },
  });
  const todo = rows?.[0];
  return toolSuccess(`가족 할 일 '${title}'을 추가했습니다.`, { todo });
}

async function completeTodo(context, args) {
  const todoId = validUuid(stringValue(args, "todo_id", { required: true }), "todo_id");
  const completed = booleanValue(args, "completed", true);
  const found = await postgrest(context, "family_todos", {
    query: [
      ["select", "id,title,due_date,assignee,note,recurrence,completed,completed_at,recurrence_parent_id,created_at,updated_at"],
      ["household_id", `eq.${context.householdId}`],
      ["id", `eq.${todoId}`],
      ["limit", "1"],
    ],
  });
  const todo = found?.[0];
  if (!todo) throw new ToolInputError("Todo was not found");

  const updatedRows = await postgrest(context, "family_todos", {
    method: "PATCH",
    query: [
      ["select", "id,title,due_date,assignee,note,recurrence,completed,completed_at,recurrence_parent_id,created_at,updated_at"],
      ["household_id", `eq.${context.householdId}`],
      ["id", `eq.${todoId}`],
    ],
    prefer: "return=representation",
    body: { completed, completed_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() },
  });
  const updated = updatedRows?.[0];
  let nextTodo = null;

  if (completed && todo.recurrence !== "none" && todo.due_date) {
    const existing = await postgrest(context, "family_todos", {
      query: [
        ["select", "id,title,due_date,assignee,note,recurrence,completed,recurrence_parent_id,created_at"],
        ["household_id", `eq.${context.householdId}`],
        ["recurrence_parent_id", `eq.${todo.id}`],
        ["limit", "1"],
      ],
    });
    nextTodo = existing?.[0] || null;
    if (!nextTodo) {
      try {
        const inserted = await postgrest(context, "family_todos", {
          method: "POST",
          query: [["select", "id,title,due_date,assignee,note,recurrence,completed,recurrence_parent_id,created_at"]],
          prefer: "return=representation",
          body: {
            id: crypto.randomUUID(),
            household_id: context.householdId,
            title: todo.title,
            due_date: addRecurrence(todo.due_date, todo.recurrence),
            assignee: todo.assignee,
            note: todo.note,
            recurrence: todo.recurrence,
            completed: false,
            completed_at: null,
            recurrence_parent_id: todo.id,
            created_by: context.userId,
          },
        });
        nextTodo = inserted?.[0] || null;
      } catch (error) {
        if (!(error instanceof SupabaseError && error.payload?.code === "23505")) throw error;
      }
    }
  }

  const message = completed
    ? nextTodo
      ? `할 일 '${todo.title}'을 완료하고 다음 반복 할 일을 만들었습니다.`
      : `할 일 '${todo.title}'을 완료했습니다.`
    : `할 일 '${todo.title}'을 미완료 상태로 되돌렸습니다.`;
  return toolSuccess(message, { todo: updated, next_todo: nextTodo });
}

async function listBabies(context) {
  const babies = await postgrest(context, "babies", {
    query: [
      ["select", "id,name,birth_date,birth_time,sex,birth_weight_kg,birth_height_cm,created_at,updated_at"],
      ["household_id", `eq.${context.householdId}`],
      ["order", "birth_date.asc"],
    ],
  });
  return toolSuccess(`아기 프로필 ${babies.length}개를 찾았습니다.`, { babies });
}

async function getBabyDailySummary(context, args) {
  const baby = await resolveBaby(context, args);
  const date = validDate(stringValue(args, "date", { defaultValue: seoulNow().date }), "date");
  const records = await postgrest(context, "growth_entries", {
    query: [
      ["select", "id,title,entry_date,entry_time,category,feeding_ml,feeding_type,feeding_side,feeding_minutes,sleep_minutes,temperature_c,diaper_kind,height_cm,weight_kg,head_cm,note,created_at"],
      ["household_id", `eq.${context.householdId}`],
      ["baby_id", `eq.${baby.id}`],
      ["entry_date", `eq.${date}`],
      ["order", "entry_time.asc.nullsfirst,created_at.asc"],
      ["limit", "500"],
    ],
  });

  const summary = {
    baby: { id: baby.id, name: baby.name },
    date,
    formula_ml: 0,
    formula_count: 0,
    breast_minutes: 0,
    breast_count: 0,
    sleep_minutes: 0,
    sleep_count: 0,
    diapers: { total: 0, urine: 0, stool: 0, both: 0 },
    latest_temperature_c: null,
    latest_measurement: null,
    record_count: records.length,
  };

  for (const record of records) {
    if (record.feeding_type === "젖병" && record.feeding_ml) {
      summary.formula_ml += Number(record.feeding_ml);
      summary.formula_count += 1;
    }
    if (record.feeding_type === "모유" && record.feeding_minutes) {
      summary.breast_minutes += Number(record.feeding_minutes);
      summary.breast_count += 1;
    }
    if (record.sleep_minutes) {
      summary.sleep_minutes += Number(record.sleep_minutes);
      summary.sleep_count += 1;
    }
    if (record.diaper_kind) {
      summary.diapers.total += 1;
      if (record.diaper_kind === "소변") summary.diapers.urine += 1;
      if (record.diaper_kind === "대변") summary.diapers.stool += 1;
      if (record.diaper_kind === "소변·대변") summary.diapers.both += 1;
    }
    if (record.temperature_c !== null) summary.latest_temperature_c = Number(record.temperature_c);
    if (record.height_cm !== null || record.weight_kg !== null || record.head_cm !== null) {
      summary.latest_measurement = {
        time: record.entry_time?.slice(0, 5) || null,
        height_cm: record.height_cm === null ? null : Number(record.height_cm),
        weight_kg: record.weight_kg === null ? null : Number(record.weight_kg),
        head_cm: record.head_cm === null ? null : Number(record.head_cm),
      };
    }
  }

  const message = `${date} ${baby.name}: 분유 ${summary.formula_ml}mL, 모유 ${summary.breast_minutes}분, 수면 ${summary.sleep_minutes}분, 기저귀 ${summary.diapers.total}회입니다.`;
  return toolSuccess(message, { summary, records });
}

async function logBabyCare(context, args) {
  const baby = await resolveBaby(context, args);
  const kind = enumValue(args, "kind", ["formula", "breast", "sleep", "diaper", "temperature", "measurement", "note"]);
  const now = seoulNow();
  const date = validDate(stringValue(args, "date", { defaultValue: now.date }), "date");
  const time = validTime(stringValue(args, "time", { defaultValue: now.time }), "time");
  const note = stringValue(args, "note", { max: 1000 });
  const customTitle = stringValue(args, "title", { max: 60 });
  const entry = {
    id: crypto.randomUUID(),
    household_id: context.householdId,
    baby_id: baby.id,
    entry_date: date,
    entry_time: time,
    note: note || null,
    created_by: context.userId,
  };

  if (kind === "formula") {
    entry.title = customTitle || "분유";
    entry.category = "수유·이유식";
    entry.feeding_type = "젖병";
    entry.feeding_ml = numberValue(args, "amount_ml", { required: true, integer: true, min: 1, max: 3000 });
  }
  if (kind === "breast") {
    entry.title = customTitle || "모유";
    entry.category = "수유·이유식";
    entry.feeding_type = "모유";
    entry.feeding_minutes = numberValue(args, "minutes", { required: true, integer: true, min: 1, max: 240 });
    const side = enumValue(args, "side", ["left", "right", "both"], "both");
    entry.feeding_side = { left: "왼쪽", right: "오른쪽", both: "양쪽" }[side];
  }
  if (kind === "sleep") {
    entry.title = customTitle || "수면";
    entry.category = "수면";
    entry.sleep_minutes = numberValue(args, "minutes", { required: true, integer: true, min: 1, max: 1440 });
  }
  if (kind === "diaper") {
    entry.title = customTitle || "기저귀";
    entry.category = "기저귀";
    const diaperKind = enumValue(args, "diaper_kind", ["urine", "stool", "both"]);
    entry.diaper_kind = { urine: "소변", stool: "대변", both: "소변·대변" }[diaperKind];
  }
  if (kind === "temperature") {
    entry.title = customTitle || "체온";
    entry.category = "건강·병원";
    entry.temperature_c = numberValue(args, "temperature_c", { required: true, min: 30, max: 45 });
  }
  if (kind === "measurement") {
    entry.title = customTitle || "성장 측정";
    entry.category = "성장";
    entry.height_cm = numberValue(args, "height_cm", { min: 0.1, max: 250 });
    entry.weight_kg = numberValue(args, "weight_kg", { min: 0.01, max: 200 });
    entry.head_cm = numberValue(args, "head_cm", { min: 0.1, max: 100 });
    if (entry.height_cm === undefined && entry.weight_kg === undefined && entry.head_cm === undefined) {
      throw new ToolInputError("measurement requires at least one of height_cm, weight_kg, or head_cm");
    }
  }
  if (kind === "note") {
    entry.title = customTitle || "돌봄 메모";
    entry.category = "기타";
    if (!note) throw new ToolInputError("note kind requires note text");
  }

  const rows = await postgrest(context, "growth_entries", {
    method: "POST",
    query: [["select", "id,baby_id,title,entry_date,entry_time,category,feeding_ml,feeding_type,feeding_side,feeding_minutes,sleep_minutes,temperature_c,diaper_kind,height_cm,weight_kg,head_cm,note,created_at"]],
    prefer: "return=representation",
    body: entry,
  });
  const saved = rows?.[0];
  return toolSuccess(`${date} ${time}에 ${baby.name}의 '${entry.title}' 기록을 추가했습니다.`, { baby: { id: baby.id, name: baby.name }, record: saved });
}

async function callTool(context, name, rawArguments) {
  const args = asObject(rawArguments);
  try {
    if (name === "list_events") return await listEvents(context, args);
    if (name === "create_event") return await createEvent(context, args);
    if (name === "list_todos") return await listTodos(context, args);
    if (name === "create_todo") return await createTodo(context, args);
    if (name === "complete_todo") return await completeTodo(context, args);
    if (name === "list_babies") return await listBabies(context);
    if (name === "get_baby_daily_summary") return await getBabyDailySummary(context, args);
    if (name === "log_baby_care") return await logBabyCare(context, args);
    throw new ToolInputError(`Unknown tool: ${name}`);
  } catch (error) {
    if (error instanceof ToolInputError || error instanceof SupabaseError) return toolFailure(error);
    console.error("family-mcp tool error", name, error);
    return toolFailure(new Error("The family service could not complete this request"));
  }
}

async function handleRpcMessage(message, context) {
  if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(message?.id, -32600, "Invalid Request");
  }
  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  if (!hasId) {
    if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return null;
    return null;
  }

  if (message.method === "initialize") {
    const requested = message.params?.protocolVersion;
    const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : PROTOCOL_VERSION;
    return rpcResult(message.id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: "가족 데이터는 인증된 사용자의 가족 공간으로 제한됩니다. 쓰기 도구는 실행 전에 사용자에게 최종 내용을 확인받으세요.",
    });
  }
  if (message.method === "ping") return rpcResult(message.id, {});
  if (message.method === "tools/list") return rpcResult(message.id, { tools: TOOL_DEFINITIONS });
  if (message.method === "tools/call") {
    const name = message.params?.name;
    if (typeof name !== "string" || !name) return rpcError(message.id, -32602, "tools/call requires params.name");
    if (!TOOL_DEFINITIONS.some((tool) => tool.name === name)) return rpcError(message.id, -32602, `Unknown tool: ${name}`);
    const result = await callTool(context, name, message.params?.arguments);
    return rpcResult(message.id, result);
  }
  return rpcError(message.id, -32601, `Method not found: ${message.method}`);
}

export default {
  async fetch(request) {
    try {
      const cors = corsHeaders(request);
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      if (request.method !== "POST") {
        return jsonResponse(request, { error: "Use POST for the MCP Streamable HTTP endpoint" }, 405, { Allow: "POST, OPTIONS" });
      }
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) throw new HttpError(415, "Content-Type must be application/json");

      const context = await authenticate(request);
      let payload;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse(request, rpcError(null, -32700, "Parse error"), 400);
      }

      if (Array.isArray(payload)) {
        if (payload.length === 0) return jsonResponse(request, rpcError(null, -32600, "Invalid Request"), 400);
        const responses = (await Promise.all(payload.map((message) => handleRpcMessage(message, context)))).filter(Boolean);
        return responses.length ? jsonResponse(request, responses) : emptyResponse(request);
      }

      const response = await handleRpcMessage(payload, context);
      return response ? jsonResponse(request, response) : emptyResponse(request);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse(request, { error: error.message }, error.status, error.headers);
      }
      console.error("family-mcp request error", error);
      return jsonResponse(request, { error: "Internal server error" }, 500);
    }
  },
};
