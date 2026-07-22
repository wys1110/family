import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const script = readFileSync("growth-inline-chart.js", "utf8");
const css = readFileSync("growth-inline-chart.css", "utf8");
const polish = readFileSync("growth-edit-sheet-polish.css", "utf8");
const index = readFileSync("index.html", "utf8");
const config = readFileSync("config.js", "utf8");

const entry = (id, day) => ({
  id,
  date: `2026-07-${String(day).padStart(2, "0")}`,
  time: `${String(8 + day).padStart(2, "0")}:00`,
  height: 50 + day,
  weight: 3 + day / 10,
  head: 34 + day / 10,
});

function createHarness(entries) {
  const listeners = {};
  const frames = [];
  const dialogCalls = [];
  let markup = "";
  let focusCalls = 0;
  let mutationCallback = null;

  const insightRow = {
    addEventListener(type, listener) { listeners[type] = listener; },
    querySelector(selector) {
      if (selector === ".growth-inline-card") return markup.includes("growth-inline-card") ? {} : null;
      if (selector === "[data-growth-inline-history-toggle]") {
        return markup.includes("data-growth-inline-history-toggle")
          ? { focus: () => { focusCalls += 1; } }
          : null;
      }
      return null;
    },
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = value; },
  };

  const context = {
    activeBaby: () => ({ id: "baby-1", name: "아기" }),
    activeBabyEntries: () => entries,
    document: {
      documentElement: { dataset: {} },
      querySelector: (selector) => selector === "#growthInsightRow" ? insightRow : null,
    },
    MutationObserver: class {
      constructor(callback) { mutationCallback = callback; }
      observe() {}
    },
    openGrowthDialog: (...args) => dialogCalls.push(args),
    requestAnimationFrame: (callback) => { frames.push(callback); },
  };

  vm.runInNewContext(script, context);

  const flushFrame = () => {
    const frame = frames.shift();
    expect(frame).toBeTypeOf("function");
    frame();
  };
  const click = (kind, id = "") => listeners.click({
    target: {
      closest(selector) {
        if (kind === "toggle" && selector === "[data-growth-inline-history-toggle]") return {};
        if (kind === "entry" && selector === "[data-growth-inline-entry]") {
          return { dataset: { growthInlineEntry: id } };
        }
        return null;
      },
    },
  });

  flushFrame();

  return {
    click,
    dialogCalls,
    entries,
    flushFrame,
    focusCalls: () => focusCalls,
    historyIds: () => [...markup.matchAll(/class="growth-inline-history-row"\s+data-growth-inline-entry="([^"]+)"/g)]
      .map((match) => match[1]),
    markup: () => markup,
    triggerMutation: () => mutationCallback(),
  };
}

describe("inline growth measurement history", () => {
  test("renders the latest five rows first and expands to the full history", () => {
    const entries = [entry("e4", 4), entry("e1", 1), entry("e7", 7), entry("e3", 3), entry("e6", 6), entry("e2", 2), entry("e5", 5)];
    const harness = createHarness(entries);

    expect(harness.historyIds()).toEqual(["e7", "e6", "e5", "e4", "e3"]);
    expect(harness.markup()).toContain("전체 기록 보기 (7)");

    harness.click("toggle");
    harness.flushFrame();

    expect(harness.historyIds()).toEqual(["e7", "e6", "e5", "e4", "e3", "e2", "e1"]);
    expect(harness.markup()).toContain("최근 기록만 보기");
  });

  test("opens the exact selected entry through the existing dialog", () => {
    const entries = [entry("earlier", 1), entry("selected", 2)];
    const harness = createHarness(entries);

    harness.click("entry", "selected");

    expect(harness.dialogCalls).toEqual([[entries[1]]]);
  });

  test("restores toggle focus after expansion but not after unrelated rerenders", () => {
    const entries = Array.from({ length: 6 }, (_, index) => entry(`e${index + 1}`, index + 1));
    const harness = createHarness(entries);

    harness.click("toggle");
    harness.flushFrame();
    expect(harness.focusCalls()).toBe(1);

    harness.click("toggle");
    harness.flushFrame();
    expect(harness.historyIds()).toHaveLength(5);
    expect(harness.focusCalls()).toBe(2);

    entries.push(entry("e7", 7));
    harness.triggerMutation();
    harness.flushFrame();
    expect(harness.focusCalls()).toBe(2);
  });

  test("shows only the record-name optional guidance", () => {
    expect(index).toContain('class="field-optional growth-title-optional"');
    expect(index).toContain("선택 · 비워두면 분류에 맞게 자동 입력");
    expect(index.match(/growth-title-optional/g)).toHaveLength(1);
    expect(polish).toContain("#growthDialog .field-optional { display: none; }");
    expect(polish).toMatch(/#growthDialog \.growth-title-optional\s*\{[^}]*display:\s*inline/);
  });

  test("keeps accessible touch styling, form emphasis, and cache versions", () => {
    expect(css).toContain(".growth-inline-history-list");
    expect(css).toMatch(/min-height:\s*72px/);
    expect(css).toContain("#growthInsightRow .growth-inline-history-values");
    expect(css).toMatch(/#growthInsightRow \.growth-inline-history-values\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\);[^}]*margin:\s*0;/s);
    expect(script).not.toContain('data-growth-inline-action="edit"');
    expect(polish).toContain('#growthDialog[data-simple-category="성장"] [data-growth-fields="성장"]');
    expect(config).toContain('{ name: "growth-edit-sheet-polish", version: "20260722-measurement-focus-v2", script: false }');
    expect(config).toContain('{ name: "growth-inline-chart", version: "20260722-clean-history-v3" }');
    expect(config).toContain('{ name: "growth-inline-approved-polish", version: "20260722-history-v1", script: false }');
  });
});
