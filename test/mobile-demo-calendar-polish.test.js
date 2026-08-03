import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync("mobile-demo-calendar-polish.css", "utf8");
const config = readFileSync("config.js", "utf8");
const html = readFileSync("index.html", "utf8");

describe("mobile demo calendar polish", () => {
  test("keeps the demo status in document flow so it cannot cover scrolled content", () => {
    expect(css).toMatch(/\.demo-mode-banner\s*\{[^}]*position:\s*relative;/s);
    expect(css).toContain("body.demo-mode .app-shell {");
    expect(css).toContain("padding-top: max(22px, env(safe-area-inset-top, 0px));");
    expect(css).not.toMatch(/\.demo-mode-banner\s*\{[^}]*position:\s*fixed;/s);
    expect(html).toContain('id="demoModeBanner"');
  });

  test("raises mobile calendar labels above the tiny iOS text step", () => {
    expect(css).toContain("#calendarView .calendar-event-bar {");
    expect(css).toContain("height: 20px;");
    expect(css).toContain("font-size: max(10px, var(--calendar-event-user-font-size, 10px)) !important;");
    expect(css).toContain("line-height: 20px;");
    expect(css).toContain('#calendarView .calendar-event-bar[style*="52px"]');
  });

  test("keeps the floating actions above the mobile browser chrome", () => {
    expect(css).toContain("bottom: max(28px, calc(env(safe-area-inset-bottom, 0px) + 16px));");
    expect(css).toContain("padding-bottom: calc(124px + env(safe-area-inset-bottom, 0px));");
    expect(config).toContain('{ name: "mobile-demo-calendar-polish", version: "20260803-v1", script: false }');
  });
});
