import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const script = readFileSync("growth-inline-chart.js", "utf8");
const css = readFileSync("growth-inline-chart.css", "utf8");
const visual = readFileSync("growth-inline-visual-polish.css", "utf8");
const polish = readFileSync("growth-edit-sheet-polish.css", "utf8");
const index = readFileSync("index.html", "utf8");
const config = readFileSync("config.js", "utf8");

const entry = (id, day) => ({
  id,
  date: `2026-07-${String(day).padStart(2, "0")}`,
  time: `${String(8 + day).padStart(2, "0")}:00`,
  height: 50 + day,
  weight: 3 + day / 10,
  head: 34 + day / 10,
});

function createHarness(entries, initialBaby = { id: "baby-1", name: "아기", birthDate: "2026-01-01" }) {
  const listeners = {};
  const frames = [];
  const dialogCalls = [];
  let markup = "";
  let baby = initialBaby;
  let focusCalls = 0;
  let mutationCallback = null;

  const insightRow = {
    addEventListener(type, listener) { listeners[type] = listener; },
    querySelector(selector) {
      if (selector === ".growth-inline-card") return markup.includes("growth-inline-card") ? {} : null;
      if (selector.startsWith(".growth-inline-point--")) return { focus: () => { focusCalls += 1; } };
      if (selector === "[data-growth-inline-history-toggle]") {
        return markup.includes("data-growth-inline-history-toggle")
          ? { focus: () => { focusCalls += 1; } }
          : null;
      }
      return null;
    },
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = value; },
  };

  const context = {
    activeBaby: () => baby,
    activeBabyEntries: () => entries,
    document: {
      documentElement: { dataset: {} },
      querySelector: (selector) => selector === "#growthInsightRow" ? insightRow : null,
    },
    MutationObserver: class {
      constructor(callback) { mutationCallback = callback; }
      observe() {}
    },
    openGrowthDialog: (...args) => dialogCalls.push(args),
    requestAnimationFrame: (callback) => { frames.push(callback); },
  };

  vm.runInNewContext(script, context);

  const flushFrame = () => {
    const frame = frames.shift();
    expect(frame).toBeTypeOf("function");
    frame();
  };
  const click = (kind, id = "") => listeners.click({
    target: {
      closest(selector) {
        if (kind === "point" && selector === "[data-growth-chart-entry]") return { dataset: { growthChartEntry: id, growthPointMetric: "weight" } };
        if (kind === "toggle" && selector === "[data-growth-inline-history-toggle]") return {};
        if (kind === "entry" && selector === "[data-growth-inline-entry]") {
          return { dataset: { growthInlineEntry: id } };
        }
        return null;
      },
    },
  });

  flushFrame();

  return {
    click,
    keyPoint: (id, key) => listeners.keydown({ key, preventDefault() {}, target: { closest: () => ({ dataset: { growthChartEntry: id, growthPointMetric: "weight" } }) } }),
    dialogCalls,
    entries,
    setBaby: (nextBaby) => { baby = nextBaby; },
    flushFrame,
    focusCalls: () => focusCalls,
    historyIds: () => [...markup.matchAll(/class="growth-inline-history-row"\s+data-growth-inline-entry="([^"]+)"/g)]
      .map((match) => match[1]),
    markup: () => markup,
    triggerMutation: () => mutationCallback(),
  };
}

const datedEntry = (id, date, weight = 4) => ({ id, date, time: "08:00", weight, height: 55, head: 36 });
const markers = (markup) => [...markup.matchAll(/<g class="growth-inline-milestone" data-milestone="([^"]+)" data-date="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)]
  .map(([, label, date, body]) => ({ label, date, body }));
const pointX = (markup, id) => Number(markup.match(new RegExp(`<g class="growth-inline-point[^>]*data-growth-chart-entry="${id}"[^>]*>[\\s\\S]*?<circle cx="([^"]+)"`))?.[1]);

describe("inline growth measurement history", () => {
  test("places measurements and visible milestones on an elapsed-date scale", () => {
    const harness = createHarness([
      datedEntry("early", "2025-03-30"),
      datedEntry("middle", "2025-04-20"),
      datedEntry("late", "2026-01-10"),
    ], { id: "baby-1", name: "아기", birthDate: "2025-01-01" });
    const markup = harness.markup();
    const points = [pointX(markup, "early"), pointX(markup, "middle"), pointX(markup, "late")];
    const [hundred, birthday] = markers(markup);

    expect((points[1] - points[0]) / (points[2] - points[0])).toBeCloseTo(21 / 286, 2);
    expect([hundred.label, hundred.date]).toEqual(["100일", "2025-04-10"]);
    expect([birthday.label, birthday.date]).toEqual(["돌", "2026-01-01"]);
    expect(Number(hundred.body.match(/<line[^>]*x1="([^"]+)"/)?.[1])).toBeCloseTo(points[0] + (points[2] - points[0]) * (11 / 286), 1);
    expect(hundred.body).toMatch(/<line[^>]*x1="([^"]+)"[^>]*x2="\1"/);
    expect(hundred.body).toContain("100일");
  });

  test("does not extend the chart to future milestones and ignores a missing birth date", () => {
    const future = createHarness([datedEntry("now", "2025-02-01")], { id: "baby-1", name: "아기", birthDate: "2025-01-01" });
    expect(markers(future.markup())).toHaveLength(0);
    const unknown = createHarness([datedEntry("now", "2025-04-01")], { id: "baby-1", name: "아기" });
    expect(markers(unknown.markup())).toHaveLength(0);
  });

  test("rerenders when birth date changes and clamps leap-day birthdays", () => {
    const leap = createHarness([datedEntry("a", "2025-02-27"), datedEntry("b", "2025-03-01")], { id: "baby-1", name: "아기", birthDate: "2024-02-29" });
    expect(markers(leap.markup()).map(({ label, date }) => [label, date])).toContainEqual(["돌", "2025-02-28"]);

    const harness = createHarness([datedEntry("a", "2025-02-27"), datedEntry("b", "2025-04-11")], { id: "baby-1", name: "아기", birthDate: "2025-01-01" });
    expect(markers(harness.markup()).map(({ label, date }) => [label, date])).toContainEqual(["100일", "2025-04-10"]);
    harness.setBaby({ id: "baby-1", name: "아기", birthDate: "2025-01-02" });
    harness.triggerMutation();
    harness.flushFrame();
    expect(markers(harness.markup()).map(({ label, date }) => [label, date])).toContainEqual(["100일", "2025-04-11"]);
    expect(markers(harness.markup()).map(({ label }) => label)).not.toContain("돌");
  });

  test("keeps single-day and duplicate-date chart coordinates finite", () => {
    for (const entries of [
      [datedEntry("one", "2025-04-10")],
      [datedEntry("a", "2025-04-10"), datedEntry("b", "2025-04-10")],
    ]) {
      const markup = createHarness(entries, { id: "baby-1", name: "아기", birthDate: "2025-01-01" }).markup();
      expect([...markup.matchAll(/(?:cx|cy|x1|x2|y1|y2)="([^"]+)"/g)].every(([, value]) => Number.isFinite(Number(value)))).toBe(true);
      expect(markers(markup).map(({ label }) => label)).toEqual(["100일"]);
    }
  });

  test("keeps curve control points within each date interval and culls clustered inner dates", () => {
    const entries = ["2025-01-01", "2025-01-02", "2025-01-03", "2025-12-31"].map((date, index) => datedEntry(`e${index}`, date, 4 + index));
    const markup = createHarness(entries).markup();
    const xs = entries.map(({ id }) => pointX(markup, id));
    const path = markup.match(/class="growth-inline-line[^>]*d="([^"]+)"/)[1];
    const segments = [...path.matchAll(/C ([\d.-]+) [\d.-]+, ([\d.-]+) [\d.-]+, ([\d.-]+) [\d.-]+/g)];
    expect(segments).toHaveLength(entries.length - 1);
    segments.forEach((segment, index) => {
      for (const x of segment.slice(1).map(Number)) {
        expect(x).toBeGreaterThanOrEqual(xs[index]);
        expect(x).toBeLessThanOrEqual(xs[index + 1]);
      }
    });
    expect(markup).not.toMatch(/class="growth-inline-date"[^>]*>1\.3<\/text>/);
  });

  test("separates close milestone labels and includes their dates in the accessible chart name", () => {
    const markup = createHarness([datedEntry("start", "2020-01-01"), datedEntry("end", "2026-01-01")], { id: "baby-1", name: "아기", birthDate: "2020-01-01" }).markup();
    const milestoneLabels = markers(markup);
    expect(milestoneLabels).toHaveLength(2);
    const rows = milestoneLabels.map(({ body }) => Number(body.match(/<text[^>]*y="([^"]+)"/)[1]));
    expect(rows[1]).toBeGreaterThan(rows[0]);
    expect(markup).toContain('aria-label="키·몸무게·머리둘레 성장 변화 그래프 · 왼쪽 cm, 오른쪽 kg · 100일 2020.04.09 · 돌 2021.01.01"');
  });

  test("shows all three lines, a shared cm scale, and a separate kg scale", () => {
    const markup = createHarness([datedEntry("a", "2026-07-01"), { ...datedEntry("b", "2026-08-01", 6), height: 60, head: 40 }]).markup();
    for (const key of ["height", "weight", "head"]) expect(markup).toContain(`growth-inline-line--${key}`);
    expect(markup).not.toContain("growth-metric-tabs");
    expect(markup).toContain('class="weight-axis"');
    expect(markup).toContain("왼쪽 cm, 오른쪽 kg");
    const y = (key) => Number(markup.match(new RegExp(`growth-inline-point--${key}[^>]*data-growth-chart-entry="b"[^>]*>[\\s\\S]*?cy="([^"]+)"`))[1]);
    expect(y("height")).toBeLessThan(y("head"));
  });

  test("selects a point without editing and shows only that record's values", () => {
    const entries = [datedEntry("full", "2026-07-01"), { id: "partial", date: "2026-08-01", time: "12:30", weight: 6.2 }];
    const harness = createHarness(entries);
    const readings = () => harness.markup().match(/class="growth-inline-readings">([\s\S]*?)<\/div>\s*<\/div>/)[1];
    expect(readings()).toContain("6.2");
    expect((readings().match(/—/g) || [])).toHaveLength(2);
    expect(readings()).not.toContain("55");
    harness.click("point", "full"); harness.flushFrame();
    expect(harness.dialogCalls).toEqual([]);
    expect(harness.markup()).toContain("2026.07.01 · 08:00");
    expect(readings()).toContain("55");
    expect(harness.markup()).toMatch(/data-growth-inline-entry="full">기록 수정/);
    expect(harness.focusCalls()).toBe(1);
    harness.click("entry", "full");
    expect(harness.dialogCalls).toEqual([[entries[0]]]);
  });

  test("supports keyboard selection and falls back when the selected record is removed", () => {
    const entries = [datedEntry("a", "2026-07-01"), datedEntry("b", "2026-08-01")];
    const harness = createHarness(entries);
    harness.keyPoint("a", "Enter"); harness.flushFrame();
    expect(harness.markup()).toContain("2026.07.01 · 08:00");
    expect(harness.dialogCalls).toEqual([]);
    entries.shift(); harness.triggerMutation(); harness.flushFrame();
    expect(harness.markup()).toContain("2026.08.01 · 08:00");
    harness.keyPoint("b", " "); harness.flushFrame();
    expect(harness.dialogCalls).toEqual([]);
  });

  test("limits the combined plot to 90 records without dropping partial measurements", () => {
    const entries = Array.from({ length: 91 }, (_, i) => ({ id: `e${i}`, date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), [i % 2 ? "weight" : "height"]: i % 2 ? 4 : 55 }));
    const markup = createHarness(entries).markup();
    expect(markup).not.toContain('data-growth-chart-entry="e0"');
    expect([...markup.matchAll(/data-growth-chart-entry=/g)]).toHaveLength(90);
    expect(markup).toContain('data-growth-chart-entry="e90"');
    expect(markup).not.toContain("NaN");
  });

  test("renders the latest five rows first and expands to the full history", () => {
    const entries = [entry("e4", 4), entry("e1", 1), entry("e7", 7), entry("e3", 3), entry("e6", 6), entry("e2", 2), entry("e5", 5)];
    const harness = createHarness(entries);

    expect(harness.historyIds()).toEqual(["e7", "e6", "e5", "e4", "e3"]);
    expect(harness.markup()).toContain("전체 기록 보기 (7)");

    harness.click("toggle");
    harness.flushFrame();

    expect(harness.historyIds()).toEqual(["e7", "e6", "e5", "e4", "e3", "e2", "e1"]);
    expect(harness.markup()).toContain("최근 기록만 보기");
  });

  test("opens the exact selected entry through the existing dialog", () => {
    const entries = [entry("earlier", 1), entry("selected", 2)];
    const harness = createHarness(entries);

    harness.click("entry", "selected");

    expect(harness.dialogCalls).toEqual([[entries[1]]]);
  });

  test("restores toggle focus after expansion but not after unrelated rerenders", () => {
    const entries = Array.from({ length: 6 }, (_, index) => entry(`e${index + 1}`, index + 1));
    const harness = createHarness(entries);

    harness.click("toggle");
    harness.flushFrame();
    expect(harness.focusCalls()).toBe(1);

    harness.click("toggle");
    harness.flushFrame();
    expect(harness.historyIds()).toHaveLength(5);
    expect(harness.focusCalls()).toBe(2);

    entries.push(entry("e7", 7));
    harness.triggerMutation();
    harness.flushFrame();
    expect(harness.focusCalls()).toBe(2);
  });

  test("shows only the record-name optional guidance", () => {
    expect(index).toContain('class="field-optional growth-title-optional"');
    expect(index).toContain("선택 · 비워두면 분류에 맞게 자동 입력");
    expect(index.match(/growth-title-optional/g)).toHaveLength(1);
    expect(polish).toContain("#growthDialog .field-optional { display: none; }");
    expect(polish).toMatch(/#growthDialog \.growth-title-optional\s*\{[^}]*display:\s*inline/);
  });

  test("keeps accessible touch styling, form emphasis, and cache versions", () => {
    expect(css).toContain(".growth-inline-history-list");
    expect(css).toMatch(/min-height:\s*72px/);
    expect(css).toContain("#growthInsightRow .growth-inline-history-values");
    expect(css).toMatch(/#growthInsightRow \.growth-inline-history-values\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\);[^}]*margin:\s*0;/s);
    expect(script).not.toContain('data-growth-inline-action="edit"');
    expect(polish).toContain('#growthDialog[data-simple-category="성장"] [data-growth-fields="성장"]');
    expect(config).toContain('{ name: "growth-edit-sheet-polish", version: "20260722-measurement-focus-v2", script: false }');
    expect(config).toContain('{ name: "growth-inline-chart", version: "20261017-growth-combined-v1" }');
    expect(config).toContain('{ name: "growth-inline-visual-polish", version: "20260722-header-meta-v2", script: false }');
    expect(config).toContain('{ name: "growth-inline-approved-polish", version: "20260722-legend-stack-v1", script: false }');
  });

  test("aligns the latest date and add action on one header row", () => {
    const harness = createHarness([entry("latest", 18)]);
    expect(harness.markup()).toMatch(/class="growth-inline-meta"[\s\S]*?<time[^>]*>[^<]+<\/time>[\s\S]*?class="growth-inline-actions"/);
    expect(css).toMatch(/\.growth-inline-meta\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/s);
    expect(css).toMatch(/\.growth-inline-actions\s*\{[^}]*width:\s*auto;/s);
    expect(visual).toContain(".growth-inline-meta time");
    expect(visual).not.toContain(".growth-inline-title time");
    expect(visual).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.growth-inline-actions\s*\{[^}]*width:\s*auto;/s);
  });
});
