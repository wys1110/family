(() => {
  if (typeof renderDailyCareClock !== "function") return;

  function careType(entry) {
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

  function careCopy(entry, type) {
    if (type === "formula") {
      return ["분유", Number(entry.feedingMl) > 0 ? `${Number(entry.feedingMl)}mL` : entry.title || "수유 기록"];
    }
    if (type === "breast") {
      const details = [entry.feedingSide, Number(entry.feedingMinutes) > 0 ? formatDuration(Number(entry.feedingMinutes)) : ""].filter(Boolean);
      return ["모유", details.join(" · ") || entry.title || "수유 기록"];
    }
    if (type === "sleep") {
      return ["수면", Number(entry.sleepMinutes) > 0 ? formatDuration(Number(entry.sleepMinutes)) : entry.title || "수면 기록"];
    }
    return ["기저귀", entry.diaperKind || entry.title || "기저귀 기록"];
  }

  const originalRenderDailyCareClock = renderDailyCareClock;
  renderDailyCareClock = function renderDailyCareClockWithLargeTimes(entries) {
    originalRenderDailyCareClock(entries);

    const content = document.querySelector("#carePatternContent");
    if (!content) return;

    const items = entries
      .filter((entry) => entry.date === carePatternDate && entry.time)
      .map((entry) => ({ entry, type: careType(entry) }))
      .filter(({ type }) => type && carePatternCategories.has(type))
      .sort((a, b) => a.entry.time.localeCompare(b.entry.time));

    if (!items.length) return;

    const timeline = document.createElement("section");
    timeline.className = "care-time-list";
    timeline.setAttribute("aria-label", "시간별 돌봄 기록");
    timeline.innerHTML = `
      <div class="care-time-list-heading">
        <strong>시간별 기록</strong>
        <span>${items.length}개</span>
      </div>
      <div class="care-time-list-items">
        ${items.map(({ entry, type }) => {
          const [label, detail] = careCopy(entry, type);
          return `<article class="care-time-row ${type}">
            <time datetime="${escapeHtml(`${entry.date}T${entry.time}`)}">${escapeHtml(entry.time)}</time>
            <i aria-hidden="true"></i>
            <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(String(detail || ""))}</small></span>
          </article>`;
        }).join("")}
      </div>
    `;
    content.appendChild(timeline);
  };

  renderGrowth();
})();