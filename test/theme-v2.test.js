import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const theme = readFileSync("theme-v2.css", "utf8");
const calendar = readFileSync("theme-calendar-exception.css", "utf8");
const serviceWorker = readFileSync("service-worker.js", "utf8");

describe("Theme v2 shadow rollout", () => {
  test("loads last but remains gated until explicitly enabled", () => {
    const currentThemeIndex = config.indexOf('{ name: "black-theme-final"');
    const v2Index = config.indexOf('{ name: "theme-v2", version: "20260824-event-change-push-v1", script: false }');

    expect(v2Index).toBeGreaterThan(currentThemeIndex);
    expect(config).toContain('get("theme-v2")');
    expect(config).toContain('dataset.familyThemeV2 = "true"');
    expect(theme).toContain('html[data-family-theme-v2="true"]');
    expect(theme).not.toMatch(/(^|\n)(?!\s*\/\*)\s*:root\s*\{/);
  });

  test("defines semantic white and black palettes", () => {
    expect(theme).toContain("--color-canvas");
    expect(theme).toContain("--color-text-primary");
    expect(theme).toContain("--color-border-subtle");
    expect(theme).toContain("--color-control-active");
    expect(theme).toContain('[data-family-theme-choice="black"]');
    expect(theme).toContain("--theme-accent: var(--color-accent)");
  });

  test("keeps calendar ownership isolated from generic v2 view rules", () => {
    expect(calendar).toContain("body #calendarView#calendarView");
    expect(theme).not.toMatch(/#calendarView[^\n{]*\{/);
    expect(theme).toContain("#eventDialog");
  });

  test("covers the previously observed non-calendar leak points", () => {
    expect(theme).toContain("#carePatternDateLabel");
    expect(theme).toContain("#englishTodayCopy");
    expect(theme).toContain("#englishStoryTheme");
    expect(theme).toContain(".feeding-reminder-presets button");
  });

  test("owns growth data colors and neutralizes the black story palette", () => {
    expect(theme).toContain("--color-data-formula");
    expect(theme).toContain("--growth-formula: var(--color-data-formula)");
    expect(theme).toContain(".daily-intake-summary header > div > span");
    expect(theme).toContain(".care-pattern-categories button span");
    expect(theme).toContain(".english-library-card > span");
    expect(theme).toContain("--color-story-accent: var(--color-text-secondary)");
  });

  test("neutralizes black daily feeding breakdown surfaces and totals", () => {
    expect(theme).toContain(".daily-intake-summary header > p");
    expect(theme).toContain(".daily-intake-breakdown span");
    expect(theme).toContain(".daily-intake-breakdown article");
    expect(theme).toContain("background: var(--color-surface-raised) !important;");
  });

  test("always fetches the shadow stylesheet from the network", () => {
    expect(serviceWorker).toContain('url.pathname.endsWith("/theme-v2.css")');
  });
});
