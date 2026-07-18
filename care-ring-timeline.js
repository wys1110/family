(() => {
  const CARE_DAY_MODE_KEY = "family-care-day-mode-v1";
  const CARE_DAY_MODES = new Set(["timeline", "clock"]);
  const circularCareClock = renderDailyCareClock;
  const baseRenderCarePattern = renderCarePattern;

  const storedCareDayMode = () => {
    try {
      const saved = localStorage.getItem(CARE_DAY_MODE_KEY);
      return CARE_DAY_MODES.has(saved) ? saved : "timeline";
    } catch {
      return "timeline";
    }
  };

  let careDayMode = storedCareDayMode();

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

  const entryCard = (entry, type) => {
    const label = labelOf(type);
    const detail = detailOf(entry, type);
    return `
      <button type="button" class="care-split-entry ${type}" data-care-entry-id="${escapeHtml(String(entry.id || ""))}" aria-label="${escapeHtml(`${label} ${detail} 기록 수정`)}" aria-haspopup="dialog">
        <span><i aria-hidden="true"></i><strong>${label}</strong></span>
        <small>${escapeHtml(detail)}</small>
        <span class="care-split-edit" aria-hidden="true">✎</span>
      </button>`;
  };

  const openCareEntryEditor = (event) => {
    const card = event.target.closest("[data-care-entry-id]");
    if (!card) return;
    const entry = state.growthEntries.find((item) => String(item.id) === card.dataset.careEntryId);
    if (!entry) {
      toast("수정할 기록을 찾지 못했어요");
      return;
    }
    openGrowthDialog(entry);
  };

  const removeSleepControls = () => {
    carePatternCategories.delete("sleep");
    document.querySelector('[data-pattern-category="sleep"]')?.remove();
    document.querySelector(".care-rhythm-legend .sleep")?.remove();
  };

  const ensureSleepControls = ({ activate = false } = {}) => {
    if (activate) carePatternCategories.add("sleep");

    const categories = document.querySelector("#carePatternCategories");
    if (categories && !categories.querySelector('[data-pattern-category="sleep"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sleep";
      button.dataset.patternCategory = "sleep";
      button.innerHTML = '<i>Zz</i>수면';
      const diaperButton = categories.querySelector('[data-pattern-category="diaper"]');
      categories.insertBefore(button, diaperButton || null);
    }

    const legend = document.querySelector(".care-rhythm-legend");
    if (legend && !legend.querySelector(".sleep")) {
      const item = document.createElement("span");
      item.className = "sleep";
      item.textContent = "수면";
      const diaperItem = legend.querySelector(".diaper");
      legend.insertBefore(item, diaperItem || null);
    }
  };

  const categoryIsVisible = (type) => {
    if (carePatternCategories.has(type)) return true;
    return ["formula", "breast"].includes(type) && carePatternCategories.has("feed");
  };

  const ensureDayModeControl = () => {
    let control = document.querySelector("#careDayModeControl");
    if (control) return control;

    const tabs = document.querySelector("#carePatternTabs");
    if (!tabs) return null;

    control = document.createElement("div");
    control.id = "careDayModeControl";
    control.className = "care-day-mode-control";
    control.innerHTML = `
      <span>하루 보기</span>
      <div role="group" aria-label="하루 돌봄 패턴 표시 방식">
        <button type="button" data-care-day-mode="timeline" aria-pressed="false">타임라인</button>
        <button type="button" data-care-day-mode="clock" aria-pressed="false">원형 시계</button>
      </div>
    `;
    control.addEventListener("click", (event) => {
      const button = event.target.closest("[data-care-day-mode]");
      if (!button || button.dataset.careDayMode === careDayMode) return;

      careDayMode = CARE_DAY_MODES.has(button.dataset.careDayMode) ? button.dataset.careDayMode : "timeline";
      try { localStorage.setItem(CARE_DAY_MODE_KEY, careDayMode); } catch { /* 현재 화면에는 적용 */ }

      ensureSleepControls({ activate: true });

      renderCarePattern(activeBabyEntries());
      toast(careDayMode === "clock" ? "원형 시계로 바꿨어요 🕐" : "타임라인으로 바꿨어요");
    });
    tabs.after(control);
    return control;
  };

  const updateDayModeControl = () => {
    const control = ensureDayModeControl();
    if (!control) return;
    control.hidden = carePatternView !== "day";
    control.querySelectorAll("[data-care-day-mode]").forEach((button) => {
      const active = button.dataset.careDayMode === careDayMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  };

  const renderSplitCareTimeline = (entries) => {
    ensureSleepControls({ activate: true });

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

  renderDailyCareClock = function renderSelectedDailyCarePattern(entries) {
    if (careDayMode === "clock") {
      ensureSleepControls();
      return circularCareClock(entries);
    }
    return renderSplitCareTimeline(entries);
  };

  renderCarePattern = function renderCarePatternWithDayMode(entries) {
    ensureDayModeControl();
    ensureSleepControls({ activate: true });

    const result = baseRenderCarePattern(entries);
    updateDayModeControl();
    return result;
  };

  const carePatternContent = document.querySelector("#carePatternContent");
  if (carePatternContent && !carePatternContent.dataset.entryEditBound) {
    carePatternContent.dataset.entryEditBound = "true";
    carePatternContent.addEventListener("click", openCareEntryEditor);
  }

  ensureDayModeControl();
  ensureSleepControls({ activate: true });
  updateDayModeControl();
  renderGrowth();
})();
