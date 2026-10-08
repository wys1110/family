(() => {
  if (typeof renderDailyCareClock !== "function") return;

  function careCopy(entry, type) {
    if (["formula", "pumped", "solid"].includes(type)) {
      return [{ formula: "분유", pumped: "유축", solid: "이유식" }[type], Number(entry.feedingMl) > 0 ? `${Number(entry.feedingMl)}mL` : entry.title || "수유 기록"];
    }
    if (type === "breast") {
      const details = [entry.feedingSide, Number(entry.feedingMinutes) > 0 ? formatDuration(Number(entry.feedingMinutes)) : ""].filter(Boolean);
      return ["직수", details.join(" · ") || entry.title || "수유 기록"];
    }
    if (type === "sleep") {
      return ["수면", Number(entry.sleepMinutes) > 0 ? formatDuration(Number(entry.sleepMinutes)) : entry.title || "수면 기록"];
    }
    if (type === "health") {
      return ["건강", [entry.title || "건강 기록", Number(entry.temperature) > 0 ? `${Number(entry.temperature)}°C` : ""].filter(Boolean).join(" · ")];
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
      .map((entry) => ({ entry, type: growthCareType(entry) }))
      .filter(({ type }) => type && carePatternCategories.has(type))
      .sort((a, b) => b.entry.time.localeCompare(a.entry.time));

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
          const editLabel = `${entry.time} ${label} ${String(detail || "")} 기록 수정`;
          return `<button type="button" class="care-time-row ${type}" data-care-entry-id="${escapeHtml(String(entry.id || ""))}" aria-label="${escapeHtml(editLabel)}" aria-haspopup="dialog">
            <time datetime="${escapeHtml(`${entry.date}T${entry.time}`)}">${escapeHtml(entry.time)}</time>
            <i aria-hidden="true"></i>
            <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(String(detail || ""))}</small></span>
          </button>`;
        }).join("")}
      </div>
    `;
    content.appendChild(timeline);
  };

  renderGrowth();
})();
