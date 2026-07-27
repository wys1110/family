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
  test("saves the adjusted direct-feeding preset through the existing grid handler", async () => {
    const closed = [];
    const presets = [
      { label: "왼쪽 20분", title: "모유 수유", feedingType: "모유", feedingSide: "왼쪽", feedingMinutes: 20 },
      { label: "오른쪽 25분", title: "모유 수유", feedingType: "모유", feedingSide: "오른쪽", feedingMinutes: 25 },
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
      feedingMinutes: 25,
    });
    expect(closed).toEqual([true]);
    expect(button.disabled).toBe(true);
    expect(adaptive).toContain('data-preset-index="0"');
    expect(app).toContain('$("#quickPresetGrid").addEventListener("click", saveGrowthPresetFromEvent)');
  });

  test("uses 20, 20, and 40 minute defaults with five-minute adjustment", () => {
    expect(unified).not.toContain("data-direct-preset");
    expect(adaptive).toContain("const DIRECT_DEFAULT_MINUTES = { 왼쪽: 20, 오른쪽: 20, 양쪽: 40 }");
    expect(adaptive).toContain("const DIRECT_STEP_MINUTES = 5");
    expect(adaptive).toContain('data-direct-adjust="-${DIRECT_STEP_MINUTES}"');
    expect(adaptive).toContain('data-direct-adjust="${DIRECT_STEP_MINUTES}"');
    expect(adaptive).toContain('data-preset-index="0"');
  });

  test("matches the quick sheet typography and provides a three-way direction selector", () => {
    expect(unifiedCss).toMatch(/#quickLogDialog\.feeding-quick-active\s*\{[^}]*width:\s*min\(calc\(100% - 24px\), 500px\);/s);
    expect(unifiedCss).toMatch(/#quickLogDialog\.feeding-quick-active \.dialog-header h2\s*\{[^}]*font-size:\s*18px;[^}]*font-weight:\s*700;/s);
    expect(unifiedCss).toMatch(/#quickLogDialog\.feeding-quick-active \.quick-log-copy\s*\{[^}]*font-size:\s*11px;[^}]*line-height:\s*1\.6;/s);
    expect(unifiedCss).toMatch(/\.quick-preset-grid\.direct-feeding\s*\{[^}]*grid-template-columns:\s*1fr;/s);
    expect(unifiedCss).toMatch(/\.direct-side-options\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s);
    expect(unifiedCss).toMatch(/\.direct-side-options button\s*\{[^}]*min-height:\s*62px;[^}]*border:\s*1px solid var\(--sheet-border\);[^}]*background:/s);
    expect(unifiedCss).toMatch(/#quickLogDialog\.feeding-quick-active \.quick-detail-button\s*\{[^}]*min-height:\s*54px;[^}]*font-size:\s*15px;/s);
    expect(unifiedCss).toMatch(/@media \(max-width: 520px\)\s*\{[^}]*#quickLogDialog\.feeding-quick-active \.sheet-panel\s*\{[^}]*padding:\s*11px 17px max\(18px, env\(safe-area-inset-bottom\)\);/s);
  });

  test("makes the selected direct-feeding side visually clear", () => {
    expect(unifiedCss).toMatch(/\.direct-side-options button\.active\s*\{[^}]*border-color:[^}]*color:\s*white;[^}]*background:/s);
    expect(unifiedCss).toMatch(/\.direct-side-options button\.active small\s*\{[^}]*color:\s*rgba\(255, 255, 255, \.82\);/s);
  });

  test("bumps both feeding module cache versions", () => {
    expect(config).toContain('{ name: "adaptive-feeding", version: "20260727-direct-stepper-v1" }');
    expect(config).toContain('{ name: "feeding-quick-unified", version: "20260727-direct-stepper-v1" }');
  });
});
