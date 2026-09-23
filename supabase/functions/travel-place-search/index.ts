// @ts-nocheck -- Supabase Edge Runtime provides Deno and npm: imports.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const GEOAPIFY_KEY = Deno.env.get("GEOAPIFY_API_KEY") || "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const authorization = request.headers.get("authorization") || "";
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json({ error: "UNAUTHORIZED" }, 401);
  let body: { query?: unknown; limit?: unknown };
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
  const query = String(body.query || "").trim();
  const limit = Math.max(1, Math.min(10, Number(body.limit) || 10));
  if (query.length < 2 || query.length > 120) return json({ error: "INVALID_QUERY" }, 400);
  if (!GEOAPIFY_KEY) return json({ status: "unavailable", items: [], message: "장소 검색 설정이 아직 연결되지 않았어요." }, 503);
  const householdId = request.headers.get("x-family-household") || "";
  if (householdId) {
    const { data: membership, error: membershipError } = await client.from("household_members").select("household_id").eq("household_id", householdId).eq("user_id", authData.user.id).maybeSingle();
    if (membershipError || !membership) return json({ error: "FORBIDDEN" }, 403);
  }
  const upstream = await fetch(`https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&limit=${limit}&lang=ko&apiKey=${encodeURIComponent(GEOAPIFY_KEY)}`);
  if (!upstream.ok) return json({ status: upstream.status === 429 ? "limit" : "error", items: [], message: "장소 검색에 실패했어요. 잠시 후 다시 시도해 주세요." }, upstream.status === 429 ? 429 : 502);
  const payload = await upstream.json();
  const items = (payload.results || []).slice(0, limit).map((result: any) => ({ provider: "geoapify", providerId: result.place_id || null, name: result.name || result.address_line1 || query, address: result.formatted || result.address_line2 || "", lat: Number(result.lat), lng: Number(result.lon), attribution: "© Geoapify · © OpenStreetMap contributors" })).filter((item: any) => Number.isFinite(item.lat) && Number.isFinite(item.lng) && Math.abs(item.lat) <= 90 && Math.abs(item.lng) <= 180);
  return json({ status: "ok", items });
});

function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: cors }); }
