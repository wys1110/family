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

  function compactDuration(value) {
    const minutes = Math.round(positiveNumber(value));
    if (!minutes) return "–";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours}h${remainder || ""}`;
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
    const days = Array.from({ length: 7 }, (_, index) => addDays(end, index - 6));
    const daily = days.map((day) => {
      const dayItems = items.filter((entry) => entry.date === day);
      return {
        day,
        feed: dayItems.filter((entry) => entry.category === "수유·이유식").length,
        sleep: dayItems.filter((entry) => entry.category === "수면").reduce((total, entry) => total + positiveNumber(entry.sleepMinutes), 0),
        diaper: dayItems.filter((entry) => entry.category === "기저귀").length,
      };
    });

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
      daily,
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

  function rhythmCell(metric, item, maxValue, isToday) {
    const value = positiveNumber(item[metric.type]);
    const strength = value ? Math.round(10 + (value / maxValue) * 30) : 4;
    const visibleValue = metric.format(value);
    const spokenValue = metric.spoken(value);
    return `<span class="weekly-rhythm-cell ${metric.type} ${value ? "has-value" : "empty"} ${isToday ? "today" : ""}" style="--cell-strength:${strength}%" aria-label="${metric.label} ${spokenValue}">${visibleValue}</span>`;
  }

  function weeklyRhythmMap(totals) {
    const metrics = [
      { type: "feed", label: "수유", unit: "회", format: (value) => value ? Math.round(value) : "–", spoken: (value) => `${Math.round(value)}회` },
      { type: "sleep", label: "수면", unit: "시간", format: compactDuration, spoken: (value) => value ? formatDuration(Math.round(value)) : "0분" },
      { type: "diaper", label: "기저귀", unit: "회", format: (value) => value ? Math.round(value) : "–", spoken: (value) => `${Math.round(value)}회` },
    ].filter((metric) => carePatternCategories.has(metric.type));
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const headers = totals.daily.map((item) => {
      const date = parseDate(item.day);
      const isToday = item.day === totals.end;
      return `<span class="weekly-rhythm-day ${isToday ? "today" : ""}"><strong>${isToday ? "오늘" : weekdays[date.getDay()]}</strong><small>${date.getDate()}</small></span>`;
    }).join("");
    const rows = metrics.map((metric) => {
      const maxValue = Math.max(1, ...totals.daily.map((item) => positiveNumber(item[metric.type])));
      const cells = totals.daily.map((item) => rhythmCell(metric, item, maxValue, item.day === totals.end)).join("");
      return `<div class="weekly-rhythm-label ${metric.type}"><strong>${metric.label}</strong><small>${metric.unit}</small></div>${cells}`;
    }).join("");

    return `
      <section class="weekly-rhythm-map" aria-label="최근 7일 돌봄 흐름">
        <div class="weekly-rhythm-heading"><strong>7일 돌봄 흐름</strong><span>진할수록 많은 날</span></div>
        <div class="weekly-rhythm-grid">
          <span class="weekly-rhythm-corner" aria-hidden="true"></span>${headers}${rows}
        </div>
      </section>`;
  }

  function renderWeeklyCareSummary(entries) {
    const content = document.querySelector("#carePatternContent");
    if (!content) return;
    content.querySelector(".weekly-care-summary")?.remove();
    content.querySelector(".weekly-rhythm-map")?.remove();
    content.querySelector(".care-rhythm-chart")?.remove();

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
      </section>
      ${weeklyRhythmMap(totals)}`);
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
