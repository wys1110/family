(() => {
  const baseRenderDailyCareClock = renderDailyCareClock;

  function feedingKind(entry) {
    if (entry?.category !== "수유·이유식") return "";
    const feedingType = String(entry.feedingType || "");
    const title = String(entry.title || "");
    if (feedingType === "유축모유" || title.includes("유축")) return "pumped";
    if (feedingType === "모유" || title.includes("모유")) return "breast";
    return "formula";
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function formatMl(value) {
    return Math.round(value).toLocaleString("ko-KR");
  }

  function dailyFeedingTotals(entries) {
    const feedings = entries.filter((entry) => entry.date === carePatternDate && feedingKind(entry));
    const byKind = (kind) => feedings.filter((entry) => feedingKind(entry) === kind);
    const formula = byKind("formula");
    const pumped = byKind("pumped");
    const breast = byKind("breast");
    const sum = (items, field) => items.reduce((total, entry) => total + positiveNumber(entry[field]), 0);

    const formulaMl = sum(formula, "feedingMl");
    const pumpedMl = sum(pumped, "feedingMl");
    return {
      formulaMl,
      pumpedMl,
      bottleMl: formulaMl + pumpedMl,
      formulaCount: formula.length,
      pumpedCount: pumped.length,
      breastMinutes: sum(breast, "feedingMinutes"),
      breastCount: breast.length,
    };
  }

  function metric(label, value, count, className) {
    return `
      <article class="${className}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${count}회</small>
      </article>`;
  }

  function renderDailyIntakeSummary(entries) {
    if (carePatternView !== "day") return;
    const content = document.querySelector("#carePatternContent");
    if (!content) return;

    content.querySelector(".daily-intake-summary")?.remove();
    const totals = dailyFeedingTotals(Array.isArray(entries) ? entries : []);
    const directValue = totals.breastMinutes ? formatDuration(totals.breastMinutes) : "0분";
    const dateContext = carePatternDate === dateKey(new Date()) ? "오늘" : "선택한 날";

    content.insertAdjacentHTML("afterbegin", `
      <section class="daily-intake-summary" aria-label="${dateContext} 수유 합계" aria-live="polite">
        <header>
          <div>
            <span>DAILY FEEDING</span>
            <strong>${dateContext} 수유 합계</strong>
          </div>
          <p><b>${formatMl(totals.bottleMl)}</b><span>mL</span></p>
        </header>
        <div class="daily-intake-breakdown">
          ${metric("분유", `${formatMl(totals.formulaMl)}mL`, totals.formulaCount, "formula")}
          ${metric("유축", `${formatMl(totals.pumpedMl)}mL`, totals.pumpedCount, "pumped")}
          ${metric("직수", directValue, totals.breastCount, "breast")}
        </div>
        <small class="daily-intake-note">총 mL는 분유와 유축모유 합계예요. 직수는 수유 시간으로 표시합니다.</small>
      </section>`);
  }

  renderDailyCareClock = function renderDailyCareWithIntakeSummary(entries) {
    const result = baseRenderDailyCareClock.apply(this, arguments);
    renderDailyIntakeSummary(entries);
    return result;
  };

  if (typeof activeBabyEntries === "function" && typeof renderCarePattern === "function") {
    renderCarePattern(activeBabyEntries());
  }
})();
