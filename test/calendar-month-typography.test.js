import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path) => readFileSync(path, "utf8");
const calendarSwipe = read("calendar-swipe.css");
const typography = read("typography-system.css");
const config = read("config.js");
const index = read("index.html");

describe("calendar month picker typography", () => {
  test("keeps the shared label scale from overriding the month trigger", () => {
    expect(calendarSwipe).toContain("#calendarView .month-picker-trigger");
    expect(calendarSwipe).toContain("font-size: 21px;");
    expect(calendarSwipe).toContain("font-weight: 760;");
    expect(typography).toContain("label:not(.month-picker-trigger)");
    expect(config).toContain('{ name: "typography-system", version: "20260824-event-change-push-v1", script: false }');
    expect(index).toContain('config.js?v=20260830-session-surface-v1');
  });
});
