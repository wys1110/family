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

  const minuteOf = (entry) => {
    const [hour, minute] = String(entry.time || "00:00").split(":").map(Number);
    return Math.max(0, Math.min(1439, (hour || 0) * 60 + (minute || 0)));
  };

  const positionOf = (entry) => (minuteOf(entry) / 1440 * 100).toFixed(3);

  const detailOf = (entry, type) => {
    if (type === "formula") return Number(entry.feedingMl) > 0 ? `${Number(entry.feedingMl)}mL` : "분유";
    if (type === "breast") {
      const details = [entry.feedingSide, Number(entry.feedingMinutes) > 0 ? formatDuration(Number(entry.feedingMinutes)) : ""].filter(Boolean);
      return details.join(" · ") || "모유";
    }
    return entry.diaperKind || "교체";
  };

  const marker = (entry, type) => {
    const label = type === "formula" ? "분유" : type === "breast" ? "모유" : "기저귀";
    const detail = detailOf(entry, type);
    const tooltip = escapeHtml(`${entry.time} ${label} ${detail}`);
    return `<span class="care-linear-marker ${type}" style="--position:${positionOf(entry)}%" role="img" aria-label="${tooltip}" title="${tooltip}"><i></i><b>${escapeHtml(entry.time)}</b></span>`;
  };

  const removeSleepControls = () => {
    carePatternCategories.delete("sleep");
    document.querySelector('[data-pattern-category="sleep"]')?.remove();
    document.querySelector(".care-rhythm-legend .sleep")?.remove();
  };

  removeSleepControls();

  renderDailyCareClock = function renderLinearCareTimeline(entries) {
    removeSleepControls();

    const date = parseDate(carePatternDate);
    const today = dateKey(new Date());
    const dayEntries = entries.filter((entry) => entry.date === carePatternDate && typeOf(entry));
    const visible = dayEntries.filter((entry) => carePatternCategories.has(typeOf(entry)) && entry.time);
    const feedingEntries = visible.filter((entry) => ["formula", "breast"].includes(typeOf(entry)));
    const diaperEntries = visible.filter((entry) => typeOf(entry) === "diaper");

    const formulaMl = dayEntries.filter((entry) => typeOf(entry) === "formula").reduce((sum, entry) => sum + (Number(entry.feedingMl) || 0), 0);
    const formulaCount = dayEntries.filter((entry) => typeOf(entry) === "formula").length;
    const breastMinutes = dayEntries.filter((entry) => typeOf(entry) === "breast").reduce((sum, entry) => sum + (Number(entry.feedingMinutes) || 0), 0);
    const breastCount = dayEntries.filter((entry) => typeOf(entry) === "breast").length;
    const diaperCount = dayEntries.filter((entry) => typeOf(entry) === "diaper").length;

    const dayNumber = activeBaby()?.birthDate ? daysFromBirthAt(activeBaby().birthDate, carePatternDate) : null;
    const dayLabel = carePatternDate === today ? "오늘" : `${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]}요일`;
    const ageText = dayNumber === null ? "" : dayNumber >= 0 ? `D+${dayNumber}` : `D${dayNumber}`;
    document.querySelector("#carePatternDateLabel").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 · ${dayLabel}${ageText ? ` · ${ageText}` : ""}`;
    document.querySelector("#carePatternDateNav [data-pattern-day='1']").disabled = carePatternDate >= today;

    const now = new Date();
    const nowPosition = ((now.getHours() * 60 + now.getMinutes()) / 1440 * 100).toFixed(3);
    const nowLine = carePatternDate === today ? `<i class="care-linear-now" style="--position:${nowPosition}%" aria-hidden="true"></i>` : "";
    const axes = [0, 6, 12, 18, 24].map((hour) => `<span style="--position:${hour / 24 * 100}%">${String(hour).padStart(2, "0")}</span>`).join("");

    const row = (label, className, rowEntries, description) => `
      <section class="care-linear-row ${className}" aria-label="${label} 시간대">
        <header><strong>${label}</strong><small>${description}</small></header>
        <div class="care-linear-track">
          <div class="care-linear-axis" aria-hidden="true">${axes}</div>
          <div class="care-linear-line"></div>
          ${nowLine}
          ${rowEntries.map((entry) => marker(entry, typeOf(entry))).join("")}
        </div>
      </section>`;

    const sorted = [...dayEntries].filter((entry) => entry.time).sort((a, b) => b.time.localeCompare(a.time));
    const logs = sorted.length ? sorted.map((entry) => {
      const type = typeOf(entry);
      const label = type === "formula" ? "분유" : type === "breast" ? "모유" : "기저귀";
      return `<article class="care-linear-log ${type}"><time>${escapeHtml(entry.time)}</time><i></i><span><strong>${label}</strong><small>${escapeHtml(detailOf(entry, type))}</small></span></article>`;
    }).join("") : '<p class="care-linear-empty">이 날짜에는 수유·기저귀 시간 기록이 없어요.</p>';

    document.querySelector("#carePatternContent").innerHTML = `
      <section class="care-linear-card">
        <div class="care-linear-summary">
          <article class="formula"><span>분유</span><strong>${formulaMl}mL</strong><small>${formulaCount}회</small></article>
          <article class="breast"><span>모유</span><strong>${formatDuration(breastMinutes)}</strong><small>${breastCount}회</small></article>
          <article class="diaper"><span>기저귀</span><strong>${diaperCount}회</strong><small>오늘 기록</small></article>
        </div>
        <div class="care-linear-legend" aria-label="수유 색상 구분"><span class="formula">분유</span><span class="breast">모유</span><span class="diaper">기저귀</span></div>
        <div class="care-linear-chart">
          ${row("수유", "feeding", feedingEntries, `${formulaCount + breastCount}회`)}
          ${row("기저귀", "diaper", diaperEntries, `${diaperCount}회`)}
        </div>
        <div class="care-linear-log-list">${logs}</div>
      </section>`;
  };

  renderGrowth();
})();