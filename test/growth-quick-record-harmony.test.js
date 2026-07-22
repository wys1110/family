import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const app = readFileSync("app.js", "utf8");
const adaptive = readFileSync("adaptive-feeding.js", "utf8");
const unified = readFileSync("feeding-quick-unified.js", "utf8");
const unifiedCss = readFileSync("feeding-quick-unified.css", "utf8");
const config = readFileSync("config.js", "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  let depth = 0;
  let opened = false;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") { depth += 1; opened = true; }
    if (source[index] === "}") depth -= 1;
    if (opened && depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} body not closed`);
}

describe("growth quick record harmony", () => {
  test("saves the exact direct-feeding preset immediately through the existing grid handler", async () => {
    const closed = [];
    const presets = [
      { label: "왼쪽 10분", title: "모유 수유", feedingType: "모유", feedingSide: "왼쪽", feedingMinutes: 10 },
      { label: "오른쪽 10분", title: "모유 수유", feedingType: "모유", feedingSide: "오른쪽", feedingMinutes: 10 },
    ];
    const context = {
      activeQuickPresets: presets,
      activeQuickCategory: "수유·이유식",
      state: { activeBabyId: "baby-1", growthEntries: [], supabase: null, session: null },
      uid: () => "entry-1",
      dateKey: () => "2026-07-22",
      localStorage: { setItem() {} },
      GROWTH_STORAGE_KEY: "growth",
      $: () => ({ close: () => closed.push(true) }),
      renderGrowth() {},
      showGrowthComplete() {},
      dispatchGrowthEntrySaved() {},
      toGrowthRemote: (entry) => entry,
      toast() {},
    };
    vm.runInNewContext(`${extractFunction(app, "saveGrowthPresetFromEvent")}; this.handler = saveGrowthPresetFromEvent;`, context);

    const button = { dataset: { presetIndex: "1" }, disabled: false };
    await context.handler({
      target: {
        closest: (selector) => selector === "[data-preset-index]" ? button : null,
      },
    });

    expect(context.state.growthEntries).toHaveLength(1);
    expect(context.state.growthEntries[0]).toMatchObject({
      babyId: "baby-1",
      feedingSide: "오른쪽",
      feedingMinutes: 10,
    });
    expect(closed).toEqual([true]);
    expect(button.disabled).toBe(true);
    expect(adaptive).toContain('data-preset-index="${index}"');
    expect(app).toContain('$("#quickPresetGrid").addEventListener("click", saveGrowthPresetFromEvent)');
  });

  test("does not replace direct presets with a selection step and confirmation button", () => {
    expect(unified).not.toContain("data-direct-preset");
    expect(unified).not.toContain("feedingQuickSave");
    expect(unified).not.toContain("event.preventDefault()");
  });

  test("matches the diaper quick sheet typography and two-column card layout", () => {
    expect(unifiedCss).toMatch(/#quickLogDialog\.feeding-quick-active\s*\{[^}]*width:\s*min\(calc\(100% - 24px\), 500px\);/s);
    expect(unifiedCss).toMatch(/#quickLogDialog\.feeding-quick-active \.dialog-header h2\s*\{[^}]*font-size:\s*18px;[^}]*font-weight:\s*700;/s);
    expect(unifiedCss).toMatch(/#quickLogDialog\.feeding-quick-active \.quick-log-copy\s*\{[^}]*font-size:\s*11px;[^}]*line-height:\s*1\.6;/s);
    expect(unifiedCss).toMatch(/\.quick-preset-grid\.direct-feeding\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
    expect(unifiedCss).toMatch(/\.quick-preset-grid\.direct-feeding > button\s*\{[^}]*min-height:\s*82px;[^}]*border:\s*1px solid var\(--sheet-border\);[^}]*background:/s);
    expect(unifiedCss).toMatch(/#quickLogDialog\.feeding-quick-active \.quick-detail-button\s*\{[^}]*min-height:\s*54px;[^}]*font-size:\s*15px;/s);
    expect(unifiedCss).toMatch(/@media \(max-width: 520px\)\s*\{[^}]*#quickLogDialog\.feeding-quick-active \.sheet-panel\s*\{[^}]*padding:\s*11px 17px max\(18px, env\(safe-area-inset-bottom\)\);/s);
  });

  test("colors direct-feeding presets with theme-aware role accents", () => {
    expect(unifiedCss).toMatch(/\.quick-preset-grid\.direct-feeding > button:nth-child\(1\)\s*\{[^}]*--direct-preset-accent:\s*var\(--blue\);/s);
    expect(unifiedCss).toMatch(/\.quick-preset-grid\.direct-feeding > button:nth-child\(2\)\s*\{[^}]*--direct-preset-accent:\s*var\(--indigo\);/s);
    expect(unifiedCss).toMatch(/\.quick-preset-grid\.direct-feeding > button:nth-child\(3\)\s*\{[^}]*--direct-preset-accent:\s*color-mix\(in srgb, var\(--blue\) 42%, var\(--pink\)\);/s);
    expect(unifiedCss).toMatch(/\.quick-preset-grid\.direct-feeding > button\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--direct-preset-accent\) 34%, var\(--sheet-border\)\);[^}]*background:[^}]*color-mix\(in srgb, var\(--direct-preset-accent\) 16%, var\(--sheet-panel-strong\)\),/s);
    expect(unifiedCss).toMatch(/\.quick-preset-grid\.direct-feeding > button:active\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--direct-preset-accent\) 72%, var\(--surface\)\);/s);
  });

  test("bumps both feeding module cache versions", () => {
    expect(config).toContain('{ name: "adaptive-feeding", version: "20260722-diaper-harmony-v2" }');
    expect(config).toContain('{ name: "feeding-quick-unified", version: "20260722-themed-presets-v4" }');
  });
});
