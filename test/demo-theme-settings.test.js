import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path) => readFileSync(path, "utf8");
const config = read("config.js");
const settings = read("settings.js");
const storybook = read("storybook-theme.js");
const ghibli = read("ghibli-theme.js");

describe("demo theme boundary", () => {
  test("uses demo-only theme storage and a two-theme catalog", () => {
    expect(config).toContain("const demoMode = window.FAMILY_DEMO_MODE === true;");
    expect(config).toContain('family-demo-theme-v1');
    expect(config).toContain('family-demo-theme-choice-v1');
    expect(settings).toContain("const DEMO_THEMES = THEMES");
    expect(settings).toContain("const AVAILABLE_THEMES = demoMode ? DEMO_THEMES : THEMES;");
    expect(settings).toContain("family-demo-theme-v1");
    expect(settings).toContain("family-demo-theme-choice-v1");
  });

  test("keeps white and black IDs while labeling demo black as dark", () => {
    expect(settings).toContain("id: 'white'");
    expect(settings).toContain("id: 'black'");
    expect(settings).toContain("name: '다크'");
    expect(settings).toContain("cssTheme: 'night'");
  });

  test("keeps production theme definitions available outside demo mode", () => {
    expect(settings).toContain("id: 'forest'");
    expect(settings).toContain("id: 'sunshine'");
    expect(settings).toContain("id: 'rose'");
    expect(settings).toContain("id: 'ocean'");
    expect(settings).toContain("id: 'night'");
    expect(storybook).toContain("const THEME_ID = 'storybook';");
    expect(ghibli).toContain("const THEME_ID = 'ghibli';");
  });

  test("does not add storybook or ghibli choices in demo mode", () => {
    expect(storybook).toContain("if (window.FAMILY_DEMO_MODE === true) return;");
    expect(ghibli).toContain("if (window.FAMILY_DEMO_MODE === true) return;");
  });
});
