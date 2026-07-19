export const AI_CARE_CATEGORIES = new Set(["수유·이유식", "수면"]);

const RATE_LIMIT_MESSAGE = "AI 사용량이 잠시 많아요. 잠시 뒤 다시 시도해 주세요.";
const GEMINI_RESTING_MESSAGE = "제미나이가 지금 쉬는 중이에요 😴 잠시 후 다시 질문해 주세요.";

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

export function replaceGeminiRateLimitMessage(root = document) {
  root.querySelectorAll("#babyAiAssistant .baby-ai-status, #babyAiAssistant .baby-ai-message p").forEach((element) => {
    if (element.textContent?.trim() === RATE_LIMIT_MESSAGE) element.textContent = GEMINI_RESTING_MESSAGE;
  });
}

function installFriendlyGeminiErrors() {
  const root = document.querySelector("#babyAiAssistant");
  if (!root || root.dataset.friendlyGeminiErrors === "true") return;
  root.dataset.friendlyGeminiErrors = "true";
  new MutationObserver(() => replaceGeminiRateLimitMessage(root)).observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  replaceGeminiRateLimitMessage(root);
}

if (typeof window !== "undefined") {
  window.FamilyBabyAiCore = {
    AI_CARE_CATEGORIES,
    isAiCareCategory,
    refreshDueAt,
    shouldReplaceDraft,
    formatStrategySections,
    replaceGeminiRateLimitMessage,
  };
  installFriendlyGeminiErrors();
}
