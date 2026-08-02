import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path) => readFileSync(path, "utf8");
const config = read("config.js");
const settings = read("settings.js");
const palette = read("monochrome-theme.css");
const floatingActions = read("refresh-button.css");
const blackThemeCleanup = read("growth-delete-sync.css");

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

  test("removes remaining navy surfaces from the black growth UI", () => {
    expect(blackThemeCleanup).toContain('body > .refresh-button');
    expect(blackThemeCleanup).toContain('.topbar-account-actions > .avatar-button');
    expect(blackThemeCleanup).toContain('.growth-quick-section');
    expect(blackThemeCleanup).toContain('.care-pattern-section');
    expect(blackThemeCleanup).toContain('button[data-growth-quick="기저귀"]');
    expect(blackThemeCleanup).toContain('linear-gradient(145deg, #2a2a2a, #171717) !important');
    expect(blackThemeCleanup).not.toContain('#315f99');
    expect(blackThemeCleanup).not.toContain('#214a7d');
  });

  test("extends neutral black surfaces across every top-level page", () => {
    expect(blackThemeCleanup).toContain('#calendarView :is(');
    expect(blackThemeCleanup).toContain('#englishView :is(');
    expect(blackThemeCleanup).toContain('#featureRequestView :is(');
    expect(blackThemeCleanup).toContain('#settingsView :is(');
    expect(blackThemeCleanup).toContain('.admin-view :is(');
    expect(blackThemeCleanup).toContain('.sheet-dialog form');
    expect(blackThemeCleanup).toContain('.auth-panel');
    expect(blackThemeCleanup).toContain('background: linear-gradient(145deg, #181818, #0d0d0d) !important');
  });

  test("neutralizes blue active controls and charts", () => {
    expect(blackThemeCleanup).toContain('.calendar-day.selected');
    expect(blackThemeCleanup).toContain('.english-progress i');
    expect(blackThemeCleanup).toContain('.feature-request-item[data-status="reviewing"]');
    expect(blackThemeCleanup).toContain('.theme-option.active');
    expect(blackThemeCleanup).toContain('.admin-user-chart-bar');
    expect(blackThemeCleanup).toContain('linear-gradient(90deg, #777, #d0d0d0) !important');
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
