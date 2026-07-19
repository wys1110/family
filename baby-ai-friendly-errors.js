(() => {
  const RATE_LIMIT_MESSAGE = "AI 사용량이 잠시 많아요. 잠시 뒤 다시 시도해 주세요.";
  const REFRESH_FAILURE_MESSAGE = "자동 전략 갱신이 세 번 실패했어요. 전략 탭에서 직접 다시 만들어 주세요.";
  const RESTING_MESSAGE = "제미나이가 지금 쉬는 중이에요 😴 잠시 후 다시 질문해 주세요.";

  let queueCheckInFlight = false;

  function replaceRateLimitMessages() {
    document.querySelectorAll("#babyAiAssistant .baby-ai-status, #babyAiAssistant .baby-ai-message p").forEach((element) => {
      if (element.textContent?.trim() === RATE_LIMIT_MESSAGE) element.textContent = RESTING_MESSAGE;
    });
  }

  async function replaceRateLimitedRefreshFailure() {
    const status = document.querySelector("#babyAiStatus");
    if (!status || status.textContent?.trim() !== REFRESH_FAILURE_MESSAGE || queueCheckInFlight) return;
    if (typeof state === "undefined" || !state.supabase || !state.session || !state.activeBabyId) return;

    queueCheckInFlight = true;
    try {
      const babyId = state.activeBabyId;
      const { data, error } = await state.supabase
        .from("baby_ai_refresh_queue")
        .select("status,attempt_count,last_error")
        .eq("baby_id", babyId)
        .maybeSingle();
      if (error || babyId !== state.activeBabyId) return;
      if (
        status.textContent?.trim() === REFRESH_FAILURE_MESSAGE
        && data?.status === "failed"
        && Number(data.attempt_count) >= 3
        && data.last_error === "GEMINI_HTTP_429"
      ) {
        status.textContent = RESTING_MESSAGE;
      }
    } finally {
      queueCheckInFlight = false;
    }
  }

  function refreshFriendlyErrors() {
    replaceRateLimitMessages();
    void replaceRateLimitedRefreshFailure();
  }

  const root = document.querySelector("#babyAiAssistant");
  if (root) {
    new MutationObserver(refreshFriendlyErrors).observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  window.addEventListener("familybabychange", refreshFriendlyErrors);
  window.addEventListener("familycontextchange", refreshFriendlyErrors);
  refreshFriendlyErrors();
})();
