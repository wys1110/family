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
    if (feedingType === "이유식" || title.includes("이유식")) return "solid";
    if (feedingType === "모유" || title.includes("모유")) return "breast";
    return "formula";
  }

  function formatRange(startKey, endKey) {
    const start = parseDate(startKey);
    const end = parseDate(endKey);
    return `${start.getMonth() + 1}.${start.getDate()}–${end.getMonth() + 1}.${end.getDate()}`;
  }

  function weeklyTotals(entries) {
    const end = dateKey(new Date());
    const start = addDays(end, -6);
    const items = (Array.isArray(entries) ? entries : []).filter((entry) => entry.date >= start && entry.date <= end);
    const feedings = items.filter((entry) => entry.category === "수유·이유식");
    const formula = feedings.filter((entry) => feedingKind(entry) === "formula");
    const pumped = feedings.filter((entry) => feedingKind(entry) === "pumped");
    const breast = feedings.filter((entry) => feedingKind(entry) === "breast");
    const solid = feedings.filter((entry) => feedingKind(entry) === "solid");
    const sleep = items.filter((entry) => entry.category === "수면");
    const diapers = items.filter((entry) => entry.category === "기저귀");
    const sum = (list, field) => list.reduce((total, entry) => total + positiveNumber(entry[field]), 0);
    const formulaMl = sum(formula, "feedingMl");
    const pumpedMl = sum(pumped, "feedingMl");
    const breastMinutes = sum(breast, "feedingMinutes");
    const solidMl = sum(solid, "feedingMl");
    const sleepMinutes = sum(sleep, "sleepMinutes");
    const days = Array.from({ length: 7 }, (_, index) => addDays(end, index - 6));
    const daily = days.map((day) => {
      const dayItems = items.filter((entry) => entry.date === day);
      const dayFeedings = dayItems.filter((entry) => entry.category === "수유·이유식");
      return {
        day,
        formulaMl: sum(dayFeedings.filter((entry) => feedingKind(entry) === "formula"), "feedingMl"),
        pumpedMl: sum(dayFeedings.filter((entry) => feedingKind(entry) === "pumped"), "feedingMl"),
        breastMinutes: sum(dayFeedings.filter((entry) => feedingKind(entry) === "breast"), "feedingMinutes"),
        solidMl: sum(dayFeedings.filter((entry) => feedingKind(entry) === "solid"), "feedingMl"),
        sleepMinutes: sum(dayItems.filter((entry) => entry.category === "수면"), "sleepMinutes"),
        diaperCount: dayItems.filter((entry) => entry.category === "기저귀").length,
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
      breastMinutes,
      solidMl,
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
          <span>모유 ${totals.breastMinutes ? formatDuration(totals.breastMinutes) : "0분"}</span>
          <span>이유식 ${formatMl(totals.solidMl)}mL</span>
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

  function formatSeriesValue(series, value) {
    const rounded = Math.round(positiveNumber(value));
    if (series.unit === "mL") return `${formatMl(rounded)}mL`;
    if (series.unit === "분") return rounded ? formatDuration(rounded) : "0분";
    return `${rounded}회`;
  }

  function chartSeries(totals) {
    const series = [];
    if (carePatternCategories.has("formula")) {
      series.push({ key: "formulaMl", label: "분유", unit: "mL", className: "formula", total: totals.formulaMl });
    }
    if (carePatternCategories.has("pumped")) {
      series.push({ key: "pumpedMl", label: "유축", unit: "mL", className: "pumped", total: totals.pumpedMl });
    }
    if (carePatternCategories.has("breast")) {
      series.push({ key: "breastMinutes", label: "모유", unit: "분", className: "breast", total: totals.breastMinutes });
    }
    if (carePatternCategories.has("solid")) {
      series.push({ key: "solidMl", label: "이유식", unit: "mL", className: "solid", total: totals.solidMl });
    }
    if (carePatternCategories.has("sleep")) {
      series.push({ key: "sleepMinutes", label: "수면", unit: "분", className: "sleep", total: totals.sleepMinutes });
    }
    if (carePatternCategories.has("diaper")) {
      series.push({ key: "diaperCount", label: "기저귀", unit: "회", className: "diaper", total: totals.diapers.length });
    }
    return series;
  }

  function chartPoint(index, value, maxValue, dataLength, width, height, padding) {
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const x = padding.left + innerWidth * (index / Math.max(1, dataLength - 1));
    const ratio = maxValue ? positiveNumber(value) / maxValue : 0;
    const y = padding.top + innerHeight * (1 - ratio);
    return { x, y };
  }

  function renderLineSeries(series, totals, dimensions) {
    const values = totals.daily.map((item) => positiveNumber(item[series.key]));
    const maxValue = Math.max(1, ...values);
    const points = values.map((value, index) => chartPoint(index, value, maxValue, values.length, dimensions.width, dimensions.height, dimensions.padding));
    const polyline = points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const dots = points.map(({ x, y }, index) => {
      const item = totals.daily[index];
      const date = parseDate(item.day);
      const label = `${date.getMonth() + 1}월 ${date.getDate()}일 ${series.label} ${formatSeriesValue(series, values[index])}`;
      return `<circle class="weekly-trend-dot ${series.className}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"><title>${label}</title></circle>`;
    }).join("");
    return `<polyline class="weekly-trend-line ${series.className}" points="${polyline}"></polyline>${dots}`;
  }

  function weeklyTrendChart(totals) {
    const series = chartSeries(totals);
    if (!series.length) return "";

    const dimensions = {
      width: 360,
      height: 176,
      padding: { top: 16, right: 18, bottom: 18, left: 18 },
    };
    const innerHeight = dimensions.height - dimensions.padding.top - dimensions.padding.bottom;
    const grid = [0, .25, .5, .75, 1].map((ratio) => {
      const y = dimensions.padding.top + innerHeight * (1 - ratio);
      return `<line x1="${dimensions.padding.left}" y1="${y.toFixed(1)}" x2="${dimensions.width - dimensions.padding.right}" y2="${y.toFixed(1)}"></line>`;
    }).join("");
    const plot = series.map((item) => renderLineSeries(item, totals, dimensions)).join("");
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const axis = totals.daily.map((item) => {
      const date = parseDate(item.day);
      const isToday = item.day === totals.end;
      return `<span class="${isToday ? "today" : ""}"><strong>${isToday ? "오늘" : weekdays[date.getDay()]}</strong><small>${date.getDate()}</small></span>`;
    }).join("");
    const today = totals.daily[totals.daily.length - 1] || {};
    const legend = series.map((item) => `
      <span class="weekly-trend-legend-item ${item.className}">
        <i aria-hidden="true"></i>
        <strong>${item.label}</strong>
        <small>오늘 ${formatSeriesValue(item, today[item.key])}</small>
      </span>`).join("");

    return `
      <section class="weekly-trend-chart" aria-label="최근 7일 돌봄 라인 차트">
        <div class="weekly-trend-heading">
          <div><span>WEEKLY TREND</span><strong>7일 돌봄 추이</strong></div>
          <small>각 항목 내부 기준</small>
        </div>
        <div class="weekly-trend-canvas">
          <svg viewBox="0 0 ${dimensions.width} ${dimensions.height}" role="img" aria-labelledby="weeklyTrendTitle weeklyTrendDescription">
            <title id="weeklyTrendTitle">최근 7일 돌봄 추이</title>
            <desc id="weeklyTrendDescription">분유, 유축, 모유, 이유식, 수면, 기저귀 기록을 항목별 최대값 기준으로 비교한 라인 차트</desc>
            <g class="weekly-trend-grid">${grid}</g>
            <g class="weekly-trend-lines">${plot}</g>
          </svg>
          <div class="weekly-trend-axis" aria-hidden="true">${axis}</div>
        </div>
        <div class="weekly-trend-legend">${legend}</div>
      </section>`;
  }

  function renderWeeklyCareSummary(entries) {
    const content = document.querySelector("#carePatternContent");
    if (!content) return;
    content.querySelector(".weekly-care-summary")?.remove();
    content.querySelector(".weekly-rhythm-map")?.remove();
    content.querySelector(".weekly-trend-chart")?.remove();
    content.querySelector(".care-rhythm-chart")?.remove();

    const totals = weeklyTotals(entries);
    if (!totals.items.some((entry) => ["수유·이유식", "수면", "기저귀"].includes(entry.category))) return;

    const cards = [];
    if (["formula", "pumped", "breast", "solid"].some((kind) => carePatternCategories.has(kind))) cards.push(feedCard(totals));
    if (carePatternCategories.has("sleep")) cards.push(sleepCard(totals));
    if (carePatternCategories.has("diaper")) cards.push(diaperCard(totals));

    content.insertAdjacentHTML("afterbegin", `
      <section class="weekly-care-summary" aria-label="최근 7일 돌봄 합계" aria-live="polite">
        <header>
          <div><span>WEEKLY TOTAL</span><strong>최근 7일 돌봄 합계</strong></div>
          <time>${formatRange(totals.start, totals.end)}</time>
        </header>
        <div class="weekly-care-metric-grid ${cards.length === 1 ? "single" : ""}">${cards.join("")}</div>
        ${cards.includes(feedCard(totals)) ? '<p class="weekly-care-note">분유·유축·이유식은 mL, 모유는 수유 시간으로 표시해요.</p>' : ""}
      </section>
      ${weeklyTrendChart(totals)}`);
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
