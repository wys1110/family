(() => {
  const insightRow = document.querySelector("#growthInsightRow");
  if (!insightRow || document.documentElement.dataset.growthHistoryEditBound === "true") return;

  document.documentElement.dataset.growthHistoryEditBound = "true";

  const afterRender = (callback) => {
    requestAnimationFrame(() => requestAnimationFrame(callback));
  };

  const ensureHistoryAction = () => {
    const actions = insightRow.querySelector(".latest-growth-actions");
    if (!actions || actions.querySelector('[data-growth-history-action="open"]')) return;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.growthHistoryAction = "open";
    button.setAttribute("aria-haspopup", "dialog");
    button.innerHTML = '<span aria-hidden="true">↶</span><span>이전 기록</span>';

    const recentEditButton = actions.querySelector('[data-growth-measure-action="edit"]');
    if (recentEditButton) recentEditButton.before(button);
    else actions.appendChild(button);
  };

  const decorateHistoryDialog = () => {
    const dialog = document.querySelector("#growthChartDialog");
    if (!dialog?.open) return;

    const title = dialog.querySelector("#growthMeasureHistoryTitle");
    if (title) title.textContent = "이전 성장 기록";

    const addButton = dialog.querySelector("[data-growth-chart-add]");
    if (addButton) addButton.innerHTML = '<span aria-hidden="true">＋</span> 과거 기록 추가';

    const history = dialog.querySelector(".growth-measure-history");
    if (!history) return;
    history.scrollIntoView({ behavior: "smooth", block: "start" });
    history.classList.add("growth-history-highlight");
    window.setTimeout(() => history.classList.remove("growth-history-highlight"), 900);
  };

  const openHistory = () => {
    const chartButton = insightRow.querySelector('[data-growth-measure-action="chart"]');
    if (!chartButton) return;
    chartButton.click();
    afterRender(decorateHistoryDialog);
  };

  const ensurePreviousEntryHint = () => {
    const dialog = document.querySelector("#growthDialog");
    const form = document.querySelector("#growthForm");
    const primaryRow = form?.querySelector(".growth-primary-row");
    if (!dialog?.open || !form || !primaryRow) return;

    document.querySelector("#growthDialogTitle").textContent = "이전 성장 기록 추가";
    const babyName = typeof activeBaby === "function" ? activeBaby()?.name : "";
    document.querySelector("#growthDialogEyebrow").textContent = `${babyName || "아기"} · 과거 측정값`;

    let hint = form.querySelector(".growth-history-form-hint");
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "growth-history-form-hint";
      primaryRow.before(hint);
    }
    hint.hidden = false;
    hint.textContent = "측정했던 날짜를 선택하고 키·몸무게·머리둘레를 입력해 주세요.";

    const dateInput = document.querySelector("#growthDate");
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) dateInput?.focus();
  };

  insightRow.addEventListener("click", (event) => {
    const button = event.target.closest('[data-growth-history-action="open"]');
    if (!button) return;
    event.preventDefault();
    openHistory();
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-growth-chart-add], [data-empty-growth-add]")) {
      afterRender(ensurePreviousEntryHint);
      return;
    }

    const historyRow = event.target.closest("[data-growth-measure-entry]");
    if (!historyRow) return;
    afterRender(() => {
      const hint = document.querySelector("#growthForm .growth-history-form-hint");
      if (hint) hint.hidden = true;
    });
  });

  document.querySelector("#growthDialog")?.addEventListener("close", () => {
    const hint = document.querySelector("#growthForm .growth-history-form-hint");
    if (hint) hint.hidden = true;
  });

  new MutationObserver(ensureHistoryAction).observe(insightRow, { childList: true, subtree: true });
  ensureHistoryAction();
})();
