(() => {
  const insightRow = document.querySelector("#growthInsightRow");
  if (!insightRow || document.documentElement.dataset.growthInlineChartBound === "true") return;

  document.documentElement.dataset.growthInlineChartBound = "true";

  const metrics = {
    height: { label: "키", unit: "cm", decimals: 1, color: "var(--theme-growth-height)" },
    weight: { label: "몸무게", unit: "kg", decimals: 2, color: "var(--theme-growth-weight)" },
    head: { label: "머리둘레", unit: "cm", decimals: 1, color: "var(--theme-growth-head)" },
  };

  let renderQueued = false;
  let rendering = false;
  let lastSignature = "";
  let historyExpanded = false;
  let selectedEntryId = "";
  let pointFocusPending = "";
  let historyToggleFocusPending = false;

  const escapeText = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);

  const numberValue = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };

  const measurementEntries = () => {
    if (typeof activeBabyEntries !== "function") return [];
    return activeBabyEntries()
      .filter((entry) => Object.keys(metrics).some((key) => numberValue(entry[key]) !== null))
      .sort((a, b) => `${a.date}T${a.time || "00:00"}`.localeCompare(`${b.date}T${b.time || "00:00"}`));
  };

  const formatDate = (value, includeYear = false) => {
    if (!value) return "";
    const [year, month, day] = value.split("-").map(Number);
    return includeYear
      ? `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`
      : `${month}.${day}`;
  };

  const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / 86400000;

  const babyMilestones = () => {
    const birthDate = typeof activeBaby === "function" ? activeBaby()?.birthDate : "";
    const birthDay = dayNumber(birthDate);
    if (!Number.isFinite(birthDay) || new Date(birthDay * 86400000).toISOString().slice(0, 10) !== birthDate) return [];
    const [year, month, day] = birthDate.split("-").map(Number);
    const birthday = Date.UTC(year + 1, month - 1, Math.min(day, new Date(Date.UTC(year + 1, month, 0)).getUTCDate())) / 86400000;
    // Birth is day one for the 100-day celebration; 돌 is the next calendar birthday.
    return [{ label: "100일", day: birthDay + 99 }, { label: "돌", day: birthday }];
  };

  const formatValue = (value, metricKey, withUnit = true) => {
    const number = numberValue(value);
    if (number === null) return "—";
    const metric = metrics[metricKey];
    const text = number.toLocaleString("ko-KR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: metric.decimals,
    });
    return withUnit ? `${text}${metric.unit}` : text;
  };

  const historyRows = (entries) => {
    const ordered = [...entries].reverse();
    const visibleEntries = historyExpanded ? ordered : ordered.slice(0, 5);
    const rows = visibleEntries.map((entry) => {
      const accessibleValues = Object.keys(metrics)
        .map((key) => `${metrics[key].label} ${formatValue(entry[key], key)}`)
        .join(", ");
      return `
        <button type="button" class="growth-inline-history-row"
          data-growth-inline-entry="${escapeText(entry.id)}"
          aria-label="${escapeText(formatDate(entry.date, true))} ${escapeText(accessibleValues)} 기록 수정">
          <time datetime="${escapeText(entry.date)}">${escapeText(formatDate(entry.date, true))}${entry.time ? `<small>${escapeText(entry.time)}</small>` : ""}</time>
          <span class="growth-inline-history-values">
            ${Object.keys(metrics).map((key) => `<b><small>${escapeText(metrics[key].label)}</small>${escapeText(formatValue(entry[key], key))}</b>`).join("")}
          </span>
          <i>수정</i>
        </button>`;
    }).join("");
    const toggle = ordered.length > 5
      ? `<button type="button" class="growth-inline-history-toggle" data-growth-inline-history-toggle aria-expanded="${historyExpanded}">${historyExpanded ? "최근 기록만 보기" : `전체 기록 보기 (${ordered.length})`}</button>`
      : "";
    return `
      <section class="growth-inline-history" aria-labelledby="growthInlineHistoryTitle">
        <header><div><h4 id="growthInlineHistoryTitle">측정 기록</h4><p>최근 기록부터 확인하고 수정할 수 있어요.</p></div><span>${ordered.length}개</span></header>
        <div class="growth-inline-history-list">${rows}</div>
        <div class="growth-inline-history-footer">${toggle}<button type="button" data-growth-inline-action="add">새 측정 기록</button></div>
      </section>`;
  };

  const smoothPath = (points) => {
    if (points.length < 2) return "";
    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const p0 = points[index - 1] || points[index];
      const p1 = points[index];
      const p2 = points[index + 1];
      const p3 = points[index + 2] || p2;
      const cp1x = Math.min(p2.x, p1.x + (p2.x - p0.x) / 6);
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = Math.max(p1.x, p2.x - (p3.x - p1.x) / 6);
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return path;
  };

  const scaleBounds = (values, defaultRange, fallbackMargin) => {
    if (!values.length) return { ...defaultRange, range: defaultRange.max - defaultRange.min };
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const difference = rawMax - rawMin;
    const margin = difference
      ? Math.max(difference * 0.18, fallbackMargin * 0.3)
      : fallbackMargin;
    const min = Math.max(0, Math.min(defaultRange.min, rawMin - margin));
    const max = Math.max(defaultRange.max, rawMax + margin);
    return { min, max, range: Math.max(max - min, 0.01) };
  };

  const chartSvg = (entries, selected) => {
    const width = 420;
    const padding = { left: 43, right: 43, top: 28, bottom: 38 };
    const plotWidth = width - padding.left - padding.right;
    const firstDay = dayNumber(entries[0].date);
    const lastDay = dayNumber(entries.at(-1).date);
    const milestones = babyMilestones().filter(({ day }) => day >= firstDay && day <= lastDay)
      .map((milestone) => ({ ...milestone, date: new Date(milestone.day * 86400000).toISOString().slice(0, 10) }));
    const crowdedMilestones = milestones.length === 2 && (milestones[1].day - milestones[0].day) / (lastDay - firstDay) * plotWidth < 56;
    const milestoneSpace = milestones.length ? (crowdedMilestones ? 48 : 24) : 0;
    const height = 252 + milestoneSpace;
    padding.bottom += milestoneSpace;
    const plotHeight = height - padding.top - padding.bottom;
    const cm = scaleBounds(entries.flatMap((entry) => [numberValue(entry.height), numberValue(entry.head)]).filter((value) => value !== null), { min: 32, max: 65 }, 2);
    const kg = scaleBounds(entries.map((entry) => numberValue(entry.weight)).filter((value) => value !== null), { min: 2, max: 8 }, 0.5);
    const scales = { height: cm, weight: kg, head: cm };
    const xForDay = (day) => firstDay === lastDay
      ? padding.left + plotWidth / 2
      : padding.left + ((day - firstDay) / (lastDay - firstDay)) * plotWidth;
    const xForIndex = (index) => xForDay(dayNumber(entries[index].date));
    const yForValue = (value, metricKey) => {
      const scale = scales[metricKey];
      return padding.top + ((scale.max - value) / scale.range) * plotHeight;
    };

    const grid = [0, 1, 2, 3, 4].map((index) => {
      const ratio = index / 4;
      const y = padding.top + ratio * plotHeight;
      const cmValue = cm.max - ratio * cm.range;
      const kgValue = kg.max - ratio * kg.range;
      return `
        <g class="growth-inline-grid">
          <line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}"></line>
          <text x="${padding.left - 8}" y="${(y + 3).toFixed(2)}" >${escapeText(cmValue.toLocaleString("ko-KR", { maximumFractionDigits: 1 }))}</text>
          <text class="weight-axis" x="${width - padding.right + 8}" y="${(y + 3).toFixed(2)}">${escapeText(kgValue.toLocaleString("ko-KR", { maximumFractionDigits: 1 }))}</text>
        </g>
      `;
    }).join("");

    const series = Object.entries(metrics).map(([metricKey, metric]) => {
      const points = entries.map((entry, entryIndex) => {
        const value = numberValue(entry[metricKey]);
        if (value === null) return null;
        return {
          entry,
          value,
          x: xForIndex(entryIndex),
          y: yForValue(value, metricKey),
        };
      }).filter(Boolean);
      if (!points.length) return "";

      const path = smoothPath(points);
      return `
        ${path ? `<path class="growth-inline-line growth-inline-line--${metricKey}" d="${path}" style="stroke:${metric.color}"></path>` : ""}
        ${points.map((point) => `
          <g class="growth-inline-point growth-inline-point--${metricKey}" data-growth-chart-entry="${escapeText(point.entry.id)}" data-growth-point-metric="${metricKey}" role="button" tabindex="0" aria-pressed="${String(point.entry.id) === String(selected.id)}" aria-label="${escapeText(formatDate(point.entry.date, true))} ${escapeText(metric.label)} ${escapeText(formatValue(point.value, metricKey))} 측정값 보기">
            <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="5" style="stroke:${metric.color}"></circle>
            <circle class="growth-inline-hit" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="14"></circle>
          </g>
        `).join("")}
      `;
    }).join("");

    const labelIndexes = entries.length === 1
      ? [0]
      : [...new Set([0, Math.round((entries.length - 1) / 2), entries.length - 1])];
    const dateIndexes = [...new Set(labelIndexes.map((index) => entries.findIndex((entry) => entry.date === entries[index].date)))].filter((index, position, indexes) =>
      position === 0 || position === indexes.length - 1 || (xForIndex(index) - padding.left >= 56 && width - padding.right - xForIndex(index) >= 56));
    const dates = dateIndexes.map((index, labelIndex) => {
      const anchor = labelIndex === 0 && firstDay !== lastDay
        ? "start"
        : labelIndex === dateIndexes.length - 1 && firstDay !== lastDay
          ? "end"
          : "middle";
      return `<text class="growth-inline-date" x="${xForIndex(index).toFixed(2)}" y="${height - padding.bottom + 28}" text-anchor="${anchor}">${escapeText(formatDate(entries[index].date))}</text>`;
    }).join("");

    const milestoneMarkers = milestones.map(({ label, day, date }, index) => {
      const x = xForDay(day);
      const labelX = Math.max(padding.left + 22, Math.min(width - padding.right - 22, x));
      const labelY = height - padding.bottom + 52 + (crowdedMilestones ? index * 24 : 0);
      return `<g class="growth-inline-milestone" data-milestone="${label}" data-date="${date}">
        <title>${label} · ${escapeText(formatDate(date, true))}</title>
        <line x1="${x.toFixed(2)}" y1="${padding.top}" x2="${x.toFixed(2)}" y2="${height - padding.bottom + 7}"></line>
        <rect x="${(labelX - 22).toFixed(2)}" y="${labelY - 15}" width="44" height="21" rx="10.5"></rect>
        <text x="${labelX.toFixed(2)}" y="${labelY}">${label}</text>
      </g>`;
    }).join("");

    return `
      <svg class="growth-inline-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="키·몸무게·머리둘레 성장 변화 그래프 · 왼쪽 cm, 오른쪽 kg${milestones.map(({ label, date }) => ` · ${label} ${formatDate(date, true)}`).join("")}">
        <text class="growth-inline-axis-unit" x="${padding.left}" y="12">cm</text>
        <text class="growth-inline-axis-unit" x="${width - padding.right}" y="12" text-anchor="end">kg</text>
        ${grid}
        <line class="growth-inline-baseline" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
        ${milestoneMarkers}
        <line class="growth-inline-crosshair" x1="${xForDay(dayNumber(selected.date)).toFixed(2)}" x2="${xForDay(dayNumber(selected.date)).toFixed(2)}" y1="${padding.top}" y2="${height - padding.bottom}"></line>
        ${series}
        ${dates}
      </svg>
    `;
  };

  const signatureFor = (entries) => {
    const baby = typeof activeBaby === "function" ? activeBaby() : null;
    return `${baby?.id || ""}:${baby?.birthDate || ""}|${entries.map((entry) => [entry.id, entry.date, entry.time || "", entry.height || "", entry.weight || "", entry.head || ""].join(":")).join("|")}`;
  };

  const renderInlineChart = () => {
    renderQueued = false;
    if (rendering) return;

    const entries = measurementEntries();
    const chartEntries = entries.slice(-90);
    const selected = chartEntries.find((entry) => String(entry.id) === selectedEntryId) || chartEntries.at(-1);
    selectedEntryId = selected ? String(selected.id) : "";
    const signature = `${selectedEntryId}|${signatureFor(entries)}`;
    if (insightRow.querySelector(".growth-inline-card") && signature === lastSignature) {
      pointFocusPending = "";
      return;
    }

    const restoreHistoryToggleFocus = historyToggleFocusPending;
    historyToggleFocusPending = false;
    rendering = true;
    lastSignature = signature;

    const babyName = typeof activeBaby === "function" ? activeBaby()?.name || "아기" : "아기";
    const latest = entries.at(-1) || null;

    if (!latest) {
      insightRow.innerHTML = `
        <article class="growth-inline-card growth-inline-empty">
          <div><p class="eyebrow">LATEST GROWTH</p><h3>${escapeText(babyName)}의 성장 기록</h3><span>첫 측정값을 기록하면 변화 그래프가 여기에 표시돼요.</span></div>
          <button type="button" data-growth-inline-action="add"><span aria-hidden="true">＋</span> 기록 추가</button>
        </article>
      `;
      rendering = false;
      return;
    }

    insightRow.innerHTML = `
      <article class="growth-inline-card">
        <header class="growth-inline-header">
          <div class="growth-inline-title">
            <p class="eyebrow">LATEST GROWTH</p>
            <h3>${escapeText(babyName)}의 최근 성장</h3>
          </div>
          <div class="growth-inline-meta">
            <time datetime="${escapeText(latest.date)}">${escapeText(formatDate(latest.date, true))}</time>
            <div class="growth-inline-actions" aria-label="성장 기록 관리">
              <button type="button" class="primary" data-growth-inline-action="add"><span aria-hidden="true">＋</span> 기록 추가</button>
            </div>
          </div>
        </header>
        <section class="growth-inline-chart" aria-label="성장 변화">
          <div class="growth-inline-inspector" aria-live="polite" aria-atomic="true">
            <div class="growth-inline-inspector-heading">
              <time datetime="${escapeText(selected.date)}${selected.time ? `T${escapeText(selected.time)}` : ""}">${escapeText(formatDate(selected.date, true))}${selected.time ? ` · ${escapeText(selected.time)}` : ""}</time>
              <button type="button" data-growth-inline-entry="${escapeText(selected.id)}">기록 수정</button>
            </div>
            <div class="growth-inline-readings">
              ${Object.entries(metrics).map(([key, metric]) => `<div style="--metric-color:${metric.color}"><span><i aria-hidden="true"></i>${metric.label}</span><strong>${escapeText(formatValue(selected[key], key, false))}<small>${numberValue(selected[key]) === null ? "" : metric.unit}</small></strong></div>`).join("")}
            </div>
          </div>
          ${chartSvg(chartEntries, selected)}
          <p>최근 90회 · 점을 눌러 측정값 확인<br>왼쪽 cm · 오른쪽 kg</p>
        </section>
        ${historyRows(entries)}
      </article>
    `;

    if (pointFocusPending) {
      insightRow.querySelector(`.growth-inline-point--${pointFocusPending}[aria-pressed="true"]`)?.focus({ preventScroll: true });
      pointFocusPending = "";
    }
    if (restoreHistoryToggleFocus) {
      insightRow.querySelector("[data-growth-inline-history-toggle]")?.focus({ preventScroll: true });
    }

    rendering = false;
  };

  const queueRender = () => {
    if (renderQueued || rendering) return;
    renderQueued = true;
    requestAnimationFrame(renderInlineChart);
  };

  const openEntry = (entryId) => {
    const entry = measurementEntries().find((item) => String(item.id) === String(entryId));
    if (entry && typeof openGrowthDialog === "function") openGrowthDialog(entry);
  };

  insightRow.addEventListener("click", (event) => {
    const chartPoint = event.target.closest("[data-growth-chart-entry]");
    if (chartPoint) {
      selectedEntryId = chartPoint.dataset.growthChartEntry;
      pointFocusPending = chartPoint.dataset.growthPointMetric;
      queueRender();
      return;
    }
    const historyToggle = event.target.closest("[data-growth-inline-history-toggle]");
    if (historyToggle) {
      historyExpanded = !historyExpanded;
      historyToggleFocusPending = true;
      lastSignature = "";
      queueRender();
      return;
    }

    const action = event.target.closest("[data-growth-inline-action]");
    if (action) {
      if (typeof openGrowthDialog !== "function") return;
      if (action.dataset.growthInlineAction === "add") openGrowthDialog(null, "성장");
      return;
    }

    const point = event.target.closest("[data-growth-inline-entry]");
    if (point) openEntry(point.dataset.growthInlineEntry);
  });

  insightRow.addEventListener("keydown", (event) => {
    const point = event.target.closest("[data-growth-chart-entry]");
    if (!point || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    selectedEntryId = point.dataset.growthChartEntry;
    pointFocusPending = point.dataset.growthPointMetric;
    queueRender();
  });

  new MutationObserver(queueRender).observe(insightRow, { childList: true, subtree: true });
  queueRender();
})();
