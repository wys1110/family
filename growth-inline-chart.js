(() => {
  const insightRow = document.querySelector("#growthInsightRow");
  if (!insightRow || document.documentElement.dataset.growthInlineChartBound === "true") return;

  document.documentElement.dataset.growthInlineChartBound = "true";

  const metrics = {
    height: { label: "키", unit: "cm", decimals: 1, color: "#d76586" },
    weight: { label: "몸무게", unit: "kg", decimals: 2, color: "#a86d8a" },
    head: { label: "머리둘레", unit: "cm", decimals: 1, color: "#ee8b56" },
  };

  let renderQueued = false;
  let rendering = false;
  let lastSignature = "";
  let historyExpanded = false;
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
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
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

  const chartSvg = (entries) => {
    const width = 420;
    const height = 252;
    const padding = { left: 43, right: 71, top: 25, bottom: 38 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const defaultRanges = {
      height: { min: 45, max: 65 },
      weight: { min: 2, max: 8 },
      head: { min: 32, max: 44 },
    };
    const fallbackMargins = { height: 2, weight: 0.5, head: 1.5 };
    const scales = Object.fromEntries(Object.keys(metrics).map((key) => [
      key,
      scaleBounds(
        entries.map((entry) => numberValue(entry[key])).filter((value) => value !== null),
        defaultRanges[key],
        fallbackMargins[key],
      ),
    ]));
    const xForIndex = (index) => entries.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (entries.length - 1)) * plotWidth;
    const yForValue = (value, metricKey) => {
      const scale = scales[metricKey];
      return padding.top + ((scale.max - value) / scale.range) * plotHeight;
    };

    const grid = [0, 1, 2, 3, 4].map((index) => {
      const ratio = index / 4;
      const y = padding.top + ratio * plotHeight;
      const heightValue = scales.height.max - ratio * scales.height.range;
      const weightValue = scales.weight.max - ratio * scales.weight.range;
      const headValue = scales.head.max - ratio * scales.head.range;
      return `
        <g class="growth-inline-grid">
          <line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}"></line>
          <text x="${padding.left - 8}" y="${(y + 3).toFixed(2)}" style="fill:${metrics.height.color}">${escapeText(heightValue.toLocaleString("ko-KR", { maximumFractionDigits: 1 }))}</text>
          <text class="weight-axis" x="${width - padding.right + 9}" y="${(y + 3).toFixed(2)}" style="fill:${metrics.weight.color}">${escapeText(weightValue.toLocaleString("ko-KR", { maximumFractionDigits: 2 }))}</text>
          <text class="head-axis" x="${width - 5}" y="${(y + 3).toFixed(2)}" style="fill:${metrics.head.color}">${escapeText(headValue.toLocaleString("ko-KR", { maximumFractionDigits: 1 }))}</text>
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
      const latestPoint = points.at(-1);
      const labelOffsets = { height: -12, weight: -12, head: 18 };
      const latestLabelY = Math.max(13, Math.min(height - padding.bottom - 5, latestPoint.y + labelOffsets[metricKey]));
      return `
        ${path ? `<path class="growth-inline-line growth-inline-line--${metricKey}" d="${path}" style="stroke:${metric.color}"></path>` : ""}
        ${points.map((point) => `
          <g class="growth-inline-point growth-inline-point--${metricKey}" data-growth-inline-entry="${escapeText(point.entry.id)}" role="button" tabindex="0" aria-label="${escapeText(formatDate(point.entry.date, true))} ${escapeText(metric.label)} ${escapeText(formatValue(point.value, metricKey))} 기록 수정">
            <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="5" style="stroke:${metric.color}"></circle>
            <circle class="growth-inline-hit" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="14"></circle>
          </g>
        `).join("")}
        <g class="growth-inline-latest-label" style="--metric-color:${metric.color}">
          <rect x="${Math.max(padding.left, Math.min(width - padding.right - 43, latestPoint.x - 21)).toFixed(2)}" y="${(latestLabelY - 12).toFixed(2)}" width="43" height="20" rx="10"></rect>
          <text x="${Math.max(padding.left + 21.5, Math.min(width - padding.right - 21.5, latestPoint.x)).toFixed(2)}" y="${(latestLabelY + 2).toFixed(2)}">${escapeText(formatValue(latestPoint.value, metricKey, false))}</text>
        </g>
      `;
    }).join("");

    const labelIndexes = entries.length === 1
      ? [0]
      : [...new Set([0, Math.round((entries.length - 1) / 2), entries.length - 1])];
    const dates = labelIndexes.map((index, labelIndex) => {
      const anchor = labelIndex === 0 && entries.length > 1
        ? "start"
        : labelIndex === labelIndexes.length - 1 && entries.length > 1
          ? "end"
          : "middle";
      return `<text class="growth-inline-date" x="${xForIndex(index).toFixed(2)}" y="${height - 10}" text-anchor="${anchor}">${escapeText(formatDate(entries[index].date))}</text>`;
    }).join("");

    return `
      <svg class="growth-inline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="키, 몸무게, 머리둘레 성장 변화 그래프">
        ${grid}
        <line class="growth-inline-baseline" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
        ${series}
        ${dates}
      </svg>
    `;
  };

  const signatureFor = (entries) => {
    const babyId = typeof activeBaby === "function" ? activeBaby()?.id || "" : "";
    return `${babyId}|${entries.map((entry) => [entry.id, entry.date, entry.time || "", entry.height || "", entry.weight || "", entry.head || ""].join(":")).join("|")}`;
  };

  const renderInlineChart = () => {
    renderQueued = false;
    if (rendering) return;

    const entries = measurementEntries();
    const signature = signatureFor(entries);
    if (insightRow.querySelector(".growth-inline-card") && signature === lastSignature) return;

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
            <time datetime="${escapeText(latest.date)}">${escapeText(formatDate(latest.date, true))}</time>
          </div>
          <div class="growth-inline-actions" aria-label="성장 기록 관리">
            <button type="button" class="primary" data-growth-inline-action="add"><span aria-hidden="true">＋</span> 기록 추가</button>
          </div>
        </header>
        <section class="growth-inline-chart" aria-label="성장 변화">
          <div class="growth-inline-legend" aria-hidden="true">
            ${Object.entries(metrics).map(([key, metric]) => `<span style="--metric-color:${metric.color}"><i></i>${escapeText(metric.label)} <small>(${escapeText(metric.unit)})</small></span>`).join("")}
          </div>
          ${chartSvg(entries)}
          <p>그래프의 점을 누르면 해당 날짜의 기록을 바로 수정할 수 있어요.</p>
        </section>
        ${historyRows(entries)}
      </article>
    `;

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
    const point = event.target.closest("[data-growth-inline-entry]");
    if (!point || point.matches("button") || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openEntry(point.dataset.growthInlineEntry);
  });

  new MutationObserver(queueRender).observe(insightRow, { childList: true, subtree: true });
  queueRender();
})();
