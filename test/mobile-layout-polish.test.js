import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync("mobile-layout-polish.css", "utf8");
const config = readFileSync("config.js", "utf8");

describe("mobile layout polish", () => {
  test("loads after the page and theme polish layers", () => {
    const themeIndex = config.indexOf('{ name: "night-page-palette"');
    const mobileIndex = config.indexOf('{ name: "mobile-layout-polish", version: "20260727-iphone-layout-v1", script: false }');

    expect(themeIndex).toBeGreaterThan(-1);
    expect(mobileIndex).toBeGreaterThan(themeIndex);
  });

  test("uses iPhone safe areas and prevents horizontal overflow", () => {
    expect(css).toContain("@media (max-width: 767.98px)");
    expect(css).toContain("overflow-x: clip");
    expect(css).toContain("env(safe-area-inset-top, 0px)");
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
  });

  test("keeps all five destinations usable on narrow phones", () => {
    expect(css).toMatch(/html \.view-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/s);
    expect(css).toMatch(/html \.view-tab\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toContain("@media (max-width: 380px)");
    expect(css).toMatch(/@media \(max-width: 380px\)[\s\S]*?html \.view-tab\s*\{[^}]*flex-direction:\s*column/s);
  });

  test("covers each top-level view and floating controls", () => {
    expect(css).toContain("#calendarView .calendar-card");
    expect(css).toContain(".baby-care-card .baby-profile-main");
    expect(css).toContain(".english-story-player");
    expect(css).toContain(".feature-request-item label");
    expect(css).toContain(".theme-option-grid");
    expect(css).toContain("body > #addEventButton.fab");
    expect(css).toContain("body > .refresh-button");
  });

  test("stacks crowded controls at the smallest supported widths", () => {
    expect(css).toMatch(/@media \(max-width: 380px\)[\s\S]*?\.baby-header-actions\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s);
    expect(css).toMatch(/@media \(max-width: 380px\)[\s\S]*?\.english-today-card\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(css).toMatch(/@media \(max-width: 380px\)[\s\S]*?\.feature-request-item label\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });
});
