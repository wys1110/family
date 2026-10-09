(() => {
  const CARE_TYPES = ["formula", "breast", "sleep", "diaper", "health"];

  function splitCareType(entry) {
    if (entry.category === "수유·이유식") {
      const feedingType = String(entry.feedingType || "").trim();
      const title = String(entry.title || "");
      if (feedingType === "모유" || title.includes("모유")) return "breast";
      if (["젖병", "분유"].includes(feedingType) || title.includes("분유") || Number(entry.feedingMl) > 0) return "formula";
      return "formula";
    }
    if (entry.category === "수면") return "sleep";
    if (entry.category === "기저귀") return "diaper";
    if (entry.category === "건강·병원") return "health";
    return "";
  }

  const originalQuickPresets = quickPresets;
  quickPresets = function splitFeedingQuickPresets(category) {
    return originalQuickPresets(category).map((preset) => preset.feedingType === "젖병"
      ? { ...preset, note: "분유", title: "분유 수유" }
      : preset);
  };

  const originalGrowthEntryMeta = growthEntryMeta;
  growthEntryMeta = function splitFeedingEntryMeta(entry) {
    return originalGrowthEntryMeta(entry).replace(/(^| · )젖병(?= | · |$)/g, "$1분유");
  };

  const originalRenderTodayCareSummary = renderTodayCareSummary;
  renderTodayCareSummary = function renderSplitTodayCareSummary(entries) {
    originalRenderTodayCareSummary(entries);
    const today = dateKey(new Date());
    const todayFeedings = entries.filter((entry) => entry.date === today && entry.category === "수유·이유식");
    const formulaMl = todayFeedings.filter((entry) => splitCareType(entry) === "formula").reduce((sum, entry) => sum + (Number(entry.feedingMl) || 0), 0);
    const breastMinutes = todayFeedings.filter((entry) => splitCareType(entry) === "breast").reduce((sum, entry) => sum + (Number(entry.feedingMinutes) || 0), 0);
    const note = [];
    if (formulaMl) note.push(`분유 ${formulaMl}mL`);
    if (breastMinutes) note.push(`모유 ${formatDuration(breastMinutes)}`);
    const noteElement = document.querySelector("#todayCareSummary article.feed small");
    if (noteElement && note.length) noteElement.textContent = note.join(" · ");
  };

  const originalRenderGrowthSummary = renderGrowthSummary;
  renderGrowthSummary = function renderSplitGrowthSummary(entries) {
    originalRenderGrowthSummary(entries);
    const noteElement = document.querySelector("#growthSummaryGrid .summary-card.feed small");
    if (noteElement) noteElement.textContent = noteElement.textContent.replace(/(^| · )젖병(?= | · |$)/g, "$1분유");
  };

  growthCareType = splitCareType;
  carePatternCategories.clear();
  CARE_TYPES.forEach((type) => carePatternCategories.add(type));

  function installSplitControls() {
    const legend = document.querySelector(".care-rhythm-legend");
    if (legend) legend.innerHTML = '<span class="formula">분유</span><span class="breast">모유</span><span class="sleep">수면</span><span class="diaper">기저귀</span><span class="health">건강</span>';

    const categories = document.querySelector("#carePatternCategories");
    if (categories) categories.innerHTML = [
      '<button type="button" class="formula active" data-pattern-category="formula" aria-pressed="true"><i>mL</i>분유</button>',
      '<button type="button" class="breast active" data-pattern-category="breast" aria-pressed="true"><i>M</i>모유</button>',
      '<button type="button" class="sleep active" data-pattern-category="sleep" aria-pressed="true"><i>Zz</i>수면</button>',
      '<button type="button" class="diaper active" data-pattern-category="diaper" aria-pressed="true"><i>D</i>기저귀</button>',
      '<button type="button" class="health active" data-pattern-category="health" aria-pressed="true"><i>!</i>건강</button>',
    ].join("");

    const bottleOption = [...document.querySelectorAll("#growthFeedingType option")].find((option) => option.value === "젖병");
    if (bottleOption) bottleOption.textContent = "분유";
  }

  renderDailyCareClock = function renderSplitDailyCareClock(entries) {
    const date = parseDate(carePatternDate);
    const today = dateKey(new Date());
    const dayEntries = entries.filter((entry) => entry.date === carePatternDate && growthCareType(entry));
    const items = dayEntries.filter((entry) => carePatternCategories.has(growthCareType(entry)));
    const clockItems = items.filter((entry) => /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time));
    const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
    const sum = (type, field) => dayEntries.filter((entry) => growthCareType(entry) === type).reduce((total, entry) => total + positive(entry[field]), 0);
    const count = (type) => dayEntries.filter((entry) => growthCareType(entry) === type).length;
    const formulaMl = sum("formula", "feedingMl");
    const pumpedMl = sum("pumped", "feedingMl");
    const breastMinutes = sum("breast", "feedingMinutes");
    const sleepTotal = sum("sleep", "sleepMinutes");
    const ml = (value) => Math.round(value).toLocaleString("ko-KR");
    const dayLabel = carePatternDate === today ? "오늘" : "선택한 날";
    document.querySelector("#carePatternDateLabel").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 · ${carePatternDate === today ? "오늘" : ["일", "월", "화", "수", "목", "금", "토"][date.getDay()] + "요일"}`;
    document.querySelector("#carePatternDateNav [data-pattern-day='1']").disabled = carePatternDate >= today;

    // Clock geometry uses the same start time and duration as the editable list.
    const sector = (start, duration) => {
      const span = Math.min(1440, positive(duration));
      if (!span) return "";
      if (span === 1440) return "M180 43 A137 137 0 1 1 180 317 A137 137 0 1 1 180 43 M180 93 A87 87 0 1 0 180 267 A87 87 0 1 0 180 93";
      const angle = start / 4;
      const end = (start + span) / 4;
      const a = clockPoint(angle, 137), b = clockPoint(end, 137), c = clockPoint(end, 87), d = clockPoint(angle, 87);
      const large = span > 720 ? 1 : 0;
      return `M${a.x} ${a.y} A137 137 0 ${large} 1 ${b.x} ${b.y} L${c.x} ${c.y} A87 87 0 ${large} 0 ${d.x} ${d.y} Z`;
    };
    const records = clockItems.map((entry) => {
      const [hour, minute] = entry.time.split(":").map(Number);
      const start = hour * 60 + minute;
      const type = growthCareType(entry);
      const duration = type === "sleep" ? positive(entry.sleepMinutes) : type === "breast" ? positive(entry.feedingMinutes) : 0;
      const label = { formula: "분유", pumped: "유축", breast: "직수", solid: "이유식", sleep: "수면", diaper: "기저귀", health: "건강" }[type];
      const detail = ["formula", "pumped", "solid"].includes(type) && positive(entry.feedingMl) ? `${Number(entry.feedingMl)}mL`
        : type === "breast" ? [entry.feedingSide, duration ? formatDuration(duration) : ""].filter(Boolean).join(" · ")
        : type === "sleep" && duration ? formatDuration(duration)
        : type === "health" ? [entry.title, positive(entry.temperature) ? `${Number(entry.temperature)}°C` : ""].filter(Boolean).join(" · ")
        : type === "diaper" ? entry.diaperKind || entry.title : entry.title;
      const title = `<title>${escapeHtml(`${entry.time} ${label} ${detail || ""}`)}</title>`;
      if (duration) return { range: true, svg: `<path class="care-band-range ${type}" data-start="${start}" data-duration="${Math.min(1440, duration)}" d="${sector(start, duration)}" fill-rule="evenodd">${title}</path>` };
      const inner = clockPoint(start / 4, 88), outer = clockPoint(start / 4, 136);
      return { range: false, svg: `<line class="care-band-stripe ${type}" x1="${inner.x.toFixed(1)}" y1="${inner.y.toFixed(1)}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}">${title}</line>` };
    });
    const ticks = Array.from({ length: 24 }, (_, hour) => {
      const inner = clockPoint(hour * 15, 90), outer = clockPoint(hour * 15, hour % 6 === 0 ? 96 : 93);
      return `<line class="care-band-tick" x1="${inner.x.toFixed(1)}" y1="${inner.y.toFixed(1)}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}"></line>`;
    }).join("");
    const feedingMetric = (type, label, value, unit) => `<article class="${type}"><span><i aria-hidden="true"></i>${label}</span><strong>${value}<small>${unit}</small></strong></article>`;
    const otherMetric = (type, label, value) => `<span class="${type}"><i aria-hidden="true"></i>${label} ${value}</span>`;
    const total = ml(formulaMl + pumpedMl);
    const totalSize = total.length > 7 ? 28 : total.length > 5 ? 36 : 44;
    document.querySelector("#carePatternContent").innerHTML = `
      <section class="care-band-card" aria-label="${dayLabel} 수유 합계">
        <header class="care-band-heading"><strong>${dayLabel} 수유 합계</strong><span>${date.getMonth() + 1}월 ${date.getDate()}일</span></header>
        <div class="care-clock-wrap">
          <svg class="care-clock care-band-dial" viewBox="20 20 320 320" role="img" aria-label="${date.getMonth() + 1}월 ${date.getDate()}일 24시간 돌봄 패턴, 총 수유량 ${total}밀리리터, 분유 ${ml(formulaMl)}밀리리터, 유축 ${ml(pumpedMl)}밀리리터, 직수 ${breastMinutes}분, 수면 ${sleepTotal}분, 이유식 ${count("solid")}회, 기저귀 ${count("diaper")}회, 건강 ${count("health")}회. 00시는 위, 06시는 오른쪽, 12시는 아래, 18시는 왼쪽. 선은 시각, 채운 구간은 시간 범위.">
            <defs><linearGradient id="careClockDayNight" x1="0" y1="0" x2="0" y2="1"><stop class="care-band-night-color"></stop><stop class="care-band-transition-color" offset=".5"></stop><stop class="care-band-day-color" offset="1"></stop></linearGradient></defs>
            <circle class="care-band-track" cx="180" cy="180" r="112"></circle>
            ${records.filter((record) => record.range).map((record) => record.svg).join("")}${ticks}${records.filter((record) => !record.range).map((record) => record.svg).join("")}
            <text class="care-band-hour" x="180" y="37" text-anchor="middle">00</text><text class="care-band-hour" x="327" y="185" text-anchor="middle">06</text><text class="care-band-hour" x="180" y="330" text-anchor="middle">12</text><text class="care-band-hour" x="33" y="185" text-anchor="middle">18</text>
            <svg class="care-band-period" x="199" y="22" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path class="care-band-period-fill" d="M20 15A9 9 0 0 1 9 4 9 9 0 1 0 20 15Z"></path></svg>
            <svg class="care-band-period" x="199" y="314" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle class="care-band-period-fill" cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"></path></svg>
            <text class="care-band-caption" x="180" y="154" text-anchor="middle">분유 + 유축</text><text class="care-band-total" x="180" y="201" text-anchor="middle" style="font-size:${totalSize}px">${total}<tspan class="care-band-unit" dx="4">mL</tspan></text>
          </svg>
        </div>
        <div class="care-band-feeding">${feedingMetric("formula", "분유", ml(formulaMl), "mL")}${feedingMetric("pumped", "유축", ml(pumpedMl), "mL")}${feedingMetric("breast", "직수", Math.round(breastMinutes).toLocaleString("ko-KR"), "분")}</div>
        <div class="care-band-other">${otherMetric("sleep", "수면", formatDuration(sleepTotal))}${otherMetric("diaper", "기저귀", `${count("diaper")}회`)}${otherMetric("solid", "이유식", `${count("solid")}회`)}${count("health") ? otherMetric("health", "건강", `${count("health")}회`) : ""}</div>
        <p class="care-band-guide">${clockItems.length ? "선은 시각 · 채운 구간은 시간 범위" : "이 날짜에는 시간 기록이 없어요."}</p>
      </section>`;
  };

  renderWeeklyCarePattern = function renderSplitWeeklyCarePattern(entries) {
    const end = dateKey(new Date());
    const days = Array.from({ length: 7 }, (_, index) => addDays(end, index - 6));
    const data = days.map((day) => {
      const items = entries.filter((entry) => entry.date === day);
      return {
        day,
        formula: items.filter((entry) => splitCareType(entry) === "formula").reduce((sum, entry) => sum + (Number(entry.feedingMl) || 0), 0),
        breast: items.filter((entry) => splitCareType(entry) === "breast").reduce((sum, entry) => sum + (Number(entry.feedingMinutes) || 0), 0),
        sleep: items.filter((entry) => splitCareType(entry) === "sleep").reduce((sum, entry) => sum + (Number(entry.sleepMinutes) || 0), 0),
        diaper: items.filter((entry) => splitCareType(entry) === "diaper").length,
        health: items.filter((entry) => splitCareType(entry) === "health").length,
      };
    });
    const maxima = Object.fromEntries(CARE_TYPES.map((type) => [type, Math.max(1, ...data.map((item) => item[type]))]));
    const hasData = data.some((item) => CARE_TYPES.some((type) => carePatternCategories.has(type) && item[type]));
    if (!hasData) {
      document.querySelector("#carePatternContent").innerHTML = '<div class="care-rhythm-empty"><strong>기록이 쌓이면 리듬이 보여요</strong><span>위의 빠른 기록이나 타이머로 오늘부터 시작해 보세요.</span></div>';
      return;
    }
    const labels = { formula: "분유", breast: "모유", sleep: "수면", diaper: "기저귀", health: "건강" };
    const values = { formula: (value) => `${value}mL`, breast: (value) => formatDuration(value), sleep: (value) => formatDuration(value), diaper: (value) => `${value}회`, health: (value) => `${value}회` };
    document.querySelector("#carePatternContent").innerHTML = `<div class="care-rhythm-chart split-feeding">${data.map((item) => {
      const date = parseDate(item.day);
      const isToday = item.day === end;
      const height = (value, max) => value ? Math.max(12, Math.round((value / max) * 100)) : 4;
      const bars = CARE_TYPES.filter((type) => carePatternCategories.has(type)).map((type) => `<i class="${type}" style="--bar:${height(item[type], maxima[type])}%" title="${labels[type]} ${values[type](item[type])}"></i>`).join("");
      return `<article class="care-rhythm-day ${isToday ? "today" : ""}" aria-label="${date.getMonth() + 1}월 ${date.getDate()}일, 분유 ${item.formula}밀리리터, 모유 ${item.breast}분, 수면 ${item.sleep}분, 기저귀 ${item.diaper}회, 건강 ${item.health}회"><div class="care-rhythm-bars">${bars}</div><strong>${isToday ? "오늘" : ["일", "월", "화", "수", "목", "금", "토"][date.getDay()]}</strong><span>${date.getDate()}</span></article>`;
    }).join("")}</div>`;
  };

  renderCareIntervals = function renderSplitCareIntervals(entries) {
    const start = addDays(dateKey(new Date()), -6);
    const categoryInfo = {
      formula: { label: "분유", className: "formula" },
      breast: { label: "모유", className: "breast" },
      sleep: { label: "수면", className: "sleep" },
      diaper: { label: "기저귀", className: "diaper" },
      health: { label: "건강", className: "health" },
    };
    const cards = CARE_TYPES.filter((type) => carePatternCategories.has(type)).map((type) => {
      const times = entries.filter((entry) => entry.date >= start && splitCareType(entry) === type && entry.time).map(entryDateTime).filter(Boolean).sort((a, b) => a - b);
      const gaps = times.slice(1).map((time, index) => Math.round((time - times[index]) / 60000)).filter((gap) => gap > 0 && gap < 1440);
      const average = gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : 0;
      const recent = gaps.at(-1) || 0;
      const info = categoryInfo[type];
      return `<article class="care-interval-card ${info.className}"><span>${info.label} 평균 간격</span><strong>${average ? formatDuration(average) : "—"}</strong><small>${recent ? `최근 간격 ${formatDuration(recent)}` : "간격 계산을 위한 기록이 더 필요해요"}</small><div><i style="--progress:${average ? Math.min(100, average / 360 * 100) : 0}%"></i></div></article>`;
    });
    document.querySelector("#carePatternContent").innerHTML = `<div class="care-interval-grid">${cards.join("")}</div><p class="care-pattern-note">최근 7일의 기록 시작 시간을 기준으로 계산했어요.</p>`;
  };

  installSplitControls();
  renderGrowth();
})();
