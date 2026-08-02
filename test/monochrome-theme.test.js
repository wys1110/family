import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path) => readFileSync(path, "utf8");
const config = read("config.js");
const settings = read("settings.js");
const palette = read("monochrome-theme.css");
const floatingActions = read("refresh-button.css");

describe("white and black themes", () => {
  test("loads the monochrome palette after the starry-night palette", () => {
    const nightIndex = config.indexOf('{ name: "night-page-palette"');
    const monochromeIndex = config.indexOf('{ name: "monochrome-theme", version: "20260801-white-black-v1", script: false }');

    expect(nightIndex).toBeGreaterThan(-1);
    expect(monochromeIndex).toBeGreaterThan(nightIndex);
  });

  test("bootstraps stored white and black choices before modules load", () => {
    expect(config).toContain('const themeChoiceStorageKey = "family-theme-choice-v1"');
    expect(config).toContain('white: "#f7f7f5"');
    expect(config).toContain('black: "#050505"');
    expect(config).toContain('const themeCssAliases = { black: "night" }');
    expect(config).toContain('dataset.familyThemeChoice = initialTheme');
  });

  test("shows selectable white and black options", () => {
    expect(settings).toContain("id: 'white'");
    expect(settings).toContain("name: '화이트'");
    expect(settings).toContain("id: 'black'");
    expect(settings).toContain("cssTheme: 'night'");
    expect(settings).toContain("name: '블랙'");
    expect(settings).toContain("localStorage.setItem(THEME_CHOICE_STORAGE_KEY, selected.id)");
  });

  test("keeps white light and black neutral dark", () => {
    expect(palette).toContain('html[data-family-theme="white"]');
    expect(palette).toContain('--surface: #ffffff');
    expect(palette).toContain('html[data-family-theme="night"][data-family-theme-choice="black"]');
    expect(palette).toContain('--night-bg-deep: #050505');
    expect(palette).toContain('--night-blue: #d7d7d7');
    expect(palette).toContain('color-scheme: dark');
  });

  test("keeps the black-theme schedule add button neutral", () => {
    expect(config).toContain('{ name: "refresh-button", version: "20260802-black-fab-v1" }');
    expect(floatingActions).toContain('html[data-family-theme="night"][data-family-theme-choice="black"] body > #addEventButton.fab');
    expect(floatingActions).toContain('background: linear-gradient(145deg, #252525, #151515)');
    expect(floatingActions).not.toContain('data-family-theme-choice="black"] body > #addEventButton.fab {\n  background: linear-gradient(145deg, #315f99, #214a7d)');
  });

  test("covers schedule, growth, story, request, settings and dialogs", () => {
    expect(palette).toContain('#calendarView .calendar-card');
    expect(palette).toContain('#growthView :is(');
    expect(palette).toContain('#englishView :is(');
    expect(palette).toContain('#featureRequestView :is(');
    expect(palette).toContain('#settingsView .settings-card');
    expect(palette).toContain('.sheet-dialog form');
  });
});
