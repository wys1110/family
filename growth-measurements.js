(() => {
  const insightRow = document.querySelector("#growthInsightRow");
  if (!insightRow || document.documentElement.dataset.growthMeasurementsBound === "true") return;

  document.documentElement.dataset.growthMeasurementsBound = "true";

  const metrics = {
    height: { label: "키", unit: "cm", decimals: 1 },
    weight: { label: "몸무게", unit: "kg", decimals: 2 },
    head: { label: "머리둘레", unit: "cm", decimals: 1 },
  };

  let activeMetric = "weight";
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
    return includeYear ? `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}` : `${month}.${day}`;
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

    [...insightRow.children].filter((element) => element.matches("article") && !element.classList.contains("growth-insight-empty")).forEach((card) => {
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
        <div class="growth-chart-tabs" role="tablist" aria-label="성장 항목 선택"></div>
        <section class="growth-chart-card" aria-live="polite"></section>
        <p class="growth-chart-note">우리 아기의 측정값을 이어 본 개인 추세선이에요. 의료 성장곡선이나 백분위 기준과는 다릅니다.</p>
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
    chartDialog.querySelector(".growth-chart-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-growth-chart-metric]");
      if (!button || button.disabled) return;
      activeMetric = button.dataset.growthChartMetric;
      renderChartDialog();
    });
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

  const chartSvg = (items, metricKey) => {
    const metric = metrics[metricKey];
    const width = 360;
    const height = 220;
    const padding = { left: 44, right: 18, top: 24, bottom: 38 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const values = items.map((item) => item.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const difference = rawMax - rawMin;
    const fallback = metricKey === "weight" ? 0.5 : 2;
    const margin = difference ? difference * 0.18 : fallback;
    const min = Math.max(0, rawMin - margin);
    const max = rawMax + margin;
    const range = Math.max(max - min, 0.01);
    const points = items.map((item, index) => ({
      ...item,
      x: items.length === 1 ? padding.left + plotWidth / 2 : padding.left + (index / (items.length - 1)) * plotWidth,
      y: padding.top + ((max - item.value) / range) * plotHeight,
    }));
    const curve = smoothPath(points);
    const baseline = padding.top + plotHeight;
    const area = curve ? `${curve} L ${points.at(-1).x.toFixed(2)} ${baseline} L ${points[0].x.toFixed(2)} ${baseline} Z` : "";
    const grid = [0, 1, 2, 3].map((index) => {
      const ratio = index / 3;
      const y = padding.top + ratio * plotHeight;
      const value = max - ratio * range;
      return `<g class="growth-chart-grid"><line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}"></line><text x="${padding.left - 8}" y="${(y + 4).toFixed(2)}">${escapeText(formatValue(value, metricKey, false))}</text></g>`;
    }).join("");
    const pointMarkup = points.map((point, index) => {
      const showLabel = points.length <= 5 || index === 0 || index === points.length - 1;
      return `<g class="growth-chart-point"><circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="5"></circle>${showLabel ? `<text x="${point.x.toFixed(2)}" y="${Math.max(13, point.y - 12).toFixed(2)}">${escapeText(formatValue(point.value, metricKey, false))}</text>` : ""}</g>`;
    }).join("");
    const dateLabels = points.length === 1
      ? `<text class="growth-chart-date-label" x="${points[0].x.toFixed(2)}" y="${height - 10}">${escapeText(formatDate(points[0].entry.date))}</text>`
      : `<text class="growth-chart-date-label start" x="${padding.left}" y="${height - 10}">${escapeText(formatDate(points[0].entry.date))}</text><text class="growth-chart-date-label end" x="${width - padding.right}" y="${height - 10}">${escapeText(formatDate(points.at(-1).entry.date))}</text>`;

    return `
      <svg class="growth-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeText(metric.label)} 측정 변화 그래프">
        <defs><linearGradient id="growthCurveArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-opacity=".24"></stop><stop offset="100%" stop-opacity="0"></stop></linearGradient></defs>
        ${grid}
        ${area ? `<path class="growth-chart-area" d="${area}"></path>` : ""}
        ${curve ? `<path class="growth-chart-line" d="${curve}"></path>` : ""}
        ${pointMarkup}
        ${dateLabels}
      </svg>
    `;
  };

  const renderChartDialog = () => {
    const dialog = ensureChartDialog();
    const entries = measurementEntries();
    const availableMetrics = Object.keys(metrics).filter((metricKey) => entries.some((entry) => numberValue(entry[metricKey]) !== null));
    if (!availableMetrics.includes(activeMetric)) activeMetric = availableMetrics[0] || "weight";

    dialog.querySelector("#growthChartTitle").textContent = `${typeof activeBaby === "function" && activeBaby() ? activeBaby().name : "아기"} 성장 곡선`;
    dialog.querySelector(".growth-chart-tabs").innerHTML = Object.entries(metrics).map(([key, metric]) => {
      const count = entries.filter((entry) => numberValue(entry[key]) !== null).length;
      return `<button type="button" role="tab" data-growth-chart-metric="${key}" class="${key === activeMetric ? "active" : ""}" aria-selected="${key === activeMetric}" ${count ? "" : "disabled"}>${metric.label}<small>${count}</small></button>`;
    }).join("");

    const items = entries.map((entry) => ({ entry, value: numberValue(entry[activeMetric]) })).filter((item) => item.value !== null);
    const chartCard = dialog.querySelector(".growth-chart-card");
    if (!items.length) {
      chartCard.innerHTML = `<div class="growth-chart-empty"><strong>아직 ${escapeText(metrics[activeMetric].label)} 기록이 없어요</strong><span>새 성장 기록을 추가하면 곡선으로 이어서 볼 수 있어요.</span><button type="button" data-empty-growth-add>기록 추가</button></div>`;
      chartCard.querySelector("[data-empty-growth-add]").addEventListener("click", addGrowthEntry);
    } else {
      const first = items[0];
      const latest = items.at(-1);
      const delta = latest.value - first.value;
      const deltaText = items.length < 2 ? "첫 측정" : `${delta > 0 ? "+" : ""}${formatValue(delta, activeMetric)} 변화`;
      chartCard.innerHTML = `
        <div class="growth-chart-summary">
          <div><span>최근 ${escapeText(metrics[activeMetric].label)}</span><strong>${escapeText(formatValue(latest.value, activeMetric))}</strong></div>
          <div><span>${items.length}회 측정</span><strong class="${delta < 0 ? "down" : ""}">${escapeText(deltaText)}</strong></div>
        </div>
        ${chartSvg(items, activeMetric)}
        <p>${items.length < 2 ? "측정 기록이 2개 이상 쌓이면 변화 곡선이 나타나요." : `${escapeText(formatDate(first.entry.date, true))}부터 ${escapeText(formatDate(latest.entry.date, true))}까지의 측정값을 부드럽게 연결했어요.`}</p>
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
