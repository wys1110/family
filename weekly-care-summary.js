(() => {
  const baseRenderWeeklyCarePattern = renderWeeklyCarePattern;

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function formatMl(value) {
    return Math.round(value).toLocaleString("ko-KR");
  }

  function feedingKind(entry) {
    if (entry?.category !== "수유·이유식") return "";
    const feedingType = String(entry.feedingType || "");
    const title = String(entry.title || "");
    if (feedingType === "유축모유" || title.includes("유축")) return "pumped";
    if (feedingType === "모유" || title.includes("모유")) return "breast";
    return "formula";
  }

  function formatRange(startKey, endKey) {
    const start = parseDate(startKey);
    const end = parseDate(endKey);
    const startText = `${start.getMonth() + 1}.${start.getDate()}`;
    const endText = `${end.getMonth() + 1}.${end.getDate()}`;
    return `${startText}–${endText}`;
  }

  function weeklyTotals(entries) {
    const end = dateKey(new Date());
    const start = addDays(end, -6);
    const items = (Array.isArray(entries) ? entries : []).filter((entry) => entry.date >= start && entry.date <= end);
    const feedings = items.filter((entry) => entry.category === "수유·이유식");
    const formula = feedings.filter((entry) => feedingKind(entry) === "formula");
    const pumped = feedings.filter((entry) => feedingKind(entry) === "pumped");
    const breast = feedings.filter((entry) => feedingKind(entry) === "breast");
    const sleep = items.filter((entry) => entry.category === "수면");
    const diapers = items.filter((entry) => entry.category === "기저귀");
    const sum = (list, field) => list.reduce((total, entry) => total + positiveNumber(entry[field]), 0);
    const formulaMl = sum(formula, "feedingMl");
    const pumpedMl = sum(pumped, "feedingMl");
    const sleepMinutes = sum(sleep, "sleepMinutes");

    return {
      start,
      end,
      items,
      feedings,
      formulaMl,
      pumpedMl,
      bottleMl: formulaMl + pumpedMl,
      breastMinutes: sum(breast, "feedingMinutes"),
      sleep,
      sleepMinutes,
      diapers,
      wetDiapers: diapers.filter((entry) => String(entry.diaperKind || "").includes("소변")).length,
      dirtyDiapers: diapers.filter((entry) => String(entry.diaperKind || "").includes("대변")).length,
    };
  }

  function feedCard(totals) {
    return `
      <article class="weekly-care-metric feed">
        <div class="weekly-care-metric-heading"><span>수유 합계</span><em>총 ${totals.feedings.length}회</em></div>
        <strong>${formatMl(totals.bottleMl)}<small>mL</small></strong>
        <div class="weekly-care-details">
          <span>분유 ${formatMl(totals.formulaMl)}mL</span>
          <span>유축 ${formatMl(totals.pumpedMl)}mL</span>
          <span>직수 ${totals.breastMinutes ? formatDuration(totals.breastMinutes) : "0분"}</span>
        </div>
      </article>`;
  }

  function sleepCard(totals) {
    return `
      <article class="weekly-care-metric sleep">
        <div class="weekly-care-metric-heading"><span>수면 합계</span><em>${totals.sleep.length}회</em></div>
        <strong>${totals.sleepMinutes ? formatDuration(totals.sleepMinutes) : "0분"}</strong>
        <div class="weekly-care-details"><span>하루 평균 ${totals.sleepMinutes ? formatDuration(Math.round(totals.sleepMinutes / 7)) : "0분"}</span></div>
      </article>`;
  }

  function diaperCard(totals) {
    return `
      <article class="weekly-care-metric diaper">
        <div class="weekly-care-metric-heading"><span>기저귀 합계</span><em>최근 7일</em></div>
        <strong>${totals.diapers.length}<small>회</small></strong>
        <div class="weekly-care-details">
          <span>소변 ${totals.wetDiapers}</span>
          <span>대변 ${totals.dirtyDiapers}</span>
        </div>
      </article>`;
  }

  function renderWeeklyCareSummary(entries) {
    const content = document.querySelector("#carePatternContent");
    if (!content) return;
    content.querySelector(".weekly-care-summary")?.remove();

    const totals = weeklyTotals(entries);
    if (!totals.items.some((entry) => ["수유·이유식", "수면", "기저귀"].includes(entry.category))) return;

    const cards = [];
    if (carePatternCategories.has("feed")) cards.push(feedCard(totals));
    if (carePatternCategories.has("sleep")) cards.push(sleepCard(totals));
    if (carePatternCategories.has("diaper")) cards.push(diaperCard(totals));

    content.insertAdjacentHTML("afterbegin", `
      <section class="weekly-care-summary" aria-label="최근 7일 돌봄 합계" aria-live="polite">
        <header>
          <div><span>WEEKLY TOTAL</span><strong>최근 7일 돌봄 합계</strong></div>
          <time>${formatRange(totals.start, totals.end)}</time>
        </header>
        <div class="weekly-care-metric-grid ${cards.length === 1 ? "single" : ""}">${cards.join("")}</div>
        ${carePatternCategories.has("feed") ? '<p class="weekly-care-note">총 mL는 분유와 유축모유 합계이며, 직수는 시간으로 표시해요.</p>' : ""}
      </section>`);
  }

  renderWeeklyCarePattern = function renderWeeklyCarePatternWithTotals(entries) {
    const result = baseRenderWeeklyCarePattern.apply(this, arguments);
    renderWeeklyCareSummary(entries);
    return result;
  };

  if (carePatternView === "week" && typeof activeBabyEntries === "function") {
    renderWeeklyCarePattern(activeBabyEntries());
  }
})();
