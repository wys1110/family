import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const script = readFileSync("growth-inline-chart.js", "utf8");
const css = readFileSync("growth-inline-chart.css", "utf8");
const polish = readFileSync("growth-edit-sheet-polish.css", "utf8");
const index = readFileSync("index.html", "utf8");
const config = readFileSync("config.js", "utf8");

describe("inline growth measurement history", () => {
  test("renders five recent rows and an explicit expand control", () => {
    expect(script).toContain("let historyExpanded = false");
    expect(script).toContain("const historyRows = (entries) =>");
    expect(script).toContain("historyExpanded ? ordered : ordered.slice(0, 5)");
    expect(script).toContain('data-growth-inline-history-toggle');
    expect(script).toContain("전체 기록 보기");
    expect(script).toContain("최근 기록만 보기");
  });

  test("routes rows and new measurements through existing dialogs", () => {
    expect(script).toContain('data-growth-inline-entry="${escapeText(entry.id)}"');
    expect(script).toContain("if (point) openEntry(point.dataset.growthInlineEntry)");
    expect(script).toContain('data-growth-inline-action="add"');
    expect(script).toContain('openGrowthDialog(null, "성장")');
  });

  test("adds accessible touch-sized history styling and form emphasis", () => {
    expect(css).toContain(".growth-inline-history-list");
    expect(css).toContain("min-height: 56px");
    expect(css).toContain(".growth-inline-history-values");
    expect(polish).toContain('#growthDialog[data-simple-category="성장"] [data-growth-fields="성장"]');
    expect(index).toContain('기록 이름 <small class="field-optional">선택 · 비워두면 분류에 맞게 자동 입력</small>');
  });

  test("bumps every changed growth module", () => {
    expect(config).toContain('{ name: "growth-edit-sheet-polish", version: "20260722-measurement-focus-v1", script: false }');
    expect(config).toContain('{ name: "growth-inline-chart", version: "20260722-history-v1" }');
    expect(config).toContain('{ name: "growth-inline-approved-polish", version: "20260722-history-v1", script: false }');
  });
});
