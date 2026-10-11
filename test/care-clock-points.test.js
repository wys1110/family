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

test("split care clock renders categorized markers and duration ranges at the right times", () => {
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
  const markers = [...html.matchAll(/<g class="care-band-marker (\w+)" data-start="(\d+)" transform="translate\(([-\d.]+) ([-\d.]+)\)">([\s\S]*?)<\/g>/g)];
  expect(markers).toHaveLength(4);
  expect(markers.map(([, type]) => type)).toEqual(["formula", "breast", "diaper", "health"]);
  expect(markers.map(([, type, start, x, y]) => [type, start, Number(x), Number(y)])).toEqual([
    ["formula", "0", 180, 68], ["breast", "360", 291.9, 184.4], ["diaper", "720", 180, 292], ["health", "1080", 68, 180],
  ]);
  expect(html).toContain('class="care-band-record-background" cx="0" cy="0" r="10"');
  for (const symbol of ["🍼", "🧷", "🩺", "🤱"]) expect(html).toMatch(new RegExp(`<text class="care-band-record-symbol" x="0" y="0" text-anchor="middle" dominant-baseline="central" aria-hidden="true">${symbol}</text>`));
  expect(html).toContain("<title>18:00 건강 체크 &lt;script&gt;</title>");
  expect(html).not.toContain("care-band-stripe");
  expect(html).toContain("이모지는 기록 종류 · 채운 구간은 시간 범위");
  expect(html).toContain("이모지는 기록 종류, 채운 구간은 시간 범위.");
  expect(html).toContain("00:00 분유 120mL");
  expect(html).toContain("06:00 직수 18분");
  expect(html).toContain("18:00 건강 체크 &lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain('<path class="care-band-range breast" data-start="360" data-duration="18"');
  expect(html).toContain('<path class="care-band-range sleep" data-start="120" data-duration="90"');
  expect(html).toContain('<g class="care-band-marker breast" data-start="360" transform="translate(291.9 184.4)">');
  expect(html.indexOf('class="care-band-range sleep"')).toBeLessThan(html.indexOf('class="care-band-marker breast"'));
  expect(html).toContain("02:00 수면 90분");
  expect(html).not.toContain("숨김");
  expect(html).not.toContain("다른 날짜");
  context.carePatternCategories.delete("formula");
  context.renderDailyCareClock(entries);
  expect(elements["#carePatternContent"].innerHTML).not.toContain('class="care-band-marker formula"');
  expect(elements["#carePatternContent"].innerHTML).toContain("분유 120밀리리터");
});

test("duration ranges cross midnight, cap at one day, and invalid durations remain instants", () => {
  const elements = { "#carePatternDateLabel": {}, "#carePatternDateNav [data-pattern-day='1']": {}, "#carePatternContent": {} };
  const context = {
    carePatternDate: "2000-01-01", carePatternCategories: new Set(["breast", "sleep", "health"]),
    document: { querySelector: (selector) => elements[selector] },
    parseDate: (date) => new Date(`${date}T12:00:00`), dateKey: (date) => date.toISOString().slice(0, 10),
    formatDuration: (minutes) => `${minutes}분`, escapeHtml: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"),
    activeBaby: () => null,
  };
  vm.createContext(context);
  vm.runInContext(`${pointHelper}\n${splitType}\ngrowthCareType = splitCareType;\n${renderer}`, context);
  context.renderDailyCareClock([
    { date: "2000-01-01", time: "23:30", category: "수유·이유식", feedingType: "모유", feedingMinutes: 90 },
    { date: "2000-01-01", time: "02:00", category: "수유·이유식", feedingType: "모유", feedingMinutes: 1 },
    { date: "2000-01-01", time: "10:00", category: "수유·이유식", feedingType: "모유", feedingMinutes: 2000 },
    { date: "2000-01-01", time: "00:00", category: "수면", sleepMinutes: 1441 },
    ...[0, -2, NaN].map((duration, index) => ({ date: "2000-01-01", time: `0${index + 1}:00`, category: "수면", sleepMinutes: duration })),
    { date: "2000-01-01", time: "24:00", category: "건강·병원", title: "invalid time" },
    { date: "2000-01-01", time: "12:30", category: "건강·병원", title: "<img src=x onerror=alert(1)>" },
  ]);
  const html = elements["#carePatternContent"].innerHTML;
  const lastRange = html.lastIndexOf('class="care-band-range');
  const lastMarker = html.lastIndexOf('class="care-band-marker');
  const periodIcons = [...html.matchAll(/<svg class="care-band-period"/g)];
  expect(periodIcons).toHaveLength(2);
  expect(periodIcons.every((icon) => icon.index > lastRange && icon.index > lastMarker)).toBe(true);
  expect(html).toContain('<svg class="care-band-period" x="169" y="97"');
  expect(html).toContain('<svg class="care-band-period" x="169" y="241"');
  expect((html.match(/class="care-band-period-background"/g) || [])).toHaveLength(2);
  expect(html).toContain('class="care-band-range breast" data-start="1410" data-duration="90"');
  expect(html).toContain('class="care-band-range breast" data-start="120" data-duration="1"');
  expect(html).toContain('class="care-band-range breast" data-start="600" data-duration="1440"');
  expect(html).toContain('<g class="care-band-marker breast" data-start="1410" transform="translate(187.3 68.2)">');
  expect(html).toContain('<g class="care-band-marker breast" data-start="120" transform="translate(236.2 83.1)">');
  expect(html).toContain('<g class="care-band-marker breast" data-start="600" transform="translate(124.0 83.0)">');
  expect((html.match(/class="care-band-marker breast"/g) || [])).toHaveLength(3);
  const rangePath = (type) => html.match(new RegExp(`<path class="care-band-range ${type}"[^>]* d="([^"]+)"`))?.[1];
  const overnight = rangePath("breast");
  const overnightSegments = overnight?.match(/^M([\d.-]+) ([\d.-]+) A137 137 0 0 1 ([\d.-]+) ([\d.-]+) L([\d.-]+) ([\d.-]+) A87 87 0 0 0 ([\d.-]+) ([\d.-]+) Z$/);
  expect(overnightSegments).not.toBeNull();
  const pointAt = (minute, radius) => {
    const angle = (minute / 4 - 90) * Math.PI / 180;
    return [180 + radius * Math.cos(angle), 180 + radius * Math.sin(angle)];
  };
  const coordinates = overnightSegments.slice(1).map(Number);
  [pointAt(1410, 137), pointAt(1500, 137), pointAt(1500, 87), pointAt(1410, 87)].flat().forEach((expected, index) => {
    expect(coordinates[index]).toBeCloseTo(expected, 8);
  });

  expect(html).toContain('class="care-band-range sleep" data-start="0" data-duration="1440"');
  const fullRing = rangePath("sleep");
  expect(fullRing).toBe("M180 43 A137 137 0 1 1 180 317 A137 137 0 1 1 180 43 M180 93 A87 87 0 1 0 180 267 A87 87 0 1 0 180 93");
  expect((fullRing.match(/A137 137 0 1 1/g) || [])).toHaveLength(2);
  expect((fullRing.match(/A87 87 0 1 0/g) || [])).toHaveLength(2);
  expect((html.match(/class="care-band-marker sleep"/g) || [])).toHaveLength(3);
  expect(html).not.toContain("24:00");
  expect(html).toContain("12:30 건강 &lt;img src=x onerror=alert(1)&gt;");
  expect(html).not.toContain("<img src=x onerror=alert(1)>");
});
