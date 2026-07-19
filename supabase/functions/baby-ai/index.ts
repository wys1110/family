// @ts-nocheck -- Supabase Edge Runtime provides Deno and npm: imports.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildStrategyPrompt, parseStrategy, sevenDayStart } from "./domain.ts";
import { createGeminiTransport } from "./gemini.ts";
import { createBabyAiHandler, STRATEGY_RESPONSE_SCHEMA } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BABY_AI_CRON_SECRET = Deno.env.get("BABY_AI_CRON_SECRET") || "";

Deno.serve(async (request: Request) => {
  const authorization = request.headers.get("authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const handler = createBabyAiHandler({
    authenticate: async () => {
      const { data, error } = await userClient.auth.getUser();
      return error || !data.user ? null : { userId: data.user.id };
    },
    isCronAuthorized: (req) => secureEqual(req.headers.get("x-baby-ai-cron") || "", BABY_AI_CRON_SECRET),
    loadContext: async (_userId, babyId) => loadContext(userClient, babyId),
    generateText: (prompt, options) => gemini().generateText(prompt, options),
    saveDraft: async (input) => {
      const { data: baby, error: babyError } = await serviceClient
        .from("babies")
        .select("household_id")
        .eq("id", input.babyId)
        .single();
      if (babyError || !baby) throw new Error("BABY_NOT_FOUND");

      const { data, error } = await serviceClient
        .from("baby_ai_strategy_drafts")
        .insert({
          baby_id: input.babyId,
          household_id: baby.household_id,
          kind: input.kind,
          status: "draft",
          content: input.content,
          source_window_start: input.sourceWindowStart,
          source_window_end: input.sourceWindowEnd,
          source_log_count: input.sourceLogCount,
          generated_by: input.userId,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error("DRAFT_SAVE_FAILED");
      return { id: data.id };
    },
    processRefreshQueue: () => processRefreshQueue(serviceClient),
    now: () => new Date(),
  });

  return handler(request);
});

function gemini() {
  return createGeminiTransport({
    apiKey: Deno.env.get("GEMINI_API_KEY") || "",
    model: Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash",
  });
}

async function loadContext(client, babyId: string) {
  const sevenDaysAgo = sevenDayStart(new Date()).slice(0, 10);
  const [{ data: baby, error: babyError }, { data: profile }, { data: logs, error: logsError }] = await Promise.all([
    client.from("babies").select("id,household_id,birth_date,sex").eq("id", babyId).is("archived_at", null).maybeSingle(),
    client.from("baby_ai_profiles").select("*").eq("baby_id", babyId).maybeSingle(),
    client.from("growth_entries")
      .select("entry_date,entry_time,category,feeding_ml,feeding_type,feeding_side,feeding_minutes,sleep_minutes,note")
      .eq("baby_id", babyId)
      .in("category", ["수유·이유식", "수면"])
      .gte("entry_date", sevenDaysAgo)
      .order("entry_date", { ascending: true })
      .order("entry_time", { ascending: true }),
  ]);
  if (babyError || logsError || !baby) return null;

  return {
    baby: { ageDays: daysSince(baby.birth_date), sex: baby.sex },
    profile: profile ? mapProfile(profile) : {},
    logs: (logs || []).map(mapLog),
    householdId: baby.household_id,
  };
}

async function processRefreshQueue(serviceClient) {
  const { data: rows, error } = await serviceClient
    .from("baby_ai_refresh_queue")
    .select("baby_id,household_id,due_at,status,attempt_count,generation")
    .in("status", ["pending", "failed"])
    .lte("due_at", new Date().toISOString())
    .lt("attempt_count", 3)
    .order("due_at")
    .limit(10);
  if (error) throw new Error("QUEUE_LOAD_FAILED");

  let processed = 0;
  let failed = 0;
  for (const row of rows || []) {
    const { data: claimed } = await serviceClient
      .from("baby_ai_refresh_queue")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("baby_id", row.baby_id)
      .eq("generation", row.generation)
      .in("status", ["pending", "failed"])
      .select("baby_id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      const context = await loadContext(serviceClient, row.baby_id);
      if (!context) throw new Error("BABY_NOT_FOUND");
      await generateScheduledDraft(serviceClient, context, row.baby_id, "feeding");
      await generateScheduledDraft(serviceClient, context, row.baby_id, "sleep");
      await serviceClient.from("baby_ai_refresh_queue").delete()
        .eq("baby_id", row.baby_id)
        .eq("generation", row.generation);
      processed += 1;
    } catch (queueError) {
      const attemptCount = Math.min(3, Number(row.attempt_count || 0) + 1);
      await serviceClient.from("baby_ai_refresh_queue").update({
        status: "failed",
        attempt_count: attemptCount,
        due_at: new Date(Date.now() + attemptCount * 5 * 60_000).toISOString(),
        last_error: safeErrorCode(queueError),
        updated_at: new Date().toISOString(),
      }).eq("baby_id", row.baby_id).eq("generation", row.generation);
      failed += 1;
    }
  }
  return { processed, failed };
}

async function generateScheduledDraft(client, context, babyId: string, kind: "feeding" | "sleep") {
  const now = new Date();
  const prompt = buildStrategyPrompt(context, kind);
  let raw = await gemini().generateText(prompt, { json: true, responseSchema: STRATEGY_RESPONSE_SCHEMA });
  let content;
  try {
    content = parseStrategy(raw);
  } catch {
    raw = await gemini().generateText(`${prompt}\n\n필수 키를 모두 포함한 JSON 객체만 다시 반환하세요.`, {
      json: true,
      responseSchema: STRATEGY_RESPONSE_SCHEMA,
    });
    content = parseStrategy(raw);
  }

  const { error } = await client.from("baby_ai_strategy_drafts").insert({
    baby_id: babyId,
    household_id: context.householdId,
    kind,
    status: "draft",
    content,
    source_window_start: sevenDayStart(now),
    source_window_end: now.toISOString(),
    source_log_count: context.logs.length,
    generated_by: null,
  });
  if (error) throw new Error("DRAFT_SAVE_FAILED");
}

function mapProfile(row) {
  return {
    feedingMethod: row.feeding_method,
    feedingTraits: row.feeding_traits,
    sleepOnsetMethod: row.sleep_onset_method,
    sleepEnvironment: row.sleep_environment,
    temperament: row.temperament,
    soothingMethods: row.soothing_methods,
    babyNotes: row.baby_notes,
    motherSchedule: row.mother_schedule,
    fatherSchedule: row.father_schedule,
    familyNotes: row.family_notes,
  };
}

function mapLog(row) {
  return {
    occurredAt: `${row.entry_date}T${row.entry_time || "12:00:00"}`,
    category: row.category,
    feedingMl: row.feeding_ml,
    feedingType: row.feeding_type,
    feedingSide: row.feeding_side,
    feedingMinutes: row.feeding_minutes,
    sleepMinutes: row.sleep_minutes,
    note: row.note,
  };
}

function daysSince(dateString: string) {
  const start = new Date(`${dateString}T00:00:00Z`).getTime();
  return Number.isFinite(start) ? Math.max(0, Math.floor((Date.now() - start) / 86_400_000)) : null;
}

function secureEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function safeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  return /^[A-Z0-9_]+$/.test(message) ? message.slice(0, 100) : "REFRESH_FAILED";
}
