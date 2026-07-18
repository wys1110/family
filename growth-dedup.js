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

  function ensureCompactRecordingStyles() {
    if (document.querySelector('style[data-module="compact-growth-recording"]')) return;

    const style = document.createElement("style");
    style.dataset.module = "compact-growth-recording";
    style.textContent = `
      #growthView #careTimerCard {
        margin: 0;
        padding: 16px;
        border-radius: 20px;
        background: var(--growth-card);
        box-shadow: none;
      }
      #growthView #careTimerCard::after { display: none; }
      #growthView #careTimerCard .care-timer-heading {
        display: block;
        margin: 0 0 12px;
      }
      #growthView #careTimerCard .care-timer-heading h2 {
        margin: 0;
        font-size: 18px;
        line-height: 1.2;
      }
      #growthView #careTimerCard .care-timer-heading .eyebrow,
      #growthView #careTimerCard .care-timer-heading small,
      #growthView #careTimerCard .care-live-badge,
      #growthView #careTimerCard .care-quick-heading { display: none; }
      #growthView #careTimerCard .care-quick-block {
        margin: 0;
        padding: 0;
        border: 0;
      }
      #growthView #careTimerCard .care-quick-block .growth-quick-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin: 0;
      }
      #growthView #careTimerCard .care-quick-block .growth-quick-grid button {
        min-height: 72px;
        padding: 9px 5px;
        border-radius: 15px;
        box-shadow: none;
        font-size: 11px;
      }
      #growthView #careTimerCard .care-quick-block .quick-symbol {
        width: 32px;
        height: 32px;
        box-shadow: none;
      }
      @media (min-width: 768px) {
        #growthView #careTimerCard { padding: 20px; }
        #growthView #careTimerCard .care-timer-heading h2 { font-size: 22px; }
        #growthView #careTimerCard .care-quick-block .growth-quick-grid button {
          min-height: 86px;
          font-size: 13px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function mergeRecordingTools() {
    const timerCard = document.querySelector("#careTimerCard");
    const quickSection = document.querySelector("#growthQuickSection");
    if (!timerCard) return;

    let block = timerCard.querySelector(".care-quick-block");
    const quickGrid = block?.querySelector(".growth-quick-grid") || quickSection?.querySelector(".growth-quick-grid");
    if (!quickGrid) return;

    quickGrid
      .querySelectorAll('[data-growth-quick="수면"], [data-growth-quick="건강·병원"], [data-growth-quick="성장"], [data-growth-quick="첫 순간"]')
      .forEach((button) => button.remove());

    if (!block) {
      block = document.createElement("div");
      block.className = "care-quick-block";
      block.appendChild(quickGrid);
      timerCard.appendChild(block);
    }

    block.querySelector(".care-quick-heading")?.remove();
    quickSection?.remove();

    const title = document.querySelector("#careTimerTitle");
    if (title) title.textContent = "기록하기";
    timerCard.querySelector(".care-timer-heading .eyebrow")?.remove();
    timerCard.querySelector(".care-timer-heading small")?.remove();
    timerCard.querySelector(".care-live-badge")?.remove();
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
