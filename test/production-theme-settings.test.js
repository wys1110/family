import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path) => readFileSync(path, "utf8");
const config = read("config.js");
const settings = read("settings.js");

describe("production theme boundary", () => {
  test("exposes only white and dark themes outside demo mode", () => {
    expect(settings).toContain("const THEMES = [");
    expect(settings).toContain("id: 'white'");
    expect(settings).toContain("id: 'black'");
    expect(settings).toContain("name: '다크'");
    expect(settings).not.toContain("id: 'forest'");
    expect(settings).not.toContain("id: 'sunshine'");
    expect(settings).not.toContain("id: 'rose'");
    expect(settings).not.toContain("id: 'ocean'");
    expect(settings).not.toContain("id: 'night'");
  });

  test("does not load retired theme modules", () => {
    expect(config).not.toContain('{ name: "storybook-theme"');
    expect(config).not.toContain('{ name: "ghibli-theme"');
  });

  test("boots every mode with the two-theme white default", () => {
    expect(config).toContain('let initialTheme = "white"');
    expect(config).toContain('const validInitialThemes = ["white", "black"]');
    expect(config).not.toContain('forest: "#fff8f3"');
    expect(config).not.toContain('storybook: "#edf4e6"');
    expect(config).not.toContain('ghibli: "#eaf3df"');
  });
});
