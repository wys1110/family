// @ts-nocheck -- Supabase Edge Runtime provides Deno and npm: imports.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { readJsonObject } from "../_shared/request.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const KAKAO_KEY = (Deno.env.get("KAKAO_REST_API_KEY") || "").trim();
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-family-household",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: "UNAUTHORIZED" }, 401);
  const householdId = (request.headers.get("x-family-household") || "").trim();
  if (!householdId) return json({ error: "FORBIDDEN" }, 403);
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData?.user) return json({ error: "UNAUTHORIZED" }, 401);
    const { data: membership, error: membershipError } = await client.from("household_members").select("household_id").eq("household_id", householdId).eq("user_id", authData.user.id).maybeSingle();
    if (membershipError || !membership) return json({ error: "FORBIDDEN" }, 403);
  } catch {
    return json({ status: "error", items: [], message: "가족 권한을 확인하지 못했어요. 잠시 후 다시 시도해 주세요." }, 502);
  }

  let body: Record<string, unknown>;
  try { body = await readJsonObject(request); } catch (error) {
    return json({ error: error?.message === "BODY_TOO_LARGE" ? "BODY_TOO_LARGE" : "INVALID_JSON" }, error?.message === "BODY_TOO_LARGE" ? 413 : 400);
  }
  if (body.action === "status") return json({ status: KAKAO_KEY ? "ok" : "unavailable", items: [] });
  if (body.action !== undefined && body.action !== "search") return json({ error: "INVALID_ACTION" }, 400);
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length < 2 || query.length > 120) return json({ error: "INVALID_QUERY" }, 400);
  const limit = body.limit === undefined ? 10 : body.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) return json({ error: "INVALID_LIMIT" }, 400);
  if (!KAKAO_KEY) return json({ status: "unavailable", items: [], message: "장소 검색 설정이 아직 연결되지 않았어요." }, 503);

  try {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.searchParams.set("query", query);
    url.searchParams.set("size", String(limit));
    const upstream = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) return json({ status: upstream.status === 429 ? "limit" : "error", items: [], message: "장소 검색에 실패했어요. 잠시 후 다시 시도해 주세요." }, upstream.status === 429 ? 429 : 502);
    const payload = await upstream.json();
    if (!Array.isArray(payload?.documents)) throw new Error("INVALID_PROVIDER_RESPONSE");
    const items = payload.documents.slice(0, limit).map(result => {
      if (!result || typeof result.place_name !== "string" || !result.place_name.trim() || typeof result.x !== "string" || !result.x.trim() || typeof result.y !== "string" || !result.y.trim()) return null;
      const lat = Number(result.y);
      const lng = Number(result.x);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return {
        provider: "kakao", providerId: typeof result.id === "string" ? result.id : null,
        name: result.place_name.trim(),
        address: typeof result.road_address_name === "string" && result.road_address_name.trim() ? result.road_address_name : typeof result.address_name === "string" ? result.address_name : "",
        lat, lng,
        sourceUrl: typeof result.place_url === "string" && /^https?:\/\/place\.map\.kakao\.com\/\d+$/.test(result.place_url) ? result.place_url : "",
        category: typeof result.category_name === "string" ? result.category_name : "",
        attribution: "© Kakao Corp.",
      };
    }).filter(Boolean);
    return json({ status: "ok", items });
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return json({ status: "error", items: [], message: timeout ? "장소 검색 시간이 초과됐어요. 다시 시도해 주세요." : "장소 검색에 실패했어요. 잠시 후 다시 시도해 주세요." }, timeout ? 504 : 502);
  }
});

function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: cors }); }
