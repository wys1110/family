import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test, vi } from "vitest";

const app = readFileSync("app.js", "utf8");
const adaptive = readFileSync("adaptive-feeding.js", "utf8");
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));

function harness() {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: "", options: [], add(option) { this.options.push(option); },
      classList: { add() {}, remove() {}, toggle() {} }, removeAttribute() {},
      showModal: vi.fn(), close: vi.fn(), querySelectorAll: () => [],
    });
    return nodes.get(selector);
  };
  const context = {
    document: { querySelector: node, querySelectorAll: () => [] }, $: node,
    localStorage: { getItem: () => "breast", setItem: vi.fn() },
    Option: function(text, value) { this.textContent = text; this.value = value; },
    activeBaby: () => ({ id: "baby", name: "합성 아기" }), openBabyDialog: vi.fn(), toast: vi.fn(),
    openGrowthQuick: vi.fn(), quickGrowthSaveInProgress: false, activeQuickPresets: [], activeQuickCategory: "",
    state: { activeBabyId: "baby", activeView: "growth", growthEntries: [] },
    bootstrapRequestId: 1, uid: () => "new-synthetic", GROWTH_STORAGE_KEY: "synthetic-only",
    dispatchGrowthEntrySaved: vi.fn(), renderGrowth: vi.fn(), showGrowthComplete: vi.fn(),
    window: { scrollX: 0, scrollY: 0 }, growthDialogReturnPosition: null,
    growthPhotoDraft: {}, resetGrowthPhotoDraft: vi.fn(), syncGrowthFields: vi.fn(),
    renderGrowthPhotoPreview: vi.fn(), focusOnDesktop: vi.fn(),
    dateKey: () => "2000-01-01", formatDuration: (minutes) => `${minutes}분`, escapeHtml: String,
  };
  vm.createContext(context);
  vm.runInContext(section("function quickPresets(", "function openGrowthQuick("), context);
  vm.runInContext(`${adaptive.slice(0, adaptive.indexOf("  const baseTodaySummary"))}
    globalThis.quickState = { directPreset, bottlePreset, updateDirectMinutes,
      selectSide(side) { directSide = side; renderQuick(); }, setSource,
    };
  })();`, context);
  vm.runInContext(section("function openGrowthDialog(", "function syncGrowthFields("), context);
  vm.runInContext(section("function syncGrowthFields(", "function openBabyDialog("), context);
  vm.runInContext(section("async function saveGrowthPresetFromEvent(", "function defaultGrowthTitle("), context);
  return { context, node };
}

test("new direct feeding starts at ten minutes for every side and resets on reopening", async () => {
  const { context, node } = harness();
  const existing = Object.freeze({ id: "existing", feedingMinutes: 37 });
  context.state.growthEntries.push(existing);
  context.openGrowthQuick("수유·이유식");
  for (const side of ["왼쪽", "오른쪽", "양쪽"]) {
    context.quickState.selectSide(side);
    expect(context.activeQuickPresets[0]).toMatchObject({ feedingSide: side, feedingMinutes: 10 });
    expect(node("#quickPresetGrid").innerHTML).toContain(`${side} 10분 기록하기`);
  }
  context.quickState.updateDirectMinutes(5);
  expect(context.activeQuickPresets[0].feedingMinutes).toBe(15);
  context.openGrowthQuick("수유·이유식");
  expect(context.activeQuickPresets[0]).toMatchObject({ feedingSide: "왼쪽", feedingMinutes: 10 });
  await context.saveGrowthPresetFromEvent({ target: { closest: () => ({ dataset: { presetIndex: "0" } }) } });
  expect(context.state.growthEntries.at(-1)).toMatchObject({ feedingMinutes: 10, feedingMl: null });
  expect(context.state.growthEntries[0]).toBe(existing);
  expect(existing.feedingMinutes).toBe(37);
  for (const source of ["formula", "pumped"]) expect(context.quickState.bottlePreset(source).feedingMl).toBe(100);
});

test("detailed new feeding defaults to ten minutes without changing other categories", () => {
  const { context, node } = harness();
  context.openGrowthDialog(null, "수유·이유식");
  expect(Number(node("#growthFeedingMinutes").value)).toBe(10);
  expect(node("#growthFeedingMl").value).toBe("");
  expect(node("#growthSleepMinutes").value).toBe("");
  for (const category of ["수면", "기저귀", "성장"]) {
    context.openGrowthDialog(null, category);
    expect(node("#growthFeedingMinutes").value).toBe("");
  }
  node("#growthCategory").value = "수유·이유식";
  context.syncGrowthFields();
  expect(Number(node("#growthFeedingMinutes").value)).toBe(10);
  node("#growthFeedingMinutes").value = "15";
  context.syncGrowthFields();
  expect(node("#growthFeedingMinutes").value).toBe("15");
});

test("core quick presets use ten minutes and keep bottle amounts and sleep presets", () => {
  const context = { formatDuration: (minutes) => `${minutes}분` };
  vm.createContext(context);
  vm.runInContext(section("function quickPresets(", "function openGrowthQuick("), context);
  const feeding = context.quickPresets("수유·이유식");
  expect(feeding.filter((preset) => preset.feedingType === "모유").map((preset) => preset.feedingMinutes)).toEqual([10, 10, 10]);
  expect(feeding.filter((preset) => preset.feedingMl).map((preset) => preset.feedingMl)).toEqual([80, 100, 120]);
  expect(context.quickPresets("수면").map((preset) => preset.sleepMinutes)).toEqual([30, 60, 90, 120, 180, 480]);
});

test.each([37, 10, null, 0])("editing preserves stored minutes %s and the recorded clock time", (minutes) => {
  const { context, node } = harness();
  const entry = Object.freeze({ id: "existing", category: "수유·이유식", feedingType: "모유", feedingMinutes: minutes, feedingMl: 120, time: "09:43", date: "2000-01-01" });
  context.openGrowthDialog(entry);
  expect(node("#growthFeedingMinutes").value).toBe(minutes || "");
  expect(node("#growthTime").value).toBe("09:43");
  expect(node("#growthFeedingMl").value).toBe(120);
  expect(entry.feedingMinutes).toBe(minutes);
  context.openGrowthQuick("수유·이유식");
  expect(entry.feedingMinutes).toBe(minutes);
});
