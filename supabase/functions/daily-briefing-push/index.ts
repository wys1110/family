// @ts-nocheck -- Supabase Edge Runtime provides Deno and npm: imports.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DAILY_BRIEFING_CRON_SECRET = Deno.env.get("DAILY_BRIEFING_CRON_SECRET") || "";
const VAPID_SUBJECT = Deno.env.get("DAILY_BRIEFING_VAPID_SUBJECT") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("DAILY_BRIEFING_VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("DAILY_BRIEFING_VAPID_PRIVATE_KEY") || "";
const DEFAULT_TIMEZONE = "Asia/Seoul";
const SEND_WINDOW_MINUTES = 30;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-daily-briefing-cron",
  "access-control-allow-methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json({ error: "INVALID_JSON" }, 400); }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  if (body.action === "dispatch") {
    if (!secureEqual(request.headers.get("x-daily-briefing-cron") || "", DAILY_BRIEFING_CRON_SECRET)) {
      return json({ error: "UNAUTHORIZED" }, 401);
    }
    if (!pushConfigured()) return json({ error: "PUSH_NOT_CONFIGURED" }, 503);
    try { return json(await dispatchDueBriefings(serviceClient)); }
    catch (error) {
      console.error("DAILY_BRIEFING_DISPATCH_FAILED", safeError(error));
      return json({ error: "DISPATCH_FAILED" }, 500);
    }
  }

  const authorization = request.headers.get("authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return json({ error: "UNAUTHORIZED" }, 401);

  if (body.action === "public-key") {
    if (!pushConfigured()) return json({ error: "PUSH_NOT_CONFIGURED" }, 503);
    return json({ publicKey: VAPID_PUBLIC_KEY });
  }

  const householdId = validUuid(body.householdId) ? String(body.householdId) : "";
  if (!householdId || !(await isHouseholdMember(userClient, user.id, householdId))) {
    return json({ error: "HOUSEHOLD_NOT_FOUND" }, 403);
  }

  if (body.action === "subscribe") {
    if (!pushConfigured()) return json({ error: "PUSH_NOT_CONFIGURED" }, 503);
    const subscription = normalizeSubscription(body.subscription);
    if (!subscription) return json({ error: "INVALID_SUBSCRIPTION" }, 400);
    const timezone = normalizeTimezone(body.timezone);
    const briefingTime = normalizeTime(body.time);
    const enabled = body.enabled !== false;

    const { error } = await serviceClient.from("push_subscriptions").upsert({
      user_id: user.id,
      household_id: householdId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      timezone,
      briefing_time: `${briefingTime}:00`,
      enabled,
      updated_at: new Date().toISOString(),
      last_error: null,
    }, { onConflict: "endpoint" });
    if (error) {
      console.error("DAILY_BRIEFING_SUBSCRIBE_FAILED", error.code);
      return json({ error: "SUBSCRIBE_FAILED" }, 500);
    }
    return json({ ok: true, enabled, time: briefingTime, timezone });
  }

  if (body.action === "test") {
    if (!pushConfigured()) return json({ error: "PUSH_NOT_CONFIGURED" }, 503);
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    let query = serviceClient.from("push_subscriptions")
      .select("id,user_id,household_id,endpoint,p256dh,auth,timezone,briefing_time")
      .eq("user_id", user.id)
      .eq("household_id", householdId);
    if (endpoint) query = query.eq("endpoint", endpoint);
    const { data: subscriptions, error } = await query.limit(5);
    if (error) return json({ error: "SUBSCRIPTION_LOAD_FAILED" }, 500);
    if (!subscriptions?.length) return json({ error: "SUBSCRIPTION_NOT_FOUND" }, 404);

    let sent = 0;
    for (const subscription of subscriptions) {
      const local = localClock(new Date(), subscription.timezone);
      const events = await loadEvents(serviceClient, subscription.household_id, local.date);
      const payload = buildPayload(local.date, events, true);
      const result = await sendPush(serviceClient, subscription, payload, { markSent: false });
      if (result === "sent") sent += 1;
    }
    return json({ sent });
  }

  return json({ error: "UNKNOWN_ACTION" }, 400);
});

function pushConfigured() {
  return Boolean(VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && SUPABASE_SERVICE_ROLE_KEY);
}

async function isHouseholdMember(client, userId: string, householdId: string) {
  const { data, error } = await client.from("household_members")
    .select("household_id")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && Boolean(data);
}

async function dispatchDueBriefings(serviceClient) {
  const { data: subscriptions, error } = await serviceClient.from("push_subscriptions")
    .select("id,user_id,household_id,endpoint,p256dh,auth,timezone,briefing_time,last_sent_on")
    .eq("enabled", true)
    .order("created_at")
    .limit(1000);
  if (error) throw error;

  const now = new Date();
  const eventCache = new Map<string, unknown[]>();
  let due = 0;
  let sent = 0;
  let expired = 0;
  let failed = 0;

  for (const subscription of subscriptions || []) {
    const local = localClock(now, subscription.timezone);
    if (!isDue(subscription, local)) continue;
    due += 1;

    const cacheKey = `${subscription.household_id}:${local.date}`;
    let events = eventCache.get(cacheKey);
    if (!events) {
      events = await loadEvents(serviceClient, subscription.household_id, local.date);
      eventCache.set(cacheKey, events);
    }

    const result = await sendPush(serviceClient, subscription, buildPayload(local.date, events, false), {
      markSent: true,
      localDate: local.date,
    });
    if (result === "sent") sent += 1;
    else if (result === "expired") expired += 1;
    else failed += 1;
  }

  return { scanned: subscriptions?.length || 0, due, sent, expired, failed };
}

function isDue(subscription, local) {
  if (subscription.last_sent_on === local.date) return false;
  const target = timeToMinutes(String(subscription.briefing_time || "09:00"));
  const current = local.hour * 60 + local.minute;
  const delta = current - target;
  return delta >= 0 && delta < SEND_WINDOW_MINUTES;
}

async function loadEvents(client, householdId: string, localDate: string) {
  const { data, error } = await client.from("events")
    .select("title,event_time,member,event_date,event_end_date")
    .eq("household_id", householdId)
    .lte("event_date", localDate)
    .gte("event_end_date", localDate)
    .order("event_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

function buildPayload(localDate: string, events: unknown[], test: boolean) {
  const count = events.length;
  const title = test ? "일정 브리핑 테스트" : count ? `오늘 일정 ${count}개` : "오늘 일정 브리핑";
  const body = count
    ? events.slice(0, 3).map((event) => {
      const time = event.event_time ? String(event.event_time).slice(0, 5) : "종일";
      return `${time} ${String(event.title || "일정")}`;
    }).join(" · ") + (count > 3 ? ` · 외 ${count - 3}개` : "")
    : "오늘 등록된 일정이 없어요.";
  return {
    title,
    body,
    tag: `family-daily-briefing-${localDate}${test ? "-test" : ""}`,
    url: `./?briefingDate=${encodeURIComponent(localDate)}`,
    date: localDate,
  };
}

async function sendPush(serviceClient, subscription, payload, options) {
  try {
    await webpush.sendNotification({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    }, JSON.stringify(payload), {
      TTL: 60 * 60,
      vapidDetails: {
        subject: VAPID_SUBJECT,
        publicKey: VAPID_PUBLIC_KEY,
        privateKey: VAPID_PRIVATE_KEY,
      },
    });

    if (options.markSent) {
      await serviceClient.from("push_subscriptions").update({
        last_sent_on: options.localDate,
        last_sent_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", subscription.id);
    }
    return "sent";
  } catch (error) {
    const statusCode = Number(error?.statusCode || 0);
    if (statusCode === 404 || statusCode === 410) {
      await serviceClient.from("push_subscriptions").delete().eq("id", subscription.id);
      return "expired";
    }
    await serviceClient.from("push_subscriptions").update({
      last_error: safeError(error),
      updated_at: new Date().toISOString(),
    }).eq("id", subscription.id);
    console.error("DAILY_BRIEFING_PUSH_FAILED", { id: subscription.id, statusCode, error: safeError(error) });
    return "failed";
  }
}

function normalizeSubscription(value: unknown) {
  const subscription = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const keys = subscription?.keys && typeof subscription.keys === "object" ? subscription.keys as Record<string, unknown> : null;
  const endpoint = typeof subscription?.endpoint === "string" ? subscription.endpoint.trim() : "";
  const p256dh = typeof keys?.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys?.auth === "string" ? keys.auth.trim() : "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

function normalizeTime(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(text) ? text : "09:00";
}

function normalizeTimezone(value: unknown) {
  const timezone = typeof value === "string" && value.length <= 80 ? value : DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function localClock(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 9) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function validUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function secureEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function safeError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "UNKNOWN");
  return raw.replace(/[^A-Za-z0-9_.:\- ]/g, "").slice(0, 160) || "UNKNOWN";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}
