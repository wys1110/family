import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const index = readFileSync("index.html", "utf8");
const baseCss = readFileSync("styles.css", "utf8");
const headerCss = readFileSync("page-header-spacing.css", "utf8");
const nightCss = readFileSync("night-theme-polish.css", "utf8");
const refreshCss = readFileSync("refresh-button.css", "utf8");
const refreshScript = readFileSync("refresh-button.js", "utf8");
const requestScript = readFileSync("feature-request.js", "utf8");
const settingsScript = readFileSync("settings.js", "utf8");

describe("global design harmony", () => {
  test("keeps refresh in the topbar and restores the contextual action to the bottom center", () => {
    expect(refreshScript).toContain("const topbarActions = document.querySelector('.topbar-account-actions')");
    expect(refreshScript).toContain("topbarActions.insertBefore(button, accountButton)");
    expect(refreshScript).toContain("pageBody.appendChild(addEventButton)");
    expect(refreshScript).not.toContain("viewTabs.insertAdjacentElement('afterend', addEventButton)");
    expect(refreshCss).toContain(".topbar-account-actions > .refresh-button");
    expect(refreshCss).toContain("body > #addEventButton.fab");
    expect(refreshCss).toMatch(/body > #addEventButton\.fab\s*\{[^}]*position:\s*fixed\s*!important;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/s);
    expect(refreshCss).toContain("body:has(> #addEventButton.fab) main");
    expect(refreshCss).toContain("env(safe-area-inset-bottom, 0px)");
    expect(refreshCss).not.toContain("body.floating-actions-safe-zone-active > .refresh-button");
  });

  test("uses a compact daily-verse bookmark outside the calendar", () => {
    expect(headerCss).toContain("body:has(#calendarView[hidden]) .daily-verse-card");
    expect(headerCss).toContain("min-height: 68px");
    expect(headerCss).toContain("min-height: 84px");
    expect(headerCss).toContain("text-overflow: ellipsis");
    expect(headerCss).toContain("white-space: nowrap");
  });

  test("removes the cross-shaped growth divider and shortens entrance motion", () => {
    expect(nightCss).toContain('html[data-family-theme="night"] #growthView #babyJournalContent > section::before');
    expect(nightCss).toMatch(/#babyJournalContent > section::before\s*\{[^}]*content:\s*none;[^}]*display:\s*none;/s);
    expect(baseCss).toContain("animation:soft-rise .22s ease both");
    expect(baseCss).toContain("animation:soft-rise .22s .02s ease both");
    expect(baseCss).toContain("animation:soft-rise .22s .04s ease both");
    expect(baseCss).toContain("animation:soft-rise .2s ease both");
  });

  test("uses Korean eyebrow copy except on the English story page", () => {
    expect(index).toContain('<p class="eyebrow">아기 성장 기록</p>');
    expect(requestScript).toContain('<p class="eyebrow">가족 기능 제안</p>');
    expect(requestScript).toContain('<p class="eyebrow">관리자 전용</p>');
    expect(settingsScript).toContain('<p class="eyebrow">화면 꾸미기</p>');
    expect(index).not.toContain("BABY JOURNAL");
    expect(requestScript).not.toContain("FAMILY LAB");
    expect(requestScript).not.toContain("ADMIN ONLY");
    expect(settingsScript).not.toContain("APPEARANCE");
  });

  test("updates every affected stylesheet cache version", () => {
    expect(index).toContain('styles.css?v=20260722-motion-v1');
    expect(config).toContain('{ name: "refresh-button", version: "20260722-bottom-center-v4" }');
    expect(config).toContain('{ name: "feature-request", version: "20260722-korean-labels-v2" }');
    expect(config).toContain('{ name: "settings", version: "20260722-korean-labels-v2" }');
    expect(config).toContain('{ name: "page-header-spacing", version: "20260722-verse-bookmark-v2", script: false }');
    expect(config).toContain('{ name: "night-theme-polish", version: "20260722-growth-restraint-v1" }');
  });
});
