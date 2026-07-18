(() => {
  if (document.documentElement.dataset.growthChartPolishBound === "true") return;
  document.documentElement.dataset.growthChartPolishBound = "true";

  const metricColors = {
    height: "#c86280",
    weight: "#3d78bd",
    head: "#62a852",
  };

  let frameRequested = false;

  const requestEnhance = () => {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      enhanceChartDialog();
    });
  };

  const addInlineLegend = (card, svg) => {
    if (card.querySelector(".growth-chart-inline-legend")) return;
    const legend = document.createElement("div");
    legend.className = "growth-chart-inline-legend";
    legend.setAttribute("aria-hidden", "true");
    legend.innerHTML = `
      <span><i style="--metric-color:${metricColors.height}"></i>키 <small>(cm)</small></span>
      <span><i style="--metric-color:${metricColors.weight}"></i>몸무게 <small>(kg)</small></span>
      <span><i style="--metric-color:${metricColors.head}"></i>머리둘레 <small>(cm)</small></span>
    `;
    card.insertBefore(legend, svg);
  };

  const metricFromStroke = (stroke = "") => {
    const normalized = stroke.toLowerCase().replace(/\s/g, "");
    return Object.entries(metricColors).find(([, color]) => normalized.includes(color.toLowerCase()))?.[0] || "";
  };

  const classifySeries = (svg) => {
    svg.querySelectorAll(".growth-chart-point").forEach((group) => {
      const circle = group.querySelector("circle");
      if (!circle) return;
      const metric = metricFromStroke(circle.getAttribute("style") || circle.style.stroke || "");
      if (metric) group.classList.add(`growth-chart-point--${metric}`);
    });

    svg.querySelectorAll(".growth-chart-line").forEach((line) => {
      const metric = metricFromStroke(line.getAttribute("style") || line.style.stroke || "");
      if (metric) line.classList.add(`growth-chart-line--${metric}`);
    });
  };

  const addWeightArea = (svg) => {
    if (svg.querySelector(".growth-chart-weight-area")) return;
    const weightLine = svg.querySelector(".growth-chart-line--weight")
      || [...svg.querySelectorAll(".growth-chart-line")].find((line) => metricFromStroke(line.getAttribute("style") || "") === "weight");
    if (!weightLine || typeof weightLine.getTotalLength !== "function") return;

    const length = weightLine.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return;
    const start = weightLine.getPointAtLength(0);
    const end = weightLine.getPointAtLength(length);
    const baseline = 198;

    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.prepend(defs);
    }
    if (!defs.querySelector("#growthWeightAreaGradientPolish")) {
      const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      gradient.id = "growthWeightAreaGradientPolish";
      gradient.setAttribute("x1", "0");
      gradient.setAttribute("y1", "0");
      gradient.setAttribute("x2", "0");
      gradient.setAttribute("y2", "1");
      gradient.innerHTML = `
        <stop offset="0%" stop-color="${metricColors.weight}" stop-opacity=".18"></stop>
        <stop offset="72%" stop-color="${metricColors.weight}" stop-opacity=".045"></stop>
        <stop offset="100%" stop-color="${metricColors.weight}" stop-opacity="0"></stop>
      `;
      defs.appendChild(gradient);
    }

    const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
    area.classList.add("growth-chart-weight-area");
    area.setAttribute(
      "d",
      `${weightLine.getAttribute("d")} L ${end.x.toFixed(2)} ${baseline} L ${start.x.toFixed(2)} ${baseline} Z`,
    );
    weightLine.parentNode.insertBefore(area, weightLine);
  };

  const addBaseline = (svg) => {
    if (svg.querySelector(".growth-chart-axis-baseline")) return;
    const baseline = document.createElementNS("http://www.w3.org/2000/svg", "line");
    baseline.classList.add("growth-chart-axis-baseline");
    baseline.setAttribute("x1", "42");
    baseline.setAttribute("x2", "318");
    baseline.setAttribute("y1", "198");
    baseline.setAttribute("y2", "198");
    const firstDate = svg.querySelector(".growth-chart-date-label");
    svg.insertBefore(baseline, firstDate || null);
  };

  const enhanceChartDialog = () => {
    const dialog = document.querySelector("#growthChartDialog");
    if (!dialog) return;
    dialog.classList.add("growth-chart-polished");

    const card = dialog.querySelector(".growth-chart-card");
    const svg = card?.querySelector(".growth-chart-svg");
    if (!card || !svg) return;

    addInlineLegend(card, svg);
    classifySeries(svg);
    addWeightArea(svg);
    addBaseline(svg);
  };

  new MutationObserver(requestEnhance).observe(document.body, {
    childList: true,
    subtree: true,
  });

  requestEnhance();
})();
