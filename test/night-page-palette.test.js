import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path) => readFileSync(path, "utf8");
const palette = read("night-page-palette.css");
const config = read("config.js");
const settings = read("settings.js");

describe("starry-night page palette", () => {
  test("loads the unified palette after every legacy night override", () => {
    const legacyIndex = config.indexOf('{ name: "care-color-separation"');
    const paletteIndex = config.indexOf('{ name: "night-page-palette", version: "20260727-page-audit-v1", script: false }');

    expect(legacyIndex).toBeGreaterThan(-1);
    expect(paletteIndex).toBeGreaterThan(legacyIndex);
  });

  test("uses a deep navy base with blue, violet and soft-gold accents", () => {
    expect(palette).toContain("--night-bg-deep: #050d1c");
    expect(palette).toContain("--night-blue: #79aaff");
    expect(palette).toContain("--night-violet: #a99cf9");
    expect(palette).toContain("--night-gold: #f2c675");
    expect(palette).toContain("--night-diaper: #7ec8ff");
    expect(palette).not.toContain('data-family-theme="black"');
  });

  test("covers every top-level view and schedule's todo subview", () => {
    expect(palette).toContain('#calendarView .calendar-card');
    expect(palette).toContain('#calendarView .calendar-subtabs');
    expect(palette).toContain('#calendarView :is(.todo-overview-card');
    expect(palette).toContain('#growthView .baby-care-card');
    expect(palette).toContain('#englishView .english-today-card');
    expect(palette).toContain('#featureRequestView :is(.feature-request-card');
    expect(palette).toContain('#settingsView .settings-card');
  });

  test("keeps feeding warm and diaper records cool", () => {
    expect(palette).toContain('button[data-growth-quick="수유·이유식"]');
    expect(palette).toContain('background: linear-gradient(145deg, #554323, #2f2a28)');
    expect(palette).toContain('button[data-growth-quick="기저귀"]');
    expect(palette).toContain('background: linear-gradient(145deg, #1d4f7a, #173451)');
    expect(palette).toContain(".care-split-entry.diaper");
    expect(palette).toContain("--entry-color: var(--care-diaper)");
  });

  test("keeps the dark settings preview and browser chrome synchronized", () => {
    expect(config).toContain('black: "#050505"');
    expect(settings).toContain("themeColor: '#050505'");
    expect(settings).toContain("preview: ['#050505', '#151515', '#d8d8d8', '#7f858c', '#f5f5f5']");
  });
});
