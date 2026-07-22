import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const app = readFileSync("app.js", "utf8");
const handlerSource = app.match(/function releaseTouchTabFocus\(event\) \{[\s\S]*?\n\}/)?.[0];

function createHandler(requestAnimationFrame) {
  return new Function("requestAnimationFrame", `${handlerSource}\nreturn releaseTouchTabFocus;`)(requestAnimationFrame);
}

describe("top-level tab touch focus", () => {
  test("blurs touch and pen tabs after dispatch clears currentTarget", () => {
    for (const pointerType of ["touch", "pen"]) {
      let frame = null;
      let blurCalls = 0;
      const button = { blur: () => { blurCalls += 1; } };
      const event = { pointerType, currentTarget: button };
      const releaseTouchTabFocus = createHandler((callback) => { frame = callback; });

      releaseTouchTabFocus(event);
      event.currentTarget = null;

      expect(frame).toBeTypeOf("function");
      expect(() => frame()).not.toThrow();
      expect(blurCalls).toBe(1);
    }
  });

  test("leaves mouse and keyboard focus untouched", () => {
    for (const pointerType of ["mouse", undefined]) {
      let frame = null;
      let blurCalls = 0;
      const button = { blur: () => { blurCalls += 1; } };
      const releaseTouchTabFocus = createHandler((callback) => { frame = callback; });

      releaseTouchTabFocus({ pointerType, currentTarget: button });

      expect(frame).toBeNull();
      expect(blurCalls).toBe(0);
    }
  });
});
