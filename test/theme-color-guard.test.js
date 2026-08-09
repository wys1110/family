import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const baseline = JSON.parse(readFileSync("theme-color-baseline.json", "utf8"));
const guard = readFileSync("scripts/check-theme-colors.mjs", "utf8");

describe("direct theme color guard", () => {
  test("runs as part of the repository check used by CI", () => {
    expect(packageJson.scripts["check:theme-colors"]).toBe("node scripts/check-theme-colors.mjs");
    expect(packageJson.scripts.check.startsWith("npm run check:theme-colors &&")).toBe(true);
  });

  test("allows raw values only in canonical palette sources", () => {
    expect(baseline.paletteFiles).toEqual([
      "index.html",
      "theme-calendar-exception.css",
      "theme-bootstrap.js",
      "theme-critical.css",
      "theme-system.css",
      "theme-v2.css",
    ]);
    expect(baseline.paletteFiles).not.toContain("monochrome-theme.css");
    expect(baseline.paletteFiles).not.toContain("night-page-palette.css");
  });

  test("permits debt removal but rejects newly added fingerprints", () => {
    expect(guard).toContain("if (currentCount <= allowedCount) continue");
    expect(guard).toContain("Direct theme colors were added outside the approved palette files");
    expect(guard).toContain("Use a semantic var(--theme-*) token");
  });
});
