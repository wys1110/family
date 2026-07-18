(() => {
  const KEY = "family-feeding-quick-source-v1";
  const SOURCES = {
    breast: { label: "직수", title: "모유 수유", type: "모유" },
    pumped: { label: "유축모유", title: "유축모유 수유", type: "유축모유" },
    formula: { label: "분유", title: "분유 수유", type: "분유" },
  };
  const sourceOrder = ["breast", "pumped", "formula"];
  const careKinds = ["formula", "pumped", "breast", "solid", "sleep", "diaper"];
  const BOTTLE_DEFAULT_ML = 100;
  const BOTTLE_STEP_ML = 10;
  const BOTTLE_MIN_ML = 10;
  const BOTTLE_MAX_ML = 300;
  let source = readSource();
  let bottleAmounts = { pumped: BOTTLE_DEFAULT_ML, formula: BOTTLE_DEFAULT_ML };

  function readSource() {
    try { const saved = localStorage.getItem(KEY); return sourceOrder.includes(saved) ? saved : "breast"; }
    catch { return "breast"; }
  }
  function setSource(next) {
    source = sourceOrder.includes(next) ? next : "breast";
    try { localStorage.setItem(KEY, source); } catch { /* 현재 화면만 유지 */ }
  }
  function typeOf(entry) {
    if (entry?.category === "기저귀") return "diaper";
    if (entry?.category === "수면") return "sleep";
    if (entry?.category !== "수유·이유식") return "";
    const type = String(entry.feedingType || "");
    const title = String(entry.title || "");
    if (type === "유축모유" || title.includes("유축")) return "pumped";
    if (type === "모유" || title.includes("모유")) return "breast";
    if (type === "이유식" || title.includes("이유식")) return "solid";
    return "formula";
  }
  function entries() { return typeof activeBabyEntries === "function" ? activeBabyEntries() : []; }
  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function latestWeight() {
    const measured = entries().filter((entry) => Number(entry.weight) > 0)
      .sort((a, b) => `${b.date}T${b.time || "23:59"}`.localeCompare(`${a.date}T${a.time || "23:59"}`))[0];
    if (measured) return { kg: Number(measured.weight), label: "최근 몸무게" };
    const baby = activeBaby?.();
    return Number(baby?.birthWeight) > 0 ? { kg: Number(baby.birthWeight), label: "출생 몸무게" } : null;
  }
  function resetBottleAmounts() {
    bottleAmounts = { pumped: BOTTLE_DEFAULT_ML, formula: BOTTLE_DEFAULT_ML };
  }
  function bottleContext(kind) {
    const recentCount = entries().filter((entry) => typeOf(entry) === kind && Number(entry.feedingMl) > 0).slice(0, 12).length;
    return { weight: latestWeight(), recentCount };
  }
  function bottlePreset(kind) {
    const ml = bottleAmounts[kind] || BOTTLE_DEFAULT_ML;
    return {
      label: `${ml} ml`, note: kind === "pumped" ? "유축모유" : "분유",
      title: SOURCES[kind].title, feedingType: SOURCES[kind].type, feedingMl: ml,
    };
  }
  function updateBottleAmount(delta) {
    if (source === "breast") return;
    const current = bottleAmounts[source] || BOTTLE_DEFAULT_ML;
    bottleAmounts[source] = Math.min(BOTTLE_MAX_ML, Math.max(BOTTLE_MIN_ML, current + delta));
    activeQuickPresets = [bottlePreset(source)];
    const ml = bottleAmounts[source];
    const amount = document.querySelector("#feedingQuickAmount");
    const saveLabel = document.querySelector("#feedingQuickSaveLabel");
    if (amount) amount.textContent = ml;
    if (saveLabel) saveLabel.textContent = `${ml} ml 기록하기`;
    document.querySelectorAll("[data-feeding-adjust]").forEach((button) => {
      const next = ml + Number(button.dataset.feedingAdjust);
      button.disabled = next < BOTTLE_MIN_ML || next > BOTTLE_MAX_ML;
    });
  }
  function presets(kind) {
    if (kind === "breast") return [
      { label: "왼쪽 10분", note: "직수", title: "모유 수유", feedingType: "모유", feedingSide: "왼쪽", feedingMinutes: 10 },
      { label: "오른쪽 10분", note: "직수", title: "모유 수유", feedingType: "모유", feedingSide: "오른쪽", feedingMinutes: 10 },
      { label: "양쪽 20분", note: "직수", title: "모유 수유", feedingType: "모유", feedingSide: "양쪽", feedingMinutes: 20 },
    ];
    return [bottlePreset(kind)];
  }
  function installFeedingOptions() {
    const select = document.querySelector("#growthFeedingType");
    if (!select) return;
    const legacy = [...select.options].find((option) => option.value === "젖병");
    if (legacy) { legacy.textContent = "분유(기존)"; legacy.hidden = true; }
    ["유축모유", "분유"].forEach((value) => {
      if (![...select.options].some((option) => option.value === value)) select.add(new Option(value, value));
    });
  }
  function ensureTabs() {
    const grid = document.querySelector("#quickPresetGrid");
    let wrap = document.querySelector("#feedingQuickTabs");
    if (wrap || !grid) return wrap;
    wrap = document.createElement("div");
    wrap.id = "feedingQuickTabs";
    wrap.className = "feeding-quick-tabs-wrap";
    wrap.innerHTML = `<div class="feeding-quick-tabs">${sourceOrder.map((key) => `<button type="button" data-feeding-source="${key}">${SOURCES[key].label}</button>`).join("")}</div><div id="feedingQuickMeta" class="feeding-quick-meta"></div>`;
    grid.before(wrap);
    wrap.addEventListener("click", (event) => {
      const button = event.target.closest("[data-feeding-source]");
      const adjust = event.target.closest("[data-feeding-adjust]");
      if (button) { setSource(button.dataset.feedingSource); renderQuick(); }
      if (adjust) { event.preventDefault(); updateBottleAmount(Number(adjust.dataset.feedingAdjust)); }
      if (event.target.closest("[data-record-weight]")) {
        document.querySelector("#quickLogDialog")?.close(); openGrowthDialog(null, "성장");
        setTimeout(() => document.querySelector("#growthWeight")?.focus(), 100);
      }
    });
    return wrap;
  }
  function metaItem(kind, text) {
    return `<span class="feeding-meta-item ${kind}"><i aria-hidden="true"></i>${escapeHtml(text)}</span>`;
  }
  function renderBottleMeta(info) {
    const items = [];
    if (info.weight) items.push(metaItem("weight", `${info.weight.label} ${info.weight.kg}kg`));
    if (info.recentCount) items.push(metaItem("recent", `최근 ${info.recentCount}회`));
    items.push(metaItem("guide", "수유량 참고"));
    return items.join('<span class="feeding-meta-divider" aria-hidden="true"></span>');
  }
  function renderQuick() {
    const wrap = ensureTabs();
    const dialog = document.querySelector("#quickLogDialog");
    wrap?.removeAttribute("hidden");
    dialog?.classList.add("feeding-quick-active");
    dialog?.classList.toggle("feeding-bottle-active", source !== "breast");
    activeQuickCategory = "수유·이유식";
    activeQuickPresets = presets(source);
    document.querySelectorAll("[data-feeding-source]").forEach((button) => button.classList.toggle("active", button.dataset.feedingSource === source));
    document.querySelector("#quickLogTitle").textContent = source === "breast" ? "직수를 바로 기록해요" : `${SOURCES[source].label}를 바로 기록해요`;
    document.querySelector("#quickLogCopy").textContent = source === "breast" ? "방향과 시간을 누르면 현재 시간으로 저장됩니다." : `${BOTTLE_DEFAULT_ML} ml에서 시작해 ${BOTTLE_STEP_ML} ml씩 조절한 뒤 기록하세요. 아기의 배고픔·포만 신호와 의료진 안내가 우선이에요.`;
    const meta = document.querySelector("#feedingQuickMeta");
    if (source === "breast") meta.innerHTML = '<span class="feeding-meta-note">실제 시간은 상세 입력에서 조정할 수 있어요.</span>';
    else {
      const info = bottleContext(source);
      meta.innerHTML = info.weight || info.recentCount
        ? renderBottleMeta(info)
        : '<span class="feeding-meta-note">몸무게를 기록하면 수유량 판단에 참고할 수 있어요.</span><button type="button" data-record-weight>몸무게 기록</button>';
    }
    const grid = document.querySelector("#quickPresetGrid");
    grid.classList.toggle("direct-feeding", source === "breast");
    grid.classList.toggle("bottle-feeding", source !== "breast");
    if (source === "breast") {
      grid.innerHTML = activeQuickPresets.map((preset, index) => `<button type="button" class="${source}" data-preset-index="${index}"><span>${escapeHtml(preset.label)}</span><small>${escapeHtml(preset.note)}</small></button>`).join("");
    } else {
      const ml = bottleAmounts[source];
      grid.innerHTML = `<div class="feeding-amount-stepper" role="group" aria-label="${SOURCES[source].label} 수유량 조절"><button type="button" data-feeding-adjust="-${BOTTLE_STEP_ML}" aria-label="${BOTTLE_STEP_ML} ml 줄이기">−${BOTTLE_STEP_ML}</button><output class="feeding-amount-value" aria-live="polite"><strong id="feedingQuickAmount">${ml}</strong><span>ml</span></output><button type="button" data-feeding-adjust="${BOTTLE_STEP_ML}" aria-label="${BOTTLE_STEP_ML} ml 늘리기">+${BOTTLE_STEP_ML}</button></div><button type="button" class="feeding-save-button ${source}" data-preset-index="0"><span><strong id="feedingQuickSaveLabel">${ml} ml 기록하기</strong><small>현재 시간으로 바로 저장</small></span></button>`;
      updateBottleAmount(0);
    }
  }

  const baseQuickPresets = quickPresets;
  quickPresets = (category) => category === "수유·이유식" ? presets(source) : baseQuickPresets(category);
  const baseOpenGrowthQuick = openGrowthQuick;
  openGrowthQuick = function adaptiveOpenQuick(category) {
    const dialog = document.querySelector("#quickLogDialog");
    if (category !== "수유·이유식") {
      document.querySelector("#feedingQuickTabs")?.setAttribute("hidden", "");
      document.querySelector("#quickPresetGrid")?.classList.remove("direct-feeding", "bottle-feeding");
      dialog?.classList.remove("feeding-quick-active", "feeding-bottle-active");
      return baseOpenGrowthQuick(category);
    }
    if (!activeBaby()) { openBabyDialog(); toast("아기 프로필을 먼저 만들어주세요"); return; }
    resetBottleAmounts(); installFeedingOptions(); renderQuick(); dialog?.showModal();
  };

  const baseTodaySummary = renderTodayCareSummary;
  renderTodayCareSummary = function adaptiveTodaySummary(items) {
    baseTodaySummary(items);
    const today = dateKey(new Date()), feedings = items.filter((entry) => entry.date === today && entry.category === "수유·이유식");
    const total = (kind, field) => feedings.filter((entry) => typeOf(entry) === kind).reduce((sum, entry) => sum + (Number(entry[field]) || 0), 0);
    const parts = [["분유", total("formula", "feedingMl"), "mL"], ["유축", total("pumped", "feedingMl"), "mL"], ["직수", total("breast", "feedingMinutes"), "분"]]
      .filter(([, value]) => value).map(([label, value, unit]) => `${label} ${value}${unit}`);
    const note = document.querySelector("#todayCareSummary article.feed small");
    if (note && parts.length) note.textContent = parts.join(" · ");
  };

  const baseGrowthSummary = renderGrowthSummary;
  renderGrowthSummary = function adaptiveGrowthSummary(items) {
    baseGrowthSummary(items);
    const periodDays = { day: 1, week: 7, month: 30 }[state.growthSummaryPeriod] || 1;
    const end = dateKey(new Date());
    const start = addDays(end, 1 - periodDays);
    const feedings = items.filter((entry) => entry.date >= start && entry.date <= end && entry.category === "수유·이유식");
    const total = (kind, field) => feedings.filter((entry) => typeOf(entry) === kind).reduce((sum, entry) => sum + (Number(entry[field]) || 0), 0);
    const parts = [
      ["분유", total("formula", "feedingMl"), "mL"],
      ["유축", total("pumped", "feedingMl"), "mL"],
      ["이유식", total("solid", "feedingMl"), "mL"],
      ["직수", total("breast", "feedingMinutes"), "분"],
    ].filter(([, value]) => value).map(([labelText, value, unit]) => `${labelText} ${value}${unit}`);
    const note = document.querySelector("#growthSummaryGrid .summary-card.feed small");
    if (note) note.textContent = parts.join(" · ") || (feedings.length ? "수유량·시간 미입력" : "기록 없음");
  };

  function label(kind) { return ({ formula: "분유", pumped: "유축", breast: "직수", solid: "이유식", sleep: "수면", diaper: "기저귀" })[kind]; }
  function detail(entry, kind) {
    if (["formula", "pumped", "solid"].includes(kind)) return Number(entry.feedingMl) ? `${Number(entry.feedingMl)}mL` : label(kind);
    if (kind === "breast") return [entry.feedingSide, Number(entry.feedingMinutes) ? formatDuration(Number(entry.feedingMinutes)) : ""].filter(Boolean).join(" · ") || "직수";
    if (kind === "sleep") return Number(entry.sleepMinutes) ? formatDuration(Number(entry.sleepMinutes)) : "수면";
    return entry.diaperKind || "교체";
  }
  function installCareControls() {
    const container = document.querySelector("#carePatternCategories");
    if (!container || container.querySelector('[data-pattern-category="pumped"]')) return;
    carePatternCategories.clear(); careKinds.forEach((kind) => carePatternCategories.add(kind));
    container.innerHTML = careKinds.map((kind) => `<button type="button" class="${kind} active" data-pattern-category="${kind}" aria-pressed="true"><i>${kind === "formula" ? "F" : kind === "pumped" ? "P" : kind === "breast" ? "M" : kind === "solid" ? "S" : kind === "sleep" ? "Zz" : "D"}</i>${label(kind)}</button>`).join("");
    const legend = document.querySelector(".care-rhythm-legend");
    if (legend) legend.innerHTML = careKinds.map((kind) => `<span class="${kind}">${label(kind)}</span>`).join("");
  }
  growthCareType = typeOf;
  const baseDailyCarePattern = renderDailyCareClock;
  const renderAdaptiveDailyTimeline = function adaptiveDailyTimeline(items) {
    installCareControls();
    const date = parseDate(carePatternDate), today = dateKey(new Date());
    const dayItems = items.filter((entry) => entry.date === carePatternDate && typeOf(entry));
    const groups = dayItems.filter((entry) => entry.time && carePatternCategories.has(typeOf(entry))).reduce((map, entry) => {
      if (!map.has(entry.time)) map.set(entry.time, []); map.get(entry.time).push(entry); return map;
    }, new Map());
    const byType = Object.fromEntries(careKinds.map((kind) => [kind, dayItems.filter((entry) => typeOf(entry) === kind)]));
    const sum = (kind, field) => byType[kind].reduce((total, entry) => total + (Number(entry[field]) || 0), 0);
    const dayLabel = carePatternDate === today ? "오늘" : `${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]}요일`;
    document.querySelector("#carePatternDateLabel").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 · ${dayLabel}`;
    document.querySelector("#carePatternDateNav [data-pattern-day='1']").disabled = carePatternDate >= today;
    const rows = [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([time, row]) => {
      const cards = (list) => list.map((entry) => { const kind = typeOf(entry); return `<article class="care-split-entry ${kind}"><span><i></i><strong>${label(kind)}</strong></span><small>${escapeHtml(detail(entry, kind))}</small></article>`; }).join("");
      return `<div class="care-split-row"><div class="care-split-cell feeding">${cards(row.filter((entry) => typeOf(entry) !== "diaper"))}</div><time class="care-split-time">${escapeHtml(time)}</time><div class="care-split-cell diaper">${cards(row.filter((entry) => typeOf(entry) === "diaper"))}</div></div>`;
    }).join("");
    document.querySelector("#carePatternContent").innerHTML = `<section class="care-linear-card"><div class="care-linear-summary adaptive-feeding-summary"><article class="formula"><span>분유</span><strong>${sum("formula", "feedingMl")}mL</strong><small>${byType.formula.length}회</small></article><article class="pumped"><span>유축</span><strong>${sum("pumped", "feedingMl")}mL</strong><small>${byType.pumped.length}회</small></article><article class="breast"><span>직수</span><strong>${formatDuration(sum("breast", "feedingMinutes"))}</strong><small>${byType.breast.length}회</small></article><article class="solid"><span>이유식</span><strong>${sum("solid", "feedingMl")}mL</strong><small>${byType.solid.length}회</small></article><article class="sleep"><span>수면</span><strong>${formatDuration(sum("sleep", "sleepMinutes"))}</strong><small>${byType.sleep.length}회</small></article><article class="diaper"><span>기저귀</span><strong>${byType.diaper.length}회</strong><small>오늘 기록</small></article></div><div class="care-split-heading"><span>수유 · 이유식 · 수면</span><span>시간</span><span>기저귀</span></div><div class="care-split-timeline">${rows || '<p class="care-linear-empty">이 날짜에는 돌봄 시간 기록이 없어요.</p>'}</div></section>`;
  };
  renderDailyCareClock = function adaptiveDailyCarePattern(items) {
    const clockButton = document.querySelector('[data-care-day-mode="clock"]');
    let useClock = clockButton?.classList.contains("active") || document.activeElement === clockButton;
    try { useClock ||= localStorage.getItem("family-care-day-mode-v1") === "clock"; } catch { /* 현재 선택 상태 사용 */ }
    return useClock
      ? baseDailyCarePattern.apply(this, arguments)
      : renderAdaptiveDailyTimeline.apply(this, arguments);
  };

  renderWeeklyCarePattern = function adaptiveWeeklyPattern(items) {
    installCareControls();
    const end = dateKey(new Date()), kinds = careKinds, days = Array.from({ length: 7 }, (_, index) => addDays(end, index - 6));
    const data = days.map((day) => {
      const current = items.filter((entry) => entry.date === day);
      const total = (kind, field) => current.filter((entry) => typeOf(entry) === kind).reduce((sum, entry) => sum + (Number(entry[field]) || (field ? 0 : 1)), 0);
      return { day, formula: total("formula", "feedingMl"), pumped: total("pumped", "feedingMl"), breast: total("breast", "feedingMinutes"), solid: total("solid", "feedingMl"), sleep: total("sleep", "sleepMinutes"), diaper: current.filter((entry) => typeOf(entry) === "diaper").length };
    });
    const selected = kinds.filter((kind) => carePatternCategories.has(kind));
    const maxima = Object.fromEntries(kinds.map((kind) => [kind, Math.max(1, ...data.map((item) => item[kind]))]));
    document.querySelector("#carePatternContent").innerHTML = `<div class="care-rhythm-chart adaptive-feeding-week">${data.map((item) => {
      const date = parseDate(item.day), today = item.day === end;
      const height = (value, maximum) => value ? Math.max(12, Math.round(value / maximum * 100)) : 4;
      return `<article class="care-rhythm-day ${today ? "today" : ""}"><div class="care-rhythm-bars">${selected.map((kind) => `<i class="${kind}" style="--bar:${height(item[kind], maxima[kind])}%" title="${label(kind)} ${item[kind]}"></i>`).join("")}</div><strong>${today ? "오늘" : ["일", "월", "화", "수", "목", "금", "토"][date.getDay()]}</strong><span>${date.getDate()}</span></article>`;
    }).join("")}</div>`;
  };
  renderCareIntervals = function adaptiveIntervals(items) {
    installCareControls();
    const start = addDays(dateKey(new Date()), -6), kinds = careKinds.filter((kind) => carePatternCategories.has(kind));
    const cards = kinds.map((kind) => {
      const times = items.filter((entry) => entry.date >= start && typeOf(entry) === kind && entry.time).map((entry) => new Date(`${entry.date}T${entry.time}:00`).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
      const gaps = times.slice(1).map((time, index) => Math.round((time - times[index]) / 60000)).filter((minutes) => minutes > 0 && minutes <= 1440), typical = median(gaps);
      return `<article class="adaptive-interval-card ${kind}"><span>${label(kind)}</span><strong>${typical ? formatDuration(Math.round(typical)) : "—"}</strong><small>${gaps.length ? `최근 ${gaps.length + 1}개 기록의 중앙 간격` : "기록이 더 필요해요"}</small></article>`;
    }).join("");
    document.querySelector("#carePatternContent").innerHTML = `<div class="adaptive-interval-grid">${cards}</div>`;
  };

  installFeedingOptions(); installCareControls(); renderGrowth();
})();
