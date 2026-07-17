(() => {
  const SUMMARY_PERIOD_KEY = "family-growth-summary-period-v1";

  function useWeeklySummaryByDefault() {
    try {
      const saved = localStorage.getItem(SUMMARY_PERIOD_KEY);
      if (!saved || saved === "day") localStorage.setItem(SUMMARY_PERIOD_KEY, "week");
    } catch { /* 현재 화면에는 그대로 적용 */ }

    if (typeof state !== "undefined" && state.growthSummaryPeriod === "day") {
      state.growthSummaryPeriod = "week";
    }

    document.querySelector('[data-summary-period="day"]')?.remove();
  }

  function mergeRecordingTools() {
    const timerCard = document.querySelector("#careTimerCard");
    const quickSection = document.querySelector("#growthQuickSection");
    if (!timerCard) return;

    timerCard.querySelector("#careTimerStarts")?.remove();

    let block = timerCard.querySelector(".care-quick-block");
    let quickGrid = block?.querySelector(".growth-quick-grid") || quickSection?.querySelector(".growth-quick-grid");
    if (!quickGrid) return;

    quickGrid
      .querySelectorAll('[data-growth-quick="건강·병원"], [data-growth-quick="성장"], [data-growth-quick="첫 순간"]')
      .forEach((button) => button.remove());

    if (!block) {
      block = document.createElement("div");
      block.className = "care-quick-block";
      block.innerHTML = `
        <div class="care-quick-heading">
          <div><strong>빠른 기록</strong><small>자주 쓰는 기록은 한 번에 남겨요</small></div>
          <span>ONE TAP</span>
        </div>
      `;
      block.appendChild(quickGrid);
      timerCard.appendChild(block);
    }

    quickSection?.remove();

    const title = document.querySelector("#careTimerTitle");
    if (title) title.textContent = "기록하기";
    const eyebrow = timerCard.querySelector(".care-timer-heading .eyebrow");
    if (eyebrow) eyebrow.textContent = "CARE LOG";
    const description = timerCard.querySelector(".care-timer-heading small");
    if (description) description.textContent = "빠른 기록으로 바로 남겨요";
    const badge = timerCard.querySelector(".care-live-badge");
    if (badge) badge.innerHTML = '<i aria-hidden="true"></i> 기록';
  }

  function reorderGrowthSections() {
    const pattern = document.querySelector(".care-pattern-section");
    const summary = document.querySelector(".integrated-care-summary");
    if (pattern && summary) {
      summary.classList.add("standalone-growth-summary");
      if (pattern.nextElementSibling !== summary) pattern.after(summary);
    }

    const insight = document.querySelector("#growthInsightRow");
    const recentPhotos = document.querySelector("#recentPhotoSection");
    if (insight && recentPhotos && insight.nextElementSibling !== recentPhotos) insight.after(recentPhotos);
  }

  function removeDuplicateControls() {
    document.querySelector('[data-growth-filter="photo"]')?.remove();
    document.querySelector("#carePatternContent .care-clock-summary")?.remove();
    if (typeof state !== "undefined" && state.growthFilter === "photo") state.growthFilter = "all";
  }

  function applyGrowthDedupLayout() {
    useWeeklySummaryByDefault();
    mergeRecordingTools();
    reorderGrowthSections();
    removeDuplicateControls();
  }

  if (typeof renderDailyCareClock === "function" && !renderDailyCareClock.__growthDedupWrapped) {
    const originalRenderDailyCareClock = renderDailyCareClock;
    renderDailyCareClock = function renderDailyCareClockWithoutDuplicateSummary(...args) {
      const result = originalRenderDailyCareClock.apply(this, args);
      document.querySelector("#carePatternContent .care-clock-summary")?.remove();
      return result;
    };
    renderDailyCareClock.__growthDedupWrapped = true;
  }

  if (typeof renderGrowth === "function" && !renderGrowth.__growthDedupWrapped) {
    const originalRenderGrowth = renderGrowth;
    renderGrowth = function renderGrowthWithoutDuplicateSections(...args) {
      const result = originalRenderGrowth.apply(this, args);
      applyGrowthDedupLayout();
      return result;
    };
    renderGrowth.__growthDedupWrapped = true;
  }

  applyGrowthDedupLayout();
  if (typeof renderGrowth === "function") renderGrowth();
})();
