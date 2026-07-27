import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const settings = readFileSync("settings.js", "utf8");
const config = readFileSync("config.js", "utf8");
const css = readFileSync("black-theme.css", "utf8");

describe("modern black theme", () => {
  test("is available as a distinct saved theme", () => {
    expect(settings).toContain("id: 'black'");
    expect(settings).toContain("name: '모던 블랙'");
    expect(settings).toContain("description: '순수한 블랙과 차콜, 절제된 화이트'");
    expect(settings).toContain("['night', 'black'].includes(selected.id)");
  });

  test("applies before the app modules finish loading", () => {
    expect(config).toContain('black: "#000000"');
    expect(config).toContain('["night", "black"].includes(initialTheme)');
    expect(config).toContain('{ name: "settings", version: "20260727-modern-black-v1" }');
    expect(config).toContain('{ name: "black-theme", version: "20260727-modern-black-v1", script: false }');
  });

  test("uses a true-black canvas with restrained charcoal surfaces", () => {
    expect(css).toMatch(/html\[data-family-theme="black"\]\s*\{[^}]*--bg:\s*#000000;[^}]*--surface:\s*#0d0d0f;[^}]*--label:\s*#f5f5f7;/s);
    expect(css).toContain('html[data-family-theme="black"] .view-tab.active');
    expect(css).toContain('html[data-family-theme="black"] .calendar-card');
    expect(css).toContain('html[data-family-theme="black"] .sheet-panel');
  });

  test("removes the decorative glow and sparkle layers", () => {
    expect(css).toMatch(/body::before,[\s\S]*body::after,[\s\S]*\.topbar \.eyebrow::before,[\s\S]*\{[^}]*content:\s*none;[^}]*display:\s*none;/);
    expect(css).toMatch(/\.topbar h1\s*\{[^}]*background:\s*none;[^}]*-webkit-text-fill-color:\s*currentColor;/s);
  });
});
