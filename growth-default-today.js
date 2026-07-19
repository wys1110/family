(() => {
  const TODAY_FILTER = "today";

  function selectTodayFilter() {
    const filterBar = document.querySelector("#growthFilterBar");
    const todayButton = filterBar?.querySelector(`[data-growth-filter="${TODAY_FILTER}"]`);
    if (!todayButton) return false;
    if (!todayButton.classList.contains("active")) todayButton.click();
    return true;
  }

  function applyInitialDefault() {
    if (selectTodayFilter()) return;
    const observer = new MutationObserver(() => {
      if (!selectTodayFilter()) return;
      observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  applyInitialDefault();

  const babySelector = document.querySelector("#babySelector");
  babySelector?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-baby-id]")) return;
    queueMicrotask(selectTodayFilter);
  });
})();
