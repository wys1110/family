(() => {
  const CARE_TYPES = ["formula", "breast", "sleep", "diaper"];

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
    if (legend) legend.innerHTML = '<span class="formula">분유</span><span class="breast">모유</span><span class="sleep">수면</span><span class="diaper">기저귀</span>';

    const categories = document.querySelector("#carePatternCategories");
    if (categories) categories.innerHTML = [
      '<button type="button" class="formula active" data-pattern-category="formula" aria-pressed="true"><i>mL</i>분유</button>',
      '<button type="button" class="breast active" data-pattern-category="breast" aria-pressed="true"><i>M</i>모유</button>',
      '<button type="button" class="sleep active" data-pattern-category="sleep" aria-pressed="true"><i>Zz</i>수면</button>',
      '<button type="button" class="diaper active" data-pattern-category="diaper" aria-pressed="true"><i>D</i>기저귀</button>',
    ].join("");

    const bottleOption = [...document.querySelectorAll("#growthFeedingType option")].find((option) => option.value === "젖병");
    if (bottleOption) bottleOption.textContent = "분유";
  }

  renderDailyCareClock = function renderSplitDailyCareClock(entries) {
    const date = parseDate(carePatternDate);
    const today = dateKey(new Date());
    const dayEntries = entries.filter((entry) => entry.date === carePatternDate && CARE_TYPES.includes(splitCareType(entry)));
    const items = dayEntries.filter((entry) => carePatternCategories.has(splitCareType(entry)));
    const clockItems = items.filter((entry) => entry.time);
    const clockRadius = 112;
    const circumference = 2 * Math.PI * clockRadius;
    const hours = Array.from({ length: 12 }, (_, index) => index * 2).map((hour) => {
      const point = clockPoint(hour * 15, 151);
      return `<text class="care-clock-hour" x="${point.x.toFixed(1)}" y="${(point.y + 3.5).toFixed(1)}" text-anchor="middle">${hour}</text>`;
    }).join("");
    const ticks = Array.from({ length: 24 }, (_, hour) => {
      const major = hour % 2 === 0;
      const inner = clockPoint(hour * 15, major ? 132 : 136);
      const outer = clockPoint(hour * 15, 141);
      return `<line class="care-clock-tick ${major ? "major" : ""}" x1="${inner.x.toFixed(1)}" y1="${inner.y.toFixed(1)}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}"></line>`;
    }).join("");
    const marks = clockItems.map((entry) => {
      const [hour, minute] = entry.time.split(":").map(Number);
      const minutes = hour * 60 + minute;
      const angle = minutes / 1440 * 360;
      const type = splitCareType(entry);
      if (type === "sleep" && entry.sleepMinutes) {
        const length = Math.max(3, Math.min(circumference, Number(entry.sleepMinutes) / 1440 * circumference));
        return `<circle class="care-clock-sleep" cx="180" cy="180" r="${clockRadius}" pathLength="${circumference}" stroke-dasharray="${length} ${circumference - length}" transform="rotate(${angle - 90} 180 180)"><title>${entry.time} 수면 ${formatDuration(Number(entry.sleepMinutes))}</title></circle>`;
      }
      const inner = clockPoint(angle, type === "breast" ? 92 : 99);
      const outer = clockPoint(angle, type === "breast" ? 119 : 126);
      const detail = type === "formula" && entry.feedingMl ? `${entry.feedingMl}mL` : type === "breast" && entry.feedingMinutes ? formatDuration(Number(entry.feedingMinutes)) : entry.title;
      return `<line class="care-clock-mark ${type}" x1="${inner.x.toFixed(1)}" y1="${inner.y.toFixed(1)}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}"><title>${entry.time} ${type === "formula" ? "분유" : type === "breast" ? "모유" : entry.title} ${escapeHtml(String(detail || ""))}</title></line><circle class="care-clock-dot ${type}" cx="${outer.x.toFixed(1)}" cy="${outer.y.toFixed(1)}" r="3.5"></circle>`;
    }).join("");
    const dayNumber = activeBaby()?.birthDate ? daysFromBirthAt(activeBaby().birthDate, carePatternDate) : null;
    const dayLabel = carePatternDate === today ? "오늘" : ["일", "월", "화", "수", "목", "금", "토"][date.getDay()] + "요일";
    document.querySelector("#carePatternDateLabel").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 · ${dayLabel}`;
    document.querySelector("#carePatternDateNav [data-pattern-day='1']").disabled = carePatternDate >= today;

    const formulaMl = dayEntries.filter((entry) => splitCareType(entry) === "formula").reduce((sum, entry) => sum + (Number(entry.feedingMl) || 0), 0);
    const breastMinutes = dayEntries.filter((entry) => splitCareType(entry) === "breast").reduce((sum, entry) => sum + (Number(entry.feedingMinutes) || 0), 0);
    const sleepTotal = dayEntries.filter((entry) => splitCareType(entry) === "sleep").reduce((sum, entry) => sum + (Number(entry.sleepMinutes) || 0), 0);
    const diaperCount = dayEntries.filter((entry) => splitCareType(entry) === "diaper").length;
    const now = new Date();
    const nowAngle = (now.getHours() * 60 + now.getMinutes()) / 1440 * 360;
    const nowStart = clockPoint(nowAngle, 72);
    const nowEnd = clockPoint(nowAngle, 133);
    const nowMark = carePatternDate === today ? `<line class="care-clock-now" x1="${nowStart.x.toFixed(1)}" y1="${nowStart.y.toFixed(1)}" x2="${nowEnd.x.toFixed(1)}" y2="${nowEnd.y.toFixed(1)}"></line><circle class="care-clock-now-dot" cx="${nowEnd.x.toFixed(1)}" cy="${nowEnd.y.toFixed(1)}" r="3"></circle>` : "";
    const ageText = dayNumber === null ? "" : dayNumber >= 0 ? `D+${dayNumber}` : `D${dayNumber}`;

    document.querySelector("#carePatternContent").innerHTML = `<div class="care-clock-wrap"><svg class="care-clock" viewBox="0 0 360 360" role="img" aria-label="${date.getMonth() + 1}월 ${date.getDate()}일 24시간 돌봄 패턴, 분유 ${formulaMl}밀리리터, 모유 ${breastMinutes}분"><defs><filter id="clockCenterShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#5f655f" flood-opacity=".10" /></filter></defs><circle class="care-clock-outer" cx="180" cy="180" r="129"></circle><circle class="care-clock-face" cx="180" cy="180" r="${clockRadius}"></circle><circle class="care-clock-night" cx="180" cy="180" r="${clockRadius}" pathLength="100" stroke-dasharray="50 50" transform="rotate(180 180 180)"></circle>${ticks}${hours}${marks}${nowMark}<circle class="care-clock-center" cx="180" cy="180" r="69"></circle><text class="care-clock-center-kicker" x="180" y="163" text-anchor="middle">${dayLabel}</text><text class="care-clock-center-day" x="180" y="195" text-anchor="middle">${ageText}</text><text class="care-clock-center-caption" x="180" y="214" text-anchor="middle">24시간 돌봄</text></svg><div class="care-clock-periods" aria-hidden="true"><span>밤</span><span>낮</span></div></div><div class="care-clock-summary split-feeding"><article class="formula"><i></i><span>분유</span><strong>${formulaMl}mL</strong></article><article class="breast"><i></i><span>모유</span><strong>${formatDuration(breastMinutes)}</strong></article><article class="sleep"><i></i><span>수면</span><strong>${formatDuration(sleepTotal)}</strong></article><article class="diaper"><i></i><span>기저귀</span><strong>${diaperCount}회</strong></article></div>${clockItems.length ? "" : '<p class="care-pattern-note">이 날짜에는 시간 기록이 없어요.</p>'}`;
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
      };
    });
    const maxima = Object.fromEntries(CARE_TYPES.map((type) => [type, Math.max(1, ...data.map((item) => item[type]))]));
    const hasData = data.some((item) => CARE_TYPES.some((type) => carePatternCategories.has(type) && item[type]));
    if (!hasData) {
      document.querySelector("#carePatternContent").innerHTML = '<div class="care-rhythm-empty"><strong>기록이 쌓이면 리듬이 보여요</strong><span>위의 빠른 기록이나 타이머로 오늘부터 시작해 보세요.</span></div>';
      return;
    }
    const labels = { formula: "분유", breast: "모유", sleep: "수면", diaper: "기저귀" };
    const values = { formula: (value) => `${value}mL`, breast: (value) => formatDuration(value), sleep: (value) => formatDuration(value), diaper: (value) => `${value}회` };
    document.querySelector("#carePatternContent").innerHTML = `<div class="care-rhythm-chart split-feeding">${data.map((item) => {
      const date = parseDate(item.day);
      const isToday = item.day === end;
      const height = (value, max) => value ? Math.max(12, Math.round((value / max) * 100)) : 4;
      const bars = CARE_TYPES.filter((type) => carePatternCategories.has(type)).map((type) => `<i class="${type}" style="--bar:${height(item[type], maxima[type])}%" title="${labels[type]} ${values[type](item[type])}"></i>`).join("");
      return `<article class="care-rhythm-day ${isToday ? "today" : ""}" aria-label="${date.getMonth() + 1}월 ${date.getDate()}일, 분유 ${item.formula}밀리리터, 모유 ${item.breast}분, 수면 ${item.sleep}분, 기저귀 ${item.diaper}회"><div class="care-rhythm-bars">${bars}</div><strong>${isToday ? "오늘" : ["일", "월", "화", "수", "목", "금", "토"][date.getDay()]}</strong><span>${date.getDate()}</span></article>`;
    }).join("")}</div>`;
  };

  renderCareIntervals = function renderSplitCareIntervals(entries) {
    const start = addDays(dateKey(new Date()), -6);
    const categoryInfo = {
      formula: { label: "분유", className: "formula" },
      breast: { label: "모유", className: "breast" },
      sleep: { label: "수면", className: "sleep" },
      diaper: { label: "기저귀", className: "diaper" },
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