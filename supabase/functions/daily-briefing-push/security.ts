// Only browser-vendor push services may receive encrypted family notifications.
export function normalizePushSubscription(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const keys = input.keys as Record<string, unknown> | undefined;
  if (typeof input.endpoint !== "string" || input.endpoint.length > 4096) return null;
  let url: URL;
  try { url = new URL(input.endpoint); } catch { return null; }
  const host = url.hostname;
  const allowed = host === "fcm.googleapis.com" || host === "web.push.apple.com"
    || host === "updates.push.services.mozilla.com"
    || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (!allowed || url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return null;
  const decodeKey = (value: unknown, length: number) => {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
    try {
      const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
      return decoded.length === length ? decoded : null;
    } catch { return null; }
  };
  const publicKey = decodeKey(keys?.p256dh, 65);
  if (!publicKey || publicKey.charCodeAt(0) !== 4 || !decodeKey(keys?.auth, 16)) return null;
  return { endpoint: url.href, keys: { p256dh: keys!.p256dh as string, auth: keys!.auth as string } };
}

// Recheck membership at the send boundary, including scheduled and test sends.
export async function maySendPush(client: any, subscription: any): Promise<boolean> {
  const { data, error } = await client.from("household_members").select("household_id")
    .eq("household_id", subscription.household_id).eq("user_id", subscription.user_id).maybeSingle();
  return !error && Boolean(data) && Boolean(normalizePushSubscription({
    endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }));
}

export async function claimChange(client: any, householdId: string, sourceType: string, sourceId: string | null) {
  const { data, error } = await client.rpc("claim_family_notification_change", {
    p_household_id: householdId, p_source_type: sourceType, p_source_id: sourceId,
  });
  if (error) throw new Error("CHANGE_VERIFICATION_FAILED");
  return data;
}
