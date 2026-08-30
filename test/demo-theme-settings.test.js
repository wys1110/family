import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path) => readFileSync(path, "utf8");
const config = read("config.js");
const settings = read("settings.js");

describe("demo theme boundary", () => {
  test("uses demo-only theme storage and a two-theme catalog", () => {
    expect(config).toContain("const demoMode = window.FAMILY_DEMO_MODE === true;");
    expect(config).toContain('family-demo-theme-v1');
    expect(config).toContain('family-demo-theme-choice-v1');
    expect(config).toContain('{ name: "settings", version: "20260804-settings-notification-cards-v1" }');
    expect(read("index.html")).toContain('config.js?v=20260830-session-surface-v1');
    expect(settings).toContain("const AVAILABLE_THEMES = THEMES;");
    expect(settings).toContain("family-demo-theme-v1");
    expect(settings).toContain("family-demo-theme-choice-v1");
  });

  test("keeps white and black IDs while labeling demo black as dark", () => {
    expect(settings).toContain("id: 'white'");
    expect(settings).toContain("id: 'black'");
    expect(settings).toContain("name: '다크'");
    expect(settings).toContain("cssTheme: 'night'");
  });

  test("keeps production and demo on the same two-theme catalog", () => {
    expect(settings).toContain("id: 'white'");
    expect(settings).toContain("id: 'black'");
    expect(settings).not.toContain("id: 'forest'");
    expect(settings).not.toContain("id: 'sunshine'");
    expect(settings).not.toContain("id: 'rose'");
    expect(settings).not.toContain("id: 'ocean'");
    expect(settings).not.toContain("id: 'night'");
    expect(config).not.toContain('{ name: "storybook-theme"');
    expect(config).not.toContain('{ name: "ghibli-theme"');
    expect(existsSync("storybook-theme.js")).toBe(false);
    expect(existsSync("storybook-theme.css")).toBe(false);
    expect(existsSync("ghibli-theme.js")).toBe(false);
    expect(existsSync("ghibli-theme.css")).toBe(false);
  });

  test("removes retired theme implementations instead of hiding them", () => {
    expect(config).not.toContain("storybook-theme");
    expect(config).not.toContain("ghibli-theme");
  });
});
