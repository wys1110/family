import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path) => readFileSync(path, "utf8");
const config = read("config.js");
const settings = read("settings.js");
const palette = read("monochrome-theme.css");
const floatingActions = read("refresh-button.css");
const blackThemeCleanup = read("growth-delete-sync.css");
const finalBlackTheme = read("black-theme-final.css");
const themeSystem = read("theme-system.css");
const calendarThemeException = read("theme-calendar-exception.css");
const serviceWorker = read("service-worker.js");

describe("white and black themes", () => {
  test("loads the semantic theme facade after every page palette", () => {
    const nightIndex = config.indexOf('{ name: "night-page-palette"');
    const monochromeIndex = config.indexOf('{ name: "monochrome-theme", version: "20260801-white-black-v1", script: false }');
    const finalBlackIndex = config.indexOf('{ name: "black-theme-final", version: "20260803-black-todo-fab-v1", script: false }');

    expect(nightIndex).toBeGreaterThan(-1);
    expect(monochromeIndex).toBeGreaterThan(nightIndex);
    expect(finalBlackIndex).toBeGreaterThan(monochromeIndex);
    expect(finalBlackTheme).toContain('@import url("./theme-system.css?v=20260803-black-todo-fab-v1");');
    expect(finalBlackTheme).toContain('@import url("./theme-calendar-exception.css?v=20260803-night-only-v1");');
    expect(themeSystem).toMatch(/^@import url\("\.\/growth-delete-sync\.css\?v=20260802-theme-system-v1"\);/);
    expect(serviceWorker).toContain('url.pathname.endsWith("/theme-system.css")');
    expect(serviceWorker).toContain('url.pathname.endsWith("/theme-calendar-exception.css")');
  });

  test("bootstraps stored white and black choices before modules load", () => {
    expect(config).toContain('const themeChoiceStorageKey = demoMode ? "family-demo-theme-choice-v1" : "family-theme-choice-v1"');
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
    expect(settings).toContain("localStorage.setItem(activeThemeChoiceStorageKey, selected.id)");
  });

  test("keeps white light and black neutral dark", () => {
    expect(palette).toContain('html[data-family-theme="white"]');
    expect(palette).toContain('--surface: #ffffff');
    expect(palette).toContain('html[data-family-theme="night"][data-family-theme-choice="black"]');
    expect(themeSystem).toContain('html[data-family-theme-choice="black"]');
    expect(themeSystem).toContain('--theme-canvas: #050505');
    expect(themeSystem).toContain('--theme-accent: #d7d7d7');
    expect(themeSystem).toContain('color-scheme: dark');
  });

  test("keeps the black-theme schedule add button neutral", () => {
    expect(config).toContain('{ name: "refresh-button", version: "20260802-black-fab-v1" }');
    expect(floatingActions).toContain('html[data-family-theme="night"][data-family-theme-choice="black"] body > #addEventButton.fab');
    expect(floatingActions).toContain('background: linear-gradient(145deg, #252525, #151515)');
    expect(themeSystem).toContain('#addEventButton.fab');
    expect(themeSystem).toContain('.family-todo-fab');
  });

  test("keeps the legacy cleanup as a compatibility layer", () => {
    expect(blackThemeCleanup).toContain('body > .refresh-button');
    expect(blackThemeCleanup).toContain('.topbar-account-actions > .avatar-button');
    expect(blackThemeCleanup).toContain('.growth-quick-section');
    expect(blackThemeCleanup).toContain('.care-pattern-section');
    expect(blackThemeCleanup).toContain('button[data-growth-quick="기저귀"]');
    expect(blackThemeCleanup).not.toContain('#315f99');
    expect(blackThemeCleanup).not.toContain('#214a7d');
  });

  test("exposes semantic tokens for current and future components", () => {
    expect(themeSystem).toContain('--theme-surface');
    expect(themeSystem).toContain('--theme-control-active');
    expect(themeSystem).toContain('--theme-border-strong');
    expect(themeSystem).toContain('--theme-progress-fill');
    expect(themeSystem).toContain('[data-theme-surface="base"]');
    expect(themeSystem).toContain('[data-theme-control]');
    expect(themeSystem).not.toContain('html[data-family-theme="night"][data-family-theme-choice="black"]');
  });

  test("neutralizes controls even when feature modules inject styles later", () => {
    expect(themeSystem).toContain(':is(button, [role="button"])');
    expect(themeSystem).toContain('background-image: linear-gradient(145deg, #2d2d2d, #171717) !important');
    expect(themeSystem).toContain('.admin-user-chart-bar');
    expect(themeSystem).toContain('.english-progress i');
    expect(themeSystem).toContain('background: var(--theme-progress-fill) !important');
  });

  test("keeps black calendar event bars on their member colors", () => {
    expect(themeSystem).toContain(':not(.calendar-event-bar)');
    expect(themeSystem).toContain('html[data-family-theme-choice="black"] #calendarView .calendar-event-bar');
    expect(themeSystem).toContain('background: var(--member-color) !important;');
    expect(themeSystem).toContain('background-image: none !important;');
  });

  test("colors black calendar weekends like a dark calendar", () => {
    expect(themeSystem).toContain('html[data-family-theme-choice="black"] #calendarView .weekdays span:first-child');
    expect(themeSystem).toContain('html[data-family-theme-choice="black"] #calendarView .weekdays span:last-child');
    expect(themeSystem).toContain('html[data-family-theme-choice="black"] #calendarView .calendar-day:nth-child(7n + 1):not(.today) .day-number');
    expect(themeSystem).toContain('html[data-family-theme-choice="black"] #calendarView .calendar-day:nth-child(7n):not(.today) .day-number');
    expect(themeSystem).toContain('color: #ff6b78 !important;');
    expect(themeSystem).toContain('color: #6ea8ff !important;');
  });

  test("keeps black daily feeding totals neutral", () => {
    expect(themeSystem).toContain('html[data-family-theme-choice="black"] #growthView .daily-intake-summary header > p {');
    expect(themeSystem).toContain('color: var(--theme-text) !important;');
    expect(themeSystem).toContain('html[data-family-theme-choice="black"] #growthView .daily-intake-summary header > p span {');
    expect(themeSystem).toContain('color: var(--theme-text-muted) !important;');
  });

  test("keeps black daily feeding surfaces neutral", () => {
    expect(themeSystem).toContain('html[data-family-theme-choice="black"] #growthView .daily-intake-summary {');
    expect(themeSystem).toContain('background: var(--theme-surface) !important;');
    expect(themeSystem).toContain('html[data-family-theme-choice="black"] #growthView .daily-intake-breakdown article {');
    expect(themeSystem).toContain('background: var(--theme-surface-raised) !important;');
  });

  test("keeps the event editor frame, controls and footer neutral black", () => {
    expect(themeSystem).toContain('body #eventDialog {');
    expect(themeSystem).toContain('--event-sheet-bg: #080808 !important');
    expect(themeSystem).toContain('#eventDialog .date-shortcuts button.active');
    expect(themeSystem).toContain('#eventDialog .member-selector button.selected');
    expect(themeSystem).toContain('.sheet-dialog :is(.dialog-actions)');
    expect(themeSystem).toContain('background-image: linear-gradient(145deg, #3a3a3a, #1b1b1b) !important');
    expect(themeSystem).not.toContain('#6f9ee7');
    expect(themeSystem).not.toContain('#70c8b8');
  });

  test("scopes the starry-night schedule exception to the night theme", () => {
    expect(calendarThemeException).toContain('body #calendarView#calendarView {');
    expect(calendarThemeException).toContain('html[data-family-theme-choice="night"]');
    expect(calendarThemeException).not.toContain('html[data-family-theme-choice="black"]');
    expect(calendarThemeException).toContain('--theme-accent: #79aaff');
    expect(calendarThemeException).toContain('.calendar-day.today .day-number');
    expect(calendarThemeException).toContain('.todo-filter-tabs button.active');
    expect(calendarThemeException).not.toContain('#eventDialog');
  });

  test("covers schedule, growth, story, request, settings and dialogs", () => {
    expect(palette).toContain('#calendarView .calendar-card');
    expect(palette).toContain('#growthView :is(');
    expect(palette).toContain('#englishView :is(');
    expect(palette).toContain('#featureRequestView :is(');
    expect(palette).toContain('#settingsView .settings-card');
    expect(themeSystem).toContain('.sheet-dialog');
  });
});
