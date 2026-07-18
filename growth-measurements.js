(() => {
  const insightRow = document.querySelector("#growthInsightRow");
  if (!insightRow || document.documentElement.dataset.growthMeasurementsBound === "true") return;

  document.documentElement.dataset.growthMeasurementsBound = "true";

  const metrics = {
    height: { label: "키", unit: "cm", decimals: 1, color: "#b46b7c", axis: "cm" },
    weight: { label: "몸무게", unit: "kg", decimals: 2, color: "#547fb8", axis: "kg" },
    head: { label: "머리둘레", unit: "cm", decimals: 1, color: "#6da45c", axis: "cm" },
  };

  let chartDialog = null;
  let enhanceQueued = false;

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

  const latestMeasurement = () => measurementEntries().at(-1) || null;

  const escapeText = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);

  const formatValue = (value, metricKey, withUnit = true) => {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    const metric = metrics[metricKey];
    const text = number.toLocaleString("ko-KR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: metric.decimals,
    });
    return withUnit ? `${text}${metric.unit}` : text;
  };

  const formatDate = (value, includeYear = false) => {
    if (!value) return "";
    const [year, month, day] = value.split("-").map(Number);
    return includeYear
      ? `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`
      : `${month}.${day}`;
  };

  const openGrowthEntry = (entry) => {
    if (!entry || typeof openGrowthDialog !== "function") return;
    chartDialog?.close();
    openGrowthDialog(entry);
  };

  const addGrowthEntry = () => {
    if (typeof openGrowthDialog !== "function") return;
    chartDialog?.close();
    openGrowthDialog(null, "성장");
  };

  const enhanceLatestGrowth = () => {
    enhanceQueued = false;
    const latest = latestMeasurement();
    const titleCard = insightRow.querySelector(".insight-title");

    insightRow.classList.toggle("growth-measurements-ready", Boolean(latest));
    if (!latest || !titleCard) return;

    titleCard.classList.add("latest-growth-title-card");
    if (!titleCard.querySelector(".latest-growth-actions")) {
      const actions = document.createElement("div");
      actions.className = "latest-growth-actions";
      actions.innerHTML = `
        <button type="button" data-growth-measure-action="add"><span aria-hidden="true">＋</span> 기록</button>
        <button type="button" data-growth-measure-action="edit">최근 기록 수정</button>
        <button type="button" class="primary" data-growth-measure-action="chart">곡선 보기 <span aria-hidden="true">⌁</span></button>
      `;
      titleCard.appendChild(actions);
    }

    [...insightRow.children]
      .filter((element) => element.matches("article") && !element.classList.contains("growth-insight-empty"))
      .forEach((card) => {
        card.classList.add("latest-growth-metric-card");
        card.dataset.latestGrowthEdit = "true";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", "최근 성장 측정 기록 수정");
      });
  };

  const queueEnhancement = () => {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(enhanceLatestGrowth);
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

  const scaleBounds = (values, fallbackMargin) => {
    if (!values.length) return { min: 0, max: 1, range: 1 };
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const difference = rawMax - rawMin;
    const margin = difference ? Math.max(difference * 0.18, fallbackMargin * 0.35) : fallbackMargin;
    const min = Math.max(0, rawMin - margin);
    const max = rawMax + margin;
    return { min, max, range: Math.max(max - min, 0.01) };
  };

  const ensureChartDialog = () => {
    if (chartDialog) return chartDialog;

    chartDialog = document.createElement("dialog");
    chartDialog.id = "growthChartDialog";
    chartDialog.className = "sheet-dialog growth-chart-dialog";
    chartDialog.setAttribute("aria-labelledby", "growthChartTitle");
    chartDialog.innerHTML = `
      <div class="sheet-panel">
        <div class="sheet-handle"></div>
        <div class="dialog-header">
          <div><p class="eyebrow">GROWTH CURVE</p><h2 id="growthChartTitle">성장 곡선</h2></div>
          <button type="button" class="close-button" data-growth-chart-close aria-label="닫기">×</button>
        </div>
        <div class="growth-chart-tabs" role="list" aria-label="성장 항목 범례"></div>
        <section class="growth-chart-card" aria-live="polite"></section>
        <p class="growth-chart-note">키·몸무게·머리둘레를 한 그래프에서 비교한 개인 추세선이에요. 의료 성장곡선이나 백분위 기준과는 다릅니다.</p>
        <section class="growth-measure-history" aria-labelledby="growthMeasureHistoryTitle">
          <div class="growth-measure-history-heading">
            <div><p class="eyebrow">MEASUREMENT HISTORY</p><h3 id="growthMeasureHistoryTitle">측정 기록</h3></div>
            <button type="button" data-growth-chart-add><span aria-hidden="true">＋</span> 새 기록</button>
          </div>
          <div class="growth-measure-history-list"></div>
        </section>
      </div>
    `;
    document.body.appendChild(chartDialog);

    chartDialog.querySelector("[data-growth-chart-close]").addEventListener("click", () => chartDialog.close());
    chartDialog.querySelector("[data-growth-chart-add]").addEventListener("click", addGrowthEntry);
    chartDialog.querySelector(".growth-measure-history-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-growth-measure-entry]");
      if (!button) return;
      const entry = measurementEntries().find((item) => String(item.id) === button.dataset.growthMeasureEntry);
      openGrowthEntry(entry);
    });
    chartDialog.addEventListener("click", (event) => {
      if (event.target === chartDialog) chartDialog.close();
    });

    return chartDialog;
  };

  const chartSvg = (entries) => {
    const width = 360;
    const height = 238;
    const padding = { left: 42, right: 42, top: 31, bottom: 40 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const cmValues = entries.flatMap((entry) => ["height", "head"]
      .map((key) => numberValue(entry[key]))
      .filter((value) => value !== null));
    const kgValues = entries
      .map((entry) => numberValue(entry.weight))
      .filter((value) => value !== null);
    const cmScale = scaleBounds(cmValues, 2);
    const kgScale = scaleBounds(kgValues, 0.5);
    const xForIndex = (index) => entries.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (entries.length - 1)) * plotWidth;
    const yForValue = (value, axis) => {
      const scale = axis === "kg" ? kgScale : cmScale;
      return padding.top + ((scale.max - value) / scale.range) * plotHeight;
    };

    const grid = [0, 1, 2, 3].map((index) => {
      const ratio = index / 3;
      const y = padding.top + ratio * plotHeight;
      const cmValue = cmScale.max - ratio * cmScale.range;
      const kgValue = kgScale.max - ratio * kgScale.range;
      return `
        <g class="growth-chart-grid">
          <line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}"></line>
          <text x="${padding.left - 8}" y="${(y + 3).toFixed(2)}">${escapeText(cmValue.toLocaleString("ko-KR", { maximumFractionDigits: 1 }))}</text>
          <text x="${width - padding.right + 8}" y="${(y + 3).toFixed(2)}" style="text-anchor:start; fill:${metrics.weight.color}">${escapeText(kgValue.toLocaleString("ko-KR", { maximumFractionDigits: 2 }))}</text>
        </g>
      `;
    }).join("");

    const seriesMarkup = Object.entries(metrics).map(([metricKey, metric]) => {
      const points = entries.map((entry, entryIndex) => {
        const value = numberValue(entry[metricKey]);
        if (value === null) return null;
        return {
          entry,
          entryIndex,
          value,
          x: xForIndex(entryIndex),
          y: yForValue(value, metric.axis),
        };
      }).filter(Boolean);
      if (!points.length) return "";

      const curve = smoothPath(points);
      const labelOffset = metricKey === "head" ? 17 : -11;
      const pointMarkup = points.map((point, pointIndex) => {
        const showLabel = points.length <= 4 || pointIndex === 0 || pointIndex === points.length - 1;
        const labelY = Math.min(height - padding.bottom - 4, Math.max(13, point.y + labelOffset));
        return `
          <g class="growth-chart-point">
            <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.5" style="stroke:${metric.color}"></circle>
            ${showLabel ? `<text x="${point.x.toFixed(2)}" y="${labelY.toFixed(2)}" style="fill:${metric.color}">${escapeText(formatValue(point.value, metricKey, false))}</text>` : ""}
          </g>
        `;
      }).join("");

      return `
        ${curve ? `<path class="growth-chart-line" d="${curve}" style="stroke:${metric.color}; stroke-width:3; filter:drop-shadow(0 3px 4px color-mix(in srgb, ${metric.color} 18%, transparent))"></path>` : ""}
        ${pointMarkup}
      `;
    }).join("");

    const labelIndexes = entries.length === 1
      ? [0]
      : [...new Set([0, Math.round((entries.length - 1) / 2), entries.length - 1])];
    const dateLabels = labelIndexes.map((index, labelIndex) => {
      const anchorClass = labelIndex === 0 && entries.length > 1
        ? " start"
        : labelIndex === labelIndexes.length - 1 && entries.length > 1
          ? " end"
          : "";
      return `<text class="growth-chart-date-label${anchorClass}" x="${xForIndex(index).toFixed(2)}" y="${height - 10}">${escapeText(formatDate(entries[index].date))}</text>`;
    }).join("");

    return `
      <svg class="growth-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="키, 몸무게, 머리둘레 통합 성장 변화 그래프">
        <text x="${padding.left}" y="14" style="fill:${metrics.height.color}; font-size:8px; font-weight:760">cm</text>
        <text x="${width - padding.right}" y="14" style="fill:${metrics.weight.color}; font-size:8px; font-weight:760; text-anchor:end">kg</text>
        ${grid}
        ${seriesMarkup}
        ${dateLabels}
      </svg>
    `;
  };

  const renderChartDialog = () => {
    const dialog = ensureChartDialog();
    const entries = measurementEntries();
    const latest = entries.at(-1) || null;

    dialog.querySelector("#growthChartTitle").textContent = `${typeof activeBaby === "function" && activeBaby() ? activeBaby().name : "아기"} 성장 곡선`;
    dialog.querySelector(".growth-chart-tabs").innerHTML = Object.entries(metrics).map(([key, metric]) => {
      const count = entries.filter((entry) => numberValue(entry[key]) !== null).length;
      return `
        <button type="button" class="active" role="listitem" tabindex="-1" aria-label="${escapeText(metric.label)} ${count}개 기록" style="${count ? "" : "opacity:.38"}">
          <span aria-hidden="true" style="color:${metric.color}; font-size:10px">●</span>
          ${escapeText(metric.label)}
          <small>${count}</small>
        </button>
      `;
    }).join("");

    const chartCard = dialog.querySelector(".growth-chart-card");
    if (!entries.length || !latest) {
      chartCard.innerHTML = `<div class="growth-chart-empty"><strong>아직 성장 측정 기록이 없어요</strong><span>키·몸무게·머리둘레를 기록하면 한 그래프에서 함께 볼 수 있어요.</span><button type="button" data-empty-growth-add>기록 추가</button></div>`;
      chartCard.querySelector("[data-empty-growth-add]").addEventListener("click", addGrowthEntry);
    } else {
      const latestValues = Object.keys(metrics)
        .map((key) => formatValue(latest[key], key))
        .join(" · ");
      chartCard.innerHTML = `
        <div class="growth-chart-summary">
          <div><span>최근 측정값</span><strong>${escapeText(latestValues)}</strong></div>
          <div><span>전체 측정</span><strong>${entries.length < 2 ? "첫 측정" : `${entries.length}회 기록`}</strong></div>
        </div>
        ${chartSvg(entries)}
        <p>${entries.length < 2 ? "측정 기록이 2개 이상 쌓이면 세 항목의 변화 곡선이 나타나요." : `${escapeText(formatDate(entries[0].date, true))}부터 ${escapeText(formatDate(latest.date, true))}까지의 세 측정값을 함께 표시했어요.`}</p>
      `;
    }

    const historyList = dialog.querySelector(".growth-measure-history-list");
    historyList.innerHTML = entries.length ? [...entries].reverse().map((entry) => `
      <button type="button" data-growth-measure-entry="${escapeText(entry.id)}">
        <time datetime="${escapeText(entry.date)}">${escapeText(formatDate(entry.date, true))}${entry.time ? `<small>${escapeText(entry.time)}</small>` : ""}</time>
        <span>
          <b>${escapeText(formatValue(entry.height, "height"))}</b>
          <b>${escapeText(formatValue(entry.weight, "weight"))}</b>
          <b>${escapeText(formatValue(entry.head, "head"))}</b>
        </span>
        <i>수정</i>
      </button>
    `).join("") : `<div class="growth-measure-history-empty">아직 측정 기록이 없어요.</div>`;
  };

  const openChart = () => {
    const dialog = ensureChartDialog();
    renderChartDialog();
    if (!dialog.open) dialog.showModal();
  };

  insightRow.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-growth-measure-action]");
    if (actionButton) {
      const action = actionButton.dataset.growthMeasureAction;
      if (action === "add") addGrowthEntry();
      if (action === "edit") openGrowthEntry(latestMeasurement());
      if (action === "chart") openChart();
      return;
    }
    const metricCard = event.target.closest("[data-latest-growth-edit]");
    if (metricCard) openGrowthEntry(latestMeasurement());
  });

  insightRow.addEventListener("keydown", (event) => {
    const metricCard = event.target.closest("[data-latest-growth-edit]");
    if (!metricCard || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openGrowthEntry(latestMeasurement());
  });

  new MutationObserver(queueEnhancement).observe(insightRow, { childList: true, subtree: true });
  queueEnhancement();
})();
