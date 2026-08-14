import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync("calendar-mobile-polish.css", "utf8");
const config = readFileSync("config.js", "utf8");
const serviceWorker = readFileSync("service-worker.js", "utf8");
const index = readFileSync("index.html", "utf8");

describe("mobile calendar polish", () => {
  test("loads a cache-busted mobile calendar stylesheet", () => {
    expect(config).toContain('{ name: "calendar-mobile-polish", version: "20260805-mobile-calendar-v5", script: false }');
    expect(serviceWorker).toContain('url.pathname.endsWith("/calendar-mobile-polish.css")');
    expect(index).toContain('config.js?v=20260814-wallpaper-image-layer-v1');
  });

  test("keeps mobile navigation and calendar controls readable", () => {
    expect(css).toContain(".app-shell .view-tabs");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain(".calendar-toolbar");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(css).toMatch(/grid-template-areas:\s*"month month"\s*"today font"/);
    expect(css).toContain(".calendar-font-toolbar");
    expect(css).toContain(".month-picker-trigger");
    expect(css).toContain(".month-picker-trigger::after");
    expect(css).toContain("position: absolute");
    expect(css).toContain("line-height: 1 !important");
    expect(css).toContain("white-space: nowrap");
    expect(css).toContain("text-overflow: ellipsis");
    expect(css).toContain("--calendar-event-user-font-size");
  });
});
