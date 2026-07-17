(() => {
  const KEY = "family-feeding-quick-source-v1";
  const SOURCES = {
    breast: { label: "직수", title: "모유 수유", type: "모유" },
    pumped: { label: "유축모유", title: "유축모유 수유", type: "유축모유" },
    formula: { label: "분유", title: "분유 수유", type: "분유" },
  };
  const sourceOrder = ["breast", "pumped", "formula"];
  let source = readSource();

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
    if (entry?.category !== "수유·이유식") return "";
    const type = String(entry.feedingType || "");
    const title = String(entry.title || "");
    if (type === "유축모유" || title.includes("유축")) return "pumped";
    if (type === "모유" || title.includes("모유")) return "breast";
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
  function ageRange() {
    const baby = activeBaby?.();
    const days = baby?.birthDate ? daysFromBirth(baby.birthDate) : null;
    if (days !== null && days < 7) return [30, 60];
    if (days !== null && days < 31) return [40, 120];
    if (days !== null && days < 90) return [50, 180];
    return [60, 240];
  }
  function bottleRecommendation(kind) {
    const recent = entries().filter((entry) => typeOf(entry) === kind && Number(entry.feedingMl) > 0)
      .sort((a, b) => `${b.date}T${b.time || "23:59"}`.localeCompare(`${a.date}T${a.time || "23:59"}`))
      .slice(0, 12).map((entry) => Number(entry.feedingMl));
    const weight = latestWeight(), [minimum, maximum] = ageRange();
    const history = median(recent), weightValue = weight ? weight.kg * 165 / 8 : null;
    let center = history && weightValue ? history * .72 + weightValue * .28 : history || weightValue || (kind === "pumped" ? 80 : 100);
    center = Math.min(maximum, Math.max(minimum, Math.round(center / 10) * 10));
    const step = center <= 70 ? 10 : 20;
    return { center, values: [...new Set([Math.max(minimum, center - step), center, Math.min(maximum, center + step)])], weight, recentCount: recent.length };
  }
  function presets(kind) {
    if (kind === "breast") return [
      { label: "왼쪽 10분", note: "직수", title: "모유 수유", feedingType: "모유", feedingSide: "왼쪽", feedingMinutes: 10 },
      { label: "오른쪽 10분", note: "직수", title: "모유 수유", feedingType: "모유", feedingSide: "오른쪽", feedingMinutes: 10 },
      { label: "양쪽 20분", note: "직수", title: "모유 수유", feedingType: "모유", feedingSide: "양쪽", feedingMinutes: 20 },
    ];
    const info = bottleRecommendation(kind);
    return info.values.map((ml) => ({
      label: `${ml} ml`, note: `${kind === "pumped" ? "유축" : "분유"} · ${ml === info.center ? "추천" : ml < info.center ? "조금 적게" : "조금 많이"}`,
      title: SOURCES[kind].title, feedingType: SOURCES[kind].type, feedingMl: ml,
    }));
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
      if (button) { setSource(button.dataset.feedingSource); renderQuick(); }
      if (event.target.closest("[data-record-weight]")) {
        document.querySelector("#quickLogDialog")?.close(); openGrowthDialog(null, "성장");
        setTimeout(() => document.querySelector("#growthWeight")?.focus(), 100);
      }
    });
    return wrap;
  }
  function renderQuick() {
    const wrap = ensureTabs();
    wrap?.removeAttribute("hidden");
    activeQuickCategory = "수유·이유식";
    activeQuickPresets = presets(source);
    document.querySelectorAll("[data-feeding-source]").forEach((button) => button.classList.toggle("active", button.dataset.feedingSource === source));
    document.querySelector("#quickLogTitle").textContent = source === "breast" ? "직수를 바로 기록해요" : `${SOURCES[source].label}를 바로 기록해요`;
    document.querySelector("#quickLogCopy").textContent = source === "breast" ? "방향과 시간을 누르면 현재 시간으로 저장됩니다." : "몸무게와 최근 기록을 반영한 버튼이에요. 아기의 배고픔·포만 신호와 의료진 안내가 우선이에요.";
    const meta = document.querySelector("#feedingQuickMeta");
    if (source === "breast") meta.textContent = "실제 시간은 상세 입력에서 조정할 수 있어요.";
    else {
      const info = bottleRecommendation(source), evidence = [info.weight && `${info.weight.label} ${info.weight.kg}kg`, info.recentCount && `최근 ${info.recentCount}회`].filter(Boolean);
      meta.innerHTML = evidence.length ? `<span>${escapeHtml(evidence.join(" · "))} 반영 · 기록 기반 참고값</span>` : '<span>몸무게를 기록하면 버튼이 자동 조정돼요.</span><button type="button" data-record-weight>몸무게 기록</button>';
    }
    const grid = document.querySelector("#quickPresetGrid");
    grid.classList.toggle("direct-feeding", source === "breast");
    grid.innerHTML = activeQuickPresets.map((preset, index) => `<button type="button" class="${source}" data-preset-index="${index}"><span>${escapeHtml(preset.label)}</span><small>${escapeHtml(preset.note)}</small></button>`).join("");
  }

  const baseQuickPresets = quickPresets;
  quickPresets = (category) => category === "수유·이유식" ? presets(source) : baseQuickPresets(category);
  const baseOpenGrowthQuick = openGrowthQuick;
  openGrowthQuick = function adaptiveOpenQuick(category) {
    if (category !== "수유·이유식") {
      document.querySelector("#feedingQuickTabs")?.setAttribute("hidden", "");
      document.querySelector("#quickPresetGrid")?.classList.remove("direct-feeding");
      return baseOpenGrowthQuick(category);
    }
    if (!activeBaby()) { openBabyDialog(); toast("아기 프로필을 먼저 만들어주세요"); return; }
    installFeedingOptions(); renderQuick(); document.querySelector("#quickLogDialog").showModal();
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

  function label(kind) { return ({ formula: "분유", pumped: "유축", breast: "직수", diaper: "기저귀" })[kind]; }
  function detail(entry, kind) {
    if (["formula", "pumped"].includes(kind)) return Number(entry.feedingMl) ? `${Number(entry.feedingMl)}mL` : label(kind);
    if (kind === "breast") return [entry.feedingSide, Number(entry.feedingMinutes) ? formatDuration(Number(entry.feedingMinutes)) : ""].filter(Boolean).join(" · ") || "직수";
    return entry.diaperKind || "교체";
  }
  function installCareControls() {
    const container = document.querySelector("#carePatternCategories");
    if (!container || container.querySelector('[data-pattern-category="pumped"]')) return;
    carePatternCategories.clear(); ["formula", "pumped", "breast", "diaper"].forEach((kind) => carePatternCategories.add(kind));
    container.innerHTML = ["formula", "pumped", "breast", "diaper"].map((kind) => `<button type="button" class="${kind} active" data-pattern-category="${kind}" aria-pressed="true"><i>${kind === "formula" ? "F" : kind === "pumped" ? "P" : kind === "breast" ? "M" : "D"}</i>${label(kind)}</button>`).join("");
    const legend = document.querySelector(".care-rhythm-legend");
    if (legend) legend.innerHTML = ["formula", "pumped", "breast", "diaper"].map((kind) => `<span class="${kind}">${label(kind)}</span>`).join("");
  }
  growthCareType = typeOf;
  renderDailyCareClock = function adaptiveDailyTimeline(items) {
    installCareControls();
    const date = parseDate(carePatternDate), today = dateKey(new Date());
    const dayItems = items.filter((entry) => entry.date === carePatternDate && typeOf(entry));
    const groups = dayItems.filter((entry) => entry.time && carePatternCategories.has(typeOf(entry))).reduce((map, entry) => {
      if (!map.has(entry.time)) map.set(entry.time, []); map.get(entry.time).push(entry); return map;
    }, new Map());
    const byType = Object.fromEntries(["formula", "pumped", "breast", "diaper"].map((kind) => [kind, dayItems.filter((entry) => typeOf(entry) === kind)]));
    const sum = (kind, field) => byType[kind].reduce((total, entry) => total + (Number(entry[field]) || 0), 0);
    const dayLabel = carePatternDate === today ? "오늘" : `${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]}요일`;
    document.querySelector("#carePatternDateLabel").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 · ${dayLabel}`;
    document.querySelector("#carePatternDateNav [data-pattern-day='1']").disabled = carePatternDate >= today;
    const rows = [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([time, row]) => {
      const cards = (list) => list.map((entry) => { const kind = typeOf(entry); return `<article class="care-split-entry ${kind}"><span><i></i><strong>${label(kind)}</strong></span><small>${escapeHtml(detail(entry, kind))}</small></article>`; }).join("");
      return `<div class="care-split-row"><div class="care-split-cell feeding">${cards(row.filter((entry) => typeOf(entry) !== "diaper"))}</div><time class="care-split-time">${escapeHtml(time)}</time><div class="care-split-cell diaper">${cards(row.filter((entry) => typeOf(entry) === "diaper"))}</div></div>`;
    }).join("");
    document.querySelector("#carePatternContent").innerHTML = `<section class="care-linear-card"><div class="care-linear-summary adaptive-feeding-summary"><article class="formula"><span>분유</span><strong>${sum("formula", "feedingMl")}mL</strong><small>${byType.formula.length}회</small></article><article class="pumped"><span>유축</span><strong>${sum("pumped", "feedingMl")}mL</strong><small>${byType.pumped.length}회</small></article><article class="breast"><span>직수</span><strong>${formatDuration(sum("breast", "feedingMinutes"))}</strong><small>${byType.breast.length}회</small></article><article class="diaper"><span>기저귀</span><strong>${byType.diaper.length}회</strong><small>오늘 기록</small></article></div><div class="care-split-heading"><span>직수 · 유축 · 분유</span><span>시간</span><span>기저귀</span></div><div class="care-split-timeline">${rows || '<p class="care-linear-empty">이 날짜에는 수유·기저귀 시간 기록이 없어요.</p>'}</div></section>`;
  };

  renderWeeklyCarePattern = function adaptiveWeeklyPattern(items) {
    installCareControls();
    const end = dateKey(new Date()), kinds = ["formula", "pumped", "breast", "diaper"], days = Array.from({ length: 7 }, (_, index) => addDays(end, index - 6));
    const data = days.map((day) => {
      const current = items.filter((entry) => entry.date === day);
      const total = (kind, field) => current.filter((entry) => typeOf(entry) === kind).reduce((sum, entry) => sum + (Number(entry[field]) || (field ? 0 : 1)), 0);
      return { day, formula: total("formula", "feedingMl"), pumped: total("pumped", "feedingMl"), breast: total("breast", "feedingMinutes"), diaper: current.filter((entry) => typeOf(entry) === "diaper").length };
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
    const start = addDays(dateKey(new Date()), -6), kinds = ["formula", "pumped", "breast", "diaper"].filter((kind) => carePatternCategories.has(kind));
    const cards = kinds.map((kind) => {
      const times = items.filter((entry) => entry.date >= start && typeOf(entry) === kind && entry.time).map((entry) => new Date(`${entry.date}T${entry.time}:00`).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
      const gaps = times.slice(1).map((time, index) => Math.round((time - times[index]) / 60000)).filter((minutes) => minutes > 0 && minutes <= 1440), typical = median(gaps);
      return `<article class="adaptive-interval-card ${kind}"><span>${label(kind)}</span><strong>${typical ? formatDuration(Math.round(typical)) : "—"}</strong><small>${gaps.length ? `최근 ${gaps.length + 1}개 기록의 중앙 간격` : "기록이 더 필요해요"}</small></article>`;
    }).join("");
    document.querySelector("#carePatternContent").innerHTML = `<div class="adaptive-interval-grid">${cards}</div>`;
  };

  installFeedingOptions(); installCareControls(); renderGrowth();
})();