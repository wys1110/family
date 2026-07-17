(() => {
  const typeOf = (entry) => {
    if (entry.category === "수유·이유식") {
      const feedingType = String(entry.feedingType || "");
      const title = String(entry.title || "");
      if (feedingType === "모유" || title.includes("모유")) return "breast";
      return "formula";
    }
    if (entry.category === "수면") return "sleep";
    if (entry.category === "기저귀") return "diaper";
    return "";
  };

  const minutesOf = (entry) => {
    const [hour, minute] = String(entry.time || "00:00").split(":").map(Number);
    return Math.max(0, Math.min(1439, (hour || 0) * 60 + (minute || 0)));
  };

  const polar = (angle, radius) => {
    const radians = (angle - 90) * Math.PI / 180;
    return { x: 180 + radius * Math.cos(radians), y: 180 + radius * Math.sin(radians) };
  };

  const arc = (startMinute, duration, radius) => {
    const safeDuration = Math.max(3, Math.min(1439, Number(duration) || 0));
    const startAngle = startMinute / 1440 * 360;
    const endAngle = (startMinute + safeDuration) / 1440 * 360;
    const start = polar(startAngle, radius);
    const end = polar(endAngle, radius);
    const largeArc = safeDuration > 720 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  };

  const marker = (entry, radius) => {
    const type = typeOf(entry);
    const point = polar(minutesOf(entry) / 1440 * 360, radius);
    const label = type === "formula" ? `${entry.feedingMl || 0}mL` : type === "breast" ? formatDuration(Number(entry.feedingMinutes) || 0) : entry.diaperKind || "기저귀";
    return `<g class="care-ring-marker ${type}"><circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="7"></circle><circle class="core" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3"></circle><title>${entry.time} ${label}</title></g>`;
  };

  renderDailyCareClock = function renderCareRingTimeline(entries) {
    const date = parseDate(carePatternDate);
    const today = dateKey(new Date());
    const dayEntries = entries.filter((entry) => entry.date === carePatternDate && typeOf(entry));
    const visible = dayEntries.filter((entry) => carePatternCategories.has(typeOf(entry)));
    const sleepEntries = visible.filter((entry) => typeOf(entry) === "sleep" && entry.time && Number(entry.sleepMinutes) > 0);
    const pointEntries = visible.filter((entry) => ["formula", "breast", "diaper"].includes(typeOf(entry)) && entry.time);

    const formulaMl = dayEntries.filter((entry) => typeOf(entry) === "formula").reduce((sum, entry) => sum + (Number(entry.feedingMl) || 0), 0);
    const breastMinutes = dayEntries.filter((entry) => typeOf(entry) === "breast").reduce((sum, entry) => sum + (Number(entry.feedingMinutes) || 0), 0);
    const sleepMinutes = dayEntries.filter((entry) => typeOf(entry) === "sleep").reduce((sum, entry) => sum + (Number(entry.sleepMinutes) || 0), 0);
    const diaperCount = dayEntries.filter((entry) => typeOf(entry) === "diaper").length;

    const dayNumber = activeBaby()?.birthDate ? daysFromBirthAt(activeBaby().birthDate, carePatternDate) : null;
    const dayLabel = carePatternDate === today ? "오늘" : `${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]}요일`;
    document.querySelector("#carePatternDateLabel").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 · ${dayLabel}`;
    document.querySelector("#carePatternDateNav [data-pattern-day='1']").disabled = carePatternDate >= today;

    const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21].map((hour) => {
      const point = polar(hour / 24 * 360, 151);
      return `<text x="${point.x.toFixed(1)}" y="${(point.y + 4).toFixed(1)}" text-anchor="middle">${hour}</text>`;
    }).join("");

    const sleepArcs = sleepEntries.map((entry) => `<path class="sleep-segment" d="${arc(minutesOf(entry), entry.sleepMinutes, 119)}"><title>${entry.time} 수면 ${formatDuration(Number(entry.sleepMinutes))}</title></path>`).join("");
    const formulaMarkers = pointEntries.filter((entry) => typeOf(entry) === "formula").map((entry) => marker(entry, 102)).join("");
    const breastMarkers = pointEntries.filter((entry) => typeOf(entry) === "breast").map((entry) => marker(entry, 84)).join("");
    const diaperMarkers = pointEntries.filter((entry) => typeOf(entry) === "diaper").map((entry) => marker(entry, 66)).join("");

    const sorted = [...dayEntries].filter((entry) => entry.time).sort((a, b) => b.time.localeCompare(a.time));
    const timeline = sorted.length ? sorted.map((entry) => {
      const type = typeOf(entry);
      const detail = type === "formula" ? `${entry.feedingMl || 0}mL` : type === "breast" ? formatDuration(Number(entry.feedingMinutes) || 0) : type === "sleep" ? formatDuration(Number(entry.sleepMinutes) || 0) : entry.diaperKind || "교체";
      const label = { formula: "분유", breast: "모유", sleep: "수면", diaper: "기저귀" }[type];
      return `<article class="care-ring-log ${type}"><time>${entry.time}</time><i></i><span><strong>${label}</strong><small>${detail}</small></span></article>`;
    }).join("") : '<p class="care-ring-empty">이 날짜에는 아직 시간 기록이 없어요.</p>';

    const ageText = dayNumber === null ? "" : dayNumber >= 0 ? `D+${dayNumber}` : `D${dayNumber}`;
    document.querySelector("#carePatternContent").innerHTML = `
      <section class="care-ring-card">
        <div class="care-ring-visual">
          <svg viewBox="0 0 360 360" role="img" aria-label="${date.getMonth() + 1}월 ${date.getDate()}일 24시간 돌봄 타임라인">
            <circle class="ring-base sleep" cx="180" cy="180" r="119"></circle>
            <circle class="ring-base formula" cx="180" cy="180" r="102"></circle>
            <circle class="ring-base breast" cx="180" cy="180" r="84"></circle>
            <circle class="ring-base diaper" cx="180" cy="180" r="66"></circle>
            ${hourLabels}${sleepArcs}${formulaMarkers}${breastMarkers}${diaperMarkers}
            <circle class="care-ring-center" cx="180" cy="180" r="48"></circle>
            <text class="care-ring-kicker" x="180" y="165" text-anchor="middle">${dayLabel}</text>
            <text class="care-ring-age" x="180" y="192" text-anchor="middle">${ageText}</text>
            <text class="care-ring-caption" x="180" y="211" text-anchor="middle">24시간 기록</text>
          </svg>
          <div class="care-ring-legend"><span class="sleep">수면</span><span class="formula">분유</span><span class="breast">모유</span><span class="diaper">기저귀</span></div>
        </div>
        <div class="care-ring-summary">
          <article class="formula"><span>분유</span><strong>${formulaMl}mL</strong></article>
          <article class="breast"><span>모유</span><strong>${formatDuration(breastMinutes)}</strong></article>
          <article class="sleep"><span>수면</span><strong>${formatDuration(sleepMinutes)}</strong></article>
          <article class="diaper"><span>기저귀</span><strong>${diaperCount}회</strong></article>
        </div>
        <div class="care-ring-log-list">${timeline}</div>
      </section>`;
  };

  renderGrowth();
})();