export type GrowthNotificationChange = {
  kind: string;
  sourceId?: string;
  sourceDate?: string;
  category?: string;
  title?: string;
  heightCm?: number | null;
  weightKg?: number | null;
  headCm?: number | null;
  feedingMl?: number | null;
  feedingType?: string;
  feedingSide?: string;
  feedingMinutes?: number | null;
  sleepMinutes?: number | null;
  temperatureC?: number | null;
  diaperKind?: string;
};

export function buildGrowthChangePayload(change: GrowthNotificationChange, actorLabel = "") {
  const details = [...growthNotificationDetails(change), normalizeFamilyRole(actorLabel)].filter(Boolean);
  return {
    title: details.join(" · ").slice(0, 120),
    body: "",
    tag: `family-growth-change-${change.sourceId || change.sourceDate}-${change.kind}`,
    url: `./?growthDate=${encodeURIComponent(change.sourceDate || "")}${change.sourceId ? `&growthId=${encodeURIComponent(change.sourceId)}` : ""}`,
    date: change.sourceDate,
    sourceId: change.sourceId,
    sourceDate: change.sourceDate,
    renotify: true,
  };
}

export function normalizeFamilyRole(value: unknown) {
  return value === "엄마" || value === "아빠" ? value : "";
}

function growthNotificationDetails(change: GrowthNotificationChange) {
  if (change.category === "수유·이유식") {
    const details = [
      change.feedingType || "",
      change.feedingSide ? `${change.feedingSide} 수유` : "",
      change.feedingMinutes == null ? "" : `${change.feedingMinutes}분`,
      change.feedingMl == null ? "" : `${change.feedingMl}ml`,
    ].filter(Boolean);
    return details.length ? details : [change.title || change.category || ""];
  }
  if (change.category === "기저귀") {
    return ["기저귀", change.diaperKind || ""].filter(Boolean);
  }
  if (change.category === "수면") {
    return ["수면", change.sleepMinutes == null ? "" : `${change.sleepMinutes}분`].filter(Boolean);
  }
  if (change.category === "성장") {
    const details = [
      change.heightCm == null ? "" : `키 ${change.heightCm}cm`,
      change.weightKg == null ? "" : `몸무게 ${change.weightKg}kg`,
      change.headCm == null ? "" : `머리둘레 ${change.headCm}cm`,
    ].filter(Boolean);
    return details.length ? details : [change.title || change.category || ""];
  }
  if (change.category === "건강·병원") {
    return [change.title || change.category || ""].filter(Boolean);
  }
  return [change.title || change.category || ""].filter(Boolean);
}
