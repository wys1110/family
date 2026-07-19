export const AI_CARE_CATEGORIES = new Set(["수유·이유식", "수면"]);

export function isAiCareCategory(category) {
  return AI_CARE_CATEGORIES.has(category);
}

export function refreshDueAt(now = new Date()) {
  return new Date(now.getTime() + 30 * 60_000).toISOString();
}

export function shouldReplaceDraft(existingEnd, requestedEnd) {
  return !existingEnd || Date.parse(requestedEnd) > Date.parse(existingEnd);
}

export function formatStrategySections(content) {
  return [
    { title: "확인한 패턴", items: content.observations || [] },
    { title: "실행 단계", items: content.actions || [] },
    { title: "관찰할 것", items: content.watch || [] },
    { title: "다시 살펴볼 때", items: content.reassess ? [content.reassess] : [] },
  ];
}

if (typeof window !== "undefined") {
  window.FamilyBabyAiCore = {
    AI_CARE_CATEGORIES,
    isAiCareCategory,
    refreshDueAt,
    shouldReplaceDraft,
    formatStrategySections,
  };
}
