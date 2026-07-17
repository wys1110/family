(() => {
  const typeOf = (entry) => {
    if (entry.category === "수유·이유식") {
      const feedingType = String(entry.feedingType || "").trim();
      const title = String(entry.title || "");
      if (feedingType === "모유" || title.includes("모유")) return "breast";
      return "formula";
    }
    if (entry.category === "기저귀") return "diaper";
    return "";
  };

  const detailOf = (entry, type) => {
    if (type === "formula") return Number(entry.feedingMl) > 0 ? `${Number(entry.feedingMl)}mL` : "분유";
    if (type === "breast") {
      const details = [entry.feedingSide, Number(entry.feedingMinutes) > 0 ? formatDuration(Number(entry.feedingMinutes)) : ""].filter(Boolean);
      return details.join(" · ") || "모유";
    }
    return entry.diaperKind || "교체";
  };

  const labelOf = (type) => (type === "formula" ? "분유" : type === "breast" ? "모유" : "기저귀");

  const entryCard = (entry, type) => `
    <article class="care-split-entry ${type}">
      <span><i aria-hidden="true"></i><strong>${labelOf(type)}</strong></span>
      <small>${escapeHtml(detailOf(entry, type))}</small>
    </article>`;

  const removeSleepControls = () => {
    carePatternCategories.delete("sleep");
    document.querySelector('[data-pattern-category="sleep"]')?.remove();
    document.querySelector(".care-rhythm-legend .sleep")?.remove();
  };

  const categoryIsVisible = (type) => {
    if (carePatternCategories.has(type)) return true;
    return ["formula", "breast"].includes(type) && carePatternCategories.has("feed");
  };

  removeSleepControls();

  renderDailyCareClock = function renderSplitCareTimeline(entries) {
    removeSleepControls();

    const date = parseDate(carePatternDate);
    const today = dateKey(new Date());
    const dayEntries = entries.filter((entry) => entry.date === carePatternDate && typeOf(entry));
    const visible = dayEntries.filter((entry) => entry.time && categoryIsVisible(typeOf(entry)));

    const formulaEntries = dayEntries.filter((entry) => typeOf(entry) === "formula");
    const breastEntries = dayEntries.filter((entry) => typeOf(entry) === "breast");
    const diaperEntries = dayEntries.filter((entry) => typeOf(entry) === "diaper");
    const formulaMl = formulaEntries.reduce((sum, entry) => sum + (Number(entry.feedingMl) || 0), 0);
    const breastMinutes = breastEntries.reduce((sum, entry) => sum + (Number(entry.feedingMinutes) || 0), 0);

    const dayNumber = activeBaby()?.birthDate ? daysFromBirthAt(activeBaby().birthDate, carePatternDate) : null;
    const dayLabel = carePatternDate === today ? "오늘" : `${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]}요일`;
    const ageText = dayNumber === null ? "" : dayNumber >= 0 ? `D+${dayNumber}` : `D${dayNumber}`;
    document.querySelector("#carePatternDateLabel").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 · ${dayLabel}${ageText ? ` · ${ageText}` : ""}`;
    document.querySelector("#carePatternDateNav [data-pattern-day='1']").disabled = carePatternDate >= today;

    const groupedByTime = visible.reduce((groups, entry) => {
      if (!groups.has(entry.time)) groups.set(entry.time, []);
      groups.get(entry.time).push(entry);
      return groups;
    }, new Map());

    const timelineRows = [...groupedByTime.entries()]
      .sort(([timeA], [timeB]) => timeB.localeCompare(timeA))
      .map(([time, timeEntries]) => {
        const feeding = timeEntries.filter((entry) => ["formula", "breast"].includes(typeOf(entry)));
        const diapers = timeEntries.filter((entry) => typeOf(entry) === "diaper");
        return `
          <div class="care-split-row">
            <div class="care-split-cell feeding">${feeding.map((entry) => entryCard(entry, typeOf(entry))).join("")}</div>
            <time class="care-split-time" datetime="${escapeHtml(`${carePatternDate}T${time}`)}">${escapeHtml(time)}</time>
            <div class="care-split-cell diaper">${diapers.map((entry) => entryCard(entry, "diaper")).join("")}</div>
          </div>`;
      })
      .join("");

    const timeline = timelineRows || '<p class="care-linear-empty">이 날짜에는 수유·기저귀 시간 기록이 없어요.</p>';

    document.querySelector("#carePatternContent").innerHTML = `
      <section class="care-linear-card">
        <div class="care-linear-summary">
          <article class="formula"><span>분유</span><strong>${formulaMl}mL</strong><small>${formulaEntries.length}회</small></article>
          <article class="breast"><span>모유</span><strong>${formatDuration(breastMinutes)}</strong><small>${breastEntries.length}회</small></article>
          <article class="diaper"><span>기저귀</span><strong>${diaperEntries.length}회</strong><small>오늘 기록</small></article>
        </div>
        <div class="care-linear-legend" aria-label="돌봄 색상 구분"><span class="formula">분유</span><span class="breast">모유</span><span class="diaper">기저귀</span></div>
        <div class="care-split-heading" aria-hidden="true"><span>모유 · 분유</span><span>시간</span><span>기저귀</span></div>
        <div class="care-split-timeline" aria-label="시간별 수유와 기저귀 기록">${timeline}</div>
      </section>`;
  };

  renderGrowth();
})();
