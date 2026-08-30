import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = readFileSync("calendar-font-settings.js", "utf8");
const polish = readFileSync("settings-layout-polish.css", "utf8");
const config = readFileSync("config.js", "utf8");
const index = readFileSync("index.html", "utf8");

describe("calendar font size presets", () => {
  test("replaces technical pixel entry with three semantic choices", () => {
    expect(source).toContain("const SIZE_OPTIONS");
    expect(source).toContain("{ id: 'small', label: '작게', size: 8 }");
    expect(source).toContain("{ id: 'medium', label: '보통', size: 11 }");
    expect(source).toContain("{ id: 'large', label: '크게', size: 14 }");
    expect(source).toContain('class="calendar-font-preset-control"');
    expect(source).toContain('role="radiogroup"');
    expect(source).toContain('data-calendar-font-preset');
    expect(source).toContain('role="radio"');
    expect(source).toContain('data-calendar-font-trigger');
    expect(source).toContain('id="calendarFontPanel"');
    expect(source).toContain('#calendarView');
    expect(source).not.toContain('data-calendar-font-card');
    expect(source).not.toContain('type="number"');
    expect(source).not.toContain('data-calendar-font-step');
    expect(source).not.toContain('calendar-font-number-unit');
  });

  test("shows the control in the schedule toolbar and keeps automatic persistence", () => {
    expect(source).toContain('aria-label="일정 글자 크기"');
    expect(source).toContain('data-calendar-font-current');
    expect(source).toContain('data-calendar-font-panel');
    expect(source).toContain("localStorage.setItem(STORAGE_KEY, String(size))");
    expect(source).toContain("familycalendarfontchange");
    expect(source).toContain("button.setAttribute('aria-checked', String(active))");
  });

  test("loads the preset layout styles without stale numeric controls", () => {
    expect(polish).not.toContain("[data-calendar-font-card]");
    expect(polish).not.toContain(".calendar-font-number-input");
    expect(config).toContain('{ name: "calendar-font-settings", version: "20260805-toolbar-v1", style: false }');
    expect(config).toContain('{ name: "settings-layout-polish", version: "20260824-event-change-push-v1", script: false }');
    expect(index).toContain('config.js?v=20260830-session-surface-v1');
  });
});
