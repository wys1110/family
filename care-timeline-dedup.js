(() => {
  if (typeof renderDailyCareClock !== "function" || renderDailyCareClock.__summaryDedupWrapped) return;

  const removeDuplicateSummary = () => {
    document.querySelector("#carePatternContent .adaptive-feeding-summary")?.remove();
  };

  const originalRenderDailyCareClock = renderDailyCareClock;
  const deduplicatedRenderDailyCareClock = function deduplicatedRenderDailyCareClock() {
    const result = originalRenderDailyCareClock.apply(this, arguments);
    removeDuplicateSummary();
    return result;
  };

  deduplicatedRenderDailyCareClock.__summaryDedupWrapped = true;
  renderDailyCareClock = deduplicatedRenderDailyCareClock;

  removeDuplicateSummary();
  if (typeof renderGrowth === "function") renderGrowth();
})();
