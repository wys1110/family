import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const adaptive = readFileSync("adaptive-feeding.js", "utf8");
const editor = readFileSync("care-entry-edit-fix.js", "utf8");
const palette = readFileSync("care-ring-timeline.css", "utf8");
const config = readFileSync("config.js", "utf8");

describe("health records in the compact care timeline", () => {
  test("renders health records in the timeline lane and summary", () => {
    expect(adaptive).toContain('const careKinds = ["formula", "pumped", "breast", "solid", "sleep", "diaper", "health"];');
    expect(adaptive).toContain('if (entry?.category === "건강·병원") return "health";');
    expect(adaptive).toContain('health: "건강"');
    expect(adaptive).toContain('typeOf(entry) === "health"');
    expect(adaptive).toContain('기저귀 · 건강');
  });

  test("uses a dedicated health accent and cache version", () => {
    expect(palette).toContain(".care-split-entry.health");
    expect(config).toContain('{ name: "adaptive-feeding", version: "20260806-health-timeline-v1" }');
  });

  test("makes diaper and health cards editable in the shared right lane", () => {
    expect(editor).toContain('health: "건강"');
    expect(editor).toContain('type === "health"');
    expect(editor).toContain(".care-split-cell.diaper-health .care-split-entry");
    expect(editor).toContain('["diaper", "health"].includes(entryType(entry))');
    expect(config).toContain('{ name: "care-entry-edit-fix", version: "20260806-right-lane-edit-v1" }');
  });
});
