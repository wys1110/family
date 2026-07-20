(() => {
  const selectTodayFilter = () => {
    const button = document.querySelector('#growthFilterBar [data-growth-filter="today"]');
    if (!button) return false;
    if (!button.classList.contains("active")) button.click();
    return true;
  };

  if (!selectTodayFilter()) {
    window.addEventListener("familycontextchange", selectTodayFilter, { once: true });
  }

  document.querySelector("#babySelector")?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-baby-id]")) return;
    setTimeout(selectTodayFilter, 0);
  });
})();
