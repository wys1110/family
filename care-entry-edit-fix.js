(() => {
  const content = document.querySelector("#carePatternContent");
  if (!content || typeof renderDailyCareClock !== "function" || renderDailyCareClock.__entryEditFixWrapped) return;

  const entryType = (entry) => typeof growthCareType === "function" ? growthCareType(entry) : "";
  const entryLabel = (type) => ({ formula: "분유", pumped: "유축", breast: "직수", diaper: "기저귀" })[type] || "돌봄";
  const entryDetail = (entry, type) => {
    if (["formula", "pumped"].includes(type)) return Number(entry.feedingMl) > 0 ? `${Number(entry.feedingMl)}mL` : entryLabel(type);
    if (type === "breast") {
      const parts = [entry.feedingSide, Number(entry.feedingMinutes) > 0 ? formatDuration(Number(entry.feedingMinutes)) : ""].filter(Boolean);
      return parts.join(" · ") || "직수";
    }
    return entry.diaperKind || "교체";
  };

  const makeEditable = (card, entry) => {
    if (!card || !entry?.id) return;
    const type = entryType(entry);
    const label = entryLabel(type);
    const detail = entryDetail(entry, type);
    card.dataset.careEntryId = String(entry.id);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `${label} ${detail} 기록 수정`);
    card.setAttribute("aria-haspopup", "dialog");
    if (!card.querySelector(".care-split-edit")) {
      const edit = document.createElement("span");
      edit.className = "care-split-edit";
      edit.setAttribute("aria-hidden", "true");
      edit.textContent = "✎";
      card.appendChild(edit);
    }
  };

  const decorateCards = (items) => {
    const grouped = items
      .filter((entry) => entry.date === carePatternDate && entry.time && carePatternCategories.has(entryType(entry)))
      .reduce((map, entry) => {
        if (!map.has(entry.time)) map.set(entry.time, []);
        map.get(entry.time).push(entry);
        return map;
      }, new Map());

    content.querySelectorAll(".care-split-row").forEach((row) => {
      const time = row.querySelector(".care-split-time")?.textContent.trim();
      if (!time) return;
      const entriesAtTime = grouped.get(time) || [];
      const feedingEntries = entriesAtTime.filter((entry) => entryType(entry) !== "diaper");
      const diaperEntries = entriesAtTime.filter((entry) => entryType(entry) === "diaper");
      row.querySelectorAll(".care-split-cell.feeding .care-split-entry").forEach((card, index) => makeEditable(card, feedingEntries[index]));
      row.querySelectorAll(".care-split-cell.diaper .care-split-entry").forEach((card, index) => makeEditable(card, diaperEntries[index]));
    });
  };

  if (!content.dataset.entryEditBound) {
    content.dataset.entryEditBound = "true";
    content.addEventListener("click", (event) => {
      const card = event.target.closest("[data-care-entry-id]");
      if (!card) return;
      const entry = state.growthEntries.find((item) => String(item.id) === card.dataset.careEntryId);
      if (entry) openGrowthDialog(entry);
      else toast("수정할 기록을 찾지 못했어요");
    });
  }

  content.addEventListener("keydown", (event) => {
    const card = event.target.closest("[data-care-entry-id]");
    if (!card || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    card.click();
  });

  const originalRenderDailyCareClock = renderDailyCareClock;
  const editableRenderDailyCareClock = function editableRenderDailyCareClock(items) {
    const result = originalRenderDailyCareClock.apply(this, arguments);
    decorateCards(items || []);
    return result;
  };
  editableRenderDailyCareClock.__entryEditFixWrapped = true;
  renderDailyCareClock = editableRenderDailyCareClock;

  renderGrowth();
})();
