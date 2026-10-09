import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "vitest";

const read = (file) => readFileSync(file, "utf8");
const adaptive = read("adaptive-feeding.js");
const typeOf = adaptive.slice(adaptive.indexOf("  function typeOf(entry)"), adaptive.indexOf("\n  function entries()"));
const splitSource = read("feeding-pattern-split.js");
const dailyClock = splitSource.slice(splitSource.indexOf("  renderDailyCareClock = function renderSplitDailyCareClock"), splitSource.indexOf("\n\n  renderWeeklyCarePattern"));
const app = read("app.js");
const clockPoint = app.slice(app.indexOf("function clockPoint("), app.indexOf("\n\nfunction renderDailyCareClock"));
const emphasis = read("care-time-emphasis.js");
const intakeSource = read("daily-intake-summary.js");
const dailyTotals = intakeSource.slice(intakeSource.indexOf("  function feedingKind"), intakeSource.indexOf("\n\n  function metric"));
const compactSource = read("compact-family.js");
const summaryStart = compactSource.indexOf("  const renderSummary = () => {");
const renderSummary = compactSource.slice(summaryStart, compactSource.indexOf("\n  const previousRender", summaryStart));
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const entries = [
  { id: "f", date: "2000-01-01", time: "00:00", category: "수유·이유식", feedingType: "분유", feedingMl: 120, title: "분유 수유" },
  { id: "p", date: "2000-01-01", time: "03:00", category: "수유·이유식", feedingType: "유축모유", feedingMl: 90, feedingMinutes: 12, title: "유축모유 수유" },
  { id: "b", date: "2000-01-01", time: "06:00", category: "수유·이유식", feedingType: "모유", feedingSide: "왼쪽", feedingMinutes: 18, title: "모유 수유" },
  { id: "s", date: "2000-01-01", time: "09:00", category: "수유·이유식", feedingType: "이유식", feedingMl: 60, title: "이유식" },
  { id: "z", date: "2000-01-01", time: "12:00", category: "수면", sleepMinutes: 90, title: "낮잠" },
  { id: "d", date: "2000-01-01", time: "15:00", category: "기저귀", diaperKind: "소변", title: "기저귀" },
  { id: "h<&", date: "2000-01-01", time: "18:00", category: "건강·병원", temperature: 37.4, title: "열 <체크>" },
  { id: "x", date: "2000-01-01", time: "20:00", category: "기타", title: "숨김" },
  { id: "old", date: "2000-01-02", time: "21:00", category: "건강·병원", title: "다른 날짜" },
];

function clockContext(categories) {
  const elements = { "#carePatternDateLabel": {}, "#carePatternDateNav [data-pattern-day='1']": {}, "#carePatternContent": {} };
  const context = {
    carePatternDate: "2000-01-01", carePatternCategories: new Set(categories), growthCareType: null,
    document: { querySelector: (selector) => elements[selector] },
    parseDate: (day) => new Date(`${day}T12:00:00`), dateKey: (date) => date.toISOString().slice(0, 10),
    formatDuration: (minutes) => `${minutes}분`, escapeHtml, activeBaby: () => null,
  };
  vm.createContext(context);
  vm.runInContext(`${typeOf}\ngrowthCareType = typeOf;\n${clockPoint}\n${dailyClock}`, context);
  return { context, content: elements["#carePatternContent"] };
}

function timeList(categories) {
  const content = { innerHTML: "clock", appended: [], appendChild(element) { this.appended.push(element); } };
  const context = {
    carePatternDate: "2000-01-01", carePatternCategories: new Set(categories), growthCareType: null,
    renderDailyCareClock() { content.innerHTML = "clock"; }, renderGrowth() {}, formatDuration: (minutes) => `${minutes}분`, escapeHtml,
    document: { querySelector: () => content, createElement: () => ({ setAttribute() {} }) },
  };
  vm.createContext(context);
  vm.runInContext(`${typeOf}\ngrowthCareType = typeOf;\n${emphasis}`, context);
  context.renderDailyCareClock(entries);
  return content.appended[0].innerHTML;
}

test("daily intake totals use shared feeding types and exclude solid food", () => {
  const context = { carePatternDate: "2000-01-01", growthCareType: null };
  vm.createContext(context);
  vm.runInContext(`${typeOf}\ngrowthCareType = typeOf;\n${dailyTotals}`, context);
  expect(context.dailyFeedingTotals(entries)).toEqual({ formulaMl: 120, pumpedMl: 90, bottleMl: 210, formulaCount: 1, pumpedCount: 1, breastMinutes: 18, breastCount: 1 });
});

test("compact daily summary excludes solids and non-direct feeding minutes", () => {
  let metrics;
  const grid = { replaceChildren(...items) { metrics = items.map((item) => item.children.map((child) => child.textContent)); } };
  const summary = { querySelector: (selector) => selector === "time" ? {} : grid };
  const context = {
    summary, dateKey: () => "2000-01-01", activeBabyEntries: () => entries,
    window: { FAMILY_DATA: { splitSleepEntries: (items) => items } },
    formatDuration: (minutes) => `${minutes}분`,
    document: { createElement: () => ({ append(...children) { this.children = children; } }) },
    $: () => ({ textContent: "" }),
  };
  vm.createContext(context);
  vm.runInContext(`${typeOf}\ngrowthCareType = typeOf;\n${renderSummary}\nrenderSummary();`, context);
  expect(metrics).toEqual([["수유량", "210mL"], ["직수", "18분"], ["수면", "90분"]]);
});

test("daily clock and editable time list share all care record types and category filters", () => {
  const kinds = ["formula", "pumped", "breast", "solid", "sleep", "diaper", "health"];
  const labels = ["분유", "유축", "직수", "이유식", "수면", "기저귀", "건강"];
  const clock = clockContext(kinds);
  clock.context.renderDailyCareClock(entries);
  let html = clock.content.innerHTML;
  for (let i = 0; i < kinds.length; i++) {
    if (["sleep", "breast"].includes(kinds[i])) expect(html).toContain(`class="care-band-range ${kinds[i]}"`);
    else expect(html).toContain(`class="care-band-stripe ${kinds[i]}"`);
    expect(html).toContain(labels[i]);
  }
  for (const tooltip of ["00:00 분유 120mL", "03:00 유축 90mL", "06:00 직수 왼쪽 · 18분", "09:00 이유식 60mL", "12:00 수면 90분", "15:00 기저귀 소변", "18:00 건강 열 &lt;체크&gt; · 37.4°C"]) expect(html).toContain(tooltip);
  expect(html).toContain('class="care-band-range breast" data-start="360" data-duration="18"');
  expect(html).toContain('class="care-band-range sleep" data-start="720" data-duration="90"');
  expect(html).toContain('class="care-band-stripe pumped"');
  expect(html).not.toContain('class="care-band-range pumped"');
  expect(html).toContain('aria-label="선택한 날 수유 합계"');
  expect(html).toContain("총 수유량 210밀리리터");
  expect(html).not.toContain("숨김");
  expect(html).not.toContain("다른 날짜");

  html = timeList(kinds);
  expect(html.indexOf('data-care-entry-id="h&lt;&amp;"')).toBeLessThan(html.indexOf('data-care-entry-id="d"'));
  expect(html).toMatch(/aria-label="18:00 건강 열 &lt;체크&gt; · 37\.4°C 기록 수정"/);
  expect(html).toContain("열 &lt;체크&gt; · 37.4°C");
  expect(html).toContain('aria-haspopup="dialog"');
  for (const label of labels) expect(html).toContain(`<strong>${label}</strong>`);
  expect(html).toContain("왼쪽 · 18분");

  clock.context.carePatternCategories.delete("pumped");
  clock.context.renderDailyCareClock(entries);
  expect(clock.content.innerHTML).not.toContain('class="care-band-stripe pumped"');
  expect(clock.content.innerHTML).toContain("총 수유량 210밀리리터");
  expect(clock.content.innerHTML).toContain("유축 90밀리리터");
  html = timeList(kinds.filter((kind) => kind !== "pumped"));
  expect(html).not.toContain('data-care-entry-id="p"');
  expect(html).toContain('data-care-entry-id="s"');
});
