import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "vitest";

const source = readFileSync("feeding-pattern-split.js", "utf8");
const splitType = source.slice(source.indexOf("  function splitCareType"), source.indexOf("\n\n  const originalQuickPresets"));
const rendererStart = source.indexOf("  renderDailyCareClock = function renderSplitDailyCareClock");
const rendererEnd = source.indexOf("\n\n  renderWeeklyCarePattern", rendererStart);
const renderer = source.slice(rendererStart, rendererEnd);
const app = readFileSync("app.js", "utf8");
const pointHelper = app.slice(app.indexOf("function clockPoint("), app.indexOf("\n\nfunction renderDailyCareClock"));

test("split care clock renders categorized points at the right times and retains sleep arcs", () => {
  const elements = {
    "#carePatternDateLabel": {},
    "#carePatternDateNav [data-pattern-day='1']": {},
    "#carePatternContent": {},
  };
  const context = {
    carePatternDate: "2000-01-01",
    carePatternCategories: new Set(["formula", "breast", "sleep", "diaper", "health"]),
    document: { querySelector: (selector) => elements[selector] },
    parseDate: (date) => new Date(`${date}T12:00:00`),
    dateKey: (date) => date.toISOString().slice(0, 10),
    formatDuration: (minutes) => `${minutes}분`,
    escapeHtml: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"),
    activeBaby: () => null,
  };
  vm.createContext(context);
  vm.runInContext(`${pointHelper}\n${splitType}\ngrowthCareType = splitCareType;\n${renderer}`, context);
  const entries = [
    { date: "2000-01-01", time: "00:00", category: "수유·이유식", feedingType: "젖병", feedingMl: 120, title: "분유" },
    { date: "2000-01-01", time: "06:00", category: "수유·이유식", feedingType: "모유", feedingMinutes: 18, title: "모유" },
    { date: "2000-01-01", time: "02:00", category: "수면", sleepMinutes: 90, title: "수면" },
    { date: "2000-01-01", time: "12:00", category: "기저귀", title: "기저귀" },
    { date: "2000-01-01", time: "18:00", category: "건강·병원", title: "체크 <script>" },
    { date: "2000-01-01", time: "20:00", category: "기타", title: "숨김" },
    { date: "2000-01-02", time: "00:00", category: "건강·병원", title: "다른 날짜" },
  ];
  context.renderDailyCareClock(entries);

  const html = elements["#carePatternContent"].innerHTML;
  const points = [...html.matchAll(/<circle class="care-clock-mark (\w+)" cx="([\d.]+)" cy="([\d.]+)" r="6"/g)].map((match) => match.slice(1));
  expect(points).toEqual([
    ["formula", "180.0", "68.0"], ["breast", "292.0", "180.0"],
    ["diaper", "180.0", "292.0"], ["health", "68.0", "180.0"],
  ]);
  expect(html).toContain("00:00 분유 120mL");
  expect(html).toContain("06:00 직수 18분");
  expect(html).toContain("18:00 건강 체크 &lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain('class="care-clock-dot formula" cx="180.0" cy="68.0" r="2.2"');
  expect(html).toContain('class="care-clock-sleep" cx="180" cy="180" r="112"');
  expect(html).toContain("02:00 수면 90분");
  const arc = Number(html.match(/class="care-clock-sleep"[^>]+stroke-dasharray="([\d.]+)/)[1]);
  expect(arc).toBeCloseTo(90 / 1440 * 2 * Math.PI * 112);
  expect(html).not.toContain("숨김");
  expect(html).not.toContain("다른 날짜");
  context.carePatternCategories.delete("formula");
  context.renderDailyCareClock(entries);
  expect(elements["#carePatternContent"].innerHTML).not.toContain('class="care-clock-mark formula"');
  expect(elements["#carePatternContent"].innerHTML).toContain("분유 120밀리리터");
});
