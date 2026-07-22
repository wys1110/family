import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const app = readFileSync("app.js", "utf8");

describe("top-level tab touch focus", () => {
  test("clears residual focus only after touch or pen activation", () => {
    expect(app).toContain("function releaseTouchTabFocus(event)");
    expect(app).toContain('["touch", "pen"].includes(event.pointerType)');
    expect(app).toContain("requestAnimationFrame(() => event.currentTarget.blur())");
    expect(app).toContain('button.addEventListener("pointerup", releaseTouchTabFocus)');
  });

  test("keeps the existing active and aria-selected state contract", () => {
    expect(app).toContain('button.classList.toggle("active", active)');
    expect(app).toContain('button.setAttribute("aria-selected", String(active))');
    expect(app).not.toContain('.view-tab:focus { outline: none');
  });
});
